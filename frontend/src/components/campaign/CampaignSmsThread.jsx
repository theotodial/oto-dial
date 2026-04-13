import { useCallback, useEffect, useRef, useState } from 'react';
import API from '../../api';
import { notifySubscriptionChanged } from '../../utils/subscriptionSync';

function normalizePhone(num) {
  return String(num || '').replace(/\D/g, '');
}

function formatDuration(seconds) {
  const s = Number(seconds) || 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}m ${r}s` : `${r}s`;
}

function formatDate(date) {
  if (!date) return '';
  try {
    const now = new Date();
    const callDate = new Date(date);
    if (Number.isNaN(callDate.getTime())) return '';
    const diffMs = now - callDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''}`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (diffDays < 7) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `${days[callDate.getDay()]}, ${months[callDate.getMonth()]} ${callDate.getDate()}`;
    }
    return `${months[callDate.getMonth()]} ${callDate.getDate()}`;
  } catch {
    return '';
  }
}

const PhoneInIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
    />
  </svg>
);

const PhoneOutIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 3h5m0 0v5m0-5l-6 6M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
    />
  </svg>
);

function deliveryLabel(status, direction) {
  if (direction === 'inbound') return null;
  const s = String(status || '').toLowerCase();
  if (s === 'failed') return 'Failed';
  if (s === 'queued') return 'Pending';
  if (s === 'sent' || s === 'delivered') return 'Sent';
  return s || null;
}

/**
 * Same thread loading pattern as Recents: /api/messages?thread= + /api/calls?thread=,
 * read-state on open, send via /api/sms/send.
 */
export default function CampaignSmsThread({
  threadPhone,
  pollKey = 0,
  className = '',
  getThreadCache,
  setThreadCache,
  /** { id: number, text: string } — bump id to append text into the composer */
  insertSignal = null,
}) {
  const messagesEndRef = useRef(null);
  const isMountedRef = useRef(true);
  const lastInsertIdRef = useRef(null);
  const [userNumbers, setUserNumbers] = useState([]);
  const [chatItems, setChatItems] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!insertSignal?.id || insertSignal.id === lastInsertIdRef.current) return;
    lastInsertIdRef.current = insertSignal.id;
    const t = String(insertSignal.text || '').trim();
    if (!t) return;
    setInputMessage((m) => (m ? `${m}\n${t}` : t));
  }, [insertSignal]);

  useEffect(() => {
    const load = async () => {
      try {
        const numbersRes = await API.get('/api/numbers');
        if (!isMountedRef.current || numbersRes.error) return;
        setUserNumbers(numbersRes.data?.numbers || numbersRes.data || []);
      } catch {
        /* ignore */
      }
    };
    load();
  }, []);

  const fetchChatMessages = useCallback(async (phoneNumber) => {
    if (!phoneNumber) return;
    try {
      const normalizedSelected = normalizePhone(phoneNumber);
      const [messagesResponse, callsResponse] = await Promise.all([
        API.get('/api/messages', { params: { thread: phoneNumber, limit: 100 } }).catch(() => ({
          error: true,
          data: null,
        })),
        API.get('/api/calls', { params: { thread: phoneNumber, limit: 100 } }).catch(() => ({
          error: true,
          data: null,
        })),
      ]);
      const allItems = [];
      if (messagesResponse.data?.messages) {
        const filteredMessages = messagesResponse.data.messages
          .filter((msg) => {
            const msgPhone = msg.phone_number || msg.to || msg.from;
            return normalizedSelected === normalizePhone(msgPhone);
          })
          .map((msg) => ({
            ...msg,
            type: 'message',
            timestamp: msg.created_at || msg.timestamp || msg.createdAt,
          }));
        allItems.push(...filteredMessages);
      }
      if (callsResponse.data?.calls || callsResponse.data) {
        const callsList = callsResponse.data?.calls || callsResponse.data || [];
        const filteredCalls = callsList
          .filter((call) => {
            const callToPhone = call.to_number || call.toNumber || call.phoneNumber;
            const callFromPhone = call.from_number || call.fromNumber;
            return (
              normalizedSelected === normalizePhone(callToPhone) ||
              (callFromPhone && normalizedSelected === normalizePhone(callFromPhone))
            );
          })
          .map((call) => ({
            ...call,
            type: 'call',
            timestamp: call.createdAt || call.created_at || call.timestamp || call.date,
            duration: call.durationSeconds ?? call.duration ?? call.call_duration ?? null,
            durationSeconds: call.durationSeconds ?? call.duration ?? call.call_duration ?? null,
            status: call.status || 'completed',
            direction:
              call.direction || (call.from_number || call.fromNumber ? 'outbound' : 'inbound'),
          }));
        allItems.push(...filteredCalls);
      }
      allItems.sort((a, b) => {
        const dateA = new Date(a.timestamp || 0);
        const dateB = new Date(b.timestamp || 0);
        return dateA - dateB;
      });
      if (isMountedRef.current) {
        setChatItems(allItems);
        setThreadCache?.(phoneNumber, allItems);
      }
    } catch (err) {
      console.error('Failed to fetch chat messages:', err);
    }
  }, [setThreadCache]);

  useEffect(() => {
    if (threadPhone) {
      const cached = getThreadCache?.(threadPhone);
      if (cached?.length) setChatItems(cached);
      fetchChatMessages(threadPhone);
      API.post('/api/messages/read-state', { phoneNumber: threadPhone }).catch(() => {});
    } else {
      setChatItems([]);
    }
  }, [threadPhone, fetchChatMessages, pollKey, getThreadCache]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatItems]);

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputMessage.trim() || sending || !threadPhone) return;

    if (userNumbers.length === 0) {
      setSendError('You need to purchase a number first.');
      return;
    }

    const messageText = inputMessage.trim();
    setInputMessage('');
    setSending(true);
    setSendError('');

    try {
      const response = await API.post('/api/sms/send', {
        to: threadPhone,
        text: messageText,
      });

      if (response.error) {
        setSendError(response.error);
        setInputMessage(messageText);
      } else {
        notifySubscriptionChanged();
        await fetchChatMessages(threadPhone);
      }
    } catch {
      setSendError('Failed to send message. Please try again.');
      setInputMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  if (!threadPhone) {
    return (
      <div
        className={`flex flex-1 flex-col items-center justify-center text-slate-500 dark:text-slate-400 text-sm p-6 text-center ${className}`}
      >
        <p>Open a tab (+ add) or tap a campaign recipient to view the thread.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-1 flex-col min-h-0 min-w-0 ${className}`}>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-gray-50 dark:bg-slate-900">
        {chatItems.length === 0 ? (
          <div className="text-center text-slate-500 dark:text-slate-400 text-sm py-12">
            No messages yet — start the conversation below.
          </div>
        ) : (
          chatItems.map((item, idx) => {
            if (item.type === 'call') {
              const isOutbound = item.direction === 'outbound';
              const isMissed = (item.status || '') === 'missed';
              const isFailed = (item.status || '') === 'failed';
              const durationSeconds = item.duration || item.durationSeconds || 0;
              const durationStr = formatDuration(durationSeconds);
              const ts = item.timestamp || item.createdAt || item.created_at;
              let callLabel = 'Voice call';
              if (isMissed) callLabel = 'Missed call';
              else if (isFailed) callLabel = 'Failed call';
              else if (isOutbound) callLabel = 'Outgoing call';
              else callLabel = 'Incoming call';
              return (
                <div
                  key={`call-${item.id || idx}`}
                  className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 border ${
                      isMissed || isFailed
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                        : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {isOutbound ? <PhoneOutIcon /> : <PhoneInIcon />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{callLabel}</p>
                        <p className="text-xs text-inherit opacity-90">Duration: {durationStr}</p>
                        <p className="text-xs text-inherit opacity-80 mt-0.5">{formatDate(ts)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            const isOutbound = item.direction === 'outbound' || item.sender === 'user';
            const del = deliveryLabel(item.status, item.direction);
            return (
              <div
                key={`msg-${item.id || idx}`}
                className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    isOutbound
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  {item.campaignId && (
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide block mb-0.5 ${
                        isOutbound ? 'text-indigo-200' : 'text-indigo-600 dark:text-indigo-300'
                      }`}
                    >
                      Campaign
                    </span>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {item.message || item.body || item.text}
                  </p>
                  <div
                    className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs mt-1 ${
                      isOutbound ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span>{formatDate(item.timestamp || item.created_at)}</span>
                    {isOutbound && del && <span className="opacity-90">· {del}</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      {sendError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm flex-shrink-0">
          {sendError}
        </div>
      )}
      <div className="p-3 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-[#0d0d0d] flex-shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] dark:shadow-none">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            placeholder="Type a message…"
            className="flex-1 px-4 py-2.5 rounded-full text-[15px] leading-snug focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-[#111111] dark:bg-[#1a1a1a] border border-slate-600/90 dark:border-slate-600 text-white placeholder:text-slate-500 placeholder:opacity-90"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || sending}
            className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
