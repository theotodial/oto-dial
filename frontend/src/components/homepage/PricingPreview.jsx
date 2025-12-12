import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

function PricingPreview() {
  const plans = [
    {
      name: "Basic",
      price: "$XX",
      period: "/month",
      features: [
        "1 Virtual Phone Number",
        "100 Minutes/month",
        "Basic Call Recording",
        "Email Support"
      ]
    },
    {
      name: "Standard",
      price: "$XX",
      period: "/month",
      features: [
        "3 Virtual Phone Numbers",
        "500 Minutes/month",
        "Advanced Call Routing",
        "AI Chat Inbox",
        "Priority Support"
      ],
      popular: true
    },
    {
      name: "Pro",
      price: "$XX",
      period: "/month",
      features: [
        "Unlimited Phone Numbers",
        "Unlimited Minutes",
        "Full AI Automation",
        "API Access",
        "24/7 Dedicated Support"
      ]
    }
  ];

  return (
    <section className="w-full bg-white py-20 px-4">
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
            Simple Pricing
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Choose the perfect plan for your business needs
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 lg:gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8, scale: 1.02 }}
              className={`relative bg-white rounded-xl p-8 border-2 transition-all duration-300 cursor-pointer shadow-md hover:shadow-xl ${
                plan.popular
                  ? 'border-indigo-500 shadow-lg md:scale-105'
                  : 'border-gray-200 hover:border-indigo-300'
              }`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white text-sm font-semibold px-4 py-1 rounded-full">
                  Most Popular
                </div>
              )}

              {/* Plan Name */}
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                {plan.name}
              </h3>

              {/* Price */}
              <div className="my-6">
                <div className="flex items-baseline">
                  <span className="text-5xl md:text-6xl font-bold text-gray-900">
                    {plan.price}
                  </span>
                  <span className="text-lg text-gray-600 ml-2">
                    {plan.period}
                  </span>
                </div>
              </div>

              {/* Features List */}
              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start">
                    <svg
                      className="w-5 h-5 text-indigo-600 mr-3 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <Link
                to="/"
                className={`block w-full text-center py-3 px-6 rounded-lg font-semibold transition-colors duration-200 ${
                  plan.popular
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200 border-2 border-gray-200'
                }`}
              >
                See Full Pricing
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default PricingPreview;
