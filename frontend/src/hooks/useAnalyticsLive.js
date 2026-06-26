import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import API from '../api';
import { viteApiOriginForSockets } from '../utils/viteApiBase';

const POLL_INTERVAL_MS = 10000;

/**
 * useAnalyticsLive
 *
 * Subscribes to the realtime analytics stream over the existing admin
 * socket.io room. Falls back to polling /api/analytics/admin/live when the
 * socket connection is unavailable.
 */
export default function useAnalyticsLive() {
  const [live, setLive] = useState(null);
  const [connected, setConnected] = useState(false);
  const pollTimer = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) return undefined;

    let disposed = false;

    const startPolling = () => {
      if (pollTimer.current) return;
      const poll = async () => {
        const res = await API.get('/api/analytics/admin/live', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!disposed && res?.data?.data) setLive(res.data.data);
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

    const socket = io(viteApiOriginForSockets(import.meta.env.VITE_API_URL || ''), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token }
    });

    socket.on('connect', () => {
      if (disposed) return;
      setConnected(true);
      stopPolling();
    });

    socket.on('admin:analytics_live', (snapshot) => {
      if (!disposed && snapshot) setLive(snapshot);
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
  }, []);

  return { live, connected };
}
