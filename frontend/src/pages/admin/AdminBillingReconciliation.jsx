import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import API from '../../api';

const SEVERITY_STYLES = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  info: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function AdminBillingReconciliation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [days, setDays] = useState(Number(searchParams.get('days')) || 7);
  const [userId, setUserId] = useState(searchParams.get('userId') || '');
  const [tab, setTab] = useState(searchParams.get('tab') || 'system');

  const [systemReport, setSystemReport] = useState(null);
  const [userReport, setUserReport] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const authHeaders = () => {
    const token = localStorage.getItem('adminToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadSystem = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.get(`/api/admin/analytics/billing/reconciliation?days=${days}`, {
        headers: authHeaders(),
      });
      setSystemReport(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'System scan failed');
    } finally {
      setLoading(false);
    }
  }, [days]);

  const loadUser = useCallback(async (uid) => {
    if (!uid) return;
    setLoading(true);
    setError('');
    try {
      const [reconRes, ledgerRes] = await Promise.all([
        API.get(`/api/admin/analytics/billing/reconciliation/${uid}?days=${days}`, {
          headers: authHeaders(),
        }),
        API.get(`/api/admin/analytics/billing/ledger/${uid}?pageSize=50`, {
          headers: authHeaders(),
        }),
      ]);
      setUserReport(reconRes.data);
      setLedger(ledgerRes.data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'User reconciliation failed');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (tab === 'system') loadSystem();
  }, [tab, loadSystem]);

  useEffect(() => {
    const uid = searchParams.get('userId');
    if (uid) {
      setUserId(uid);
      setTab('user');
      loadUser(uid);
    }
  }, [searchParams, loadUser]);

  const runUserScan = (e) => {
    e?.preventDefault();
    if (!userId.trim()) return;
    setSearchParams({ userId: userId.trim(), tab: 'user', days: String(days) });
    loadUser(userId.trim());
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Billing Reconciliation</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Verify wallet ↔ ledger consistency, call events, SMS segments, and reservation release.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Lookback</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm px-2 py-1.5"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700">
        {['system', 'user'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {t === 'system' ? 'System scan' : 'User drill-down'}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {tab === 'user' && (
        <form onSubmit={runUserScan} className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">User ID</label>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="MongoDB user _id"
              className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm min-w-[240px]"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !userId.trim()}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
          >
            Scan user
          </button>
          {userReport?.userId && (
            <Link
              to={`/adminbobby/users/${userReport.userId}`}
              className="text-sm text-indigo-600 dark:text-indigo-400 py-2"
            >
              Open user profile →
            </Link>
          )}
        </form>
      )}

      {loading && <p className="text-sm text-gray-500">Scanning…</p>}

      {tab === 'system' && systemReport && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Users scanned', systemReport.usersScanned],
              ['Healthy', systemReport.healthyUsers],
              ['With issues', systemReport.usersWithIssues],
              ['Critical', systemReport.totalCritical],
            ].map(([label, val]) => (
              <div key={label} className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{val ?? 0}</p>
              </div>
            ))}
          </div>

          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              systemReport.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
            }`}
          >
            {systemReport.ok
              ? 'No critical billing inconsistencies detected in this scan.'
              : `Found ${systemReport.totalCritical} critical and ${systemReport.totalWarning} warning issues.`}
          </div>

          {systemReport.userReports?.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">User</th>
                    <th className="px-4 py-2">Critical</th>
                    <th className="px-4 py-2">Warning</th>
                    <th className="px-4 py-2">Top issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {systemReport.userReports.map((row) => (
                    <tr key={row.userId} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          className="text-indigo-600 dark:text-indigo-400 font-mono text-xs"
                          onClick={() => {
                            setUserId(row.userId);
                            setTab('user');
                            setSearchParams({ userId: row.userId, tab: 'user', days: String(days) });
                            loadUser(row.userId);
                          }}
                        >
                          {row.email || row.userId}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-red-600">{row.critical}</td>
                      <td className="px-4 py-2 text-amber-600">{row.warning}</td>
                      <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                        {(row.topIssues || []).map((i) => i.code).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={loadSystem}
            className="text-sm text-indigo-600 dark:text-indigo-400"
          >
            Re-run system scan
          </button>
        </div>
      )}

      {tab === 'user' && userReport && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
              <p className="text-xs text-gray-500">Wallet balance</p>
              <p className="text-xl font-bold">{userReport.wallet?.wallet?.subscriptionBalance ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
              <p className="text-xs text-gray-500">Ledger balance</p>
              <p className="text-xl font-bold">{userReport.wallet?.wallet?.ledgerBalance ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
              <p className="text-xs text-gray-500">Calls scanned</p>
              <p className="text-xl font-bold">{userReport.calls?.scanned ?? 0}</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
              <p className="text-xs text-gray-500">SMS scanned</p>
              <p className="text-xl font-bold">{userReport.sms?.scanned ?? 0}</p>
            </div>
          </div>

          {(userReport.issues || []).length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-800">
              {userReport.issues.slice(0, 30).map((issue, idx) => (
                <div key={`${issue.code}-${idx}`} className="px-4 py-3 flex gap-3 items-start">
                  <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.info}`}>
                    {issue.severity}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{issue.message}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{issue.code}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {ledger?.entries?.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Credit Ledger Explorer</h2>
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="bg-gray-50 dark:bg-slate-800 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Label</th>
                      <th className="px-3 py-2">Credits</th>
                      <th className="px-3 py-2">Balance</th>
                      <th className="px-3 py-2">Call</th>
                      <th className="px-3 py-2">Telnyx ID</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {ledger.entries.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{formatWhen(row.timestamp)}</td>
                        <td className="px-3 py-2">{row.label}</td>
                        <td className={`px-3 py-2 font-mono tabular-nums ${Number(row.amount) >= 0 ? 'text-emerald-600' : ''}`}>
                          {row.creditsDisplay}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums">{Math.round(row.remainingBalance)}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.callId ? (
                            <Link to={`/adminbobby/calls?callId=${row.callId}`} className="text-indigo-600">
                              {row.callId.slice(-8)}
                            </Link>
                          ) : row.smsId ? (
                            <span className="text-gray-500">sms:{row.smsId.slice(-8)}</span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500 max-w-[120px] truncate">
                          {row.telnyxCallId || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">{row.billingStatus}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 max-w-[160px] truncate" title={row.reason}>
                          {row.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminBillingReconciliation;
