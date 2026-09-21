import React from 'react';
import { Info, Sparkles } from 'lucide-react';
import type { PredictionResult } from '../../types/predictor';
import { fmtPct, fmtRank, sessionLabel } from './format';
import { RANK_COVERAGE_TEXT, TRANSFER_PLAIN } from './constants';
import { useCountUp } from './useCountUp';

/**
 * P1 — the hero of the result page: the two predicted ranges with a real
 * visualization. Percentile sits on its true 0–100 axis; the rank interval is
 * drawn on a log axis anchored to the range itself (widths honest, no invented
 * external scale). Numbers reveal with a count-up that lands on the exact
 * stored value.
 */

const logPos = (value: number, min: number, max: number): number => {
  if (value <= min) return 0;
  if (value >= max) return 100;
  return ((Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 100;
};

const PercentileCard: React.FC<{ result: PredictionResult }> = ({ result }) => {
  const [lo, hi] = result.estimate.percentile.range;
  const animLo = useCountUp(lo, 900);
  const animHi = useCountUp(hi, 1100);
  const left = Math.max(0, Math.min(100, lo));
  const width = Math.max(0.75, Math.min(100 - left, hi - lo)); // ≥0.75% so a tight range stays visible
  const isIniCet = result.exam === 'INI_CET';
  const source = isIniCet
    ? `Official AIIMS ${result.rank.session ? sessionLabel(Number(result.rank.session.replace('-', ''))) : result.rank.examYear} results`
    : `Official NEET PG ${result.rank.examYear} results`;

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 relative overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-[#94A3B8] text-xs uppercase tracking-wider">Estimated percentile</div>
        <span className="shrink-0 text-[11px] text-[#94A3B8] border border-white/10 rounded-full px-2.5 py-1">
          {source}
        </span>
      </div>
      <div className="text-3xl md:text-4xl font-bold text-[#F8FAFC] tabular-nums" data-testid="percentile-range">
        {fmtPct(animLo)} <span className="text-[#4DD7C8] font-semibold">–</span> {fmtPct(animHi)}
      </div>
      {/* true 0–100 axis */}
      <div className="mt-5" aria-hidden="true">
        <div className="relative h-2.5 rounded-full bg-white/[0.06]">
          <div
            className="absolute inset-y-0 rounded-full bg-gradient-to-r from-[#18B6A4]/70 to-[#4DD7C8]"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-1 rounded-full bg-[#F8FAFC]"
            style={{ left: `${(left + width) / 2}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-[#94A3B8] mt-1.5">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
      <p className="text-xs text-[#94A3B8] mt-3 flex items-start gap-1.5">
        <Info size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" />
        {RANK_COVERAGE_TEXT[result.estimate.percentile.coverage] ?? ''}
      </p>
    </div>
  );
};

const RankCard: React.FC<{ result: PredictionResult }> = ({ result }) => {
  const { rank } = result;
  const isIniCet = result.exam === 'INI_CET';
  const animBest = useCountUp(rank.bestRank, 900);
  const animWorst = useCountUp(rank.worstRank, 1100);
  const beyond = rank.beyondLastRecordedRank;

  // Ranks start at 1 and the interval must stay monotonic mid-animation.
  const bestDisplay =
    rank.bestRank === null ? null : Math.max(1, Math.round(animBest));
  const worstDisplay =
    rank.worstRank === null
      ? null
      : Math.max(bestDisplay ?? 1, Math.round(animWorst));

  // Log axis anchored to the interval itself: communicates relative width and
  // center honestly without claiming an external scale.
  const axisMax = rank.worstRank ?? (rank.bestRank ? rank.bestRank * 2 : null);
  const segLeft = rank.bestRank && axisMax ? logPos(rank.bestRank, 1, axisMax) : 0;
  const segWidth = axisMax ? Math.max(2, 100 - segLeft) : 0;

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-[#94A3B8] text-xs uppercase tracking-wider">
          Predicted AIR ·{' '}
          {isIniCet
            ? `INI-CET ${rank.session ? sessionLabel(Number(rank.session.replace('-', ''))) : rank.examYear} session`
            : `NEET PG ${rank.examYear}`}
        </div>
        <span className="shrink-0 text-[11px] text-[#94A3B8] border border-white/10 rounded-full px-2.5 py-1">
          All India Rank
        </span>
      </div>
      <div className="text-3xl md:text-4xl font-bold text-[#F8FAFC] tabular-nums" data-testid="rank-range">
        {fmtRank(bestDisplay)} <span className="text-[#4DD7C8] font-semibold">–</span> {fmtRank(worstDisplay, beyond)}
      </div>
      <div className="mt-5" aria-hidden="true">
        <div className="relative h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          {axisMax ? (
            <div
              className="absolute inset-y-0 bg-gradient-to-r from-[#18B6A4]/70 to-[#4DD7C8] rounded-r-full"
              style={{ left: `${segLeft}%`, width: `${segWidth}%` }}
            />
          ) : (
            <div
              className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-[#18B6A4]/60 via-[#18B6A4]/25 to-transparent"
              style={{ left: `${segLeft}%` }}
            />
          )}
          {axisMax ? (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-1 rounded-full bg-[#F8FAFC]"
              style={{ left: `${Math.min(97, (segLeft + segWidth) / 2)}%` }}
            />
          ) : null}
        </div>
      </div>
      <p className="text-xs text-[#94A3B8] mt-3 flex items-start gap-1.5">
        <Info size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" />
        {RANK_COVERAGE_TEXT[rank.coverage] ?? ''}
      </p>
      {beyond === null ? null : (
        <p className="text-[11px] text-[#94A3B8] mt-1.5">
          Cautious end beyond the last recorded rank ({beyond.toLocaleString('en-IN')}).
        </p>
      )}
    </div>
  );
};

const RangeHero: React.FC<{ result: PredictionResult }> = ({ result }) => {
  const { estimate, aggregation } = result;
  const lowData = aggregation.lowDataCaution;

  return (
    <div className="relative" data-stagger>
      {/* brand glow behind the hero (decorative, palette-native) */}
      <div
        aria-hidden="true"
        className="absolute -top-10 left-1/2 -translate-x-1/2 w-[420px] h-[220px] rounded-full bg-[#18B6A4]/10 blur-3xl pointer-events-none hidden md:block"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
        <PercentileCard result={result} />
        <RankCard result={result} />
      </div>

      {/* range-width context (§11: width must be visible; 1-GT looks less confident) */}
      <div
        className={`relative mt-4 rounded-2xl border px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs ${
          lowData
            ? 'bg-amber-500/[0.07] border-amber-500/25 text-amber-200'
            : 'bg-[#18222E] border-white/[0.06] text-[#94A3B8]'
        }`}
      >
        <span>
          Based on <strong className="text-[#F8FAFC]">{aggregation.n}</strong>{' '}
          {aggregation.n === 1 ? 'Grand Test' : 'Grand Tests'} · range ±
          {estimate.performance.halfWidthCorrects} marks
        </span>
        <span>GT spread (SD): {estimate.performance.dispersion.sdCorrects}</span>
        <span className="max-w-full">{TRANSFER_PLAIN[result.exam] ?? ''}</span>
        {lowData ? (
          <span className="inline-flex items-center gap-1.5 w-full sm:w-auto">
            <Sparkles size={12} /> Add more GTs for a narrower, more reliable estimate.
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default RangeHero;
