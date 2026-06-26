/**
 * ChartCard - consistent titled container for charts and tables.
 */
function ChartCard({ title, subtitle = null, actions = null, className = '', children, error = null }) {
  return (
    <div
      className={`rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/60 backdrop-blur p-5 shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {error ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-sm text-rose-600 dark:text-rose-400">This section failed to load.</p>
          <p className="text-xs text-gray-400 mt-1">Other metrics are unaffected.</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export default ChartCard;
