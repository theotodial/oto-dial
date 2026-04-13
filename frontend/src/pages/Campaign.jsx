import { useCallback, useEffect, useMemo, useState } from 'react';
import API from '../api';
import { useSubscription } from '../context/SubscriptionContext';
import {
  listCampaigns,
  getCampaign,
  getCampaignAnalytics,
  createCampaign,
  importCampaignCsv,
  sendCampaign,
  listTemplates,
  createTemplate,
  deleteTemplate,
  aiGenerateCampaign,
  downloadOptOutCsv,
} from '../services/campaignService';
import {
  renderMessage,
  extractTemplateKeys,
  findMissingKeys,
  smsSegmentCount,
} from '../utils/campaignText';
import FloatingPanel from './campaign/FloatingPanel';
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

const LS_WINDOWS = 'otodial_campaign_windows_v1';

const DEFAULT_WINDOWS = () => ({
  campaignList: { open: true, x: 12, y: 56, w: 300, h: 420, z: 1 },
  chat: { open: true, x: 324, y: 56, w: 460, h: 540, z: 2 },
  settings: { open: true, x: 796, y: 56, w: 300, h: 480, z: 3 },
  templates: { open: true, x: 1108, y: 56, w: 280, h: 400, z: 4 },
  analytics: { open: true, x: 380, y: 460, w: 460, h: 320, z: 5 },
});

function normalizeThreadKey(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function loadWindows() {
  try {
    const raw = localStorage.getItem(LS_WINDOWS);
    if (!raw) return DEFAULT_WINDOWS();
    const p = JSON.parse(raw);
    const d = DEFAULT_WINDOWS();
    return { ...d, ...p };
  } catch {
    return DEFAULT_WINDOWS();
  }
}

export default function Campaign() {
  const { usage, subscription, refreshSubscription } = useSubscription();
  const smsRemaining = usage?.smsRemaining ?? 0;

  const [mobileTab, setMobileTab] = useState('campaigns');
  const [campaigns, setCampaigns] = useState([]);
  const [optOutTotal, setOptOutTotal] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState('');
  const [threadSearch, setThreadSearch] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [recipientsInput, setRecipientsInput] = useState('');
  const [composer, setComposer] = useState('');
  const [sampleVarsJson, setSampleVarsJson] = useState('{"name":"Alex"}');
  const [scheduleType, setScheduleType] = useState('immediate');
  const [scheduledAt, setScheduledAt] = useState('');
  const [messages, setMessages] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [windows, setWindows] = useState(loadWindows);

  const segInfo = smsSegmentCount(composer);

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
    localStorage.setItem(LS_WINDOWS, JSON.stringify(windows));
  }, [windows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await Promise.all([loadCampaigns(), loadTemplates(), loadMessages()]);
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
    refreshDetail(selectedId).catch(() => {});
  }, [selectedId, refreshDetail]);

  useEffect(() => {
    refreshAnalytics(selectedId).catch(() => {});
  }, [selectedId, refreshAnalytics]);

  useEffect(() => {
    const analyticsOpen = windows.analytics?.open || mobileTab === 'analytics';
    const run =
      detail?.campaign?.status === 'running' || (analyticsOpen && selectedId);
    if (!run) return undefined;
    const t = setInterval(() => {
      refreshDetail(selectedId).catch(() => {});
      loadMessages().catch(() => {});
      refreshSubscription?.().catch(() => {});
      if (analyticsOpen && selectedId) {
        refreshAnalytics(selectedId).catch(() => {});
      }
    }, 5000);
    return () => clearInterval(t);
  }, [
    detail?.campaign?.status,
    selectedId,
    mobileTab,
    refreshDetail,
    loadMessages,
    refreshSubscription,
    windows.analytics?.open,
    refreshAnalytics,
  ]);

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
    const q = threadSearch.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => String(t.phone).toLowerCase().includes(q));
  }, [threads, threadSearch]);

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) => String(c.name || '').toLowerCase().includes(q));
  }, [campaigns, search]);

  const threadMessages = useMemo(() => {
    if (!selectedPhone) return [];
    const want = normalizeThreadKey(selectedPhone);
    return messages
      .filter((m) => normalizeThreadKey(m.phone_number) === want)
      .sort(
        (a, b) =>
          new Date(a.timestamp || a.created_at) - new Date(b.timestamp || b.created_at)
      );
  }, [messages, selectedPhone]);

  const recipientPreviewCount = useMemo(() => {
    const parts = recipientsInput.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    return new Set(parts).size;
  }, [recipientsInput]);

  const updateWindow = (id, patch) => {
    setWindows((w) => ({
      ...w,
      [id]: { ...w[id], ...patch },
    }));
  };

  const activateWindow = (id) => {
    setWindows((w) => {
      const maxZ = Math.max(10, ...Object.values(w).map((p) => p?.z || 0));
      const nz = maxZ + 1;
      return {
        ...w,
        [id]: { ...w[id], z: nz },
      };
    });
  };

  const resetLayout = () => {
    setWindows(DEFAULT_WINDOWS());
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

  const handleCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const name = campaignName.trim() || `CSV ${file.name}`;
      const { campaign } = await importCampaignCsv(file, name);
      await loadCampaigns();
      setSelectedId(campaign._id);
      setMobileTab('campaigns');
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
    setSaving(true);
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
      setSaving(false);
    }
  };

  const handleSendThread = async () => {
    if (!selectedPhone || !composer.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await API.post('/api/sms/send', { to: selectedPhone, text: composer.trim() });
      if (res.error) throw new Error(res.error);
      await loadMessages();
      refreshSubscription?.().catch(() => {});
    } catch (e) {
      setError(e.message || 'Send failed');
    } finally {
      setSaving(false);
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

  const handleSaveTemplate = async () => {
    if (!templateTitle.trim() || !templateBody.trim()) return;
    setSaving(true);
    try {
      await createTemplate({ title: templateTitle.trim(), content: templateBody.trim() });
      setTemplateTitle('');
      setTemplateBody('');
      await loadTemplates();
    } catch (e) {
      setError(e.message || 'Template save failed');
    } finally {
      setSaving(false);
    }
  };

  const insertTemplate = (content) => {
    setComposer((c) => (c ? `${c}\n${content}` : content));
  };

  const progress = detail?.progress;
  const selectedCampaign = detail?.campaign;
  const pieData = analytics
    ? [
        { name: 'Sent', value: analytics.sent, color: '#4f46e5' },
        { name: 'Failed', value: analytics.failed, color: '#dc2626' },
        { name: 'Pending', value: analytics.pending, color: '#94a3b8' },
        { name: 'Opt-out', value: analytics.optedOut || 0, color: '#f59e0b' },
      ].filter((d) => d.value > 0)
    : [];

  const panelInner = 'flex-1 min-h-0 overflow-y-auto p-2';

  const TabBtn = ({ id, label }) => (
    <button
      type="button"
      onClick={() => setMobileTab(id)}
      className={`flex-1 py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wide rounded-lg ${
        mobileTab === id
          ? 'bg-indigo-600 text-white'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-slate-500">
        Loading campaign workspace…
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <div className="lg:hidden flex gap-0.5 p-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <TabBtn id="campaigns" label="Campaigns" />
        <TabBtn id="chat" label="Chat" />
        <TabBtn id="templates" label="Templates" />
        <TabBtn id="analytics" label="Analytics" />
      </div>

      <div className="hidden lg:flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 shrink-0 flex-wrap">
        {['campaignList', 'chat', 'settings', 'templates', 'analytics'].map((k) => (
          <button
            key={k}
            type="button"
            className="text-xs px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-700"
            onClick={() => updateWindow(k, { open: !windows[k]?.open })}
          >
            {windows[k]?.open ? 'Hide' : 'Show'}{' '}
            {k === 'campaignList'
              ? 'List'
              : k === 'chat'
                ? 'Chat'
                : k === 'settings'
                  ? 'Settings'
                  : k === 'templates'
                    ? 'Templates'
                    : 'Analytics'}
          </button>
        ))}
        <button
          type="button"
          className="text-xs px-2 py-1 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200"
          onClick={resetLayout}
        >
          Reset layout
        </button>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600"
          onClick={() => downloadOptOutCsv().catch((e) => setError(e.message))}
        >
          Export opt-outs ({optOutTotal})
        </button>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Desktop floating workspace */}
      <div className="hidden lg:block flex-1 min-h-0 relative overflow-hidden">
        <FloatingPanel
          title="Campaign list"
          open={windows.campaignList?.open}
          onClose={() => updateWindow('campaignList', { open: false })}
          rect={windows.campaignList}
          onRectChange={(r) => updateWindow('campaignList', r)}
          onActivate={() => activateWindow('campaignList')}
        >
          <div className={panelInner}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full mb-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-sm"
            />
            {filteredCampaigns.map((c) => (
              <button
                key={c._id}
                type="button"
                onClick={() => setSelectedId(c._id)}
                className={`w-full text-left px-2 py-2 rounded-lg mb-1 ${
                  selectedId === c._id ? 'bg-indigo-100 dark:bg-indigo-900/30' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="font-medium text-sm truncate">{c.name}</div>
                <div className="text-[10px] text-slate-500">
                  {c.status}
                  {c.schedule?.type === 'scheduled' && c.schedule?.scheduledAt
                    ? ` · ${new Date(c.schedule.scheduledAt).toLocaleString()}`
                    : ''}{' '}
                  · {c.sentCount ?? 0}/{c.totalRecipients ?? 0}
                </div>
              </button>
            ))}
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-600">
              <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Threads</p>
              <input
                value={threadSearch}
                onChange={(e) => setThreadSearch(e.target.value)}
                className="w-full rounded border px-2 py-1 text-xs mb-1"
                placeholder="Search threads"
              />
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {filteredThreads.slice(0, 20).map((t) => (
                  <button
                    key={t.phone}
                    type="button"
                    onClick={() => setSelectedPhone(t.phone)}
                    className={`w-full text-left font-mono text-[10px] truncate px-1 py-0.5 rounded ${
                      selectedPhone === t.phone ? 'bg-emerald-100 dark:bg-emerald-900/30' : ''
                    }`}
                  >
                    {t.phone}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </FloatingPanel>

        <FloatingPanel
          title="Chat & composer"
          open={windows.chat?.open}
          onClose={() => updateWindow('chat', { open: false })}
          rect={windows.chat}
          onRectChange={(r) => updateWindow('chat', r)}
          onActivate={() => activateWindow('chat')}
          minW={320}
          minH={280}
        >
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-2 py-1 text-[10px] text-slate-500 truncate">
              {selectedPhone || 'Select a thread'}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-100/80 dark:bg-slate-900/40">
              {threadMessages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[90%] rounded-lg px-2 py-1 text-xs ${
                    m.direction === 'inbound'
                      ? 'bg-white dark:bg-slate-800'
                      : 'bg-indigo-600 text-white ml-auto'
                  }`}
                >
                  {m.campaignId && <span className="opacity-70 text-[9px]">Campaign · </span>}
                  {m.text || m.message}
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 dark:border-slate-600 p-2 space-y-2 shrink-0">
              <div className="flex flex-wrap gap-2 items-center text-[10px] text-slate-500">
                <span>
                  {segInfo.chars} chars · {segInfo.segments} seg ({segInfo.encoding}) · SMS left:{' '}
                  {subscription?.isUnlimited || subscription?.displayUnlimited ? '∞' : smsRemaining}
                </span>
                <select
                  className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs px-1"
                  value=""
                  onChange={(e) => {
                    const t = templates.find((x) => x._id === e.target.value);
                    if (t) insertTemplate(t.content);
                    e.target.value = '';
                  }}
                >
                  <option value="">Template…</option>
                  {templates.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={handleAi}
                  className="px-2 py-0.5 rounded bg-violet-600 text-white disabled:opacity-50"
                >
                  {aiLoading ? '…' : 'AI'}
                </button>
              </div>
              {templateKeys.length > 0 && (
                <div className="text-[10px] space-y-0.5">
                  <span className="text-amber-700 dark:text-amber-300">
                    Vars: {templateKeys.join(', ')}
                  </span>
                  {missingKeys.length > 0 && (
                    <span className="text-red-600 dark:text-red-400 block">
                      Missing in sample: {missingKeys.join(', ')}
                    </span>
                  )}
                </div>
              )}
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-sm resize-none"
                placeholder="Message (use {{name}} etc.)"
              />
              <div className="text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800/80 rounded p-1 max-h-14 overflow-y-auto">
                Preview: {previewRendered || '—'}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving || !selectedPhone}
                  onClick={handleSendThread}
                  className="flex-1 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-600 text-xs font-semibold"
                >
                  Thread
                </button>
                <button
                  type="button"
                  disabled={saving || !selectedId}
                  onClick={handleStartSend}
                  className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                >
                  Send campaign
                </button>
              </div>
            </div>
          </div>
        </FloatingPanel>

        <FloatingPanel
          title="Settings & audience"
          open={windows.settings?.open}
          onClose={() => updateWindow('settings', { open: false })}
          rect={windows.settings}
          onRectChange={(r) => updateWindow('settings', r)}
          onActivate={() => activateWindow('settings')}
        >
          <div className={`${panelInner} space-y-2 text-sm`}>
            <label className="block text-xs">
              Campaign name
              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
              />
            </label>
            <label className="block text-xs">
              Numbers (paste)
              <textarea
                value={recipientsInput}
                onChange={(e) => setRecipientsInput(e.target.value)}
                rows={5}
                className="mt-0.5 w-full rounded border font-mono text-[10px] px-2 py-1"
              />
            </label>
            <p className="text-[10px] text-slate-500">Detected: {recipientPreviewCount}</p>
            <label className="block text-xs">
              CSV import (phone + columns → variables)
              <input type="file" accept=".csv,text/csv" className="mt-1 w-full text-[10px]" onChange={handleCsv} />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={handleCreateCampaign}
              className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
            >
              Create from paste
            </button>
            <label className="block text-xs">
              Sample variables (JSON for preview)
              <input
                value={sampleVarsJson}
                onChange={(e) => setSampleVarsJson(e.target.value)}
                className="mt-0.5 w-full rounded border font-mono text-[10px] px-2 py-1"
              />
            </label>
            <div className="space-y-1 border-t border-slate-200 dark:border-slate-600 pt-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Schedule</p>
              <select
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value)}
                className="w-full rounded border text-xs px-2 py-1"
              >
                <option value="immediate">Send now</option>
                <option value="scheduled">Schedule</option>
              </select>
              {scheduleType === 'scheduled' && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full rounded border text-xs px-2 py-1"
                />
              )}
            </div>
            {selectedCampaign && (
              <div className="rounded-lg bg-slate-100 dark:bg-slate-800/80 p-2 text-[10px]">
                <div className="font-semibold">{selectedCampaign.name}</div>
                <div>Status: {selectedCampaign.status}</div>
                {progress && (
                  <div>
                    Sent {progress.sent} · Failed {progress.failed} · Pending {progress.pending} · Opt-out{' '}
                    {progress.optedOut ?? 0}
                  </div>
                )}
              </div>
            )}
          </div>
        </FloatingPanel>

        <FloatingPanel
          title="Templates"
          open={windows.templates?.open}
          onClose={() => updateWindow('templates', { open: false })}
          rect={windows.templates}
          onRectChange={(r) => updateWindow('templates', r)}
          onActivate={() => activateWindow('templates')}
        >
          <div className={panelInner}>
            {templates.map((t) => (
              <div
                key={t._id}
                className="rounded-lg border border-slate-200 dark:border-slate-600 p-2 mb-2 text-xs"
              >
                <div className="font-medium flex justify-between gap-1">
                  <span className="truncate">{t.title}</span>
                  <button type="button" className="text-indigo-600 shrink-0" onClick={() => insertTemplate(t.content)}>
                    Use
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 line-clamp-2">{t.content}</p>
                <button
                  type="button"
                  className="text-[10px] text-red-600"
                  onClick={() => deleteTemplate(t._id).then(loadTemplates).catch((e) => setError(e.message))}
                >
                  Delete
                </button>
              </div>
            ))}
            <input
              value={templateTitle}
              onChange={(e) => setTemplateTitle(e.target.value)}
              placeholder="New title"
              className="w-full rounded border px-2 py-1 text-xs mb-1"
            />
            <textarea
              value={templateBody}
              onChange={(e) => setTemplateBody(e.target.value)}
              placeholder="Body"
              rows={2}
              className="w-full rounded border px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={handleSaveTemplate}
              className="mt-2 w-full py-1.5 rounded bg-slate-700 text-white text-xs"
            >
              Save template
            </button>
          </div>
        </FloatingPanel>

        <FloatingPanel
          title="Analytics"
          open={windows.analytics?.open}
          onClose={() => updateWindow('analytics', { open: false })}
          rect={windows.analytics}
          onRectChange={(r) => updateWindow('analytics', r)}
          onActivate={() => activateWindow('analytics')}
          minW={320}
          minH={220}
        >
          <div className={`${panelInner} space-y-2`}>
            {!selectedId && <p className="text-xs text-slate-500">Select a campaign</p>}
            {selectedId && analytics && (
              <>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="rounded bg-slate-100 dark:bg-slate-800 p-2">
                    Delivery {analytics.deliveryRate}%
                  </div>
                  <div className="rounded bg-slate-100 dark:bg-slate-800 p-2">
                    Failure {analytics.failureRate}%
                  </div>
                  <div className="rounded bg-slate-100 dark:bg-slate-800 p-2">Total {analytics.total}</div>
                  <div className="rounded bg-slate-100 dark:bg-slate-800 p-2">
                    Opt-outs {analytics.optedOut ?? 0}
                  </div>
                </div>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.timeline || []}>
                      <XAxis dataKey="time" tick={{ fontSize: 8 }} tickFormatter={(t) => (t ? String(t).slice(11, 16) : '')} />
                      <YAxis tick={{ fontSize: 8 }} width={24} />
                      <Tooltip />
                      <Line type="monotone" dataKey="sent" stroke="#4f46e5" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-24 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={48} label={({ name }) => name}>
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
        </FloatingPanel>
      </div>

      {/* Mobile */}
      <div className="lg:hidden flex-1 min-h-0 overflow-y-auto p-3 space-y-3 pb-24">
        {mobileTab === 'campaigns' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 space-y-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns"
              className="w-full rounded-lg border px-2 py-2 text-sm"
            />
            {filteredCampaigns.map((c) => (
              <button
                key={c._id}
                type="button"
                onClick={() => setSelectedId(c._id)}
                className={`w-full text-left py-2 border-b border-slate-100 dark:border-slate-700 ${
                  selectedId === c._id ? 'text-indigo-600' : ''
                }`}
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-slate-500">
                  {c.status} · {c.sentCount}/{c.totalRecipients}
                </div>
              </button>
            ))}
            <button
              type="button"
              className="w-full py-2 text-sm border rounded-lg"
              onClick={() => downloadOptOutCsv().catch((e) => setError(e.message))}
            >
              Export opt-outs ({optOutTotal})
            </button>
            <p className="text-xs font-semibold">New campaign</p>
            <input
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Name"
              className="w-full rounded border px-2 py-2 text-sm"
            />
            <textarea
              value={recipientsInput}
              onChange={(e) => setRecipientsInput(e.target.value)}
              rows={4}
              placeholder="Phone numbers"
              className="w-full rounded border font-mono text-xs px-2 py-2"
            />
            <input type="file" accept=".csv" onChange={handleCsv} className="text-xs" />
            <button
              type="button"
              onClick={handleCreateCampaign}
              disabled={saving}
              className="w-full py-3 rounded-lg bg-emerald-600 text-white font-semibold"
            >
              Create
            </button>
            <select
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value)}
              className="w-full rounded border text-sm"
            >
              <option value="immediate">Send now</option>
              <option value="scheduled">Schedule</option>
            </select>
            {scheduleType === 'scheduled' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded border text-sm"
              />
            )}
            <input
              value={sampleVarsJson}
              onChange={(e) => setSampleVarsJson(e.target.value)}
              className="w-full rounded border font-mono text-xs px-2 py-2"
              placeholder='Variables JSON e.g. {"name":"Alex"}'
            />
          </div>
        )}

        {mobileTab === 'chat' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col min-h-[320px]">
            <div className="p-2 flex flex-wrap gap-1 border-b">
              {filteredThreads.slice(0, 16).map((t) => (
                <button
                  key={t.phone}
                  type="button"
                  onClick={() => setSelectedPhone(t.phone)}
                  className={`text-[10px] font-mono px-2 py-1 rounded ${
                    selectedPhone === t.phone ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700'
                  }`}
                >
                  {t.phone}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-64">
              {threadMessages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[92%] rounded-lg px-2 py-1 text-sm ${
                    m.direction === 'inbound' ? 'bg-slate-100 dark:bg-slate-700' : 'bg-indigo-600 text-white ml-auto'
                  }`}
                >
                  {m.text || m.message}
                </div>
              ))}
            </div>
            <div className="p-2 border-t space-y-2">
              <div className="text-[10px] text-slate-500">
                {segInfo.chars} chars · {segInfo.segments} SMS parts
              </div>
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                rows={3}
                className="w-full rounded border px-2 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button type="button" onClick={handleAi} disabled={aiLoading} className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-sm">
                  AI
                </button>
                <button type="button" onClick={handleSendThread} className="flex-1 py-2 bg-slate-200 dark:bg-slate-600 rounded-lg text-sm">
                  Thread
                </button>
                <button type="button" onClick={handleStartSend} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm">
                  Campaign
                </button>
              </div>
            </div>
          </div>
        )}

        {mobileTab === 'templates' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 space-y-3">
            {templates.map((t) => (
              <div key={t._id} className="border rounded-lg p-2">
                <div className="font-medium">{t.title}</div>
                <p className="text-xs text-slate-500">{t.content}</p>
                <div className="flex gap-2 mt-2">
                  <button type="button" className="text-indigo-600 text-sm" onClick={() => insertTemplate(t.content)}>
                    Insert
                  </button>
                  <button type="button" className="text-red-600 text-sm" onClick={() => deleteTemplate(t._id).then(loadTemplates)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
            <input
              value={templateTitle}
              onChange={(e) => setTemplateTitle(e.target.value)}
              className="w-full border rounded px-2 py-2 text-sm"
              placeholder="Title"
            />
            <textarea
              value={templateBody}
              onChange={(e) => setTemplateBody(e.target.value)}
              className="w-full border rounded px-2 py-2 text-sm"
              rows={3}
            />
            <button type="button" onClick={handleSaveTemplate} className="w-full py-2 bg-slate-800 text-white rounded-lg">
              Save
            </button>
          </div>
        )}

        {mobileTab === 'analytics' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            {!selectedId && <p className="text-sm text-slate-500">Select a campaign in Campaigns tab</p>}
            {selectedId && analytics && (
              <>
                <p className="text-sm mb-2">
                  Delivery {analytics.deliveryRate}% · Failed {analytics.failureRate}% · Opt-outs {analytics.optedOut ?? 0}
                </p>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.timeline || []}>
                      <XAxis dataKey="time" tick={{ fontSize: 9 }} />
                      <YAxis width={28} />
                      <Tooltip />
                      <Line type="monotone" dataKey="sent" stroke="#4f46e5" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-40 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
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
}
