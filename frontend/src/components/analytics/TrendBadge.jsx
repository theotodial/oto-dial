import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * TrendBadge - shows a percentage change with directional color.
 * Set `invert` for metrics where lower is better (e.g. bounce rate).
 */
function TrendBadge({ value, invert = false, className = '' }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }
  const v = Number(value);
  const isFlat = Math.abs(v) < 0.05;
  const positive = invert ? v < 0 : v > 0;
  const good = isFlat ? null : positive;

  const color = isFlat
    ? 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700/50'
    : good
      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30'
      : 'text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/30';

  const Icon = isFlat ? Minus : v > 0 ? TrendingUp : TrendingDown;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color} ${className}`}
    >
      <Icon className="w-3 h-3" />
      {v > 0 ? '+' : ''}
      {v.toFixed(1)}%
    </span>
  );
}

export default TrendBadge;
