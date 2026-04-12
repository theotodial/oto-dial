import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import API from '../../api';
import { notifySubscriptionChanged } from '../../utils/subscriptionSync';

function AdminUserDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [recentCalls, setRecentCalls] = useState([]);
  const [recentMessages, setRecentMessages] = useState([]);
  const [costs, setCosts] = useState(null);
  const [customPackage, setCustomPackage] = useState(null);
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
  const [loadedSms, setLoadedSms] = useState('');
  const [loadedMinutes, setLoadedMinutes] = useState('');
  const [loadedCreditsExpiry, setLoadedCreditsExpiry] = useState('');
  const [loadedSmsExpiry, setLoadedSmsExpiry] = useState('');
  const [loadedMinutesExpiry, setLoadedMinutesExpiry] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [usageAdjustMinutes, setUsageAdjustMinutes] = useState('');
  const [usageAdjustSms, setUsageAdjustSms] = useState('');
  const [packageMinutes, setPackageMinutes] = useState('');
  const [packageSms, setPackageSms] = useState('');
  const [packageExpiresAt, setPackageExpiresAt] = useState('');
  const [packageAllowedCountries, setPackageAllowedCountries] = useState('');
  const [packageBlockedCountries, setPackageBlockedCountries] = useState('');
  const [packageCallsEnabled, setPackageCallsEnabled] = useState(true);
  const [packageSmsEnabled, setPackageSmsEnabled] = useState(true);
  const [hasMongoSubscription, setHasMongoSubscription] = useState(false);
  const [subscriptionPeriodEnd, setSubscriptionPeriodEnd] = useState('');

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
      if (response.error) {
        console.error('Failed to fetch plans:', response.error);
        return;
      }
      if (response.data?.success) {
        const list = response.data.plans || [];
        setAvailablePlans(
          [...list].sort((a, b) => {
            const an = String(a.name || '').toLowerCase();
            const bn = String(b.name || '').toLowerCase();
            if (an.includes('1700 sms')) return -1;
            if (bn.includes('1700 sms')) return 1;
            return Number(a.price || 0) - Number(b.price || 0);
          })
        );
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
      const response = await API.get(`/api/admin/users/${id}/details`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        setUser(response.data.user);
        setHasMongoSubscription(response.data.hasSubscriptionDocument === true);
        setSubscription(response.data.subscription || null);
        setUsage(response.data.usage || null);
        setRecentCalls(response.data.recentCalls || []);
        setRecentMessages(response.data.recentMessages || []);
        setCosts(response.data.costs || null);
        const nextCustomPackage = response.data.customPackage || null;
        setCustomPackage(nextCustomPackage);
        setPackageMinutes(nextCustomPackage ? String(nextCustomPackage.minutesAllowed ?? 0) : '');
        setPackageSms(nextCustomPackage ? String(nextCustomPackage.smsAllowed ?? 0) : '');
        setPackageExpiresAt(
          nextCustomPackage?.expiresAt
            ? new Date(nextCustomPackage.expiresAt).toISOString().slice(0, 16)
            : ''
        );
        setPackageAllowedCountries((nextCustomPackage?.allowedCountries || []).join(', '));
        setPackageBlockedCountries((nextCustomPackage?.blockedCountries || []).join(', '));
        setPackageCallsEnabled(nextCustomPackage ? nextCustomPackage.isCallEnabled !== false : true);
        setPackageSmsEnabled(nextCustomPackage ? nextCustomPackage.isSmsEnabled !== false : true);
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
        notifySubscriptionChanged({ reason: action, userId: id });
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
        notifySubscriptionChanged({ reason: 'status-change', userId: id });
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

    let loadedPayload = {};
    try {
      loadedPayload = buildLoadedCreditsPayload();
    } catch (validationErr) {
      alert(validationErr.message);
      return;
    }

    setActionLoading('assign-plan');
    try {
      const token = localStorage.getItem('adminToken');
      const periodPayload =
        subscriptionPeriodEnd.trim() !== ''
          ? { subscriptionPeriodEnd: new Date(subscriptionPeriodEnd).toISOString() }
          : {};
      const response = await API.post('/api/admin/actions/subscription/assign', {
        userId: id,
        planId: selectedPlanId,
        ...loadedPayload,
        ...periodPayload
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        alert('Subscription assigned successfully');
        resetPlanForm();
        notifySubscriptionChanged({ reason: 'assign-plan', userId: id });
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

    let loadedPayload = {};
    try {
      loadedPayload = buildLoadedCreditsPayload();
    } catch (validationErr) {
      alert(validationErr.message);
      return;
    }

    setActionLoading('change-plan');
    try {
      const token = localStorage.getItem('adminToken');
      const periodPayload =
        subscriptionPeriodEnd.trim() !== ''
          ? { subscriptionPeriodEnd: new Date(subscriptionPeriodEnd).toISOString() }
          : {};
      const response = await API.post('/api/admin/actions/subscription/change-plan', {
        userId: id,
        planId: selectedPlanId,
        ...loadedPayload,
        ...periodPayload
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        alert('Subscription plan changed successfully');
        resetPlanForm();
        notifySubscriptionChanged({ reason: 'change-plan', userId: id });
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

  const buildLoadedCreditsPayload = () => {
    const payload = {};

    const addNumericField = (rawValue, fieldName, label) => {
      if (rawValue === '') return;
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
        throw new Error(`${label} must be a non-negative whole number`);
      }
      payload[fieldName] = parsed;
    };

    const addDateField = (rawValue, fieldName, label) => {
      if (!rawValue) return;
      const parsed = new Date(rawValue);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${label} is invalid`);
      }
      payload[fieldName] = parsed.toISOString();
    };

    addNumericField(loadedSms, 'loadedSms', 'Loaded SMS');
    addNumericField(loadedMinutes, 'loadedMinutes', 'Loaded minutes');
    addDateField(loadedCreditsExpiry, 'loadedCreditsExpiry', 'Loaded credits expiry');
    addDateField(loadedSmsExpiry, 'loadedSmsExpiry', 'Loaded SMS expiry');
    addDateField(loadedMinutesExpiry, 'loadedMinutesExpiry', 'Loaded minutes expiry');

    return payload;
  };

  const resetPlanForm = () => {
    setShowPlansModal(false);
    setSelectedPlanId('');
    setLoadedSms('');
    setLoadedMinutes('');
    setLoadedCreditsExpiry('');
    setLoadedSmsExpiry('');
    setLoadedMinutesExpiry('');
    setSubscriptionPeriodEnd('');
  };

  const handleLoadCredits = async () => {
    const smsInput = window.prompt('Enter SMS to load (leave blank for none):', '');
    if (smsInput === null) return;

    const minutesInput = window.prompt('Enter minutes to load (leave blank for none):', '');
    if (minutesInput === null) return;

    const expiryInput = window.prompt(
      'Enter expiry date/time for loaded credits (e.g. 2026-03-31T23:59). Leave blank to auto-set.',
      ''
    );
    if (expiryInput === null) return;

    const payload = { userId: id };

    if (smsInput.trim()) {
      const parsedSms = Number(smsInput.trim());
      if (!Number.isFinite(parsedSms) || parsedSms < 0 || !Number.isInteger(parsedSms)) {
        alert('SMS amount must be a non-negative whole number');
        return;
      }
      payload.loadedSms = parsedSms;
    }

    if (minutesInput.trim()) {
      const parsedMinutes = Number(minutesInput.trim());
      if (!Number.isFinite(parsedMinutes) || parsedMinutes < 0 || !Number.isInteger(parsedMinutes)) {
        alert('Minutes amount must be a non-negative whole number');
        return;
      }
      payload.loadedMinutes = parsedMinutes;
    }

    if (expiryInput.trim()) {
      const parsedExpiry = new Date(expiryInput.trim());
      if (Number.isNaN(parsedExpiry.getTime())) {
        alert('Expiry date is invalid');
        return;
      }
      payload.loadedCreditsExpiry = parsedExpiry.toISOString();
    }

    if (!('loadedSms' in payload) && !('loadedMinutes' in payload) && !('loadedCreditsExpiry' in payload)) {
      alert('No credits or expiry value provided');
      return;
    }

    setActionLoading('load-credits');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post('/api/admin/actions/subscription/load-credits', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        alert(response.data.message || 'Credits loaded successfully');
        notifySubscriptionChanged({ reason: 'load-credits', userId: id });
        await fetchUser();
      } else {
        alert(response.data?.error || 'Failed to load credits');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Failed to load credits');
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
        notifySubscriptionChanged({ reason: 'set-trial', userId: id });
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

  const handleVerifyEmail = async () => {
    setActionLoading('verify-email');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post(`/api/admin/users/${id}/verify-email`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        await fetchUser();
        alert(response.data.message || 'Email verified');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Failed to verify email');
    } finally {
      setActionLoading('');
    }
  };

  const handleAdjustUsage = async () => {
    setActionLoading('adjust-usage');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post(`/api/admin/users/${id}/adjust-usage`, {
        minutes: Number(usageAdjustMinutes || 0),
        sms: Number(usageAdjustSms || 0),
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        setUsageAdjustMinutes('');
        setUsageAdjustSms('');
        notifySubscriptionChanged({ reason: 'adjust-usage', userId: id });
        await fetchUser();
        alert(response.data.message || 'Usage adjusted');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Failed to adjust usage');
    } finally {
      setActionLoading('');
    }
  };

  const handleSaveCustomPackage = async () => {
    setActionLoading('custom-package');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.put(`/api/admin/users/${id}/custom-package`, {
        minutesAllowed: Number(packageMinutes || 0),
        smsAllowed: Number(packageSms || 0),
        expiresAt: packageExpiresAt || null,
        isCallEnabled: packageCallsEnabled,
        isSmsEnabled: packageSmsEnabled,
        active: true,
        overridePlan: true,
        notes: '',
        allowedCountries: packageAllowedCountries
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        blockedCountries: packageBlockedCountries
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        notifySubscriptionChanged({ reason: 'custom-package-save', userId: id });
        await fetchUser();
        alert(response.data.message || 'Custom package saved');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Failed to save custom package');
    } finally {
      setActionLoading('');
    }
  };

  const handleClearCustomPackage = async () => {
    setActionLoading('clear-custom-package');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.delete(`/api/admin/users/${id}/custom-package`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        notifySubscriptionChanged({ reason: 'custom-package-clear', userId: id });
        await fetchUser();
        alert(response.data.message || 'Custom package cleared');
      }
    } catch (err) {
      alert(err?.error || err?.response?.data?.error || 'Failed to clear custom package');
    } finally {
      setActionLoading('');
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
                        setLoadedSms('');
                        setLoadedMinutes('');
                        setLoadedCreditsExpiry('');
                        setLoadedSmsExpiry('');
                        setLoadedMinutesExpiry('');
                        setSubscriptionPeriodEnd('');
                        fetchPlans();
                      }}
                      className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      {subscription && hasMongoSubscription ? 'Change Plan' : 'Assign Plan'}
                    </button>
                    {subscription && hasMongoSubscription && (
                      <button
                        onClick={handleLoadCredits}
                        disabled={actionLoading === 'load-credits'}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {actionLoading === 'load-credits' ? 'Loading...' : 'Load SMS/Minutes'}
                      </button>
                    )}
                    <button
                      onClick={handleSetTrial}
                      disabled={actionLoading === 'trial'}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Set Trial
                    </button>
                  </div>
                </div>
                {subscription ? (
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Plan</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{subscription.planName}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Status</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{subscription.status}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Next Billing</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">
                        {subscription.periodEnd ? new Date(subscription.periodEnd).toLocaleDateString() : 'N/A'}
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
              {usage && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Usage</h2>
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Monthly Minutes Used</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">
                        {Number(usage.monthlyMinutesUsed || 0).toFixed(2)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Monthly SMS Used</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{Number(usage.monthlySmsUsed || 0)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Loaded Minutes (active / total)</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">
                        {Number(usage.loadedMinutesActive || 0)} / {Number(usage.loadedMinutesTotal || 0)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Loaded SMS (active / total)</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">
                        {Number(usage.loadedSmsActive || 0)} / {Number(usage.loadedSmsTotal || 0)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Loaded Minutes Expiry</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">
                        {usage.loadedMinutesExpiry
                          ? new Date(usage.loadedMinutesExpiry).toLocaleString()
                          : 'No expiry'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Loaded SMS Expiry</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">
                        {usage.loadedSmsExpiry
                          ? new Date(usage.loadedSmsExpiry).toLocaleString()
                          : 'No expiry'}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Cost Breakdown */}
              {costs && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cost Breakdown</h2>
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Call Costs</dt>
                      <dd className="text-sm font-semibold text-red-600">
                        ${costs?.calls?.totalCost?.toFixed(4) ?? '0.0000'}
                      </dd>
                      <dd className="text-xs text-gray-500 dark:text-gray-400">
                        {(costs?.calls?.count ?? 0)} calls, {(costs?.calls?.totalMinutes ?? 0).toFixed(2)} min
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">SMS Costs</dt>
                      <dd className="text-sm font-semibold text-red-600">
                        ${costs?.sms?.totalCost?.toFixed(4) ?? '0.0000'}
                      </dd>
                      <dd className="text-xs text-gray-500 dark:text-gray-400">
                        {(costs?.sms?.count ?? 0)} SMS
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Number Monthly</dt>
                      <dd className="text-sm font-semibold text-red-600">${costs.phoneNumbers.monthlyCost?.toFixed(2)}/mo</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Number One-Time</dt>
                      <dd className="text-sm font-semibold text-red-600">${costs.phoneNumbers.oneTimeCost?.toFixed(2)}</dd>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-gray-200 dark:border-slate-700">
                      <dt className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Telnyx Cost</dt>
                      <dd className="text-lg font-bold text-red-600">${costs.totalTelnyxCost?.toFixed(4)}</dd>
                    </div>
                  </dl>
                </div>
              )}

              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Recent Calls</h3>
                    <div className="space-y-2">
                      {recentCalls.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No recent calls</p>}
                      {recentCalls.map((call) => (
                        <div key={call._id} className="rounded border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm">
                          <div className="font-medium text-gray-900 dark:text-white">{call.phoneNumber || call.toNumber || call.fromNumber || 'Unknown number'}</div>
                          <div className="text-gray-500 dark:text-gray-400">{call.status || 'unknown'} • {call.createdAt ? new Date(call.createdAt).toLocaleString() : 'Unknown time'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Recent Messages</h3>
                    <div className="space-y-2">
                      {recentMessages.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No recent messages</p>}
                      {recentMessages.map((message) => (
                        <div key={message._id} className="rounded border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm">
                          <div className="font-medium text-gray-900 dark:text-white">{message.to || message.from || message.phoneNumber || 'Unknown number'}</div>
                          <div className="text-gray-500 dark:text-gray-400">{message.text || message.body || 'No content'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Custom Package</h2>
                {customPackage ? (
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Minutes Allowed</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{customPackage.minutesAllowed}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">SMS Allowed</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{customPackage.smsAllowed}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Calls Enabled</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{customPackage.isCallEnabled ? 'Yes' : 'No'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">SMS Enabled</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{customPackage.isSmsEnabled ? 'Yes' : 'No'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Allowed Countries</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{(customPackage.allowedCountries || []).join(', ') || 'All'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-600 dark:text-gray-400">Blocked Countries</dt>
                      <dd className="text-sm text-gray-900 dark:text-white">{(customPackage.blockedCountries || []).join(', ') || 'None'}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">No custom package override configured</p>
                )}
                <div className="mt-6 space-y-3 border-t border-gray-200 dark:border-slate-700 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="number"
                      min="0"
                      value={packageMinutes}
                      onChange={(e) => setPackageMinutes(e.target.value)}
                      placeholder="Minutes allowed"
                      className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                    />
                    <input
                      type="number"
                      min="0"
                      value={packageSms}
                      onChange={(e) => setPackageSms(e.target.value)}
                      placeholder="SMS allowed"
                      className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                    />
                    <input
                      type="datetime-local"
                      value={packageExpiresAt}
                      onChange={(e) => setPackageExpiresAt(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                    />
                    <input
                      type="text"
                      value={packageAllowedCountries}
                      onChange={(e) => setPackageAllowedCountries(e.target.value)}
                      placeholder="Allowed countries (e.g. ZW,US)"
                      className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                    />
                    <input
                      type="text"
                      value={packageBlockedCountries}
                      onChange={(e) => setPackageBlockedCountries(e.target.value)}
                      placeholder="Blocked countries (e.g. IN,PK)"
                      className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white md:col-span-2"
                    />
                  </div>
                  <div className="flex gap-4 text-sm text-gray-700 dark:text-gray-300">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={packageCallsEnabled} onChange={(e) => setPackageCallsEnabled(e.target.checked)} />
                      Calls enabled
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={packageSmsEnabled} onChange={(e) => setPackageSmsEnabled(e.target.checked)} />
                      SMS enabled
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveCustomPackage}
                      disabled={actionLoading === 'custom-package'}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Save Custom Package
                    </button>
                    <button
                      onClick={handleClearCustomPackage}
                      disabled={actionLoading === 'clear-custom-package'}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                    >
                      Clear Override
                    </button>
                  </div>
                </div>
              </div>
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
                    onClick={handleVerifyEmail}
                    disabled={actionLoading === 'verify-email' || user.isEmailVerified === true}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Verify Email
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

              {subscription && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Subscription Actions</h2>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={usageAdjustMinutes}
                        onChange={(e) => setUsageAdjustMinutes(e.target.value)}
                        placeholder="Adjust minutes"
                        className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                      />
                      <input
                        type="number"
                        value={usageAdjustSms}
                        onChange={(e) => setUsageAdjustSms(e.target.value)}
                        placeholder="Adjust SMS"
                        className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                      />
                    </div>
                    <button
                      onClick={handleAdjustUsage}
                      disabled={actionLoading === 'adjust-usage'}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
                    >
                      Adjust Usage
                    </button>
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
              {subscription && hasMongoSubscription
                ? 'Change Subscription Plan'
                : 'Assign Subscription Plan'}
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
                    <option key={String(plan._id)} value={String(plan._id)}>
                      {plan.adminOnly ? `${plan.name} (admin only)` : plan.name} — ${plan.currency || 'USD'} ${plan.price}/mo · SMS {plan.limits?.smsTotal ?? '—'} · min {plan.limits?.minutesTotal ?? '—'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Subscription period end (optional)
                </label>
                <input
                  type="datetime-local"
                  value={subscriptionPeriodEnd}
                  onChange={(e) => setSubscriptionPeriodEnd(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Leave blank for default (+1 month from now). Shown as next billing in the app.
                </p>
              </div>

              <div className="border-t border-gray-200 dark:border-slate-700 pt-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Optional credit load (admin top-up)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Load SMS</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={loadedSms}
                      onChange={(e) => setLoadedSms(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Load Minutes</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={loadedMinutes}
                      onChange={(e) => setLoadedMinutes(e.target.value)}
                      placeholder="e.g. 120"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Shared expiry (applies to both if specific is empty)</label>
                    <input
                      type="datetime-local"
                      value={loadedCreditsExpiry}
                      onChange={(e) => setLoadedCreditsExpiry(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">SMS expiry override</label>
                    <input
                      type="datetime-local"
                      value={loadedSmsExpiry}
                      onChange={(e) => setLoadedSmsExpiry(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Minutes expiry override</label>
                    <input
                      type="datetime-local"
                      value={loadedMinutesExpiry}
                      onChange={(e) => setLoadedMinutesExpiry(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={resetPlanForm}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={
                    subscription && hasMongoSubscription
                      ? handleChangePlan
                      : handleAssignPlan
                  }
                  disabled={!selectedPlanId || (actionLoading === 'assign-plan' || actionLoading === 'change-plan')}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {actionLoading === 'assign-plan' || actionLoading === 'change-plan' 
                    ? 'Processing...' 
                    : subscription && hasMongoSubscription
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
