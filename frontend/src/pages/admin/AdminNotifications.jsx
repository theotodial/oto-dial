import { useEffect, useState } from 'react';
import API from '../../api';

function AdminNotifications() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await API.get('/api/admin/notifications');
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || response?.error || 'Failed to fetch notifications');
      }
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
    } catch (err) {
      setError(err.message || 'Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      const response = await API.patch(`/api/admin/notifications/${id}/read`, {});
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || response?.error || 'Failed to mark as read');
      }
      setNotifications((prev) =>
        prev.map((notification) =>
          notification._id === id
            ? { ...notification, isRead: true, readAt: new Date().toISOString() }
            : notification
        )
      );
      setUnreadCount((prev) => Math.max(prev - 1, 0));
    } catch (err) {
      setError(err.message || 'Failed to mark as read');
    }
  };

  const markAllRead = async () => {
    try {
      const response = await API.patch('/api/admin/notifications/read-all', {});
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || response?.error || 'Failed to mark all as read');
      }
      setNotifications((prev) =>
        prev.map((notification) => ({
          ...notification,
          isRead: true,
          readAt: new Date().toISOString()
        }))
      );
      setUnreadCount(0);
    } catch (err) {
      setError(err.message || 'Failed to mark all as read');
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-700 dark:text-gray-200">Loading notifications...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Notifications</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Track sales, support, blog events, and affiliate approval requests.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
            {unreadCount} unread
          </span>
          <button
            onClick={markAllRead}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Mark all as read
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
            No notifications yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {notifications.map((notification) => (
              <li key={notification._id} className="p-4 md:p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                          notification.isRead
                            ? 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
                            : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                        }`}
                      >
                        {notification.type}
                      </span>
                      {!notification.isRead && (
                        <span className="text-xs text-indigo-600 dark:text-indigo-400">New</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {notification.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!notification.isRead && (
                    <button
                      onClick={() => markAsRead(notification._id)}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-sm"
                    >
                      Mark Read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default AdminNotifications;
