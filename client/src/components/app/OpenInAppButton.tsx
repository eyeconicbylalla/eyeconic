import React, { useState } from 'react';
import { Smartphone } from 'lucide-react';
import { canOpenAppLinks, openInApp, type AppDestination } from '../../lib/appLinks';

/**
 * "Open in App" affordance for mobile browsers. Desktop browsers never see
 * it (custom schemes are meaningless there). If the app isn't installed the
 * user stays on the web page, which carries the same content.
 */
const OpenInAppButton: React.FC<{ destination: AppDestination; className?: string; label?: string }> = ({
  destination,
  className = '',
  label = 'Open in App',
}) => {
  const [hint, setHint] = useState(false);
  if (!canOpenAppLinks()) return null;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => {
          setHint(false);
          openInApp(destination, () => setHint(true));
        }}
        className={`btn btn-outline text-sm px-4 py-2 ${className}`}
      >
        <Smartphone size={16} className="mr-2" />
        {label}
      </button>
      {hint && (
        <span className="text-xs text-[#94A3B8] max-w-[16rem]">
          App not detected — make sure Eyeconic is installed, or continue here on the web.
        </span>
      )}
    </span>
  );
};

export default OpenInAppButton;
