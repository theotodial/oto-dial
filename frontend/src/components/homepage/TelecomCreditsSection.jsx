const CREDIT_CARDS = [
  {
    title: 'Outbound Attempt',
    badge: 'Lightweight',
    description:
      'Short, rejected, or unanswered dialing attempts use only a small slice of telecom credits — you are not penalized when prospects ignore the phone.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5v14" />
      </svg>
    ),
  },
  {
    title: 'Connected Call',
    badge: 'Usage-based',
    description:
      'Connected outbound calls consume cloud dialer credits dynamically based on usage — VoIP billing that reflects real conversations, not a flat timer.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2L8 11a11 11 0 005 5l1.6-2.2a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.7.95V19a2 2 0 01-2 2h-1C9.7 21 3 14.3 3 6V5z"
        />
      </svg>
    ),
  },
  {
    title: 'SMS Usage',
    badge: 'Per message',
    description:
      'Two-way SMS from your US virtual number is metered separately from voice — virtual phone credits for messaging do not silently drain your call pool.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    title: 'Reservation Hold',
    badge: 'Auto-released',
    description:
      'A short reservation can be held while a call is in progress and is released when it ends — avoiding surprise balance drops or stuck virtual phone credits.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'Unlimited Calling Plan',
    badge: 'Flat rate',
    description:
      'Need all-day outbound calling? The Unlimited Call plan gives unlimited outbound calling at a flat monthly price — no cloud dialer credit math, no usage anxiety.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12c0-3 2-5 5-5s5 2 5 5-2 5-5 5-5-2-5-5z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12c0-3-2-5-5-5s-5 2-5 5 2 5 5 5 5-2 5-5z" />
      </svg>
    ),
  },
];

const PRINCIPLES = [
  '1 telecom credit is not the same as 1 minute — credits flex with real telephony usage so outbound call billing stays affordable.',
  'Short or rejected attempts consume fewer resources; connected calls consume credits dynamically as conversations progress.',
  'Designed for cold callers and outbound teams who place hundreds of US attempts per day without surprise carrier-style surcharges.',
  'Smarter than fixed minute bundles, with fair-use billing that avoids expensive hidden telecom fee patterns common on rigid plans.',
];

function TelecomCreditsSection() {
  return (
    <section id="telecom-credits" className="scroll-mt-24 relative py-20 md:py-28 px-4 overflow-hidden bg-slate-100 dark:bg-slate-950 border-y border-slate-200/80 dark:border-slate-800">
      {/* Ambient washes — theme-aware */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[40%] -right-[20%] w-[30rem] h-[30rem] rounded-full blur-3xl bg-emerald-400/35 dark:bg-emerald-500/15" />
        <div className="absolute bottom-[-45%] -left-[15%] w-[34rem] h-[34rem] rounded-full blur-3xl bg-indigo-400/30 dark:bg-indigo-600/25" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,rgba(99,102,241,0.16),transparent_45%),radial-gradient(circle_at_90%_40%,rgba(16,185,129,0.14),transparent_48%)] dark:bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.12),transparent_42%),radial-gradient(circle_at_82%_55%,rgba(99,102,241,0.18),transparent_46%)]" />
      </div>

      <div className="max-w-7xl mx-auto relative">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-xs font-semibold text-indigo-600 dark:text-emerald-300 uppercase tracking-[0.28em] mb-4">
            Telecom credits · VoIP credits
          </p>
          <h2 className="text-3xl md:text-4xl xl:text-[2.75rem] font-bold tracking-tight mb-5 leading-snug text-slate-900 dark:text-white">
            How Telecom Credits Work
          </h2>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-200/90 leading-relaxed">
            OTODIAL uses fair, usage-based telecom credit billing for outbound call billing — cloud dialer credits and
            virtual phone credits that adapt to real calling work, without publishing internal formulas.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 xl:gap-6 mb-16">
          {CREDIT_CARDS.map((card) => (
            <div
              key={card.title}
              className="group relative p-6 xl:p-7 rounded-[1.35rem] border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-white/[0.07] backdrop-blur-md shadow-lg shadow-slate-900/5 dark:shadow-black/35 hover:border-indigo-400/70 dark:hover:border-emerald-300/45 hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-white/15 text-indigo-600 dark:text-emerald-200 flex items-center justify-center ring-1 ring-indigo-500/15 dark:ring-white/10">
                  {card.icon}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-400/15 text-emerald-800 dark:text-emerald-100 ring-1 ring-emerald-600/25 dark:ring-emerald-300/35">
                  {card.badge}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 tracking-tight">{card.title}</h3>
              <p className="text-sm md:text-[0.95rem] text-slate-600 dark:text-slate-200/90 leading-relaxed">
                {card.description}
              </p>
              <span className="absolute inset-x-6 bottom-5 h-px bg-gradient-to-r from-transparent via-indigo-300/75 dark:via-emerald-200/55 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-11 items-stretch">
          <div className="rounded-[1.45rem] border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-white/[0.08] backdrop-blur-md p-7 md:p-8 shadow-xl shadow-slate-900/10 dark:shadow-black/45">
            <h3 className="text-xl md:text-2xl font-bold tracking-tight mb-6 leading-snug text-slate-900 dark:text-white">
              Why telecom SaaS buyers prefer adaptive credits
            </h3>
            <ul className="space-y-4">
              {PRINCIPLES.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <span className="mt-0.5 w-6 h-6 rounded-xl bg-indigo-100 dark:bg-emerald-400/18 text-indigo-600 dark:text-emerald-100 flex items-center justify-center flex-shrink-0 ring-1 ring-indigo-400/35 dark:ring-emerald-300/35">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="text-sm md:text-base text-slate-700 dark:text-slate-100 leading-relaxed">{p}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-xs text-slate-600 dark:text-slate-300/90 leading-relaxed border-t border-slate-100 dark:border-white/10 pt-5">
              For absolute predictable spend on heavy workloads, upgrade to Unlimited outbound calling —{' '}
              <a href="#pricing" className="text-indigo-600 dark:text-emerald-200 font-semibold underline decoration-indigo-300 dark:decoration-emerald-200/65 hover:text-indigo-800 dark:hover:text-white transition-colors">
                view pricing
              </a>
              .
            </p>
          </div>

          <div className="rounded-[1.45rem] border border-slate-200 dark:border-white/12 bg-white dark:bg-white/[0.1] backdrop-blur-xl p-6 md:p-7 shadow-xl shadow-slate-900/10 dark:shadow-black/50">
            <div className="flex items-center justify-between mb-5">
              <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-300">
                Illustrative day
              </div>
              <span className="text-[11px] uppercase tracking-wide font-semibold text-emerald-800 dark:text-emerald-50 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/20 ring-1 ring-emerald-600/25 dark:ring-emerald-300/35">
                Fair-use snapshot
              </span>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Outbound attempts', value: '184', sub: 'lighter usage', pct: '22%' },
                { label: 'Connected calls', value: '46', sub: 'dynamic metering', pct: '58%' },
                { label: 'Outbound SMS', value: '38', sub: 'per message', pct: '14%' },
                { label: 'Reservations released', value: '46 / 46', sub: 'auto-released', pct: '100%' },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-slate-800 dark:text-slate-100 font-semibold">{row.label}</div>
                    <div className="text-slate-900 dark:text-white font-semibold tabular-nums">{row.value}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-slate-100 dark:bg-white/12 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-teal-500 to-emerald-500 dark:from-emerald-400 dark:via-teal-300 dark:to-indigo-400"
                        style={{ width: row.pct }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-300">{row.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-indigo-100 dark:border-white/14 bg-indigo-50/60 dark:bg-white/10 p-4 text-sm text-slate-800 dark:text-slate-50 leading-relaxed">
              Telecom credits flex with outcomes: unanswered cold calls skim less balance, substantive conversations ramp
              up — outbound call billing that stays honest for telecom SaaS teams.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default TelecomCreditsSection;
