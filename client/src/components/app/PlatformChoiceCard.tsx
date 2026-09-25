import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Compass, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import {
  isPlatformChoiceUnavailable,
  platformChoice,
  platformChoiceErrorMessage,
} from '../../lib/platformChoiceClient';
import type { PlatformChoiceContext } from '../../types/platformChoice';

/**
 * Student Dashboard Platform Choice card (Feature 06): invites the student to
 * the recommender and surfaces their latest saved recommendation. The scoring,
 * platform catalog and outbound links all live on the server — this card only
 * navigates. Load errors stay inside the card and never hide the dashboard.
 */
const PlatformChoiceCard: React.FC = () => {
  const [context, setContext] = useState<PlatformChoiceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setUnavailable(false);
    try {
      setContext(await platformChoice.context());
    } catch (err) {
      setError(platformChoiceErrorMessage(err, 'Could not load the Platform Choice recommender.'));
      setUnavailable(isPlatformChoiceUnavailable(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 sm:p-6 mb-8 h-28 animate-pulse flex items-center justify-center">
        <Loader2 size={20} className="text-[#18B6A4] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dark-banner-error flex items-center gap-3 text-sm mb-8">
        <AlertTriangle size={16} className="shrink-0" />
        <span className="flex-1">
          {error}
          {unavailable && (
            <span className="block text-xs mt-0.5 opacity-80">
              The Eyeconic service may be waking up — this can take up to a minute.
            </span>
          )}
        </span>
        <button onClick={() => load()} className="btn btn-outline text-xs px-3 py-1.5 shrink-0">
          <RefreshCw size={13} className="mr-1.5" /> Retry
        </button>
      </div>
    );
  }

  const latest = context?.latest ?? null;
  const top = latest && latest.tiers.length > 0 ? latest.tiers[0] : null;
  const prefillNote = context?.miniCct
    ? 'Your latest Mini CCT will pre-fill subject and concept signals.'
    : 'Take a Mini CCT first to sharpen your subject & concept matching.';

  return (
    <div className="bg-[#18222E] border border-[#18B6A4]/25 rounded-2xl p-5 sm:p-6 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2 text-lg">
            <Compass size={18} className="text-[#4DD7C8]" /> Platform Choice
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#18B6A4]/15 text-[#4DD7C8] border border-[#18B6A4]/25">
              Recommender
            </span>
          </h3>
          {top && top.platformName ? (
            <p className="text-sm text-[#94A3B8] mt-1.5">
              Last recommended for you:{' '}
              <span className="text-[#4DD7C8] font-medium">{top.platformName}</span>
              {typeof top.matchScore === 'number' && (
                <span className="text-[#94A3B8]"> · {top.matchScore}% match</span>
              )}
              <span className="block text-xs text-[#94A3B8]/80 mt-0.5">
                Re-run any time — inputs update with your latest results.
              </span>
            </p>
          ) : (
            <p className="text-sm text-[#94A3B8] mt-1.5">
              Answer 6 quick questions — get your 3 best-fit prep platforms with reasons.{' '}
              <span className="block text-xs text-[#94A3B8]/80 mt-0.5">{prefillNote}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link to="/platform-choice" className="btn btn-primary text-sm px-4 py-2">
            <Sparkles size={15} className="mr-2" />
            {top ? 'View / Re-run' : 'Find My Platform'}
            <ArrowRight size={14} className="ml-1.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PlatformChoiceCard;
