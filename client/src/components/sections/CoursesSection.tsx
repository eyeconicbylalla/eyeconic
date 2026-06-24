import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import nurture from '../../assets/Nurture.png';
import fateh from '../../assets/Fateh.png';
import udaan from '../../assets/Udaan.png';
import inicet from '../../assets/inicet.png';
import img36 from '../../assets/36.png';
import img37 from '../../assets/37.png';
import img38 from '../../assets/38.png';

/*
const courses = [
  {
    id: 'nurture',
    title: 'NURTURE – NEET PG 2026 Batch',
    subtitle: 'Validity: Until NEET PG 2026',
    image: nurture,
    description: 'Includes preparation for INICET Nov and May 2026. Get 1-on-1 mentorship, personalized goal setting, GT performance analysis, progress dashboards, targeted study plans, seat assurance strategy, and elite focus group access for serious NEET PG and INICET aspirants.',
    highlights: [
      '1-on-1 Mentorship with detailed handholding',
      'Personalised Goal Setting based on your pace',
      'GT Performance Analysis for smart corrections',
      'Progress Dashboards for visibility on your prep',
      'Targeted Study Plans for max output',
      'Seat Assurance Strategy to help you get selected',
      'Elite Focus Group Access for serious INICET aspirant'
    ],
    benefits: [
      'Personalized mentorship and goal mapping',
      'Comprehensive preparation for NEET PG & INICET 2026',
      'Progress tracking and seat assurance strategy'
    ]
  },
  {
    id: 'mission-inicet',
    title: 'INICET – INI Focussed Batch',
    subtitle: 'Validity: Until Nov INICET',
    image: inicet,
    description: 'For serious INICET aspirants targeting AIIMS/INI Superspecialty seats.',
    highlights: [
      'INI-Focused Grand Tests with high yield recall Qs',
      'Where-You-Stand Tracker to measure growth weekly',
      '1-on-1 Mentorship with detailed handholding',
      'Custom Goal Setting to reach AIIMS/INI goals',
      'GT Performance Analysis for smart corrections',
      'Progress Dashboards for visibility on your prep',
      'Targeted Study Plans for max output',
      'Elite Focus Group Access for serious INICET aspirants'
    ],
    benefits: [
      'Weekly growth tracking and performance analysis',
      'Elite mentorship and goal mapping',
      'Focused preparation for INICET/AIIMS'
    ]
  },
  {
    id: 'udaan-mbbs',
    title: 'UDAAN MBBS – For MBBS Students',
    subtitle: 'Validity: 1 Year from Joining Date',
    image: udaan,
    description: 'Kickstart your PG Preparation Today. Limited Seats!',
    highlights: [
      '1-on-1 Mentorship to guide your journey',
      'Personalised Goal Mapping by experts',
      'GT Analysis to help you prep smarter',
      'Progress Monitoring System to keep you accountable',
      'Tailored Study Plans for your strengths & schedule',
      'Seat Assurance Strategy to help you get selected',
      'Elite Focus Group Access for top-tier prep culture'
    ],
    benefits: [
      'Early start for MBBS students',
      'Personalised guidance and accountability',
      'Seat assurance strategy for PG selection'
    ]
  },
  {
    id: 'fateh-fmge',
    title: 'FATEH FMGE – Special Comeback Batch',
    subtitle: 'Validity: Until Dec 2025',
    image: fateh,
    description: 'You don’t need a coaching. You need a COMEBACK PLAN.',
    highlights: [
      'Daily Study Planner with strict accountability',
      'Peer Interaction Group for real-time motivation',
      'One-on-One Mentorship with expert guidance',
      'Personalised Goal Setting based on your pace',
      'GT Analysis to decode your strengths and gaps',
      'Effective Progress Tracking to stay on course',
      'Custom Study Plans curated to your needs',
      'Elite Focus Group Access for serious contenders only'
    ],
    benefits: [
      'Comeback plan for FMGE aspirants',
      'Daily accountability and peer motivation',
      'Expert mentorship and custom study plans'
    ]
  }
];
*/

const newCourses = [
  {
    id: 'batch-36',
    title: 'Mentorship Program - 36',
    image: img36
  },
  {
    id: 'batch-37',
    title: 'Mentorship Program - 37',
    image: img37
  },
  {
    id: 'batch-38',
    title: 'Mentorship Program - 38',
    image: img38
  }
];

const CoursesSection: React.FC = () => {
  return (
    <section id="courses" className="py-20 bg-[#101720]">
      <div className="container mx-auto px-4">
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Our Programs
          </h2>
          <p className="text-lg text-[#CBD5E1] max-w-3xl mx-auto">
            Choose the program that best fits your NEET PG preparation journey. Each course is crafted with precision to meet you exactly where you are and take you where you want to be.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {newCourses.map((course, index) => (
            <motion.div
              key={course.id}
              className="bg-[#18222E] rounded-2xl shadow-card-dark overflow-hidden border border-white/[0.06] hover:border-[rgba(24,182,164,0.35)] hover:shadow-large-dark transition-all duration-300 flex flex-col justify-between"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
            >
              <div className="p-5 flex flex-col h-full justify-between">
                <div className="w-full rounded-xl overflow-hidden mb-6 border border-white/[0.04] bg-[#0F172A] flex items-center justify-center">
                  <img
                    src={course.image}
                    alt={course.title}
                    className="w-full h-auto object-contain"
                  />
                </div>
                <a 
                  href="https://docs.google.com/forms/d/e/1FAIpQLSccHeq1gUBguz8MYr4JGFzYFlsZeHCOsEq2BQ6g1chlvmkIuQ/viewform"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary w-full text-center py-3 font-semibold text-white bg-[#18B6A4] hover:bg-[#149d8c] rounded-xl flex items-center justify-center transition-all duration-300 mt-auto"
                >
                  Join Now <ArrowRight size={16} className="ml-2" />
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CoursesSection;