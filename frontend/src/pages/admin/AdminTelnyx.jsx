import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../../api';
import LiveTimeframeSelector from '../../components/analytics/live/LiveTimeframeSelector';
import TelnyxCostPanel, { formatTime, formatUsd } from '../../components/admin/TelnyxCostPanel';
import TelnyxStatCard from '../../components/admin/TelnyxStatCard';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'deposits', label: 'Balance history' },
  { id: 'upcoming', label: 'Upcoming costs' },
  { id: 'users', label: 'User spend' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'calls', label: 'Call costs' },
  { id: 'sms', label: 'SMS costs' },
  { id: 'ledger', label: 'Cost ledger' },
];

function formatWindowLabel(windowKey) {
  const labels = {
    '5m': '5 min', '10m': '10 min', '15m': '15 min', '30m': '30 min', '45m': '45 min',
    '1h': '1 hour', '2h': '2 hours', '3h': '3 hours', '4h': '4 hours', '5h': '5 hours',
    '6h': '6 hours', '12h': '12 hours', '24h': '24 hours', '48h': '48 hours', '72h': '72 hours',
    '7d': '7 days', '14d': '14 days', '21d': '21 days', '30d': '30 days', '60d': '60 days',
    '90d': '90 days', all: 'all time', custom: 'custom range',
  };
  return labels[windowKey] || windowKey;
}

function DataTable({ columns, rows, emptyMessage }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
        <thead className="bg-gray-50 dark:bg-slate-700">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {emptyMessage}
              </td>
            </tr>
          ) : rows.map((row) => (
            <tr key={row.key} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
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

export default function AdminTelnyx() {
  const [window, setWindow] = useState('24h');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [report, setReport] = useState(null);
  const [timeframe, setTimeframe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const windowParams = useMemo(() => ({
    window,
    startDate: window === 'custom' && customStart ? new Date(customStart).toISOString() : null,
    endDate: window === 'custom' && customEnd ? new Date(customEnd).toISOString() : null,
  }), [window, customStart, customEnd]);

  const fetchReport = useCallback(async () => {
    const token = localStorage.getItem('adminToken');
    const params = new URLSearchParams();
    params.set('window', windowParams.window || '24h');
    if (windowParams.window === 'custom' && windowParams.startDate) params.set('startDate', windowParams.startDate);
    if (windowParams.window === 'custom' && windowParams.endDate) params.set('endDate', windowParams.endDate);

    const res = await API.get(`/api/admin/telnyx?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.data?.success) throw new Error(res.data?.error || 'Failed to load Telnyx report');
    return res.data;
  }, [windowParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchReport();
      setReport(data.report);
      setTimeframe(data.timeframe);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load Telnyx report');
    } finally {
      setLoading(false);
    }
  }, [fetchReport]);

  const syncTelnyx = useCallback(async () => {
    const token = localStorage.getItem('adminToken');
    setSyncing(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('window', windowParams.window || '24h');
      if (windowParams.window === 'custom' && windowParams.startDate) params.set('startDate', windowParams.startDate);
      if (windowParams.window === 'custom' && windowParams.endDate) params.set('endDate', windowParams.endDate);

      const res = await API.post(`/api/admin/telnyx/sync?${params.toString()}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.data?.success) throw new Error(res.data?.error || 'Sync failed');
      setReport(res.data.report);
      setTimeframe(res.data.timeframe);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to sync Telnyx costs');
    } finally {
      setSyncing(false);
    }
  }, [windowParams]);

  useEffect(() => {
    load();
  }, [load]);

  const windowLabel = timeframe?.label ? formatWindowLabel(timeframe.label) : formatWindowLabel(window);
  const totals = report?.totals || {};
  const userSpend = report?.userSpend || [];
  const callDetails = report?.callDetails || [];
  const smsDetails = report?.smsDetails || [];
  const numberInventory = report?.numberInventory || [];
  const ledgerSummary = report?.ledgerSummary || { byType: [] };
  const balanceHistory = report?.balanceHistory || null;
  const upcomingCosts = report?.upcomingCosts || null;

  if (loading && !report) {
    return <div className="p-6 text-gray-600 dark:text-gray-300">Loading Telnyx report…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Telnyx</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Balance, costs, number inventory, and per-user Telnyx spend for the selected window.
            </p>
            {timeframe?.start && (
              <p className="text-xs text-gray-500 mt-1">
                {formatTime(timeframe.start)} → {formatTime(timeframe.end)}
              </p>
            )}
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
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <TelnyxCostPanel
          telnyx={report}
          windowLabel={windowLabel}
          syncing={syncing}
          onSync={syncTelnyx}
          showFullPageLink={false}
          storageKey="admin-telnyx-page-panel-minimized"
        />

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <TelnyxStatCard label="Call cost total" value={formatUsd(totals.callCostTotal)} sub={`${totals.callRecords || 0} records`} />
          <TelnyxStatCard label="SMS cost total" value={formatUsd(totals.smsCostTotal)} sub={`${totals.smsRecords || 0} records`} />
          <TelnyxStatCard
            label="Number cost (monthly MRC)"
            value={formatUsd(totals.numberCostTotal)}
            sub={`${totals.activeNumbers || 0} numbers · ${formatUsd(totals.numberCostPeriodTotal)} in ${windowLabel}${totals.numberCostSource ? ` · ${totals.numberCostSource.replace(/_/g, ' ')}` : ''}`}
          />
          <TelnyxStatCard label="Ledger total" value={formatUsd(ledgerSummary.totalCost)} sub="Immutable TelnyxCost ledger" />
          <TelnyxStatCard label="Total deposited" value={formatUsd(balanceHistory?.totalDeposited)} sub={`${balanceHistory?.depositCount || 0} entries · ${balanceHistory?.lookbackDays || 0}d lookback`} />
          <TelnyxStatCard
            label="Upcoming (est.)"
            value={formatUsd(upcomingCosts?.totalEstimated)}
            sub={`${formatUsd(upcomingCosts?.monthlyNumberRenewal)} number MRC/mo · ${formatUsd(upcomingCosts?.balancePending)} pending`}
          />
        </div>

        <div className="border-b border-gray-200 dark:border-slate-700 overflow-x-auto">
          <nav className="flex space-x-6 min-w-max">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
          {activeTab === 'overview' && (
            <div className="p-4 sm:p-6 space-y-4 text-sm text-gray-700 dark:text-gray-300">
              <p>
                Compare Telnyx API billing ({formatUsd(report?.window?.api?.totalCost)}) with webhook-backed local records ({formatUsd(report?.window?.webhook?.totalCost)}) for {windowLabel}.
              </p>
              <p>
                <span className="font-medium">Balance history</span> lists deposits and credits synced from Telnyx payment, audit, and billing APIs (up to {balanceHistory?.lookbackDays || 730} days).
                {' '}
                <span className="font-medium">Upcoming costs</span> combines Telnyx pending balance, current-period charges, and estimated number costs.
              </p>
              <p>
                Use the tabs above for user-level spend, active number assignments, detailed call/SMS cost rows, and the immutable cost ledger.
              </p>
            </div>
          )}

          {activeTab === 'deposits' && (
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Historic balance added to Telnyx through {formatTime(balanceHistory?.lookbackEnd)}.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Total deposited: {formatUsd(balanceHistory?.totalDeposited)} · {balanceHistory?.depositCount || 0} entries
                    {balanceHistory?.fetchedAt ? ` · fetched ${formatTime(balanceHistory.fetchedAt)}` : ''}
                  </p>
                </div>
              </div>
              {(balanceHistory?.notes || []).length > 0 && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                  {balanceHistory.notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              )}
              <DataTable
                emptyMessage="No balance deposits found in the lookback period."
                rows={(balanceHistory?.deposits || []).map((row) => ({ ...row, key: row.id }))}
                columns={[
                  { key: 'time', label: 'Date & time', render: (row) => formatTime(row.at) },
                  { key: 'amount', label: 'Amount', render: (row) => formatUsd(row.amount) },
                  {
                    key: 'type',
                    label: 'Type',
                    render: (row) => ({
                      manual_deposit: 'Manual deposit',
                      auto_recharge: 'Auto-recharge',
                      audit_event: 'Audit event',
                      balance_credit: 'Balance credit',
                      billing_adjustment: 'Billing adjustment',
                      invoice: 'Invoice',
                      billing_credit: 'Billing credit',
                    }[row.type] || row.type || '—'),
                  },
                  { key: 'source', label: 'Source', render: (row) => row.source || '—' },
                  { key: 'description', label: 'Description', render: (row) => row.description || '—' },
                  { key: 'status', label: 'Status', render: (row) => row.status || '—' },
                ]}
              />
            </div>
          )}

          {activeTab === 'upcoming' && (
            <div className="p-4 sm:p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TelnyxStatCard
                  label="Monthly number renewal (MRC)"
                  value={formatUsd(upcomingCosts?.monthlyNumberRenewal)}
                  sub={upcomingCosts?.numberRenewal?.numberCount
                    ? `${upcomingCosts.numberRenewal.numberCount} numbers from Telnyx breakdown`
                    : `${upcomingCosts?.numberProjection?.activeCount || 0} numbers estimated`}
                />
                <TelnyxStatCard
                  label="Estimated upcoming total"
                  value={formatUsd(upcomingCosts?.totalEstimated)}
                  sub={upcomingCosts?.fetchedAt ? `Updated ${formatTime(upcomingCosts.fetchedAt)}` : undefined}
                />
                <TelnyxStatCard
                  label="Telnyx pending balance"
                  value={formatUsd(upcomingCosts?.balancePending)}
                  sub="Unsettled charges on Telnyx account"
                />
                <TelnyxStatCard
                  label="Number cost (rest of month)"
                  value={formatUsd(upcomingCosts?.numberProjection?.remainingPeriodEstimate)}
                  sub={`${upcomingCosts?.numberProjection?.activeCount || 0} active numbers`}
                />
              </div>

              {upcomingCosts?.autoRecharge?.available && (
                <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4 text-sm">
                  <p className="font-medium text-gray-900 dark:text-white mb-2">Auto-recharge</p>
                  <p className="text-gray-600 dark:text-gray-300">
                    {upcomingCosts.autoRecharge.enabled ? 'Enabled' : 'Disabled'}
                    {upcomingCosts.autoRecharge.thresholdAmount != null
                      ? ` · threshold ${formatUsd(upcomingCosts.autoRecharge.thresholdAmount)}`
                      : ''}
                    {upcomingCosts.autoRecharge.rechargeAmount != null
                      ? ` · recharge ${formatUsd(upcomingCosts.autoRecharge.rechargeAmount)}`
                      : ''}
                  </p>
                </div>
              )}

              <DataTable
                emptyMessage="No upcoming cost projections available."
                rows={(upcomingCosts?.items || []).map((row, index) => ({ ...row, key: `${row.category}-${index}` }))}
                columns={[
                  { key: 'label', label: 'Item', render: (row) => row.label },
                  { key: 'amount', label: 'Amount', render: (row) => (row.amount != null ? formatUsd(row.amount) : '—') },
                  { key: 'detail', label: 'Detail', render: (row) => row.detail || '—' },
                  { key: 'due', label: 'Due', render: (row) => (row.dueAt ? formatTime(row.dueAt) : '—') },
                ]}
              />

              {upcomingCosts?.chargesSummary?.available && (
                <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4 text-sm space-y-2">
                  <p className="font-medium text-gray-900 dark:text-white">Current billing period summary</p>
                  <p className="text-gray-600 dark:text-gray-300">
                    {upcomingCosts.chargesSummary.periodStart} → {upcomingCosts.chargesSummary.periodEnd}
                  </p>
                  <p className="text-gray-600 dark:text-gray-300">
                    New MRC {formatUsd(upcomingCosts.chargesSummary.newMrc)} · New OTC {formatUsd(upcomingCosts.chargesSummary.newOtc)} · Existing MRC {formatUsd(upcomingCosts.chargesSummary.existingMrc)} · Grand total {formatUsd(upcomingCosts.chargesSummary.grandTotal)}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && (
            <DataTable
              emptyMessage="No user Telnyx spend in this window."
              rows={userSpend.map((row) => ({ ...row, key: row.userId }))}
              columns={[
                {
                  key: 'user',
                  label: 'User',
                  render: (row) => (
                    <Link to={`/adminbobby/users/${row.userId}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                      {row.email}
                    </Link>
                  ),
                },
                { key: 'calls', label: 'Calls', render: (row) => `${formatUsd(row.callCost)} (${row.callCount})` },
                { key: 'sms', label: 'SMS', render: (row) => `${formatUsd(row.smsCost)} (${row.smsCount})` },
                { key: 'numbers', label: 'Numbers', render: (row) => `${formatUsd(row.numberCost)} (${row.numberCount})` },
                { key: 'ledger', label: 'Ledger', render: (row) => formatUsd(row.ledgerCost) },
                { key: 'total', label: 'Total', render: (row) => formatUsd(row.totalCost) },
              ]}
            />
          )}

          {activeTab === 'numbers' && (
            <DataTable
              emptyMessage="No active numbers found."
              rows={numberInventory.map((row) => ({ ...row, key: row.id }))}
              columns={[
                { key: 'number', label: 'Number', render: (row) => <span className="font-mono">{row.phoneNumber}</span> },
                {
                  key: 'user',
                  label: 'Assigned user',
                  render: (row) => row.userId ? (
                    <Link to={`/adminbobby/users/${row.userId}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                      {row.userEmail || row.userId}
                    </Link>
                  ) : '—',
                },
                { key: 'country', label: 'Country', render: (row) => row.countryCode || '—' },
                { key: 'monthly', label: 'Monthly MRC', render: (row) => formatUsd(row.monthlyCost) },
                { key: 'period', label: 'Period cost', render: (row) => formatUsd(row.periodCost) },
                { key: 'synced', label: 'Rate synced', render: (row) => row.monthlyCostSynced ? formatTime(row.costSyncedAt) : 'Estimated' },
              ]}
            />
          )}

          {activeTab === 'calls' && (
            <DataTable
              emptyMessage="No call cost records in this window."
              rows={callDetails.map((row) => ({ ...row, key: row.id }))}
              columns={[
                { key: 'time', label: 'Time', render: (row) => formatTime(row.at) },
                {
                  key: 'user',
                  label: 'User',
                  render: (row) => row.userId ? (
                    <Link to={`/adminbobby/users/${row.userId}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                      {row.userEmail || row.userId}
                    </Link>
                  ) : '—',
                },
                { key: 'route', label: 'Route', render: (row) => <span className="font-mono">{row.from || '—'} → {row.to || '—'}</span> },
                { key: 'status', label: 'Status', render: (row) => row.status || '—' },
                { key: 'duration', label: 'Duration', render: (row) => `${row.durationSeconds || 0}s / ${row.billedSeconds || 0}s billed` },
                { key: 'cost', label: 'Cost', render: (row) => formatUsd(row.cost) },
                { key: 'sync', label: 'API sync', render: (row) => row.costSyncedAt ? 'Yes' : 'No' },
              ]}
            />
          )}

          {activeTab === 'sms' && (
            <DataTable
              emptyMessage="No SMS cost records in this window."
              rows={smsDetails.map((row) => ({ ...row, key: row.id }))}
              columns={[
                { key: 'time', label: 'Time', render: (row) => formatTime(row.at) },
                {
                  key: 'user',
                  label: 'User',
                  render: (row) => row.userId ? (
                    <Link to={`/adminbobby/users/${row.userId}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                      {row.userEmail || row.userId}
                    </Link>
                  ) : '—',
                },
                { key: 'route', label: 'Route', render: (row) => <span className="font-mono">{row.from || '—'} → {row.to || '—'}</span> },
                { key: 'status', label: 'Status', render: (row) => row.status || '—' },
                { key: 'preview', label: 'Preview', render: (row) => <span className="max-w-xs truncate inline-block">{row.bodyPreview || '—'}</span> },
                { key: 'cost', label: 'Cost', render: (row) => formatUsd(row.cost) },
                { key: 'sync', label: 'API sync', render: (row) => row.costSyncedAt ? 'Yes' : 'No' },
              ]}
            />
          )}

          {activeTab === 'ledger' && (
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Immutable TelnyxCost ledger entries written at event finalization.
              </p>
              <DataTable
                emptyMessage="No ledger entries in this window."
                rows={(ledgerSummary.byType || []).map((row) => ({ ...row, key: row.resourceType }))}
                columns={[
                  { key: 'type', label: 'Resource type', render: (row) => row.resourceType },
                  { key: 'count', label: 'Entries', render: (row) => row.count },
                  { key: 'total', label: 'Total cost', render: (row) => formatUsd(row.totalCost) },
                ]}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
