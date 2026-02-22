import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api';
import { clearStoredAdminProfile } from '../../utils/adminAccess';

const ROLE_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'users', label: 'Users' },
  { key: 'calls', label: 'Calls' },
  { key: 'sms', label: 'SMS' },
  { key: 'numbers', label: 'Numbers' },
  { key: 'support', label: 'Support' },
  { key: 'team', label: 'Team Management' },
  { key: 'blog', label: 'Blog' },
  { key: 'analytics', label: 'Analytics' }
];

const DEFAULT_CREATE_FORM = {
  name: '',
  email: '',
  password: '',
  generatePassword: true,
  isActive: true,
  roles: ['support']
};

const DEFAULT_EDIT_FORM = {
  id: '',
  name: '',
  email: '',
  newPassword: '',
  isActive: true,
  roles: []
};

function AdminTeam() {
  const navigate = useNavigate();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM);
  const [editForm, setEditForm] = useState(DEFAULT_EDIT_FORM);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await API.get('/api/admin/team');

      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        clearStoredAdminProfile();
        navigate('/adminbobby');
        return;
      }

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        setAdmins(response.data.admins || []);
      } else {
        setError(response.data?.error || 'Failed to load team users');
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load team users');
    } finally {
      setLoading(false);
    }
  };

  const activeCount = useMemo(
    () => admins.filter((admin) => admin.isActive).length,
    [admins]
  );

  const toggleRole = (setter, role) => {
    setter((prev) => {
      const hasRole = prev.roles.includes(role);
      const nextRoles = hasRole
        ? prev.roles.filter((value) => value !== role)
        : [...prev.roles, role];
      return { ...prev, roles: nextRoles };
    });
  };

  const openEditModal = (admin) => {
    setEditForm({
      id: admin._id,
      name: admin.name || '',
      email: admin.email || '',
      newPassword: '',
      isActive: !!admin.isActive,
      roles: Array.isArray(admin.adminRoles) ? admin.adminRoles : []
    });
    setShowEditModal(true);
    setNotice('');
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!createForm.name.trim() || !createForm.email.trim()) {
      setError('Name and email are required.');
      return;
    }

    if (!createForm.generatePassword && createForm.password.trim().length < 8) {
      setError('Manual password must be at least 8 characters.');
      return;
    }

    if (createForm.roles.length === 0) {
      setError('Select at least one role for the team user.');
      return;
    }

    setSubmittingCreate(true);
    try {
      const payload = {
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        roles: createForm.roles,
        isActive: createForm.isActive
      };

      if (!createForm.generatePassword) {
        payload.password = createForm.password.trim();
      }

      const response = await API.post('/api/admin/team/invite', payload);

      if (response.error || !response.data?.success) {
        setError(response.error || response.data?.error || 'Failed to create team user');
        return;
      }

      const generatedPassword = response.data?.tempPassword;
      setShowCreateModal(false);
      setCreateForm(DEFAULT_CREATE_FORM);
      await fetchTeamMembers();

      setNotice(
        generatedPassword
          ? `Team user created. Temporary password: ${generatedPassword}`
          : 'Team user created successfully.'
      );
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create team user');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!editForm.id) return;

    if (!editForm.name.trim() || !editForm.email.trim()) {
      setError('Name and email are required.');
      return;
    }

    if (editForm.newPassword && editForm.newPassword.trim().length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    if (editForm.roles.length === 0) {
      setError('Select at least one role for the team user.');
      return;
    }

    setSubmittingEdit(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        roles: editForm.roles,
        isActive: editForm.isActive
      };

      if (editForm.newPassword.trim()) {
        payload.newPassword = editForm.newPassword.trim();
      }

      const response = await API.put(`/api/admin/team/${editForm.id}`, payload);
      if (response.error || !response.data?.success) {
        setError(response.error || response.data?.error || 'Failed to update team user');
        return;
      }

      setShowEditModal(false);
      setEditForm(DEFAULT_EDIT_FORM);
      await fetchTeamMembers();
      setNotice('Team user updated successfully.');
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update team user');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleToggleActive = async (admin) => {
    const nextState = !admin.isActive;
    const confirmed = window.confirm(
      `${nextState ? 'Activate' : 'Deactivate'} ${admin.name || admin.email}?`
    );
    if (!confirmed) return;

    setError('');
    setNotice('');
    try {
      const response = await API.put(`/api/admin/team/${admin._id}`, { isActive: nextState });
      if (response.error || !response.data?.success) {
        setError(response.error || response.data?.error || 'Failed to update status');
        return;
      }
      await fetchTeamMembers();
      setNotice(`Team user ${nextState ? 'activated' : 'deactivated'} successfully.`);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update status');
    }
  };

  const renderRoleBadges = (roles) => {
    if (!Array.isArray(roles) || roles.length === 0) {
      return <span className="text-xs text-gray-500 dark:text-gray-400">No roles</span>;
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {roles.map((role) => {
          const label = ROLE_OPTIONS.find((option) => option.key === role)?.label || role;
          return (
            <span
              key={role}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
            >
              {label}
            </span>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading team users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Admin Team</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Manage team members, passwords, email, and multi-role page access.
            </p>
          </div>
          <button
            onClick={() => {
              setCreateForm(DEFAULT_CREATE_FORM);
              setShowCreateModal(true);
              setError('');
              setNotice('');
            }}
            className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            Add Team User
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-slate-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Team Users</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">{admins.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-slate-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
            <p className="text-2xl font-semibold text-green-600 dark:text-green-400">{activeCount}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-slate-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Inactive</p>
            <p className="text-2xl font-semibold text-orange-600 dark:text-orange-400">{admins.length - activeCount}</p>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-5 p-4 rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-800 text-green-700 dark:text-green-300 text-sm break-words">
            {notice}
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">Roles</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">Last Login</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {admins.map((admin) => (
                  <tr key={admin._id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                    <td className="px-5 py-4 text-sm font-medium text-gray-900 dark:text-white">{admin.name || '-'}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{admin.email}</td>
                    <td className="px-5 py-4 text-sm">{renderRoleBadges(admin.adminRoles)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        admin.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                      }`}>
                        {admin.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {admin.lastLogin ? new Date(admin.lastLogin).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-5 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(admin)}
                          className="px-3 py-1.5 rounded-md bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(admin)}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                            admin.isActive
                              ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300'
                          }`}
                        >
                          {admin.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-4">
          {admins.map((admin) => (
            <div
              key={admin._id}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{admin.name || '-'}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 break-all">{admin.email}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                  admin.isActive
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                }`}>
                  {admin.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="mt-3">{renderRoleBadges(admin.adminRoles)}</div>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Last login: {admin.lastLogin ? new Date(admin.lastLogin).toLocaleString() : 'Never'}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => openEditModal(admin)}
                  className="flex-1 px-3 py-2 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-sm font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleToggleActive(admin)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                    admin.isActive
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  }`}
                >
                  {admin.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 overflow-y-auto">
          <div className="max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 my-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Add Team User</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={createForm.generatePassword}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, generatePassword: event.target.checked, password: '' }))
                    }
                  />
                  Generate temporary password automatically
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={createForm.isActive}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                  />
                  Active now
                </label>
              </div>

              {!createForm.generatePassword && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Password (min 8 chars)
                  </label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assign roles (multiple allowed)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ROLE_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      className="inline-flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50 text-sm text-gray-800 dark:text-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={createForm.roles.includes(option.key)}
                        onChange={() => toggleRole(setCreateForm, option.key)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-slate-700 dark:text-gray-100 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submittingCreate ? 'Creating...' : 'Create Team User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 overflow-y-auto">
          <div className="max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 my-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Edit Team User</h2>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Set New Password (optional)
                </label>
                <input
                  type="password"
                  value={editForm.newPassword}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                  placeholder="Leave blank to keep current password"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                Account is active
              </label>

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assign roles (multiple allowed)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ROLE_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      className="inline-flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50 text-sm text-gray-800 dark:text-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={editForm.roles.includes(option.key)}
                        onChange={() => toggleRole(setEditForm, option.key)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-slate-700 dark:text-gray-100 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submittingEdit ? 'Saving...' : 'Save Changes'}
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
