import { useState, useRef, useEffect } from 'react';
import { RefreshCw, Download, Calendar, ChevronDown } from 'lucide-react';
import LiveBadge from './LiveBadge';

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'prev_month', label: 'Previous month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_year', label: 'Last year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' }
];

const COMPARE_OPTIONS = [
  { value: 'previous_period', label: 'vs Previous period' },
  { value: 'yoy', label: 'vs Last year' },
  { value: 'none', label: 'No comparison' }
];

const EXPORT_FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'excel', label: 'Excel (.xlsx)' },
  { value: 'pdf', label: 'PDF report' },
  { value: 'json', label: 'JSON' }
];

function FilterBar({
  range,
  compare,
  customStart,
  customEnd,
  onChange,
  onRefresh,
  onExport,
  refreshing,
  lastUpdated,
  connected
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selectClass =
    'rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <select
          value={range}
          onChange={(e) => onChange({ range: e.target.value })}
          className={`${selectClass} pl-9 pr-8 appearance-none`}
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {range === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customStart || ''}
            onChange={(e) => onChange({ customStart: e.target.value })}
            className={selectClass}
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={customEnd || ''}
            onChange={(e) => onChange({ customEnd: e.target.value })}
            className={selectClass}
          />
        </div>
      )}

      <select
        value={compare}
        onChange={(e) => onChange({ compare: e.target.value })}
        className={selectClass}
      >
        {COMPARE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <div className="flex-1" />

      <LiveBadge connected={connected} />

      {lastUpdated && (
        <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
          Updated {lastUpdated.toLocaleTimeString()}
        </span>
      )}

      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-60"
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        Refresh
      </button>

      <div className="relative" ref={exportRef}>
        <button
          onClick={() => setExportOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Download className="w-4 h-4" />
          Export
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {exportOpen && (
          <div className="absolute right-0 mt-2 w-44 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-20 py-1">
            {EXPORT_FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setExportOpen(false);
                  onExport(f.value);
                }}
                className="block w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FilterBar;
