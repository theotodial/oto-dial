import { motion } from 'framer-motion';

function TestimonialsPreview() {
  const testimonials = [
    {
      name: "Sarah Johnson",
      text: "OTO-DIAL transformed how we handle customer communications. The virtual numbers are a game-changer!"
    },
    {
      name: "Michael Chen",
      text: "Incredibly easy to set up and the AI features save us hours every week. Highly recommend!"
    }
  ];

  return (
    <section className="w-full bg-gradient-to-b from-[#EEF2F7] to-white py-20 px-4">
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
            What Our Customers Say
          </h2>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-6 lg:gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.2 }}
              className="bg-gradient-to-br from-white to-indigo-50 rounded-xl p-6 md:p-8 shadow-md hover:shadow-lg transition-shadow duration-300"
            >
              {/* Testimonial Text */}
              <p className="text-gray-700 text-lg mb-6 leading-relaxed">
                "{testimonial.text}"
              </p>

              {/* Customer Info */}
              <div className="flex items-center">
                {/* Profile Image Placeholder */}
                <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                  <span className="text-white font-semibold text-lg">
                    {testimonial.name.charAt(0)}
                  </span>
                </div>
                
                {/* Customer Name */}
                <div>
                  <p className="font-semibold text-gray-900">
                    {testimonial.name}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TestimonialsPreview;
