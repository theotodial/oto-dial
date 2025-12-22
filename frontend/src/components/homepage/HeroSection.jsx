import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

function HeroSection() {
  return (
    <section className="w-full min-h-screen bg-gradient-to-b from-[#EEF2F7] via-white to-[#EEF2F7] flex items-center justify-center px-4 py-20 relative overflow-hidden">
      {/* Blurred Circle Accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large circle top-left */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-300 rounded-full opacity-20 blur-3xl"></div>
        {/* Medium circle top-right */}
        <div className="absolute top-20 -right-40 w-80 h-80 bg-purple-300 rounded-full opacity-15 blur-3xl"></div>
        {/* Large circle bottom-center */}
        <div className="absolute -bottom-40 left-1/2 transform -translate-x-1/2 w-[500px] h-[500px] bg-blue-300 rounded-full opacity-10 blur-3xl"></div>
        {/* Small circle center-right */}
        <div className="absolute top-1/2 right-20 w-64 h-64 bg-indigo-200 rounded-full opacity-15 blur-2xl hidden lg:block"></div>
      </div>
      
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center relative z-10">
        {/* Left Content */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="space-y-6"
        >
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight"
          >
            Virtual Phone Numbers
            <span className="block text-indigo-600">Call Automation</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-xl"
          >
            Transform your business communications with AI-powered virtual phone numbers and automated calling solutions. Reach customers faster, smarter, and at scale.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 pt-4"
          >
            <Link
              to="/signup"
              className="px-8 py-4 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors duration-200 text-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Get Started
            </Link>
            <Link
              to="/"
              className="px-8 py-4 bg-white text-indigo-600 font-semibold rounded-lg border-2 border-indigo-600 hover:bg-indigo-50 transition-colors duration-200 text-center shadow-md hover:shadow-lg"
            >
              View Pricing
            </Link>
          </motion.div>
        </motion.div>

        {/* Right Device Mockup */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex justify-center items-center"
        >
          <div className="relative">
            {/* Device Frame */}
            <div className="w-72 h-[600px] bg-gray-900 rounded-[3rem] p-4 shadow-2xl">
              {/* Screen */}
              <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden relative">
                {/* Status Bar */}
                <div className="h-8 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center">
                  <div className="text-white text-xs font-medium">OTO DIAL</div>
                </div>
                {/* Screen Content */}
                <div className="p-6 space-y-4 h-full overflow-y-auto">
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-20 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-lg"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                    <div className="h-16 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg"></div>
                  </div>
                </div>
              </div>
              {/* Home Indicator */}
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gray-700 rounded-full"></div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default HeroSection;
