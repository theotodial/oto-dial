import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Activity, Database, Wifi } from 'lucide-react';
import API from '../../../api';
import CollapsibleSection from './CollapsibleSection';

export default function AnalyticsHealthPanel({ window = '15m' }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const res = await API.get(`/api/analytics/admin/health?window=${window}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!cancelled) setHealth(res?.data?.data || null);
      } catch {
        if (!cancelled) setHealth(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [window]);

  if (loading && !health) {
    return <div className="h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />;
  }

  const recon = health?.reconciliation;
  const healthy = recon?.healthy !== false;

  const badge = (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
      healthy ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'
    }`}>
      {healthy ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {healthy ? 'Reconciled' : `${recon?.warnings?.length || 0} mismatch(es)`}
    </span>
  );

  return (
    <CollapsibleSection id="health" title="Analytics Health" icon={Activity} badge={badge} defaultOpen={!healthy}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs pt-3">
        <StatusPill label="Tracking" value={health?.tracking?.status} />
        <StatusPill label="GA4" value={health?.ga4?.status} />
        <StatusPill label="Stripe" value={health?.stripe?.status} />
        <StatusPill label="WebSocket" value={health?.websocket?.status} />
        <StatusPill label="Mongo" value={health?.mongo?.status} icon={Database} />
        <StatusPill label="Redis" value={health?.redis?.status} icon={Wifi} />
      </div>
      {!healthy && recon?.warnings?.length > 0 && (
        <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
          {recon.warnings.map((w) => (
            <div key={w.metric} className="text-[11px] text-amber-700 dark:text-amber-300 flex justify-between gap-2">
              <span>{w.metric}</span>
              <span className="font-mono">Δ{w.delta} ({w.collection})</span>
            </div>
          ))}
        </div>
      )}
      {health?.reconciliation?.dataQuality?.duplicateEventIds > 0 && (
        <p className="mt-2 text-[11px] text-rose-500">
          {health.reconciliation.dataQuality.duplicateEventIds} duplicate event ID(s) detected in window
        </p>
      )}
    </CollapsibleSection>
  );
}

function StatusPill({ label, value, icon: Icon }) {
  const ok = value === 'healthy' || value === 'configured' || value === 'connected' || value === 'active';
  return (
    <div className="rounded-lg border border-gray-100 dark:border-slate-800 p-2">
      <div className="text-gray-400 uppercase tracking-wide text-[9px]">{label}</div>
      <div className={`font-medium capitalize flex items-center gap-1 ${ok ? 'text-emerald-600' : 'text-gray-600 dark:text-gray-300'}`}>
        {Icon && <Icon className="w-3 h-3" />}
        {value || '—'}
      </div>
    </div>
  );
}
