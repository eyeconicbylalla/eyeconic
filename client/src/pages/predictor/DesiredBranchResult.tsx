import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Award, Check, ChevronDown, Copy, Info, Layers, Sparkles, User, Zap,
} from 'lucide-react';
import type { DesiredBranchResponse as DesiredData } from '../../types/predictor';
import {
  ASSUMPTION_TEXT, DESIRED_WARNING_SHORT, DISCLAIMER_NOTE, DUPLICATED_ENGINE_NOTES, EXAM_LABELS,
  GAP_META, TARGET_COVERAGE_TEXT,
} from './constants';
import { fmtRank, yearFilterLabel } from './format';
import { useCountUp } from './useCountUp';

/**
 * Desired Branch Predictor — the designed result view (DBP §8 Phase 6):
 * branch → the rank it historically took (per-cycle table + D1 range) →
 * required corrects (safe/likely ends, bounded states honest) → the D7 gap
 * panel. Same result-page grammar as the forward ResultView (hero cards with
 * axis bars + count-up, one disclaimer, short inline cautions, one
 * collapsible methodology) and the same honesty rules: ranges never points,
 * bounded ends say so, no confidence percentages (§11/§14).
 */

const logPos = (value: number, min: number, max: number): number => {
  if (value <= min) return 0;
  if (value >= max) return 100;
  return ((Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 100;
};

const fmtCorrects = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('en-IN');

/** Cycle label: "Jan 2025" for INI-CET sessions, "2025" for NEET PG years. */
const cycleLabel = (year: number, session?: string) =>
  session ? yearFilterLabel(Number(session.replace('-', ''))) : yearFilterLabel(year);

// ---- hero cards -----------------------------------------------------------------

const TargetRankCard: React.FC<{ res: DesiredData }> = ({ res }) => {
  const t = res.result.target;
  const isIniCet = res.result.exam === 'INI_CET';
  const [tight, loose] = t.targetRankRange ?? [null, null];
  const animTight = useCountUp(tight, 900);
  const animLoose = useCountUp(loose, 1100);

  // Log axis anchored to the range itself (same honesty rule as the forward
  // RankCard: communicates relative width, claims no external scale).
  const axisMax = loose ?? (tight ? tight * 2 : null);
  const segLeft = tight && axisMax ? logPos(tight, 1, axisMax) : 0;
  const segWidth = axisMax ? Math.max(2, 100 - segLeft) : 0;

  const source = isIniCet
    ? `AIIMS counselling · ${t.years.length} sessions`
    : `MCC counselling ${t.dataCoverage.years.join(' · ')}`;

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-[#94A3B8] text-xs uppercase tracking-wider">The rank it historically took</div>
        <span className="shrink-0 text-[11px] text-[#94A3B8] border border-white/10 rounded-full px-2.5 py-1">
          {source}
        </span>
      </div>
      <div className="text-3xl md:text-4xl font-bold text-[#F8FAFC] tabular-nums" data-testid="desired-target-rank">
        {fmtRank(animTight === null ? null : Math.max(1, Math.round(animTight)))}{' '}
        <span className="text-[#4DD7C8] font-semibold">–</span>{' '}
        {fmtRank(
          animLoose === null
            ? null
            : Math.max(animTight === null ? 1 : Math.round(animTight), Math.round(animLoose))
        )}
      </div>
      <div className="mt-5" aria-hidden="true">
        <div className="relative h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          {axisMax ? (
            <>
              <div
                className="absolute inset-y-0 bg-gradient-to-r from-[#18B6A4]/70 to-[#4DD7C8] rounded-r-full"
                style={{ left: `${segLeft}%`, width: `${segWidth}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-1 rounded-full bg-[#F8FAFC]"
                style={{ left: `${Math.min(97, (segLeft + segWidth) / 2)}%` }}
              />
            </>
          ) : (
            <div
              className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-[#18B6A4]/60 via-[#18B6A4]/25 to-transparent"
              style={{ left: `${segLeft}%` }}
            />
          )}
        </div>
      </div>
      {/* D2 consequence, surfaced: a branch-only range spans institutes — the
          ends NAME the institutes that produced them. */}
      <div className="text-[11px] text-[#94A3B8] mt-2 space-y-0.5">
        {t.tightest ? (
          <p className="truncate" title={t.tightest.institute}>
            Tightest: {t.tightest.institute} ({cycleLabel(t.tightest.year, t.tightest.session)})
          </p>
        ) : null}
        {t.loosest ? (
          <p className="truncate" title={t.loosest.institute}>
            Loosest: {t.loosest.institute} ({cycleLabel(t.loosest.year, t.loosest.session)})
          </p>
        ) : null}
      </div>
      <p className="text-xs text-[#94A3B8] mt-3 flex items-start gap-1.5">
        <Info size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" />
        {TARGET_COVERAGE_TEXT[t.coverage] ?? ''} Final state of counselling (end of all rounds).
      </p>
    </div>
  );
};

const RequiredCard: React.FC<{ res: DesiredData }> = ({ res }) => {
  const r = res.result;
  const required = r.required;
  const safe = required?.perClosing[0];
  const likely = required?.perClosing[1];
  const isIniCet = r.exam === 'INI_CET';

  // Hooks before any early return (rules-of-hooks); null targets no-op.
  const animSafe = useCountUp(safe?.corrects ?? null, 1100);
  const animLikely = useCountUp(likely?.corrects ?? null, 900);

  if (!required) return null;

  // Corrects live on their true axis — the exam pattern's question count
  // (180 for NEET PG, 200 for INI-CET), from the result's pattern echo.
  const total = r.method.pattern?.totalQuestions ?? (isIniCet ? 200 : 180);
  const lo = likely?.corrects ?? null;
  const hi = safe?.corrects ?? null;
  const left = lo === null ? 0 : Math.max(0, (lo / total) * 100);
  const width = hi === null ? Math.max(2, 100 - left) : Math.max(0.75, ((hi - (lo ?? 0)) / total) * 100);

  const source = isIniCet
    ? `Crowd ladder (UR-only) · ${required.prior?.points ?? 7} points`
    : 'Official NBEMS score↔rank data';

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-[#94A3B8] text-xs uppercase tracking-wider">Corrects to aim for</div>
        <span className="shrink-0 text-[11px] text-[#94A3B8] border border-white/10 rounded-full px-2.5 py-1">
          {source}
        </span>
      </div>
      <div className="text-3xl md:text-4xl font-bold text-[#F8FAFC] tabular-nums" data-testid="desired-required-corrects">
        {hi === null ? (
          <span className="text-2xl md:text-3xl">beyond the data</span>
        ) : (
          <>≈ {fmtCorrects(Math.round(animSafe ?? 0))}</>
        )}
        <span className="text-[#94A3B8] text-lg font-medium"> safe end</span>
      </div>
      <p className="text-sm text-[#CBD5E1] mt-1 tabular-nums">
        {lo === null ? '—' : `≈ ${fmtCorrects(Math.round(animLikely ?? 0))}`}{' '}
        <span className="text-[#94A3B8] text-xs">historically enough (likely end)</span>
      </p>
      <div className="mt-5" aria-hidden="true">
        <div className="relative h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={`absolute inset-y-0 rounded-full bg-gradient-to-r from-[#18B6A4]/70 to-[#4DD7C8] ${
              hi === null ? 'rounded-r-none' : ''
            }`}
            style={{
              left: `${left}%`,
              width: `${width}%`,
              ...(hi === null
                ? { background: 'linear-gradient(to right, rgba(24,182,164,0.6), transparent)' }
                : {}),
            }}
          />
          {hi !== null ? (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-1 rounded-full bg-[#F8FAFC]"
              style={{ left: `${Math.min(99, left + width / 2)}%` }}
            />
          ) : null}
        </div>
        <div className="flex justify-between text-[11px] text-[#94A3B8] mt-1.5">
          <span>0</span>
          <span>{Math.round(total / 2)}</span>
          <span>{total}</span>
        </div>
      </div>
      <p className="text-xs text-[#94A3B8] mt-3 flex items-start gap-1.5">
        <Info size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" />
        The safe end clears even the tightest closing on record; the likely end cleared the loosest.
        Rounding is always upward — fractional corrects are never shown as achievable.
      </p>
      {/* bounded ends carry their statements (never silently dropped) */}
      {required.perClosing
        .filter((e) => e.note)
        .map((e) => (
          <p
            key={e.closing}
            className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl px-3 py-2"
          >
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {e.note}
          </p>
        ))}
    </div>
  );
};

// ---- gap panel (D7) --------------------------------------------------------------

const GapPanel: React.FC<{ res: DesiredData; onBack: () => void }> = ({ res, onBack }) => {
  const r = res.result;
  if (!r.gap) return null;
  const meta = GAP_META[r.gap.status] ?? GAP_META.NO_CURRENT_DATA;
  const gapSafe = r.gap.gapToSafe;
  const gapLikely = r.gap.gapToLikely;

  const gapSentence = (delta: number | null, end: 'safe' | 'likely', bounded: boolean) => {
    if (delta === null) {
      return bounded
        ? `The ${end} end is beyond what the data can state — no number is invented for it.`
        : null;
    }
    const abs = Math.abs(delta).toLocaleString('en-IN');
    const sign = delta >= 0 ? 'ahead by' : 'to go to';
    const target = end === 'safe' ? 'the safe end' : 'the likely end';
    return `${sign} ≈ ${abs} corrects ${delta >= 0 ? `(${target} cleared)` : `(${target})`}`;
  };

  return (
    <div
      className={`mt-4 rounded-2xl border px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs ${meta.panel}`}
      data-anim="fade-up"
      role="status"
    >
      <span className="inline-flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
      {r.current ? (
        <span>
          Your average: <strong className="tabular-nums">{fmtCorrects(r.current.meanCorrects)}</strong>{' '}
          corrects across {r.current.aggregation.n} Grand Test
          {r.current.aggregation.n === 1 ? '' : 's'}
        </span>
      ) : null}
      {gapSentence(gapLikely, 'likely', r.gap.bounded.likely) ? <span>{gapSentence(gapLikely, 'likely', r.gap.bounded.likely)}</span> : null}
      {gapSentence(gapSafe, 'safe', r.gap.bounded.safe) ? <span>{gapSentence(gapSafe, 'safe', r.gap.bounded.safe)}</span> : null}
      <span className="w-full sm:w-auto text-[11px] opacity-80">{meta.hint}</span>
      {r.gap.status === 'NO_CURRENT_DATA' ? (
        <button type="button" onClick={onBack} className="btn btn-outline text-xs px-3 py-1.5 w-full sm:w-auto">
          <ArrowLeft size={12} className="mr-1.5" /> Add your Grand Tests
        </button>
      ) : null}
    </div>
  );
};

// ---- per-cycle closing table ------------------------------------------------------

const CycleTable: React.FC<{ res: DesiredData }> = ({ res }) => {
  const t = res.result.target;
  const isIniCet = res.result.exam === 'INI_CET';
  const cycleWord = isIniCet ? 'Session' : 'Year';
  const rows = t.years;

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 mt-4" data-anim="fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-[#F8FAFC]">Closing ranks by {cycleWord.toLowerCase()}</h3>
        <span className="text-[11px] text-[#94A3B8]">Final state of counselling</span>
      </div>
      <p className="text-xs text-[#94A3B8] mb-4">
        Each {cycleWord.toLowerCase()} below is one counselling cycle. Cutoffs move every year — this is
        the spread your target range comes from.
      </p>

      {/* desktop table */}
      <table className="hidden sm:table w-full text-xs">
        <thead>
          <tr className="text-left text-[#94A3B8] border-b border-white/[0.06]">
            <th className="py-2 pr-3 font-medium">{cycleWord}</th>
            <th className="py-2 pr-3 font-medium">Closing rank</th>
            <th className="py-2 pr-3 font-medium">Tightest institute</th>
            <th className="py-2 font-medium">Groups</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((y) => (
            <tr key={y.year} className="border-b border-white/[0.04] last:border-0">
              <td className="py-2.5 pr-3 text-[#CBD5E1] whitespace-nowrap">{cycleLabel(y.year, y.session)}</td>
              <td className="py-2.5 pr-3 tabular-nums text-[#F8FAFC]">
                {y.matched ? `${fmtRank(y.closingMin)} – ${fmtRank(y.closingMax)}` : y.present ? '— no data for your selection' : 'not offered'}
              </td>
              <td className="py-2.5 pr-3 text-[#94A3B8]">
                {y.tightest ? (
                  <span className="block truncate max-w-[16rem]" title={y.tightest.institute}>
                    {y.tightest.institute}
                  </span>
                ) : '—'}
              </td>
              <td className="py-2.5 tabular-nums text-[#94A3B8]">{y.matched ? y.groups : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* mobile cards */}
      <div className="sm:hidden space-y-2">
        {rows.map((y) => (
          <div key={y.year} className="bg-[#151E29] border border-white/[0.06] rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#CBD5E1]">{cycleLabel(y.year, y.session)}</span>
              <span className="text-sm font-semibold text-[#F8FAFC] tabular-nums">
                {y.matched ? `${fmtRank(y.closingMin)} – ${fmtRank(y.closingMax)}` : y.present ? '—' : 'not offered'}
              </span>
            </div>
            {y.tightest ? (
              <p className="text-[11px] text-[#94A3B8] mt-1 truncate" title={y.tightest.institute}>
                Tightest: {y.tightest.institute} · {y.matched ? `${y.groups} groups` : ''}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

// ---- methodology ------------------------------------------------------------------

const DesiredMethodology: React.FC<{ res: DesiredData }> = ({ res }) => {
  const [open, setOpen] = useState(false);
  const r = res.result;
  const isIniCet = r.exam === 'INI_CET';

  const notes = useMemo(() => {
    const seen = new Set<string>();
    const collect = (list: string[]) =>
      list.filter((note) => {
        if (DUPLICATED_ENGINE_NOTES.includes(note) || seen.has(note)) return false;
        seen.add(note);
        return true;
      });
    return [
      ...collect(r.target.notes || []),
      ...(r.required ? collect(r.required.notes || []) : []),
      ...collect((r.warnings || []).map((w) => w.note)),
    ];
  }, [r]);

  const assumptions = (r.method.assumptions || [])
    .map((id) => ASSUMPTION_TEXT[id])
    .filter((text): text is string => Boolean(text));

  const cycles = r.target.years.map((y) => cycleLabel(y.year, y.session)).join(' · ');

  return (
    <div className="bg-[#151E29] border border-white/[0.06] rounded-2xl mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="desired-methodology"
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-[#CBD5E1]">
          <Layers size={15} className="text-[#4DD7C8]" /> How this target was worked out
        </span>
        <ChevronDown
          size={16}
          className={`text-[#94A3B8] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        id="desired-methodology"
        role="region"
        aria-label="Methodology and data coverage"
        hidden={!open}
        data-fade
        className="px-5 pb-5 pt-1 border-t border-white/[0.06]"
      >
        <div className="pt-4 space-y-4 text-xs text-[#94A3B8]">
          {assumptions.length ? (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] mb-2">Assumptions</p>
              <ul className="space-y-1.5">
                {assumptions.map((text) => (
                  <li key={text} className="flex items-start gap-2">
                    <span aria-hidden="true" className="text-[#4DD7C8] mt-px">•</span> {text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] mb-2">Data this ran against</p>
            <ul className="space-y-1.5">
              <li>Counselling closings: {isIniCet ? 'AIIMS' : 'MCC'} final-state closing ranks ({cycles}).</li>
              {r.required?.distribution ? (
                <li>Rank → required score: official NBEMS {isIniCet ? '' : '2025 '}score↔rank data, worst-case tie handled conservatively.</li>
              ) : null}
              {r.required?.prior ? (
                <li>
                  Rank → required marks: a crowd-sourced ladder (Dr Mayukh Hazra compilations, UR-only) —
                  AIIMS publishes no INI-CET marks, so this step is an estimate with no official ground
                  truth.
                </li>
              ) : null}
              {r.current ? (
                <li>Current average: mean of your Grand Test scores, one value per test (latest completed attempt).</li>
              ) : null}
            </ul>
          </div>
          {notes.length ? (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] mb-2">Notes &amp; limitations</p>
              <ul className="space-y-1.5">
                {notes.map((note) => (
                  <li key={note} className="flex items-start gap-2">
                    <Info size={12} className="mt-0.5 shrink-0 text-[#4DD7C8]" /> {note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-[11px] text-[#94A3B8] pt-1 border-t border-white/[0.06]">
            {EXAM_LABELS[r.exam] ?? r.exam} · every lookup is saved so its usefulness can be measured once
            real outcomes are shared.
          </p>
        </div>
      </div>
    </div>
  );
};

// ---- the view ----------------------------------------------------------------------

const DesiredBranchResult: React.FC<{ res: DesiredData; onBack: () => void }> = ({ res, onBack }) => {
  const r = res.result;
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const skippedWarning = r.warnings.find((w) => w.code === 'NO_SKIP_ASSUMPTION_WEAKENED');
  const inlineWarnings = r.warnings.filter(
    (w) => w.code !== 'NO_SKIP_ASSUMPTION_WEAKENED' && w.code !== 'LOW_GT_COUNT'
  );

  const shareText = () => {
    const safe = r.required?.perClosing[0]?.corrects ?? null;
    const likely = r.required?.perClosing[1]?.corrects ?? null;
    return [
      `Eyeconic Desired Branch — ${r.input.branch.display} (${EXAM_LABELS[r.exam] ?? r.exam}, ${r.input.category.value}${r.input.category.pwd ? ' PwD' : ''})`,
      `Historical closing rank: ${fmtRank(r.target.targetRankRange?.[0] ?? null)} – ${fmtRank(r.target.targetRankRange?.[1] ?? null)}`,
      safe !== null ? `Aim for ≈ ${safe} corrects (safe end)` : 'Safe end: beyond the data',
      likely !== null ? `Historically enough: ≈ ${likely} corrects` : '',
      r.current && r.gap && r.gap.status !== 'NO_CURRENT_DATA'
        ? `My average: ${fmtCorrects(r.current.meanCorrects)} corrects — ${GAP_META[r.gap.status]?.label ?? r.gap.status}`
        : '',
      'Historical estimate — cutoffs move every year.',
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
        await navigator.share({ title: 'My target branch', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // user dismissed the share sheet, or clipboard denied — silent by design
    }
  };

  // §9 case 2: branch exists but nothing closed for this category × PwD.
  if (r.target.coverage === 'NO_DATA_FOR_FILTER') {
    return (
      <div data-anim="fade">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <button type="button" onClick={onBack} className="btn btn-outline text-sm px-4 py-2">
            <ArrowLeft size={14} className="mr-1.5" /> Pick another branch
          </button>
        </div>
        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 text-center" data-anim="fade-up">
          <AlertTriangle size={22} className="text-amber-300 mx-auto mb-3" />
          <h2 className="font-semibold text-[#F8FAFC] mb-1">{r.input.branch.display}</h2>
          <p className="text-sm text-[#94A3B8] mb-4 max-w-md mx-auto">
            This branch appears in the counselling records, but nothing closed under{' '}
            {r.input.category.value}
            {r.input.category.pwd ? ' (PwD)' : ''} in the covered{' '}
            {r.exam === 'INI_CET' ? 'sessions' : 'years'}. Check the category — it is never assumed
            for you.
          </p>
          <div className="text-xs text-[#94A3B8] mb-4">
            Covered: {r.target.years.map((y) => cycleLabel(y.year, y.session)).join(' · ')}
          </div>
          <button type="button" onClick={onBack} className="btn btn-outline text-sm px-4 py-2">
            <ArrowLeft size={14} className="mr-1.5" /> Back to inputs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-anim="fade">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <button type="button" onClick={onBack} className="btn btn-outline text-sm px-4 py-2">
          <ArrowLeft size={14} className="mr-1.5" /> Pick another branch
        </button>
        <button type="button" onClick={share} className="btn btn-outline text-sm px-4 py-2">
          {copied ? (
            <>
              <Check size={14} className="mr-1.5 text-[#4DD7C8]" /> Copied
            </>
          ) : (
            <>
              <Copy size={14} className="mr-1.5" /> Share target
            </>
          )}
        </button>
      </div>

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-xl md:text-2xl font-bold text-[#F8FAFC] mb-1 outline-none"
      >
        {r.input.branch.display}
      </h2>
      <p className="text-sm text-[#94A3B8] mb-5">
        {EXAM_LABELS[r.exam] ?? r.examLabel} · {r.input.category.value}
        {r.input.category.pwd ? ' (PwD)' : ''} · {r.input.quotaLabel}
      </p>

      <div className="relative" data-stagger>
        <div
          aria-hidden="true"
          className="absolute -top-10 left-1/2 -translate-x-1/2 w-[420px] h-[220px] rounded-full bg-[#18B6A4]/10 blur-3xl pointer-events-none hidden md:block"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
          <TargetRankCard res={res} />
          <RequiredCard res={res} />
        </div>
      </div>

      <GapPanel res={res} onBack={onBack} />

      {/* §14: the disclaimer, visible with the results — exactly once */}
      <p className="text-xs text-[#94A3B8] mt-3 flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" /> Historical closing ranks move
        every year — this is a planning target, not a promise. {DISCLAIMER_NOTE}
      </p>

      {skippedWarning ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {skippedWarning.note}
        </p>
      ) : null}

      {inlineWarnings.map((w) => (
        <p
          key={w.code}
          className="mt-3 flex items-start gap-2 text-xs text-[#CBD5E1] bg-[#151E29] border border-white/[0.08] rounded-xl p-3"
        >
          <Sparkles size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" />{' '}
          {DESIRED_WARNING_SHORT[w.code] ?? w.note}
        </p>
      ))}

      <CycleTable res={res} />

      {/* current GTs, provenance-tagged (mirrors the forward "What went in") */}
      {r.current ? (
        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 mt-4" data-anim="fade-up">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Where you are now</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {r.current.gts.map((gt, i) => (
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
              </span>
            ))}
          </div>
          <p className="text-xs text-[#94A3B8]">
            Average used: <strong className="text-[#CBD5E1]">{fmtCorrects(r.current.meanCorrects)}</strong>{' '}
            corrects across {r.current.aggregation.n} Grand Test{r.current.aggregation.n === 1 ? '' : 's'}
            {r.current.aggregation.lowDataCaution ? ' — few GTs, so treat the gap as rough' : ''}.
          </p>
        </div>
      ) : (
        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mt-4 text-center" data-anim="fade-up">
          <Award size={22} className="text-[#4DD7C8] mx-auto mb-3" />
          <h3 className="font-semibold text-[#F8FAFC] mb-1">Want the gap to this target?</h3>
          <p className="text-sm text-[#94A3B8] mb-4 max-w-md mx-auto">
            Add your recent Grand Test corrects and run this again — you will see how far the safe
            and likely ends are from your current average.
          </p>
          <button type="button" onClick={onBack} className="btn btn-outline text-sm px-4 py-2">
            <ArrowLeft size={14} className="mr-1.5" /> Add your Grand Tests
          </button>
        </div>
      )}

      <DesiredMethodology res={res} />
    </div>
  );
};

export default DesiredBranchResult;
