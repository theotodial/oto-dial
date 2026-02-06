import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api';

function AdminTeam() {
  const navigate = useNavigate();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteData, setInviteData] = useState({ email: '', name: '', role: 'view_only' });
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.get('/api/admin/team', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        setAdmins(response.data.admins || []);
      } else {
        setError('Failed to load admin team');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      } else {
        setError(err.response?.data?.error || 'Failed to load admin team');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteData.email || !inviteData.name) {
      alert('Email and name are required');
      return;
    }

    setInviting(true);
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post('/api/admin/team/invite', inviteData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        alert(`Admin invited successfully!\n\nTemporary password: ${response.data.admin.tempPassword}\n\nPlease share this securely with the new admin.`);
        setShowInviteModal(false);
        setInviteData({ email: '', name: '', role: 'view_only' });
        await fetchAdmins();
      } else {
        alert(response.data?.error || 'Failed to invite admin');
      }
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to invite admin');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (adminId, newRole) => {
    if (!confirm(`Change admin role to ${newRole}?`)) return;

    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.put(`/api/admin/team/${adminId}`, { role: newRole }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        alert('Admin role updated successfully');
        await fetchAdmins();
      } else {
        alert(response.data?.error || 'Failed to update admin');
      }
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to update admin');
    }
  };

  const handleToggleActive = async (adminId, isActive) => {
    if (!confirm(`${isActive ? 'Deactivate' : 'Activate'} this admin?`)) return;

    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.put(`/api/admin/team/${adminId}`, { isActive: !isActive }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        alert(`Admin ${!isActive ? 'activated' : 'deactivated'} successfully`);
        await fetchAdmins();
      } else {
        alert(response.data?.error || 'Failed to update admin');
      }
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to update admin');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading admin team...</p>
        </div>
      </div>
    );
  }

  const roleColors = {
    super_admin: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
    admin: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
    view_only: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300',
    stats_only: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
    edit_only: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    support_only: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      {/* Header removed - navigation is in sidebar */}
      <header className="hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/adminbobby/dashboard')}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-2">
                <img src="/logo.svg" alt="OTO DIAL" className="w-8 h-8" />
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Admin Team</h1>
              </div>
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
            >
              Invite Admin
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Login</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                {admins.map((admin) => (
                  <tr key={admin._id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{admin.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500 dark:text-gray-400">{admin.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={admin.role}
                        onChange={(e) => handleUpdateRole(admin._id, e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full ${roleColors[admin.role] || roleColors.view_only}`}
                      >
                        <option value="super_admin">Super Admin</option>
                        <option value="admin">Admin</option>
                        <option value="view_only">View Only</option>
                        <option value="stats_only">Stats Only</option>
                        <option value="edit_only">Edit Only</option>
                        <option value="support_only">Support Only</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        admin.isActive
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                      }`}>
                        {admin.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {admin.lastLogin
                        ? new Date(admin.lastLogin).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleToggleActive(admin._id, admin.isActive)}
                        className={`px-3 py-1 rounded-md text-xs font-medium ${
                          admin.isActive
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 hover:bg-red-200'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 hover:bg-green-200'
                        }`}
                      >
                        {admin.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Invite New Admin</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={inviteData.name}
                  onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
                  required
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={inviteData.email}
                  onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                  required
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Role
                </label>
                <select
                  value={inviteData.role}
                  onChange={(e) => setInviteData({ ...inviteData, role: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="view_only">View Only</option>
                  <option value="stats_only">Stats Only</option>
                  <option value="edit_only">Edit Only</option>
                  <option value="support_only">Support Only</option>
                </select>
              </div>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {inviting ? 'Inviting...' : 'Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminTeam;
