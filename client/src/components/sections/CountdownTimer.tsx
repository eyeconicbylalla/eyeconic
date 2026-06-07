import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

// Set your next batch start date/time here (e.g., 7 days from now)
const NEXT_BATCH_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

function getTimeLeft() {
  const now = new Date();
  const diff = NEXT_BATCH_DATE.getTime() - now.getTime();
  const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  const hours = Math.max(0, Math.floor((diff / (1000 * 60 * 60)) % 24));
  const minutes = Math.max(0, Math.floor((diff / (1000 * 60)) % 60));
  const seconds = Math.max(0, Math.floor((diff / 1000) % 60));
  return { days, hours, minutes, seconds };
}

const CountdownTimer: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="py-16 bg-[#101720] border-y border-white/[0.06]">
      <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex-grow text-white mb-8 md:mb-0">
          <h2 className="text-2xl md:text-3xl font-bold mb-2 text-white">Next Batch Starting Soon</h2>
          <p className="text-lg mb-6 text-[#94A3B8] max-w-lg">Limited spots available for our upcoming intensive mentorship program. Secure your place today!</p>
          <a href="#contact" className="btn btn-primary">Join Now</a>
        </div>
        <div className="flex-shrink-0 flex flex-col items-center bg-[#18222E] border border-white/[0.06] rounded-2xl p-8 shadow-card-dark min-w-[320px]">
          <div className="flex items-center mb-5">
            <Clock className="text-[#18B6A4] mr-2" size={20} />
            <span className="text-[#CBD5E1] font-semibold text-lg">Enrollment Closes In:</span>
          </div>
          <div className="flex space-x-4">
            <div className="flex flex-col items-center">
              <span className="bg-[#0A0F14] border border-white/[0.04] text-[#4DD7C8] font-bold text-3xl md:text-4xl px-4 py-3 rounded-xl min-w-[65px] text-center shadow-inner tabular-nums">{String(timeLeft.days).padStart(2, '0')}</span>
              <span className="text-[#94A3B8] mt-2.5 text-xs font-semibold tracking-widest">DAYS</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="bg-[#0A0F14] border border-white/[0.04] text-[#4DD7C8] font-bold text-3xl md:text-4xl px-4 py-3 rounded-xl min-w-[65px] text-center shadow-inner tabular-nums">{String(timeLeft.hours).padStart(2, '0')}</span>
              <span className="text-[#94A3B8] mt-2.5 text-xs font-semibold tracking-widest">HOURS</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="bg-[#0A0F14] border border-white/[0.04] text-[#4DD7C8] font-bold text-3xl md:text-4xl px-4 py-3 rounded-xl min-w-[65px] text-center shadow-inner tabular-nums">{String(timeLeft.minutes).padStart(2, '0')}</span>
              <span className="text-[#94A3B8] mt-2.5 text-xs font-semibold tracking-widest">MINS</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="bg-[#0A0F14] border border-white/[0.04] text-[#4DD7C8] font-bold text-3xl md:text-4xl px-4 py-3 rounded-xl min-w-[65px] text-center shadow-inner tabular-nums">{String(timeLeft.seconds).padStart(2, '0')}</span>
              <span className="text-[#94A3B8] mt-2.5 text-xs font-semibold tracking-widest">SECS</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CountdownTimer;
