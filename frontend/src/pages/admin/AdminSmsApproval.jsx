import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api';

function AdminSmsApproval() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    userId: '',
    startDate: '',
    endDate: '',
  });
  const [flagUserId, setFlagUserId] = useState('');
  const [flagBusy, setFlagBusy] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [rejectReason, setRejectReason] = useState({});
  const [error, setError] = useState('');

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '50');
      if (filters.search) params.append('search', filters.search);
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await API.get(`/api/admin/sms/approval?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        setItems(response.data.items || []);
        setTotalPages(response.data.pagination?.pages || 1);
      } else {
        setError('Failed to load pending SMS');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      } else {
        setError(err.response?.data?.error || 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate, page, filters]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const approve = async (id) => {
    setActionId(id);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const res = await API.post(
        `/api/admin/sms/approval/${id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.error || !res.data?.success) {
        setError(res.error || res.data?.error || 'Approve failed');
      } else {
        await fetchPending();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Approve failed');
    } finally {
      setActionId(null);
    }
  };

  const reject = async (id) => {
    setActionId(id);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const reason = rejectReason[id] || '';
      const res = await API.post(
        `/api/admin/sms/approval/${id}/reject`,
        { reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.error || !res.data?.success) {
        setError(res.error || res.data?.error || 'Reject failed');
      } else {
        await fetchPending();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Reject failed');
    } finally {
      setActionId(null);
    }
  };

  const applyUserFlag = async (flagged) => {
    const uid = String(flagUserId || '').trim();
    if (!uid) {
      setError('Enter a user ID to flag or unflag');
      return;
    }
    setFlagBusy(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const res = await API.patch(
        `/api/admin/users/${uid}/sms-approval`,
        { flagged, resetWarmup: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.error || !res.data?.success) {
        setError(res.error || res.data?.error || 'Update failed');
      } else {
        setFlagUserId('');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    } finally {
      setFlagBusy(false);
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading SMS Approval…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SMS Approval</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Review outbound SMS from flagged accounts. First five sends per flagged user bypass this queue;
            subsequent messages wait here until approved or rejected. End users always see “sent” in the app.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Flag user for review</h2>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">User ID</label>
              <input
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                placeholder="MongoDB user _id"
                value={flagUserId}
                onChange={(e) => setFlagUserId(e.target.value)}
              />
            </div>
            <button
              type="button"
              disabled={flagBusy}
              onClick={() => applyUserFlag(true)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm disabled:opacity-50"
            >
              Flag for approval
            </button>
            <button
              type="button"
              disabled={flagBusy}
              onClick={() => applyUserFlag(false)}
              className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm disabled:opacity-50"
            >
              Remove flag
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <input
              className="px-3 py-2 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
              placeholder="Search text (to, from, body)"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
            <input
              className="px-3 py-2 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
              placeholder="Filter by user ID"
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
            />
            <input
              type="date"
              className="px-3 py-2 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
            />
            <input
              type="date"
              className="px-3 py-2 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-400">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">From → To</th>
                  <th className="py-2 pr-4">Credits</th>
                  <th className="py-2 pr-4">Message</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No messages awaiting approval.
                    </td>
                  </tr>
                )}
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-slate-700 align-top">
                    <td className="py-3 pr-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="text-gray-900 dark:text-white font-medium">{row.userEmail || '—'}</div>
                      <div className="text-xs text-gray-500 font-mono">{row.userId ? String(row.userId) : ''}</div>
                    </td>
                    <td className="py-3 pr-4 text-xs font-mono">
                      {row.from} → {row.to}
                    </td>
                    <td className="py-3 pr-4">
                      {row.smsCostInfo?.costDeducted != null
                        ? `${row.smsCostInfo.costDeducted} credits`
                        : '—'}
                    </td>
                    <td className="py-3 pr-4 max-w-md break-words text-gray-800 dark:text-gray-200">
                      {row.body}
                    </td>
                    <td className="py-3 pr-4 space-y-2">
                      <button
                        type="button"
                        disabled={actionId === row.id}
                        onClick={() => approve(row.id)}
                        className="mr-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actionId === row.id}
                        onClick={() => reject(row.id)}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <input
                        className="mt-1 w-full px-2 py-1 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                        placeholder="Reject reason (internal)"
                        value={rejectReason[row.id] || ''}
                        onChange={(e) =>
                          setRejectReason((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded border text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="py-1 text-sm text-gray-600">
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded border text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminSmsApproval;
