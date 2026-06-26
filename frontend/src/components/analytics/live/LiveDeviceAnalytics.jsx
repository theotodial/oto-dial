export default function LiveDeviceAnalytics({ devices = {} }) {
  const sections = [
    { title: 'Device', data: devices.devices, key: 'device' },
    { title: 'Browser', data: devices.browsers, key: 'browser' },
    { title: 'OS', data: devices.os, key: 'os' },
    { title: 'Language', data: devices.languages, key: 'language' }
  ];

  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">Device Analytics</h3>
          <p className="text-xs text-gray-500">Live device & browser mix</p>
        </div>
        {devices.darkModePercent != null && (
          <span className="text-xs px-2 py-1 rounded-full bg-slate-800 text-white dark:bg-slate-700">
            Dark mode {devices.darkModePercent}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {sections.map(({ title, data, key }) => (
          <div key={title}>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">{title}</div>
            <div className="space-y-1">
              {(data || []).slice(0, 6).map((row) => (
                <div key={row[key]} className="flex justify-between text-xs">
                  <span className="truncate capitalize">{row[key]}</span>
                  <span className="tabular-nums font-medium">{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
