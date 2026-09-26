import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, ChevronDown, Clock, ExternalLink,
  Info, Layers, User, Zap,
} from 'lucide-react';
import type { ReadinessAnchor, ReadinessResponse } from '../../types/readiness';
import { fmtRank } from '../predictor/format';
import { EXAM_LABELS, RANK_COVERAGE_TEXT } from '../predictor/constants';
import {
  ANCHOR_META, READINESS_WARNING_SHORT, STATE_META, examDateLabel,
  fmtNum, sessionLabel,
} from './constants';

/**
 * Readiness Score result (Feature 09, spec §17.4): the state hero, then — in
 * the priority order the product owner set — why the state was given (current
 * performance vs the target bar vs the time budget), the student's standing
 * today, the anchor ladder for context, the exam-date card, and the caveats.
 * Every number and every threshold shown here is server-derived; this view
 * only formats and arranges them.
 */

/** Corrects display: integers stay integers, fractional means keep 1 decimal. */
const fmtCorrects = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  return Number.isInteger(n) ? n.toLocaleString('en-IN') : (Math.round(n * 10) / 10).toLocaleString('en-IN');
};

const examLabelFor = (exam: string, fallback: string): string => EXAM_LABELS[exam] ?? fallback;

// ---- the state hero ----------------------------------------------------------------

const StateHero: React.FC<{ res: ReadinessResponse }> = ({ res }) => {
  const { result: r } = res;
  const meta = STATE_META[r.state];
  const Icon = r.state === 'READY' ? CheckCircle2 : r.state === 'MODERATELY_READY' ? Clock : AlertTriangle;

  return (
    <div
      className={`rounded-2xl border p-6 sm:p-8 relative overflow-hidden ${meta.panel}`}
      data-anim="fade-up"
      data-testid="readiness-state"
    >
      <div
        aria-hidden="true"
        className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/[0.04] blur-3xl pointer-events-none"
      />
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider opacity-90">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
          Readiness Score
        </span>
        <span className="opacity-70">·</span>
        <span>{examLabelFor(r.exam, r.examLabel)}</span>
        <span className="opacity-70">·</span>
        <span>Target: {ANCHOR_META[r.target.id]?.label ?? r.target.id}</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Icon size={34} className="shrink-0" aria-hidden="true" />
        <h2 className="text-3xl md:text-4xl font-bold" data-testid="readiness-state-label">
          {meta.label}
        </h2>
        {r.gap.significantGap ? (
          <span className="text-[10px] uppercase tracking-wide text-rose-200 bg-rose-500/20 border border-rose-400/30 rounded-full px-2.5 py-1">
            Significant gap
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm md:text-base max-w-2xl">{r.explanation.stateLine}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className={`text-xs rounded-full px-3 py-1.5 border ${meta.chip}`}>
          {r.explanation.timeRemainingText} left
        </span>
        <span className="text-xs rounded-full px-3 py-1.5 border border-white/15 bg-white/[0.04]">
          Budget: {r.gap.budget} corrects
        </span>
        <span
          className={`text-xs rounded-full px-3 py-1.5 border ${
            r.calendar.status === 'announced'
              ? 'border-white/15 bg-white/[0.04]'
              : 'border-amber-400/40 bg-amber-500/10 text-amber-100'
          }`}
        >
          {examLabelFor(r.exam, r.examLabel)} {sessionLabel(r.calendar.session)} ·{' '}
          {r.calendar.status === 'announced' ? 'announced' : 'expected date'}
        </span>
      </div>
    </div>
  );
};

// ---- why: performance vs target vs budget ------------------------------------------

const StatTile: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode }> = ({
  label,
  value,
  sub,
}) => (
  <div className="bg-[#151E29] border border-white/[0.06] rounded-xl p-4">
    <div className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1.5">{label}</div>
    <div className="text-xl font-bold text-[#F8FAFC] tabular-nums">{value}</div>
    {sub ? <div className="text-[11px] text-[#94A3B8] mt-1">{sub}</div> : null}
  </div>
);

const WhyPanel: React.FC<{ res: ReadinessResponse }> = ({ res }) => {
  const { result: r } = res;
  const { gap, target } = r;
  const cleared = gap.gapCorrects <= 0;

  // Visual scale: the gap drawn against the budget (both server values). The
  // bar communicates relative size only — no new threshold is introduced.
  const span = Math.max(gap.gapCorrects, gap.budget, 1);
  const gapPct = Math.max(1.5, Math.min(100, (Math.max(gap.gapCorrects, 0) / span) * 100));
  const budgetPct = Math.max(1.5, Math.min(100, (gap.budget / span) * 100));

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6" data-anim="fade-up">
      <h3 className="text-sm font-semibold text-[#F8FAFC] mb-1">Why this state</h3>
      <p className="text-xs text-[#94A3B8] mb-4">
        Your average Grand Test performance against the corrects the target historically took — judged
        against what the remaining time plausibly improves.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Your average"
          value={`${fmtCorrects(gap.meanCorrects)} corrects`}
          sub={`out of ${r.method.pattern.totalQuestions} · ${r.input.aggregation.n} Grand Test${
            r.input.aggregation.n === 1 ? '' : 's'
          }`}
        />
        <StatTile
          label="The bar"
          value={`${fmtCorrects(target.requiredCorrects)} corrects`}
          sub={`last UR seat — AIR ${fmtRank(target.rank)}`}
        />
        <StatTile
          label="Gap"
          value={
            cleared ? (
              <span className="text-emerald-300">{fmtCorrects(-gap.gapCorrects)} ahead</span>
            ) : (
              <span className="text-amber-300">{fmtCorrects(gap.gapCorrects)} to go</span>
            )
          }
          sub={cleared ? 'target already cleared' : 'corrects still missing'}
        />
        <StatTile
          label="Time budget"
          value={`${gap.budget} corrects`}
          sub={`${r.explanation.timeRemainingText} of preparation`}
        />
      </div>

      <div className="mt-5" aria-hidden="true">
        <div className="flex justify-between text-[11px] text-[#94A3B8] mb-1.5">
          <span>Gap vs what the remaining time plausibly improves</span>
        </div>
        <div className="relative h-3 rounded-full bg-white/[0.06] overflow-hidden">
          {cleared ? (
            <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-emerald-500/50 to-emerald-400/20" />
          ) : (
            <>
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500/80 to-amber-400"
                style={{ width: `${gapPct}%` }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-[#F8FAFC]"
                style={{ left: `calc(${budgetPct}% - 1px)` }}
              />
            </>
          )}
        </div>
        <div className="flex justify-between text-[11px] text-[#94A3B8] mt-1.5">
          <span>{cleared ? 'target cleared' : `gap: ${fmtCorrects(gap.gapCorrects)} corrects`}</span>
          <span>
            {cleared ? '' : `budget: ${gap.budget} corrects`}
            {gap.capped ? ' (9-month cap applied)' : ''}
          </span>
        </div>
      </div>

      <p className="mt-4 text-xs text-[#CBD5E1] bg-[#151E29] border border-white/[0.06] rounded-xl px-3 py-2.5 tabular-nums">
        {gap.budgetArithmetic}
      </p>
      <p className="mt-2 flex items-start gap-2 text-xs text-[#94A3B8]">
        <Info size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" />
        {r.method.timeAllowance.note}
      </p>
    </div>
  );
};

// ---- standing today (same card grammar as the predictor result) ----------------------

const PercentileCard: React.FC<{ res: ReadinessResponse }> = ({ res }) => {
  const { standing } = res.result;
  const [lo, hi] = standing.percentile.range;
  const left = Math.max(0, Math.min(100, lo));
  const width = Math.max(0.75, Math.min(100 - left, hi - lo));

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-[#94A3B8] text-xs uppercase tracking-wider">Percentile today</div>
        <span className="shrink-0 text-[11px] text-[#94A3B8] border border-white/10 rounded-full px-2.5 py-1">
          {res.result.method.pattern.totalQuestions}-question pattern
        </span>
      </div>
      <div className="text-2xl md:text-3xl font-bold text-[#F8FAFC] tabular-nums">
        {lo.toFixed(1)}% <span className="text-[#4DD7C8] font-semibold">–</span> {hi.toFixed(1)}%
      </div>
      <div className="mt-4" aria-hidden="true">
        <div className="relative h-2.5 rounded-full bg-white/[0.06]">
          <div
            className="absolute inset-y-0 rounded-full bg-gradient-to-r from-[#18B6A4]/70 to-[#4DD7C8]"
            style={{ left: `${left}%`, width: `${width}%` }}
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
        {RANK_COVERAGE_TEXT[standing.percentile.coverage] ?? standing.percentile.coverage}
      </p>
    </div>
  );
};

const RankCard: React.FC<{ res: ReadinessResponse }> = ({ res }) => {
  const { standing } = res.result;
  const rank = standing.rank;

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-[#94A3B8] text-xs uppercase tracking-wider">Projected AIR today</div>
        <span className="shrink-0 text-[11px] text-[#94A3B8] border border-white/10 rounded-full px-2.5 py-1">
          {res.result.exam === 'INI_CET'
            ? `AIIMS ${rank.session ? sessionLabel(rank.session) : rank.examYear} results`
            : `NEET PG ${rank.examYear} results`}
        </span>
      </div>
      <div className="text-2xl md:text-3xl font-bold text-[#F8FAFC] tabular-nums">
        {fmtRank(rank.bestRank)} <span className="text-[#4DD7C8] font-semibold">–</span>{' '}
        {fmtRank(rank.worstRank, rank.beyondLastRecordedRank)}
      </div>
      <p className="text-xs text-[#CBD5E1] mt-2">
        at roughly {fmtCorrects(standing.meanCorrects)} corrects ≈ {fmtNum(standing.projectedScore)} marks
      </p>
      <p className="text-xs text-[#94A3B8] mt-3 flex items-start gap-1.5">
        <Info size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" />
        {RANK_COVERAGE_TEXT[rank.coverage] ?? rank.coverage}
      </p>
    </div>
  );
};

// ---- anchor ladder -------------------------------------------------------------------

/** Short plain-language provenance line for an anchor's source block. */
function anchorSourceLabel(anchor: ReadinessAnchor): string {
  if (anchor.source.kind === 'distribution') return 'Official 2025 result distribution';
  if (anchor.source.kind === 'counselling') {
    return anchor.source.snapshotIds
      ? 'AIIMS counselling · last 4 sessions'
      : `MCC counselling ${anchor.source.examYear ?? ''}`.trim();
  }
  return 'Official counselling data';
}

const AnchorLadder: React.FC<{ res: ReadinessResponse }> = ({ res }) => {
  const { result: r } = res;

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 sm:p-6" data-anim="fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-[#F8FAFC]">Where the bar sits — other reference points</h3>
        <span className="text-[11px] text-[#94A3B8]">Final state of counselling</span>
      </div>
      <p className="text-xs text-[#94A3B8] mb-4">
        Your state is judged against “{ANCHOR_META[r.target.id]?.label ?? r.target.id}”. The rows below
        are the same computation against other historical bars, for context.
      </p>

      {/* desktop table */}
      <table className="hidden sm:table w-full text-xs">
        <thead>
          <tr className="text-left text-[#94A3B8] border-b border-white/[0.06]">
            <th className="py-2 pr-3 font-medium">Reference</th>
            <th className="py-2 pr-3 font-medium">Rank</th>
            <th className="py-2 pr-3 font-medium">Corrects needed</th>
            <th className="py-2 font-medium">Data</th>
          </tr>
        </thead>
        <tbody>
          {r.anchors.map((a) => (
            <tr
              key={a.id}
              className={`border-b border-white/[0.04] last:border-0 ${
                a.role === 'default' ? 'bg-[#18B6A4]/[0.06]' : ''
              }`}
            >
              <td className="py-2.5 pr-3 text-[#CBD5E1]">
                <span className="flex items-center gap-2 flex-wrap">
                  <span title={a.definition}>{ANCHOR_META[a.id]?.label ?? a.id}</span>
                  {a.role === 'default' ? (
                    <span className="text-[10px] uppercase tracking-wide text-[#4DD7C8] border border-[#18B6A4]/40 rounded-full px-2 py-0.5">
                      your target
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="py-2.5 pr-3 tabular-nums text-[#F8FAFC]">{fmtRank(a.rank)}</td>
              <td className="py-2.5 pr-3 tabular-nums text-[#F8FAFC]">
                {a.requiredCorrects === null
                  ? `> ${a.ladderEndCorrects ?? '—'} (beyond the estimate)`
                  : `≈ ${fmtCorrects(a.requiredCorrects)}`}
              </td>
              <td className="py-2.5 text-[#94A3B8]">{anchorSourceLabel(a)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* mobile cards */}
      <div className="sm:hidden space-y-2">
        {r.anchors.map((a) => (
          <div
            key={a.id}
            className={`rounded-xl p-3 border ${
              a.role === 'default'
                ? 'bg-[#18B6A4]/[0.06] border-[#18B6A4]/25'
                : 'bg-[#151E29] border-white/[0.06]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#CBD5E1]" title={a.definition}>
                {ANCHOR_META[a.id]?.label ?? a.id}
                {a.role === 'default' ? ' · your target' : ''}
              </span>
              <span className="text-sm font-semibold text-[#F8FAFC] tabular-nums">
                {a.requiredCorrects === null
                  ? `> ${a.ladderEndCorrects ?? '—'}`
                  : `≈ ${fmtCorrects(a.requiredCorrects)}`}
              </span>
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-1">
              AIR {fmtRank(a.rank)} · {anchorSourceLabel(a)}
            </p>
          </div>
        ))}
      </div>

      {/* Bounded-end notes ride verbatim — incl. the INI-CET conservative-floor
          limitation (ANY_SEAT below the crowd ladder ⇒ ≈110-corrects floor). */}
      {r.anchors
        .filter((a) => a.note)
        .map((a) => (
          <p
            key={`${a.id}-note`}
            className="mt-2 flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl px-3 py-2"
          >
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-medium">{ANCHOR_META[a.id]?.label ?? a.id}:</strong> {a.note}
            </span>
          </p>
        ))}
    </div>
  );
};

// ---- exam & time card -----------------------------------------------------------------

const ExamCard: React.FC<{ res: ReadinessResponse }> = ({ res }) => {
  const cal = res.result.calendar;
  const expected = cal.status === 'expected';

  return (
    <div
      className={`rounded-2xl border p-5 sm:p-6 ${
        expected ? 'bg-amber-500/[0.05] border-amber-500/25' : 'bg-[#18222E] border-white/[0.06]'
      }`}
      data-anim="fade-up"
    >
      <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3 flex items-center gap-2">
        <CalendarClock size={15} className="text-[#4DD7C8]" /> The exam clock
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1">Exam date</div>
          <div className="text-[#F8FAFC] font-semibold">{examDateLabel(cal.examDate)}</div>
          <span
            className={`inline-block mt-1 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${
              expected
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-[#18B6A4]/15 text-[#4DD7C8] border-[#18B6A4]/40'
            }`}
          >
            {expected ? 'Expected date' : 'Announced'}
          </span>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1">Session</div>
          <div className="text-[#F8FAFC] font-semibold">
            {examLabelFor(res.result.exam, res.result.examLabel)} {sessionLabel(cal.session)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1">Time left</div>
          <div className="text-[#F8FAFC] font-semibold">{res.result.explanation.timeRemainingText}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#94A3B8]">
        <a
          href={cal.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-[#4DD7C8]"
        >
          Official portal <ExternalLink size={11} />
        </a>
        <span>date verified {cal.verifiedAsOf}</span>
      </div>
      {cal.warnings.map((w) => (
        <p
          key={w.code}
          className="mt-3 flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl px-3 py-2"
        >
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w.note}
        </p>
      ))}
    </div>
  );
};

// ---- what went in ---------------------------------------------------------------------

const WhatWentIn: React.FC<{ res: ReadinessResponse }> = ({ res }) => {
  const { input } = res.result;

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5" data-anim="fade-up">
      <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">What went in</h3>
      {input.mode === 'corrects' ? (
        <div className="flex flex-wrap gap-2">
          {input.rows.map((row, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 border ${
                row.provenance === 'auto-captured'
                  ? 'bg-[#18B6A4]/15 text-[#4DD7C8] border-[#18B6A4]/30'
                  : 'bg-white/[0.04] text-[#CBD5E1] border-white/10'
              }`}
              title={row.provenance === 'auto-captured' ? 'Filled from your Eyeconic quiz attempts' : 'Typed by you'}
            >
              {row.provenance === 'auto-captured' ? <Zap size={11} /> : <User size={11} />}
              GT {i + 1}: <strong>{fmtCorrects(row.corrects)}</strong> corrects
            </span>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {(input.scoreRows ?? []).map((row, i) => (
            <p key={i} className="text-xs text-[#CBD5E1] tabular-nums">
              Score entered: <strong>{fmtNum(row.value)}</strong> marks → read as{' '}
              <strong>{fmtCorrects(row.corrects)}</strong> corrects
              {!row.onLattice ? (
                <span className="text-amber-300"> · {row.residueMarks} marks off the nearest achievable score</span>
              ) : null}
            </p>
          ))}
        </div>
      )}
      <p className="text-xs text-[#94A3B8] mt-3">
        Average used: <strong className="text-[#CBD5E1]">{fmtCorrects(input.meanCorrects)}</strong> corrects
        across {input.aggregation.n} Grand Test{input.aggregation.n === 1 ? '' : 's'} (range{' '}
        {fmtCorrects(input.aggregation.min)}–{fmtCorrects(input.aggregation.max)}).
      </p>
    </div>
  );
};

// ---- methodology ------------------------------------------------------------------------

const ReadinessMethodology: React.FC<{ res: ReadinessResponse }> = ({ res }) => {
  const [open, setOpen] = useState(false);
  const r = res.result;
  const isIniCet = r.exam === 'INI_CET';

  // Full server text lives HERE; only the short lines render inline above.
  // The time-allowance note is already shown with the budget arithmetic.
  const notes = useMemo(() => {
    const seen = new Set<string>();
    return [...r.warnings.map((w) => w.note), ...r.notes].filter((note) => {
      if (note === r.method.timeAllowance.note || seen.has(note)) return false;
      seen.add(note);
      return true;
    });
  }, [r]);

  return (
    <div className="bg-[#151E29] border border-white/[0.06] rounded-2xl mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="readiness-methodology"
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-[#CBD5E1]">
          <Layers size={15} className="text-[#4DD7C8]" /> How this readiness score works
        </span>
        <ChevronDown
          size={16}
          className={`text-[#94A3B8] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        id="readiness-methodology"
        role="region"
        aria-label="Methodology and data coverage"
        hidden={!open}
        data-fade
        className="px-5 pb-5 pt-1 border-t border-white/[0.06]"
      >
        <div className="pt-4 space-y-4 text-xs text-[#94A3B8]">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] mb-2">How it is judged</p>
            <ul className="space-y-1.5">
              <li className="flex items-start gap-2">
                <span aria-hidden="true" className="text-[#4DD7C8] mt-px">•</span> Your Grand Test
                corrects are averaged and placed on the exam&apos;s official result data to see where you
                stand today.
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden="true" className="text-[#4DD7C8] mt-px">•</span> The bar is the corrects
                that historically took the target — the last UR seat awarded at the end of counselling.
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden="true" className="text-[#4DD7C8] mt-px">•</span> The gap is judged
                against a provisional time allowance:{' '}
                {r.method.timeAllowance.rateCorrectsPerMonth} corrects per month, capped at{' '}
                {r.method.timeAllowance.capMonths} months.
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#94A3B8] mb-2">Data this ran against</p>
            <ul className="space-y-1.5">
              <li>
                Standing today: official {isIniCet ? 'AIIMS' : 'NBEMS'}{' '}
                {isIniCet ? 'INI-CET' : 'NEET PG 2025'} result data
                {isIniCet ? ' (the corrects step uses a crowd-sourced ladder — AIIMS publishes no marks)' : ''}.
              </li>
              <li>
                Target bar: {isIniCet ? 'AIIMS' : 'MCC'} counselling, final-state closing ranks
                {isIniCet ? ' across the last 4 sessions' : ' (2025)'}.
              </li>
              <li>Exam date: the server-side exam calendar, resolved at the moment you ran the check.</li>
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
            {examLabelFor(r.exam, r.examLabel)} · every readiness check is saved so its usefulness can be
            measured once real outcomes are shared.
          </p>
        </div>
      </div>
    </div>
  );
};

// ---- the view -----------------------------------------------------------------------------

const ReadinessResult: React.FC<{ res: ReadinessResponse; onBack: () => void }> = ({ res, onBack }) => {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div data-anim="fade">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <button type="button" onClick={onBack} className="btn btn-outline text-sm px-4 py-2">
          <ArrowLeft size={14} className="mr-1.5" /> Check another
        </button>
      </div>

      <h3 ref={headingRef} tabIndex={-1} className="sr-only">
        Readiness result
      </h3>

      <div className="relative" data-stagger>
        <StateHero res={res} />
      </div>

      <div className="mt-4">
        <WhyPanel res={res} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <PercentileCard res={res} />
        <RankCard res={res} />
      </div>

      {res.rollover ? (
        <p className="mt-4 flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {res.rollover.note}
        </p>
      ) : null}

      <div className="mt-4">
        <AnchorLadder res={res} />
      </div>

      <div className="mt-4">
        <ExamCard res={res} />
      </div>

      {/* warnings: short lines inline (full text in the methodology section) */}
      {res.result.warnings
        .filter((w) => w.code !== 'DATE_EXPECTED')
        .map((w) => (
          <p
            key={w.code}
            className="mt-3 flex items-start gap-2 text-xs text-[#CBD5E1] bg-[#151E29] border border-white/[0.08] rounded-xl p-3"
          >
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" />{' '}
            {READINESS_WARNING_SHORT[w.code] ?? w.note}
          </p>
        ))}

      <div className="mt-4">
        <WhatWentIn res={res} />
      </div>

      <p className="text-xs text-[#94A3B8] mt-3 flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0 text-[#4DD7C8]" /> A planning estimate, not a promise —
        improvement rates are provisional and cutoffs move every year.
      </p>

      <ReadinessMethodology res={res} />
    </div>
  );
};

export default ReadinessResult;
