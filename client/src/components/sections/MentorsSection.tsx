import React from 'react';
import { motion } from 'framer-motion';
import lalla from '../../assets/DR LALLA.png';
import chandan from '../../assets/Chandan.png';
import vishwas_arora from '../../assets/vishwas_arora.png';
// import manvika_tiwari from '../../assets/manvika tiwari.png';
import michelle from '../../assets/michelle.png';
import jwalant_chag from '../../assets/Jwalant.png'; // Add the image to your assets folder


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
    id: 'mr-chandan',
    name: 'Mr. Chandan',
    title: 'Operations In-Charge | Senior Advisor | Mentor to the Mentors',
    description: 'With over four decades of leadership experience as the Senior Vice President at UTI Mutual Fund, Mr. Chandan brings a legacy of discipline, foresight, and operational excellence to Eyeconic.',
    longDescription: `Having led high-stakes financial operations at one of India's premier institutions, Mr. Chandan is no stranger to performance under pressure. His experience in managing teams, streamlining workflows, and ensuring consistent output is now being channelled into building one of the most efficient and student-centered academic ops teams in the country.

At Eyeconic, he works directly with Dr. Gourav Lalla bringing structure, guidance, and the calm confidence of a seasoned veteran to every decision made.`,
    specialties: [
      'Decades of top-tier operational leadership',
      'A mentor\'s mindset with a strategist\'s clarity',
      'Systems thinking, process optimization, and people management mastery',
      'A calming presence and decision-making wisdom in high-pressure scenarios',
      'Hands-on involvement in scaling the Eyeconic vision without losing the personal touch'
    ],
    quote: "The right structure unlocks the highest potential. At Eyeconic, we're not just managing operations—we're nurturing future doctors, and that deserves excellence at every level.",
    image: chandan
  },
  {
  id: 'dr-vishwas-arora',
  name: 'Dr. Vishwas Arora',
  title: 'Internal Medicine Resident | Mentor',
  description: 'Dr. Vishwas Arora is a Internal Medicine resident at KB Bhabha Hospital Mumbai and a gold-medalist Best MBBS graduate with honours across multiple subjects.',
  longDescription: `Dr. Arora began his medical journey at JNIMS Imphal in 2017, consistently ranking at the top of his class and earning the Best MBBS Graduate Award. He graduated with honours in Pathology, Microbiology, Pharmacology, Community Medicine, and Medicine, along with distinctions in Forensic Medicine & Toxicology and Obstetrics & Gynaecology.

After completing his internship, he commenced NEET-PG preparation in 2023 under the guidance of DAMS and Dr. Gourav Lalla. Their exceptional mentorship, constant motivation, and unwavering support propelled him to secure a rank of 996 in INICET (November) and 6027 in NEET-PG 2024. Today, he channels that same dedication into mentoring the next generation of medical aspirants.`,
  quote: "Guidance coupled with dedication turns ambition into achievement.",
  image:vishwas_arora
},
// {
//   id: 'dr-manvika-tiwari',
//   name: 'Dr. Manvika Tiwari',
//   title: 'DNB Internal Medicine Resident | Mentor',
//   description: 'Dr. Manvika Tiwari is a DNB Internal Medicine resident and NEET PG achiever who brings firsthand insight into overcoming the challenges of competing from a private medical college.',
//   longDescription: `After cracking NEET PG, Dr. Manvika Tiwari embarked on her DNB journey in Internal Medicine. Having graduated MBBS from a private institution herself, she knows the extra hurdles aspirants face when vying for top institutions. Through her own experience with Eyeconic’s strategic academic planning and confidence-building approach, she transformed doubt into determination.

// As a mentor, she’s dedicated to sharing her hard-earned knowledge and practical strategies—guiding mentees step-by-step, offering moral support, and tailoring advice to individual strengths. Dr. Tiwari’s empathy, coupled with her proven study frameworks, ensures students not only achieve their target ranks but also grow in resilience and self-belief throughout their preparation.`,
//   quote: "With the right plan and support, every challenge becomes an opportunity.",
//   image:manvika_tiwari
// },
{
  id: 'dr-michelle',
  name: 'Dr. Michelle',
  title: 'MD Paediatrics Resident | Mentor',
  description: 'Dr. Michelle is an MD Paediatrics candidate at GMCH Chandigarh whose early fascination with the human body led her to clear NEET-UG in her first attempt and earn her MBBS from GMC Nahan with distinction.',
  longDescription: `Balancing academics with a vibrant array of extracurriculars, Dr. Michelle’s journey has always been “learning through practice.” In her initial MBBS years, she focused on strategic observation; in the latter half, she honed her clinical skills and mastered core medical texts guided by hands-on experience. Near the end of her final year, she earned her IAP-BLS certification and graduated with distinction in multiple subjects, including Paediatrics.

After MBBS, she served as a non-academic junior resident in the Department of Medicine, where her dedication and patient care were highly appreciated—fueling her decision to pursue postgraduate studies. Outside the hospital, Dr. Michelle is formally trained in Indian classical dance and stays balanced through adventure sports like diving, kayaking, trekking, ziplining, and camping. On quieter days, she channels her creativity into painting.

Starting NEET-PG prep in July 2023, she built a strong foundation in basic sciences and past-year question analysis under mentors like Dr. Zainab Vora and Dr. Gourav Lalla. Her perseverance paid off with a NEET-PG 2024 rank of 4703. Driven by a passion for paediatric care and a desire to empower others, she now dedicates herself to guiding early-career aspirants through the challenges of medical entrance exams.`,
  quote: "Learning through practice transforms knowledge into healing.",
  image: michelle
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
            Behind every successful NEET PG aspirant is a team of dedicated mentors. <br/> Meet the experts who will guide you through your journey.
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