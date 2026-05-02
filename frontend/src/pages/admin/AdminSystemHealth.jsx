import { useEffect, useState } from 'react';
import API from '../../api';

const fmtPct = (value) => (Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : 'n/a');
const fmtNum = (value) => (Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '0');

function StatusPill({ status }) {
  const ok = status === 'healthy' || status === 'running';
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
      {status || 'unknown'}
    </span>
  );
}

export default function AdminSystemHealth() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const load = async () => {
      const token = localStorage.getItem('adminToken');
      const res = await API.get('/api/admin/system-health', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled) return;
      if (res.data?.success) {
        setSnapshot(res.data);
        setError('');
      } else {
        setError(res.error || 'Failed to load system health');
      }
      setLoading(false);
    };
    load();
    timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const telecom = snapshot?.telecom;
  const agents = snapshot?.runtime?.agents || [];
  const securityAlerts = snapshot?.security?.alerts || [];
  const queueEvents = snapshot?.queues?.recentEvents || [];
  const webhookDuplicates = snapshot?.webhooks?.duplicateEvents || [];

  if (loading) {
    return <div className="p-6 text-gray-600 dark:text-gray-300">Loading production health...</div>;
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">System Health</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Production reliability agents and telecom safety signals.</p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">SMS delivery</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{fmtPct(telecom?.smsDeliveryRate)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">Call connect</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{fmtPct(telecom?.callConnectRate)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">Queue depth</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{fmtNum(telecom?.queueDepth)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">Active calls</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{fmtNum(snapshot?.calls?.activeCalls)}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Active Agents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {agents.map((agent) => (
            <div key={agent.agent} className="border border-gray-200 dark:border-slate-700 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-white">{agent.agent}</span>
                <StatusPill status={agent.status} />
              </div>
              <p className="text-xs text-gray-500 mt-2">Last run: {agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleString() : 'never'}</p>
              {agent.lastError && <p className="text-xs text-red-500 mt-1">{agent.lastError}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Security Alerts</h2>
          {securityAlerts.slice(0, 6).map((alert) => (
            <p key={alert._id} className="text-sm text-gray-700 dark:text-gray-300 py-1">{alert.severity}: {alert.event}</p>
          ))}
          {!securityAlerts.length && <p className="text-sm text-gray-500">No open isolation alerts.</p>}
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Queue Health</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">SMS queue: {fmtNum(snapshot?.queues?.sms?.depth)}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">Campaign failed: {fmtNum(snapshot?.queues?.campaign?.failed)}</p>
          <p className="text-sm text-gray-500 mt-2">Recent recovery events: {queueEvents.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Webhook Health</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">Duplicate events: {webhookDuplicates.length}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">State resync: {snapshot?.sync?.stateResyncEvent}</p>
          <p className="text-sm text-gray-500 mt-2">Stale sockets: {snapshot?.sync?.staleWebsocketCount ?? 'n/a'}</p>
        </div>
      </div>
    </div>
  );
}
