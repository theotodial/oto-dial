const FEATURES = [
  {
    title: 'US Virtual Phone Number',
    description:
      'Anchor every campaign on a credible US DID. Messaging stays consistent whether you leverage manual reps or scripted cold calling bursts.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2L8 11a11 11 0 005 5l1.6-2.2a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.7.95V19a2 2 0 01-2 2h-1C9.7 21 3 14.3 3 6V5z" />
      </svg>
    ),
    embed: (
      <div className="mt-4 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50/90 dark:bg-slate-950/50 p-3">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Outbound caller ID</div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">+1 · US DID</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
            Verified
          </span>
        </div>
      </div>
    ),
  },
  {
    title: 'Browser Dialer Workspace',
    description:
      'A cloud phone system façade with tactile controls—mute/hold/keypad—with none of the hardware liability. Exactly what outbound calling software expects by default.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.6 9h16.8M3.6 15h16.8M12 3a14.5 14.5 0 010 18M12 3a14.5 14.5 0 000 18" />
      </svg>
    ),
    embed: (
      <div className="mt-4 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50/90 dark:bg-slate-950/50 p-3">
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {['7', '8', '9', '4', '5', '6'].map((d) => (
            <span
              key={d}
              className="text-xs font-semibold rounded-md bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 py-1 text-gray-800 dark:text-gray-200 shadow-sm"
            >
              {d}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'Outbound Call Engine',
    description:
      'Purpose-built PSTN egress for US destinations with latency-sensitive audio—ideal appointment setters punching through midday lists.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
      </svg>
    ),
    embed: (
      <div className="mt-4 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50/90 dark:bg-slate-950/50 p-3 space-y-2">
        {[60, 40, 80].map((w, idx) => (
          <div key={idx} className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400">
            <span className="w-12 font-mono tabular-nums text-gray-500">+1···</span>
            <span className="flex-1 h-1 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
              <span className="block h-full bg-indigo-500 rounded-full" style={{ width: `${w}%` }} />
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">{w >= 70 ? 'Live' : 'Ring'}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Two-Way SMS Console',
    description:
      'Threaded texting from the same DID used for dialing—maintain conversational nuance alongside high-intensity dialing blocks.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
    embed: (
      <div className="mt-4 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50/90 dark:bg-slate-950/50 p-3 space-y-2 font-mono text-[11px]">
        <div className="self-end rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 px-2 py-1 text-gray-800 dark:text-gray-200">
          Follow-up ping—still interested?
        </div>
        <div className="rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 px-2 py-1 text-indigo-900 dark:text-indigo-100">
          Yes — call anytime after 3pm EST.
        </div>
      </div>
    ),
  },
  {
    title: 'Telecom Credit Transparency',
    description:
      'Cloud dialer credits flex with telemetry—short rejects burn less fuel than immersive conversations—keeping VoIP SaaS humane for outbound teams.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8m-4-4h8M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    embed: (
      <div className="mt-4 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50/90 dark:bg-slate-950/50 p-3">
        <div className="flex justify-between items-center mb-2 text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          <span>Balance</span>
          <span>Live</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full w-[64%] bg-gradient-to-r from-indigo-500 to-teal-500 rounded-full" />
          </div>
          <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">982</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Call Log Orchestration',
    description:
      'Ops leads audit every attempt, SMS crossover, follow-up SLA—your compliance-friendly cold calling cockpit without juggling spreadsheets.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    ),
    embed: (
      <div className="mt-4 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50/90 dark:bg-slate-950/50 p-3 text-[11px] space-y-1.5 font-mono">
        <div className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>10:41</span>
          <span className="text-emerald-600 dark:text-emerald-400">Connected · 182s</span>
        </div>
        <div className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>10:43</span>
          <span className="text-amber-600 dark:text-amber-400">No answer · lightweight</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Live Session Controls',
    description:
      'Mute, blind hold, tonal keypad overlays, and granular timers—all the tactile controls outbound reps expect inside a credible sales dialer surface.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0M12 18v3M9 21h6M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z" />
      </svg>
    ),
    embed: (
      <div className="mt-4 flex gap-2">
        {['Mute', 'Hold', 'DTMF'].map((label, i) => (
          <div
            key={label}
            className={`flex-1 rounded-lg border text-center py-2 text-[11px] font-semibold ${
              i === 0
                ? 'border-rose-200 dark:border-rose-600/40 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'
                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200'
            }`}
          >
            {label}
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Encrypted Transport · Carrier Handshake',
    description:
      'Session traffic rides modern transport protections while interconnect partners handle PSTN leg stability—built for telecom SaaS uptime expectations.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    embed: (
      <div className="mt-4 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50/90 dark:bg-slate-950/50 p-3 flex items-center justify-between gap-3">
        <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-tight">Media path</div>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
            Secure signaling
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300">
            Modern transport
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white">
            QoS-aware
          </span>
        </div>
      </div>
    ),
  },
];

function NewFeaturesSection() {
  return (
    <section className="py-20 md:py-24 px-4 bg-gray-50 dark:bg-slate-950/35 border-y border-gray-100 dark:border-slate-800">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-3">
            Feature lattice
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight leading-tight">
            Cloud dialer ergonomics anchored on US numbering
          </h2>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            OTODIAL merges VoIP ergonomics with cold calling practicality—everything routes through disciplined US DID
            policy so marketing never oversells phantom inventory.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group relative p-7 bg-white dark:bg-slate-900 rounded-[1.35rem] border border-gray-200 dark:border-slate-800 hover:border-indigo-400/75 dark:hover:border-indigo-500/60 hover:shadow-2xl hover:shadow-indigo-500/5 hover:-translate-y-0.5 transition-all duration-300 flex flex-col"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-purple-500/15 dark:from-indigo-500/25 dark:to-purple-600/25 text-indigo-600 dark:text-indigo-300 flex items-center justify-center mb-5 shadow-inner ring-1 ring-indigo-500/15">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">{feature.title}</h3>
              <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed">{feature.description}</p>
              {feature.embed}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default NewFeaturesSection;
