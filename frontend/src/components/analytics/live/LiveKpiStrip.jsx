import { motion } from 'framer-motion';
import {
  Users, UserCheck, UserX, Repeat, Sparkles, Crown, CreditCard,
  Phone, MessageSquare, ShoppingCart, DollarSign, Timer, Eye,
  TrendingUp, AlertTriangle, Radio, LayoutDashboard, LogIn, Zap
} from 'lucide-react';
import { formatCurrency, formatFull, formatDuration, formatPercent } from '../formatters';

const accentClasses = {
  emerald: 'border-emerald-500/30 from-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  indigo: 'border-indigo-500/30 from-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  violet: 'border-violet-500/30 from-violet-500/15 text-violet-600 dark:text-violet-400',
  amber: 'border-amber-500/30 from-amber-500/15 text-amber-600 dark:text-amber-400',
  rose: 'border-rose-500/30 from-rose-500/15 text-rose-600 dark:text-rose-400',
  cyan: 'border-cyan-500/30 from-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  blue: 'border-blue-500/30 from-blue-500/15 text-blue-600 dark:text-blue-400',
  slate: 'border-slate-500/30 from-slate-500/15 text-slate-600 dark:text-slate-400'
};

/** Hero KPIs — matches legacy realtime summary card */
const HERO_KPIS = [
  { key: 'activeVisitors', label: 'Unique Visitors', icon: Users, accent: 'indigo' },
  { key: 'activeNow', label: 'Active Now (5m)', icon: Zap, accent: 'emerald' },
  { key: 'liveSignups', label: 'Sign-ups', icon: UserCheck, accent: 'violet' },
  { key: 'subscribersOnline', label: 'Subscribers in Window', icon: Crown, accent: 'amber' }
];

const AUDIENCE_KPIS = [
  { key: 'activeLoggedIn', label: 'Logged In', icon: UserCheck, accent: 'indigo' },
  { key: 'anonymousVisitors', label: 'Anonymous', icon: UserX, accent: 'slate' },
  { key: 'returningVisitors', label: 'Returning', icon: Repeat, accent: 'violet' },
  { key: 'newVisitors', label: 'New', icon: Sparkles, accent: 'cyan' },
  { key: 'paidSubscribersOnline', label: 'Paid in Window', icon: CreditCard, accent: 'emerald' }
];

const INTENT_KPIS = [
  { key: 'visitorsInCheckout', label: 'In Checkout', icon: ShoppingCart, accent: 'amber' },
  { key: 'visitorsOnPricing', label: 'Viewing Pricing', icon: DollarSign, accent: 'cyan' },
  { key: 'visitorsOnSignup', label: 'Viewing Signup', icon: LogIn, accent: 'indigo' },
  { key: 'visitorsOnDashboard', label: 'On Dashboard', icon: LayoutDashboard, accent: 'emerald' }
];

const ACTIVITY_KPIS = [
  { key: 'liveCalls', label: 'Calls', icon: Phone, accent: 'rose' },
  { key: 'liveSms', label: 'SMS', icon: MessageSquare, accent: 'blue' },
  { key: 'livePurchases', label: 'Purchases', icon: ShoppingCart, accent: 'emerald' },
  { key: 'liveRevenueWindow', label: 'Revenue', icon: DollarSign, accent: 'emerald', fmt: 'currency' }
];

const ENGAGEMENT_KPIS = [
  { key: 'avgSessionSeconds', label: 'Avg Session', icon: Timer, accent: 'violet', fmt: 'duration' },
  { key: 'avgPagesViewed', label: 'Avg Pages', icon: Eye, accent: 'cyan', fmt: 'decimal' },
  { key: 'liveConversionRate', label: 'Conv. Rate', icon: TrendingUp, accent: 'emerald', fmt: 'percent' },
  { key: 'bounceRisk', label: 'Bounce Risk', icon: AlertTriangle, accent: 'rose', fmt: 'percent' }
];

const PLAN_KPIS = [
  { key: 'basicUsersOnline', label: 'Basic', icon: Users, accent: 'blue' },
  { key: 'superUsersOnline', label: 'Super', icon: Users, accent: 'violet' },
  { key: 'unlimitedUsersOnline', label: 'Unlimited', icon: Users, accent: 'indigo' },
  { key: 'enterpriseUsersOnline', label: 'Enterprise', icon: Users, accent: 'rose' }
];

function formatValue(val, fmt, kpis) {
  const revenue = kpis.liveRevenueWindow ?? kpis.liveRevenueToday ?? 0;
  if (fmt === 'currency') return formatCurrency(val ?? revenue);
  if (fmt === 'duration') return formatDuration(val || 0);
  if (fmt === 'percent') return formatPercent(val || 0);
  if (fmt === 'decimal') return Number(val || 0).toFixed(1);
  return formatFull(val || 0);
}

function KpiTile({ def, kpis }) {
  const { key, label, icon: Icon, accent, fmt } = def;
  const raw = key === 'liveRevenueWindow'
    ? (kpis.liveRevenueWindow ?? kpis.liveRevenueToday)
    : kpis[key];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-xl border bg-white/70 dark:bg-slate-900/60 backdrop-blur-md p-3 shadow-sm bg-gradient-to-br to-transparent ${accentClasses[accent] || accentClasses.indigo}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 opacity-80" />
        <span className="text-[10px] uppercase tracking-wide font-semibold opacity-70 truncate">{label}</span>
      </div>
      <motion.div
        key={String(raw)}
        initial={{ scale: 0.95, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-xl font-bold tabular-nums text-gray-900 dark:text-white"
      >
        {formatValue(raw, fmt, kpis)}
      </motion.div>
    </motion.div>
  );
}

function KpiSection({ title, defs, kpis, cols = 'grid-cols-2 sm:grid-cols-4' }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 font-semibold">
        {title}
      </h4>
      <div className={`grid ${cols} gap-3`}>
        {defs.map((def) => (
          <KpiTile key={def.key} def={def} kpis={kpis} />
        ))}
      </div>
    </div>
  );
}

export default function LiveKpiStrip({ kpis = {}, connected, connecting = false, windowLabel = '15m' }) {
  const streamLabel = connected
    ? 'Live stream connected'
    : connecting
      ? 'Connecting to live stream…'
      : 'REST polling (live stream unavailable)';

  const planTotal =
    (kpis.basicUsersOnline || 0) +
    (kpis.superUsersOnline || 0) +
    (kpis.unlimitedUsersOnline || 0) +
    (kpis.enterpriseUsersOnline || 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${connected ? 'text-emerald-500 animate-pulse' : connecting ? 'text-indigo-400' : 'text-amber-500'}`} />
          <span>{streamLabel}</span>
        </div>
        <span className="text-xs">Window: <strong>{windowLabel}</strong></span>
      </div>

      <KpiSection title="Realtime overview" defs={HERO_KPIS} kpis={kpis} cols="grid-cols-2 lg:grid-cols-4" />

      <KpiSection title="Audience" defs={AUDIENCE_KPIS} kpis={kpis} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" />

      <KpiSection title="On-site intent" defs={INTENT_KPIS} kpis={kpis} />

      <KpiSection title="Activity in window" defs={ACTIVITY_KPIS} kpis={kpis} />

      <KpiSection title="Engagement" defs={ENGAGEMENT_KPIS} kpis={kpis} />

      {planTotal > 0 && (
        <KpiSection
          title={`Plans online (${planTotal} subscriber${planTotal === 1 ? '' : 's'} in window)`}
          defs={PLAN_KPIS}
          kpis={kpis}
        />
      )}
    </div>
  );
}
