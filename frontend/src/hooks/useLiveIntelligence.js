import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import API from '../api';
import { viteApiOriginForSockets } from '../utils/viteApiBase';
import { liveSnapshotMatchesParams } from '../utils/analyticsRangeSync';

const POLL_INTERVAL_MS = 5000;
const DEFAULT_LIVE_WINDOW = '15m';

/**
 * Enterprise live intelligence hook — websocket snapshot stream with
 * filtered REST fallback and visitor detail fetch.
 */
export default function useLiveIntelligence(options = {}) {
  const {
    enabled = true,
    window = DEFAULT_LIVE_WINDOW,
    range = null,
    tzOffset = 0,
    startDate = null,
    endDate = null,
    search = '',
    filters = {},
    revealIp = false,
    page = 1,
    limit = 100
  } = options;

  const [intel, setIntel] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [loading, setLoading] = useState(true);
  const pollTimer = useRef(null);
  const requestKey = JSON.stringify({
    search,
    filters,
    revealIp,
    page,
    limit,
    window,
    range,
    tzOffset,
    startDate,
    endDate
  });

  const usesHistoricalRange = Boolean(range);
  const usesDefaultWindow = !usesHistoricalRange && window === DEFAULT_LIVE_WINDOW && !startDate && !endDate;

  const fetchIntel = useCallback(async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return null;
    const params = new URLSearchParams();
    if (range) {
      params.set('range', range);
      params.set('tzOffset', String(tzOffset));
    } else {
      params.set('window', window || DEFAULT_LIVE_WINDOW);
    }
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (search) params.set('search', search);
    if (page) params.set('page', String(page));
    if (limit) params.set('limit', String(limit));
    if (revealIp) params.set('revealIp', '1');
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v) params.set(k, '1');
    });
    const res = await API.get(`/api/analytics/admin/live/intelligence?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res?.data?.data || null;
  }, [search, filters, revealIp, page, limit, window, range, tzOffset, startDate, endDate]);

  const fetchVisitor = useCallback(async (sessionId, reveal = false) => {
    const token = localStorage.getItem('adminToken');
    if (!token || !sessionId) return null;
    const params = reveal ? '?revealIp=1' : '';
    const res = await API.get(
      `/api/analytics/admin/live/intelligence/visitor/${sessionId}${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res?.data?.data || null;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const token = localStorage.getItem('adminToken');
    if (!token) return undefined;

    let disposed = false;
    const liveParams = { window, range, tzOffset, startDate, endDate };

    const applySnapshot = (snap) => {
      if (!disposed && snap && liveSnapshotMatchesParams(snap, liveParams)) {
        setIntel(snap);
        setLoading(false);
      }
    };

    const startPolling = () => {
      if (pollTimer.current) return;
      const poll = async () => {
        try {
          const data = await fetchIntel();
          applySnapshot(data);
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

    setLoading(true);
    fetchIntel()
      .then((data) => {
        if (!disposed) {
          if (data) setIntel(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!disposed) setLoading(false);
      });

    const socket = io(viteApiOriginForSockets(import.meta.env.VITE_API_URL || ''), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token }
    });

    socket.on('connect', () => {
      if (disposed) return;
      setConnecting(false);
      setConnected(true);
      if (usesDefaultWindow) stopPolling();
      else startPolling();
    });

    socket.on('admin:live_intelligence', (payload) => {
      if (disposed || !payload) return;
      if (!usesDefaultWindow) return;
      if (payload.type === 'snapshot' || payload.kpis) {
        applySnapshot(payload);
      }
    });

    socket.on('admin:analytics_live', () => {
      /* legacy — overview strip uses separate hook */
    });

    socket.on('disconnect', () => {
      if (disposed) return;
      setConnected(false);
      setConnecting(false);
      startPolling();
    });

    socket.on('connect_error', () => {
      if (disposed) return;
      setConnected(false);
      setConnecting(false);
      startPolling();
    });

    if (!usesDefaultWindow) startPolling();

    return () => {
      disposed = true;
      stopPolling();
      socket.disconnect();
    };
  }, [enabled, requestKey, fetchIntel, usesDefaultWindow, window, range, tzOffset, startDate, endDate]);

  return { intel, connected, connecting, loading, fetchIntel, fetchVisitor, refresh: fetchIntel };
}
