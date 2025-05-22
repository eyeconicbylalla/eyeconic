import React from 'react';
import { Eye } from 'lucide-react';

const Logo: React.FC = () => {
  return (
    <a href="#" className="flex items-center">
      <div className="relative w-8 h-8 mr-2">
        <Eye className="absolute text-teal-400" size={32} />
        <div className="absolute top-0 left-0 w-8 h-8 border-2 border-navy-900 rounded-full"></div>
      </div>
      <span className="text-navy-900 font-bold text-xl">EYE-CONIC</span>
    </a>
  );
};

export default Logo;