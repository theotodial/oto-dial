import PrefetchLink from '../PrefetchLink';
import { schedulePrefetch } from '../../utils/routePrefetch';

/** Compact comparison + positioning — avoids long duplicate prose blocks above the FAQ. */
const PANELS = [
  {
    title: 'Google Voice alternative for outbound teams',
    body:
      'OTODIAL is a VoIP dialer and cloud calling platform with a virtual US number, outbound calling software workflows, telecom credits, and a sales dialer experience that survives real cold calling volumes.',
    href: '/signup',
    cta: 'Try OTODIAL',
    isHash: false,
  },
  {
    title: 'TextNow alternative for professional SMS & voice',
    body:
      'Move from casual apps to telecom SaaS: internet calling app in the browser, web based calling on desktop or mobile, and an online SMS platform tied to one affordable business phone number.',
    href: '/billing',
    cta: 'See plans',
    isHash: false,
  },
  {
    title: 'US virtual phone inventory — intentionally focused',
    body:
      'We provision US numbers only today. OTODIAL is not a marketplace for worldwide local numbers — it is an outbound-focused cloud phone system and remote sales dialer for US dialing with transparent billing.',
    href: '#pricing',
    cta: 'View pricing',
    isHash: true,
  },
];

function HomeConfidenceStrip() {
  return (
    <section className="py-16 md:py-20 px-4 bg-white dark:bg-slate-900 border-y border-gray-100 dark:border-slate-800">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-3">
            Positioning &amp; comparisons
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight mb-4">
            Cold calling software that stays honest about coverage
          </h2>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            Use OTODIAL as your browser dialer and virtual number for freelancers, remote workers, agencies, and SDR teams
            dialing the United States — with no VPN circus and no hardware closet.
          </p>
        </div>

        <ul className="grid md:grid-cols-3 gap-6">
          {PANELS.map((p) => (
            <li
              key={p.title}
              className="group flex flex-col p-7 rounded-2xl border border-gray-200 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-950/40 hover:border-indigo-400/70 dark:hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300"
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight mb-3">{p.title}</h3>
              <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed flex-1 mb-6">{p.body}</p>
              {p.isHash ? (
                <a
                  href={p.href}
                  onMouseEnter={() => schedulePrefetch('/billing')}
                  onFocus={() => schedulePrefetch('/billing')}
                  className="inline-flex items-center text-sm font-semibold text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-300 transition-colors"
                >
                  {p.cta}
                  <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              ) : (
                <PrefetchLink
                  to={p.href}
                  className="inline-flex items-center text-sm font-semibold text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-300 transition-colors"
                >
                  {p.cta}
                  <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </PrefetchLink>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default HomeConfidenceStrip;
