import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminNavCounts } from '../../context/AdminNavCountsContext';
import AdminNavBadge from './AdminNavBadge';

const BellIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
    />
  </svg>
);

const SoundOnIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H4a1 1 0 00-1 1v4a1 1 0 001 1h2l5 4V5z"
    />
  </svg>
);

const SoundOffIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l4-4m0 4l-4-4" />
  </svg>
);

const TYPE_LABELS = {
  sale: 'Payment',
  number_purchase: 'Number bought',
  support: 'Support',
  identity_verification: 'ID verification',
};

function notificationHref(notification) {
  const type = notification?.type;
  const data = notification?.data || {};

  if (type === 'sale') return '/adminbobby/stripe';
  if (type === 'number_purchase') return '/adminbobby/numbers';
  if (type === 'support') {
    const ticketId = data.ticketId;
    return ticketId ? `/adminbobby/support?ticket=${ticketId}` : '/adminbobby/support';
  }
  if (type === 'identity_verification') {
    const userId = data.userId;
    return userId ? `/adminbobby/support?tab=kyc&user=${userId}` : '/adminbobby/support?tab=kyc';
  }
  return '/adminbobby/notifications';
}

function formatRelativeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function AdminNotificationBell() {
  const { counts, markNotificationRead, soundMuted, toggleNotificationSound } = useAdminNavCounts();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const unreadCount = counts.bell?.unreadCount || 0;
  const notifications = counts.bell?.notifications || [];

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleBellClick = () => {
    setOpen((prev) => !prev);
  };

  const handleNotificationClick = async (notification) => {
    if (!notification?.isRead && notification?._id) {
      await markNotificationRead(notification._id);
    }
    setOpen(false);
  };

  return (
    <div className="relative ml-auto" ref={rootRef}>
      <button
        type="button"
        onClick={handleBellClick}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        aria-label="Admin notifications"
        aria-expanded={open}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1">
            <AdminNavBadge count={unreadCount} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void toggleNotificationSound();
                }}
                className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                {soundMuted ? <SoundOffIcon /> : <SoundOnIcon />}
                <span>{soundMuted ? 'Sound off' : 'Sound on'}</span>
              </button>
              <Link
                to="/adminbobby/notifications"
                onClick={() => setOpen(false)}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                View all
              </Link>
            </div>
          </div>

          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700">
            {notifications.length === 0 ? (
              <li className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">
                No recent notifications
              </li>
            ) : (
              notifications.map((notification) => (
                <li key={notification._id}>
                  <Link
                    to={notificationHref(notification)}
                    onClick={() => handleNotificationClick(notification)}
                    className={`block px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors ${
                      notification.isRead ? 'opacity-75' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!notification.isRead && (
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                            {TYPE_LABELS[notification.type] || notification.type}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {notification.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default AdminNotificationBell;
