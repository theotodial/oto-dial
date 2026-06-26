/**
 * LiveBadge - animated indicator of the realtime connection state.
 */
function LiveBadge({ connected }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        connected
          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
          : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
      }`}
    >
      <span className="relative flex h-2 w-2">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            connected ? 'bg-emerald-500' : 'bg-gray-400'
          }`}
        />
      </span>
      {connected ? 'Live' : 'Polling'}
    </span>
  );
}

export default LiveBadge;
