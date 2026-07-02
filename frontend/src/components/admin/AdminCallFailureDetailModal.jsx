import { useEffect, useState } from 'react';
import API from '../../api';

const TERMINAL_FAILURE_STATUSES = new Set([
  'failed',
  'no-answer',
  'busy',
  'rejected',
  'canceled',
]);

export function isInspectableCallFailure(status) {
  return TERMINAL_FAILURE_STATUSES.has(String(status || '').toLowerCase());
}

function DetailRow({ label, value, mono = false }) {
  if (value == null || value === '') return null;
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div
        className={`col-span-2 text-sm text-gray-900 dark:text-white break-all ${
          mono ? 'font-mono text-xs' : ''
        }`}
      >
        {String(value)}
      </div>
    </div>
  );
}

export default function AdminCallFailureDetailModal({ callId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    if (!callId) return undefined;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await API.get(`/api/admin/calls/${callId}`);
        if (cancelled) return;
        if (!response?.data?.success) {
          setError(response?.data?.error || 'Failed to load call details');
          setPayload(null);
          return;
        }
        setPayload(response.data);
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.error || err?.message || 'Failed to load call details');
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [callId]);

  if (!callId) return null;

  const call = payload?.call || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-gray-200 dark:border-slate-700">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Call failure details</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {call.fromNumber || '—'} → {call.toNumber || call.phoneNumber || '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-5rem)] px-5 py-4">
          {loading && (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Loading call diagnostics…
            </div>
          )}

          {!loading && error && (
            <div className="py-6 text-sm text-red-600 dark:text-red-400">{error}</div>
          )}

          {!loading && !error && payload && (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Summary</h3>
                <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                  <DetailRow label="Status" value={call.status} />
                  <DetailRow label="User" value={call.userEmail} />
                  <DetailRow label="Fail reason" value={call.failReason} />
                  <DetailRow label="Hangup cause" value={call.hangupCause} />
                  <DetailRow label="Hangup code" value={call.hangupCauseCode} mono />
                  <DetailRow label="Duration" value={`${call.durationSeconds || 0}s`} />
                  <DetailRow label="Orphan cause" value={call.orphanRootCause} />
                  <DetailRow label="Termination" value={call.terminationSource} />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Timeline</h3>
                <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                  <DetailRow label="Initiated" value={call.callInitiatedAt ? new Date(call.callInitiatedAt).toLocaleString() : null} />
                  <DetailRow label="Ringing" value={call.callRingingAt ? new Date(call.callRingingAt).toLocaleString() : null} />
                  <DetailRow label="Answered" value={call.callAnsweredAt ? new Date(call.callAnsweredAt).toLocaleString() : null} />
                  <DetailRow label="Ended" value={call.callEndedAt ? new Date(call.callEndedAt).toLocaleString() : null} />
                  <DetailRow label="Last heartbeat" value={call.lastHeartbeatAt ? new Date(call.lastHeartbeatAt).toLocaleString() : null} />
                  <DetailRow label="Last client sync" value={call.lastClientSyncAt ? new Date(call.lastClientSyncAt).toLocaleString() : null} />
                  <DetailRow label="Last Telnyx webhook" value={call.telnyxLastWebhookAt ? new Date(call.telnyxLastWebhookAt).toLocaleString() : null} />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Telnyx / routing</h3>
                <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                  <DetailRow label="Source" value={call.source} />
                  <DetailRow label="Direction" value={call.direction} />
                  <DetailRow label="Call control ID" value={call.telnyxCallControlId} mono />
                  <DetailRow label="Session ID" value={call.telnyxCallSessionId} mono />
                  <DetailRow label="Last event" value={call.lastEventType} />
                  <DetailRow label="Event source" value={call.lastEventSource} />
                  <DetailRow
                    label="Allowed countries"
                    value={
                      Array.isArray(call.userAllowedCallCountries) && call.userAllowedCallCountries.length
                        ? call.userAllowedCallCountries.join(', ')
                        : 'US, CA (default)'
                    }
                  />
                </div>
              </section>

              {payload.lifecycleEvents?.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Lifecycle events</h3>
                  <div className="rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
                    {payload.lifecycleEvents.map((event) => (
                      <div key={event.id} className="px-3 py-2 text-xs">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {event.event || 'event'} · {event.previousState || '—'} → {event.nextState || '—'}
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                          {event.timestamp ? new Date(event.timestamp).toLocaleString() : '—'}
                          {event.action ? ` · ${event.action}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
