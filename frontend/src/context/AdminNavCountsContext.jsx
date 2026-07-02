import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import API from '../api';
import {
  alertAdminBellNotification,
  enableAdminNotificationAlerts,
  isAdminNotificationSoundMuted,
  setAdminNotificationSoundMuted,
} from '../utils/adminNotificationSound';
import { viteApiOriginForSockets } from '../utils/viteApiBase';

const POLL_VISIBLE_MS = 30000;
const POLL_HIDDEN_MS = 8000;

const defaultCounts = {
  users: 0,
  support: 0,
  openSupport: 0,
  pendingKyc: 0,
  notifications: 0,
  bell: { unreadCount: 0, notifications: [] },
};

const AdminNavCountsContext = createContext({
  counts: defaultCounts,
  loading: true,
  soundMuted: false,
  refresh: () => {},
  markNotificationRead: async () => {},
  acknowledgeSignupNotifications: async () => {},
  toggleNotificationSound: async () => {},
});

function getUnreadBellIds(bell = {}) {
  return new Set(
    (bell.notifications || [])
      .filter((notification) => !notification.isRead && notification._id)
      .map((notification) => String(notification._id))
  );
}

function applyCountsPayload(payload, { notifyIfNewBellAlerts, setCounts, setLoading }) {
  if (!payload?.success) return;
  const bell = payload.bell || defaultCounts.bell;
  notifyIfNewBellAlerts(bell);
  setCounts({
    users: payload.users || 0,
    support: payload.support || 0,
    openSupport: payload.openSupport || 0,
    pendingKyc: payload.pendingKyc || 0,
    notifications: payload.notifications || 0,
    bell,
  });
  setLoading(false);
}

export function AdminNavCountsProvider({ children }) {
  const [counts, setCounts] = useState(defaultCounts);
  const [loading, setLoading] = useState(true);
  const [soundMuted, setSoundMuted] = useState(() => isAdminNotificationSoundMuted());
  const bellSnapshotRef = useRef({ initialized: false, unreadCount: 0, ids: new Set() });
  const seenRealtimeIdsRef = useRef(new Set());

  const notifyIfNewBellAlerts = useCallback((bell) => {
    const nextUnreadCount = bell?.unreadCount || 0;
    const nextIds = getUnreadBellIds(bell);
    const prev = bellSnapshotRef.current;

    if (prev.initialized) {
      const newIds = [...nextIds].filter((id) => !prev.ids.has(id));
      const hasNewUnread = nextUnreadCount > prev.unreadCount || newIds.length > 0;

      if (hasNewUnread && !isAdminNotificationSoundMuted()) {
        const unalertedId = newIds.find((id) => !seenRealtimeIdsRef.current.has(id));
        if (unalertedId || nextUnreadCount > prev.unreadCount) {
          const latest =
            (bell.notifications || []).find(
              (notification) => !notification.isRead && String(notification._id) === unalertedId
            ) ||
            (bell.notifications || []).find((notification) => !notification.isRead) ||
            null;

          alertAdminBellNotification(latest || {
            title: 'New OTODIAL notification',
            message: 'You have a new admin alert',
          });

          newIds.forEach((id) => seenRealtimeIdsRef.current.add(id));
        }
      }
    }

    bellSnapshotRef.current = {
      initialized: true,
      unreadCount: nextUnreadCount,
      ids: nextIds,
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await API.get('/api/admin/nav-counts');
      applyCountsPayload(response?.data, {
        notifyIfNewBellAlerts,
        setCounts,
        setLoading,
      });
    } catch {
      // Keep previous counts on transient errors.
    } finally {
      setLoading(false);
    }
  }, [notifyIfNewBellAlerts]);

  const handleRealtimeBellNotification = useCallback(
    (payload) => {
      const notification = payload?.notification;
      const id = notification?._id ? String(notification._id) : '';
      if (id && seenRealtimeIdsRef.current.has(id)) return;
      if (id) seenRealtimeIdsRef.current.add(id);

      if (!isAdminNotificationSoundMuted()) {
        alertAdminBellNotification(notification);
      }

      refresh();
    },
    [refresh]
  );

  const markNotificationRead = useCallback(async (id) => {
    try {
      const response = await API.patch(`/api/admin/notifications/${id}/read`, {});
      if (!response?.data?.success) return;
      setCounts((prev) => {
        const bellNotifications = (prev.bell?.notifications || []).map((notification) =>
          notification._id === id
            ? { ...notification, isRead: true, readAt: new Date().toISOString() }
            : notification
        );
        const wasUnread = (prev.bell?.notifications || []).some(
          (notification) => notification._id === id && !notification.isRead
        );
        const nextBell = {
          unreadCount: wasUnread
            ? Math.max((prev.bell?.unreadCount || 0) - 1, 0)
            : prev.bell?.unreadCount || 0,
          notifications: bellNotifications,
        };
        bellSnapshotRef.current = {
          initialized: true,
          unreadCount: nextBell.unreadCount,
          ids: getUnreadBellIds(nextBell),
        };
        return {
          ...prev,
          notifications: wasUnread ? Math.max(prev.notifications - 1, 0) : prev.notifications,
          bell: nextBell,
        };
      });
    } catch {
      // Ignore — next poll will reconcile.
    }
  }, []);

  const acknowledgeSignupNotifications = useCallback(async () => {
    try {
      const response = await API.patch('/api/admin/notifications/read-by-type/signup', {});
      if (!response?.data?.success) return;
      setCounts((prev) => ({ ...prev, users: 0 }));
      await refresh();
    } catch {
      // Ignore.
    }
  }, [refresh]);

  const toggleNotificationSound = useCallback(async () => {
    if (soundMuted) {
      await enableAdminNotificationAlerts();
      setSoundMuted(false);
      return;
    }
    setAdminNotificationSoundMuted(true);
    setSoundMuted(true);
  }, [soundMuted]);

  useEffect(() => {
    refresh();

    let intervalId;
    const schedulePoll = () => {
      if (intervalId) clearInterval(intervalId);
      const delay = document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS;
      intervalId = setInterval(refresh, delay);
    };

    schedulePoll();
    const onVisibility = () => schedulePoll();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) return undefined;

    const socket = io(viteApiOriginForSockets(import.meta.env.VITE_API_URL || ''), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
    });

    socket.on('admin:bell_notification', handleRealtimeBellNotification);

    return () => {
      socket.off('admin:bell_notification', handleRealtimeBellNotification);
      socket.disconnect();
    };
  }, [handleRealtimeBellNotification]);

  const value = useMemo(
    () => ({
      counts,
      loading,
      soundMuted,
      refresh,
      markNotificationRead,
      acknowledgeSignupNotifications,
      toggleNotificationSound,
    }),
    [
      counts,
      loading,
      soundMuted,
      refresh,
      markNotificationRead,
      acknowledgeSignupNotifications,
      toggleNotificationSound,
    ]
  );

  return (
    <AdminNavCountsContext.Provider value={value}>
      {children}
    </AdminNavCountsContext.Provider>
  );
}

export function useAdminNavCounts() {
  return useContext(AdminNavCountsContext);
}

export default AdminNavCountsContext;
