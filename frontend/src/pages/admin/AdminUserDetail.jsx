import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import API from '../../api';

function AdminUserDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editField, setEditField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchUser();
    fetchPlans();
  }, [id]);

  const fetchPlans = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.get('/api/admin/plans', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data?.success) {
        setAvailablePlans(response.data.plans || []);
      }
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    }
  };

  const fetchUser = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.get(`/api/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        setUser(response.data.user);
      } else {
        setError('Failed to load user');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      } else {
        setError(err.response?.data?.error || 'Failed to load user');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action, data = {}) => {
    setActionLoading(action);
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post(`/api/admin/actions/${action}`, data, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        await fetchUser(); // Refresh user data
        alert(response.data.message || 'Action completed successfully');
      } else {
        alert(response.data?.error || 'Action failed');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading('');
    }
  };

  const handleStatusChange = async (status) => {
    if (!confirm(`Are you sure you want to ${status} this user?`)) return;
    
    setActionLoading('status');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.patch(`/api/admin/users/${id}/status`, { status }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        await fetchUser();
        alert(`User status updated to ${status}`);
      } else {
        alert('Failed to update status');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Failed to update status');
    } finally {
      setActionLoading('');
    }
  };

  const handlePasswordReset = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    setActionLoading('password');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post('/api/admin/actions/user/reset-password', {
        userId: id,
        newPassword
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        alert('Password reset successfully');
        setShowPasswordModal(false);
        setNewPassword('');
        setConfirmPassword('');
      } else {
        alert(response.data?.error || 'Failed to reset password');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Failed to reset password');
    } finally {
      setActionLoading('');
    }
  };

  const handleGeneratePassword = async () => {
    setActionLoading('generate');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post('/api/admin/actions/user/generate-password', {
        userId: id
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        setGeneratedPassword(response.data.newPassword);
        alert(`Password generated: ${response.data.newPassword}\n\nStore this securely - it will not be shown again.`);
      } else {
        alert(response.data?.error || 'Failed to generate password');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Failed to generate password');
    } finally {
      setActionLoading('');
    }
  };

  const handleAssignPlan = async () => {
    if (!selectedPlanId) {
      alert('Please select a plan');
      return;
    }

    setActionLoading('assign-plan');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post('/api/admin/actions/subscription/assign', {
        userId: id,
        planId: selectedPlanId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        alert('Subscription assigned successfully');
        setShowPlansModal(false);
        setSelectedPlanId('');
        await fetchUser();
      } else {
        alert(response.data?.error || 'Failed to assign subscription');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Failed to assign subscription');
    } finally {
      setActionLoading('');
    }
  };

  const handleChangePlan = async () => {
    if (!selectedPlanId) {
      alert('Please select a plan');
      return;
    }

    setActionLoading('change-plan');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post('/api/admin/actions/subscription/change-plan', {
        userId: id,
        planId: selectedPlanId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        alert('Subscription plan changed successfully');
        setShowPlansModal(false);
        setSelectedPlanId('');
        await fetchUser();
      } else {
        alert(response.data?.error || 'Failed to change plan');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Failed to change plan');
    } finally {
      setActionLoading('');
    }
  };

  const handleSetTrial = async () => {
    const days = prompt('Enter trial duration in days (default: 7):', '7');
    if (!days || isNaN(days) || parseInt(days) < 1) {
      alert('Invalid number of days');
      return;
    }

    setActionLoading('trial');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post('/api/admin/actions/subscription/set-trial', {
        userId: id,
        trialDays: parseInt(days)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        alert(`Trial subscription created for ${days} days`);
        await fetchUser();
      } else {
        alert(response.data?.error || 'Failed to set trial');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Failed to set trial');
    } finally {
      setActionLoading('');
    }
  };

  const handleDeleteUser = async () => {
    const confirmMessage = `⚠️ WARNING: This will PERMANENTLY delete user "${user?.identity?.name || user?.identity?.email}" and ALL associated data:\n\n` +
      `- All subscriptions\n` +
      `- All phone numbers\n` +
      `- All calls\n` +
      `- All SMS messages\n` +
      `- All cost records\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Type "DELETE" to confirm:`;

    const confirmation = prompt(confirmMessage);
    if (confirmation !== 'DELETE') {
      return;
    }

    setDeleting(true);
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.delete(`/api/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        alert('User deleted permanently');
        navigate('/adminbobby/users');
      } else {
        alert(response.data?.error || 'Failed to delete user');
      }
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading user...</p>
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 max-w-md w-full">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/adminbobby/users')}
            className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => navigate('/adminbobby/users')}
                className="text-indigo-600 hover:text-indigo-700 mb-2"
              >
                ← Back to Users
              </button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Details</h1>
            </div>
            <button
              onClick={() => navigate('/adminbobby/dashboard')}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Dashboard
            </button>
          </div>
        </div>
      </header>

      {user && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Identity */}
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Identity</h2>
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">User ID</dt>
                    <dd className="text-sm font-mono text-gray-900 dark:text-white">{user.identity?.id}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Name</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">{user.identity?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Email</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">{user.identity?.email}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Status</dt>
                    <dd>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        user.identity?.accountStatus === 'active' ? 'bg-green-100 text-green-800' :
                        user.identity?.accountStatus === 'suspended' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {user.identity?.accountStatus}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Country</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">{user.identity?.country}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Created</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">
                      {new Date(user.identity?.createdAt).toLocaleString()}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Subscription */}
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Subscription</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowPlansModal(true);
                        setSelectedPlanId('');
                      }}
                      className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      {user.subscription ? 'Change Plan' : 'Assign Plan'}
                    </button>
                    <button
                      onClick={handleSetTrial}
                      disabled={actionLoading === 'trial'}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Set Trial
                    </button>
                  </div>
                </div>
                {user.subscription ? (
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Plan</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{user.subscription.planName}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Status</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{user.subscription.status}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Next Billing</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">
                        {new Date(user.subscription.nextBillingDate).toLocaleDateString()}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">No active subscription</p>
                )}
              </div>

              {/* Security */}
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Security</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowPasswordModal(true);
                        setNewPassword('');
                        setConfirmPassword('');
                        setGeneratedPassword('');
                      }}
                      className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      Reset Password
                    </button>
                    <button
                      onClick={handleGeneratePassword}
                      disabled={actionLoading === 'generate'}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Generate Password
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Admin can reset user password or generate a secure random password.
                </p>
                {generatedPassword && (
                  <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                    <p className="text-xs text-yellow-800 dark:text-yellow-200 font-semibold mb-1">Generated Password:</p>
                    <p className="text-sm font-mono text-yellow-900 dark:text-yellow-100">{generatedPassword}</p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">Store this securely - it will not be shown again.</p>
                  </div>
                )}
              </div>

              {/* Phone Numbers */}
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Phone Numbers</h2>
                  <button
                    onClick={() => {
                      setEditField('assignNumber');
                      setEditValue('');
                      setShowEditModal(true);
                    }}
                    className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Assign Number
                  </button>
                </div>
                {user.phoneNumbers?.length > 0 ? (
                  <div className="space-y-3">
                    {user.phoneNumbers.map((pn, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{pn.phoneNumber}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {pn.status} | ${pn.monthlyCost?.toFixed(2)}/mo | Group {pn.carrierGroup || 'N/A'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleAction('telnyx/release-number', { phoneNumberId: pn.id })}
                          className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Release
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">No phone numbers assigned</p>
                )}
              </div>

              {/* Usage */}
              {user.usage && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Usage</h2>
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Call Minutes</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{user.usage.totalCallMinutes?.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">SMS Count</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{user.usage.totalSms}</dd>
                    </div>
                    {user.usage.limits && (
                      <>
                        <div>
                          <dt className="text-sm text-gray-600 dark:text-gray-400">Minutes Remaining</dt>
                          <dd className="text-sm text-gray-900 dark:text-white">{user.usage.limits.minutesRemaining?.toFixed(2)}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-gray-600 dark:text-gray-400">SMS Remaining</dt>
                          <dd className="text-sm text-gray-900 dark:text-white">{user.usage.limits.smsRemaining}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                </div>
              )}

              {/* Cost Breakdown */}
              {user.costs && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cost Breakdown</h2>
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Call Costs</dt>
                      <dd className="text-sm font-semibold text-red-600">${user.costs.calls.totalCost?.toFixed(4)}</dd>
                      <dd className="text-xs text-gray-500 dark:text-gray-400">{user.costs.calls.count} calls, {user.costs.calls.totalMinutes?.toFixed(2)} min</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">SMS Costs</dt>
                      <dd className="text-sm font-semibold text-red-600">${user.costs.sms.totalCost?.toFixed(4)}</dd>
                      <dd className="text-xs text-gray-500 dark:text-gray-400">{user.costs.sms.count} SMS</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Number Monthly</dt>
                      <dd className="text-sm font-semibold text-red-600">${user.costs.phoneNumbers.monthlyCost?.toFixed(2)}/mo</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Number One-Time</dt>
                      <dd className="text-sm font-semibold text-red-600">${user.costs.phoneNumbers.oneTimeCost?.toFixed(2)}</dd>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-gray-200 dark:border-slate-700">
                      <dt className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Telnyx Cost</dt>
                      <dd className="text-lg font-bold text-red-600">${user.costs.totalTelnyxCost?.toFixed(4)}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>

            {/* Actions Sidebar */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">User Actions</h2>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setEditField('name');
                      setEditValue(user.identity?.name || '');
                      setShowEditModal(true);
                    }}
                    className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    Change Name
                  </button>
                  <button
                    onClick={() => {
                      setEditField('email');
                      setEditValue(user.identity?.email || '');
                      setShowEditModal(true);
                    }}
                    className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    Change Email
                  </button>
                  <button
                    onClick={() => {
                      setEditField('password');
                      setEditValue('');
                      setShowEditModal(true);
                    }}
                    className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    Change Password
                  </button>
                  <button
                    onClick={() => handleStatusChange('suspended')}
                    disabled={actionLoading === 'status' || user.identity?.accountStatus === 'suspended'}
                    className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                  >
                    Suspend User
                  </button>
                  <button
                    onClick={() => handleStatusChange('active')}
                    disabled={actionLoading === 'status' || user.identity?.accountStatus === 'active'}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Unsuspend User
                  </button>
                  <button
                    onClick={handleDeleteUser}
                    disabled={deleting}
                    className="w-full px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:opacity-50 font-semibold border-2 border-red-800"
                  >
                    {deleting ? 'Deleting...' : 'Delete User Permanently'}
                  </button>
                  <button
                    onClick={() => handleAction('telnyx/block-calls', { userId: id })}
                    disabled={actionLoading === 'telnyx/block-calls'}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    Block Calls
                  </button>
                  <button
                    onClick={() => handleAction('telnyx/block-sms', { userId: id })}
                    disabled={actionLoading === 'telnyx/block-sms'}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    Block SMS
                  </button>
                </div>
              </div>

              {user.subscription && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Subscription Actions</h2>
                  <div className="space-y-3">
                    <button
                      onClick={() => handleAction('subscription/cancel', { userId: id })}
                      disabled={actionLoading === 'subscription/cancel'}
                      className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      Cancel Subscription
                    </button>
                    <button
                      onClick={() => handleAction('subscription/resume', { userId: id })}
                      disabled={actionLoading === 'subscription/resume'}
                      className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Resume Subscription
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <EditModal
          field={editField}
          value={editValue}
          userId={id}
          onClose={() => {
            setShowEditModal(false);
            setEditField(null);
            setEditValue('');
          }}
          onSuccess={async () => {
            setShowEditModal(false);
            setEditField(null);
            setEditValue('');
            await fetchUser();
          }}
        />
      )}

      {/* Password Reset Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Reset Password</h2>
            
            <form onSubmit={(e) => { e.preventDefault(); handlePasswordReset(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Enter new password (min 6 characters)"
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'password'}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {actionLoading === 'password' ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Plan Selection Modal */}
      {showPlansModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {user.subscription ? 'Change Subscription Plan' : 'Assign Subscription Plan'}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Plan
                </label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                >
                  <option value="">-- Select a plan --</option>
                  {availablePlans.map((plan) => (
                    <option key={plan._id} value={plan._id}>
                      {plan.name} - ${plan.price}/month
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPlansModal(false);
                    setSelectedPlanId('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={user.subscription ? handleChangePlan : handleAssignPlan}
                  disabled={!selectedPlanId || (actionLoading === 'assign-plan' || actionLoading === 'change-plan')}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {actionLoading === 'assign-plan' || actionLoading === 'change-plan' 
                    ? 'Processing...' 
                    : user.subscription 
                      ? 'Change Plan' 
                      : 'Assign Plan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditModal({ field, value, userId, onClose, onSuccess }) {
  const [newValue, setNewValue] = useState(value);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('adminToken');
      let response;

      if (field === 'name') {
        response = await API.patch(`/api/admin/users/${userId}/name`, {
          name: newValue
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else if (field === 'email') {
        response = await API.patch(`/api/admin/users/${userId}/email`, {
          email: newValue
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else if (field === 'password') {
        response = await API.patch(`/api/admin/users/${userId}/password`, {
          password: newValue
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else if (field === 'assignNumber') {
        response = await API.post('/api/admin/actions/telnyx/assign-number', {
          userId,
          phoneNumber: newValue
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      if (response?.error) {
        setError(response.error);
      } else if (response?.data?.success) {
        onSuccess();
      } else {
        setError('Update failed');
      }
    } catch (err) {
      setError(err?.error || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const getFieldLabel = () => {
    switch (field) {
      case 'name': return 'Name';
      case 'email': return 'Email';
      case 'password': return 'Password';
      case 'assignNumber': return 'Phone Number';
      default: return 'Field';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Change {getFieldLabel()}</h2>
        
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {getFieldLabel()}
            </label>
            <input
              type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              required
              minLength={field === 'password' ? 6 : undefined}
              placeholder={field === 'assignNumber' ? '+1234567890' : `Enter ${getFieldLabel().toLowerCase()}`}
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
              {loading ? 'Updating...' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminUserDetail;
