import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API from '../../api';
import { notifySubscriptionChanged } from '../../utils/subscriptionSync';
import { threadMatchesPeerPhone } from '../../utils/phoneThreadMatch';
import { OTODIAL_SMS_OUTBOUND_EVENT } from '../../constants/smsOutboundEvents';

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function deliveryLabel(status, direction) {
  if (direction === 'inbound') return null;
  const s = String(status || '').toLowerCase();
  if (s === 'failed') return 'Failed';
  if (s === 'queued') return 'Queued';
  if (s === 'sent' || s === 'delivered') return 'Sent';
  return s || null;
}

function outboundLooksInFlight(item) {
  const isOutbound = item.direction === 'outbound' || item.sender === 'user';
  if (!isOutbound) return false;
  const st = String(item.status || '').toLowerCase();
  return st === 'queued' || st === 'sending';
}

const MessageList = memo(function MessageList({ messages, loading }) {
  if (loading && messages.length === 0) {
    return <div className="text-center text-slate-500 dark:text-slate-400 text-sm py-12">Loading messages...</div>;
  }
  if (messages.length === 0) {
    return <div className="text-center text-slate-500 dark:text-slate-400 text-sm py-12">No messages yet.</div>;
  }
  return messages.map((item, idx) => {
    const isOutbound = item.direction === 'outbound' || item.sender === 'user';
    const modPending = isOutbound && String(item.moderationStatus || '').toLowerCase() === 'pending';
    const isPending =
      Boolean(item._localPending) ||
      item.status === 'sending' ||
      outboundLooksInFlight(item) ||
      modPending;
    const del = isPending ? null : deliveryLabel(item.status, item.direction);
    return (
      <div key={`msg-${item.id || idx}`} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[75%] rounded-2xl px-4 py-2 ${
            isOutbound
              ? 'bg-indigo-600 text-white'
              : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-600'
          } ${isPending ? 'opacity-95 ring-1 ring-indigo-300/50 dark:ring-indigo-500/30' : ''}`}
        >
          <p className="text-sm whitespace-pre-wrap break-words">{item.message || item.body || item.text}</p>
          <div
            className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs mt-1 ${
              isOutbound ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span>{formatDate(item.timestamp || item.created_at || item.createdAt)}</span>
            {(item.smsCostInfo?.costDeducted ?? null) !== null && (
              <span className="opacity-90">· Cost: {Number(item.smsCostInfo.costDeducted || 0)} SMS credits</span>
            )}
            {isOutbound && isPending && (
              <span className="opacity-95">· {modPending ? 'Pending approval' : 'Sending...'}</span>
            )}
            {isOutbound && del && <span className="opacity-90">· {del}</span>}
          </div>
        </div>
      </div>
    );
  });
});

export default function UnifiedChat({ mode = 'campaign', threadPhone, pollKey = 0, getThreadCache, setThreadCache, className = '', insertSignal = null }) {
  const [chatItems, setChatItems] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollerRef = useRef(null);
  const sendInFlightRef = useRef(false);
  const threadPhoneRef = useRef(threadPhone);
  const scrollDebounceRef = useRef(null);
  const smsSendIdempotencyKeyRef = useRef(null);
  const lastInsertIdRef = useRef(null);
  threadPhoneRef.current = threadPhone;

  const fetchMessages = useCallback(
    async (phoneNumber, options = {}) => {
      if (!phoneNumber) return;
      const cursor = options.cursor || null;
      const response = await API.get('/api/messages', {
        params: {
          thread: phoneNumber,
          limit: 30,
          ...(cursor ? { cursor } : {}),
        },
      }).catch(() => ({ error: true, data: null }));
      if (response.error || threadPhoneRef.current !== phoneNumber) return;
      const rows = response.data?.messages || [];
      setNextCursor(response.data?.nextCursor || null);
      setChatItems((prev) => {
        const merged = cursor ? [...rows, ...prev] : rows;
        setThreadCache?.(phoneNumber, merged);
        return merged;
      });
      console.log('MESSAGES LOADED:', rows.length);
      if (!options.silent) setChatLoading(false);
    },
    [setThreadCache]
  );

  useEffect(() => {
    if (!insertSignal?.id || insertSignal.id === lastInsertIdRef.current) return;
    lastInsertIdRef.current = insertSignal.id;
    const t = String(insertSignal.text || '').trim();
    if (!t) return;
    setInputMessage((m) => (m ? `${m}\n${t}` : t));
  }, [insertSignal]);

  useEffect(() => {
    if (!threadPhone) {
      setChatItems([]);
      setNextCursor(null);
      setChatLoading(false);
      return;
    }
    const cached = getThreadCache?.(threadPhone);
    setChatItems(cached?.length ? cached : []);
    setChatLoading(true);
    setNextCursor(null);
    void fetchMessages(threadPhone, { silent: false });
  }, [threadPhone, fetchMessages, getThreadCache]);

  useEffect(() => {
    if (!threadPhone || pollKey < 1) return;
    void fetchMessages(threadPhone, { silent: true });
  }, [pollKey, threadPhone, fetchMessages]);

  useEffect(() => {
    const onLifecycle = (e) => {
      const d = e.detail;
      if (!d?.to) return;
      const tp = threadPhoneRef.current;
      if (!tp || !threadMatchesPeerPhone(tp, d.to)) return;
      void fetchMessages(tp, { silent: true });
      if (d.phase === 'sent' || d.phase === 'failed') notifySubscriptionChanged();
    };
    window.addEventListener(OTODIAL_SMS_OUTBOUND_EVENT, onLifecycle);
    return () => window.removeEventListener(OTODIAL_SMS_OUTBOUND_EVENT, onLifecycle);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatItems.length]);

  const loadOlder = useCallback(async () => {
    if (!threadPhone || !nextCursor || loadingOlder) return;
    const scroller = scrollerRef.current;
    const prevHeight = scroller?.scrollHeight || 0;
    setLoadingOlder(true);
    await fetchMessages(threadPhone, { silent: true, cursor: nextCursor });
    requestAnimationFrame(() => {
      if (scroller) {
        scroller.scrollTop = Math.max(0, scroller.scrollHeight - prevHeight);
      }
      setLoadingOlder(false);
    });
  }, [fetchMessages, loadingOlder, nextCursor, threadPhone]);

  const onScroll = useCallback(() => {
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      if (scrollerRef.current?.scrollTop <= 40) void loadOlder();
    }, 100);
  }, [loadOlder]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!threadPhone || !inputMessage.trim() || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    const messageText = inputMessage.trim();
    setInputMessage('');
    const optimisticId = `local-${Date.now()}`;
    const nowIso = new Date().toISOString();
    setChatItems((prev) => [
      ...prev,
      {
        id: optimisticId,
        _localPending: true,
        direction: 'outbound',
        status: 'queued',
        message: messageText,
        timestamp: nowIso,
      },
    ]);
    const genIdem = () =>
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sms-${Date.now()}`;
    const idempotencyKey = smsSendIdempotencyKeyRef.current ?? genIdem();
    smsSendIdempotencyKeyRef.current = idempotencyKey;
    const response = await API.post('/api/sms/send', { to: threadPhone, text: messageText, idempotencyKey }, { timeout: 90000 });
    if (response.error) {
      setChatItems((prev) => prev.filter((x) => x.id !== optimisticId));
      setInputMessage(messageText);
      setSendError(response.error);
    } else {
      const apiStatus = String(response.data?.status || '').toLowerCase();
      if (apiStatus === 'failed') {
        setChatItems((prev) => prev.filter((x) => x.id !== optimisticId));
        setSendError('This message could not be sent.');
      } else {
        smsSendIdempotencyKeyRef.current = null;
        await fetchMessages(threadPhone, { silent: true });
        notifySubscriptionChanged();
      }
    }
    sendInFlightRef.current = false;
  };

  const renderItems = useMemo(() => chatItems.slice(Math.max(0, chatItems.length - 300)), [chatItems]);

  if (!threadPhone) {
    return <div className={`flex flex-1 items-center justify-center text-sm text-slate-500 ${className}`}>Pick a chat to start messaging.</div>;
  }

  return (
    <div className={`flex flex-1 flex-col min-h-0 min-w-0 ${className}`} data-chat-mode={mode}>
      <div ref={scrollerRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-gray-50 dark:bg-slate-900">
        {loadingOlder && <div className="text-center text-slate-500 dark:text-slate-400 text-xs py-1">Loading older messages...</div>}
        <MessageList messages={renderItems} loading={chatLoading} />
        <div ref={messagesEndRef} />
      </div>
      {sendError && <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">{sendError}</div>}
      <div className="p-3 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-[#0d0d0d]">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 rounded-full text-[15px] leading-snug focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-[#111111] dark:bg-[#1a1a1a] border border-slate-600/90 dark:border-slate-600 text-white placeholder:text-slate-500"
          />
          <button type="submit" disabled={!inputMessage.trim()} className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full disabled:opacity-50">
            <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
