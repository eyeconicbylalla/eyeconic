import React, { useMemo, useState } from 'react';
import { ChevronDown, Info, Layers } from 'lucide-react';
import type { PredictionResult } from '../../types/predictor';
import { ASSUMPTION_TEXT, DUPLICATED_ENGINE_NOTES, EXAM_LABELS, isBranchSummary } from './constants';
import { yearFilterLabel } from './format';

/**
 * P1 — one collapsible "How this estimate works" home for the methodology.
 * The spec-mandated bits (disclaimer, data coverage) stay visible OUTSIDE this
 * section (inline under the hero + chips inside the hero cards); everything
 * else the engine reports is gathered here once, de-duplicated, in plain
 * language. Internal vocabulary (tier ids, snapshot ids) never renders.
 */
const MethodologySection: React.FC<{ result: PredictionResult }> = ({ result }) => {
  const [open, setOpen] = useState(false);
  const isIniCet = result.exam === 'INI_CET';
  const { estimate, method, branches, rank } = result;

  const branchSummary = isBranchSummary(branches) ? branches : null;
  const counsellingYears = branchSummary
    ? branchSummary.dataCoverage.years.map(yearFilterLabel).join(' · ')
    : null;

  // De-duplicated engine notes: no-skip + disclaimer already render at the
  // input / under the hero; string-identical branch notes render once.
  const notes = useMemo(() => {
    const seen = new Set<string>();
    const collect = (list: string[]) =>
      list.filter((note) => {
        if (DUPLICATED_ENGINE_NOTES.includes(note) || seen.has(note)) return false;
        seen.add(note);
        return true;
      });
    const fromEstimate = collect(estimate.notes || []);
    const fromWarnings = collect((estimate.warnings || []).map((w) => w.note));
    const fromBranches = branchSummary ? collect(branchSummary.notes || []) : [];
    return [...fromEstimate, ...fromWarnings, ...fromBranches];
  }, [estimate, branchSummary]);

  const assumptions = (method.assumptions || [])
    .map((id) => ASSUMPTION_TEXT[id])
    .filter((text): text is string => Boolean(text));

  return (
    <div className="bg-[#151E29] border border-white/[0.06] rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="predictor-methodology"
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-[#CBD5E1]">
          <Layers size={15} className="text-[#4DD7C8]" /> How this estimate works
        </span>
        <ChevronDown
          size={16}
          className={`text-[#94A3B8] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        id="predictor-methodology"
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
              <li>
                Rank mapping: official {isIniCet ? 'AIIMS' : 'NBEMS'}{' '}
                {isIniCet && rank.session ? rank.session.replace('-', ' ') : rank.examYear} result data.
              </li>
              {counsellingYears ? (
                <li>
                  Branch matching: {isIniCet ? 'AIIMS' : 'MCC'} counselling, final-state closing ranks
                  ({counsellingYears}).
                </li>
              ) : (
                <li>Branch matching: not run — no category was selected.</li>
              )}
              <li>
                Aggregation: mean of your Grand Test scores, one value per test (latest completed
                attempt).
              </li>
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
            {EXAM_LABELS[result.exam] ?? result.exam} · every prediction is saved to your history so
            its accuracy can be measured once real outcomes are shared.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MethodologySection;
