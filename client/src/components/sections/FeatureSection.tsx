import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import mentorshipImg from '../../assets/Mentorship.jpg';
import gtAnalysisImg from '../../assets/GTAnalysis.jpg';
import personalized from '../../assets/Personalized Task.jpg';

const features = [
  {
    img: mentorshipImg,
    alt: "One-on-One Mentorship",
    title: "One-on-One Mentorship",
    description: "Get personalized guidance directly from Dr. Gourav Lalla to address your specific academic challenges and goals."
  },
  {
    img: gtAnalysisImg,
    alt: "Grand Test Analysis",
    title: "Grand Test Analysis",
    description: "Receive detailed analysis of your performance with actionable insights to improve your scores significantly."
  },
  {
    img : personalized,
    title: "Personalized Tasks",
    description: "Follow customized study plans designed to strengthen your weak areas and optimize your study time."
  },
  {
    icon: <Calendar className="feature-icon" />,
    title: "Live Sessions",
    description: "Participate in interactive live sessions focusing on high-yield topics and exam strategies."
  }
];

const FeatureSection: React.FC = () => {
  const [modalImg, setModalImg] = useState<string | null>(null);
  const [modalAlt, setModalAlt] = useState<string>("");

  return (
    <section id="features" className="py-20 bg-gray-50">
      {/* Modal for enlarged image */}
      {modalImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="relative bg-white rounded-lg shadow-lg max-w-2xl w-full flex flex-col items-center">
            <button
              className="absolute top-2 right-2 bg-red-600 text-white rounded-full px-4 py-2 font-bold text-lg hover:bg-red-700 transition"
              onClick={() => setModalImg(null)}
            >
              Close
            </button>
            <img
              src={modalImg}
              alt={modalAlt}
              className="w-full h-[60vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      <div className="container mx-auto px-4">
        <div className="section-title">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            Why Choose Eyeconic Mentorship?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Our comprehensive approach addresses all aspects of academic excellence, providing
            you with the tools and guidance needed to succeed.
          </motion.p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mt-12">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              className="feature-card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              {'img' in feature ? (
                <div
                  className="flex justify-center items-center mb-4 w-full h-32 cursor-pointer"
                  onClick={() => {
                    setModalImg(feature.img!);
                    setModalAlt(feature.alt!);
                  }}
                >
                  <img
                    src={feature.img}
                    alt={feature.alt}
                    className="w-full h-full object-cover rounded-lg shadow"
                  />
                </div>
              ) : (
                feature.icon
              )}
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeatureSection;