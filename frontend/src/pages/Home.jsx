import NewHeroSection from '../components/homepage/NewHeroSection';
import NewFeaturesSection from '../components/homepage/NewFeaturesSection';
import NewHowItWorks from '../components/homepage/NewHowItWorks';
import NewPricingSection from '../components/homepage/NewPricingSection';
import NewFooter from '../components/homepage/NewFooter';
import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import HomepageRenderer from '../components/site/HomepageRenderer';
import SiteHeader from '../components/site/SiteHeader';
import { fetchHomepageStructure, fetchPublicSeoSettings } from '../services/siteService';
import { applySeoSettingsToDocument } from '../utils/seo';
import Navbar from '../components/Navbar';

function Home() {
  const [dynamic, setDynamic] = useState(null);
  const [dynamicError, setDynamicError] = useState('');
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let didFallback = false;
    const fallbackTimer = setTimeout(() => {
      didFallback = true;
      // Avoid blocking TTI: if the API is slow, we render the static homepage immediately.
      if (isMountedRef.current) setDynamicError('timeout');
    }, 1200);

    const load = async () => {
      try {
        const [homepage, seo] = await Promise.all([
          fetchHomepageStructure(),
          fetchPublicSeoSettings().catch(() => null)
        ]);
        if (!isMountedRef.current) return;
        if (seo) applySeoSettingsToDocument(seo, { sections: homepage?.sections || [] });
        if (homepage?.published === true && Array.isArray(homepage?.sections) && homepage.sections.length > 0) {
          setDynamic(homepage);
          setDynamicError('');
        } else if (!didFallback) {
          setDynamic(null);
        }
      } catch (_err) {
        if (!isMountedRef.current) return;
        setDynamic(null);
        setDynamicError('error');
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
      <NewFeaturesSection />
      <NewHowItWorks />
      <NewPricingSection />
      
      {/* SEO Content Sections - Visible but near footer */}
      <section className="py-16 px-4 bg-gray-50 dark:bg-slate-800">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Who is OTO DIAL for */}
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Who is OTO DIAL for?</h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
              OTO DIAL is designed for individuals, travelers, freelancers, and remote workers who need a local phone number abroad. Whether you're traveling and need a US or UK number, a freelancer in Pakistan or UAE calling US clients, or a remote worker needing a local number in another country, OTO DIAL provides affordable virtual phone numbers for calling and SMS.
            </p>
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              Perfect for cold callers, salespeople, and anyone who needs a local number to reach clients internationally. Works globally—no SIM card required.
            </p>
          </div>

          {/* Why choose OTO DIAL over Google Voice */}
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">A Simple Alternative to Google Voice</h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
              While Google Voice works well for personal use, OTO DIAL offers more flexibility for international calling and SMS. Get local phone numbers in multiple countries, make affordable calls worldwide, and send SMS from anywhere. Our cloud-based platform works on any device—no SIM card needed.
            </p>
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              Built for individuals and freelancers who need reliable international calling and SMS without the limitations of personal phone apps. Simple plans, transparent pricing, no hidden fees.
            </p>
          </div>

          {/* OTO DIAL vs TextNow */}
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">TextNow Alternative for Global Calling</h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
              TextNow is great for personal use, but OTO DIAL offers more control and better international coverage. Get virtual phone numbers from the US, UK, Europe, Middle East, and Asia-Pacific. Make calls and send SMS from anywhere in the world using your local number.
            </p>
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              For travelers, freelancers, and remote workers looking for a TextNow alternative with better international calling, affordable pricing, and reliable SMS, OTO DIAL is the ideal solution.
            </p>
          </div>

          {/* Global calling for individuals */}
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Global Calling for Individuals and Remote Work</h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
              OTO DIAL is a cloud-based phone system designed for individuals and remote workers. With virtual phone numbers available in the US, UK, and other countries, you can get a local number anywhere. Our affordable calling and SMS platform supports travelers, freelancers, and anyone working globally.
            </p>
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              Whether you need a US phone number online, a UK virtual number, or a local number in another country, OTO DIAL provides simple plans for calling and SMS worldwide. No SIM card required—works from any device.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-indigo-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
            Get Your Virtual Phone Number Today
          </h2>
          <p className="text-lg md:text-xl text-indigo-100 mb-8 leading-relaxed">
            Join travelers, freelancers, and remote workers using OTO DIAL to stay connected worldwide. Get started with a local phone number, affordable calling, and SMS messaging today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/billing"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-indigo-600 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200 shadow-xl hover:shadow-2xl"
            >
              Get Started
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              to="/billing"
              className="inline-flex items-center justify-center px-8 py-4 bg-transparent text-white font-semibold rounded-xl border-2 border-white hover:bg-white hover:text-indigo-600 transition-all duration-200"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      <NewFooter />
    </div>
  );
}

export default Home;
