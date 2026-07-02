import PrefetchLink from '../PrefetchLink';

const STEPS = [
  {
    title: 'Claim your free US virtual number',
    description:
      'Every active OTODIAL plan includes a US DID—no SIM card, no separate carrier contract. Use that same line for inbound SMS.',
  },
  {
    title: 'Enter the number on the signup form',
    description:
      'Paste your OTODIAL number wherever a service asks for phone verification. Codes arrive in your in-app SMS inbox in seconds.',
  },
  {
    title: 'Complete verification in the browser',
    description:
      'Read the one-time code from OTODIAL, enter it on the third-party site, and move on—no phone handoff or forwarding hacks.',
  },
];

const WORKS_WELL = [
  'SaaS trials, marketplaces, and freelance platforms',
  'Two-factor login for tools that accept US VoIP lines',
  'Account recovery flows that send SMS codes',
  'Remote teams verifying US-facing services from abroad',
];

const MAY_NOT_WORK = [
  'Some messaging apps (WhatsApp, Telegram, Signal, etc.)',
  'Many banking and financial institution apps',
  'Carriers or platforms that block VoIP number ranges',
];

function OtpVerificationSection() {
  return (
    <section
      id="otp-verification"
      className="scroll-mt-24 relative py-20 md:py-28 px-4 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 overflow-hidden"
    >
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -bottom-32 right-0 w-[36rem] h-[36rem] bg-emerald-300/15 dark:bg-emerald-600/10 rounded-full blur-3xl" />
        <div className="absolute -top-24 left-0 w-[28rem] h-[28rem] bg-indigo-300/18 dark:bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto relative">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-12 xl:gap-20 items-start">
          <div className="order-2 lg:order-1">
            <div className="relative rounded-[1.65rem] border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-8 ring-1 ring-black/5 dark:ring-white/5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-200 text-xs font-semibold border border-indigo-200/60 dark:border-indigo-600/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  SMS inbox
                </span>
                <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-400 dark:text-gray-500">
                  Free virtual number · included
                </span>
              </div>

              <div className="rounded-xl border border-dashed border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-500/10 dark:to-slate-900/40 p-5 text-center mb-6">
                <div className="text-[11px] uppercase tracking-[0.22em] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                  Your OTODIAL number
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
                  +1 (415) 555&#8209;0142
                </div>
              </div>

              <div className="space-y-3 mb-7 font-mono text-sm">
                <div className="rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/90 dark:bg-slate-950/50 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2 text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <span>Verification service</span>
                    <span>Just now</span>
                  </div>
                  <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
                    Your verification code is <span className="font-bold text-indigo-600 dark:text-indigo-400">847291</span>.
                    Do not share this code.
                  </p>
                </div>
                <div className="rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50/60 dark:bg-indigo-500/10 p-4 text-indigo-900 dark:text-indigo-100">
                  <div className="text-[11px] uppercase tracking-wide text-indigo-600/80 dark:text-indigo-300/80 mb-1">
                    You enter on signup page
                  </div>
                  <div className="flex gap-2">
                    {['8', '4', '7', '2', '9', '1'].map((digit) => (
                      <span
                        key={digit}
                        className="flex-1 text-center py-2 rounded-lg bg-white dark:bg-slate-800 border border-indigo-200/80 dark:border-indigo-500/30 font-bold text-lg tabular-nums shadow-sm"
                      >
                        {digit}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200/80 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/35 p-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">VoIP number disclaimer</p>
                    <p className="text-sm text-amber-900/90 dark:text-amber-100/90 leading-relaxed">
                      Some messaging apps and banking apps may not accept VoIP numbers. For everything else, you can
                      verify OTP with your OTODIAL free virtual number.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-3">
              OTP verification
            </p>

            <h2 className="text-3xl md:text-4xl xl:text-[2.65rem] font-bold text-gray-900 dark:text-white tracking-tight mb-4 leading-tight">
              Receive OTP codes on your OTODIAL free virtual number
            </h2>

            <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed mb-5">
              Need a one-time password for a signup, login, or account recovery? Your included{' '}
              <span className="font-semibold text-gray-800 dark:text-gray-200">free US virtual number</span> doubles as an
              SMS inbox—verification codes land right inside OTODIAL so you can finish onboarding without juggling a
              personal cell line.
            </p>

            <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
              OTODIAL is built for outbound teams first, but the same number that powers your dialer also receives inbound
              SMS. Use it for OTP verification on services that accept US VoIP lines.
            </p>

            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-5 tracking-tight">How it works</h3>

            <ol className="space-y-5 mb-10">
              {STEPS.map((step, idx) => (
                <li key={step.title} className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm shadow-inner">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-1">{step.title}</p>
                    <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="grid sm:grid-cols-2 gap-4 mb-10">
              <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-700/40 bg-emerald-50/60 dark:bg-emerald-950/25 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300 mb-3">
                  Works well for
                </p>
                <ul className="space-y-2">
                  {WORKS_WELL.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300 leading-snug">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold flex-shrink-0">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-amber-200/70 dark:border-amber-700/40 bg-amber-50/60 dark:bg-amber-950/25 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300 mb-3">
                  May not work for
                </p>
                <ul className="space-y-2">
                  {MAY_NOT_WORK.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300 leading-snug">
                      <span className="text-amber-600 dark:text-amber-400 font-bold flex-shrink-0">!</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <PrefetchLink
                to="/signup"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all"
              >
                Get your free number for OTP
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </PrefetchLink>
              <PrefetchLink
                to="/billing"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-semibold border border-gray-200 dark:border-slate-700 hover:border-indigo-500 transition-all"
              >
                View plans
              </PrefetchLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default OtpVerificationSection;
