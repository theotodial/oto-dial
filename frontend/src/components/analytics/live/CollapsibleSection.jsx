import { useCallback, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function CollapsibleSection({
  id,
  title,
  icon: Icon,
  badge = null,
  defaultOpen = true,
  className = '',
  children
}) {
  const storageKey = `oto:analytics:collapse:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== '0';
    } catch {
      return defaultOpen;
    }
  });

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);

  return (
    <div className={`rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50/60 dark:hover:bg-slate-800/40 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-4 h-4 text-indigo-500 shrink-0" />}
          <span className="font-semibold truncate">{title}</span>
          {badge}
        </div>
        <span className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
          {open ? 'Minimize' : 'Expand'}
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-0 border-t border-gray-100/80 dark:border-slate-800/80">{children}</div>}
    </div>
  );
}
