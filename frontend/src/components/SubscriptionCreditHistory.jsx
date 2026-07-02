import { useCallback, useEffect, useState } from 'react';
import API from '../api';

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(seconds) {
  const s = Math.round(Number(seconds));
  if (!Number.isFinite(s) || s <= 0) return null;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function channelMeta(row) {
  if (row.channel === 'call') {
    const event = row.callEventLabel;
    const duration = formatDuration(row.callDurationSeconds);
    const parts = [event, duration ? `Duration ${duration}` : null].filter(Boolean);
    return {
      title: 'Call',
      detail: parts.length ? parts.join(' · ') : 'Call credit usage',
      badgeClass:
        row.direction === 'inbound'
          ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    };
  }

  if (row.channel === 'sms') {
    const parts = row.smsParts;
    const encoding = row.smsEncoding ? ` · ${row.smsEncoding}` : '';
    return {
      title: 'SMS',
      detail: parts
        ? `${parts} segment${parts === 1 ? '' : 's'}${encoding}`
        : 'SMS credit usage',
      badgeClass:
        row.direction === 'inbound'
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
          : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
    };
  }

  if (row.channel === 'grant') {
    return {
      title: 'Credit grant',
      detail: row.label,
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    };
  }

  return {
    title: row.label || 'Credit event',
    detail: row.type?.replace(/_/g, ' ') || 'Account adjustment',
    badgeClass: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-200',
  };
}

function SubscriptionCreditHistory() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await API.get(`/api/wallet/timeline?page=${p}&pageSize=25`);
      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Failed to load credit history');
      }
      setBalance(res.data.balance);
      setTimeline(res.data.timeline || []);
      setPage(res.data.page || p);
      setTotalPages(res.data.totalPages || 1);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load credit history');
      setTimeline([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Credit history</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            See when and how telecom credits were used on calls and SMS — inbound and outbound.
          </p>
        </div>
        {balance != null && (
          <div className="text-sm text-gray-600 dark:text-gray-400 sm:text-right">
            Current balance{' '}
            <span className="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
              {Math.round(balance).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {loading && timeline.length === 0 && (
        <div className="py-10 text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading credit history…</p>
        </div>
      )}

      {error && !timeline.length && (
        <p className="text-sm text-red-600 dark:text-red-400 py-4">{error}</p>
      )}

      {!loading && !error && timeline.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
          No credit activity yet. Usage from calls and SMS will appear here.
        </p>
      )}

      {timeline.length > 0 && (
        <>
          <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-900/60 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Direction</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                  <th className="px-4 py-3 font-semibold text-right">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {timeline.map((row) => {
                  const meta = channelMeta(row);
                  const isCredit = Number(row.amount) > 0;
                  return (
                    <tr key={row.id} className="bg-white dark:bg-slate-800/50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {formatWhen(row.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${meta.badgeClass}`}>
                          {meta.title}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {row.directionLabel || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-800 dark:text-gray-200">
                        {row.counterparty || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {meta.detail}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-semibold tabular-nums ${
                            isCredit
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {row.creditsDisplay}
                        </span>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums mt-0.5">
                          bal {Math.round(Number(row.balance || 0)).toLocaleString()}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="md:hidden space-y-3">
            {timeline.map((row) => {
              const meta = channelMeta(row);
              const isCredit = Number(row.amount) > 0;
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-900/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${meta.badgeClass}`}>
                      {meta.title}
                      {row.directionLabel ? ` · ${row.directionLabel}` : ''}
                    </span>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        isCredit
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {row.creditsDisplay}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{formatWhen(row.timestamp)}</p>
                  {row.counterparty && (
                    <p className="text-sm font-mono text-gray-800 dark:text-gray-200 mb-1">{row.counterparty}</p>
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-400">{meta.detail}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums mt-2">
                    Balance after: {Math.round(Number(row.balance || 0)).toLocaleString()}
                  </p>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 dark:border-slate-700 pt-4">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => load(page - 1)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 disabled:opacity-40 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => load(page + 1)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 disabled:opacity-40 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SubscriptionCreditHistory;
