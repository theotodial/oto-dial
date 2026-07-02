import { useEffect, useRef, useState } from 'react';
import PrefetchLink from '../components/PrefetchLink';
import Navbar from '../components/Navbar';
import NewHeroSection from '../components/homepage/NewHeroSection';
import WhyOtodialSection from '../components/homepage/WhyOtodialSection';
import FreeUSNumberSection from '../components/homepage/FreeUSNumberSection';
import OtpVerificationSection from '../components/homepage/OtpVerificationSection';
import NewFeaturesSection from '../components/homepage/NewFeaturesSection';
import NewHowItWorks from '../components/homepage/NewHowItWorks';
import NewPricingSection from '../components/homepage/NewPricingSection';
import TelecomCreditsSection from '../components/homepage/TelecomCreditsSection';
import BuiltForSection from '../components/homepage/BuiltForSection';
import UseCasesSection from '../components/homepage/UseCasesSection';
import FaqSection from '../components/homepage/FaqSection';
import NewFooter from '../components/homepage/NewFooter';
import HomepageRenderer from '../components/site/HomepageRenderer';
import SiteHeader from '../components/site/SiteHeader';
import HomeConfidenceStrip from '../components/homepage/HomeConfidenceStrip';
import { fetchHomepageStructure, fetchPublicSeoSettings } from '../services/siteService';
import { applySeoSettingsToDocument, DEFAULT_HOME_DOCUMENT_SEO } from '../utils/seo';
import { billingPlanUrl } from '../utils/billingPlanLink';

function Home() {
  const [dynamic, setDynamic] = useState(null);
  const [, setDynamicError] = useState('');
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let didFallback = false;
    const fallbackTimer = setTimeout(() => {
      didFallback = true;
      if (isMountedRef.current) setDynamicError('timeout');
    }, 1200);

    const load = async () => {
      try {
        const [homepage, seo] = await Promise.all([
          fetchHomepageStructure(),
          fetchPublicSeoSettings().catch(() => null),
        ]);
        if (!isMountedRef.current) return;
        if (seo) {
          applySeoSettingsToDocument(seo, { sections: homepage?.sections || [] });
        } else if (
          !(
            homepage?.published === true &&
            Array.isArray(homepage?.sections) &&
            homepage.sections.length > 0
          )
        ) {
          applySeoSettingsToDocument(DEFAULT_HOME_DOCUMENT_SEO, { sections: homepage?.sections || [] });
        }
        if (
          homepage?.published === true &&
          Array.isArray(homepage?.sections) &&
          homepage.sections.length > 0
        ) {
          setDynamic(homepage);
          setDynamicError('');
        } else if (!didFallback) {
          setDynamic(null);
        }
      } catch (_err) {
        if (!isMountedRef.current) return;
        setDynamic(null);
        setDynamicError('error');
        applySeoSettingsToDocument(DEFAULT_HOME_DOCUMENT_SEO, { sections: [] });
      } finally {
        clearTimeout(fallbackTimer);
      }
    };

    load();
    return () => {
      isMountedRef.current = false;
      clearTimeout(fallbackTimer);
    };
  }, []);

  if (dynamic && Array.isArray(dynamic.sections) && dynamic.sections.length > 0) {
    return (
      <div className="w-full bg-white dark:bg-slate-900">
        <SiteHeader headerConfig={dynamic.headerConfig} themeSettings={dynamic.themeSettings} />
        <HomepageRenderer sections={dynamic.sections} themeSettings={dynamic.themeSettings} />
        <NewFooter />
      </div>
    );
  }

  return (
    <div className="w-full bg-white dark:bg-slate-900">
      <Navbar />
      <NewHeroSection />
      <WhyOtodialSection />
      <FreeUSNumberSection />
      <OtpVerificationSection />
      <NewFeaturesSection />
      <NewHowItWorks />
      <NewPricingSection />
      <TelecomCreditsSection />

      <section
        id="sms-campaign"
        className="scroll-mt-24 py-20 md:py-24 px-4 bg-indigo-50/70 dark:bg-slate-950/40 border-y border-indigo-100 dark:border-slate-800"
      >
        <div className="max-w-6xl mx-auto grid gap-10 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-center">
          <div>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-3">
              SMS Campaign mode
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight leading-snug">
              Run SMS campaigns from a US virtual number
            </h2>
            <p className="text-base md:text-lg text-gray-700 dark:text-gray-300 mb-5 leading-relaxed">
              The SMS Campaign plan ships with a dedicated SMS allowance (inbound + outbound share the same pool), a
              pro campaign workspace with templates and analytics, and a streamlined in-app experience focused on
              conversations — not the dialer.
            </p>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300 text-sm md:text-base mb-6">
              <li className="flex gap-2">
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>
                1,700 SMS per month shared across send and receive
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>
                Templates, campaign workspace, and analytics
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>
                Voice calling not included — SMS-only subscription
              </li>
            </ul>
            <PrefetchLink
              to={billingPlanUrl('SMS Campaign')}
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md transition-colors"
            >
              View SMS Campaign plan
            </PrefetchLink>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-slate-700 p-7 shadow-lg">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">From</p>
            <p className="text-4xl font-bold text-gray-900 dark:text-white mb-1 tracking-tight">$90</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">per month · billed in app via Stripe</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              After you subscribe, the app opens in Campaign mode so you can manage SMS threads, outreach, and
              reporting in one place — all from your US virtual number.
            </p>
          </div>
        </div>
      </section>

      <section className="relative py-20 md:py-28 px-4 overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,1),transparent_52%)]" />
        <div className="max-w-5xl mx-auto text-center relative text-emerald-50">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-100/90 mb-3">
            Unlimited calling plan
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-[2.85rem] font-bold tracking-tight mb-5 leading-tight">
            Unlimited outbound calling for $39.99/month
          </h2>
          <p className="text-base md:text-lg text-emerald-50/95 max-w-3xl mx-auto mb-8 leading-relaxed">
            Built for outbound calling software users who sprint through US lists—stay on the headset while your telecom
            stack stays predictable. Every Unlimited seat still includes your free virtual number routing through the US
            network.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <PrefetchLink
              to={billingPlanUrl('Unlimited Call')}
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-xl bg-white text-emerald-800 font-semibold shadow-lg hover:bg-emerald-50 transition-all duration-200 hover:-translate-y-0.5"
            >
              Choose Unlimited Plan
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </PrefetchLink>
            <PrefetchLink
              to="/signup"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-xl border border-white/75 text-white font-semibold hover:bg-white/15 transition-colors duration-200"
            >
              Start Calling Now
            </PrefetchLink>
          </div>
        </div>
      </section>

      <BuiltForSection />
      <UseCasesSection />

      <HomeConfidenceStrip />

      <FaqSection />

      <section className="relative py-20 md:py-24 px-4 bg-gradient-to-br from-indigo-700 via-indigo-700 to-purple-800 overflow-hidden">
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-[28rem] h-[28rem] bg-purple-300/14 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-5 tracking-tight leading-tight">
            Launch your free US virtual number today
          </h2>
          <p className="text-base md:text-xl text-indigo-100/96 mb-9 leading-relaxed max-w-2xl mx-auto">
            Cold callers, agencies, freelancers, and remote reps trust OTODIAL for honest US numbering, pragmatic telecom
            credit billing, instant browser onboarding, and the Unlimited outbound calling tier when quotas demand it.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <PrefetchLink
              to="/signup"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-indigo-800 font-semibold rounded-xl hover:bg-indigo-50 transition-all duration-200 shadow-xl"
            >
              Start Calling Now
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </PrefetchLink>
            <PrefetchLink
              to="/billing"
              className="inline-flex items-center justify-center px-8 py-4 bg-transparent text-white font-semibold rounded-xl border-2 border-white/80 hover:bg-white hover:text-indigo-800 transition-all duration-200"
            >
              View Pricing
            </PrefetchLink>
          </div>
        </div>
      </section>

      <NewFooter />
    </div>
  );
}

export default Home;
