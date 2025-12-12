import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

function HowItWorks() {
  const steps = [
    {
      number: 1,
      title: "Choose a Number",
      description: "Browse and select a virtual phone number from countries worldwide. Instant activation, no waiting."
    },
    {
      number: 2,
      title: "Connect your Wallet",
      description: "Add funds to your wallet securely. Top up easily and manage your balance from the dashboard."
    },
    {
      number: 3,
      title: "Start Calling from Dashboard",
      description: "Make calls, send messages, and manage all your communications from one central dashboard."
    }
  ];

  return (
    <section className="w-full bg-gradient-to-b from-white to-[#EEF2F7] py-20 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            How It Works
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Get started in three simple steps
          </p>
        </motion.div>

        {/* Steps Layout */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-6 lg:gap-12 relative">
          {/* Connecting Line - Desktop Only */}
          <div className="hidden md:block absolute top-12 left-1/6 right-1/6 h-0.5 bg-gradient-to-r from-indigo-200 via-purple-200 to-indigo-200 -z-10"></div>

          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.2 }}
              className="flex-1 flex flex-col items-center text-center"
            >
              {/* Number Badge */}
              <div className="relative mb-6">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center shadow-lg relative z-10">
                  <span className="text-2xl md:text-3xl font-bold text-white">
                    {step.number}
                  </span>
                </div>
                {/* Minimal Icon Placeholder */}
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-full border-2 border-indigo-200 flex items-center justify-center shadow-md">
                  <div className="w-3 h-3 bg-indigo-400 rounded-full"></div>
                </div>
              </div>

              {/* Step Content */}
              <div className="flex-1">
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">
                  {step.title}
                </h3>
                <p className="text-gray-600 leading-relaxed text-sm md:text-base max-w-sm mx-auto">
                  {step.description}
                </p>
              </div>

              {/* Arrow - Mobile Only */}
              {index < steps.length - 1 && (
                <div className="md:hidden mt-6 mb-2">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center mt-16"
        >
          <Link
            to="/signup"
            className="inline-block px-8 py-4 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            Get Started Now
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

export default HowItWorks;
