import { useEffect, useState } from 'react';
import API from '../../api';

function AdminAffiliates() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [affiliates, setAffiliates] = useState([]);
  const [selectedAffiliateId, setSelectedAffiliateId] = useState('');
  const [affiliateUsers, setAffiliateUsers] = useState([]);
  const [processingId, setProcessingId] = useState('');

  const loadAffiliates = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await API.get('/api/admin/affiliates');
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || response?.error || 'Failed to fetch affiliates');
      }
      setAffiliates(response.data.affiliates || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch affiliates');
    } finally {
      setLoading(false);
    }
  };

  const loadAffiliateUsers = async (affiliateId) => {
    setSelectedAffiliateId(affiliateId);
    setAffiliateUsers([]);
    try {
      const response = await API.get(`/api/admin/affiliates/${affiliateId}/users`);
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || response?.error || 'Failed to fetch users');
      }
      setAffiliateUsers(response.data.users || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch users');
    }
  };

  const approveAffiliate = async (affiliateId) => {
    setProcessingId(affiliateId);
    try {
      const response = await API.post(`/api/admin/affiliates/${affiliateId}/approve`, {});
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || response?.error || 'Approval failed');
      }
      await loadAffiliates();
    } catch (err) {
      setError(err.message || 'Approval failed');
    } finally {
      setProcessingId('');
    }
  };

  const rejectAffiliate = async (affiliateId) => {
    setProcessingId(affiliateId);
    try {
      const response = await API.post(`/api/admin/affiliates/${affiliateId}/reject`, {});
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || response?.error || 'Reject failed');
      }
      await loadAffiliates();
    } catch (err) {
      setError(err.message || 'Reject failed');
    } finally {
      setProcessingId('');
    }
  };

  const assignPlanFromAdmin = async (affiliateId, userId) => {
    setProcessingId(userId);
    try {
      const response = await API.post(
        `/api/admin/affiliates/${affiliateId}/users/${userId}/assign-unlimited`,
        {}
      );
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || response?.error || 'Assign failed');
      }
      await loadAffiliateUsers(affiliateId);
    } catch (err) {
      setError(err.message || 'Assign failed');
    } finally {
      setProcessingId('');
    }
  };

  useEffect(() => {
    loadAffiliates();
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-gray-700 dark:text-gray-200">
        Loading affiliate approvals...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Affiliate Approval & Tracking
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Review affiliate accounts, approve/reject requests, and track referred users.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800 text-left text-gray-600 dark:text-gray-300">
                <th className="p-3">Affiliate</th>
                <th className="p-3">Code</th>
                <th className="p-3">Status</th>
                <th className="p-3">Referrals</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map((affiliate) => (
                <tr
                  key={affiliate.id}
                  className="border-t border-gray-100 dark:border-slate-700 text-gray-700 dark:text-gray-300"
                >
                  <td className="p-3">
                    <div className="font-medium">{affiliate.name || affiliate.email}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{affiliate.email}</div>
                  </td>
                  <td className="p-3">{affiliate.affiliateCode}</td>
                  <td className="p-3 capitalize">{affiliate.status}</td>
                  <td className="p-3">
                    {affiliate.stats?.totalReferrals || 0} total / {affiliate.stats?.paidReferrals || 0} paid
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={processingId === affiliate.id}
                        onClick={() => loadAffiliateUsers(affiliate.id)}
                        className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600"
                      >
                        Users
                      </button>
                      {affiliate.status !== 'approved' && (
                        <button
                          disabled={processingId === affiliate.id}
                          onClick={() => approveAffiliate(affiliate.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {affiliate.status !== 'rejected' && (
                        <button
                          disabled={processingId === affiliate.id}
                          onClick={() => rejectAffiliate(affiliate.id)}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAffiliateId && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-slate-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">Affiliate Users</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800 text-left text-gray-600 dark:text-gray-300">
                  <th className="p-3">User</th>
                  <th className="p-3">Referral Status</th>
                  <th className="p-3">Subscription</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {affiliateUsers.map((user) => (
                  <tr key={user.referralId} className="border-t border-gray-100 dark:border-slate-700">
                    <td className="p-3">
                      <div className="font-medium text-gray-800 dark:text-gray-200">{user.name || user.email}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                    </td>
                    <td className="p-3 capitalize text-gray-700 dark:text-gray-300">{user.referralStatus}</td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">
                      {user.subscription?.status || 'none'}
                    </td>
                    <td className="p-3">
                      <button
                        disabled={!user.userId || processingId === user.userId}
                        onClick={() => assignPlanFromAdmin(selectedAffiliateId, user.userId)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Assign Unlimited (Admin)
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminAffiliates;
