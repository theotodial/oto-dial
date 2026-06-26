import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import TrendBadge from './TrendBadge';

/**
 * KpiCard - executive metric tile with optional trend + sparkline.
 */
function KpiCard({
  title,
  value,
  delta = null,
  invertTrend = false,
  icon = null,
  accent = 'indigo',
  sparkData = null,
  sparkKey = 'value',
  subtitle = null,
  onClick = null
}) {
  const accents = {
    indigo: 'from-indigo-500/10 to-indigo-500/0 text-indigo-600 dark:text-indigo-400',
    violet: 'from-violet-500/10 to-violet-500/0 text-violet-600 dark:text-violet-400',
    emerald: 'from-emerald-500/10 to-emerald-500/0 text-emerald-600 dark:text-emerald-400',
    amber: 'from-amber-500/10 to-amber-500/0 text-amber-600 dark:text-amber-400',
    rose: 'from-rose-500/10 to-rose-500/0 text-rose-600 dark:text-rose-400',
    cyan: 'from-cyan-500/10 to-cyan-500/0 text-cyan-600 dark:text-cyan-400',
    blue: 'from-blue-500/10 to-blue-500/0 text-blue-600 dark:text-blue-400'
  };
  const strokeColor = {
    indigo: '#6366f1',
    violet: '#8b5cf6',
    emerald: '#10b981',
    amber: '#f59e0b',
    rose: '#f43f5e',
    cyan: '#06b6d4',
    blue: '#3b82f6'
  }[accent] || '#6366f1';

  return (
    <div
      onClick={onClick || undefined}
      className={`group relative overflow-hidden rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/60 backdrop-blur p-5 shadow-sm transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5' : ''
      }`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accents[accent] || accents.indigo} opacity-60`} />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {icon && (
              <span className={`${(accents[accent] || accents.indigo).split(' ').slice(-2).join(' ')}`}>
                {icon}
              </span>
            )}
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
          </div>
          {delta !== null && <TrendBadge value={delta} invert={invertTrend} />}
        </div>

        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <div className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{value}</div>
            {subtitle && (
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</div>
            )}
          </div>
          {Array.isArray(sparkData) && sparkData.length > 1 && (
            <div className="h-10 w-24 opacity-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                  <defs>
                    <linearGradient id={`spark-${accent}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={strokeColor} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey={sparkKey}
                    stroke={strokeColor}
                    strokeWidth={2}
                    fill={`url(#spark-${accent})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default KpiCard;
