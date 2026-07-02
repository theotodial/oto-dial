function AdminNavBadge({ count = 0, className = '' }) {
  if (!count || count <= 0) return null;

  const label = count > 99 ? '99+' : String(count);

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold leading-none ${className}`}
      aria-label={`${count} new`}
    >
      {label}
    </span>
  );
}

export default AdminNavBadge;
