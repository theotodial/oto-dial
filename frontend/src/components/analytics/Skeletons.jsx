export function KpiSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/60 dark:bg-slate-800/40 p-5 animate-pulse">
      <div className="h-4 w-24 bg-gray-200 dark:bg-slate-700 rounded" />
      <div className="mt-4 h-8 w-20 bg-gray-200 dark:bg-slate-700 rounded" />
    </div>
  );
}

export function ChartSkeleton({ height = 280 }) {
  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/60 dark:bg-slate-800/40 p-5 animate-pulse">
      <div className="h-4 w-32 bg-gray-200 dark:bg-slate-700 rounded mb-4" />
      <div className="w-full bg-gray-100 dark:bg-slate-700/50 rounded" style={{ height }} />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartSkeleton height={320} />
        </div>
        <ChartSkeleton height={320} />
      </div>
    </div>
  );
}

export default DashboardSkeleton;
