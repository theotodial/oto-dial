import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useAdminLiveFeed from '../../hooks/useAdminLiveFeed';
import LiveTimeframeSelector from '../../components/analytics/live/LiveTimeframeSelector';
import TelnyxCostPanel from '../../components/admin/TelnyxCostPanel';

const STATUS_COLORS = {
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'no-answer': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  busy: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  ringing: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  answered: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
};

function StatusBadge({ status }) {
  const key = String(status || 'unknown').toLowerCase();
  const cls = STATUS_COLORS[key] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${cls}`}>
      {status || 'unknown'}
    </span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{value ?? '—'}</p>
      {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );
}

function formatDuration(seconds) {
  const s = Number(seconds || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function matchesSearch(event, search) {
  if (!search) return true;
  const q = search.toLowerCase();
  const haystack = [
    event.actor?.email,
    event.actor?.name,
    event.destination,
    event.from,
    event.callId,
    event.messageId,
    event.bodyPreview,
    event.status,
    event.eventType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function formatWindowLabel(windowKey) {
  const labels = {
    '5m': '5 min', '10m': '10 min', '15m': '15 min', '30m': '30 min', '45m': '45 min',
    '1h': '1 hour', '2h': '2 hours', '3h': '3 hours', '4h': '4 hours', '5h': '5 hours',
    '6h': '6 hours', '12h': '12 hours', '24h': '24 hours', '48h': '48 hours', '72h': '72 hours',
    '7d': '7 days', '14d': '14 days', '21d': '21 days', '30d': '30 days', '60d': '60 days',
    '90d': '90 days', all: 'all time', custom: 'custom range',
  };
  return labels[windowKey] || windowKey;
}

function AdminLiveActivity() {
  const [window, setWindow] = useState('15m');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const windowParams = useMemo(() => ({
    window,
    startDate: window === 'custom' && customStart ? new Date(customStart).toISOString() : null,
    endDate: window === 'custom' && customEnd ? new Date(customEnd).toISOString() : null,
  }), [window, customStart, customEnd]);

  const { liveCalls, liveSms, stats, telnyx, timeframe, connected, loading, syncingTelnyx, refresh, syncTelnyx } = useAdminLiveFeed({
    limit: 200,
    ...windowParams,
  });
  const [activeTab, setActiveTab] = useState('calls');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredCalls = useMemo(() => {
    return liveCalls.filter((event) => {
      if (statusFilter && String(event.status || '').toLowerCase() !== statusFilter) return false;
      return matchesSearch(event, search);
    });
  }, [liveCalls, search, statusFilter]);

  const filteredSms = useMemo(() => {
    return liveSms.filter((event) => {
      if (statusFilter && String(event.status || '').toLowerCase() !== statusFilter) return false;
      return matchesSearch(event, search);
    });
  }, [liveSms, search, statusFilter]);

  const timeline = useMemo(() => {
    const merged = [
      ...filteredCalls.map((e) => ({ ...e, channel: 'call' })),
      ...filteredSms.map((e) => ({ ...e, channel: 'sms' })),
    ];
    return merged.sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [filteredCalls, filteredSms]);

  const callStatuses = useMemo(() => {
    const set = new Set(liveCalls.map((e) => String(e.status || '').toLowerCase()).filter(Boolean));
    return Array.from(set).sort();
  }, [liveCalls]);

  const smsStatuses = useMemo(() => {
    const set = new Set(liveSms.map((e) => String(e.status || '').toLowerCase()).filter(Boolean));
    return Array.from(set).sort();
  }, [liveSms]);

  const statusOptions = activeTab === 'sms' ? smsStatuses : activeTab === 'calls' ? callStatuses : [...new Set([...callStatuses, ...smsStatuses])].sort();
  const windowLabel = timeframe?.label ? formatWindowLabel(timeframe.label) : formatWindowLabel(window);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Live Activity</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Real-time call and SMS events with operational reports for the selected window.
            </p>
            {timeframe?.start && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {formatTime(timeframe.start)} → {formatTime(timeframe.end)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LiveTimeframeSelector
              window={window}
              onChange={setWindow}
              customStart={customStart}
              customEnd={customEnd}
              onCustomChange={({ start, end }) => {
                if (start !== undefined) setCustomStart(start);
                if (end !== undefined) setCustomEnd(end);
              }}
            />
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                connected
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {connected ? 'Live connected' : 'Polling fallback'}
            </span>
            <button
              type="button"
              onClick={refresh}
              className="px-4 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <StatCard label="Active calls" value={stats?.activeCallsCount ?? '—'} sub="In progress now" />
          <StatCard
            label={`Calls (${windowLabel})`}
            value={stats?.callsInWindow?.toLocaleString?.() ?? stats?.callsInWindow ?? '—'}
            sub={`${stats?.completedCalls ?? 0} completed · ${stats?.failedCalls ?? 0} failed`}
          />
          <StatCard
            label="Call success"
            value={stats?.callSuccessRate != null ? `${stats.callSuccessRate}%` : '—'}
            sub={`In selected window`}
          />
          <StatCard
            label="Avg duration"
            value={stats?.avgDurationSeconds != null ? formatDuration(stats.avgDurationSeconds) : '—'}
            sub={`Completed calls (${windowLabel})`}
          />
          <StatCard
            label={`SMS (${windowLabel})`}
            value={stats?.smsInWindow?.toLocaleString?.() ?? stats?.smsInWindow ?? '—'}
            sub={`${stats?.deliveredSms ?? 0} delivered · ${stats?.failedSms ?? 0} failed`}
          />
          <StatCard
            label="SMS delivery"
            value={stats?.smsDeliveryRate != null ? `${stats.smsDeliveryRate}%` : '—'}
            sub={`In selected window`}
          />
        </div>

        <TelnyxCostPanel
          telnyx={telnyx}
          windowLabel={windowLabel}
          syncing={syncingTelnyx}
          onSync={syncTelnyx}
        />

        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user, number, ID, or message..."
            className="flex-1 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
          >
            <option value="">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="border-b border-gray-200 dark:border-slate-700">
          <nav className="flex space-x-8">
            {[
              { id: 'calls', label: `Calls (${filteredCalls.length})` },
              { id: 'sms', label: `SMS (${filteredSms.length})` },
              { id: 'timeline', label: `Timeline (${timeline.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setStatusFilter('');
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {loading && liveCalls.length === 0 && liveSms.length === 0 ? (
          <div className="py-12 text-center text-gray-500 dark:text-gray-400">Loading live activity…</div>
        ) : (
          <>
            {activeTab === 'calls' && (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                    <thead className="bg-gray-50 dark:bg-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Direction</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">From</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">To</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Duration</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Event</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Call ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                      {filteredCalls.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            No call events match your filters.
                          </td>
                        </tr>
                      ) : (
                        filteredCalls.map((event, idx) => (
                          <tr key={`${event.callId || idx}-${event.at}`} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatTime(event.at)}</td>
                            <td className="px-4 py-3 text-sm">
                              {event.actor?.userId ? (
                                <Link
                                  to={`/adminbobby/users/${event.actor.userId}`}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  {event.actor.email || 'Unknown'}
                                </Link>
                              ) : (
                                <span className="text-gray-900 dark:text-white">{event.actor?.email || 'Unknown'}</span>
                              )}
                              {event.actor?.name && event.actor.name !== event.actor.email && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">{event.actor.name}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 capitalize">{event.direction || '—'}</td>
                            <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-300">{event.from || '—'}</td>
                            <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">{event.destination || '—'}</td>
                            <td className="px-4 py-3"><StatusBadge status={event.status} /></td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{formatDuration(event.durationSeconds)}</td>
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{event.eventType || '—'}</td>
                            <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400">{event.callId ? String(event.callId).slice(-12) : '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'sms' && (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                    <thead className="bg-gray-50 dark:bg-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">From</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">To</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Event</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Preview</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Message ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                      {filteredSms.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            No SMS events match your filters.
                          </td>
                        </tr>
                      ) : (
                        filteredSms.map((event, idx) => (
                          <tr key={`${event.messageId || idx}-${event.at}`} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatTime(event.at)}</td>
                            <td className="px-4 py-3 text-sm">
                              {event.actor?.userId ? (
                                <Link
                                  to={`/adminbobby/users/${event.actor.userId}`}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  {event.actor.email || 'Unknown'}
                                </Link>
                              ) : (
                                <span className="text-gray-900 dark:text-white">{event.actor?.email || 'Unknown'}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-300">{event.from || '—'}</td>
                            <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">{event.destination || '—'}</td>
                            <td className="px-4 py-3"><StatusBadge status={event.status} /></td>
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{event.eventType || '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate" title={event.bodyPreview}>
                              {event.bodyPreview || '—'}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400">{event.messageId ? String(event.messageId).slice(-12) : '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-gray-200 dark:divide-slate-700">
                {timeline.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No activity matches your filters.
                  </div>
                ) : (
                  timeline.map((event, idx) => (
                    <div key={`${event.channel}-${event.callId || event.messageId || idx}-${event.at}`} className="px-4 py-4 flex flex-col sm:flex-row sm:items-start gap-3 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <div className="flex items-center gap-2 sm:w-36 shrink-0">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded uppercase ${
                          event.channel === 'call'
                            ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300'
                            : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300'
                        }`}>
                          {event.channel}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatTime(event.at)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {event.actor?.userId ? (
                            <Link to={`/adminbobby/users/${event.actor.userId}`} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                              {event.actor.email}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{event.actor?.email || 'Unknown'}</span>
                          )}
                          <StatusBadge status={event.status} />
                        </div>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                          {event.from && <span className="font-mono">{event.from}</span>}
                          {event.from && event.destination && ' → '}
                          {event.destination && <span className="font-mono">{event.destination}</span>}
                          {event.channel === 'call' && event.durationSeconds > 0 && (
                            <span className="text-gray-500 dark:text-gray-400"> · {formatDuration(event.durationSeconds)}</span>
                          )}
                        </p>
                        {event.bodyPreview && (
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate">{event.bodyPreview}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing up to 200 events per channel for {windowLabel}. Live WebSocket events are merged when in range.
          For full records, see{' '}
          <Link to="/adminbobby/calls" className="text-indigo-600 dark:text-indigo-400 hover:underline">Calls</Link>
          {' '}and{' '}
          <Link to="/adminbobby/sms" className="text-indigo-600 dark:text-indigo-400 hover:underline">SMS</Link>.
        </p>
      </div>
    </div>
  );
}

export default AdminLiveActivity;
