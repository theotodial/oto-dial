import PrefetchLink from '../PrefetchLink';

const STEPS = [
  {
    number: '01',
    title: 'Pick a plan & claim your free US number',
    description:
      'Choose a plan that fits your outbound calling volume. Every paid plan ships with a free US virtual number — no extra rental, no setup fees.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Open OTODIAL in your browser',
    description:
      'Log in from any device — desktop, laptop, or mobile. No app install, no SIM, no VPN. Your cloud dialer is ready in seconds.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.6 9h16.8M3.6 15h16.8M12 3a14.5 14.5 0 010 18M12 3a14.5 14.5 0 000 18" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Start outbound calling & SMS',
    description:
      'Dial US numbers, send SMS, and run your full sales day from the browser. Calls are billed in fair, usage-based telecom credits.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2L8 11a11 11 0 005 5l1.6-2.2a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.7.95V19a2 2 0 01-2 2h-1C9.7 21 3 14.3 3 6V5z" />
      </svg>
    ),
  },
];

function NewHowItWorks() {
  return (
    <section className="py-20 md:py-24 px-4 bg-gradient-to-b from-white to-indigo-50/60 dark:from-slate-900 dark:to-slate-950">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16 max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-3">
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
            From signup to first call in under 3 minutes
          </h2>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            No carrier paperwork. No physical hardware. Just a browser-based US virtual number ready for outbound
            calling and SMS.
          </p>
        </div>

        <div className="relative">
          <div
            className="hidden lg:block absolute top-24 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-200 dark:via-indigo-800 to-transparent"
            style={{ marginLeft: '16.67%', marginRight: '16.67%' }}
            aria-hidden
          />

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((step, index) => (
              <div key={step.number} className="relative">
                <div className="relative bg-white dark:bg-slate-900 rounded-2xl p-7 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-gray-100 dark:border-slate-800 h-full">
                  <div className="relative inline-flex items-center gap-3 mb-6">
                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-md">
                      <span className="text-xl font-bold text-white tabular-nums">{step.number}</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      {step.icon}
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">{step.title}</h3>
                  <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {index < STEPS.length - 1 && (
                  <div className="md:hidden flex justify-center my-4">
                    <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-14">
          <PrefetchLink
            to="/signup"
            className="inline-flex items-center px-7 py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
          >
            Start Calling Now
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </PrefetchLink>
        </div>
      </div>
    </section>
  );
}

export default NewHowItWorks;
