import { Link } from 'react-router-dom';

function NewHeroSection() {
  return (
    <section className="relative pt-32 pb-20 px-4 overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-white dark:from-slate-800 dark:via-slate-900 dark:to-slate-900">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-300 dark:bg-purple-600 rounded-full opacity-10 blur-3xl"></div>
        <div className="absolute top-60 -left-40 w-96 h-96 bg-indigo-300 dark:bg-indigo-600 rounded-full opacity-10 blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-1 gap-12 items-center">
          {/* Left content */}
          <div className="space-y-8 text-center mx-auto max-w-4xl">
            {/* Badge */}
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-full mx-auto">
              <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-indigo-900 dark:text-indigo-300">Now Available In 100+ Countries</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
              Virtual Phone Numbers for Calling & SMS Anywhere
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 leading-relaxed max-w-2xl text-center mx-auto mt-6">
              Get a local phone number in the US, UK, and other countries. Make calls and send SMS from anywhere—perfect for travelers, freelancers, and remote workers. A simple alternative to Google Voice and TextNow.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#pricing"
                className="inline-flex items-center justify-center px-8 py-4 bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-semibold rounded-xl border-2 border-gray-200 dark:border-slate-600 hover:border-indigo-600 hover:text-indigo-600 dark:hover:border-indigo-400 dark:hover:text-indigo-400 transition-all duration-200"
              >
                View Pricing
              </a>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}

export default NewHeroSection;
