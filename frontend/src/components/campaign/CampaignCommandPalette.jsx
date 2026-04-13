import { useEffect, useMemo, useState } from 'react';

export default function CampaignCommandPalette({
  open,
  onClose,
  commands,
  query,
  onQueryChange,
}) {
  const [index, setIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const hay = `${c.label} ${c.keywords || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [commands, query]);

  useEffect(() => {
    setIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === 'Enter' && filtered[index]) {
        e.preventDefault();
        filtered[index].run();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, index, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search commands…"
            className="w-full bg-transparent text-sm text-slate-900 dark:text-white outline-none placeholder:text-slate-400 px-1 py-2"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-500 text-center">No matches</li>
          ) : (
            filtered.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    c.run();
                    onClose();
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm flex flex-col gap-0.5 ${
                    i === index ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="font-medium">{c.label}</span>
                  {c.hint && <span className="text-[11px] text-slate-500 dark:text-slate-400">{c.hint}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 flex gap-3">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
