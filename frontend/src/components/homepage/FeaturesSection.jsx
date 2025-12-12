import { motion } from 'framer-motion';

function FeaturesSection() {
  const features = [
    {
      title: "Buy Global Numbers",
      description: "Get dedicated phone numbers from multiple countries with instant activation and no hardware required."
    },
    {
      title: "Smart Call Routing",
      description: "Automatically route calls to the right person or department based on time, location, and caller preferences."
    },
    {
      title: "Call Recording",
      description: "Record all your calls automatically with cloud storage, playback, and transcription for quality assurance."
    },
    {
      title: "AI Chat + Voice Inbox",
      description: "Receive messages and voicemails in a unified inbox with AI-powered transcription and smart categorization."
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
            Powerful Features
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Everything you need to transform your business communications
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ scale: 1.05 }}
              className="bg-white rounded-xl p-6 md:p-8 border border-gray-100 hover:border-indigo-200 hover:shadow-lg transition-all duration-300 cursor-pointer group"
            >
              {/* Icon Placeholder Circle */}
              <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-md group-hover:shadow-xl">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-white rounded-full opacity-20"></div>
              </div>

              {/* Title */}
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3 group-hover:text-indigo-600 transition-colors duration-300">
                {feature.title}
              </h3>

              {/* Description */}
              <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeaturesSection;
