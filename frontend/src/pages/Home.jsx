import NewHeroSection from '../components/homepage/NewHeroSection';
import NewFeaturesSection from '../components/homepage/NewFeaturesSection';
import NewHowItWorks from '../components/homepage/NewHowItWorks';
import NewPricingSection from '../components/homepage/NewPricingSection';
import NewFooter from '../components/homepage/NewFooter';
import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="w-full bg-white dark:bg-slate-900">
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
              OTO DIAL is designed for businesses, startups, and call centers that need a reliable cloud phone system with SMS capabilities. Unlike personal phone apps like TextNow or Google Voice, OTO DIAL is built specifically for business use cases including sales teams, customer support teams, and call centers that require scalable VoIP calling and two-way SMS messaging.
            </p>
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              Whether you're a startup looking for an affordable business phone system or an enterprise needing a scalable cloud dialer with advanced features, OTO DIAL provides the infrastructure and tools to manage your business communications effectively.
            </p>
          </div>

          {/* Why choose OTO DIAL over Google Voice */}
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Why Choose OTO DIAL Over Google Voice for Business?</h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
              While Google Voice is great for personal use, OTO DIAL offers more control and scalability for businesses. Our cloud dialer platform provides dedicated virtual phone numbers, advanced call routing, call analytics, and a comprehensive two-way SMS platform—features that are essential for business communications but limited in personal phone apps.
            </p>
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              Built on carrier-grade infrastructure powered by Telnyx, OTO DIAL ensures reliable voice and SMS delivery for your business. We offer subscription-based phone systems with transparent pricing, making it easier to scale your business communications without hidden fees or long-term contracts.
            </p>
          </div>

          {/* OTO DIAL vs TextNow */}
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">OTO DIAL vs TextNow for Business</h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
              TextNow is designed for personal use, while OTO DIAL is built for businesses that need professional cloud phone systems. Our platform offers virtual phone numbers from 100+ countries, API-powered calling and messaging, call center features, and enterprise-grade security—capabilities that go beyond what personal phone apps provide.
            </p>
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              For businesses looking for a TextNow alternative that offers more control, better scalability, and business-focused features like call analytics, two-way SMS workflows, and integration capabilities, OTO DIAL is the ideal solution.
            </p>
          </div>

          {/* Business phone system for global teams */}
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Business Phone System for Global Teams</h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
              OTO DIAL is a cloud-based phone system designed for global businesses. With virtual phone numbers available in 100+ countries, you can establish a local presence anywhere in the world. Our scalable VoIP calling and SMS platform supports international teams, remote workforces, and businesses expanding into new markets.
            </p>
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              Whether you need a business phone number for your startup, a cloud dialer for your sales team, or a comprehensive call center solution, OTO DIAL provides the tools and infrastructure to scale your business communications globally.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-indigo-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
            Start Your Business Phone System in Minutes
          </h2>
          <p className="text-lg md:text-xl text-indigo-100 mb-8 leading-relaxed">
            Join businesses worldwide using OTO DIAL's cloud dialer and SMS platform to connect with customers seamlessly. Get started with virtual phone numbers, high-quality calling, and two-way SMS messaging today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/billing"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-indigo-600 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200 shadow-xl hover:shadow-2xl"
            >
              Get Started Now
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center px-8 py-4 bg-transparent text-white font-semibold rounded-xl border-2 border-white hover:bg-white hover:text-indigo-600 transition-all duration-200"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      <NewFooter />
    </div>
  );
}

export default Home;
