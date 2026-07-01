import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import API from '../../api';
import LiveTimeframeSelector from '../../components/analytics/live/LiveTimeframeSelector';

const STRIPE_PURPLE = '#635bff';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'payments', label: 'Payments' },
  { id: 'failed', label: 'Failed' },
  { id: 'customers', label: 'Customers' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'disputes', label: 'Disputes' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'paid_users', label: 'Paid Users' },
  { id: 'webhooks', label: 'Webhooks' },
];

function formatUsd(value, currency = 'usd') {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: (currency || 'usd').toUpperCase(),
  }).format(Number(value));
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  const normalized = String(status || '').toLowerCase();
  const styles = {
    succeeded: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    canceled: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300',
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    in_transit: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    open: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    needs_response: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  };
  const cls = styles[normalized] || 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>
      {status || '—'}
    </span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-gray-200/80 dark:border-slate-700/80 bg-white dark:bg-[#1a1f36] p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function DataTable({ columns, rows, emptyMessage, onRowClick, maxHeight }) {
  return (
    <div
      className="overflow-x-auto rounded-xl border border-gray-200/80 dark:border-slate-700/80"
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
        <thead className="bg-gray-50 dark:bg-[#0a2540]/60 sticky top-0 z-10">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-800 bg-white dark:bg-[#1a1f36]">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                {emptyMessage}
              </td>
            </tr>
          ) : rows.map((row) => (
            <tr
              key={row.key}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? 'cursor-pointer hover:bg-[#635bff]/5 dark:hover:bg-[#635bff]/10' : ''}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 whitespace-nowrap">
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailDrawer({ item, onClose, onAction, actionLoading }) {
  if (!item) return null;
  const data = item.raw || item;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-md z-50 bg-white dark:bg-[#0a2540] border-l border-gray-200 dark:border-slate-700 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white/95 dark:bg-[#0a2540]/95 backdrop-blur border-b border-gray-100 dark:border-slate-800 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-gray-900 dark:text-white">Stripe detail</h2>
            <p className="text-xs text-gray-500 font-mono truncate">{data.id}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:hover:text-white text-xl">×</button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          {Object.entries(data).map(([key, value]) => {
            if (value == null || typeof value === 'object') return null;
            return (
              <div key={key}>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{key}</p>
                <p className="font-medium text-gray-800 dark:text-gray-100 break-all">{String(value)}</p>
              </div>
            );
          })}
          {data.paymentMethod && (
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase">Payment method</p>
              <p>{data.paymentMethod.name || '—'}</p>
              <p className="font-mono capitalize">{data.paymentMethod.brand} •••• {data.paymentMethod.last4}</p>
              <p className="text-xs text-gray-500">{data.paymentMethod.expMonth}/{data.paymentMethod.expYear}</p>
            </div>
          )}
          {data.lastPaymentError && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-3">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase">Failure</p>
              <p>{data.lastPaymentError.message}</p>
              <p className="text-xs text-red-600 dark:text-red-400">{data.lastPaymentError.code} · {data.lastPaymentError.declineCode}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            {data.paymentIntentId && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onAction('cancel-pi', data.paymentIntentId)}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700"
              >
                Cancel payment intent
              </button>
            )}
            {(data.id?.startsWith('ch_') || data.chargeId) && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onAction('refund', { chargeId: data.id?.startsWith('ch_') ? data.id : data.chargeId })}
                className="px-3 py-1.5 text-xs rounded-lg text-white"
                style={{ backgroundColor: STRIPE_PURPLE }}
              >
                Refund
              </button>
            )}
            {data.id?.startsWith('dp_') && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onAction('close-dispute', data.id)}
                className="px-3 py-1.5 text-xs rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
              >
                Close dispute
              </button>
            )}
            {data.id?.startsWith('cus_') && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onAction('block-payments', data.id)}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
              >
                Detach payment methods
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default function AdminStripe() {
  const [window, setWindow] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [report, setReport] = useState(null);
  const [timeframe, setTimeframe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [allPayments, setAllPayments] = useState(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState('');
  const [paidUsers, setPaidUsers] = useState(null);
  const [paidUsersLoading, setPaidUsersLoading] = useState(false);
  const [paidUsersError, setPaidUsersError] = useState('');
  const [paidUsersFilter, setPaidUsersFilter] = useState('all');

  const PAYMENTS_TIMEOUT_MS = 120_000;
  const PAID_USERS_TIMEOUT_MS = 180_000;

  const windowParams = useMemo(() => ({
    window,
    startDate: window === 'custom' && customStart ? new Date(customStart).toISOString() : null,
    endDate: window === 'custom' && customEnd ? new Date(customEnd).toISOString() : null,
  }), [window, customStart, customEnd]);

  const fetchReport = useCallback(async (sync = false) => {
    const token = localStorage.getItem('adminToken');
    const params = new URLSearchParams();
    params.set('window', windowParams.window || '30d');
    if (windowParams.window === 'custom' && windowParams.startDate) params.set('startDate', windowParams.startDate);
    if (windowParams.window === 'custom' && windowParams.endDate) params.set('endDate', windowParams.endDate);

    const url = sync ? `/api/admin/stripe/sync?${params}` : `/api/admin/stripe?${params}`;
    const res = sync
      ? await API.post(url, {}, { headers: { Authorization: `Bearer ${token}` } })
      : await API.get(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.error || !res.data?.success) {
      throw new Error(res.data?.error || res.error || 'Failed to load Stripe report');
    }
    return res.data;
  }, [windowParams]);

  const fetchAllPayments = useCallback(async () => {
    setPaymentsLoading(true);
    setPaymentsError('');
    try {
      const res = await API.get('/api/admin/stripe/payments', { timeout: PAYMENTS_TIMEOUT_MS });
      if (res.error || !res.data?.success) {
        throw new Error(res.data?.error || res.error || 'Failed to load payments');
      }
      setAllPayments(res.data.report);
      return res.data.report;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to load payments';
      setPaymentsError(msg);
      throw err;
    } finally {
      setPaymentsLoading(false);
    }
  }, []);

  const fetchPaidUsers = useCallback(async (sync = false) => {
    setPaidUsersLoading(true);
    setPaidUsersError('');
    try {
      const params = sync ? '?sync=1' : '';
      const res = await API.get(`/api/admin/stripe/paid-users${params}`, { timeout: PAID_USERS_TIMEOUT_MS });
      if (res.error || !res.data?.success) {
        throw new Error(res.data?.error || res.error || 'Failed to load paid users');
      }
      setPaidUsers(res.data.report);
      return res.data.report;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to load paid users';
      setPaidUsersError(msg);
      throw err;
    } finally {
      setPaidUsersLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchReport(false);
      setReport(data.report);
      setTimeframe(data.timeframe);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load Stripe report');
    } finally {
      setLoading(false);
    }
  }, [fetchReport]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError('');
    try {
      const data = await fetchReport(true);
      setReport(data.report);
      setTimeframe(data.timeframe);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [fetchReport]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if ((activeTab === 'payments' || activeTab === 'failed') && report?.available && !allPayments && !paymentsLoading) {
      fetchAllPayments().catch(() => {});
    }
  }, [activeTab, report?.available, allPayments, paymentsLoading, fetchAllPayments]);

  useEffect(() => {
    if (activeTab === 'paid_users' && report?.available && !paidUsers && !paidUsersLoading) {
      fetchPaidUsers(false).catch(() => {});
    }
  }, [activeTab, report?.available, paidUsers, paidUsersLoading, fetchPaidUsers]);

  const summary = report?.summary || {};
  const revenueSeries = report?.revenueSeries || [];
  const displayPayments = allPayments?.payments ?? report?.payments ?? [];
  const displayFailedPayments = allPayments?.failedPayments ?? report?.failedPayments ?? [];
  const paymentsMeta = allPayments?.paymentsMeta ?? report?.paymentsMeta;
  const failedPaymentsMeta = allPayments?.failedPaymentsMeta ?? report?.failedPaymentsMeta;
  const paymentsScope = paymentsMeta?.scope === 'all_time' ? 'all time' : (timeframe?.label || 'this window');

  const paidUsersSummary = paidUsers?.summary || {};
  const paidUserRows = useMemo(() => {
    const rows = paidUsers?.rows || [];
    if (paidUsersFilter === 'active') return rows.filter((r) => r.subscriptionActive);
    if (paidUsersFilter === 'cancelled') return rows.filter((r) => !r.subscriptionActive);
    if (paidUsersFilter === 'attention') return rows.filter((r) => r.reconciliation?.needsAttention);
    return rows;
  }, [paidUsers, paidUsersFilter]);

  const formatPaymentMethod = (pm) => {
    if (!pm?.last4 && !pm?.brand) return '—';
    return `${pm.brand || 'card'} •••• ${pm.last4 || '????'}${pm.name ? ` · ${pm.name}` : ''}`;
  };

  const reconciliationBadge = (row) => {
    if (row.reconciliation?.healthy) {
      return <span className="text-emerald-600 dark:text-emerald-400 text-xs">OK</span>;
    }
    const flags = row.reconciliation?.flags || [];
    return (
      <span className="text-amber-700 dark:text-amber-300 text-xs" title={flags.join(', ')}>
        {flags.includes('no_active_subscription') ? 'Paid, no active sub' : flags[0]?.replace(/_/g, ' ') || 'Issue'}
      </span>
    );
  };

  const runAction = async (type, payload) => {
    const token = localStorage.getItem('adminToken');
    setActionLoading(true);
    setError('');
    try {
      if (type === 'refund') {
        await API.post('/api/admin/stripe/refund', payload, { headers: { Authorization: `Bearer ${token}` } });
      } else if (type === 'close-dispute') {
        await API.post(`/api/admin/stripe/disputes/${payload}/close`, {}, { headers: { Authorization: `Bearer ${token}` } });
      } else if (type === 'cancel-pi') {
        await API.post(`/api/admin/stripe/payment-intents/${payload}/cancel`, {}, { headers: { Authorization: `Bearer ${token}` } });
      } else if (type === 'block-payments') {
        await API.post(`/api/admin/stripe/customers/${payload}/block-payments`, {}, { headers: { Authorization: `Bearer ${token}` } });
      }
      await load();
      setSelected(null);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const paymentCols = [
    { key: 'time', label: 'Date', render: (r) => formatTime(r.at) },
    { key: 'amount', label: 'Amount', render: (r) => formatUsd(r.amount, r.currency) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'customer', label: 'Customer', render: (r) => <span className="font-mono text-xs">{r.customerId || '—'}</span> },
    { key: 'name', label: 'Name', render: (r) => r.paymentMethod?.name || '—' },
    { key: 'card', label: 'Card', render: (r) => (r.paymentMethod?.brand ? `${r.paymentMethod.brand} •••• ${r.paymentMethod.last4}` : '—') },
  ];

  if (loading && !report) {
    return <div className="p-6 text-gray-600 dark:text-gray-300">Loading Stripe dashboard…</div>;
  }

  return (
    <div className="min-h-screen bg-[#f6f9fc] dark:bg-[#0a2540]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: STRIPE_PURPLE }}>S</div>
              <h1 className="text-2xl font-bold text-[#0a2540] dark:text-white">Stripe</h1>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Live data from Stripe API · webhook events from MongoDB
              {timeframe?.label ? ` · ${timeframe.label}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LiveTimeframeSelector
              window={window}
              onChange={setWindow}
              customStart={customStart}
              customEnd={customEnd}
              onCustomChange={({ start, end }) => {
                if (start !== undefined) setCustomStart(start);
                if (end !== undefined) setCustomEnd(end);
              }}
            />
            <button type="button" onClick={load} disabled={loading} className="px-4 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-[#1a1f36]">
              Refresh
            </button>
            <button
              type="button"
              onClick={sync}
              disabled={syncing}
              className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: STRIPE_PURPLE }}
            >
              {syncing ? 'Syncing…' : 'Sync invoices'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {report && report.available === false && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
            {report.error || 'Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env and restart the server.'}
          </div>
        )}

        {report?.available && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              <StatCard label="Gross volume" value={formatUsd(summary.grossVolume)} sub={`${summary.paymentCount || 0} payments`} />
              <StatCard label="Net volume" value={formatUsd(summary.netVolume)} sub={`${formatUsd(summary.refundVolume)} refunded`} />
              <StatCard label="Available balance" value={formatUsd(summary.availableBalance)} sub="Stripe balance" />
              <StatCard label="Pending / in transit" value={formatUsd(summary.pendingBalance)} sub={`${formatUsd(summary.inTransitPayoutTotal)} payouts`} />
              <StatCard label="Failed payments" value={summary.failedPaymentCount ?? 0} sub="In window" />
              <StatCard label="Open disputes" value={summary.openDisputeCount ?? 0} sub={`${summary.disputeCount || 0} total`} />
            </div>

            <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-slate-700 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#635bff] text-[#635bff]'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="bg-white dark:bg-[#1a1f36] rounded-2xl border border-gray-200/80 dark:border-slate-700/80 shadow-sm p-4 sm:p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Revenue</h3>
                    <div className="h-64">
                      {revenueSeries.length === 0 ? (
                        <p className="text-sm text-gray-500 py-12 text-center">No revenue in this window</p>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={revenueSeries}>
                            <defs>
                              <linearGradient id="stripeRev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={STRIPE_PURPLE} stopOpacity={0.35} />
                                <stop offset="100%" stopColor={STRIPE_PURPLE} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-slate-700" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                            <Tooltip formatter={(v) => formatUsd(v)} />
                            <Area type="monotone" dataKey="gross" stroke={STRIPE_PURPLE} fill="url(#stripeRev)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {summary.customerCount || 0} customers · {summary.activeSubscriptions || 0} active subscriptions · {summary.upcomingInvoiceTotal ? formatUsd(summary.upcomingInvoiceTotal) : '$0.00'} upcoming invoices
                  </p>
                </div>
              )}

              {activeTab === 'payments' && (
                <div className="space-y-3">
                  {paymentsLoading && !allPayments && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading all payments from Stripe…</p>
                  )}
                  {paymentsError && (
                    <p className="text-sm text-amber-700 dark:text-amber-300">{paymentsError}</p>
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {paymentsMeta?.scope === 'all_time' ? 'All successful payments from Stripe' : `Successful payments in ${paymentsScope}`}
                    {' · '}
                    {displayPayments.length.toLocaleString()} shown
                    {paymentsMeta?.truncated ? ' · showing first 5,000 (contact Stripe for older records)' : ''}
                  </p>
                  <DataTable
                    emptyMessage={paymentsLoading ? 'Loading payments…' : 'No payments found.'}
                    rows={displayPayments.map((r) => ({ ...r, key: r.id, raw: r }))}
                    columns={paymentCols}
                    onRowClick={setSelected}
                    maxHeight="70vh"
                  />
                </div>
              )}

              {activeTab === 'failed' && (
                <div className="space-y-3">
                  {paymentsLoading && !allPayments && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading failed payments from Stripe…</p>
                  )}
                  {paymentsError && (
                    <p className="text-sm text-amber-700 dark:text-amber-300">{paymentsError}</p>
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {failedPaymentsMeta?.scope === 'all_time' ? 'All failed payments from Stripe' : `Failed payments in ${paymentsScope}`}
                    {' · '}
                    {displayFailedPayments.length.toLocaleString()} shown
                  </p>
                  <DataTable
                    emptyMessage={paymentsLoading ? 'Loading failed payments…' : 'No failed payments found.'}
                    rows={displayFailedPayments.map((r) => ({ ...r, key: r.id, raw: r }))}
                    columns={[
                      ...paymentCols,
                      { key: 'error', label: 'Error', render: (r) => r.failureMessage || r.lastPaymentError?.message || r.failureCode || '—' },
                    ]}
                    onRowClick={setSelected}
                    maxHeight="70vh"
                  />
                </div>
              )}

              {activeTab === 'customers' && (
                <DataTable
                  emptyMessage="No new customers in this window."
                  rows={(report.customers || []).map((r) => ({ ...r, key: r.id, raw: r }))}
                  columns={[
                    { key: 'name', label: 'Name', render: (r) => r.userName || r.name || '—' },
                    { key: 'email', label: 'Email', render: (r) => r.userEmail || r.email || '—' },
                    { key: 'id', label: 'Customer ID', render: (r) => <span className="font-mono text-xs">{r.id}</span> },
                    { key: 'user', label: 'User', render: (r) => r.userId ? <Link to={`/adminbobby/users/${r.userId}`} className="text-[#635bff] hover:underline">View</Link> : '—' },
                    { key: 'created', label: 'Created', render: (r) => formatTime(r.createdAt) },
                  ]}
                  onRowClick={setSelected}
                />
              )}

              {activeTab === 'subscriptions' && (
                <DataTable
                  emptyMessage="No subscriptions in this window."
                  rows={(report.subscriptions || []).map((r) => ({ ...r, key: r.id, raw: r }))}
                  columns={[
                    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'plan', label: 'Plan', render: (r) => r.planNickname || '—' },
                    { key: 'amount', label: 'Amount', render: (r) => formatUsd(r.planAmount) },
                    { key: 'interval', label: 'Interval', render: (r) => r.planInterval || '—' },
                    { key: 'customer', label: 'Customer', render: (r) => <span className="font-mono text-xs">{r.customerId}</span> },
                    { key: 'period', label: 'Period end', render: (r) => formatTime(r.currentPeriodEnd) },
                  ]}
                  onRowClick={setSelected}
                />
              )}

              {activeTab === 'refunds' && (
                <DataTable
                  emptyMessage="No refunds in this window."
                  rows={(report.refunds || []).map((r) => ({ ...r, key: r.id, raw: r }))}
                  columns={[
                    { key: 'time', label: 'Date', render: (r) => formatTime(r.at) },
                    { key: 'amount', label: 'Amount', render: (r) => formatUsd(r.amount, r.currency) },
                    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
                    { key: 'charge', label: 'Charge', render: (r) => <span className="font-mono text-xs">{r.chargeId || '—'}</span> },
                  ]}
                  onRowClick={setSelected}
                />
              )}

              {activeTab === 'disputes' && (
                <DataTable
                  emptyMessage="No disputes in this window."
                  rows={(report.disputes || []).map((r) => ({ ...r, key: r.id, raw: r }))}
                  columns={[
                    { key: 'time', label: 'Date', render: (r) => formatTime(r.at) },
                    { key: 'amount', label: 'Amount', render: (r) => formatUsd(r.amount, r.currency) },
                    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
                    { key: 'due', label: 'Evidence due', render: (r) => formatTime(r.evidenceDueBy) },
                  ]}
                  onRowClick={setSelected}
                />
              )}

              {activeTab === 'invoices' && (
                <DataTable
                  emptyMessage="No invoices in this window."
                  rows={(report.invoices || []).map((r) => ({ ...r, key: r.id, raw: r }))}
                  columns={[
                    { key: 'number', label: 'Invoice', render: (r) => r.number || r.id },
                    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'amount', label: 'Amount', render: (r) => formatUsd(r.amountPaid || r.amountDue, r.currency) },
                    { key: 'customer', label: 'Customer', render: (r) => <span className="font-mono text-xs">{r.customerId}</span> },
                    { key: 'pdf', label: 'PDF', render: (r) => r.invoicePdf ? <a href={r.invoicePdf} target="_blank" rel="noreferrer" className="text-[#635bff] hover:underline" onClick={(e) => e.stopPropagation()}>Open</a> : '—' },
                  ]}
                  onRowClick={setSelected}
                />
              )}

              {activeTab === 'payouts' && (
                <DataTable
                  emptyMessage="No payouts found."
                  rows={(report.payouts || []).map((r) => ({ ...r, key: r.id, raw: r }))}
                  columns={[
                    { key: 'time', label: 'Created', render: (r) => formatTime(r.at) },
                    { key: 'amount', label: 'Amount', render: (r) => formatUsd(r.amount, r.currency) },
                    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'arrival', label: 'Arrives', render: (r) => formatTime(r.arrivalDate) },
                    { key: 'method', label: 'Method', render: (r) => r.method || '—' },
                  ]}
                  onRowClick={setSelected}
                />
              )}

              {activeTab === 'upcoming' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">Upcoming invoices</h3>
                    <DataTable
                      emptyMessage="No upcoming invoices."
                      rows={(report.upcomingInvoices || []).map((r) => ({ ...r, key: r.id, raw: r }))}
                      columns={[
                        { key: 'due', label: 'Due', render: (r) => formatTime(r.dueDate) },
                        { key: 'amount', label: 'Amount due', render: (r) => formatUsd(r.amountDue, r.currency) },
                        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                        { key: 'customer', label: 'Customer', render: (r) => <span className="font-mono text-xs">{r.customerId}</span> },
                      ]}
                      onRowClick={setSelected}
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">Active subscriptions (renewals)</h3>
                    <DataTable
                      emptyMessage="No active subscriptions."
                      rows={(report.upcomingSubscriptions || []).map((r) => ({ ...r, key: r.id, raw: r }))}
                      columns={[
                        { key: 'plan', label: 'Plan', render: (r) => r.planNickname || '—' },
                        { key: 'amount', label: 'Amount', render: (r) => formatUsd(r.planAmount) },
                        { key: 'renews', label: 'Renews', render: (r) => formatTime(r.currentPeriodEnd) },
                        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                      ]}
                      onRowClick={setSelected}
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">In transit to bank</h3>
                    <DataTable
                      emptyMessage="No payouts in transit."
                      rows={(report.inTransitPayouts || []).map((r) => ({ ...r, key: r.id, raw: r }))}
                      columns={[
                        { key: 'amount', label: 'Amount', render: (r) => formatUsd(r.amount, r.currency) },
                        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                        { key: 'arrival', label: 'Arrival', render: (r) => formatTime(r.arrivalDate) },
                      ]}
                      onRowClick={setSelected}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'webhooks' && (
                <DataTable
                  emptyMessage="No webhook events in this window."
                  rows={(report.webhookEvents || []).map((r) => ({ ...r, key: r.id, raw: r }))}
                  columns={[
                    { key: 'time', label: 'Received', render: (r) => formatTime(r.at) },
                    { key: 'type', label: 'Event type', render: (r) => <span className="font-mono text-xs">{r.type}</span> },
                    { key: 'processed', label: 'Processed', render: (r) => (r.processed ? 'Yes' : 'No') },
                    { key: 'error', label: 'Error', render: (r) => r.error || '—' },
                    { key: 'retries', label: 'Retries', render: (r) => r.retryCount ?? 0 },
                  ]}
                  onRowClick={setSelected}
                />
              )}

              {activeTab === 'paid_users' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Every paid Stripe subscription invoice reconciled with OtoDial users and plans
                        {paidUsersSummary.totalInvoices != null ? ` · ${paidUsersSummary.totalInvoices.toLocaleString()} invoices` : ''}
                        {paidUsers?.truncated ? ' · list may be truncated' : ''}
                      </p>
                      {paidUsersSummary.needsAttention > 0 && (
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                          {paidUsersSummary.needsAttention} paid invoice(s) need attention (e.g. $70 SMS paid but no active subscription in Users)
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {['all', 'active', 'cancelled', 'attention'].map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setPaidUsersFilter(filter)}
                          className={`px-3 py-1.5 text-xs rounded-lg border ${
                            paidUsersFilter === filter
                              ? 'border-[#635bff] bg-[#635bff]/10 text-[#635bff]'
                              : 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {filter === 'all' ? 'All' : filter === 'attention' ? 'Needs attention' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => fetchPaidUsers(true).catch(() => {})}
                        disabled={paidUsersLoading}
                        className="px-3 py-1.5 text-xs rounded-lg text-white disabled:opacity-50"
                        style={{ backgroundColor: STRIPE_PURPLE }}
                      >
                        {paidUsersLoading ? 'Syncing…' : 'Sync from Stripe'}
                      </button>
                    </div>
                  </div>

                  {paidUsersLoading && !paidUsers && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading paid users from Stripe and MongoDB…</p>
                  )}
                  {paidUsersError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{paidUsersError}</p>
                  )}

                  {paidUsers?.summary && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <StatCard label="Paid invoices" value={paidUsersSummary.totalInvoices ?? 0} sub={`${paidUsersSummary.uniqueCustomers ?? 0} customers`} />
                      <StatCard label="Active plans" value={paidUsersSummary.activeSubscriptions ?? 0} sub="Stripe or Mongo active" />
                      <StatCard label="Needs attention" value={paidUsersSummary.needsAttention ?? 0} sub="Paid but missing active sub" />
                      <StatCard label="Stripe fetched" value={paidUsersSummary.stripeInvoicesFetched ?? 0} sub={`+${paidUsersSummary.mongoInvoicesIncluded ?? 0} Mongo-only`} />
                    </div>
                  )}

                  <DataTable
                    emptyMessage={paidUsersLoading ? 'Loading paid users…' : 'No paid subscription invoices found.'}
                    rows={paidUserRows.map((r) => ({ ...r, key: r.key || r.invoiceId, raw: r }))}
                    columns={[
                      { key: 'paidAt', label: 'Paid', render: (r) => formatTime(r.paidAt) },
                      { key: 'amount', label: 'Amount', render: (r) => formatUsd(r.amountPaid, r.currency) },
                      { key: 'plan', label: 'OtoDial plan', render: (r) => (
                        <div>
                          <p className="font-medium">{r.otodialPlanName || r.stripePlanLabel || '—'}</p>
                          {r.stripePriceId && <p className="text-[10px] font-mono text-gray-400 truncate max-w-[140px]">{r.stripePriceId}</p>}
                        </div>
                      ) },
                      { key: 'user', label: 'User', render: (r) => (
                        <div>
                          <p>{r.userName || '—'}</p>
                          <p className="text-xs text-gray-500">{r.userEmail || '—'}</p>
                        </div>
                      ) },
                      { key: 'status', label: 'Subscription', render: (r) => (
                        <div className="space-y-0.5">
                          <StatusBadge status={r.subscriptionActive ? 'active' : (r.stripeSubscriptionStatus || r.mongoSubscriptionStatus || 'canceled')} />
                          {r.cancelAtPeriodEnd && <p className="text-[10px] text-amber-600">Cancels at period end</p>}
                        </div>
                      ) },
                      { key: 'invoice', label: 'Invoice', render: (r) => (
                        <span className="font-mono text-xs">{r.invoiceNumber || r.invoiceId || '—'}</span>
                      ) },
                      { key: 'payment', label: 'Payment method', render: (r) => formatPaymentMethod(r.paymentMethod) },
                      { key: 'upcoming', label: 'Next payment', render: (r) => (
                        r.upcomingPaymentDate
                          ? `${formatTime(r.upcomingPaymentDate)} · ${formatUsd(r.upcomingPaymentAmount, r.currency)}`
                          : '—'
                      ) },
                      { key: 'reconcile', label: 'Reconcile', render: reconciliationBadge },
                      { key: 'link', label: '', render: (r) => (
                        r.userId
                          ? <Link to={`/adminbobby/users/${r.userId}`} className="text-[#635bff] hover:underline text-xs" onClick={(e) => e.stopPropagation()}>User</Link>
                          : '—'
                      ) },
                    ]}
                    onRowClick={setSelected}
                    maxHeight="70vh"
                  />
                </div>
              )}
            </div>
          </>
        )}

        <DetailDrawer
          item={selected}
          onClose={() => setSelected(null)}
          onAction={runAction}
          actionLoading={actionLoading}
        />
      </div>
    </div>
  );
}
