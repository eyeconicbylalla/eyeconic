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
    <section className="py-16 bg-gradient-to-r from-teal-500 to-blue-400">
      <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex-1 text-white mb-8 md:mb-0">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">Next Batch Starting Soon</h2>
          <p className="text-lg mb-4 text-teal-50 max-w-lg">Limited spots available for our upcoming intensive mentorship program. Secure your place today!</p>
          <a href="#contact" className="inline-block bg-white text-teal-600 font-semibold px-6 py-3 rounded-md shadow hover:bg-teal-50 transition">Join Now</a>
        </div>
        <div className="flex-1 flex flex-col items-center bg-white/20 rounded-xl p-8 shadow-lg min-w-[320px]">
          <div className="flex items-center mb-4">
            <Clock className="text-white mr-2" />
            <span className="text-white font-semibold text-lg">Enrollment Closes In:</span>
          </div>
          <div className="flex space-x-4">
            <div className="flex flex-col items-center">
              <span className="bg-white text-teal-600 font-bold text-3xl px-4 py-2 rounded-md min-w-[60px] text-center">{String(timeLeft.days).padStart(2, '0')}</span>
              <span className="text-white mt-2 text-xs font-medium tracking-wide">DAYS</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="bg-white text-teal-600 font-bold text-3xl px-4 py-2 rounded-md min-w-[60px] text-center">{String(timeLeft.hours).padStart(2, '0')}</span>
              <span className="text-white mt-2 text-xs font-medium tracking-wide">HOURS</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="bg-white text-teal-600 font-bold text-3xl px-4 py-2 rounded-md min-w-[60px] text-center">{String(timeLeft.minutes).padStart(2, '0')}</span>
              <span className="text-white mt-2 text-xs font-medium tracking-wide">MINUTES</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="bg-white text-teal-600 font-bold text-3xl px-4 py-2 rounded-md min-w-[60px] text-center">{String(timeLeft.seconds).padStart(2, '0')}</span>
              <span className="text-white mt-2 text-xs font-medium tracking-wide">SECONDS</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CountdownTimer;
