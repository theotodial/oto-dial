import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api';

function AdminCalls() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    userId: '',
    direction: '',
    status: '',
    startDate: '',
    endDate: ''
  });
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState('');
  const [liveDebug, setLiveDebug] = useState({
    activeCalls: [],
    webhookEvents: [],
    failures: [],
    throttleEvents: [],
  });
  const [sipDebug, setSipDebug] = useState(null);

  useEffect(() => {
    fetchCalls();
  }, [page, filters]);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const [liveResp, sipResp] = await Promise.all([
          API.get('/api/admin/calls/debug/live', {
            headers: { Authorization: `Bearer ${token}` }
          }),
          API.get('/api/admin/calls/debug/sip-identities', {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        if (!mounted) return;
        if (liveResp.data?.success) {
          setLiveDebug({
            activeCalls: liveResp.data.activeCalls || [],
            webhookEvents: liveResp.data.webhookEvents || [],
            failures: liveResp.data.failures || [],
            throttleEvents: liveResp.data.throttleEvents || [],
          });
        }
        if (sipResp.data?.success) {
          setSipDebug(sipResp.data);
        }
      } catch (e) {
        // Keep panel best-effort; main calls table should stay usable.
        console.warn('Live call debug fetch failed:', e?.message || e);
      }
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const fetchCalls = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', '50');
      if (filters.search) params.append('search', filters.search);
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.direction) params.append('direction', filters.direction);
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await API.get(`/api/admin/calls?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        setCalls(response.data.calls || []);
        setTotalPages(response.data.pagination?.pages || 1);
        setTotals(response.data.totals);
      } else {
        setError('Failed to load calls');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      } else {
        setError(err.response?.data?.error || 'Failed to load calls');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleCallClick = (callId) => {
    // Could open a detail modal or navigate to detail page
    console.log('Call clicked:', callId);
  };

  const exportCSV = () => {
    const headers = ['Call ID', 'User', 'From', 'To', 'Direction', 'Status', 'Duration (sec)', 'Billed Minutes', 'Cost', 'Date'];
    const rows = calls.map(call => [
      call.callId || call.id,
      call.userEmail || 'N/A',
      call.fromNumber || 'N/A',
      call.toNumber || 'N/A',
      call.direction,
      call.status,
      call.durationSeconds,
      call.billedMinutes?.toFixed(2) || 0,
      `$${call.totalCost?.toFixed(4) || '0.0000'}`,
      new Date(call.createdAt).toLocaleString()
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calls-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading && calls.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading calls...</p>
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
              <button
                onClick={() => navigate('/adminbobby/dashboard')}
                className="text-indigo-600 hover:text-indigo-700 mb-2"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Calls Management</h1>
              {totals && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Total: {totals.totalCalls} calls | ${totals.totalCost?.toFixed(2)} cost | {totals.totalMinutes?.toFixed(2)} minutes
                </p>
              )}
            </div>
            <button
              onClick={exportCSV}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Live Call Debug (Temporary)</h2>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 text-xs">
            <div className="border border-gray-200 dark:border-slate-700 rounded p-3">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Active Calls</h3>
              <div className="space-y-2 max-h-56 overflow-auto">
                {liveDebug.activeCalls.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">No active calls</p>
                ) : liveDebug.activeCalls.map((c) => (
                  <div key={c.callId} className="bg-gray-50 dark:bg-slate-900 rounded p-2">
                    <div>{c.from} → {c.to}</div>
                    <div>Status: {c.status}</div>
                    <div>Answered: {c.answeredAt ? new Date(c.answeredAt).toLocaleTimeString() : '—'}</div>
                    <div>Bridged: {c.bridgedAt ? new Date(c.bridgedAt).toLocaleTimeString() : '—'}</div>
                    <div>Fail: {c.failReason || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-gray-200 dark:border-slate-700 rounded p-3">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Recent Webhook Events</h3>
              <div className="space-y-2 max-h-56 overflow-auto">
                {liveDebug.webhookEvents.slice(0, 20).map((e, idx) => (
                  <div key={`${e.at || ''}-${idx}`} className="bg-gray-50 dark:bg-slate-900 rounded p-2">
                    <div>{e.eventType || 'event'} @ {e.state || 'n/a'}</div>
                    <div>{e.from || '—'} → {e.to || '—'}</div>
                    <div>cc: {e.callControlId || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-gray-200 dark:border-slate-700 rounded p-3">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Throttle / fraud (soft)</h3>
              <div className="space-y-2 max-h-56 overflow-auto">
                {(liveDebug.throttleEvents || []).length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">No recent throttle events</p>
                ) : (
                  liveDebug.throttleEvents.slice(0, 25).map((e, idx) => (
                    <div key={`${e.at || ''}-${idx}`} className="bg-gray-50 dark:bg-slate-900 rounded p-2 font-mono">
                      <div>{e.kind || 'event'} {e.level != null ? `(L${e.level})` : ''}</div>
                      <div>user: {e.userId || '—'}</div>
                      <div>{e.channel || ''} {e.reason || e.metric || ''}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="border border-gray-200 dark:border-slate-700 rounded p-3 lg:col-span-4">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">SIP / Identity Check</h3>
              {sipDebug ? (
                <div className="space-y-1 text-gray-700 dark:text-gray-300">
                  <div>Unique per account: {String(sipDebug.summary?.uniqueSipIdentityPerAccount)}</div>
                  <div>Connection: {sipDebug.globalCredentials?.connectionId || '—'}</div>
                  <div>SIP user: {sipDebug.globalCredentials?.sipUsername || '—'}</div>
                  <div className="text-amber-600 dark:text-amber-400 mt-2">
                    {sipDebug.summary?.reason}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">Loading SIP diagnostics...</p>
              )}
            </div>
          </div>
          <div className="mt-4 border border-gray-200 dark:border-slate-700 rounded p-3 text-xs">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Recent failed / missed</h3>
            <div className="space-y-2 max-h-40 overflow-auto">
              {(liveDebug.failures || []).length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">None</p>
              ) : (
                liveDebug.failures.slice(0, 15).map((f) => (
                  <div key={f.callId} className="bg-gray-50 dark:bg-slate-900 rounded p-2">
                    <div>
                      {f.from || '—'} → {f.to || '—'} ({f.status})
                    </div>
                    <div className="text-gray-600 dark:text-gray-400">{f.failReason || f.hangupCause || '—'}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <input
              type="text"
              placeholder="Search..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
            <select
              value={filters.direction}
              onChange={(e) => handleFilterChange('direction', e.target.value)}
              className="px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            >
              <option value="">All Directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            >
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="missed">Missed</option>
            </select>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
            <button
              onClick={() => setFilters({ search: '', userId: '', direction: '', status: '', startDate: '', endDate: '' })}
              className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Calls Table */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Call ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">From</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">To</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Direction</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cost</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                {calls.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      No calls found
                    </td>
                  </tr>
                ) : (
                  calls.map((call) => (
                    <tr
                      key={call.id}
                      onClick={() => handleCallClick(call.id)}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                        {call.callId?.slice(-8) || call.id.toString().slice(-8)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {call.userEmail || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {call.fromNumber || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {call.toNumber || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          call.direction === 'inbound' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                          'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                        }`}>
                          {call.direction}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          call.status === 'completed' ? 'bg-green-100 text-green-800' :
                          call.status === 'failed' || call.status === 'missed' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {call.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {call.durationSeconds}s ({call.billedMinutes?.toFixed(2)} min)
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                        ${call.totalCost?.toFixed(4) || '0.0000'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(call.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}

export default AdminCalls;
