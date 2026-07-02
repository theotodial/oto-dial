import { Link } from 'react-router-dom';

function StatusPill({ label, value, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone] || tones.gray}`}>
      {label}: {value}
    </span>
  );
}

function toneForStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active' || s === 'approved' || s === 'verified') return 'green';
  if (s === 'pending' || s === 'pending_activation' || s === 'in_progress') return 'amber';
  if (s === 'blocked' || s === 'rejected' || s === 'cancelled') return 'red';
  return 'gray';
}

export default function AdminSupportUserContext({ userContext, loading }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-4 animate-pulse">
        <div className="h-4 w-32 bg-gray-200 dark:bg-slate-700 rounded mb-3" />
        <div className="h-3 w-full bg-gray-200 dark:bg-slate-700 rounded mb-2" />
        <div className="h-3 w-2/3 bg-gray-200 dark:bg-slate-700 rounded" />
      </div>
    );
  }

  if (!userContext) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/40 p-4">
        <p className="text-sm font-medium text-gray-900 dark:text-white">No linked OTO-DIAL account</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          This request may be from a guest email. Search Users by email to find a matching account.
        </p>
      </div>
    );
  }

  const { userId, name, email, subscription, phoneNumbers } = userContext;

  return (
    <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            Customer account
          </p>
          <p className="text-base font-semibold text-gray-900 dark:text-white truncate mt-0.5">{name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{email}</p>
        </div>
        <Link
          to={`/adminbobby/users/${userId}`}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
        >
          Open full profile
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <StatusPill label="Account" value={userContext.accountStatus || 'unknown'} tone={toneForStatus(userContext.accountStatus)} />
        <StatusPill
          label="Email"
          value={userContext.isEmailVerified ? 'verified' : 'unverified'}
          tone={userContext.isEmailVerified ? 'green' : 'amber'}
        />
        <StatusPill
          label="Identity"
          value={userContext.identityStatus || 'not_submitted'}
          tone={toneForStatus(userContext.identityStatus)}
        />
        {subscription?.status && (
          <StatusPill label="Subscription" value={subscription.status} tone={toneForStatus(subscription.status)} />
        )}
      </div>

      {subscription && (
        <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
          <p>
            <span className="text-gray-500 dark:text-gray-400">Plan:</span>{' '}
            <span className="font-medium text-gray-900 dark:text-white">{subscription.planName || '—'}</span>
          </p>
          <p>
            <span className="text-gray-500 dark:text-gray-400">Numbers:</span>{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {subscription.numbersUsed ?? 0}
              {subscription.numbersLimit != null ? ` / ${subscription.numbersLimit}` : ''}
            </span>
          </p>
          {subscription.stripeSubscriptionId && (
            <p className="font-mono break-all text-[11px] text-gray-500 dark:text-gray-400">
              Sub: {subscription.stripeSubscriptionId}
            </p>
          )}
        </div>
      )}

      {phoneNumbers?.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            Phone numbers
          </p>
          <ul className="space-y-1.5">
            {phoneNumbers.map((row) => (
              <li
                key={row.id || row.number}
                className="flex items-center justify-between gap-2 text-sm bg-white/70 dark:bg-slate-900/40 rounded-lg px-2.5 py-1.5 border border-gray-200/60 dark:border-slate-700/60"
              >
                <span className="font-mono text-gray-900 dark:text-white">{row.number}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{row.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {userContext.stripeCustomerId && (
        <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 break-all">
          Stripe customer: {userContext.stripeCustomerId}
        </p>
      )}
    </div>
  );
}
