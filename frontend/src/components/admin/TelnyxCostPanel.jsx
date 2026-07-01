import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatCard from './TelnyxStatCard';

export function formatUsd(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `$${Number(value).toFixed(4)}`;
}

export function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function TelnyxCostPanel({
  telnyx,
  windowLabel,
  syncing,
  onSync,
  defaultMinimized = false,
  showFullPageLink = true,
  storageKey = 'admin-telnyx-panel-minimized',
}) {
  const [minimized, setMinimized] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored != null) return stored === '1';
    } catch {
      /* ignore */
    }
    return defaultMinimized;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, minimized ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [minimized, storageKey]);

  if (!telnyx) return null;

  const balance = telnyx.balance || {};
  const api = telnyx.window?.api || {};
  const webhook = telnyx.window?.webhook || {};
  const pendingCalls = webhook.calls?.pendingCosts || 0;
  const pendingSms = webhook.sms?.pendingCosts || 0;
  const hasPending = pendingCalls + pendingSms > 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMinimized((v) => !v)}
            className="mt-0.5 shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500"
            aria-label={minimized ? 'Expand Telnyx panel' : 'Minimize Telnyx panel'}
          >
            {minimized ? '▸' : '▾'}
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Telnyx balance & costs</h2>
            {!minimized && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Account balance from Telnyx API · window costs from API detail records + webhook-backed records
              </p>
            )}
            {minimized && (
              <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                Balance {balance.available ? formatUsd(balance.balance) : '—'}
                {' · '}
                API {formatUsd(api.totalCost)}
                {' · '}
                Webhook {formatUsd(webhook.totalCost)}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showFullPageLink && (
            <Link
              to="/adminbobby/telnyx"
              className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Full Telnyx report
            </Link>
          )}
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync Telnyx costs'}
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Account balance"
              value={balance.available ? formatUsd(balance.balance) : 'Unavailable'}
              sub={balance.available
                ? `${formatUsd(balance.availableCredit)} available · ${balance.currency || 'USD'}`
                : balance.error || 'Configure TELNYX_API_KEY'}
            />
            <StatCard
              label="Pending charges"
              value={balance.available ? formatUsd(balance.pending) : '—'}
              sub={balance.available ? `Credit limit ${formatUsd(balance.creditLimit)}` : undefined}
            />
            <StatCard
              label={`API cost (${windowLabel})`}
              value={formatUsd(api.totalCost)}
              sub={`Source: ${api.source || 'unknown'}${api.lookbackCapped ? ' · lookback capped' : ''}`}
            />
            <StatCard
              label={`Webhook cost (${windowLabel})`}
              value={formatUsd(webhook.totalCost)}
              sub={hasPending
                ? `${pendingCalls} calls · ${pendingSms} SMS awaiting sync`
                : 'From webhook + synced records'}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3">
              <p className="font-medium text-gray-900 dark:text-white mb-2">Calls</p>
              <p className="text-gray-600 dark:text-gray-300">API: {formatUsd(api.calls?.totalCost)} ({api.calls?.count || 0} records)</p>
              <p className="text-gray-600 dark:text-gray-300">Webhook: {formatUsd(webhook.calls?.totalCost)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {webhook.calls?.apiSyncedCount || 0} API-synced · {pendingCalls} pending
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3">
              <p className="font-medium text-gray-900 dark:text-white mb-2">SMS</p>
              <p className="text-gray-600 dark:text-gray-300">API: {formatUsd(api.sms?.totalCost)} ({api.sms?.count || 0} records)</p>
              <p className="text-gray-600 dark:text-gray-300">Webhook: {formatUsd(webhook.sms?.totalCost)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {webhook.sms?.apiSyncedCount || 0} API-synced · {pendingSms} pending
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3">
              <p className="font-medium text-gray-900 dark:text-white mb-2">Numbers</p>
              <p className="text-gray-600 dark:text-gray-300">API: {formatUsd(api.numbers?.totalCost)}</p>
              <p className="text-gray-600 dark:text-gray-300">Webhook: {formatUsd(webhook.numbers?.totalCost)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {api.numbers?.activeCount || 0} active numbers in inventory
              </p>
            </div>
          </div>

          {telnyx.sync && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Last sync: {telnyx.sync.synced} updated · {telnyx.sync.failed} failed · {telnyx.sync.scanned} scanned
            </p>
          )}

          {api.fetchedAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Telnyx API billing fetched {formatTime(api.fetchedAt)}
              {api.mongoSupplementUsed ? ' · merged with local webhook records' : ''}
            </p>
          )}

          {(telnyx.balanceHistory?.totalDeposited != null || telnyx.upcomingCosts?.totalEstimated != null) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {telnyx.balanceHistory?.totalDeposited != null && (
                <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                  <p className="font-medium text-gray-900 dark:text-white mb-1">Balance deposited (historic)</p>
                  <p className="text-gray-600 dark:text-gray-300">{formatUsd(telnyx.balanceHistory.totalDeposited)} · {telnyx.balanceHistory.depositCount || 0} entries</p>
                  {showFullPageLink && (
                    <Link to="/adminbobby/telnyx" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1 inline-block">
                      View full balance history
                    </Link>
                  )}
                </div>
              )}
              {telnyx.upcomingCosts?.totalEstimated != null && (
                <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                  <p className="font-medium text-gray-900 dark:text-white mb-1">Upcoming costs (est.)</p>
                  <p className="text-gray-600 dark:text-gray-300">
                    {formatUsd(telnyx.upcomingCosts.totalEstimated)}
                    {telnyx.upcomingCosts.monthlyNumberRenewal != null
                      ? ` · ${formatUsd(telnyx.upcomingCosts.monthlyNumberRenewal)} number MRC/mo`
                      : ''}
                  </p>
                  {showFullPageLink && (
                    <Link to="/adminbobby/telnyx" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1 inline-block">
                      View upcoming costs
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
