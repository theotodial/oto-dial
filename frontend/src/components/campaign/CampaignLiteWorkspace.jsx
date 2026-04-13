import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api';
import { fetchAllContacts } from '../../utils/fetchAllContacts';
import CampaignSmsThread from './CampaignSmsThread';
import CampaignCommandPalette from './CampaignCommandPalette';

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const MessageIcon = ({ className = 'w-5 h-5', strokeWidth = 2 }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
    />
  </svg>
);

const TrashIcon = ({ className = 'w-5 h-5', strokeWidth = 2 }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

function getInitials(name) {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name[0]?.toUpperCase() || '?';
}

function avatarColor(name) {
  if (!name) return 'bg-gray-400';
  const colors = [
    'bg-indigo-500',
    'bg-green-500',
    'bg-blue-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-yellow-500',
    'bg-red-500',
    'bg-orange-500',
  ];
  return colors[name.charCodeAt(0) % colors.length];
}

function Avatar({ name, phoneNumber, size = 'w-10 h-10', className = '' }) {
  const displayName = name || phoneNumber || 'Unknown';
  return (
    <div
      className={`${size} ${avatarColor(displayName)} rounded-full flex items-center justify-center text-white font-medium text-sm flex-shrink-0 ${className}`}
    >
      {getInitials(displayName)}
    </div>
  );
}

function formatListTime(date) {
  if (!date) return '';
  try {
    const now = new Date();
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (diffDays < 7) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `${days[d.getDay()]}`;
    }
    return `${months[d.getMonth()]} ${d.getDate()}`;
  } catch {
    return '';
  }
}

function normPhone(n) {
  return String(n || '').replace(/\D/g, '');
}

const LABEL_PRESETS = [
  { label: 'Lead', value: 'lead' },
  { label: 'Customer', value: 'customer' },
  { label: 'Interested', value: 'interested' },
  { label: 'VIP', value: 'vip' },
];

function badgeForLabel(lab) {
  const x = String(lab).toLowerCase();
  if (x === 'lead') return 'bg-amber-500/20 text-amber-900 dark:text-amber-100 border-amber-500/40';
  if (x === 'customer') return 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-100 border-emerald-500/40';
  if (x === 'interested') return 'bg-sky-500/20 text-sky-900 dark:text-sky-100 border-sky-500/40';
  if (x === 'vip') return 'bg-violet-500/20 text-violet-900 dark:text-violet-100 border-violet-500/40';
  return 'bg-slate-500/15 text-slate-800 dark:text-slate-200 border-slate-500/30';
}

/**
 * Lite Campaign workspace: matches Voice / Recents layout (sidebar + chat + CRM rail).
 */
export default function CampaignLiteWorkspace({
  templates = [],
  filteredThreads = [],
  threadSearch,
  setThreadSearch,
  activeChatPhone,
  setActiveChatPhone,
  chatTabs,
  openChatTab,
  closeChatTab,
  showAddTab,
  setShowAddTab,
  addTabDraft,
  setAddTabDraft,
  handleAddTabSubmit,
  pollTick,
  getThreadCache,
  setThreadCache,
  paletteOpen,
  setPaletteOpen,
  paletteCommands,
  paletteQ,
  setPaletteQ,
  loadMessages,
  sidebarLoading,
  mobileTab,
  setMobileTab,
  setError,
}) {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatNumber, setNewChatNumber] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [lookupContact, setLookupContact] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [labelsDraft, setLabelsDraft] = useState([]);
  const [savingCrm, setSavingCrm] = useState(false);
  const [templateSig, setTemplateSig] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const notesTimer = useRef(null);
  const labelsRef = useRef([]);
  labelsRef.current = labelsDraft;

  const getContactName = useCallback(
    (phone) => {
      const n = normPhone(phone);
      const c = contacts.find((x) => normPhone(x.phoneNumber) === n);
      return c?.name || null;
    },
    [contacts]
  );

  const getUnread = useCallback(
    (phone) => {
      const n = normPhone(phone);
      const key = Object.keys(unreadCounts).find((k) => normPhone(k) === n) || phone;
      return unreadCounts[key] || 0;
    },
    [unreadCounts]
  );

  useEffect(() => {
    const fn = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'n') {
        e.preventDefault();
        e.stopPropagation();
        setShowNewChatModal(true);
        setNewChatNumber('');
        setNewChatName('');
      }
    };
    window.addEventListener('keydown', fn, true);
    return () => window.removeEventListener('keydown', fn, true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAllContacts(30)
      .then((list) => {
        if (!cancelled) setContacts(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUnread = useCallback(() => {
    API.get('/api/messages/unread-counts')
      .then((r) => {
        if (!r.error && r.data?.unreadCounts) setUnreadCounts(r.data.unreadCounts);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshUnread();
    const t = setInterval(refreshUnread, 45000);
    return () => clearInterval(t);
  }, [refreshUnread]);

  useEffect(() => {
    if (!activeChatPhone) {
      setLookupContact(null);
      setNotesDraft('');
      setLabelsDraft([]);
      return;
    }
    let cancelled = false;
    API.get('/api/contacts/lookup', { params: { phone: activeChatPhone } })
      .then((r) => {
        if (cancelled || r.error) return;
        const c = r.data?.contact;
        setLookupContact(c || null);
        setNotesDraft(c?.notes || '');
        setLabelsDraft(Array.isArray(c?.labels) ? [...c.labels] : []);
      })
      .catch(() => {
        if (!cancelled) {
          setLookupContact(null);
          setNotesDraft('');
          setLabelsDraft([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeChatPhone]);

  const persistNotesLabels = useCallback(
    async (nextNotes, nextLabels) => {
      if (!lookupContact?._id) return;
      setSavingCrm(true);
      try {
        const r = await API.put(`/api/contacts/${lookupContact._id}`, {
          notes: nextNotes,
          labels: nextLabels,
        });
        if (r.error) throw new Error(r.error);
        setLookupContact(r.data?.contact || lookupContact);
        const list = await fetchAllContacts(5);
        setContacts(list);
      } catch (err) {
        setError?.(err.message || 'Could not save contact');
      } finally {
        setSavingCrm(false);
      }
    },
    [lookupContact, setError]
  );

  useEffect(() => {
    if (!lookupContact?._id) return undefined;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      if (notesDraft === (lookupContact.notes || '')) return;
      persistNotesLabels(notesDraft, labelsRef.current);
    }, 650);
    return () => clearTimeout(notesTimer.current);
  }, [notesDraft, lookupContact?._id, lookupContact?.notes, persistNotesLabels]);

  const togglePresetLabel = (value) => {
    const v = String(value).toLowerCase();
    setLabelsDraft((prev) => {
      const has = prev.map((x) => String(x).toLowerCase()).includes(v);
      const next = has ? prev.filter((x) => String(x).toLowerCase() !== v) : [...prev, v];
      if (lookupContact?._id) persistNotesLabels(notesDraft, next);
      return next;
    });
  };

  const handleStartNewChat = async () => {
    const raw = String(newChatNumber || '').trim();
    if (!raw) return;
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10) {
      setError?.('Enter a valid phone number');
      return;
    }
    setCreatingChat(true);
    try {
      const name = String(newChatName || '').trim();
      if (name) {
        const res = await API.post('/api/contacts', {
          name,
          phoneNumber: digits,
          notes: '',
          labels: [],
        });
        if (res.error && !String(res.error).includes('already exists')) {
          throw new Error(res.error);
        }
        const list = await fetchAllContacts(5);
        setContacts(list);
      }
      openChatTab(raw);
      setMobileTab?.('chat');
      setShowNewChatModal(false);
      setNewChatNumber('');
      setNewChatName('');
      await loadMessages?.();
      refreshUnread();
    } catch (e) {
      setError?.(e.message || 'Could not start chat');
    } finally {
      setCreatingChat(false);
    }
  };

  const handleDeleteThread = async (phone) => {
    if (!phone || deleting) return;
    if (!window.confirm('Delete this conversation?')) return;
    setDeleting(true);
    try {
      const encoded = encodeURIComponent(phone);
      const res = await API.delete(`/api/messages/thread/${encoded}`);
      if (res?.error) throw new Error(res.error);
      closeChatTab(phone);
      await loadMessages?.();
      refreshUnread();
    } catch (e) {
      setError?.(e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const displayTitle = activeChatPhone ? getContactName(activeChatPhone) || activeChatPhone : '';

  const sortedThreads = useMemo(() => {
    return [...filteredThreads].sort(
      (a, b) => new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime()
    );
  }, [filteredThreads]);

  return (
    <div className="flex flex-1 flex-col min-h-0 h-full bg-white dark:bg-slate-900 overflow-hidden">
      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar — Recents-style */}
        <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800 min-h-0">
          <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-3">SMS</h1>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowNewChatModal(true);
                  setNewChatNumber('');
                  setNewChatName('');
                }}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center justify-center gap-2 text-sm transition-colors"
              >
                <PlusIcon />
                New chat
              </button>
              <button
                type="button"
                onClick={() => navigate('/contacts')}
                className="px-3 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 text-sm font-medium"
                title="Contacts"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </button>
            </div>
            <div className="mt-3">
              <select
                className="w-full text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 px-3 py-2.5 text-gray-900 dark:text-white"
                value=""
                onChange={(e) => {
                  const t = templates.find((x) => x._id === e.target.value);
                  if (t) setTemplateSig({ id: Date.now(), text: t.content });
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
            </div>
          </div>
          <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
            <input
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 px-3 py-2.5 text-[15px] text-gray-900 dark:text-white placeholder-gray-400"
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {sidebarLoading && sortedThreads.length === 0 ? (
              <div className="p-6 space-y-3 animate-pulse">
                <div className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl" />
                <div className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl" />
                <div className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl" />
              </div>
            ) : sortedThreads.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-[15px]">
                No conversations yet
              </div>
            ) : (
              sortedThreads.map((t) => {
                const phone = t.phone;
                const name = getContactName(phone);
                const title = name || phone;
                const unread = getUnread(phone);
                const selected = activeChatPhone === phone;
                return (
                  <div
                    key={phone}
                    className={`group flex items-center px-4 py-3 border-b border-gray-100/80 dark:border-slate-700/80 transition-colors ${
                      selected
                        ? 'bg-indigo-50 dark:bg-indigo-900/25'
                        : 'bg-white dark:bg-slate-800 hover:bg-gray-50/90 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openChatTab(phone)}
                      className="flex-1 flex items-center gap-3 min-w-0 text-left"
                    >
                      <div className="relative flex-shrink-0">
                        <Avatar
                          name={title}
                          phoneNumber={phone}
                          size="w-11 h-11"
                          className="ring-1 ring-gray-200/50 dark:ring-slate-600/50"
                        />
                        {unread > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[11px] font-bold">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2 mb-0.5">
                          <span
                            className={`truncate text-[15px] leading-tight ${
                              unread > 0
                                ? 'font-bold text-gray-900 dark:text-white'
                                : 'font-semibold text-gray-900 dark:text-white'
                            }`}
                          >
                            {title}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
                            {formatListTime(t.lastAt)}
                          </span>
                        </div>
                        <p
                          className={`text-sm truncate ${
                            unread > 0
                              ? 'text-gray-800 dark:text-gray-100 font-medium'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {t.preview || 'No messages'}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteThread(phone);
                      }}
                      disabled={deleting}
                      className="p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete conversation"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chat column */}
        <div className="flex flex-1 flex-col bg-gray-50 dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 min-w-0 min-h-0">
          <div className="flex items-center gap-1 px-2 py-2 border-b border-gray-200 dark:border-slate-700 overflow-x-auto shrink-0 bg-white/90 dark:bg-slate-800/90">
            {chatTabs.map((p) => (
              <div
                key={p}
                className={`flex items-center gap-0.5 rounded-xl shrink-0 ${
                  activeChatPhone === p
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200/90 dark:bg-slate-700 text-gray-800 dark:text-gray-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveChatPhone(p)}
                  className="px-3 py-1.5 text-sm font-medium max-w-[160px] truncate"
                >
                  {getContactName(p) || p}
                </button>
                <button
                  type="button"
                  onClick={() => closeChatTab(p)}
                  className="pr-2 py-1 text-xs opacity-80 hover:opacity-100"
                  aria-label={`Close ${p}`}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setShowAddTab((s) => !s)}
              className="px-3 py-1.5 rounded-xl border border-dashed border-gray-300 dark:border-slate-600 text-sm font-medium text-indigo-600 dark:text-indigo-400 shrink-0"
            >
              + Tab
            </button>
          </div>
          {showAddTab && (
            <form
              onSubmit={handleAddTabSubmit}
              className="flex gap-2 px-3 py-2 border-b border-gray-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-800/50"
            >
              <input
                value={addTabDraft}
                onChange={(e) => setAddTabDraft(e.target.value)}
                placeholder="Phone number…"
                className="flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shrink-0"
              >
                Open
              </button>
            </form>
          )}
          {activeChatPhone ? (
            <>
              <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between flex-shrink-0 gap-2">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate min-w-0">
                  {displayTitle}
                </h2>
              </div>
              <CampaignSmsThread
                threadPhone={activeChatPhone}
                pollKey={pollTick}
                getThreadCache={getThreadCache}
                setThreadCache={setThreadCache}
                insertSignal={templateSig}
                className="flex-1 min-h-0"
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 min-h-0">
              <div className="text-center px-6">
                <MessageIcon className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-600 dark:text-gray-300 font-medium text-[15px]">
                  Select a chat to view conversation
                </p>
                <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">Or start with New chat</p>
              </div>
            </div>
          )}
        </div>

        {/* CRM rail */}
        <div className="hidden xl:flex w-80 flex-shrink-0 flex-col bg-gray-50 dark:bg-slate-900 border-l border-gray-200 dark:border-slate-700 min-h-0">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Contact
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate mt-1">
              {activeChatPhone ? displayTitle : '—'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {!activeChatPhone && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                Open a thread to edit notes and labels.
              </p>
            )}
            {activeChatPhone && !lookupContact && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Not saved as a contact yet. Use <strong>New chat</strong> with a name to create one, or save from Voice.
              </p>
            )}
            {activeChatPhone && lookupContact && (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Lead score</p>
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {lookupContact.leadScore ?? 0}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-2">
                    Notes
                  </label>
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={5}
                    placeholder="Add notes for this contact…"
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none"
                  />
                  {savingCrm && (
                    <p className="text-[11px] text-gray-400 mt-1">Saving…</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Labels
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {LABEL_PRESETS.map((p) => {
                      const on = labelsDraft.map((x) => String(x).toLowerCase()).includes(p.value);
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => togglePresetLabel(p.value)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                            on
                              ? `${badgeForLabel(p.value)} border-current`
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-600'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  {labelsDraft.filter((l) => !LABEL_PRESETS.some((p) => p.value === String(l).toLowerCase()))
                    .length > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Other:{' '}
                      {labelsDraft
                        .filter((l) => !LABEL_PRESETS.some((p) => p.value === String(l).toLowerCase()))
                        .join(', ')}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="lg:hidden flex-1 min-h-0 flex flex-col bg-gray-50 dark:bg-slate-900 overflow-hidden">
        {mobileTab === 'campaigns' && (
          <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-800 overflow-hidden">
            <div className="p-3 border-b border-gray-200 dark:border-slate-700 space-y-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowNewChatModal(true)}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                <PlusIcon /> New chat
              </button>
              <input
                value={threadSearch}
                onChange={(e) => setThreadSearch(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-xl border border-gray-200 dark:border-slate-600 px-3 py-2 text-[15px] bg-white dark:bg-slate-900"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {sortedThreads.map((t) => {
                const phone = t.phone;
                const title = getContactName(phone) || phone;
                const unread = getUnread(phone);
                return (
                  <button
                    key={phone}
                    type="button"
                    onClick={() => {
                      openChatTab(phone);
                      setMobileTab?.('chat');
                    }}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-slate-700 flex gap-3 items-center ${
                      activeChatPhone === phone ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                    }`}
                  >
                    <Avatar name={title} phoneNumber={phone} size="w-11 h-11" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-[15px] text-gray-900 dark:text-white truncate">
                          {title}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">{formatListTime(t.lastAt)}</span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{t.preview || '—'}</p>
                    </div>
                    {unread > 0 && (
                      <span className="min-w-[22px] h-6 px-1 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {mobileTab === 'chat' && (
          <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-800 overflow-hidden">
            <div className="flex items-center gap-1 px-2 py-2 border-b overflow-x-auto shrink-0">
              {chatTabs.map((p) => (
                <div
                  key={p}
                  className={`flex items-center rounded-lg shrink-0 ${
                    activeChatPhone === p ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveChatPhone(p)}
                    className="px-2 py-1.5 text-xs max-w-[120px] truncate"
                  >
                    {getContactName(p) || p}
                  </button>
                  <button type="button" onClick={() => closeChatTab(p)} className="pr-1.5 text-xs">
                    ×
                  </button>
                </div>
              ))}
            </div>
            {activeChatPhone ? (
              <CampaignSmsThread
                threadPhone={activeChatPhone}
                pollKey={pollTick}
                getThreadCache={getThreadCache}
                setThreadCache={setThreadCache}
                insertSignal={templateSig}
                className="flex-1 min-h-0"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm p-6">
                Select a conversation
              </div>
            )}
          </div>
        )}
      </div>

      {showNewChatModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
          onClick={() => !creatingChat && setShowNewChatModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">New chat</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone number
                </label>
                <input
                  type="tel"
                  value={newChatNumber}
                  onChange={(e) => setNewChatNumber(e.target.value)}
                  placeholder="+1 555 123 4567"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  placeholder="Contact name"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !creatingChat && setShowNewChatModal(false)}
                  className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-slate-700 font-semibold text-gray-800 dark:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={creatingChat || !newChatNumber.trim()}
                  onClick={handleStartNewChat}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
                >
                  {creatingChat ? '…' : 'Start'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
