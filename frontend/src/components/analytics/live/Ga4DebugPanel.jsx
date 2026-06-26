import { useEffect, useState } from 'react';
import { Bug } from 'lucide-react';
import { getGa4DebugState } from '../../../utils/analyticsClient';
import API from '../../../api';
import CollapsibleSection from './CollapsibleSection';

/**
 * GA4 Debug Panel — server MP status (primary on admin) + optional browser client state.
 */
export default function Ga4DebugPanel() {
  const [client, setClient] = useState(() => getGa4DebugState());
  const [server, setServer] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const res = await API.get('/api/analytics/admin/ga4/status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setServer(res?.data?.data || null);
      } catch {
        setServer(null);
      }
    };
    load();
    const t = setInterval(() => {
      setClient(getGa4DebugState());
      load();
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const mp = server?.measurementProtocol || {};

  return (
    <CollapsibleSection
      id="ga4-debug"
      title="GA4 Debug"
      icon={Bug}
      defaultOpen={false}
      className="border-dashed border-indigo-400/40 bg-indigo-500/5"
    >
      <p className="text-[11px] text-indigo-600/80 dark:text-indigo-300/80 mb-3 pt-3">
        Admin view shows server Measurement Protocol stats. Browser GA only applies on the public site.
      </p>
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">Server (Measurement Protocol)</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
        <Cell label="Measurement ID" value={server?.measurementId || '—'} mono />
        <Cell label="MP Configured" value={server?.mpConfigured ? 'yes' : 'no'} />
        <Cell label="MP Sent" value={mp.sent ?? 0} />
        <Cell label="MP Failed" value={mp.failed ?? 0} />
        <Cell label="MP Retry Queue" value={mp.queueLength ?? 0} />
        <Cell label="Last MP Event" value={mp.lastEventAt ? new Date(mp.lastEventAt).toLocaleTimeString() : '—'} />
        <Cell label="GA4 Enabled" value={server?.enabled ? 'yes' : 'no'} />
        <Cell label="Debug Mode" value={server?.debug ? 'yes' : 'no'} />
      </div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">Browser client (this tab)</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Cell label="Browser GA" value={client.connected ? 'connected' : 'not active'} />
        <Cell label="Client ID" value={client.clientId || '—'} mono />
        <Cell label="Session ID" value={client.sessionId || '—'} mono />
        <Cell label="Visitor ID" value={client.visitorId || '—'} mono />
        <Cell label="Events Sent" value={client.eventsSent ?? 0} />
        <Cell label="Client Queue" value={client.queueLength ?? 0} />
        <Cell label="Last Event" value={client.lastEvent?.name || '—'} />
        <Cell label="Last Purchase" value={client.lastPurchase?.name || '—'} />
      </div>
    </CollapsibleSection>
  );
}

function Cell({ label, value, mono }) {
  return (
    <div>
      <div className="text-gray-400 uppercase text-[9px]">{label}</div>
      <div className={`font-medium truncate ${mono ? 'font-mono text-[11px]' : ''}`} title={String(value)}>
        {String(value)}
      </div>
    </div>
  );
}
