import React from 'react';
import { Info, Loader2, Plus, Sparkles, Trash2, User, Zap } from 'lucide-react';
import { LOW_GT_NOTE, MAX_CORRECTS, NO_SKIP_NOTE } from './constants';
import type { GtInputApi } from './useGtInput';

/**
 * The Grand Test input card (§13: dynamic list, auto-fill, provenance) —
 * shared by the forward predictor form and the desired-branch form (extracted
 * from PredictorForm in Phase 5 of the Desired Branch Predictor; behavior
 * byte-identical for the forward flow).
 */

interface Props {
  gt: GtInputApi;
  title: string;
  subtitle: string;
}

const GtInputSection: React.FC<Props> = ({ gt, title, subtitle }) => {
  const { rows, suggestions, autoFilling, hasAutoGts, lowGtCount, validation } = gt;

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mb-4" data-anim="fade-up">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-semibold text-[#F8FAFC]">{title}</h3>
          <p className="text-xs text-[#94A3B8] mt-1">{subtitle}</p>
        </div>
      </div>

      {autoFilling ? (
        <p className="text-xs text-[#94A3B8] mb-3 flex items-center gap-2" aria-live="polite">
          <Loader2 size={12} className="animate-spin" /> Checking your Eyeconic Grand Tests…
        </p>
      ) : null}

      <div className="space-y-3" data-stagger>
        {rows.map((row, index) => {
          const error = validation.errors[index];
          // Live feedback: a row that HAS content shows its error as you
          // type; untouched empty rows only flag after a submit attempt.
          const highlighted = gt.isHighlighted(index);
          return (
            <div key={row.key}>
              <div
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  highlighted ? 'border-rose-500/60 bg-rose-500/5' : 'border-white/[0.08] bg-[#151E29]'
                }`}
              >
                <span
                  className={`shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${
                    row.origin === 'auto' && !row.edited
                      ? 'bg-[#18B6A4]/15 text-[#4DD7C8] border-[#18B6A4]/30'
                      : 'bg-white/[0.04] text-[#94A3B8] border-white/10'
                  }`}
                  title={
                    row.origin === 'auto' && !row.edited
                      ? 'Filled from your Eyeconic quiz attempts'
                      : 'Typed by you'
                  }
                >
                  {row.origin === 'auto' && !row.edited ? <Zap size={10} /> : <User size={10} />}
                  {row.origin === 'auto' && !row.edited ? 'Auto-captured' : 'Self-reported'}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_CORRECTS}
                  step={1}
                  value={row.value}
                  onChange={(e) => gt.updateRow(row.key, e.target.value)}
                  placeholder="e.g. 120"
                  aria-label={`Grand Test ${index + 1} correct answers`}
                  aria-invalid={Boolean(highlighted)}
                  className="w-24 bg-transparent text-[#F8FAFC] text-lg font-semibold outline-none text-center [appearance:textfield]"
                />
                <div className="flex-1 min-w-0 text-xs text-[#94A3B8] truncate">
                  {row.title ? <span className="text-[#CBD5E1]">{row.title}</span> : null}
                  {row.dateLabel ? <span> · {row.dateLabel}</span> : null}
                  {row.attemptsNote ? <span> · {row.attemptsNote}</span> : null}
                  {row.origin === 'auto' && row.edited ? (
                    <span className="text-[#FBBF24]"> · edited → self-reported</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => gt.removeRow(row.key)}
                  disabled={rows.length === 1}
                  aria-label="Remove this Grand Test"
                  className="text-[#94A3B8] hover:text-rose-300 disabled:opacity-30 p-2 -m-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {highlighted ? (
                <p className="text-xs text-rose-300 mt-1 ml-2">{error}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button type="button" onClick={() => gt.addRow()} className="btn btn-outline text-sm px-4 py-2">
          <Plus size={14} className="mr-1.5" /> Add another GT
        </button>
        {suggestions.map((value, i) => (
          <button
            key={`sug-${i}`}
            type="button"
            onClick={() => gt.addRow(value)}
            className="text-xs text-[#94A3B8] hover:text-[#4DD7C8] border border-white/10 rounded-full px-3 py-2"
            title="From your most recent prediction — confirm before use"
          >
            + {value} corrects (last time)
          </button>
        ))}
      </div>

      {/* assumption note — ALWAYS visible with the input (§3.4/§13) */}
      <p className="mt-4 flex items-start gap-2 text-xs text-[#94A3B8] bg-[#151E29] border border-white/[0.06] rounded-xl p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-[#4DD7C8]" />
        {NO_SKIP_NOTE}
      </p>

      {lowGtCount ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl p-3">
          <Sparkles size={14} className="mt-0.5 shrink-0" />
          {LOW_GT_NOTE}
        </p>
      ) : null}

      {hasAutoGts && !autoFilling ? (
        <p className="mt-3 text-[11px] text-[#94A3B8]">
          Filled from your Eyeconic Grand Tests — the latest completed attempt per test. Tap any
          score to edit it.
        </p>
      ) : null}
    </div>
  );
};

export default GtInputSection;
