import { X, MapPin, Monitor, Globe, CreditCard, Clock, Activity } from 'lucide-react';
import { formatDuration, formatCurrency, channelLabel } from '../formatters';

function Section({ title, icon: Icon, children }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500 mb-2">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="text-sm">
      <div className="text-[10px] text-gray-400 uppercase">{label}</div>
      <div className="font-medium break-all">{String(value)}</div>
    </div>
  );
}

export default function VisitorDetailPanel({ visitor, onClose, revealIp, onToggleRevealIp, superAdmin }) {
  if (!visitor) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-lg z-50 bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-700 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-gray-100 dark:border-slate-800 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Visitor Intelligence</h2>
            <p className="text-xs text-gray-500 font-mono truncate">{visitor.sessionId}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-1">
          <div className="flex items-center gap-2 mb-4">
            <span className={`w-2.5 h-2.5 rounded-full ${visitor.liveStatus === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-sm capitalize">{visitor.liveStatus || 'active'}</span>
            <span className="text-xs text-gray-400">· {formatDuration(visitor.sessionDurationSeconds || 0)} session</span>
          </div>

          <Section title="Profile" icon={Activity}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" value={visitor.userName} />
              <Field label="Email" value={visitor.userEmail} />
              <Field label="User ID" value={visitor.userId} />
              <Field label="Visitor ID" value={visitor.visitorId} />
              <Field label="Plan" value={visitor.subscriptionPlan} />
              <Field label="Status" value={visitor.subscriptionStatus} />
              <Field label="Credits" value={visitor.remainingCredits} />
              <Field label="Type" value={visitor.visitorType} />
            </div>
          </Section>

          <Section title="Session" icon={Clock}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Current page" value={visitor.currentPage} />
              <Field label="Previous" value={visitor.previousPage} />
              <Field label="Pages viewed" value={visitor.pagesViewed} />
              <Field label="Idle" value={formatDuration(visitor.idleSeconds || 0)} />
              <Field label="Started" value={visitor.sessionStartedAt ? new Date(visitor.sessionStartedAt).toLocaleString() : null} />
              <Field label="Visit count" value={visitor.visitCount} />
            </div>
          </Section>

          <Section title="Location" icon={MapPin}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country" value={visitor.country} />
              <Field label="City" value={visitor.city} />
              <Field label="Region" value={visitor.region} />
              <Field label="Timezone" value={visitor.timezone} />
              <Field label="Coordinates" value={visitor.coordinates ? `${visitor.coordinates.lat}, ${visitor.coordinates.lng}` : null} />
              <div>
                <div className="text-[10px] text-gray-400 uppercase">IP Address</div>
                <div className="font-mono text-sm">{visitor.ipAddress || '—'}</div>
                {superAdmin && (
                  <button
                    type="button"
                    onClick={onToggleRevealIp}
                    className="mt-1 text-[10px] text-indigo-500 hover:underline"
                  >
                    {revealIp ? 'Mask IP' : 'Reveal full IP'}
                  </button>
                )}
              </div>
            </div>
          </Section>

          <Section title="Device" icon={Monitor}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Device" value={visitor.device} />
              <Field label="Brand" value={visitor.deviceBrand} />
              <Field label="Browser" value={visitor.browser} />
              <Field label="OS" value={visitor.os} />
              <Field label="Screen" value={visitor.screenResolution} />
              <Field label="Viewport" value={visitor.viewport} />
              <Field label="Language" value={visitor.language} />
              <Field label="Network" value={visitor.networkType} />
            </div>
          </Section>

          <Section title="Campaign" icon={Globe}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Source" value={channelLabel(visitor.source || visitor.channel)} />
              <Field label="Medium" value={visitor.medium || visitor.utmMedium} />
              <Field label="Campaign" value={visitor.campaign || visitor.utmCampaign} />
              <Field label="Referrer" value={visitor.referrer} />
              <Field label="Landing" value={visitor.landingPage} />
              <Field label="GA Client" value={visitor.gaClientId} />
            </div>
          </Section>

          {visitor.timeline?.length > 0 && (
            <Section title="Live Timeline">
              <div className="relative pl-4 border-l-2 border-indigo-500/30 space-y-3">
                {visitor.timeline.map((t, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <div className="text-[10px] text-gray-400">{t.at ? new Date(t.at).toLocaleTimeString() : ''}</div>
                    <div className="text-sm font-medium capitalize">{t.type || t.label}</div>
                    {t.label && t.type !== t.label && <div className="text-xs text-gray-500 truncate">{t.label}</div>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {visitor.events?.length > 0 && (
            <Section title="Events" icon={CreditCard}>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {visitor.events.slice(0, 20).map((e, i) => (
                  <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-100 dark:border-slate-800">
                    <span className="capitalize">{e.kind}</span>
                    {e.value > 0 && <span className="text-emerald-600">{formatCurrency(e.value)}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </aside>
    </>
  );
}
