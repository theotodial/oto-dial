const AUDIENCES = [
  {
    title: 'Cold Callers',
    description:
      'Run high-volume outbound dials from your browser. Affordable telecom credits and fast call setup keep you in flow all day.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
      </svg>
    ),
  },
  {
    title: 'Remote Sales Teams',
    description:
      'Give reps a coherent cloud calling stack anywhere they work—consistent US DID identity, centralized browser dialer training, telecom credit dashboards everyone can interpret.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2a4 4 0 100-8 4 4 0 000 8zm6 0a3 3 0 100-6 3 3 0 000 6zM5 12a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
    ),
  },
  {
    title: 'Freelancers',
    description:
      'Get a US virtual number for freelancers without an LLC, EIN, or US address. Look professional to US clients from anywhere in the world.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0" />
      </svg>
    ),
  },
  {
    title: 'Sales Agencies',
    description:
      'Equip every agent with a browser-based softphone, a free US virtual number, and predictable telecom credit billing across the team.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10l9-7 9 7v10a2 2 0 01-2 2h-3v-7H8v7H5a2 2 0 01-2-2V10z" />
      </svg>
    ),
  },
  {
    title: 'Recruiters',
    description:
      'Reach candidates fast with US-based caller ID and SMS. Keep all your candidate conversations in a single browser-based workspace.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    title: 'Appointment Setters',
    description:
      'Power through dial lists, drop quick voicemails, and confirm appointments by SMS — all from one clean cloud calling platform.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3M16 7V3M4 11h16M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
      </svg>
    ),
  },
];

function BuiltForSection() {
  return (
    <section className="py-20 md:py-24 px-4 bg-gray-50 dark:bg-slate-950/40">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-3">
            Built for outbound work
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white tracking-tight mb-4">
            Built for the people who live on the phone
          </h2>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            From solo freelancers to full sales agencies, OTODIAL is the cloud calling platform of choice for teams
            that depend on outbound conversations every single day.
          </p>
        </div>

        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {AUDIENCES.map((a) => (
            <li
              key={a.title}
              className="group relative p-6 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/60 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                  {a.icon}
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">{a.title}</h3>
              </div>
              <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed">{a.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default BuiltForSection;
