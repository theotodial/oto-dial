import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import API from '../api';
import { viteApiOriginForSockets } from '../utils/viteApiBase';

const DEFAULT_LIMIT = 200;
const POLL_INTERVAL_MS = 5000;

function mergeEvents(history = [], live = [], limit = DEFAULT_LIMIT) {
  const seen = new Set();
  const merged = [];

  for (const event of [...live, ...history]) {
    const key = event.kind === 'sms'
      ? `sms:${event.messageId || event.at}`
      : `call:${event.callId || event.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }

  return merged
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);
}

function filterEventsByTimeframe(events, startIso, endIso) {
  if (!startIso || !endIso) return events;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return events.filter((event) => {
    const at = new Date(event.at).getTime();
    return at >= start && at <= end;
  });
}

/**
 * Realtime admin call/SMS feed with REST fallback when the socket is down.
 */
export default function useAdminLiveFeed(options = {}) {
  const {
    enabled = true,
    limit = DEFAULT_LIMIT,
    window = '15m',
    startDate = null,
    endDate = null,
  } = options;

  const [liveCalls, setLiveCalls] = useState([]);
  const [liveSms, setLiveSms] = useState([]);
  const [stats, setStats] = useState(null);
  const [telnyx, setTelnyx] = useState(null);
  const [timeframe, setTimeframe] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncingTelnyx, setSyncingTelnyx] = useState(false);

  const pollTimer = useRef(null);
  const socketCallsRef = useRef([]);
  const socketSmsRef = useRef([]);
  const historyCallsRef = useRef([]);
  const historySmsRef = useRef([]);
  const timeframeRef = useRef(null);

  const windowKey = useMemo(
    () => JSON.stringify({ window, startDate, endDate }),
    [window, startDate, endDate]
  );

  const publishMergedEvents = useCallback(() => {
    const tf = timeframeRef.current;
    const filteredLiveCalls = filterEventsByTimeframe(socketCallsRef.current, tf?.start, tf?.end);
    const filteredLiveSms = filterEventsByTimeframe(socketSmsRef.current, tf?.start, tf?.end);
    setLiveCalls(mergeEvents(historyCallsRef.current, filteredLiveCalls, limit));
    setLiveSms(mergeEvents(historySmsRef.current, filteredLiveSms, limit));
  }, [limit]);

  const applyApiPayload = useCallback((payload) => {
    if (!payload) return;
    historyCallsRef.current = payload.history?.calls || [];
    historySmsRef.current = payload.history?.sms || [];
    timeframeRef.current = payload.timeframe || null;
    if (payload.stats) setStats(payload.stats);
    if (payload.telnyx) setTelnyx(payload.telnyx);
    if (payload.timeframe) setTimeframe(payload.timeframe);
    publishMergedEvents();
    setLoading(false);
  }, [publishMergedEvents]);

  const fetchSnapshot = useCallback(async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return null;

    const params = new URLSearchParams();
    params.set('window', window || '15m');
    if (window === 'custom' && startDate) params.set('startDate', startDate);
    if (window === 'custom' && endDate) params.set('endDate', endDate);

    const res = await API.get(`/api/admin/live-activity?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.data?.success) return null;
    return res.data;
  }, [window, startDate, endDate]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSnapshot();
      if (data) applyApiPayload(data);
    } catch {
      /* ignore */
    }
  }, [applyApiPayload, fetchSnapshot]);

  const syncTelnyx = useCallback(async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return null;

    setSyncingTelnyx(true);
    try {
      const params = new URLSearchParams();
      params.set('window', window || '15m');
      if (window === 'custom' && startDate) params.set('startDate', startDate);
      if (window === 'custom' && endDate) params.set('endDate', endDate);

      const res = await API.post(`/api/admin/live-activity/sync-telnyx?${params.toString()}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data?.success && res.data.telnyx) {
        setTelnyx(res.data.telnyx);
        if (res.data.timeframe) setTimeframe(res.data.timeframe);
      }

      const snapshot = await fetchSnapshot();
      if (snapshot) applyApiPayload(snapshot);

      return res.data;
    } finally {
      setSyncingTelnyx(false);
    }
  }, [window, startDate, endDate, fetchSnapshot, applyApiPayload]);

  useEffect(() => {
    socketCallsRef.current = [];
    socketSmsRef.current = [];
    historyCallsRef.current = [];
    historySmsRef.current = [];
    timeframeRef.current = null;
    setLiveCalls([]);
    setLiveSms([]);
    setStats(null);
    setTelnyx(null);
    setTimeframe(null);
    setLoading(true);
  }, [windowKey]);

  useEffect(() => {
    if (!enabled) return undefined;

    const token = localStorage.getItem('adminToken');
    if (!token) return undefined;

    let disposed = false;

    const startPolling = () => {
      if (pollTimer.current) return;
      const poll = async () => {
        try {
          const data = await fetchSnapshot();
          if (!disposed && data) applyApiPayload(data);
        } catch {
          /* ignore */
        }
      };
      poll();
      pollTimer.current = setInterval(poll, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };

    fetchSnapshot()
      .then((data) => {
        if (!disposed && data) applyApiPayload(data);
      })
      .catch(() => {
        if (!disposed) setLoading(false);
      });

    const socket = io(viteApiOriginForSockets(import.meta.env.VITE_API_URL || ''), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
    });

    socket.on('connect', () => {
      if (disposed) return;
      setConnected(true);
      stopPolling();
    });

    socket.on('admin:live_snapshot', (snapshot) => {
      if (disposed) return;
      socketCallsRef.current = (snapshot?.calls || []).slice(0, limit);
      socketSmsRef.current = (snapshot?.sms || []).slice(0, limit);
      publishMergedEvents();
    });

    socket.on('admin:live_calls', (event) => {
      if (disposed) return;
      socketCallsRef.current = [event, ...socketCallsRef.current].slice(0, limit);
      publishMergedEvents();
    });

    socket.on('admin:live_sms', (event) => {
      if (disposed) return;
      socketSmsRef.current = [event, ...socketSmsRef.current].slice(0, limit);
      publishMergedEvents();
    });

    socket.on('disconnect', () => {
      if (disposed) return;
      setConnected(false);
      startPolling();
    });

    socket.on('connect_error', () => {
      if (disposed) return;
      setConnected(false);
      startPolling();
    });

    return () => {
      disposed = true;
      stopPolling();
      socket.disconnect();
    };
  }, [enabled, limit, windowKey, fetchSnapshot, applyApiPayload, publishMergedEvents]);

  return {
    liveCalls,
    liveSms,
    stats,
    telnyx,
    timeframe,
    connected,
    loading,
    syncingTelnyx,
    refresh,
    syncTelnyx,
  };
}
