import React, { useState } from 'react';
import { motion } from 'framer-motion';
import lalla from '../../assets/DR LALLA.png';
import chandan from '../../assets/Chandan.png';
import vishwas_arora from '../../assets/vishwas_arora.png';
import michelle from '../../assets/michelle.png';
import jwalant_chag from '../../assets/Jwalant.png';
import sarthak_rathi from '../../assets/sarthak_rathi.jpg';


const coreMentors = [
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
    id: 'dr-jwalant-chag',
    name: 'Dr. Jwalant Chag',
    title: 'MD Psychiatry | Mental Health Lead | Eyeconic by Dr. Lalla',
    description: `When the mind wavers, the syllabus won’t wait — and that’s where Dr. Jwalant Chag steps in.`,
    longDescription: `A qualified psychiatrist with an MD in Psychiatry, Dr. Jwalant isn’t just a doctor — he’s the mental backbone of Eyeconic. As our Mental Health & Wellness Lead, he works at the very intersection where academic pressure meets emotional burnout. With years of clinical experience in understanding the human mind, he now applies that insight to guide NEET PG aspirants through the chaos of competitive prep.

Be it crippling anxiety before a Grand Test, guilt from taking a break, exam-day panic attacks, or even long-term issues like chronic stress, poor sleep, or imposter syndrome — Dr. Jwalant handles it all. From curated wellness check-ins and mental conditioning sessions, to helping aspirants build emotional resilience, he ensures that students don’t just study hard, but also live well while doing it.

His motto is simple: “A stable mind is your most underrated prep strategy.”

At Eyeconic, he’s not just treating minds — he’s building warriors, one calm brain at a time.`,
    quote: "A stable mind is your most underrated prep strategy.",
    image: jwalant_chag
  },
  {
    id: 'chandan-sir',
    name: 'Chandan Sir',
    title: 'Operations In-Charge | Senior Advisor | Mentor to the Mentors',
    description: `Chandan

Operations In-Charge | Senior Advisor | Mentor to the Mentors

At the heart of Eyeconic’s academic engine, Mr. Chandan ensures that every mentor, every student, and every process is in sync and strategically aligned.

He serves as the central communication link between all mentors, overseeing academic progress, ensuring timely subject check-ins, and bringing unparalleled clarity to GT analysis, high-yield subject planning, and student performance tracking.

With a structured mind and a mentor’s heart, he transforms raw data into actionable insights—guiding mentors, refining strategies, and ensuring that every student gets not just direction, but a clear academic roadmap tailored to their strengths and weaknesses.`,
    longDescription: '',
    quote: 'Behind every successful mentor is a strategist who ensures clarity and direction.',
    image: chandan
  }
];

const otherMentors = [
  {
    id: 'dr-vishwas-arora',
    name: 'Dr. Vishwas Arora',
    title: 'Internal Medicine Resident | Mentor',
    description: 'Dr. Vishwas Arora is a Internal Medicine resident at KB Bhabha Hospital Mumbai and a gold-medalist Best MBBS graduate with honours across multiple subjects.',
    longDescription: `Dr. Arora began his medical journey at JNIMS Imphal in 2017, consistently ranking at the top of his class and earning the Best MBBS Graduate Award. He graduated with honours in Pathology, Microbiology, Pharmacology, Community Medicine, and Medicine, along with distinctions in Forensic Medicine & Toxicology and Obstetrics & Gynaecology.

After completing his internship, he commenced NEET-PG preparation in 2023 under the guidance of DAMS and Dr. Gourav Lalla. Their exceptional mentorship, constant motivation, and unwavering support propelled him to secure a rank of 996 in INICET (November) and 6027 in NEET-PG 2024. Today, he channels that same dedication into mentoring the next generation of medical aspirants.`,
    quote: "Guidance coupled with dedication turns ambition into achievement.",
    image: vishwas_arora
  },
  {
    id: 'dr-michelle',
    name: 'Dr. Michelle',
    title: 'MD Paediatrics Resident | Mentor',
    description: 'Dr. Michelle is an MD Paediatrics candidate at GMCH Chandigarh whose early fascination with the human body led her to clear NEET-UG in her first attempt and earn her MBBS from GMC Nahan with distinction.',
    longDescription: `Balancing academics with a vibrant array of extracurriculars, Dr. Michelle’s journey has always been “learning through practice.” In her initial MBBS years, she focused on strategic observation; in the latter half, she honed her clinical skills and mastered core medical texts guided by hands-on experience. Near the end of her final year, she earned her IAP-BLS certification and graduated with distinction in multiple subjects, including Paediatrics.

After MBBS, she served as a non-academic junior resident in the Department of Medicine, where her dedication and patient care were highly appreciated—fueling her decision to pursue postgraduate studies. Outside the hospital, Dr. Michelle is formally trained in Indian classical dance and stays balanced through adventure sports like diving, kayaking, trekking, ziplining, and camping. On quieter days, she channels her creativity into painting.

Starting NEET-PG prep in July 2023, she built a strong foundation in basic sciences and past-year question analysis under mentors like Dr. Zainab Vora and Dr. Gourav Lalla. Her perseverance paid off with a NEET-PG 2024 rank of 4703. Driven by a passion for paediatric care and a desire to empower others, she now dedicates herself to guiding early-career aspirants through the challenges of medical entrance exams.`,
    quote: "Learning through practice transforms knowledge into healing.",
    image: michelle
  },
  {
    id: 'dr-sarthak-rathi',
    name: 'Dr. Sarthak Rathi',
    title: 'Radiodiagnosis Resident | Mentor',
    description: `Dr. Sarthak Rathi is a Radiodiagnosis resident at Seth GSMC & KEM Hospital, Mumbai, where he also completed his MBBS. A consistent high-ranker, he secured AIR 67 in NEET PG 2024, following his stellar NEET UG journey with AIR 259 (NEET UG 2018), AIR 227 (AIIMS 2018), and AIR 116 (JIPMER 2018). Known for his precision, calm mindset, and strategic prep, he now mentors NEET PG aspirants with the same sharp focus that earned him success across India’s toughest medical entrance exams.`,
    longDescription: '',
    quote: '',
    image: sarthak_rathi
  }
];

const MentorsSection: React.FC = () => {
  const [showOtherMentors, setShowOtherMentors] = useState(false);

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
            {showOtherMentors ? 'Other Mentors' : 'Meet the Mentors'}
          </h2>
          <p className="text-lg text-gray-700 max-w-3xl mx-auto">
            {showOtherMentors
              ? 'Meet our extended team of dedicated mentors who bring diverse expertise and experience to Eyeconic.'
              : <>Behind every successful NEET PG aspirant is a team of dedicated mentors. <br /> Meet the experts who will guide you through your journey.</>
            }
          </p>
          {!showOtherMentors && (
            <button
              className="mt-6 px-6 py-2 bg-teal-600 text-white rounded-lg font-semibold shadow hover:bg-teal-700 transition-colors"
              onClick={() => setShowOtherMentors(true)}
            >
              View Other Mentors
            </button>
          )}
          {showOtherMentors && (
            <button
              className="mt-6 px-6 py-2 bg-gray-200 text-teal-700 rounded-lg font-semibold shadow hover:bg-gray-300 transition-colors"
              onClick={() => setShowOtherMentors(false)}
            >
              Back to Core Mentors
            </button>
          )}
        </motion.div>

        <div className="space-y-12">
          {(showOtherMentors ? otherMentors : coreMentors).map((mentor, index) => (
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