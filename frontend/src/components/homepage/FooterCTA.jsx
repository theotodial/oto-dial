import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

function FooterCTA() {
  return (
    <section className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 py-16 md:py-20 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="space-y-6"
        >
          {/* Headline */}
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
            Get your number today
          </h2>

          {/* Subtext */}
          <p className="text-lg md:text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
            Start calling worldwide in minutes
          </p>

          {/* CTA Button */}
          <Link
            to="/signup"
            className="inline-block px-8 py-4 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-indigo-50 transition-all duration-200 shadow-xl hover:shadow-2xl transform hover:-translate-y-1 text-lg"
          >
            Get Started
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

export default FooterCTA;
