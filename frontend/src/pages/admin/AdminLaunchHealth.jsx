import { useEffect, useState } from 'react';
import API from '../../api';

function Pill({ label, ok }) {
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-semibold ${
        ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      }`}
    >
      {label}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-3">{title}</h2>
      {children}
    </div>
  );
}

function kv(label, value) {
  return (
    <p className="text-sm text-gray-700 dark:text-gray-300">
      <span className="text-gray-500 dark:text-gray-400">{label}:</span> {value ?? 'n/a'}
    </p>
  );
}

export default function AdminLaunchHealth() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const token = localStorage.getItem('adminToken');
      try {
        const res = await API.get('/api/admin/analytics/live-billing-health', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.data?.success) {
          setData(res.data);
          setError('');
        } else {
          setError(res.data?.error || 'Failed to load launch health');
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Request failed');
      }
      if (!cancelled) setLoading(false);
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-600 dark:text-gray-300">Loading launch health…</div>;
  }

  const r = data?.systemReadiness;
  const sec = r?.sections || {};
  const live = data?.liveEconomics || {};
  const ledger = data?.ledgerHealth || {};
  const recovery = data?.recoveryHealth || {};
  const pressure = data?.pressureHealth || {};

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Launch health</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Production economics, ledger risk, recovery, and pressure — polled every 15s (no WebSocket required).
        </p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">Deployment mode</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-white">{data?.deploymentMode || 'n/a'}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">Readiness overall</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-white">{r?.overall || 'n/a'}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">Telecom pressure</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-white">{pressure?.telecomPressureLevel || 'n/a'}</p>
        </div>
      </div>

      <Section title="System status">
        <div className="flex flex-wrap gap-2 mb-3">
          <Pill label={`Mongo: ${sec.database?.status || '?'}`} ok={sec.database?.status === 'healthy'} />
          <Pill label={`Redis: ${data?.readinessHint?.redisConfigured ? 'configured' : 'missing'}`} ok={data?.readinessHint?.redisConfigured} />
          <Pill label={`Stripe: ${sec.stripe?.status || '?'}`} ok={sec.stripe?.status === 'healthy'} />
          <Pill label={`Telnyx: ${sec.telnyx?.status || '?'}`} ok={sec.telnyx?.status === 'healthy'} />
          <Pill label={`Agents: ${sec.agents?.status || '?'}`} ok={sec.agents?.status === 'healthy'} />
        </div>
        <p className="text-xs text-gray-500">
          Full readiness detail is available in server logs on boot and via <code className="text-xs">npm run production:verify</code>.
        </p>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Live billing">
          {kv('Active calls', live.activeCalls)}
          {kv('Calls billing now', live.callsBillingNow)}
          {kv('Projected exposure (active answered)', live.projectedOutstandingIntervalExposure)}
          {kv('Reserved credits total', live.reservedCreditsTotal)}
          {kv('Interval charges / minute', live.intervalChargesPerMinute)}
          {kv('Duplicate prevention (1m)', live.duplicatePreventionCount1m)}
          {kv('Insufficient credit rejects / minute', live.insufficientCreditRejectsPerMinute ?? live.insufficientCreditRejectsNote)}
        </Section>

        <Section title="Risk warnings">
          {kv('Negative balance users', ledger.negativeBalanceUsers)}
          {kv('Split-brain detections (24h)', ledger.splitBrainDetections24h)}
          {kv('Replay mismatches (24h)', ledger.replayMismatches24h)}
          {kv('Unreleased reservations (terminal calls)', ledger.unreleasedReservationsOnTerminalCalls)}
          {kv('Lock starvation (24h)', recovery.lockStarvationCount24h)}
          {kv('Recent billing failures (15m)', ledger.recentBillingFailures15m)}
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Recovery">
          {kv('Recovery runs / minute', recovery.recoveryRunsPerMinute)}
          {kv('Billing recovery attempts (15m)', recovery.billingRecoveryAttemptsLast15m)}
          {kv('Stale call signals (24h)', recovery.staleCallsRepaired24h)}
          {kv('Stuck WebRTC sessions (24h)', recovery.stuckSessionsFound24h)}
        </Section>

        <Section title="Pressure & transport">
          {kv('Webhook burst (60s proxy)', pressure.webhookBurstRateProxy)}
          {kv('Transition / emit proxy', pressure.websocketEmitRateProxy)}
          {kv('Redis ping ms', pressure.redisPingMs)}
          {kv('Mongo ping ms', pressure.mongoPingMs)}
          {kv('Webhook latency (1h avg)', pressure.webhookLatency1h?.avgTotalMs)}
        </Section>
      </div>
    </div>
  );
}
