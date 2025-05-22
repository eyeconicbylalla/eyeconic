import React from 'react';
import HeroSection from '../components/sections/HeroSection';
import FeatureSection from '../components/sections/FeatureSection';
import TestimonialSection from '../components/sections/TestimonialSection';
import TimelineSection from '../components/sections/TimelineSection';
import WhyItMattersSection from '../components/sections/WhyItMattersSection';
import OfferingsSection from '../components/sections/OfferingsSection';
import CTASection from '../components/sections/CTASection';
import CountdownTimer from '../components/sections/CountdownTimer';
import CoursesSection from '../components/sections/CoursesSection';
import MentorsSection from '../components/sections/MentorsSection';
import FAQSection from '../components/sections/FAQSection';

const Home: React.FC = () => {
  return (
    <>
      <HeroSection />
      <FeatureSection />
      <TestimonialSection />
      <CountdownTimer />
      <TimelineSection />
      <WhyItMattersSection />
      <CoursesSection />
      <MentorsSection />
      <OfferingsSection />
      <FAQSection />
      <CTASection />
    </>
  );
};

export default Home;