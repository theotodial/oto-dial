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
      
      {/* Final CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-indigo-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to transform your business communications?
          </h2>
          <p className="text-xl text-indigo-100 mb-8">
            Join 1000+ businesses already using OTO-DIAL to connect with customers worldwide.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-indigo-600 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200 shadow-xl hover:shadow-2xl"
            >
              Start Free Trial
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
