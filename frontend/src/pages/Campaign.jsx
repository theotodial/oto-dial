import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API from '../api';
import { useSubscription } from '../context/SubscriptionContext';
import { useCampaign } from '../context/CampaignContext';
import CampaignSmsThread from '../components/campaign/CampaignSmsThread';
import CampaignLiteWorkspace from '../components/campaign/CampaignLiteWorkspace';
import CampaignProResizableGrid from '../components/campaign/CampaignProResizableGrid';
import CampaignCommandPalette from '../components/campaign/CampaignCommandPalette';
import {
  listCampaigns,
  getCampaign,
  getCampaignAnalytics,
  createCampaign,
  importCampaignCsv,
  sendCampaign,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getCampaignRecipients,
  aiGenerateCampaign,
  downloadOptOutCsv,
  duplicateCampaign,
  patchCampaignDraft,
  getThreadActivity,
  searchCampaignWorkspace,
  getWorkspaceStats,
  getMessagingAutomation,
  patchMessagingAutomation,
} from '../services/campaignService';
import {
  renderMessage,
  extractTemplateKeys,
  findMissingKeys,
  smsSegmentCount,
} from '../utils/campaignText';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const LS_ACTIVE = 'otodial_campaign_active_windows_v2';
const LS_LITE_TABS = 'otodial_campaign_lite_tabs';
const LS_LITE_ACTIVE = 'otodial_campaign_lite_active';
const CANONICAL = ['campaigns', 'chat', 'settings', 'tools', 'activity'];
const MAX_PRO_PANES = 4;

function normalizeThreadKey(phone) {
  return String(phone || '').replace(/\D/g, '');
}

const PHONE_KEYS = ['phone', 'mobile', 'phonenumber', 'phone_number', 'msisdn', 'tel'];

function loadActiveWindows() {
  try {
    const raw = localStorage.getItem(LS_ACTIVE);
    if (!raw) return ['campaigns', 'chat'];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return ['campaigns', 'chat'];
    const valid = new Set(arr.filter((x) => CANONICAL.includes(x)));
    const ordered = CANONICAL.filter((x) => valid.has(x));
    return ordered.length ? ordered : ['campaigns', 'chat'];
  } catch {
    return ['campaigns', 'chat'];
  }
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map((h) => h.replace(/^\ufeff/, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => {
      row[h] = cells[j] ?? '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

function findPhoneInRow(row) {
  const keys = Object.keys(row);
  for (const pk of PHONE_KEYS) {
    for (const key of keys) {
      if (String(key).toLowerCase().replace(/\s+/g, '') === pk) {
        return row[key];
      }
    }
  }
  return Object.values(row)[0];
}

function isLikelyShortCode(value) {
  return /^\d{3,8}$/.test(String(value || '').replace(/\D/g, ''));
}

function previewPhoneValid(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return false;
  if (isLikelyShortCode(raw)) return false;
  return digits.length >= 10 && digits.length <= 15;
}

function VarnHighlight({ text }) {
  const parts = String(text || '').split(/(\{\{[^}]+\}\})/g);
  return (
    <div className="text-xs font-mono whitespace-pre-wrap break-words p-2 rounded-lg bg-slate-100 dark:bg-slate-900/80 border border-dashed border-slate-200 dark:border-slate-600 min-h-[2.5rem]">
      {parts.map((p, i) =>
        /^\{\{[^}]+\}\}$/.test(p) ? (
          <mark
            key={i}
            className="bg-indigo-200/90 dark:bg-indigo-500/35 text-indigo-900 dark:text-indigo-100 rounded px-0.5"
          >
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </div>
  );
}

function GridShell({ title, onClose, disabledClose, onExpand, children }) {
  return (
    <div className="flex flex-col min-h-0 min-w-0 h-full rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm shadow-slate-200/50 dark:shadow-none overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm shrink-0 z-10">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</h3>
        <div className="flex items-center gap-0.5 shrink-0">
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white"
              aria-label="Expand panel"
              title="Expand"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={disabledClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Close panel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}

export default function Campaign() {
  const { usage, subscription, refreshSubscription } = useSubscription();
  const { campaignMode, setCampaignMode, getThreadCache, setThreadCache } = useCampaign();
  const smsRemaining = usage?.smsRemaining ?? 0;

  const [mobileTab, setMobileTab] = useState('campaigns');
  const [activeWindows, setActiveWindows] = useState(loadActiveWindows);
  const [toolsSubTab, setToolsSubTab] = useState('templates');

  const [campaigns, setCampaigns] = useState([]);
  const [optOutTotal, setOptOutTotal] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [campaignRecipients, setCampaignRecipients] = useState([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [recipientsInput, setRecipientsInput] = useState('');
  const [composer, setComposer] = useState('');
  const [sampleVarsJson, setSampleVarsJson] = useState('{"name":"Alex"}');
  const [scheduleType, setScheduleType] = useState('immediate');
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campaignLaunching, setCampaignLaunching] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [pollTick, setPollTick] = useState(0);

  const [chatTabs, setChatTabs] = useState([]);
  const [activeChatPhone, setActiveChatPhone] = useState(null);
  const [addTabDraft, setAddTabDraft] = useState('');
  const [showAddTab, setShowAddTab] = useState(false);

  const [csvStaging, setCsvStaging] = useState(null);
  const [messages, setMessages] = useState([]);
  const [threadSearch, setThreadSearch] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQ, setPaletteQ] = useState('');
  const [smartResults, setSmartResults] = useState({ campaigns: [], contacts: [] });
  const [activityBundle, setActivityBundle] = useState(null);
  const [contactsForLabels, setContactsForLabels] = useState([]);
  const [labelFilter, setLabelFilter] = useState('');
  const [expandedPane, setExpandedPane] = useState(null);
  const [workspaceStats, setWorkspaceStats] = useState(null);
  const [messagingAutomation, setMessagingAutomation] = useState({
    autoReplyEnabled: false,
    autoReplyRules: [],
  });
  const [automationBusy, setAutomationBusy] = useState(false);
  const campaignModeRef = useRef(campaignMode);
  campaignModeRef.current = campaignMode;
  const liteHydratedRef = useRef(false);
  const draftTimerRef = useRef(null);

  const segInfo = smsSegmentCount(composer);

  useEffect(() => {
    localStorage.setItem(LS_ACTIVE, JSON.stringify(activeWindows));
  }, [activeWindows]);

  const loadCampaigns = useCallback(async () => {
    const { campaigns: list, optOutTotal: oo } = await listCampaigns();
    setCampaigns(list);
    setOptOutTotal(oo);
    return list;
  }, []);

  const loadTemplates = useCallback(async () => {
    const list = await listTemplates();
    setTemplates(list);
  }, []);

  const loadMessages = useCallback(async () => {
    const res = await API.get('/api/messages?limit=100');
    if (res.error || !res.data?.success) {
      setMessages([]);
      return;
    }
    setMessages(res.data.messages || []);
  }, []);

  const refreshDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    const data = await getCampaign(id);
    setDetail(data);
  }, []);

  const refreshAnalytics = useCallback(async (id) => {
    if (!id) return;
    try {
      const d = await getCampaignAnalytics(id);
      setAnalytics(d);
    } catch {
      setAnalytics(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await loadMessages();
        if (!cancelled && campaignModeRef.current === 'lite') setLoading(false);
        await Promise.all([loadCampaigns(), loadTemplates()]);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCampaigns, loadTemplates, loadMessages]);

  useEffect(() => {
    if (campaignMode !== 'lite' || liteHydratedRef.current) return;
    liteHydratedRef.current = true;
    try {
      const raw = localStorage.getItem(LS_LITE_TABS);
      const tabs = raw ? JSON.parse(raw) : [];
      const act = localStorage.getItem(LS_LITE_ACTIVE);
      if (Array.isArray(tabs) && tabs.length) {
        setChatTabs(tabs);
        if (act && tabs.includes(act)) setActiveChatPhone(act);
        else setActiveChatPhone(tabs[tabs.length - 1]);
      }
    } catch {
      /* ignore */
    }
  }, [campaignMode]);

  useEffect(() => {
    if (campaignMode !== 'lite') return;
    try {
      localStorage.setItem(LS_LITE_TABS, JSON.stringify(chatTabs));
      if (activeChatPhone) localStorage.setItem(LS_LITE_ACTIVE, activeChatPhone);
    } catch {
      /* ignore */
    }
  }, [campaignMode, chatTabs, activeChatPhone]);

  useEffect(() => {
    if (campaignMode !== 'pro' || toolsSubTab !== 'automation') return undefined;
    let cancelled = false;
    getMessagingAutomation()
      .then((ma) => {
        if (!cancelled && ma) setMessagingAutomation(ma);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [campaignMode, toolsSubTab]);

  useEffect(() => {
    if (campaignMode !== 'pro' || toolsSubTab !== 'team') return undefined;
    let cancelled = false;
    getWorkspaceStats()
      .then((s) => {
        if (!cancelled) setWorkspaceStats(s);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignMode, toolsSubTab]);

  useEffect(() => {
    refreshDetail(selectedId).catch(() => {});
  }, [selectedId, refreshDetail]);

  useEffect(() => {
    refreshAnalytics(selectedId).catch(() => {});
  }, [selectedId, refreshAnalytics]);

  useEffect(() => {
    if (!selectedId) {
      setCampaignRecipients([]);
      return;
    }
    let cancelled = false;
    setRecipientsLoading(true);
    getCampaignRecipients(selectedId, { limit: 500 })
      .then((rows) => {
        if (!cancelled) setCampaignRecipients(rows);
      })
      .catch(() => {
        if (!cancelled) setCampaignRecipients([]);
      })
      .finally(() => {
        if (!cancelled) setRecipientsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const analyticsOpen =
    activeWindows.includes('tools') && toolsSubTab === 'analytics';
  useEffect(() => {
    const run =
      detail?.campaign?.status === 'running' ||
      (analyticsOpen && selectedId) ||
      Boolean(activeChatPhone);
    if (!run) return undefined;
    const t = setInterval(() => {
      setPollTick((x) => x + 1);
      refreshDetail(selectedId).catch(() => {});
      const needsUsageBootstrap =
        campaignMode === 'pro' ||
        detail?.campaign?.status === 'running' ||
        (analyticsOpen && selectedId);
      if (needsUsageBootstrap) {
        refreshSubscription?.().catch(() => {});
      }
      if (analyticsOpen && selectedId) {
        refreshAnalytics(selectedId).catch(() => {});
      }
    }, 5000);
    return () => clearInterval(t);
  }, [
    campaignMode,
    detail?.campaign?.status,
    selectedId,
    refreshDetail,
    refreshSubscription,
    analyticsOpen,
    refreshAnalytics,
    activeChatPhone,
  ]);

  useEffect(() => {
    if (campaignMode !== 'pro') return undefined;
    let cancelled = false;
    API.get('/api/contacts?limit=100')
      .then((r) => {
        if (cancelled || r.error || !r.data?.contacts) return;
        setContactsForLabels(r.data.contacts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [campaignMode]);

  useEffect(() => {
    if (!activeWindows.includes('activity') || !activeChatPhone) {
      setActivityBundle(null);
      return undefined;
    }
    let cancelled = false;
    getThreadActivity(activeChatPhone)
      .then((d) => {
        if (!cancelled) setActivityBundle(d);
      })
      .catch(() => {
        if (!cancelled) setActivityBundle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeWindows, activeChatPhone, pollTick]);

  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    if (!selectedId || detail?.campaign?.status !== 'draft') return undefined;
    draftTimerRef.current = setTimeout(() => {
      patchCampaignDraft(selectedId, { messageBody: composer }).catch(() => {});
    }, 1600);
    return () => clearTimeout(draftTimerRef.current);
  }, [composer, selectedId, detail?.campaign?.status]);

  useEffect(() => {
    const t = setInterval(() => loadMessages(), 40000);
    return () => clearInterval(t);
  }, [loadMessages]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'n') {
        e.preventDefault();
        setShowAddTab(true);
        setMobileTab('chat');
      }
      if ((e.ctrlKey || e.metaKey) && /^[1-4]$/.test(e.key) && campaignMode === 'pro') {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        const pane = activeWindows[idx];
        if (pane) setExpandedPane(pane);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeWindows, campaignMode]);

  useEffect(() => {
    if (!paletteOpen) return undefined;
    const q = paletteQ.trim();
    if (q.length < 2) {
      setSmartResults({ campaigns: [], contacts: [] });
      return undefined;
    }
    const t = setTimeout(() => {
      searchCampaignWorkspace(q)
        .then(setSmartResults)
        .catch(() => setSmartResults({ campaigns: [], contacts: [] }));
    }, 220);
    return () => clearTimeout(t);
  }, [paletteOpen, paletteQ]);

  const sampleVars = useMemo(() => {
    try {
      const o = JSON.parse(sampleVarsJson);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }, [sampleVarsJson]);

  const templateKeys = useMemo(() => extractTemplateKeys(composer), [composer]);
  const missingKeys = useMemo(
    () => findMissingKeys(composer, sampleVars),
    [composer, sampleVars]
  );
  const previewRendered = useMemo(
    () => renderMessage(composer, sampleVars),
    [composer, sampleVars]
  );

  const filteredCampaigns = useMemo(() => {
    let list = campaigns;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => String(c.name || '').toLowerCase().includes(q));
    if (statusFilter) list = list.filter((c) => c.status === statusFilter);
    return list;
  }, [campaigns, search, statusFilter]);

  const threads = useMemo(() => {
    const map = new Map();
    for (const m of messages) {
      const key = normalizeThreadKey(m.phone_number);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          phone: m.phone_number,
          lastAt: m.timestamp || m.created_at,
          preview: m.text || m.message,
        });
      }
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    );
  }, [messages]);

  const filteredThreads = useMemo(() => {
    let list = threads;
    const q = threadSearch.trim().toLowerCase();
    if (q) list = list.filter((t) => String(t.phone).toLowerCase().includes(q));
    if (labelFilter && contactsForLabels.length) {
      const want = new Set(
        labelFilter
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      );
      if (want.size) {
        const allowed = new Set();
        for (const c of contactsForLabels) {
          const labs = (c.labels || []).map((x) => String(x).toLowerCase());
          if (labs.some((l) => want.has(l))) {
            allowed.add(normalizeThreadKey(c.phoneNumber));
          }
        }
        list = list.filter((t) => allowed.has(normalizeThreadKey(t.phone)));
      }
    }
    return list;
  }, [threads, threadSearch, labelFilter, contactsForLabels]);

  const recipientPreviewCount = useMemo(() => {
    const parts = recipientsInput
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return new Set(parts).size;
  }, [recipientsInput]);

  const toggleWindow = (id) => {
    if (!CANONICAL.includes(id)) return;
    setActiveWindows((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= MAX_PRO_PANES) {
        const trimmed = prev.slice(0, MAX_PRO_PANES - 1);
        const next = new Set([...trimmed, id]);
        return CANONICAL.filter((x) => next.has(x));
      }
      const next = new Set([...prev, id]);
      return CANONICAL.filter((x) => next.has(x));
    });
  };

  const closeWindow = (id) => {
    setActiveWindows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((x) => x !== id);
    });
  };

  const openChatTab = useCallback((phone) => {
    const p = String(phone || '').trim();
    if (!p) return;
    setChatTabs((tabs) => (tabs.includes(p) ? tabs : [...tabs, p]));
    setActiveChatPhone(p);
    setShowAddTab(false);
    setAddTabDraft('');
  }, []);

  const closeChatTab = useCallback((phone) => {
    setChatTabs((tabs) => {
      const next = tabs.filter((t) => t !== phone);
      setActiveChatPhone((cur) => (cur === phone ? next[next.length - 1] || null : cur));
      return next;
    });
  }, []);

  const handleAddTabSubmit = (e) => {
    e?.preventDefault();
    openChatTab(addTabDraft);
  };

  const moveContactPipelineStage = async (contactId, stage) => {
    if (!contactId || !stage) return;
    try {
      const r = await API.put(`/api/contacts/${contactId}`, { pipelineStage: stage });
      if (r.error) throw new Error(r.error);
      setContactsForLabels((prev) =>
        prev.map((c) => (c._id === contactId ? { ...c, pipelineStage: stage } : c))
      );
    } catch (e) {
      setError(e.message || 'Could not move contact');
    }
  };

  const saveMessagingAutomation = async () => {
    setAutomationBusy(true);
    setError('');
    try {
      const ma = await patchMessagingAutomation({
        autoReplyEnabled: messagingAutomation.autoReplyEnabled,
        autoReplyRules: messagingAutomation.autoReplyRules || [],
      });
      setMessagingAutomation(ma);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setAutomationBusy(false);
    }
  };

  const handleCreateCampaign = async () => {
    setSaving(true);
    setError('');
    try {
      const recipients = recipientsInput
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const name = campaignName.trim() || `Campaign ${new Date().toLocaleDateString()}`;
      const { campaign } = await createCampaign({ name, recipients });
      setRecipientsInput('');
      setCampaignName('');
      await loadCampaigns();
      setSelectedId(campaign._id);
      setMobileTab('campaigns');
    } catch (e) {
      setError(e.message || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const { headers, rows } = parseCsvText(text);
    let valid = 0;
    let invalid = 0;
    const rowMeta = rows.map((row) => {
      const phoneRaw = findPhoneInRow(row);
      const ok = previewPhoneValid(phoneRaw);
      if (ok) valid++;
      else invalid++;
      return { ok, phoneRaw };
    });
    setCsvStaging({ file, headers, rows, rowMeta, valid, invalid });
    setToolsSubTab('csv');
    setMobileTab('templates');
    setActiveWindows((prev) => {
      if (prev.includes('tools')) return prev;
      const next = new Set([...prev, 'tools']);
      return CANONICAL.filter((x) => next.has(x));
    });
  };

  const handleConfirmCsvImport = async () => {
    if (!csvStaging?.file) return;
    setSaving(true);
    setError('');
    try {
      const name = campaignName.trim() || `CSV ${csvStaging.file.name}`;
      const { campaign } = await importCampaignCsv(csvStaging.file, name);
      setCsvStaging(null);
      await loadCampaigns();
      setSelectedId(campaign._id);
    } catch (err) {
      setError(err.message || 'CSV import failed');
    } finally {
      setSaving(false);
    }
  };

  const handleStartSend = async () => {
    if (!selectedId || !composer.trim()) {
      setError('Select a campaign and enter a message');
      return;
    }
    setCampaignLaunching(true);
    setError('');
    try {
      const schedule =
        scheduleType === 'scheduled' && scheduledAt
          ? { type: 'scheduled', scheduledAt: new Date(scheduledAt).toISOString() }
          : { type: 'immediate' };
      const res = await sendCampaign(selectedId, composer.trim(), { schedule });
      await refreshDetail(selectedId);
      await loadCampaigns();
      refreshSubscription?.().catch(() => {});
      if (!res.scheduled) {
        setComposer('');
      }
    } catch (e) {
      setError(e.message || 'Send failed');
    } finally {
      setCampaignLaunching(false);
    }
  };

  const handleAi = async () => {
    setAiLoading(true);
    setError('');
    try {
      const r = await aiGenerateCampaign({
        goal: 'Drive engagement with a limited-time SMS offer',
        audience: 'existing customers',
        tone: 'professional',
      });
      setComposer(r.message || '');
    } catch (e) {
      setError(e.message || 'AI failed');
    } finally {
      setAiLoading(false);
    }
  };

  const resetTemplateEditor = () => {
    setEditingTemplateId(null);
    setTemplateTitle('');
    setTemplateBody('');
  };

  const handleSaveTemplate = async () => {
    if (!templateTitle.trim() || !templateBody.trim()) return;
    setSaving(true);
    try {
      if (editingTemplateId) {
        await updateTemplate(editingTemplateId, {
          title: templateTitle.trim(),
          content: templateBody.trim(),
        });
      } else {
        await createTemplate({ title: templateTitle.trim(), content: templateBody.trim() });
      }
      resetTemplateEditor();
      await loadTemplates();
    } catch (e) {
      setError(e.message || 'Template save failed');
    } finally {
      setSaving(false);
    }
  };

  const startEditTemplate = (t) => {
    setEditingTemplateId(t._id);
    setTemplateTitle(t.title || '');
    setTemplateBody(t.content || '');
    setToolsSubTab('templates');
  };

  const insertTemplate = (content) => {
    setComposer((c) => (c ? `${c}\n${content}` : content));
  };

  const insertVariable = (name) => {
    const v = `{{${name}}}`;
    setComposer((c) => (c ? `${c}${v}` : v));
  };

  const progress = detail?.progress;
  const selectedCampaign = detail?.campaign;
  const pieData = analytics
    ? [
        { name: 'Sent', value: analytics.sent, color: '#4f46e5' },
        { name: 'Delivered', value: analytics.delivered || 0, color: '#22c55e' },
        { name: 'Failed', value: analytics.failed, color: '#dc2626' },
        { name: 'Pending', value: analytics.pending, color: '#94a3b8' },
        { name: 'Opt-out', value: analytics.optedOut || 0, color: '#f59e0b' },
      ].filter((d) => d.value > 0)
    : [];

  const totalRecipients = selectedCampaign?.totalRecipients ?? 0;
  const sentProgress =
    totalRecipients > 0 && progress
      ? Math.min(100, Math.round(((progress.sent + progress.failed + (progress.optedOut ?? 0)) / totalRecipients) * 100))
      : 0;

  const TabBtn = ({ id, label }) => (
    <button
      type="button"
      onClick={() => setMobileTab(id)}
      className={`flex-1 py-2.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-colors ${
        mobileTab === id
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/80'
      }`}
    >
      {label}
    </button>
  );

  const ToolsSubBtn = ({ id, label }) => (
    <button
      type="button"
      onClick={() => setToolsSubTab(id)}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
        toolsSubTab === id
          ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
      }`}
    >
      {label}
    </button>
  );

  const renderActivityBody = () => {
    const rows = [];
    if (activityBundle?.messages) {
      for (const m of activityBundle.messages) {
        rows.push({
          kind: 'msg',
          at: new Date(m.timestamp || m.created_at || 0).getTime(),
          label: m.direction === 'inbound' ? 'Inbound SMS' : 'Outbound SMS',
          detail: (m.text || m.message || '').slice(0, 120),
        });
      }
    }
    if (activityBundle?.campaigns) {
      for (const c of activityBundle.campaigns) {
        rows.push({
          kind: 'camp',
          at: new Date(c.updatedAt || 0).getTime(),
          label: 'Campaign',
          detail: `${c.campaignName || 'Campaign'} · ${c.recipientStatus || ''}`,
        });
      }
    }
    rows.sort((a, b) => b.at - a.at);
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0 text-sm">
        {!activeChatPhone && (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">Select a thread to load activity.</p>
        )}
        {activeChatPhone && !activityBundle && (
          <div className="space-y-2 animate-pulse py-4">
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
          </div>
        )}
        {activeChatPhone &&
          activityBundle &&
          rows.map((r, i) => (
            <div
              key={`${r.kind}-${i}`}
              className="rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2 bg-slate-50/80 dark:bg-slate-900/40"
            >
              <div className="text-[10px] font-semibold uppercase text-slate-500">{r.label}</div>
              <div className="text-xs text-slate-800 dark:text-slate-100 mt-0.5">{r.detail}</div>
              <div className="text-[10px] text-slate-400 mt-1">
                {r.at ? new Date(r.at).toLocaleString() : ''}
              </div>
            </div>
          ))}
        {activeChatPhone && activityBundle && rows.length === 0 && (
          <p className="text-slate-500 text-center py-6">No activity yet.</p>
        )}
      </div>
    );
  };

  const renderCampaignListBody = () => (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="p-3 space-y-2 border-b border-slate-100 dark:border-slate-700 shrink-0">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns…"
          className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
        </select>
        {campaignMode === 'pro' && (
          <input
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            placeholder="Filter by contact label (vip, lead…)"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
          />
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {filteredCampaigns.length === 0 ? (
          <p className="text-sm text-slate-500 px-2 py-6 text-center">No campaigns match.</p>
        ) : (
          filteredCampaigns.map((c) => (
            <div
              key={c._id}
              className={`rounded-xl mb-1 flex gap-1 items-stretch transition-colors ${
                selectedId === c._id
                  ? 'bg-indigo-50 dark:bg-indigo-950/50 ring-1 ring-indigo-200 dark:ring-indigo-800'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedId(c._id);
                  if (typeof c.messageBody === 'string') setComposer(c.messageBody);
                }}
                className="flex-1 min-w-0 text-left px-3 py-2.5"
              >
                <div className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{c.name}</div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  <span className="capitalize">{c.status}</span>
                  <span>·</span>
                  <span>Sent {c.sentCount ?? 0}</span>
                  {c.createdAt && (
                    <>
                      <span>·</span>
                      <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </button>
              {campaignMode === 'pro' && (
                <button
                  type="button"
                  title="Duplicate campaign"
                  className="shrink-0 px-2 my-2 rounded-lg text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/30"
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      const copy = await duplicateCampaign(c._id);
                      await loadCampaigns();
                      setSelectedId(copy._id);
                      setComposer(String(copy.messageBody || ''));
                    } catch (err) {
                      setError(err.message || 'Duplicate failed');
                    }
                  }}
                >
                  ⧉
                </button>
              )}
            </div>
          ))
        )}
      </div>
      {selectedId && (
        <div className="border-t border-slate-200 dark:border-slate-700 p-2 shrink-0 max-h-[40%] flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-900/30">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-2 mb-1 shrink-0">
            Recipients — open chat
          </p>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5 px-1">
            {recipientsLoading ? (
              <p className="text-xs text-slate-500 px-2 py-2">Loading…</p>
            ) : campaignRecipients.length === 0 ? (
              <p className="text-xs text-slate-500 px-2 py-2">No recipients yet.</p>
            ) : (
              campaignRecipients.map((r) => (
                <button
                  key={`${r.phone}-${r._id || ''}`}
                  type="button"
                  onClick={() => openChatTab(r.phone)}
                  className={`w-full text-left font-mono text-[11px] truncate px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 ${
                    activeChatPhone === r.phone ? 'bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-600' : ''
                  }`}
                >
                  {r.phone}
                  {r.status && r.status !== 'pending' ? (
                    <span className="text-slate-400 ml-1">({r.status})</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderChatBody = () => (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-1 px-2 py-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto shrink-0 bg-slate-50/80 dark:bg-slate-900/40">
        {chatTabs.map((p) => (
          <div
            key={p}
            className={`flex items-center gap-0.5 rounded-lg shrink-0 ${
              activeChatPhone === p ? 'bg-indigo-600 text-white' : 'bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveChatPhone(p)}
              className="px-2.5 py-1.5 text-[11px] font-mono max-w-[140px] truncate"
            >
              {p}
            </button>
            <button
              type="button"
              onClick={() => closeChatTab(p)}
              className="pr-2 py-1 text-[10px] opacity-70 hover:opacity-100"
              aria-label={`Close ${p}`}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setShowAddTab((s) => !s)}
          className="px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-xs font-medium text-indigo-600 dark:text-indigo-400 shrink-0"
        >
          + add
        </button>
      </div>
      {showAddTab && (
        <form
          onSubmit={handleAddTabSubmit}
          className="flex gap-2 px-2 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0"
        >
          <input
            value={addTabDraft}
            onChange={(e) => setAddTabDraft(e.target.value)}
            placeholder="+1…"
            className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1.5 text-sm font-mono"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold shrink-0"
          >
            Open
          </button>
        </form>
      )}
      <CampaignSmsThread
        threadPhone={activeChatPhone}
        pollKey={pollTick}
        getThreadCache={getThreadCache}
        setThreadCache={setThreadCache}
        className="flex-1 min-h-0"
      />
    </div>
  );

  const renderComposerBody = () => (
    <div className="overflow-y-auto p-3 space-y-3 min-h-0">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
        Campaign name
        <input
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          placeholder="Spring promo"
        />
      </label>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
        Recipients — paste numbers
        <textarea
          value={recipientsInput}
          onChange={(e) => setRecipientsInput(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 font-mono text-xs px-3 py-2 bg-white dark:bg-slate-900"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-200">{recipientPreviewCount} unique</span>
        <label className="inline-flex items-center gap-2 cursor-pointer px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/80 hover:bg-slate-200/80 dark:hover:bg-slate-600">
          <span>CSV upload</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
        </label>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={handleCreateCampaign}
        className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
      >
        Create campaign from paste
      </button>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
        Sample variables (JSON preview)
        <input
          value={sampleVarsJson}
          onChange={(e) => setSampleVarsJson(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 font-mono text-[11px] px-3 py-2 bg-white dark:bg-slate-900"
        />
      </label>
      <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 space-y-2 bg-slate-50/50 dark:bg-slate-900/20">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Message</span>
          <span className="text-[11px] text-slate-500">
            {segInfo.chars} chars · {segInfo.segments} segments ({segInfo.encoding})
          </span>
          <span className="text-[11px] text-slate-500">
            · SMS left:{' '}
            {subscription?.isUnlimited || subscription?.displayUnlimited ? '∞' : smsRemaining}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs px-2 py-1.5"
            value=""
            onChange={(e) => {
              const t = templates.find((x) => x._id === e.target.value);
              if (t) insertTemplate(t.content);
              e.target.value = '';
            }}
          >
            <option value="">Insert template…</option>
            {templates.map((t) => (
              <option key={t._id} value={t._id}>
                {t.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => insertVariable('name')}
            className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            {'{{name}}'}
          </button>
          <button
            type="button"
            disabled={aiLoading}
            onClick={handleAi}
            className="text-xs px-2 py-1.5 rounded-lg bg-violet-600 text-white disabled:opacity-50"
          >
            {aiLoading ? '…' : 'AI draft'}
          </button>
        </div>
        {templateKeys.length > 0 && (
          <div className="text-[11px] space-y-0.5">
            <span className="text-amber-700 dark:text-amber-300">Variables: {templateKeys.join(', ')}</span>
            {missingKeys.length > 0 && (
              <span className="text-red-600 dark:text-red-400 block">Missing in sample: {missingKeys.join(', ')}</span>
            )}
          </div>
        )}
        <textarea
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          rows={5}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm resize-none"
          placeholder="Hi {{name}}, …"
        />
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Preview: <span className="text-slate-800 dark:text-slate-200">{previewRendered || '—'}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={scheduleType}
          onChange={(e) => setScheduleType(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm px-3 py-2"
        >
          <option value="immediate">Send now</option>
          <option value="scheduled">Schedule</option>
        </select>
        {scheduleType === 'scheduled' && (
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm px-3 py-2"
          />
        )}
      </div>
      <button
        type="button"
        disabled={campaignLaunching || !selectedId || !composer.trim()}
        onClick={handleStartSend}
        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50"
      >
        {campaignLaunching ? 'Starting…' : scheduleType === 'scheduled' ? 'Schedule send' : 'Send campaign'}
      </button>
      {selectedCampaign && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 space-y-2 bg-white dark:bg-slate-900/40">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selectedCampaign.name}</div>
          <div className="text-xs text-slate-600 dark:text-slate-400 capitalize">Status: {selectedCampaign.status}</div>
          {progress && (
            <>
              <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                <span className="text-indigo-600 dark:text-indigo-400">Sent {progress.sent}</span>
                <span className="text-slate-500">Pending {progress.pending}</span>
                <span className="text-red-600 dark:text-red-400">Failed {progress.failed}</span>
              </div>
              {selectedCampaign.status === 'running' && totalRecipients > 0 && (
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${sentProgress}%` }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  const renderToolsBody = () => (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex gap-1 p-2 border-b border-slate-200 dark:border-slate-700 shrink-0 flex-wrap overflow-x-auto">
        <ToolsSubBtn id="templates" label="Templates" />
        <ToolsSubBtn id="csv" label="CSV" />
        <ToolsSubBtn id="analytics" label="Analytics" />
        <ToolsSubBtn id="pipeline" label="Pipeline" />
        <ToolsSubBtn id="automation" label="Auto-reply" />
        <ToolsSubBtn id="team" label="Dashboard" />
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-3">
        {toolsSubTab === 'templates' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 space-y-2 bg-slate-50/30 dark:bg-slate-900/20">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {editingTemplateId ? 'Edit template' : 'New template'}
              </p>
              <input
                value={templateTitle}
                onChange={(e) => setTemplateTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-900"
              />
              <textarea
                value={templateBody}
                onChange={(e) => setTemplateBody(e.target.value)}
                placeholder="Message body with {{variables}}"
                rows={3}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-900 resize-none"
              />
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Variable preview</p>
              <VarnHighlight text={templateBody} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={saving}
                  className="flex-1 py-2 rounded-lg bg-slate-800 dark:bg-slate-200 dark:text-slate-900 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {editingTemplateId ? 'Update' : 'Create'}
                </button>
                {editingTemplateId && (
                  <button
                    type="button"
                    onClick={resetTemplateEditor}
                    className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Library</p>
            {templates.map((t) => (
              <div
                key={t._id}
                className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 flex flex-col gap-2 bg-white dark:bg-slate-900/30"
              >
                <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{t.title}</div>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3">{t.content}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400"
                    onClick={() => insertTemplate(t.content)}
                  >
                    Insert into composer
                  </button>
                  <button
                    type="button"
                    className="text-xs text-slate-600 dark:text-slate-400"
                    onClick={() => startEditTemplate(t)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => deleteTemplate(t._id).then(loadTemplates).catch((e) => setError(e.message))}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {toolsSubTab === 'csv' && (
          <div className="space-y-3">
            <label className="flex flex-col gap-2 cursor-pointer rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 p-6 text-center hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Upload CSV</span>
              <span className="text-xs text-slate-500">phone, name, custom columns → variables</span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
            </label>
            {csvStaging && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
                <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-xs font-medium flex flex-wrap gap-3">
                  <span className="text-emerald-700 dark:text-emerald-400">Valid rows: {csvStaging.valid}</span>
                  <span className="text-red-600 dark:text-red-400">Invalid: {csvStaging.invalid}</span>
                </div>
                <div className="overflow-x-auto max-h-48">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0">
                      <tr>
                        {csvStaging.headers.map((h) => (
                          <th key={h} className="text-left px-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvStaging.rows.slice(0, 50).map((row, i) => (
                        <tr
                          key={i}
                          className={
                            csvStaging.rowMeta[i]?.ok
                              ? ''
                              : 'bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200'
                          }
                        >
                          {csvStaging.headers.map((h) => (
                            <td key={h} className="px-2 py-1 border-t border-slate-100 dark:border-slate-700 max-w-[120px] truncate">
                              {row[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvStaging.rows.length > 50 && (
                  <p className="text-[10px] text-slate-500 px-2 py-1">Showing first 50 of {csvStaging.rows.length} rows</p>
                )}
                <div className="p-3 flex gap-2 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    disabled={saving || csvStaging.valid === 0}
                    onClick={handleConfirmCsvImport}
                    className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    Confirm import
                  </button>
                  <button
                    type="button"
                    onClick={() => setCsvStaging(null)}
                    className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {toolsSubTab === 'pipeline' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Drag contacts between stages. Updates are saved to each contact record.
            </p>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 min-h-[220px]">
              {['new', 'contacted', 'qualified', 'closed'].map((stage) => (
                <div
                  key={stage}
                  className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col min-h-[200px]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('contactId');
                    if (id) moveContactPipelineStage(id, stage);
                  }}
                >
                  <div className="px-2 py-2 border-b border-slate-200 dark:border-slate-700 text-xs font-bold uppercase text-slate-500 shrink-0">
                    {stage}
                  </div>
                  <div className="flex-1 overflow-y-auto p-1.5 space-y-1 min-h-0">
                    {contactsForLabels
                      .filter((c) => (c.pipelineStage || 'new') === stage)
                      .map((c) => (
                        <div
                          key={c._id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('contactId', c._id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          className="rounded-lg px-2 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 cursor-grab active:cursor-grabbing text-sm"
                        >
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {c.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 truncate">{c.phoneNumber}</div>
                          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                            Score {c.leadScore ?? 0}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
            {contactsForLabels.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">No contacts loaded yet.</p>
            )}
          </div>
        )}
        {toolsSubTab === 'automation' && (
          <div className="space-y-4 max-w-xl">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Keyword rules match inbound SMS (case-insensitive). Use one fallback rule for unmatched messages. AI
              replies require OPENAI_API_KEY on the server.
            </p>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={Boolean(messagingAutomation.autoReplyEnabled)}
                onChange={(e) =>
                  setMessagingAutomation((m) => ({ ...m, autoReplyEnabled: e.target.checked }))
                }
                className="rounded border-slate-300"
              />
              Auto-reply to inbound SMS
            </label>
            {(messagingAutomation.autoReplyRules || []).map((rule, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 space-y-2 bg-white dark:bg-slate-900/30"
              >
                <div className="flex flex-wrap gap-3 items-center text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(rule.isFallback)}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setMessagingAutomation((m) => {
                          const rules = [...(m.autoReplyRules || [])];
                          rules[idx] = { ...rules[idx], isFallback: v };
                          return { ...m, autoReplyRules: rules };
                        });
                      }}
                    />
                    Fallback
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(rule.useAi)}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setMessagingAutomation((m) => {
                          const rules = [...(m.autoReplyRules || [])];
                          rules[idx] = { ...rules[idx], useAi: v };
                          return { ...m, autoReplyRules: rules };
                        });
                      }}
                    />
                    AI reply
                  </label>
                </div>
                <input
                  placeholder="Keyword (leave empty for fallback-only)"
                  value={rule.keyword || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMessagingAutomation((m) => {
                      const rules = [...(m.autoReplyRules || [])];
                      rules[idx] = { ...rules[idx], keyword: v };
                      return { ...m, autoReplyRules: rules };
                    });
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
                />
                {!rule.useAi && (
                  <textarea
                    placeholder="Fixed SMS reply"
                    value={rule.response || ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMessagingAutomation((m) => {
                        const rules = [...(m.autoReplyRules || [])];
                        rules[idx] = { ...rules[idx], response: v };
                        return { ...m, autoReplyRules: rules };
                      });
                    }}
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1.5 text-sm bg-white dark:bg-slate-900 resize-none"
                  />
                )}
                {rule.useAi && (
                  <input
                    placeholder="Extra instructions for AI (optional)"
                    value={rule.aiPrompt || ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMessagingAutomation((m) => {
                        const rules = [...(m.autoReplyRules || [])];
                        rules[idx] = { ...rules[idx], aiPrompt: v };
                        return { ...m, autoReplyRules: rules };
                      });
                    }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1.5 text-sm bg-white dark:bg-slate-900"
                  />
                )}
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() =>
                    setMessagingAutomation((m) => ({
                      ...m,
                      autoReplyRules: (m.autoReplyRules || []).filter((_, i) => i !== idx),
                    }))
                  }
                >
                  Remove rule
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
                onClick={() =>
                  setMessagingAutomation((m) => ({
                    ...m,
                    autoReplyRules: [
                      ...(m.autoReplyRules || []),
                      {
                        keyword: '',
                        response: '',
                        useAi: false,
                        aiPrompt: '',
                        isFallback: false,
                      },
                    ],
                  }))
                }
              >
                Add rule
              </button>
              <button
                type="button"
                disabled={automationBusy}
                onClick={saveMessagingAutomation}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {automationBusy ? 'Saving…' : 'Save automation'}
              </button>
            </div>
          </div>
        )}
        {toolsSubTab === 'team' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Workspace summary (last {workspaceStats?.windowDays ?? 7} days). Team-wide rollups can extend this
              endpoint later.
            </p>
            {workspaceStats ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">SMS sent</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {workspaceStats.smsSent ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Replies</div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {workspaceStats.smsReplies ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Reply rate</div>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {workspaceStats.replyRateApprox != null ? `${workspaceStats.replyRateApprox}%` : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Running campaigns</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {workspaceStats.runningCampaigns ?? 0}
                  </div>
                </div>
              </div>
            ) : (
              <div className="animate-pulse space-y-2 py-4">
                <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded-xl" />
                <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded-xl" />
              </div>
            )}
          </div>
        )}
        {toolsSubTab === 'analytics' && (
          <div className="space-y-3">
            {!selectedId && <p className="text-sm text-slate-500">Select a campaign in the list.</p>}
            {selectedId && analytics && (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">Delivery {analytics.deliveryRate}%</div>
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">Failure {analytics.failureRate}%</div>
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">Delivered {analytics.delivered ?? 0}</div>
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">Replies {analytics.replies ?? 0}</div>
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">Response {analytics.responseRate ?? 0}%</div>
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">Total {analytics.total}</div>
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">Opt-outs {analytics.optedOut ?? 0}</div>
                </div>
                <div className="h-36 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.timeline || []}>
                      <XAxis dataKey="time" tick={{ fontSize: 9 }} tickFormatter={(t) => (t ? String(t).slice(11, 16) : '')} />
                      <YAxis tick={{ fontSize: 9 }} width={28} />
                      <Tooltip />
                      <Line type="monotone" dataKey="sent" stroke="#4f46e5" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={52}
                        label={({ name }) => name}
                      >
                        {pieData.map((e, i) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const paneTitle = (id) => {
    if (id === 'campaigns') return 'Campaigns';
    if (id === 'chat') return 'Conversations';
    if (id === 'settings') return 'Campaign composer';
    if (id === 'tools') return 'Tools · CRM · Automation';
    if (id === 'activity') return 'Activity timeline';
    return '';
  };

  const renderPaneBody = (id) => {
    if (id === 'campaigns') return renderCampaignListBody();
    if (id === 'chat') return renderChatBody();
    if (id === 'settings') return renderComposerBody();
    if (id === 'tools') return renderToolsBody();
    if (id === 'activity') return renderActivityBody();
    return null;
  };

  const renderProPaneShell = (id) => (
    <GridShell
      title={paneTitle(id)}
      onClose={() => closeWindow(id)}
      disabledClose={activeWindows.length <= 1}
      onExpand={() => setExpandedPane(id)}
    >
      {renderPaneBody(id)}
    </GridShell>
  );

  const paletteCommands = useMemo(() => {
    const cmds = [
      {
        id: 'mode-lite',
        label: 'Switch to Lite mode (simple SMS)',
        keywords: 'whatsapp simple',
        run: () => setCampaignMode('lite').catch((err) => setError(err.message)),
      },
      {
        id: 'mode-pro',
        label: 'Switch to Pro mode (campaigns & tools)',
        keywords: 'marketing csv analytics',
        run: () => setCampaignMode('pro').catch((err) => setError(err.message)),
      },
      {
        id: 'new-chat',
        label: 'New chat tab',
        keywords: 'conversation thread',
        hint: 'Ctrl+N',
        run: () => {
          setShowAddTab(true);
          setMobileTab('chat');
        },
      },
      {
        id: 'show-activity',
        label: 'Open Activity timeline pane',
        keywords: 'history log',
        run: () => {
          setCampaignMode('pro').catch(() => {});
          setActiveWindows((prev) => {
            if (prev.includes('activity')) return prev;
            if (prev.length >= MAX_PRO_PANES) {
              const trimmed = prev.slice(0, MAX_PRO_PANES - 1);
              const next = new Set([...trimmed, 'activity']);
              return CANONICAL.filter((x) => next.has(x));
            }
            return CANONICAL.filter((x) => new Set([...prev, 'activity']).has(x));
          });
        },
      },
    ];
    for (const camp of smartResults.campaigns || []) {
      cmds.push({
        id: `c-${camp._id}`,
        label: `Open campaign: ${camp.name}`,
        run: () => {
          setCampaignMode('pro').catch(() => {});
          setSelectedId(camp._id);
        },
      });
    }
    for (const co of smartResults.contacts || []) {
      cmds.push({
        id: `co-${co._id}`,
        label: `Chat ${co.name || co.phoneNumber}`,
        hint: co.phoneNumber,
        run: () => openChatTab(co.phoneNumber),
      });
    }
    return cmds;
  }, [smartResults, setCampaignMode, openChatTab]);

  const toolbarBtn = (id, label) => {
    const on = activeWindows.includes(id);
    return (
      <button
        key={id}
        type="button"
        onClick={() => toggleWindow(id)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          on
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300/80 dark:hover:bg-slate-600'
        }`}
      >
        {label}
      </button>
    );
  };

  if (loading && campaignMode === 'pro') {
    return (
      <div className="flex flex-1 flex-col gap-3 p-6 max-w-md mx-auto w-full justify-center">
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse w-2/3" />
        <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse w-1/2" />
      </div>
    );
  }

  if (campaignMode === 'lite') {
    return (
      <div className="flex flex-1 flex-col h-full min-h-0 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden">
        <div className="lg:hidden flex gap-1 p-2 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 shrink-0 shadow-sm">
          <TabBtn id="campaigns" label="Chats" />
          <TabBtn id="chat" label="Thread" />
        </div>

        <div className="hidden lg:flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex-wrap">
          <div className="inline-flex rounded-xl p-1 bg-gray-100 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setCampaignMode('lite').catch((e) => setError(e.message))}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm"
            >
              Lite mode
            </button>
            <button
              type="button"
              onClick={() => setCampaignMode('pro').catch((e) => setError(e.message))}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-slate-600/50"
            >
              Pro mode
            </button>
          </div>
          <div className="flex-1 min-w-[8px]" />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="text-sm px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-200"
          >
            Commands <kbd className="ml-1 opacity-70">⌘K</kbd>
          </button>
        </div>

        {error && (
          <div className="mx-3 mt-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 px-3 py-2 text-sm border border-red-100 dark:border-red-900/50">
            {error}
          </div>
        )}

        <CampaignLiteWorkspace
          templates={templates}
          filteredThreads={filteredThreads}
          threadSearch={threadSearch}
          setThreadSearch={setThreadSearch}
          activeChatPhone={activeChatPhone}
          setActiveChatPhone={setActiveChatPhone}
          chatTabs={chatTabs}
          openChatTab={openChatTab}
          closeChatTab={closeChatTab}
          showAddTab={showAddTab}
          setShowAddTab={setShowAddTab}
          addTabDraft={addTabDraft}
          setAddTabDraft={setAddTabDraft}
          handleAddTabSubmit={handleAddTabSubmit}
          pollTick={pollTick}
          getThreadCache={getThreadCache}
          setThreadCache={setThreadCache}
          paletteOpen={paletteOpen}
          setPaletteOpen={setPaletteOpen}
          paletteCommands={paletteCommands}
          paletteQ={paletteQ}
          setPaletteQ={setPaletteQ}
          loadMessages={loadMessages}
          sidebarLoading={loading}
          mobileTab={mobileTab}
          setMobileTab={setMobileTab}
          setError={setError}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col h-full min-h-0 bg-slate-100/80 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="lg:hidden flex gap-1 p-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 shadow-sm">
        <TabBtn id="campaigns" label="Campaigns" />
        <TabBtn id="chat" label="Chat" />
        <TabBtn id="composer" label="Composer" />
        <TabBtn id="templates" label="Tools" />
      </div>

      <div className="hidden lg:flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex-wrap">
        <div className="inline-flex rounded-xl p-1 bg-gray-100 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setCampaignMode('lite').catch((e) => setError(e.message))}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-slate-600/50"
          >
            Lite mode
          </button>
          <button
            type="button"
            onClick={() => setCampaignMode('pro').catch((e) => setError(e.message))}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm"
          >
            Pro mode
          </button>
        </div>
        {toolbarBtn('campaigns', 'Campaigns')}
        {toolbarBtn('chat', 'Chat')}
        {toolbarBtn('settings', 'Composer')}
        {toolbarBtn('tools', 'Tools / CSV / Analytics')}
        {toolbarBtn('activity', 'Activity')}
        <div className="flex-1 min-w-[8px]" />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Commands <kbd className="ml-1 opacity-70">⌘K</kbd>
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          onClick={() => downloadOptOutCsv().catch((e) => setError(e.message))}
        >
          Export opt-outs ({optOutTotal})
        </button>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 px-3 py-2 text-sm border border-red-100 dark:border-red-900/50">
          {error}
        </div>
      )}

      <div className="hidden lg:flex flex-1 min-h-0 min-w-0 p-2">
        <CampaignProResizableGrid
          paneIds={activeWindows}
          renderPane={(id) => renderProPaneShell(id)}
          autoSaveId="otodial-campaign-pro"
        />
      </div>

      {expandedPane && (
        <div
          className="hidden lg:flex fixed inset-0 z-[160] items-stretch justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={() => setExpandedPane(null)}
        >
          <div
            className="w-full max-w-6xl h-full min-h-0"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GridShell
              title={paneTitle(expandedPane)}
              onClose={() => setExpandedPane(null)}
              disabledClose={false}
            >
              {renderPaneBody(expandedPane)}
            </GridShell>
          </div>
        </div>
      )}

      {/* Mobile single panel */}
      <div className="lg:hidden flex-1 min-h-0 overflow-hidden flex flex-col bg-slate-100/80 dark:bg-slate-950">
        {mobileTab === 'campaigns' && (
          <div className="flex-1 min-h-0 m-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden flex flex-col">
            <header className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm shrink-0 bg-slate-50/90 dark:bg-slate-800/90">
              Campaigns
            </header>
            <div className="flex-1 min-h-0 flex flex-col">{renderCampaignListBody()}</div>
          </div>
        )}
        {mobileTab === 'chat' && (
          <div className="flex-1 min-h-0 m-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden flex flex-col">
            <header className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm shrink-0 bg-slate-50/90 dark:bg-slate-800/90">
              Chat
            </header>
            <div className="flex-1 min-h-0 flex flex-col">{renderChatBody()}</div>
          </div>
        )}
        {mobileTab === 'composer' && (
          <div className="flex-1 min-h-0 m-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden flex flex-col">
            <header className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm shrink-0 bg-slate-50/90 dark:bg-slate-800/90">
              Composer
            </header>
            <div className="flex-1 min-h-0 flex flex-col">{renderComposerBody()}</div>
          </div>
        )}
        {mobileTab === 'templates' && (
          <div className="flex-1 min-h-0 m-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden flex flex-col">
            <header className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm shrink-0 bg-slate-50/90 dark:bg-slate-800/90">
              Tools
            </header>
            <div className="flex-1 min-h-0 flex flex-col">{renderToolsBody()}</div>
          </div>
        )}
      </div>

      <CampaignCommandPalette
        open={paletteOpen}
        onClose={() => {
          setPaletteOpen(false);
          setPaletteQ('');
        }}
        query={paletteQ}
        onQueryChange={setPaletteQ}
        commands={paletteCommands}
      />
    </div>
  );
}
