import { useEffect, useRef, useState } from 'react';

const FAQS = [
  {
    q: 'What is a free US virtual number?',
    a: 'It is a real US telephone number hosted in OTODIAL instead of a SIM card. Every paid OTODIAL plan currently includes one free US virtual number you use for outbound calling and SMS directly in the browser, with activation that favors individuals and remote teams—not hidden multi-country inventories.',
  },
  {
    q: 'How does telecom credit billing work?',
    a: 'OTODIAL metered plans use telecom credits instead of pretending every event equals one minute. Outbound attempts, connected calls, reservations, and SMS each draw from the appropriate bucket so cold calling lists stay economically honest. Credits flex with outcomes: quick hang-ups skim less usage than lengthy live conversations.',
  },
  {
    q: 'Does OTODIAL require a VPN?',
    a: 'No. OTODIAL is a browser dialer—you can authenticate from practically anywhere without VPN tricks. You still subscribe to disciplined US numbering; we simply never force brittle networking workarounds to reach the PSTN-facing side of OTODIAL.',
  },
  {
    q: 'Can I use OTODIAL outside the United States?',
    a: 'Yes. Many customers run OTODIAL from outside the United States as long as they have a compatible browser session. Important nuance: OTODIAL presently provisions United States numbers only—you are placing outbound dialing and SMS workloads against US routing, never claiming fake international DID catalogs.',
  },
  {
    q: 'Is OTODIAL a Google Voice alternative?',
    a: 'Many teams adopt OTODIAL as a Google Voice alternative for outbound work: browser-based dialing, telecom credits tuned for dialing volume, and an Unlimited outbound calling tier for heavy days—all with US virtual numbers explicitly included in OTODIAL’s US-only inventory stance.',
  },
  {
    q: 'Is OTODIAL a TextNow alternative?',
    a: 'If you leave TextNow for something built for dialing, OTODIAL is that TextNow alternative—a browser softphone workspace, campaign-friendly SMS allowances on qualifying plans (not on Unlimited Voice), transparent VoIP SaaS posture, zero ad clutter.',
  },
  {
    q: 'Can I use OTODIAL for cold calling?',
    a: 'Yes. OTODIAL is purposely shaped as cold calling software: keypad-first flows, pacing-friendly usage signals, outbound attempt economics that tolerate volume, Unlimited outbound calling tiering for brute-force calling days, SMS follow-ups handled on-plan when applicable.',
  },
  {
    q: 'Does every plan include a free US virtual number?',
    a: 'Yes. Basic, Super, Unlimited Call—and the SMS-focused campaign tier—all include at least one US virtual number bundled into the advertised price. Inventory stays US-only until OTODIAL formally expands numbering regions publicly.',
  },
  {
    q: 'Can I send SMS using my US virtual number?',
    a: 'Yes on plans that advertise SMS quotas. Messaging runs through the same US DID as dialing so conversations remain contextual. Unlimited Call emphasizes voice workloads and does not bundle SMS allowances—consult plan cards for allowances.',
  },
  {
    q: 'Does OTODIAL work in the browser?',
    a: 'Completely—OTODIAL is a VoIP dialer delivered as SaaS inside modern browsers without mandatory desktop installs. You still grant microphone permission per normal WebRTC etiquette, yet the UX mirrors installed softphones minus deployment headaches.',
  },
  {
    q: 'Do I need a SIM card?',
    a: 'No SIM is required anywhere in the onboarding path. Activation is telecom-cloud native: provisioning issues you a DID, attaches carrier routes, exposes browser controls—traditional SIM swaps never enter the story.',
  },
  {
    q: 'What devices does OTODIAL support?',
    a: 'Use OTODIAL on desktops, laptops, and mobile browsers with modern WebRTC-compatible engines. Sessions sync around your identity and US numbering so remote workers can jump devices without juggling SIM logistics.',
  },
];

function FaqItem({ item, open, onToggle, id }) {
  const contentRef = useRef(null);
  return (
    <div className="border-b border-gray-100 dark:border-slate-800 last:border-b-0">
      <h3 className="text-base md:text-[1.05rem] font-semibold text-gray-900 dark:text-white">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-trigger`}
          className="w-full flex items-start justify-between gap-4 text-left py-5 group rounded-xl px-3 -mx-3 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span className="pr-2 leading-snug">{item.q}</span>
          <span
            className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-xl border flex items-center justify-center transition-colors duration-200 ${
              open
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 group-hover:border-indigo-400 dark:group-hover:border-indigo-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-300'
            }`}
            aria-hidden
          >
            <svg className={`w-4 h-4 transition-transform duration-300 ${open ? 'rotate-45' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </button>
      </h3>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        ref={contentRef}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="pb-6 px-3 text-sm md:text-base text-gray-600 dark:text-gray-300 leading-relaxed">{item.a}</p>
        </div>
      </div>
    </div>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(0);

  useEffect(() => {
    const schemaId = 'jsonld-otodial-faq';
    let el = document.getElementById(schemaId);
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = schemaId;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
    return () => {
      const node = document.getElementById(schemaId);
      if (node?.parentNode) node.parentNode.removeChild(node);
    };
  }, []);

  return (
    <section id="faq" className="scroll-mt-24 py-20 md:py-28 px-4 bg-gray-50 dark:bg-slate-950/35">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12 md:mb-14">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.26em] mb-4">
            FAQ · virtual phone SEO
          </p>
          <h2 className="text-3xl md:text-4xl xl:text-[2.75rem] font-bold text-gray-900 dark:text-white tracking-tight mb-4 leading-tight">
            Answers revenue teams skim before subscribing
          </h2>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed max-w-2xl mx-auto">
            Plain-language clarity on telecom credits, free US virtual numbering, outbound calling allowances, comparisons
            versus Google Voice and TextNow alternatives, plus how OTODIAL behaves internationally without inventing fake
            country inventory.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-[1.65rem] border border-gray-200 dark:border-slate-800 px-5 md:px-9 py-4 shadow-lg shadow-gray-900/5 dark:shadow-black/35 ring-1 ring-black/[0.02] dark:ring-white/[0.04]">
          {FAQS.map((item, index) => (
            <FaqItem
              key={item.q}
              id={`faq-${index}`}
              item={item}
              open={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? -1 : index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default FaqSection;
