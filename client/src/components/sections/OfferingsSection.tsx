import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Video, CheckSquare, BarChart, LineChart } from 'lucide-react';
import mentor from '../../assets/Mentorship.jpg';
import quiz from '../../assets/weekly quiz.jpg';
import gt from '../../assets/GTAnalysis.jpg';
import progress from '../../assets/PROGRESS TRACKING.jpg';
import live from '../../assets/Live.jpg'

const tabItems = [
  {
    id: "1-on-1",
    title: "1-on-1 Mentorship",
    icon: <Users className="w-6 h-6" />
  },
  {
    id: "live-sessions",
    title: "Live Sessions",
    icon: <Video className="w-6 h-6" />
  },
  {
    id: "daily-tasks",
    title: "Daily Tasks & Quizzes",
    icon: <CheckSquare className="w-6 h-6" />
  },
  {
    id: "gt-analysis",
    title: "GT Analysis",
    icon: <BarChart className="w-6 h-6" />
  },
  {
    id: "progress",
    title: "Progress Tracking",
    icon: <LineChart className="w-6 h-6" />
  }
];

const tabContent = {
  "1-on-1": {
    title: "1-on-1 Mentorship",
    description: "Personalized guidance from Dr. Lalla to address your specific needs and challenges. Our mentors help create custom study plans, track your progress, and adapt strategies for optimal results.",
    image: mentor
  },
  "live-sessions": {
    title: "Live Sessions",
    description: "Interactive live classes covering high-yield topics, recent exam patterns, and strategic approaches to difficult subjects. Participate in Q&A sessions with expert faculty.",
    image: live
  },
  "daily-tasks": {
    title: "Daily Tasks & Quizzes",
    description: "Structured daily assignments and quizzes to reinforce learning and maintain consistent progress. Regular assessment helps identify strengths and areas needing improvement.",
    image: quiz
  },
  "gt-analysis": {
    title: "Grand Test Analysis",
    description: "Comprehensive analysis of your test performance with actionable insights. Our detailed reports help you understand patterns in your mistakes and develop targeted improvement strategies.",
    image: gt
  },
  "progress": {
    title: "Progress Tracking",
    description: "Small group discussions and performance tracking to keep you motivated and accountable throughout your preparation journey. Regular feedback sessions help adjust your approach as needed.",
    image: progress
  }
};

const OfferingsSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState("1-on-1");
  const [modalImg, setModalImg] = useState<string | null>(null);
  const [modalAlt, setModalAlt] = useState<string>("");

  return (
    <section id="programs" className="py-20 bg-[#0A0F14]">
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
            What We Offer
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-[#94A3B8]"
          >
            Comprehensive support designed for medical aspirants who aim for excellence.
          </motion.p>
        </div>
        
        {/* Tabs */}
        <div className="mt-12">
          <div className="flex flex-wrap justify-center mb-8">
            {tabItems.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-6 py-3 mx-2 my-2 rounded-xl transition-all border ${
                  activeTab === tab.id
                    ? 'bg-[#18222E] text-[#18B6A4] border-[rgba(24,182,164,0.35)] shadow-[0_0_16px_rgba(24,182,164,0.12)]'
                    : 'bg-[#18222E] text-[#94A3B8] border-white/[0.06] hover:bg-[#1E2A38] hover:text-[#CBD5E1]'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                <span className="font-medium">{tab.title}</span>
              </button>
            ))}
          </div>
          
          {/* Tab Content */}
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-[#18222E] border border-white/[0.06] p-8 rounded-2xl shadow-card-dark"
          >
            <div className="flex flex-col lg:flex-row items-center gap-8">
              <div className="w-full lg:w-1/3">
                <img 
                  src={tabContent[activeTab as keyof typeof tabContent].image} 
                  alt={tabContent[activeTab as keyof typeof tabContent].title} 
                  className="rounded-xl border border-white/[0.06] shadow-card-dark w-full h-72 object-cover cursor-pointer"
                  onClick={() => {
                    setModalImg(tabContent[activeTab as keyof typeof tabContent].image);
                    setModalAlt(tabContent[activeTab as keyof typeof tabContent].title);
                  }}
                />
              </div>
              
              <div className="w-full lg:w-2/3">
                <h3 className="text-2xl font-bold mb-4 text-white">{tabContent[activeTab as keyof typeof tabContent].title}</h3>
                <p className="text-[#94A3B8] leading-relaxed">{tabContent[activeTab as keyof typeof tabContent].description}</p>
              </div>
            </div>
          </motion.div>
        </div>
        
        <div className="mt-16 bg-[#18222E] border border-white/[0.06] p-8 rounded-2xl shadow-card-dark">
          <p className="text-center text-lg text-[#CBD5E1] leading-relaxed">
            Whether you're targeting NEET PG or INICET, our approach is designed to match your pace, style, and goals. 
            We don't believe in one-size-fits-all solutions because medical preparation is as individual as the doctors it creates.
          </p>
          <p className="text-center text-xl font-semibold text-[#4DD7C8] mt-4 italic">
            "Because we believe your preparation journey deserves to be as iconic as your dream."
          </p>
        </div>
      </div>
    </section>
  );
};

export default OfferingsSection;