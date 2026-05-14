import PrefetchLink from '../PrefetchLink';

const HIGHLIGHTS = [
  {
    title: 'Get a US Number Without a SIM Card',
    description:
      'Provisioning happens fully online. Your affordable US virtual phone number routes voice and SMS inside OTODIAL—no storefront visit, plastic SIM, or eSIM juggling.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h10l4 4v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
      </svg>
    ),
  },
  {
    title: 'Online US Phone Number for Calling & SMS',
    description:
      'Treat this like your portable business phone number: outbound calling powered by telecom credits plus two-way texting for sequences that need both channels.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    title: 'Affordable US Virtual Phone Number',
    description:
      'Your free US virtual number is bundled with subscription economics designed for freelancers and outbound teams—we do not inflate the line item with gimmicky add-ons.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-2 0-3 1-3 3v2h6v-2c0-2-1-3-3-3zM5 21h14M12 17v4m-7 0h14" />
      </svg>
    ),
  },
  {
    title: 'Works on Desktop, Laptop, & Mobile Browser',
    description:
      'Whether you dial from coworking lounges or home offices overseas, OTODIAL keeps the same US virtual phone identity—purely browser powered, synced for remote sales.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-3a4 4 0 014-4h0M3 21h18M5 5h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
      </svg>
    ),
  },
];

function FreeUSNumberSection() {
  return (
    <section
      id="free-us-number"
      className="scroll-mt-24 relative py-20 md:py-28 px-4 bg-gradient-to-b from-white via-gray-50/70 to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 overflow-hidden"
    >
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-36 left-1/2 -translate-x-1/2 w-[44rem] h-[44rem] bg-indigo-300/22 dark:bg-indigo-600/12 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto relative">
        <div className="grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] gap-12 xl:gap-20 items-start">
          <div>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-3">
              Free US Virtual Number Included
            </p>

            <h2 className="text-3xl md:text-4xl xl:text-[2.65rem] font-bold text-gray-900 dark:text-white tracking-tight mb-4 leading-tight">
              Free US Virtual Number for Serious Outbound Operators
            </h2>

            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300/90 bg-amber-50 dark:bg-amber-950/35 border border-amber-200/80 dark:border-amber-700/40 rounded-lg px-3 py-2 inline-block mb-6">
              OTODIAL currently provisions US inventory only—we do not offer UK lines, pseudo-global catalogs, or
              multi-country storefronts today.
            </p>

            <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed mb-5">
              When we say{' '}
              <span className="font-semibold text-gray-800 dark:text-gray-200">free US virtual number</span>, we mean it
              is included with each active paid plan—a virtual US phone number you can activate for outbound calling &
              inbound SMS workflows without layering hidden carrier rents.
            </p>

            <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed mb-10">
              This is deliberately not a gimmick texting app—it is telecom SaaS: receive calls online, originate remote
              sales conversations, punch through voicemail follow-ups by SMS, and keep your outbound calling software
              stack consolidated.
            </p>

            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 tracking-tight">
              Highlights teams reference on every demo call
            </h3>

            <ul className="space-y-6 mb-10">
              {HIGHLIGHTS.map((h) => (
                <li key={h.title} className="flex gap-4">
                  <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
                    {h.icon}
                  </div>
                  <div>
                    <p className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-1">{h.title}</p>
                    <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed">{h.description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-3">
              <PrefetchLink
                to="/signup"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all"
              >
                Claim your free US virtual number
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </PrefetchLink>
              <PrefetchLink
                to="/billing"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-semibold border border-gray-200 dark:border-slate-700 hover:border-indigo-500 transition-all"
              >
                Browse subscription tiers
              </PrefetchLink>
            </div>
          </div>

          <div className="relative lg:sticky lg:top-28">
            <div
              aria-hidden
              className="absolute -inset-6 bg-gradient-to-tr from-indigo-500/10 via-purple-500/10 to-emerald-400/10 dark:from-indigo-500/18 dark:via-purple-500/12 dark:to-emerald-500/14 rounded-[2rem] blur-2xl"
            />
            <div className="relative rounded-[1.65rem] border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-8 ring-1 ring-black/5 dark:ring-white/5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-7">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 text-xs font-semibold border border-emerald-200/60 dark:border-emerald-600/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active line
                </span>
                <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-400 dark:text-gray-500">
                  Included · every paid plan
                </span>
              </div>

              <div className="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-500/30 bg-gradient-to-br from-indigo-50/80 to-white dark:from-indigo-500/10 dark:to-slate-900/40 p-6 text-center mb-7">
                <div className="text-[11px] uppercase tracking-[0.22em] font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
                  Your free US virtual number
                </div>
                <div className="text-3xl md:text-[2.125rem] font-bold text-gray-900 dark:text-white tabular-nums">
                  +1 (415) 555&#8209;0188
                </div>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-snug px-4">
                  Example formatting · selectable US locales inside signup &amp; admin flows
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-950/40 p-3">
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Inbound ring path</div>
                  <div className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Browser session
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-950/40 p-3">
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">SMS channel</div>
                  <div className="font-semibold text-gray-900 dark:text-white text-sm">Online inbox</div>
                </div>
              </div>

              <ul className="space-y-3">
                {[
                  'Make outbound attempts to verified US destinations',
                  'Send & receive two-way SMS with compliant opt-in workflows',
                  'Stay mobile—Safari-friendly web sessions keep you reachable',
                  'Retain your US virtual identity while subscriptions stay active',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300 leading-snug">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default FreeUSNumberSection;
