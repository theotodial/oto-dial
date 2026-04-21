export default function CompactHeader({ title, rightSlot, className = '' }) {
  return (
    <header className={`h-12 max-h-12 px-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between ${className}`}>
      <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</h1>
      <div className="flex items-center gap-2">{rightSlot}</div>
    </header>
  );
}
