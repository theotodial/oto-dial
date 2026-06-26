import { memo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import VirtualList from './VirtualList';
import { formatDuration, channelLabel } from '../formatters';

const STATUS_COLORS = {
  active: 'bg-emerald-500 shadow-emerald-500/50',
  idle: 'bg-amber-500 shadow-amber-500/50'
};

function StatusDot({ status }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 ${STATUS_COLORS[status] || 'bg-gray-400'}`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${STATUS_COLORS[status] || 'bg-gray-400'}`} />
    </span>
  );
}

function FlagPills({ row }) {
  const pills = [];
  if (row.isNew) pills.push('New');
  if (row.isReturning) pills.push('Returning');
  if (row.userId) pills.push('Logged In');
  if (row.isSubscriber) pills.push('Subscriber');
  if (row.isAdmin) pills.push('Admin');
  if (row.isBot) pills.push('Bot');
  if (row.flags?.inCheckout) pills.push('Checkout');
  if (row.isActiveNow) pills.push('Active 5m');
  return (
    <div className="flex flex-wrap gap-1">
      {pills.map((label) => (
        <span
          key={label}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-500/10 text-gray-700 dark:text-gray-300"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

const VisitorRow = memo(function VisitorRow({ row, expanded, onToggle, onSelect }) {
  return (
    <div className="border-b border-gray-100 dark:border-slate-800/80">
      <div
        className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50/80 dark:hover:bg-slate-800/40 cursor-pointer text-xs"
        onClick={() => onSelect?.(row)}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(row.sessionId); }}
          className="p-0.5 text-gray-400 hover:text-gray-600"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <StatusDot status={row.liveStatus} />
        <span className="font-mono text-[10px] text-gray-400 w-20 truncate" title={row.visitorId}>{row.visitorId?.slice(-8)}</span>
        <span className="w-28 truncate font-medium text-gray-800 dark:text-gray-200">{row.userName || '—'}</span>
        <span className="w-36 truncate text-gray-500">{row.userEmail || '—'}</span>
        <span className="w-20 truncate">{row.subscriptionPlan || row.planTier || '—'}</span>
        <span className="flex-1 min-w-[140px] truncate text-indigo-600 dark:text-indigo-400" title={row.currentPage}>{row.currentPage || '—'}</span>
        <span className="w-14 tabular-nums">{formatDuration(row.sessionDurationSeconds || 0)}</span>
        <span className="w-14 tabular-nums text-amber-600">{formatDuration(row.idleSeconds || 0)}</span>
        <span className="w-8 tabular-nums">{row.pagesViewed || 0}</span>
        <span className="w-16 truncate">{row.country || '—'}</span>
        <span className="w-16 truncate capitalize">{row.device || '—'}</span>
        <span className="w-24 truncate" title={row.source}>{channelLabel(row.source || row.channel)}</span>
        <FlagPills row={row} />
      </div>
      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-gray-50/50 dark:bg-slate-900/40 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-[11px]">
          <Field label="Session ID" value={row.sessionId} mono />
          <Field label="User ID" value={row.userId} mono />
          <Field label="Credits" value={row.remainingCredits} />
          <Field label="Page Title" value={row.pageTitle} />
          <Field label="URL" value={row.currentUrl || row.currentPage} />
          <Field label="City" value={row.city} />
          <Field label="Region" value={row.region} />
          <Field label="IP" value={row.ipAddress} mono />
          <Field label="Browser" value={row.browser} />
          <Field label="OS" value={row.os} />
          <Field label="UTM Source" value={row.utmSource} />
          <Field label="UTM Medium" value={row.utmMedium} />
          <Field label="UTM Campaign" value={row.utmCampaign} />
          <Field label="Channel" value={row.channel} />
          <Field label="Referrer" value={row.referrer} />
          <Field label="Landing" value={row.landingPage} />
          <Field label="Conversion" value={row.conversion} />
          <Field label="Entry" value={row.sessionStartedAt ? new Date(row.sessionStartedAt).toLocaleString() : '—'} />
          <Field label="Last Activity" value={row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleString() : '—'} />
        </div>
      )}
    </div>
  );
});

function Field({ label, value, mono }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <div className="text-gray-400 uppercase tracking-wide text-[9px]">{label}</div>
      <div className={`truncate ${mono ? 'font-mono' : ''}`} title={String(value)}>{String(value)}</div>
    </div>
  );
}

export default function ActiveVisitorTable({ visitors = [], pagination = null, onSelectVisitor }) {
  const [expanded, setExpanded] = useState(new Set());
  const rowHeight = 46;
  const total = pagination?.total ?? visitors.length;
  const loaded = pagination?.loaded ?? visitors.length;
  const showingTruncated = total > loaded;

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Active Visitors</h3>
          <p className="text-xs text-gray-500">
            {showingTruncated
              ? `Showing ${loaded.toLocaleString()} most recent of ${total.toLocaleString()} in window`
              : `${total.toLocaleString()} session(s) in window`}
            {' · '}click a row for full intelligence
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[1200px]">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50/80 dark:bg-slate-800/50 text-[10px] uppercase tracking-wide font-semibold text-gray-500 sticky top-0 z-10">
            <span className="w-6" />
            <span className="w-2.5" />
            <span className="w-20">Visitor</span>
            <span className="w-28">Name</span>
            <span className="w-36">Email</span>
            <span className="w-20">Plan</span>
            <span className="flex-1 min-w-[140px]">Current Page</span>
            <span className="w-14">Session</span>
            <span className="w-14">Idle</span>
            <span className="w-8">PV</span>
            <span className="w-16">Country</span>
            <span className="w-16">Device</span>
            <span className="w-24">Source</span>
            <span className="w-36">Flags</span>
          </div>
          {visitors.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">No visitors in the selected window</p>
          ) : (
            <VirtualList
              items={visitors}
              rowHeight={rowHeight}
              height={Math.min(640, Math.max(280, visitors.length * rowHeight))}
              renderRow={(row) => (
                <VisitorRow
                  row={row}
                  expanded={expanded.has(row.sessionId)}
                  onToggle={toggle}
                  onSelect={onSelectVisitor}
                />
              )}
              getKey={(row) => row.sessionId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
