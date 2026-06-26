import { Search, Filter } from 'lucide-react';

const FILTER_TOGGLES = [
  { key: 'loggedIn', label: 'Logged In' },
  { key: 'anonymous', label: 'Anonymous' },
  { key: 'subscribers', label: 'Subscribers' },
  { key: 'returning', label: 'Returning' },
  { key: 'new', label: 'New' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'desktop', label: 'Desktop' }
];

export default function LiveFilters({ search, onSearchChange, filters, onFilterChange }) {
  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/60 dark:bg-slate-900/40 backdrop-blur p-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search email, visitor ID, IP, city, campaign…"
            className="w-full pl-10 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80"
          />
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Filter className="w-3.5 h-3.5" />
          Filters
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTER_TOGGLES.map(({ key, label }) => {
          const active = !!filters[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onFilterChange(key, !active)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/20'
                  : 'bg-white/80 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
