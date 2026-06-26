import { useCallback, useEffect, useState } from 'react';
import API from '../api';

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Customer credit usage timeline (grants + deductions).
 */
export default function CreditTimeline({ className = '' }) {
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
      const res = await API.get(`/api/wallet/timeline?page=${p}&pageSize=20`);
      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Failed to load timeline');
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

  if (loading && !timeline.length) {
    return (
      <div className={`rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 ${className}`}>
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading credit history…</p>
      </div>
    );
  }

  if (error && !timeline.length) {
    return null;
  }

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Credit activity</h2>
          {balance != null && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Balance: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{Math.round(balance).toLocaleString()}</span>
            </p>
          )}
        </div>
      </div>

      {timeline.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">No credit activity yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-slate-800">
          {timeline.map((row) => {
            const isCredit = Number(row.amount) > 0;
            return (
              <li key={row.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{row.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatWhen(row.timestamp)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-semibold tabular-nums ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-800 dark:text-gray-200'}`}>
                    {row.creditsDisplay}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
                    bal {Math.round(Number(row.balance || 0)).toLocaleString()}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-800 flex justify-between items-center">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
            className="text-xs text-indigo-600 dark:text-indigo-400 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
            className="text-xs text-indigo-600 dark:text-indigo-400 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
