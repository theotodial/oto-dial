export default function LiveFunnel({ funnel = [] }) {
  const max = funnel[0]?.count || 1;

  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur p-4">
      <h3 className="font-semibold mb-1">Live Funnel</h3>
      <p className="text-xs text-gray-500 mb-4">Conversion path for active sessions</p>
      <div className="space-y-2">
        {funnel.map((step, i) => (
          <div key={step.step} className="relative">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium">{step.step}</span>
              <span className="tabular-nums text-gray-500">
                {step.count} <span className="text-[10px]">({step.rate}%)</span>
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                style={{ width: `${Math.max(4, (step.count / max) * 100)}%` }}
              />
            </div>
            {i < funnel.length - 1 && (
              <div className="flex justify-center py-0.5 text-gray-300 dark:text-slate-600 text-xs">↓</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
