import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Award, Check, Copy, Info, Sparkles, User, Zap } from 'lucide-react';
import type { PredictionResult } from '../../types/predictor';
import RangeHero from './RangeHero';
import MethodologySection from './MethodologySection';
import BranchResults from './BranchResults';
import OutcomeCard from './OutcomeCard';
import { DISCLAIMER_NOTE, WARNING_SHORT, isBranchSummary } from './constants';
import { fmtPct, fmtRank } from './format';

/**
 * P1 — the result experience, rebuilt around the ranges. Order follows spec
 * §13 (ranges → aggregation summary → coverage → methodology → confidence →
 * branches); the disclaimer renders exactly once, coverage chips sit inside
 * the hero cards, and the deep methodology lives in one collapsible section.
 * Self-contained: branch browsing + outcome capture fetch their own data via
 * the stored predictionId, so this view renders fresh predictions AND history
 * records identically.
 */
const ResultView: React.FC<{
  result: PredictionResult;
  predictionId?: string;
  onBack: () => void;
  backLabel?: string;
  integrityWarning?: boolean;
  /** History records are stored snapshots — "predict again with a category" advice doesn't apply. */
  readonly?: boolean;
}> = ({ result, predictionId, onBack, backLabel = 'Edit GTs & predict again', integrityWarning = false, readonly = false }) => {
  const { estimate, rank, aggregation } = result;
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [copied, setCopied] = useState(false);

  // P4: move focus to the result heading so keyboard/SR users land somewhere
  // meaningful after the view swap.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const skippedWarning = estimate.warnings.find((w) => w.code === 'NO_SKIP_ASSUMPTION_WEAKENED');
  const inlineWarnings = estimate.warnings.filter(
    (w) => w.code !== 'NO_SKIP_ASSUMPTION_WEAKENED' && w.code !== 'LOW_GT_COUNT'
  );

  const branchSummary = isBranchSummary(result.branches) ? result.branches : null;

  const shareText = () => {
    const examName = result.exam === 'INI_CET' ? 'INI-CET' : 'NEET PG';
    return [
      `Eyeconic Rank Predictor — ${examName}`,
      `Estimated percentile: ${fmtPct(estimate.percentile.range[0])} – ${fmtPct(estimate.percentile.range[1])}`,
      `Predicted AIR: ${fmtRank(rank.bestRank)} – ${fmtRank(rank.worstRank, rank.beyondLastRecordedRank)}`,
      `Based on ${aggregation.n} Grand Test${aggregation.n === 1 ? '' : 's'}`,
      'Estimate based on historical data — actual results may vary.',
      typeof window !== 'undefined' ? `${window.location.origin}/predictor` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const share = async () => {
    const text = shareText();
    setCopied(false);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My predicted rank range', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // user dismissed the share sheet, or clipboard denied — silent by design
    }
  };

  return (
    <div data-anim="fade">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <button type="button" onClick={onBack} className="btn btn-outline text-sm px-4 py-2">
          <ArrowLeft size={14} className="mr-1.5" /> {backLabel}
        </button>
        <button type="button" onClick={share} className="btn btn-outline text-sm px-4 py-2">
          {copied ? (
            <>
              <Check size={14} className="mr-1.5 text-[#4DD7C8]" /> Copied
            </>
          ) : (
            <>
              <Copy size={14} className="mr-1.5" /> Share result
            </>
          )}
        </button>
      </div>

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-xl md:text-2xl font-bold text-[#F8FAFC] mb-4 outline-none"
      >
        Your predicted range
      </h2>

      <RangeHero result={result} />

      {/* §14: the disclaimer, visible with the results — exactly once */}
      <p className="text-xs text-[#94A3B8] mt-3 flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" /> {DISCLAIMER_NOTE}
      </p>

      {integrityWarning ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          This stored prediction failed its integrity check — the numbers below are what was served,
          but the record has changed since. Please treat it with caution.
        </p>
      ) : null}

      {skippedWarning ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {skippedWarning.note}
        </p>
      ) : null}

      {/* short, in-context cautions (full text lives in Methodology) */}
      {inlineWarnings.map((w) => (
        <p
          key={w.code}
          className="mt-3 flex items-start gap-2 text-xs text-[#CBD5E1] bg-[#151E29] border border-white/[0.08] rounded-xl p-3"
        >
          <Sparkles size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" />{' '}
          {WARNING_SHORT[w.code] ?? w.note}
        </p>
      ))}

      {/* §13 aggregation summary: the individual GTs, provenance-tagged */}
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 mt-4" data-anim="fade-up">
        <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">What went in</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {result.input.gts.map((gt, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 border ${
                gt.provenance === 'auto-captured'
                  ? 'bg-[#18B6A4]/15 text-[#4DD7C8] border-[#18B6A4]/30'
                  : 'bg-white/[0.04] text-[#CBD5E1] border-white/10'
              }`}
              title={gt.provenance === 'auto-captured' ? 'Filled from your Eyeconic quiz attempts' : 'Typed by you'}
            >
              {gt.provenance === 'auto-captured' ? <Zap size={11} /> : <User size={11} />}
              GT {i + 1}: <strong>{gt.selected?.corrects ?? '—'}</strong> corrects
              {gt.excluded.length ? (
                <span className="text-[#94A3B8]">({gt.excluded.length} older skipped)</span>
              ) : null}
            </span>
          ))}
        </div>
        <p className="text-xs text-[#94A3B8]">
          Average used: <strong className="text-[#CBD5E1]">{aggregation.mean}</strong> corrects across{' '}
          {aggregation.n} Grand Test{aggregation.n === 1 ? '' : 's'}.
        </p>
      </div>

      <div className="mt-4">
        <MethodologySection result={result} />
      </div>

      <div className="mt-6">
        {branchSummary ? (
          predictionId ? (
            <BranchResults predictionId={predictionId} summary={branchSummary} result={result} />
          ) : (
            <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 text-center text-sm text-[#94A3B8]">
              Branch results for this stored prediction are not available.
            </div>
          )
        ) : (
          <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 text-center" data-anim="fade-up">
            <Award size={22} className="text-[#4DD7C8] mx-auto mb-3" />
            <h3 className="font-semibold text-[#F8FAFC] mb-1">Want possible branches too?</h3>
            {readonly ? (
              <p className="text-sm text-[#94A3B8] mb-4 max-w-md mx-auto">
                This prediction was made without a category, so it covers rank only — exactly as it
                was served.
              </p>
            ) : (
              <>
                <p className="text-sm text-[#94A3B8] mb-4 max-w-md mx-auto">
                  Category is needed to match counselling cutoffs — it is never assumed. Tap “{backLabel}”
                  above, pick your category, and run the prediction once more.
                </p>
                <button type="button" onClick={onBack} className="btn btn-outline text-sm px-4 py-2">
                  <ArrowLeft size={14} className="mr-1.5" /> Back to inputs
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* §15/§18 10a+10b: consent-based outcome capture, reachable from the result */}
      {predictionId ? <OutcomeCard predictionId={predictionId} result={result} /> : null}
    </div>
  );
};

export default ResultView;
