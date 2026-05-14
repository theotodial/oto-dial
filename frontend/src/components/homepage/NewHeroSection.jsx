import PrefetchLink from '../PrefetchLink';

const TRUST_PILLS = [
  'Free US Virtual Number Included',
  'Works Worldwide',
  'Browser-Based Calling',
];

const TRUST_BADGES = [
  { label: 'Browser Based', icon: 'globe' },
  { label: 'US Virtual Number', icon: 'flag' },
  { label: 'Cloud Dialer', icon: 'cloud' },
  { label: 'Telecom Credits', icon: 'spark' },
  { label: 'No Hardware', icon: 'shield' },
  { label: 'Instant Setup', icon: 'bolt' },
];

function BadgeIcon({ name }) {
  switch (name) {
    case 'globe':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3.6 9h16.8M3.6 15h16.8M12 3a14.5 14.5 0 010 18M12 3a14.5 14.5 0 000 18M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case 'flag':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v18M5 5h12l-2 4 2 4H5" />
        </svg>
      );
    case 'cloud':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 15a4 4 0 014-4 5 5 0 019.584-1.5A4.5 4.5 0 0118 18H7a4 4 0 01-4-3z"
          />
        </svg>
      );
    case 'spark':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
          />
        </svg>
      );
    case 'shield':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3l8 3v6c0 4.5-3.4 8.4-8 9-4.6-.6-8-4.5-8-9V6l8-3z"
          />
        </svg>
      );
    case 'bolt':
    default:
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
        </svg>
      );
  }
}

function HeroPreview() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-6 bg-gradient-to-tr from-indigo-500/12 via-purple-500/8 to-emerald-400/8 dark:from-indigo-500/22 dark:via-purple-500/12 dark:to-emerald-500/14 rounded-[2rem] blur-2xl"
      />
      <div className="relative rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl shadow-indigo-500/10 overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800 bg-gray-50/90 dark:bg-slate-800/60">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400/90" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/90" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/90" />
          </div>
          <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide tabular-nums">
            otodial.com / dialer
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="p-5 sm:p-6 border-b sm:border-b-0 sm:border-r border-gray-100 dark:border-slate-800">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-indigo-600 dark:text-indigo-400">
              Your US virtual number
            </div>
            <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              +1 (415) 555&#8209;0188
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">US local · Voice + SMS</div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
                <div
                  key={k}
                  className="py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-gray-200 text-sm font-semibold border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none"
                >
                  {k}
                </div>
              ))}
            </div>

            <button
              type="button"
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-md shadow-emerald-600/15"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2L8 11a11 11 0 005 5l1.6-2.2a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.7.95V19a2 2 0 01-2 2h-1C9.7 21 3 14.3 3 6V5z"
                />
              </svg>
              Start Call
            </button>
          </div>

          <div className="p-5 sm:p-6 bg-gradient-to-br from-indigo-50/50 via-white to-white dark:from-slate-800/70 dark:via-slate-900 dark:to-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">
                  In&#8209;call
                </div>
                <div className="text-base font-semibold text-gray-900 dark:text-white">Sales prospect</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">+1 (212) 555&#8209;0142</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">
                  Duration
                </div>
                <div className="text-base font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">02:47</div>
              </div>
            </div>

            <div className="mt-4 flex gap-1.5 justify-center opacity-70" aria-hidden>
              {[12, 20, 16, 28, 22, 18, 24, 14, 26, 18, 20, 22].map((h, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-indigo-400 dark:bg-indigo-500"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: 'Mute', icon: 'M19 11a7 7 0 01-14 0M12 18v3M9 21h6M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z' },
                { label: 'Hold', icon: 'M9 5h2v14H9zM13 5h2v14h-2z' },
                {
                  label: 'Keypad',
                  icon: 'M4 6h4v4H4zM10 6h4v4h-4zM16 6h4v4h-4zM4 12h4v4H4zM10 12h4v4h-4zM16 12h4v4h-4z',
                },
              ].map((b) => (
                <div
                  key={b.label}
                  className="flex flex-col items-center gap-1 py-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700"
                >
                  <svg className="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={b.icon} />
                  </svg>
                  <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">{b.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-gray-100 dark:border-slate-700 bg-white/90 dark:bg-slate-800/80 p-3">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">
                <span>Telecom Credits</span>
                <span className="text-emerald-600 dark:text-emerald-400">Healthy</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                <div className="h-full w-[72%] bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full" />
              </div>
              <div className="mt-2 flex justify-between text-xs text-gray-600 dark:text-gray-300">
                <span className="font-medium tabular-nums">1,083 / 1,500</span>
                <span className="text-gray-400 dark:text-gray-500">Basic Plan</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-4 hidden lg:flex items-center gap-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-xl px-4 py-3 max-w-[260px]">
        <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-900 dark:text-white">New SMS reply</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">&quot;Yes, let&apos;s hop on a call.&quot; · just now</div>
        </div>
      </div>
    </div>
  );
}

function NewHeroSection() {
  return (
    <section className="relative pt-28 md:pt-32 pb-20 md:pb-24 px-4 overflow-hidden bg-gradient-to-b from-indigo-50/80 via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-40 -right-40 w-[28rem] h-[28rem] bg-purple-300/35 dark:bg-purple-600/15 rounded-full blur-3xl" />
        <div className="absolute top-60 -left-40 w-[28rem] h-[28rem] bg-indigo-300/35 dark:bg-indigo-600/18 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-emerald-300/25 dark:bg-emerald-500/8 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-12 lg:gap-16 items-center">
          <div className="space-y-7 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/80 dark:bg-slate-800/80 border border-indigo-200/80 dark:border-indigo-500/25 rounded-full shadow-sm">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                US
              </span>
              <span className="text-[11px] sm:text-xs font-semibold text-indigo-950 dark:text-indigo-100 tracking-wide uppercase">
                Virtual US numbers · US outbound calling
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl xl:text-[3.35rem] font-bold text-gray-900 dark:text-white leading-[1.06] tracking-tight">
              Free US Virtual Number for{' '}
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
                Calling &amp; SMS
              </span>
            </h1>

            <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/55 dark:border-emerald-500/40 bg-emerald-50/95 dark:bg-emerald-950/40 px-4 py-2.5 text-sm font-bold text-emerald-900 dark:text-emerald-100 shadow-sm">
                <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                No VPN Required
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/55 dark:border-indigo-400/35 bg-indigo-50/95 dark:bg-indigo-950/40 px-4 py-2.5 text-sm font-bold text-indigo-950 dark:text-indigo-100 shadow-sm">
                <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                No LLC Needed
              </span>
            </div>

            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              OTODIAL is a browser-based outbound calling SaaS powered by telecom credits—built for freelancers, remote
              teams, and sales callers. Make web based calling with no SIM card required: a cloud dialer inside your
              browser, a VoIP dialer that feels like desk hardware, and a free US virtual number on every paid plan.
            </p>

            <ul className="flex flex-wrap gap-2 justify-center lg:justify-start">
              {TRUST_PILLS.map((pill) => (
                <li
                  key={pill}
                  className="inline-flex items-center gap-1.5 text-xs md:text-sm font-medium text-gray-700 dark:text-gray-200 bg-white/80 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 rounded-full px-3 py-1.5 backdrop-blur-sm"
                >
                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                  {pill}
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start pt-1">
              <PrefetchLink
                to="/signup"
                className="inline-flex items-center justify-center px-7 py-3.5 bg-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:shadow-indigo-500/35 hover:-translate-y-0.5 transition-all duration-200"
              >
                Start Calling Now
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </PrefetchLink>
              <PrefetchLink
                to="/billing"
                className="inline-flex items-center justify-center px-7 py-3.5 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-semibold rounded-xl border border-gray-200 dark:border-slate-700 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 transition-all duration-200"
              >
                View Pricing
              </PrefetchLink>
            </div>

            <div className="pt-6 border-t border-gray-200/80 dark:border-slate-800">
              <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-gray-500 dark:text-gray-500 mb-3">
                Trust signals · telecom SaaS
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 justify-center lg:justify-start">
                {TRUST_BADGES.map((b) => (
                  <li
                    key={b.label}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    <span className="text-indigo-500 dark:text-indigo-400">
                      <BadgeIcon name={b.icon} />
                    </span>
                    {b.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="relative lg:translate-y-1">
            <HeroPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

export default NewHeroSection;
