const USE_CASES = [
  {
    eyebrow: 'Cold calling',
    title: 'High-volume outbound dialing from a US virtual number',
    description:
      'Run cold calling sessions from a real US number, with telecom credit billing that doesn’t punish you for unanswered attempts.',
  },
  {
    eyebrow: 'Sales prospecting',
    title: 'Reach US prospects with credible US caller ID',
    description:
      'Pickup rates jump when you call from a real US virtual phone number. Pair it with two-way SMS for follow-ups that actually land.',
  },
  {
    eyebrow: 'Dialing from overseas',
    title: 'Reach US prospects from abroad — same US caller ID',
    description:
      'Operate your remote sales dialer from any country while keeping a US-facing online phone number. OTODIAL still provisions US inventory only—you are simply using the VoIP dialer globally without VPN juggling.',
  },
  {
    eyebrow: 'Remote work',
    title: 'A single business phone number for your remote workday',
    description:
      'Keep work and personal life separate with a dedicated US virtual phone number that lives in the cloud and works on every device.',
  },
  {
    eyebrow: 'Freelance client communication',
    title: 'Look like a US-based business — without forming one',
    description:
      'No LLC, no EIN, no US address required. Get a US virtual number for freelancers and start communicating with clients today.',
  },
  {
    eyebrow: 'Browser-based SMS',
    title: 'Run an online SMS platform from your browser',
    description:
      'Send and receive SMS from your US virtual number directly in the browser — perfect for confirmations, follow-ups, and quick updates.',
  },
];

function UseCasesSection() {
  return (
    <section className="py-20 md:py-24 px-4 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-3">
            Real use cases
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white tracking-tight mb-4">
            What people actually do with OTODIAL
          </h2>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            A focused set of workflows for the kind of outbound calling, SMS, and remote sales work serious operators
            depend on.
          </p>
        </div>

        <ul className="grid md:grid-cols-2 gap-5">
          {USE_CASES.map((c) => (
            <li
              key={c.title}
              className="group relative p-6 md:p-7 rounded-2xl bg-gradient-to-br from-white to-gray-50 dark:from-slate-800/60 dark:to-slate-900 border border-gray-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/60 hover:shadow-lg transition-all duration-300"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
                  {c.eyebrow}
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-indigo-200 dark:from-indigo-500/40 to-transparent" />
              </div>
              <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
                {c.title}
              </h3>
              <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed">{c.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default UseCasesSection;
