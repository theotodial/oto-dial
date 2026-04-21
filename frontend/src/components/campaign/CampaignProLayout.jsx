import { useEffect, useMemo, useRef, useState } from 'react';
import API from '../../api';
import UnifiedChat from '../chat/UnifiedChat';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function CampaignProLayout({ getThreadCache, setThreadCache }) {
  const [threads, setThreads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [search, setSearch] = useState('');
  const [rightTab, setRightTab] = useState('crm');
  const [loading, setLoading] = useState(true);
  const [bulkRecipients, setBulkRecipients] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const prefetchedRef = useRef(new Set());
  const threadCacheOrderRef = useRef([]);

  const loadBase = async () => {
    setLoading(true);
    const [threadsRes, campaignsRes] = await Promise.all([
      API.get('/api/messages/threads', { params: { limit: 50 } }),
      API.get('/api/campaign'),
    ]);
    const nextThreads = threadsRes.error ? [] : threadsRes.data?.threads || [];
    setThreads(nextThreads);
    setCampaigns(campaignsRes.error ? [] : campaignsRes.data?.campaigns || []);
    if (!activeThread && nextThreads.length) setActiveThread(nextThreads[0].phone || nextThreads[0].threadId);
    setLoading(false);
  };

  useEffect(() => {
    void loadBase();
  }, []);

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => String(t.phone || '').toLowerCase().includes(q) || String(t.lastMessage || '').toLowerCase().includes(q));
  }, [threads, search]);

  const updateThreadCacheOrder = (phone) => {
    const key = String(phone || '');
    if (!key) return;
    threadCacheOrderRef.current = [key, ...threadCacheOrderRef.current.filter((x) => x !== key)].slice(0, 5);
  };

  const prefetchThread = async (phone) => {
    const key = String(phone || '');
    if (!key || prefetchedRef.current.has(key)) return;
    prefetchedRef.current.add(key);
    const response = await API.get('/api/messages', { params: { thread: key, limit: 30 } }).catch(() => ({ error: true }));
    if (response?.error) return;
    setThreadCache?.(key, response.data?.messages || []);
  };

  const handleBulkSend = async (e) => {
    e.preventDefault();
    const recipients = bulkRecipients
      .split(/[\n,;]+/)
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    if (!recipients.length || !bulkMessage.trim()) return;
    setBulkSending(true);
    setBulkStatus('');
    const res = await API.post('/api/sms/send', {
      recipients,
      text: bulkMessage.trim(),
    });
    if (res.error) setBulkStatus(res.error);
    else setBulkStatus(`Queued for ${res.data?.totalRecipients || recipients.length} recipients`);
    setBulkSending(false);
  };

  return (
    <div className="hidden lg:grid grid-cols-[320px_minmax(0,1fr)_360px] gap-2 p-2 h-full min-h-0 bg-slate-100/80 dark:bg-slate-950">
      <aside className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col min-h-0">
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns or threads" className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm" />
        </div>
        <div className="px-3 pt-2 text-[11px] uppercase font-semibold text-slate-500">Campaigns</div>
        <div className="px-2 py-1 max-h-40 overflow-y-auto">
          {campaigns.length === 0 ? <p className="text-xs text-slate-500 px-2 py-2">Create a campaign to start.</p> : campaigns.slice(0, 12).map((c) => <div key={c._id} className="px-2 py-1.5 text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">{c.name}</div>)}
        </div>
        <div className="px-3 pt-2 text-[11px] uppercase font-semibold text-slate-500 border-t border-slate-200 dark:border-slate-700">Conversations</div>
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {loading ? <p className="text-sm text-slate-500 px-2 py-2">Loading...</p> : filteredThreads.length === 0 ? <p className="text-sm text-slate-500 px-2 py-8 text-center">No conversations yet.</p> : filteredThreads.map((t) => {
            const phone = t.phone || t.threadId;
            const selected = activeThread === phone;
            return (
              <button key={t.threadId} type="button" onMouseEnter={() => void prefetchThread(phone)} onClick={() => { setActiveThread(phone); updateThreadCacheOrder(phone); }} className={`w-full text-left px-2.5 py-2 rounded-lg ${selected ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}>
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs truncate">{phone}</span>
                  <span className="text-[10px] text-slate-400">{formatTime(t.updatedAt)}</span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{t.lastMessage || 'No messages yet'}</p>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
          <form onSubmit={handleBulkSend} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end">
            <label className="text-xs text-slate-500">Message
              <textarea value={bulkMessage} onChange={(e) => setBulkMessage(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-slate-500">Recipients (comma/newline)
              <input value={bulkRecipients} onChange={(e) => setBulkRecipients(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm" />
            </label>
            <button type="submit" disabled={bulkSending || !bulkMessage.trim() || !bulkRecipients.trim()} className="h-10 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
              {bulkSending ? 'Queueing...' : 'Queue send'}
            </button>
          </form>
          {bulkRecipients.trim() && (
            <p className="text-xs text-slate-500 mt-1">
              Sending to {bulkRecipients.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).length} recipients
            </p>
          )}
          {bulkStatus && <p className="text-xs mt-1 text-indigo-600">{bulkStatus}</p>}
        </div>
        <UnifiedChat mode="campaign" threadPhone={activeThread} getThreadCache={getThreadCache} setThreadCache={setThreadCache} className="flex-1 min-h-0" />
      </main>

      <aside className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col min-h-0">
        <div className="p-2 border-b border-slate-200 dark:border-slate-700 flex gap-1">
          {['crm', 'automation', 'activity'].map((tab) => (
            <button key={tab} type="button" onClick={() => setRightTab(tab)} className={`px-3 py-1.5 text-xs rounded-lg font-semibold ${rightTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3 text-sm text-slate-600 dark:text-slate-300">
          {rightTab === 'crm' && <p>{activeThread ? `CRM details for ${activeThread}` : 'Select a conversation to view CRM details.'}</p>}
          {rightTab === 'automation' && <p>Automation rules and quick actions.</p>}
          {rightTab === 'activity' && <p>{activeThread ? 'Thread activity timeline.' : 'Select a conversation to view activity.'}</p>}
        </div>
      </aside>
    </div>
  );
}
