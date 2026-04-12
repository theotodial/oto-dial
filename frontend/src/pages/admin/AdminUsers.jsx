import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import API from '../../api';

const LIVE_LIMIT = 12;

function formatPlanLabel(user) {
  if (user.customPackage?.overridePlan || user.subscription?.status === 'custom_override') {
    return 'Custom Package';
  }
  return user.subscription?.planName || user.subscriptionPlan || 'No plan';
}

function classifyUser(user) {
  const subscriptionStatus = user.subscription?.status || user.subscriptionStatus || 'none';
  if (user.status === 'banned' || user.status === 'suspended') return 'blocked';
  if (!user.subscription && !user.customPackage) return 'no_subscription';
  if (['active', 'trialing', 'pending_activation', 'past_due', 'custom_override'].includes(subscriptionStatus)) {
    return 'active';
  }
  return 'all';
}

function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [liveCalls, setLiveCalls] = useState([]);
  const [liveSms, setLiveSms] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchUsers();
  }, [page, debouncedSearch, activeTab]);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) return undefined;

    const socket = io(import.meta.env.VITE_API_URL || window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token }
    });

    socket.on('admin:live_snapshot', (snapshot) => {
      setLiveCalls(snapshot?.calls || []);
      setLiveSms(snapshot?.sms || []);
    });

    socket.on('admin:live_calls', (event) => {
      setLiveCalls((prev) => [event, ...prev].slice(0, LIVE_LIMIT));
    });

    socket.on('admin:live_sms', (event) => {
      setLiveSms((prev) => [event, ...prev].slice(0, LIVE_LIMIT));
    });

    socket.on('connect_error', (socketError) => {
      console.warn('Admin live feed unavailable:', socketError?.message || socketError);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      params.append('filter', activeTab);
      params.append('page', page);
      params.append('limit', '20');
      
      const response = await API.get(`/api/admin/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        setUsers(response.data.users || []);
        setTotalPages(response.data.pages || response.data.pagination?.pages || 1);
        setTotalUsers(response.data.total || response.data.pagination?.total || 0);
      } else {
        setError('Failed to load users');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      } else {
        setError(err.response?.data?.error || 'Failed to load users');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/adminbobby');
  };

  const handleUserClick = (userId) => {
    navigate(`/adminbobby/users/${userId}`);
  };

  const filteredUsers = users;

  if (loading && users.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      {/* Header removed - navigation is in sidebar */}
      <header className="hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users Management</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Manage all users</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/adminbobby/dashboard')}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Dashboard
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Search and Create */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-4 mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email, name, or ID..."
            className="flex-1 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Create New User
          </button>
        </div>

        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredUsers.length} users on this page. Total matched users: {totalUsers}.
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Tabs for User Categories */}
        <div className="mb-6 border-b border-gray-200 dark:border-slate-700">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'all'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              All Users
            </button>
            <button
              onClick={() => setActiveTab('active')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'active'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setActiveTab('no_subscription')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'no_subscription'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              No Subscription
            </button>
            <button
              onClick={() => setActiveTab('blocked')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'blocked'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Blocked
            </button>
          </nav>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Live Calls</h3>
            <div className="space-y-3">
              {liveCalls.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">No recent live call events.</div>
              ) : liveCalls.map((event, idx) => (
                <div key={`${event.callId || idx}-${event.at}`} className="text-sm border-b border-gray-100 dark:border-slate-700 pb-2 last:border-b-0">
                  <div className="font-medium text-gray-900 dark:text-white">{event.actor?.email || 'Unknown user'}</div>
                  <div className="text-gray-600 dark:text-gray-400">{event.destination || 'Unknown destination'} • {event.status || event.eventType}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">{event.durationSeconds || 0}s • {new Date(event.at).toLocaleTimeString()}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Live SMS</h3>
            <div className="space-y-3">
              {liveSms.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">No recent live SMS events.</div>
              ) : liveSms.map((event, idx) => (
                <div key={`${event.messageId || idx}-${event.at}`} className="text-sm border-b border-gray-100 dark:border-slate-700 pb-2 last:border-b-0">
                  <div className="font-medium text-gray-900 dark:text-white">{event.actor?.email || 'Unknown user'}</div>
                  <div className="text-gray-600 dark:text-gray-400">{event.destination || 'Unknown destination'} • {event.status || event.eventType}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">{event.bodyPreview || 'No preview'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Plan / Custom</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Minutes Left</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">SMS Left</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => handleUserClick(user.id)}
                  className="hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{user.email}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{user.name || 'Unnamed user'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{user.id.toString().slice(-8)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">{formatPlanLabel(user)}</div>
                    {user.customPackage ? (
                      <div className="text-xs text-indigo-600 dark:text-indigo-400">Custom override attached</div>
                    ) : (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{user.subscription?.planType || 'No subscription'}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {user.subscription?.isUnlimited ? 'Unlimited' : Number(user.subscription?.minutesRemaining || 0).toFixed(1)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {user.subscription?.isUnlimited ? 'Unlimited' : Number(user.subscription?.smsRemaining || 0)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                      user.status === 'active' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                      user.status === 'suspended' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                      user.status === 'banned' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                    }`}>
                      {user.status || 'unknown'}
                    </span>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {user.subscription?.status || 'no subscription'} • {user.isEmailVerified ? 'verified' : 'unverified'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No users in this category
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-gray-700 dark:text-gray-300">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post('/api/admin/users', {
        name,
        email,
        password
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        onSuccess();
      } else {
        setError(response.data?.error || 'Failed to create user');
      }
    } catch (err) {
      setError(err?.error || err?.response?.data?.error || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Create New User</h2>
        
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminUsers;
