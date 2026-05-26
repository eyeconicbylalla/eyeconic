import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

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
	const sectionRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const section = sectionRef.current;
		if (!section) return;

		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduceMotion) return;

		const ctx = gsap.context(() => {
			gsap.utils.toArray<HTMLElement>('.story-timeline-card').forEach((card) => {
				const side = card.dataset.side === 'left' ? -1 : 1;

				gsap.from(card, {
					x: side * 80,
					opacity: 0,
					duration: 0.9,
					ease: 'power2.out',
					scrollTrigger: {
						trigger: card,
						start: 'top 82%',
						toggleActions: 'play none none reverse',
					},
				});
			});

			gsap.fromTo(
				'.story-timeline-line-fill',
				{ scaleY: 0 },
				{
					scaleY: 1,
					ease: 'none',
					scrollTrigger: {
						trigger: '.story-timeline',
						start: 'top 68%',
						end: 'bottom 48%',
						scrub: true,
					},
				}
			);

			gsap.utils.toArray<HTMLElement>('.story-timeline-marker').forEach((marker) => {
				gsap.from(marker, {
					scale: 0.75,
					opacity: 0,
					duration: 0.55,
					ease: 'back.out(1.8)',
					scrollTrigger: {
						trigger: marker,
						start: 'top 82%',
						toggleActions: 'play none none reverse',
					},
				});
			});

			gsap.utils.toArray<HTMLElement>('.story-timeline-item').forEach((item) => {
				ScrollTrigger.create({
					trigger: item,
					start: 'top center',
					end: 'bottom center',
					toggleClass: { targets: item, className: 'is-active' },
				});
			});
		}, section);

		return () => ctx.revert();
	}, []);

	return (
		<section id="about" ref={sectionRef} className="py-20 bg-white">
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
				<div className="story-timeline relative mx-auto mt-16 max-w-5xl">
					<div
						className="absolute left-6 top-0 h-full w-1 rounded-full bg-teal-100 shadow-[0_0_18px_rgba(20,184,166,0.35)] md:left-1/2 md:w-px"
						aria-hidden="true"
					>
						<div className="story-timeline-line-fill absolute inset-x-0 top-0 h-full origin-top rounded-full bg-gradient-to-b from-teal-300 via-cyan-300 to-blue-700 shadow-[0_0_28px_rgba(34,211,238,0.65)] md:from-teal-400 md:via-blue-700 md:to-teal-500 md:shadow-[0_0_24px_rgba(20,184,166,0.35)]" />
					</div>

					{timelineItems.map((item, index) => (
						<div
							key={index}
							className="story-timeline-item relative z-10 grid gap-6 pb-14 pl-16 md:grid-cols-[1fr_5rem_1fr] md:items-center md:gap-8 md:pl-0"
						>
							<div className="hidden md:block">
								{index % 2 === 0 ? (
									<article
										className="story-timeline-card rounded-lg border border-teal-100 bg-white p-6 text-right shadow-sm"
										data-side="left"
									>
										<p className="story-timeline-card__year mb-3 text-sm font-bold uppercase tracking-wide">
											{item.year}
										</p>
										<h3 className="story-timeline-card__title mb-3 text-xl font-bold">
											{item.title}
										</h3>
										<p className="story-timeline-card__description text-sm font-semibold leading-7">
											{item.description}
										</p>
									</article>
								) : null}
							</div>
							<div className="story-timeline-marker absolute left-0 top-1 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white text-sm font-bold shadow-md md:static md:h-16 md:w-20 md:text-lg">
								<span>
									{item.year}
								</span>
							</div>
							<div>
								{index % 2 !== 0 ? (
									<article
										className="story-timeline-card rounded-lg border border-teal-100 bg-white p-6 text-left shadow-sm"
										data-side="right"
									>
										<p className="story-timeline-card__year mb-3 text-sm font-bold uppercase tracking-wide">
											{item.year}
										</p>
										<h3 className="story-timeline-card__title mb-3 text-xl font-bold">
											{item.title}
										</h3>
										<p className="story-timeline-card__description text-sm font-semibold leading-7">
											{item.description}
										</p>
									</article>
								) : (
									<article
										className="story-timeline-card rounded-lg border border-teal-100 bg-white p-6 text-left shadow-sm md:hidden"
										data-side="right"
									>
										<p className="story-timeline-card__year mb-3 text-sm font-bold uppercase tracking-wide">
											{item.year}
										</p>
										<h3 className="story-timeline-card__title mb-3 text-xl font-bold">
											{item.title}
										</h3>
										<p className="story-timeline-card__description text-sm font-semibold leading-7">
											{item.description}
										</p>
									</article>
								)}
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
						<div className="mt-5">
							<h3 className="text-xl font-semibold mb-4 md:text-center">Our Mission</h3>
							<p className="text-teal-900 mb-6 md:text-center">
								To empower medical students to not just crack NEET PG, but to
								excel beyond their own expectations. We believe every medical
								student deserves guidance that's structured, strategic, and
								personalized.
							</p>
							<h3 className="text-xl font-semibold mb-4 md:text-center">
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
						<div className="bg-white rounded-xl shadow-md p-6 border border-teal-100 flex flex-col h-full">
							<h3 className="text-xl font-semibold mb-2 md:text-center">
								Meet Our Founder: Dr. Gourav Lalla
							</h3>
							<p className="text-teal-900 mb-4 md:text-center">
								Dr. Gourav Lalla is not only an accomplished ophthalmology resident
								but also a highly sought-after mentor known for his energetic,
								strategic, and relatable teaching style. His deep understanding of
								NEET PG intricacies, combined with his genuine passion for
								mentoring, has transformed the lives of hundreds of medical
								students across India.
							</p>
							<p className="mb-6 md:text-center">
								With a thriving community of aspiring doctors on platforms like
								YouTube and Instagram, Dr. Lalla continues to inspire students
								daily, helping them navigate their medical journeys with confidence
								and clarity.
							</p>
							<p className="font-semibold mb-6 md:text-center">
								At Eyeconic, your dreams are our mission—and together, success
								isn’t just probable; it's inevitable.
							</p>
							<a
								href="#mentors"
								className="inline-block mt-2 px-6 py-2 bg-teal-600 text-white rounded-lg font-semibold shadow hover:bg-teal-700 transition-colors md:self-center"
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
