import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import nurture from '../../assets/Nurture.png';
import fateh from '../../assets/Fateh.png';
import udaan from '../../assets/Udaan.png';
import inicet from '../../assets/inicet.png';

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
  },
  // {
  //   id: 'arjuna',
  //   title: 'Arjun',
  //   subtitle: 'The Final Push for NEET PG Victory',
  //   description: 'Designed specifically for those who are in their final stage of NEET PG preparation, ready to sprint towards their dreams with precision and confidence.',
  //   highlights: [
  //     'Strategic Revision Plans tailored precisely for the final months and weeks',
  //     'Rapid Concept Boosters and high-yield question banks for maximum retention',
  //     'Focused Grand Tests (GTs) and detailed analytics for insightful performance tracking',
  //     'Personalized Doubt-Clearing Sessions to ensure zero gaps in preparation'
  //   ],
  //   benefits: [
  //     'Increase your accuracy and speed with targeted practice',
  //     'Identify and eliminate your weak points through personalized feedback',
  //     'Boost your confidence through consistent mock-test performance analysis'
  //   ]
  // },
  // {
  //   id: 'foundation',
  //   title: 'Foundation ',
  //   subtitle: 'Early Advantage for Future NEET PG Stars',
  //   description: 'Specially crafted for early-stage aspirants (2nd and 3rd-year MBBS students) who aim for an early, structured start in their NEET PG preparation journey.',
  //   highlights: [
  //     'Conceptual Clarity Sessions ensuring deep understanding right from the start',
  //     'Early Exposure to High-Yield Topics to give you a substantial competitive advantage',
  //     'Personalized Study Schedule to perfectly align preparation with MBBS curriculum',
  //     'Interactive Community of Peers and Mentors keeping motivation high and learning enjoyable'
  //   ],
  //   benefits: [
  //     'Get ahead by starting your preparation strategically and early',
  //     'Enjoy stress-free learning aligned with your college curriculum',
  //     'Develop efficient study habits and examination skills early in your career'
  //   ]
  // }
];

const CoursesSection: React.FC = () => {
  return (
    <section id="courses" className="py-20 bg-teal-50">
      <div className="container mx-auto px-4">
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-teal-700 mb-4">
            Our Programs
          </h2>
          <p className="text-lg text-teal-900 max-w-3xl mx-auto">
            Choose the program that best fits your NEET PG preparation journey. Each course is crafted with precision to meet you exactly where you are and take you where you want to be.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
          {courses.map((course, index) => (
            <motion.div
              key={course.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden border border-teal-100 h-full flex flex-col"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              style={{ minHeight: '880px', display: 'flex', flexDirection: 'column' }}  // added
            >
              <div className="p-6 flex flex-col h-full">
                <h3 className="text-2xl font-bold text-blue-900 mb-2">
                  {course.title}
                </h3>
                <p className="text-lg font-semibold text-blue-800 mb-4">
                  {course.subtitle}
                </p>
                {/* Add course image here */}
                <div className="w-full flex justify-center mb-6">
                  <div className="w-full" style={{ maxWidth: 340, height: 190, background: '#FFFFFF', borderRadius: '0.5rem', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>  {/*changed height from 140 to 190*/}
                    <img
                      src={course.image}
                      alt={course.title + ' image'}
                      className="w-full h-full"
                      style={{ objectFit: 'contain', background: '#f1f5f9' }}
                    />
                  </div>
                </div>
                <div className="mb-6">
                  <h4 className="font-semibold text-blue-900 mb-2">Who's it for?</h4>
                  <p className="text-gray-700">{course.description}</p>
                </div>
                <div className="mb-6">
                  <h4 className="font-semibold text-teal-800 mb-2">Course Highlights:</h4>
                  <ul className="space-y-2">
                    {course.highlights.map((highlight, i) => (
                      <li key={i} className="flex items-start">
                        <span className="h-2 w-2 bg-teal-500 rounded-full mt-2 mr-2"></span>
                        <span className="">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mb-6">
                  <h4 className="font-semibold text-teal-800 mb-2">Benefits You'll Love:</h4>
                  <ul className="space-y-2">
                    {course.benefits.map((benefit, i) => (
                      <li key={i} className="flex items-start">
                        <span className="h-2 w-2 bg-teal-500 rounded-full mt-2 mr-2"></span>
                        <span className="">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex-grow"></div>
                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 mt-6">
                  <a 
                    href="https://docs.google.com/forms/d/e/1FAIpQLSccHeq1gUBguz8MYr4JGFzYFlsZeHCOsEq2BQ6g1chlvmkIuQ/viewform"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn bg-white border-2 border-teal-600 text-teal-600 hover:bg-teal-50 transition-colors flex items-center justify-center"
                  >
                    Enroll Now <ArrowRight size={16} className="ml-2" />
                  </a>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CoursesSection;