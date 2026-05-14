const REASONS = [
  {
    title: 'No VPN Required',
    description:
      'Sign in globally and dial US prospects from your browser—no tunneling, proxies, or network theater. Built for outbound calling software workflows that ship revenue, not troubleshooting.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l8 3v6c0 4.5-3.4 8.4-8 9-4.6-.6-8-4.5-8-9V6l8-3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
      </svg>
    ),
    accent: 'emerald',
  },
  {
    title: 'No LLC Needed',
    description:
      'Operate as an individual without corporate paperwork. Activate a credible US caller ID route for freelancers and remote reps who need legitimacy without forming a holding company.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5h6M9 12h6M9 19h6M5 5h.01M5 12h.01M5 19h.01" />
      </svg>
    ),
    accent: 'indigo',
  },
  {
    title: 'No SIM Card',
    description:
      'Forget plastic chips and swapping trays. Every line is powered by VoIP—a virtual US number and browser based softphone in one cohesive cloud dialer workspace.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h10l4 4v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6M9 16h6M9 8h2" />
      </svg>
    ),
    accent: 'purple',
  },
  {
    title: 'No Expensive Hardware',
    description:
      'Skip ATA boxes and legacy PBX. OTODIAL is an internet calling app experience with carrier-conscious audio—straight from laptops your team already owns.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 21h20" />
      </svg>
    ),
    accent: 'sky',
  },
  {
    title: 'Browser-Based Calling',
    description:
      'Your cold calling platform opens like any critical SaaS tool: modern Chromium-class browsers deliver the VoIP dialer UI, keypad, mute, hold, and live timers.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.6 9h16.8M3.6 15h16.8M12 3a14.5 14.5 0 010 18M12 3a14.5 14.5 0 000 18" />
      </svg>
    ),
    accent: 'rose',
  },
  {
    title: 'Fast Setup',
    description:
      'Pick a tier, onboard in minutes, and begin outbound dialing. Instant activation cues keep recruiters, appointment setters, and SMB sales leaders unblocked.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    accent: 'amber',
  },
  {
    title: 'Affordable Calling',
    description:
      'Telecom SaaS economics should flex with outbound reality. Transparent VoIP credits, fair-use billing dynamics, plus an Unlimited option for callers who never leave the headset.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8m-4-4h8M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    accent: 'teal',
  },
];

const ACCENT_MAP = {
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'group-hover:border-emerald-400/60',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-500/10',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'group-hover:border-indigo-400/60',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-500/10',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'group-hover:border-purple-400/60',
  },
  sky: {
    bg: 'bg-sky-50 dark:bg-sky-500/10',
    text: 'text-sky-600 dark:text-sky-400',
    border: 'group-hover:border-sky-400/60',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'group-hover:border-rose-400/60',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'group-hover:border-amber-400/60',
  },
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-500/10',
    text: 'text-teal-600 dark:text-teal-400',
    border: 'group-hover:border-teal-400/60',
  },
};

function WhyOtodialSection() {
  return (
    <section className="py-20 md:py-24 px-4 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800/80">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-3">
            Why OTODIAL
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white tracking-tight mb-4">
            US virtual numbers with enterprise polish, indie-friendly onboarding
          </h2>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            OTODIAL keeps the telecom stack deliberately simple—no speculative global inventory, only US numbering
            paired with pragmatic remote sales tooling and transparent usage signals.
          </p>
        </div>

        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {REASONS.map((r) => {
            const accent = ACCENT_MAP[r.accent];
            return (
              <li
                key={r.title}
                className={`group p-6 bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-200 dark:border-slate-700 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 ${accent.border}`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${accent.bg} ${accent.text}`}>
                  {r.icon}
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 tracking-tight">{r.title}</h3>
                <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed">{r.description}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default WhyOtodialSection;
