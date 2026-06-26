const WINDOWS = [
  { value: '5m', label: '5 min' },
  { value: '10m', label: '10 min' },
  { value: '15m', label: '15 min' },
  { value: '30m', label: '30 min' },
  { value: '45m', label: '45 min' },
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '3h', label: '3 hours' },
  { value: '4h', label: '4 hours' },
  { value: '5h', label: '5 hours' },
  { value: '6h', label: '6 hours' },
  { value: '12h', label: '12 hours' },
  { value: '24h', label: '24 hours' },
  { value: '48h', label: '48 hours' },
  { value: '72h', label: '72 hours' },
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '21d', label: '21 days' },
  { value: '30d', label: '30 days' },
  { value: '60d', label: '60 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' }
];

export default function LiveTimeframeSelector({ window, onChange, customStart, customEnd, onCustomChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={window}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3 py-2 font-medium"
      >
        {WINDOWS.map((w) => (
          <option key={w.value} value={w.value}>{w.label}</option>
        ))}
      </select>
      {window === 'custom' && (
        <>
          <input
            type="datetime-local"
            value={customStart || ''}
            onChange={(e) => onCustomChange?.({ start: e.target.value })}
            className="text-xs rounded-lg border px-2 py-1.5 dark:border-slate-700 bg-transparent"
          />
          <span className="text-gray-400 text-xs">→</span>
          <input
            type="datetime-local"
            value={customEnd || ''}
            onChange={(e) => onCustomChange?.({ end: e.target.value })}
            className="text-xs rounded-lg border px-2 py-1.5 dark:border-slate-700 bg-transparent"
          />
        </>
      )}
    </div>
  );
}
