import { useEffect, useState } from 'react';
import { Activity, Database, Server, Wifi } from 'lucide-react';
import API from '../../../api';

export default function ServerHealthStrip() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const res = await API.get('/api/admin/system-health', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!cancelled) setHealth(res?.data?.data || res?.data || null);
      } catch {
        if (!cancelled) setHealth(null);
      }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const status = health?.status || health?.overall || 'unknown';
  const ok = status === 'healthy' || status === 'ok' || status === 'green';

  return (
    <div className="rounded-xl border border-gray-200/80 dark:border-slate-700/80 bg-gradient-to-r from-slate-900/90 to-indigo-950/90 text-white px-4 py-3 flex flex-wrap items-center gap-4 text-xs">
      <div className="flex items-center gap-2 font-semibold">
        <Server className="w-4 h-4 text-indigo-400" />
        Server Health
      </div>
      <span className={`px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
        {String(status).toUpperCase()}
      </span>
      {health?.mongodb && (
        <span className="flex items-center gap-1 text-slate-300">
          <Database className="w-3.5 h-3.5" /> MongoDB {health.mongodb}
        </span>
      )}
      {health?.redis && (
        <span className="flex items-center gap-1 text-slate-300">
          <Wifi className="w-3.5 h-3.5" /> Redis {health.redis}
        </span>
      )}
      {health?.uptime != null && (
        <span className="flex items-center gap-1 text-slate-400">
          <Activity className="w-3.5 h-3.5" /> Uptime {Math.round(health.uptime / 60)}m
        </span>
      )}
      {!health && <span className="text-slate-500">Loading system metrics…</span>}
    </div>
  );
}
