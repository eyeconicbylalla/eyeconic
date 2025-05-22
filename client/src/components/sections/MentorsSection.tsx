import React from 'react';
import { motion } from 'framer-motion';
import lalla from '../../assets/PROFILE DR LALLA.jpg'
import chandan from '../../assets/mr_chandan_profile.jpg';

const mentors = [
  {
    id: 'dr-lalla',
    name: 'Dr. Gourav Lalla',
    title: 'Founder | Mentor | Ophthalmology Resident',
    description: `Dr. Gourav Lalla is more than just a mentor—he's the motivating force behind Eyeconic. Currently pursuing his residency in Ophthalmology, Dr. Lalla has cracked the NEET PG with distinction himself, giving him firsthand insight into the intricacies of this high-stakes exam.`,
    longDescription: `Renowned for his energetic, friendly, and exceptionally effective teaching style, Dr. Lalla breaks down complex medical concepts into easily digestible bites, making even the toughest subjects feel manageable. With thousands of followers benefiting daily from his dynamic videos and live sessions, Dr. Lalla has become a trusted figure for medical aspirants nationwide.

His approach combines meticulous strategy, empathetic mentorship, and motivational psychology—empowering students not only to achieve academic excellence but also to build confidence, resilience, and a lifelong passion for medicine.`,
    quote: "Your potential is limitless when matched with the right guidance. Let's unleash it together.",
    image: lalla
  },
  {
    id: 'kritika-swami',
    name: 'Kritika Swami',
    title: 'Operations Head | Mentor | Academic Strategist at Eyeconic',
    description: 'Kritika Swami is the calm command center behind many of Eyeconic\'s most impactful student journeys. With a rock-solid academic background in Chemistry (M.Sc.) and a fierce passion for teaching, she has become one of our most dependable and driven mentors.',
    longDescription: `Known for her sharp planning skills, unwavering discipline, and an innate knack for student psychology, Kritika ensures every student under her watch has a clear plan, strong accountability, and personal motivation to succeed. Her ability to maintain structure while offering genuine emotional support makes her the perfect blend of mentor and manager.

But beyond the Google Sheets and strategy calls, Kritika is a natural-born teacher. Her love for science shines through every session she takes. She's been a guiding force for many, thanks to unwavering belief in every student's potential.`,
    specialties: [
      'Razor-sharp with academic planning and routine design',
      'Passionate about conceptual clarity over cramming',
      'Known for her 100% accuracy and no-nonsense discipline',
      'Warm, responsive, and deeply invested in every student\'s growth'
    ],
    quote: "I don't just want you to prepare—I want you to believe, act, and conquer. Let's build the version of you that wins.",
    image: '/images/mentors/kritika.jpg'
  },
  {
    id: 'mr-chandan',
    name: 'Mr. Chandan',
    title: 'Operations In-Charge | Senior Advisor | Mentor to the Mentors',
    description: 'With over four decades of leadership experience as the Senior Vice President at UTI Mutual Fund, Mr. Chandan brings a legacy of discipline, foresight, and operational excellence to Eyeconic.',
    longDescription: `Having led high-stakes financial operations at one of India's premier institutions, Mr. Chandan is no stranger to performance under pressure. His experience in managing teams, streamlining workflows, and ensuring consistent output is now being channelled into building one of the most efficient and student-centered academic ops teams in the country.

At Eyeconic, he works directly with Dr. Gourav Lalla and closely mentors our dynamic Operations Head, Kritika, bringing structure, guidance, and the calm confidence of a seasoned veteran to every decision made.`,
    specialties: [
      'Decades of top-tier operational leadership',
      'A mentor\'s mindset with a strategist\'s clarity',
      'Systems thinking, process optimization, and people management mastery',
      'A calming presence and decision-making wisdom in high-pressure scenarios',
      'Hands-on involvement in scaling the Eyeconic vision without losing the personal touch'
    ],
    quote: "The right structure unlocks the highest potential. At Eyeconic, we're not just managing operations—we're nurturing future doctors, and that deserves excellence at every level.",
    image: chandan
  }
];

const MentorsSection: React.FC = () => {
  return (
    <section id="mentors" className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-blue-900 mb-4">
            Meet the Mentors
          </h2>
          <p className="text-lg text-gray-700 max-w-3xl mx-auto">
            Behind every successful NEET PG aspirant is a team of dedicated mentors. Meet the experts who will guide you through your journey.
          </p>
        </motion.div>

        <div className="space-y-12">
          {mentors.map((mentor, index) => (
            <motion.div
              key={mentor.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden border border-teal-100"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
            >
              <div className="flex flex-col md:flex-row">
                <div className="md:w-1/3 bg-teal-50">
                  <img 
                    src={mentor.image} 
                    alt={mentor.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="md:w-2/3 p-8">
                  <h3 className="text-2xl font-bold text-blue-900 mb-2">
                    {mentor.name}
                  </h3>
                  <p className="text-lg font-semibold text-blue-800 mb-4">
                    {mentor.title}
                  </p>
                  <p className="text-gray-700 mb-4">
                    {mentor.description}
                  </p>
                  <p className="text-gray-700 mb-6">
                    {mentor.longDescription}
                  </p>
                  {mentor.specialties && (
                    <div className="mb-6">
                      <h4 className="font-semibold text-blue-900 mb-2">What Sets {mentor.name.split(' ')[0]} Apart:</h4>
                      <ul className="space-y-2">
                        {mentor.specialties.map((specialty, i) => (
                          <li key={i} className="flex items-start">
                            <span className="h-2 w-2 bg-teal-500 rounded-full mt-2 mr-2"></span>
                            <span className="text-gray-700">{specialty}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <blockquote className="italic text-lg text-blue-800 border-l-4 border-teal-500 pl-4 mb-6">
                    "{mentor.quote}"
                  </blockquote>
                  <a 
                    href={`/mentors/${mentor.id}`}
                    className="inline-block px-6 py-2 bg-teal-600 text-white rounded-lg font-semibold shadow hover:bg-teal-700 transition-colors"
                  >
                    View Profile
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

export default MentorsSection;