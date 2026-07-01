export default function TelnyxStatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-50 dark:bg-slate-900/40 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{value ?? '—'}</p>
      {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );
}
