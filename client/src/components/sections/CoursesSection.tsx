import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const courses = [
  {
    id: 'arjuna',
    title: 'Arjuna',
    subtitle: 'The Final Push for NEET PG Victory',
    description: 'Designed specifically for those who are in their final stage of NEET PG preparation, ready to sprint towards their dreams with precision and confidence.',
    highlights: [
      'Strategic Revision Plans tailored precisely for the final months and weeks',
      'Rapid Concept Boosters and high-yield question banks for maximum retention',
      'Focused Grand Tests (GTs) and detailed analytics for insightful performance tracking',
      'Personalized Doubt-Clearing Sessions to ensure zero gaps in preparation'
    ],
    benefits: [
      'Increase your accuracy and speed with targeted practice',
      'Identify and eliminate your weak points through personalized feedback',
      'Boost your confidence through consistent mock-test performance analysis'
    ]
  },
  {
    id: 'nurture',
    title: 'Nurture 3.1',
    subtitle: 'Building Strong Foundations for NEET PG',
    description: 'Perfect for dedicated students in their mid-preparation phase who want to solidify concepts, build robust foundations, and systematically cover their syllabus without overwhelming pressure.',
    highlights: [
      'Comprehensive Subject Coverage in a structured and balanced manner',
      'Interactive Live Sessions & Video Lectures for engaging, effective learning',
      'Regular Customized Modules and Weekly Tests for consistent improvement',
      'Mentorship & Regular Check-ins ensuring accountability and steady progress'
    ],
    benefits: [
      'Strengthen your basics thoroughly across all subjects',
      'Get personalized strategies to streamline your studies',
      'Consistent monitoring, motivation, and mentoring to keep you on track'
    ]
  },
  {
    id: 'foundation',
    title: 'Foundation 2.1',
    subtitle: 'Early Advantage for Future NEET PG Stars',
    description: 'Specially crafted for early-stage aspirants (2nd and 3rd-year MBBS students) who aim for an early, structured start in their NEET PG preparation journey.',
    highlights: [
      'Conceptual Clarity Sessions ensuring deep understanding right from the start',
      'Early Exposure to High-Yield Topics to give you a substantial competitive advantage',
      'Personalized Study Schedule to perfectly align preparation with MBBS curriculum',
      'Interactive Community of Peers and Mentors keeping motivation high and learning enjoyable'
    ],
    benefits: [
      'Get ahead by starting your preparation strategically and early',
      'Enjoy stress-free learning aligned with your college curriculum',
      'Develop efficient study habits and examination skills early in your career'
    ]
  }
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

        <div className="grid md:grid-cols-3 gap-8">
          {courses.map((course, index) => (
            <motion.div
              key={course.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden border border-teal-100"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
            >
              <div className="p-6">                <h3 className="text-2xl font-bold text-blue-900 mb-2">
                  {course.title}
                </h3>
                <p className="text-lg font-semibold text-blue-800 mb-4">
                  {course.subtitle}
                </p>
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
                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 mt-6">
                  <a 
                    href={`/courses/${course.id}`}
                    className="btn bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                  >
                    Learn More
                  </a>
                  <a 
                    href={`/enroll/${course.id}`}
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