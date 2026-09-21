import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { errorField, predictorEndpoints, predictorErrorMessage } from '../../lib/predictorClient';
import type { OutcomeRecordResponse, OutcomeSubmission, PredictionResult } from '../../types/predictor';
import { fmtRank } from './format';
import { OUTCOME_MAX_SCORE } from './constants';

/**
 * Outcome capture (§15, §18 Phases 10a+10b) — the consent-based post-exam
 * self-report: actual score / percentile / rank + counselling outcome +
 * allotted branch. Logic is unchanged from the 10a/10b implementation
 * (voluntary, re-consent on every submission, editable, withdrawable); this
 * pass only aligns the presentation with the rest of the result page.
 */

const OUTCOME_CONSENT_NOTE =
  'I agree to share this result with Eyeconic to help calibrate the predictor. This is voluntary — I can edit or withdraw it anytime.';
const OUTCOME_CONSENT_REASK =
  'Consent is re-confirmed on every save, including edits.';

const outcomeIntroNote = (exam: string): string =>
  exam === 'INI_CET'
    ? 'Your INI-CET result is out? Pairing your actual percentile or rank with this prediction helps make future ranges more accurate for everyone.'
    : 'Your NEET PG result is out? Pairing your actual score, percentile or rank with this prediction helps make future ranges more accurate for everyone.';

const COUNSELLING_TEXT_MAX = 120;
const COUNSELLING_ROUND_MAX = 40;

interface OutcomeFieldErrors {
  score?: string;
  percentile?: string;
  rank?: string;
  counsellingStatus?: string;
  allottedInstitute?: string;
  allottedBranch?: string;
  round?: string;
}

function outcomeFieldErrors(
  score: string,
  percentile: string,
  rank: string,
  counsellingStatus: string,
  allottedInstitute: string,
  allottedBranch: string,
  round: string,
  maxScore: number
): OutcomeFieldErrors {
  const errors: OutcomeFieldErrors = {};
  if (score !== '') {
    const n = Number(score);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > maxScore) {
      errors.score = `Whole number between 0 and ${maxScore}`;
    }
  }
  if (percentile !== '') {
    const n = Number(percentile);
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.percentile = 'Between 0 and 100';
  }
  if (rank !== '') {
    const n = Number(rank);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) errors.rank = 'Whole number, 1 or more';
  }
  const hasAllotment = allottedInstitute !== '' || allottedBranch !== '' || round !== '';
  if (!counsellingStatus && hasAllotment) {
    errors.counsellingStatus = 'Pick allotted or not allotted first';
  }
  if (counsellingStatus === 'ALLOTTED') {
    if (allottedInstitute !== '' && allottedInstitute.trim().length > COUNSELLING_TEXT_MAX) {
      errors.allottedInstitute = `Up to ${COUNSELLING_TEXT_MAX} characters`;
    }
    if (allottedBranch !== '' && allottedBranch.trim().length > COUNSELLING_TEXT_MAX) {
      errors.allottedBranch = `Up to ${COUNSELLING_TEXT_MAX} characters`;
    }
    if (round !== '' && round.trim().length > COUNSELLING_ROUND_MAX) {
      errors.round = `Up to ${COUNSELLING_ROUND_MAX} characters`;
    }
  }
  return errors;
}

const OutcomeCard: React.FC<{ predictionId: string; result: PredictionResult }> = ({
  predictionId,
  result,
}) => {
  const [record, setRecord] = useState<OutcomeRecordResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState('');
  const [percentile, setPercentile] = useState('');
  const [rank, setRank] = useState('');
  const [counsellingStatus, setCounsellingStatus] = useState<'' | 'ALLOTTED' | 'NOT_ALLOTTED'>('');
  const [allottedInstitute, setAllottedInstitute] = useState('');
  const [allottedBranch, setAllottedBranch] = useState('');
  const [round, setRound] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [error, setError] = useState('');
  const [serverField, setServerField] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const maxScore = OUTCOME_MAX_SCORE[result.exam] ?? 800;

  const load = useCallback(async () => {
    try {
      const data = await predictorEndpoints.outcome(predictionId);
      setRecord(data.recorded ? data.outcomeRecord : null);
    } catch {
      setRecord(null); // transient — the card is optional and must never block
    } finally {
      setLoaded(true);
    }
  }, [predictionId]);

  useEffect(() => {
    setLoaded(false);
    setFormOpen(false);
    setEditing(false);
    load();
  }, [load]);

  const fieldErrors = useMemo(
    () =>
      outcomeFieldErrors(
        score, percentile, rank, counsellingStatus, allottedInstitute, allottedBranch, round, maxScore
      ),
    [score, percentile, rank, counsellingStatus, allottedInstitute, allottedBranch, round, maxScore]
  );
  const anyValue =
    score !== '' || percentile !== '' || rank !== '' || counsellingStatus !== '';
  const canSubmit =
    consent && anyValue && !saving && Object.keys(fieldErrors).length === 0;

  const openForm = (from?: OutcomeRecordResponse) => {
    setScore(from && from.outcome.score !== null ? String(from.outcome.score) : '');
    setPercentile(from && from.outcome.percentile !== null ? String(from.outcome.percentile) : '');
    setRank(from && from.outcome.rank !== null ? String(from.outcome.rank) : '');
    setCounsellingStatus(from && from.counselling ? from.counselling.status : '');
    setAllottedInstitute(
      from && from.counselling && from.counselling.allottedInstitute
        ? from.counselling.allottedInstitute
        : ''
    );
    setAllottedBranch(
      from && from.counselling && from.counselling.allottedBranch
        ? from.counselling.allottedBranch
        : ''
    );
    setRound(from && from.counselling && from.counselling.round ? from.counselling.round : '');
    setConsent(false); // every submission re-consents (§15)
    setError('');
    setServerField(null);
    setConfirmWithdraw(false);
    setEditing(Boolean(from));
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(false);
    setError('');
    setServerField(null);
  };

  const submit = async () => {
    if (!consent) {
      setError('Sharing is voluntary — tick the consent box to submit.');
      return;
    }
    if (!anyValue) {
      setError('Enter at least one value: actual score, percentile, rank or your counselling outcome.');
      return;
    }
    if (Object.keys(fieldErrors).length) {
      setError('Fix the highlighted values first.');
      return;
    }
    setSaving(true);
    setError('');
    setServerField(null);
    try {
      const body: OutcomeSubmission = { consent: true };
      if (score !== '') body.score = Number(score);
      if (percentile !== '') body.percentile = Number(percentile);
      if (rank !== '') body.rank = Number(rank);
      if (counsellingStatus) {
        const counselling: NonNullable<OutcomeSubmission['counselling']> = { status: counsellingStatus };
        if (counsellingStatus === 'ALLOTTED') {
          if (allottedInstitute.trim()) counselling.allottedInstitute = allottedInstitute.trim();
          if (allottedBranch.trim()) counselling.allottedBranch = allottedBranch.trim();
          if (round.trim()) counselling.round = round.trim();
        }
        body.counselling = counselling;
      }
      await predictorEndpoints.saveOutcome(predictionId, body);
      setAnnounce(editing ? 'Result updated. Thank you.' : 'Result shared. Thank you.');
      closeForm();
      await load();
    } catch (err) {
      setError(predictorErrorMessage(err, 'Could not save your result. Please try again.'));
      setServerField(errorField(err));
      setAnnounce('Could not save your result.');
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    setWithdrawing(true);
    try {
      await predictorEndpoints.withdrawOutcome(predictionId);
      setRecord(null);
      setAnnounce('Your shared result was withdrawn.');
      closeForm();
    } catch (err) {
      setError(predictorErrorMessage(err, 'Could not withdraw. Please try again.'));
    } finally {
      setWithdrawing(false);
      setConfirmWithdraw(false);
    }
  };

  if (!loaded) return null;

  // Server field paths ('counselling.status') map onto the local input keys
  // so the right control highlights on a server-side validation error.
  const serverFieldLocal: string | null =
    serverField === 'counselling.status'
      ? 'counsellingStatus'
      : serverField === 'counselling.allottedInstitute'
      ? 'allottedInstitute'
      : serverField === 'counselling.allottedBranch'
      ? 'allottedBranch'
      : serverField === 'counselling.round'
      ? 'round'
      : serverField;

  const fieldClass = (name: keyof OutcomeFieldErrors) =>
    `w-full bg-[#151E29] border rounded-xl px-3 py-2.5 text-sm text-[#F8FAFC] outline-none focus:border-[#18B6A4]/60 ${
      (serverFieldLocal === name && !fieldErrors[name]) || fieldErrors[name]
        ? 'border-rose-500/60'
        : 'border-white/[0.1]'
    }`;

  const renderForm = () => (
    <div className="mt-4 space-y-4">
      {!editing ? <p className="text-xs text-[#94A3B8]">{outcomeIntroNote(result.exam)}</p> : null}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="outcome-score" className="block text-xs text-[#94A3B8] mb-1.5">
            Actual score (/{maxScore})
          </label>
          <input
            id="outcome-score"
            type="number"
            inputMode="numeric"
            min={0}
            max={maxScore}
            step={1}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className={fieldClass('score')}
            placeholder={result.exam === 'INI_CET' ? 'e.g. 118' : 'e.g. 480'}
          />
          {fieldErrors.score ? (
            <p className="text-xs text-rose-300 mt-1">{fieldErrors.score}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor="outcome-percentile" className="block text-xs text-[#94A3B8] mb-1.5">
            Percentile
          </label>
          <input
            id="outcome-percentile"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.01}
            value={percentile}
            onChange={(e) => setPercentile(e.target.value)}
            className={fieldClass('percentile')}
            placeholder="e.g. 81.2"
          />
          {fieldErrors.percentile ? (
            <p className="text-xs text-rose-300 mt-1">{fieldErrors.percentile}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor="outcome-rank" className="block text-xs text-[#94A3B8] mb-1.5">
            AIR (rank)
          </label>
          <input
            id="outcome-rank"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            className={fieldClass('rank')}
            placeholder="e.g. 42000"
          />
          {fieldErrors.rank ? <p className="text-xs text-rose-300 mt-1">{fieldErrors.rank}</p> : null}
        </div>
      </div>

      {/* counselling outcome (Phase 10b, §15) — allotted status + branch, if shared */}
      <div className="bg-[#151E29] border border-white/[0.06] rounded-xl p-4 space-y-3">
        <div>
          <label htmlFor="outcome-counselling" className="block text-xs text-[#94A3B8] mb-1.5">
            Counselling outcome (optional — share whenever you know it)
          </label>
          <select
            id="outcome-counselling"
            value={counsellingStatus}
            onChange={(e) => setCounsellingStatus(e.target.value as '' | 'ALLOTTED' | 'NOT_ALLOTTED')}
            className={fieldClass('counsellingStatus')}
          >
            <option value="">Not sharing / don&apos;t know yet</option>
            <option value="ALLOTTED">Allotted a seat</option>
            <option value="NOT_ALLOTTED">Not allotted</option>
          </select>
          {fieldErrors.counsellingStatus ? (
            <p className="text-xs text-rose-300 mt-1">{fieldErrors.counsellingStatus}</p>
          ) : null}
        </div>
        {counsellingStatus === 'ALLOTTED' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="outcome-institute" className="block text-xs text-[#94A3B8] mb-1.5">
                Allotted college / institute
              </label>
              <input
                id="outcome-institute"
                type="text"
                value={allottedInstitute}
                maxLength={COUNSELLING_TEXT_MAX}
                onChange={(e) => setAllottedInstitute(e.target.value)}
                className={fieldClass('allottedInstitute')}
                placeholder="e.g. AIIMS New Delhi"
              />
              {fieldErrors.allottedInstitute ? (
                <p className="text-xs text-rose-300 mt-1">{fieldErrors.allottedInstitute}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="outcome-branch" className="block text-xs text-[#94A3B8] mb-1.5">
                Allotted branch / specialty
              </label>
              <input
                id="outcome-branch"
                type="text"
                value={allottedBranch}
                maxLength={COUNSELLING_TEXT_MAX}
                onChange={(e) => setAllottedBranch(e.target.value)}
                className={fieldClass('allottedBranch')}
                placeholder="e.g. Radiodiagnosis"
              />
              {fieldErrors.allottedBranch ? (
                <p className="text-xs text-rose-300 mt-1">{fieldErrors.allottedBranch}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="outcome-round" className="block text-xs text-[#94A3B8] mb-1.5">
                Round
              </label>
              <input
                id="outcome-round"
                type="text"
                value={round}
                maxLength={COUNSELLING_ROUND_MAX}
                onChange={(e) => setRound(e.target.value)}
                className={fieldClass('round')}
                placeholder="e.g. R2 / mop-up"
              />
              {fieldErrors.round ? (
                <p className="text-xs text-rose-300 mt-1">{fieldErrors.round}</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {counsellingStatus === 'NOT_ALLOTTED' ? (
          <p className="text-[11px] text-[#94A3B8]">
            A “not allotted” outcome is just as useful for calibration — nothing else needed.
          </p>
        ) : null}
      </div>

      <label className="flex items-start gap-2.5 text-xs text-[#CBD5E1] cursor-pointer bg-[#151E29] border border-white/[0.06] rounded-xl p-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="accent-[#18B6A4] mt-0.5"
        />
        <span>
          {OUTCOME_CONSENT_NOTE}
          {editing ? (
            <span className="block text-[11px] text-[#94A3B8] mt-1">{OUTCOME_CONSENT_REASK}</span>
          ) : null}
          {serverField === 'consent' ? (
            <span className="block text-rose-300 mt-1">Please tick the consent box first.</span>
          ) : null}
        </span>
      </label>

      {error ? (
        <p className="flex items-center gap-2 text-xs text-rose-300">
          <AlertTriangle size={13} /> {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="btn btn-primary text-sm px-4 py-2"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="mr-1.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="mr-1.5" /> {editing ? 'Update result' : 'Share my result'}
            </>
          )}
        </button>
        <button type="button" onClick={closeForm} className="text-xs text-[#94A3B8] hover:text-[#CBD5E1]">
          Cancel
        </button>
      </div>
    </div>
  );

  // Recorded view: values + honest predicted-vs-actual context + edit/withdraw.
  if (record && !formOpen) {
    const o = record.outcome;
    const c = record.counselling;
    return (
      <div className="bg-[#18222E] border border-[#18B6A4]/25 rounded-2xl p-6 mt-6" data-anim="fade-up">
        <span className="sr-only" aria-live="polite">{announce}</span>
        <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2">
          <CheckCircle2 size={16} className="text-[#4DD7C8]" /> Your actual result — recorded, thank you
        </h3>
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-sm text-[#F8FAFC]">
          {o.score !== null ? <span>Score <strong>{o.score}</strong>/{maxScore}</span> : null}
          {o.percentile !== null ? <span>Percentile <strong>{o.percentile}</strong></span> : null}
          {o.rank !== null ? (
            <span>AIR <strong>{o.rank.toLocaleString('en-IN')}</strong></span>
          ) : null}
        </div>
        {c ? (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <div className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1">
              Counselling outcome
            </div>
            <p className="text-sm text-[#F8FAFC]">
              {c.status === 'ALLOTTED'
                ? c.allottedBranch
                  ? <>Allotted — <strong>{c.allottedBranch}</strong></>
                  : 'Allotted a seat'
                : 'Not allotted'}
              {c.round ? <span className="text-[#94A3B8] font-normal"> · {c.round}</span> : null}
            </p>
            {c.allottedInstitute ? (
              <p className="text-xs text-[#94A3B8] mt-0.5">{c.allottedInstitute}</p>
            ) : null}
          </div>
        ) : null}
        {o.rank !== null && result.rank ? (
          <p className="text-xs text-[#94A3B8] mt-2">
            This prediction said AIR {fmtRank(result.rank.bestRank, result.rank.beyondLastRecordedRank)}{' '}
            – {fmtRank(result.rank.worstRank, result.rank.beyondLastRecordedRank)} · your pair is saved
            to calibrate future ranges.
          </p>
        ) : (
          <p className="text-xs text-[#94A3B8] mt-2">
            Linked to this prediction — the pair is saved to calibrate future ranges.
          </p>
        )}
        <div className="flex items-center gap-3 mt-4">
          <button type="button" onClick={() => openForm(record)} className="btn btn-outline text-xs px-3 py-1.5">
            Edit
          </button>
          {confirmWithdraw ? (
            <>
              <button
                type="button"
                onClick={withdraw}
                disabled={withdrawing}
                className="text-xs text-rose-300 border border-rose-500/40 rounded-full px-3 py-1.5 hover:bg-rose-500/10"
              >
                {withdrawing ? 'Withdrawing…' : 'Confirm withdraw'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmWithdraw(false)}
                className="text-xs text-[#94A3B8] hover:text-[#CBD5E1]"
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmWithdraw(true)}
              className="text-xs text-[#94A3B8] hover:text-rose-300 inline-flex items-center gap-1.5"
            >
              <Trash2 size={12} /> Withdraw
            </button>
          )}
        </div>
      </div>
    );
  }

  if (formOpen) {
    return (
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mt-6" data-anim="fade">
        <span className="sr-only" aria-live="polite">{announce}</span>
        <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2">
          <CheckCircle2 size={16} className="text-[#4DD7C8]" />
          {editing ? 'Edit your actual result' : 'Share your actual result (optional)'}
        </h3>
        {renderForm()}
      </div>
    );
  }

  // Collapsed intro (nothing recorded yet).
  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 mt-6" data-anim="fade-up">
      <span className="sr-only" aria-live="polite">{announce}</span>
      <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2">
        <CheckCircle2 size={16} className="text-[#4DD7C8]" /> Result out? Make the next prediction better
      </h3>
      <p className="text-xs text-[#94A3B8] mt-2 mb-4">{outcomeIntroNote(result.exam)}</p>
      <button type="button" onClick={() => openForm()} className="btn btn-outline text-sm px-4 py-2">
        <Plus size={14} className="mr-1.5" /> Add my actual result
      </button>
    </div>
  );
};

export default OutcomeCard;
