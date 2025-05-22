import React from 'react';
import { motion } from 'framer-motion';

const timelineItems = [
	{
		year: '2018',
		title: 'The Genesis',
		description:
			'Eyeconic by Dr. Lalla was born out of a simple yet powerful insight: every topper\'s journey is unique — and so is every student\'s struggle.',
	},
	{
		year: '2020',
		title: 'Beyond Courses',
		description:
			'What started as a mentoring initiative quickly evolved into something more profound: a movement more than a brand, a community more than a course.',
	},
	{
		year: '2022',
		title: 'Personalized Approach',
		description:
			'We realized that generic preparation strategies were failing countless brilliant minds. Medical students needed guidance that understood their individual learning patterns, strengths, and areas for improvement.',
	},
	{
		year: 'Today',
		title: 'A Thriving Community',
		description:
			'Today, Eyeconic represents personalized excellence in NEET PG preparation, with thousands of successful doctors who credit their journey to our mentorship.',
	},
];

const TimelineSection: React.FC = () => {
	return (
		<section id="about" className="py-20 bg-white">
			<div className="container mx-auto px-4">
				<div className="section-title">
					<motion.h2
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.6 }}
					>
						Our Story
					</motion.h2>
					<motion.p
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.6, delay: 0.2 }}
					>
						Eyeconic by Dr. Lalla was born out of a simple yet powerful insight:
						every topper's journey is unique — and so is every student's struggle.
					</motion.p>
				</div>
				<div className="relative flex flex-col items-center mt-16">
					{/* Timeline Line */}
					<div className="absolute left-1/2 top-0 bottom-0 w-1 bg-teal-200 -translate-x-1/2 z-0"></div>
					{/* Timeline Items */}
					{timelineItems.map((item, index) => (
						<div
							key={index}
							className="w-full flex flex-col md:flex-row items-center mb-16 relative z-10"
						>
							{/* Left side (even index) */}
							<div
								className={`md:w-1/2 ${
									index % 2 === 0 ? 'md:pr-12 md:text-right' : ''
								} hidden md:block`}
							>
								{index % 2 === 0 && (
									<>
										<h3 className="text-lg md:text-xl font-bold text-blue-900 mb-2">
											{item.title}
										</h3>
										<p className="text-gray-700 font-semibold">
											{item.description}
										</p>
									</>
								)}
							</div>
							{/* Year Circle */}
							<div className="flex flex-col items-center md:w-0 w-full mb-4 md:mb-0">
								<div className="flex items-center justify-center w-12 h-12 bg-blue-800 text-white rounded-full font-bold text-lg border-4 border-white shadow-md">
									{item.year}
								</div>
							</div>
							{/* Right side (odd index) */}
							<div
								className={`md:w-1/2 ${
									index % 2 !== 0 ? 'md:pl-12 md:text-left' : ''
								} hidden md:block`}
							>
								{index % 2 !== 0 && (
									<>
										<h3 className="text-lg md:text-xl font-bold text-blue-900 mb-2">
											{item.title}
										</h3>
										<p className="text-gray-700 font-semibold">
											{item.description}
										</p>
									</>
								)}
							</div>
							{/* Mobile: always show content below year */}
							<div className="w-full md:hidden text-center mt-4">
								<h3 className="text-lg md:text-xl font-bold text-blue-900 mb-2">
									{item.title}
								</h3>
								<p className="text-gray-700 font-semibold">
									{item.description}
								</p>
							</div>
						</div>
					))}
				</div>
				<div className="mt-12 text-center">
					<span className="text-blue-800 text-xl italic font-semibold">
						"A movement more than a brand, a community more than a course."
					</span>
				</div>
			</div>
			<section
				id="about-eyeconic"
				className="py-20 bg-teal-50 border-b border-teal-100"
			>
				<div className="container mx-auto px-4">
					<motion.h2
						className="text-3xl md:text-4xl font-bold text-teal-700 mb-6 text-center"
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.6 }}
					>
						About Eyeconic
					</motion.h2>
					<motion.p
						className="text-lg md:text-xl  mb-8 text-center max-w-3xl mx-auto"
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.6, delay: 0.2 }}
					>
						Eyeconic isn’t just another mentorship program—it's a movement
						redefining how medical aspirants achieve their dreams. Founded and
						passionately led by Dr. Gourav Lalla, Eyeconic is dedicated to
						transforming the journey of NEET PG aspirants through personalized
						mentorship, focused preparation, and unparalleled support.
					</motion.p>
					<div className="grid md:grid-cols-2 gap-8 items-start max-w-4xl mx-auto">
						<div>
							<h3 className="text-xl font-semibold  mb-4">
								Our Mission
							</h3>
							<p className="text-teal-900 mb-6">
								To empower medical students to not just crack NEET PG, but to
								excel beyond their own expectations. We believe every medical
								student deserves guidance that's structured, strategic, and
								personalized.
							</p>
							<h3 className="text-xl font-semibold  mb-4">
								What Makes Eyeconic Truly ICONIC?
							</h3>
							<ul className="list-disc pl-5 space-y-2 ">
								<li>
									<span className="font-bold">Personalized Mentorship:</span>{' '}
									Tailored guidance that adapts to your learning style, strengths,
									and areas needing attention.
								</li>
								<li>
									<span className="font-bold">Strategic Preparation:</span>{' '}
									Step-by-step approach ensuring comprehensive coverage, smart
									revisions, and consistent improvement.
								</li>
								<li>
									<span className="font-bold">Interactive Community:</span>{' '}
									A vibrant, engaging, and supportive peer group led by motivated
									mentors.
								</li>
								<li>
									<span className="font-bold">Result-driven Approach:</span>{' '}
									Proven methodologies that focus on performance tracking,
									analysis, and continuous feedback.
								</li>
							</ul>
						</div>
						<div className="bg-white rounded-xl shadow-md p-6 border border-teal-100">
							<h3 className="text-xl font-semibold  mb-2">
								Meet Our Founder: Dr. Gourav Lalla
							</h3>
							<p className="text-teal-900 mb-4">
								Dr. Gourav Lalla is not only an accomplished ophthalmology resident
								but also a highly sought-after mentor known for his energetic,
								strategic, and relatable teaching style. His deep understanding of
								NEET PG intricacies, combined with his genuine passion for
								mentoring, has transformed the lives of hundreds of medical
								students across India.
							</p>
							<p className=" mb-6">
								With a thriving community of aspiring doctors on platforms like
								YouTube and Instagram, Dr. Lalla continues to inspire students
								daily, helping them navigate their medical journeys with confidence
								and clarity.
							</p>
							<p className=" font-semibold mb-6">
								At Eyeconic, your dreams are our mission—and together, success
								isn’t just probable; it's inevitable.
							</p>
							<a
								href="#about"
								className="inline-block mt-2 px-6 py-2 bg-teal-600 text-white rounded-lg font-semibold shadow hover:bg-teal-700 transition-colors"
							>
								More About Dr. Lalla
							</a>
						</div>
					</div>
				</div>
			</section>
		</section>
	);
};

export default TimelineSection;