import React, { useState } from 'react';
import { motion } from 'framer-motion';

import mentorshipImg from '../../assets/Mentorship.jpg';
import gtAnalysisImg from '../../assets/GTAnalysis.jpg';
import personalized from '../../assets/Personalized Task.jpg';
import live from '../../assets/Live.jpg';

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
    img : live,
    title: "Live Sessions",
    description: "Participate in interactive live sessions focusing on high-yield topics and exam strategies."
  }
];

const FeatureSection: React.FC = () => {
  const [modalImg, setModalImg] = useState<string | null>(null);
  const [modalAlt, setModalAlt] = useState<string>("");

  return (
    <section id="features" className="py-20 bg-[#0A0F14]">
      {/* Modal for enlarged image */}
      {modalImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="relative bg-[#18222E] border border-white/[0.08] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] max-w-2xl w-full flex flex-col items-center p-4">
            <button
              className="absolute top-6 right-6 bg-[#1E2A38] text-[#CBD5E1] border border-white/[0.06] rounded-xl px-4 py-2 font-semibold text-sm hover:bg-red-950/60 hover:text-red-300 hover:border-red-500/30 transition-all duration-200"
              onClick={() => setModalImg(null)}
            >
              Close
            </button>
            <img
              src={modalImg}
              alt={modalAlt}
              className="w-full h-[60vh] object-contain rounded-xl mt-12 border border-white/[0.06]"
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
            className="text-white"
          >
            Why Choose Eyeconic Mentorship?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-[#94A3B8]"
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
                    setModalAlt(feature.alt || feature.title);
                  }}
                >
                  <img
                    src={feature.img}
                    alt={feature.alt || feature.title}
                    className="w-full h-full object-cover rounded-xl shadow-card-dark border border-white/[0.06]"
                  />
                </div>
              ) : (
                (feature as any).icon
              )}
              <h3 className="text-xl font-bold mb-2 text-white">{feature.title}</h3>
              <p className="text-[#94A3B8] text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeatureSection;