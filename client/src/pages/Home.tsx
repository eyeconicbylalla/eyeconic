import React from 'react';
import HeroSection from '../components/sections/HeroSection';
// import FeatureSection from '../components/sections/FeatureSection';
import FeaturesShowcaseSection from '../components/sections/FeaturesShowcaseSection';
import TestimonialSection from '../components/sections/TestimonialSection';
import TimelineSection from '../components/sections/TimelineSection';
// import WhyItMattersSection from '../components/sections/WhyItMattersSection';
// import OfferingsSection from '../components/sections/OfferingsSection';
import CTASection from '../components/sections/CTASection';
import CountdownTimer from '../components/sections/CountdownTimer';
import CoursesSection from '../components/sections/CoursesSection';
import MentorsSection from '../components/sections/MentorsSection';
import ResultsCarouselSection from '../components/sections/ResultsCarouselSection';
import VideosSection from '../components/sections/VideosSection';
import FAQSection from '../components/sections/FAQSection';
import BlogsSection from '../components/sections/BlogsSection';

const Home: React.FC = () => {
  return (
    <>
      <HeroSection />
      {/* <FeatureSection /> */}
      <FeaturesShowcaseSection />
      <TestimonialSection />
      <ResultsCarouselSection />
      <VideosSection />
      <CountdownTimer />
      <TimelineSection />
      {/* <WhyItMattersSection /> */}
      <CoursesSection />
      <MentorsSection />
      {/* <OfferingsSection /> */}
      <BlogsSection />
      <FAQSection />
      <CTASection />
    </>
  );
};

export default Home;