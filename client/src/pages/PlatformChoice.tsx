import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ChevronDown, Clock, ExternalLink, Lightbulb, Loader2,
  RefreshCw, Sparkles, Star, Target, ThumbsUp, Timer,
} from 'lucide-react';
import {
  isPlatformChoiceUnavailable,
  platformChoice,
  platformChoiceErrorField,
  platformChoiceErrorMessage,
} from '../lib/platformChoiceClient';
import type {
  PlatformChoiceContext, Recommendation, RecommendRequest,
} from '../types/platformChoice';

/**
 * Platform Choice Recommender (Feature 06) — student surface.
 *
 * The form is prefilled with everything the system already knows (predictor
 * exam, Mini CCT subject ranking, onboarding resource, desired branch); the
 * scoring matrix, platform catalog and outbound links are server-owned — this
 * page only collects the six inputs and renders the three tiered cards the
 * API returns.
 */

const QUICK_HOUR_CHIPS = [4, 6, 8, 10, 12];

const TIER_META: Record<
  RecommendationTier['tier'],
  { icon: React.ReactNode; classes: string; badge: string }
> = {
  highly_recommended: {
    icon: <Star size={13} className="fill-current" />,
    classes: 'border-[#18B6A4]/60 shadow-[0_0_28px_rgba(24,182,164,0.12)] bg-gradient-to-b from-[#18B6A4]/[0.07] to-transparent',
    badge: 'bg-[#18B6A4]/15 text-[#4DD7C8] border-[#18B6A4]/40',
  },
  good_alternative: {
    icon: <ThumbsUp size={13} />,
    classes: 'border-white/[0.1] bg-[#18222E]',
    badge: 'bg-white/[0.06] text-[#CBD5E1] border-white/[0.12]',
  },
  also_consider: {
    icon: <Lightbulb size={13} />,
    classes: 'border-white/[0.08] bg-[#18222E]',
    badge: 'bg-white/[0.04] text-[#94A3B8] border-white/[0.1]',
  },
};

function monogram(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const PlatformLogo: React.FC<{ tier: RecommendationTier['platform'] }> = ({ platform }) => {
  if (platform.logoUrl) {
    return (
      <img
        src={platform.logoUrl}
        alt={`${platform.name} logo`}
        className="w-12 h-12 rounded-xl object-contain bg-white/[0.04] border border-white/[0.08]"
        loading="lazy"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg border"
      style={{
        color: platform.accent,
        backgroundColor: `${platform.accent}1f`,
        borderColor: `${platform.accent}40`,
      }}
    >
      {monogram(platform.name)}
    </div>
  );
};

const FactorBars: React.FC<{ factors: RecommendationTier['factors'] }> = ({ factors }) => (
  <div className="space-y-2 mt-4 pt-4 border-t border-white/[0.06]">
    {factors.map((factor) => (
      <div key={factor.key} className="flex items-center gap-3">
        <span className="text-[11px] text-[#94A3B8] w-36 shrink-0 truncate" title={factor.label}>
          {factor.label}
          <span className="text-[#94A3B8]/60"> ·{factor.weight}</span>
        </span>
        <div
          className="h-1.5 flex-1 rounded-full bg-white/[0.06] overflow-hidden"
          role="meter"
          aria-valuenow={Math.round(factor.score * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={factor.label}
        >
          <div
            className="h-full rounded-full bg-[#18B6A4]"
            style={{ width: `${Math.round(factor.score * 100)}%` }}
          />
        </div>
        <span className="text-[11px] text-[#CBD5E1] w-8 text-right tabular-nums">
          {Math.round(factor.score * 100)}
        </span>
      </div>
    ))}
  </div>
);

const TierCard: React.FC<{ tier: RecommendationTier; rank: number }> = ({ tier, rank }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = TIER_META[tier.tier];
  return (
    <div className={`rounded-2xl border p-5 sm:p-6 flex flex-col ${meta.classes}`}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${meta.badge}`}
        >
          {meta.icon} {tier.tierLabel}
        </span>
        <span className="text-xs text-[#94A3B8]">#{rank}</span>
      </div>

      <div className="flex items-start gap-3">
        <PlatformLogo platform={tier.platform} />
        <div className="min-w-0">
          <h3 className="font-semibold text-[#F8FAFC] leading-tight">{tier.platform.name}</h3>
          <p className="text-xs text-[#94A3B8] mt-0.5">{tier.platform.tagline}</p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#4DD7C8] mt-2">
            <Target size={12} /> {tier.matchScore}% match · {tier.highlight.label}
          </span>
        </div>
      </div>

      <p className="text-xs text-[#CBD5E1]/90 uppercase tracking-wide mt-4 mb-1.5">Key strength</p>
      <p className="text-sm text-[#CBD5E1]">{tier.platform.keyStrength}</p>

      <p className="text-xs text-[#CBD5E1]/90 uppercase tracking-wide mt-4 mb-1.5">Why for you</p>
      <p className="text-sm text-[#F8FAFC]/90 leading-relaxed">{tier.reason}</p>

      {tier.platform.bestFor.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {tier.platform.bestFor.map((point) => (
            <span
              key={point}
              className="text-[11px] text-[#94A3B8] bg-white/[0.04] border border-white/[0.08] rounded-full px-2.5 py-1"
            >
              {point}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-5 flex items-center gap-2.5">
        {tier.platform.visitUrl ? (
          <a
            href={tier.platform.visitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary text-xs px-4 py-2 flex-1"
          >
            Visit Platform <ExternalLink size={13} className="ml-1.5" />
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="btn btn-outline text-xs px-4 py-2"
          aria-expanded={expanded}
        >
          Know More <ChevronDown size={13} className={`ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && <FactorBars factors={tier.factors} />}
    </div>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────────

const PlatformChoice: React.FC = () => {
  const [context, setContext] = useState<PlatformChoiceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  const [exam, setExam] = useState('');
  const [targetSession, setTargetSession] = useState('');
  const [studyHours, setStudyHours] = useState(6);
  const [previousResource, setPreviousResource] = useState('none');
  const [likelyToSwitch, setLikelyToSwitch] = useState<'yes' | 'no'>('yes');
  const [weakestSubjects, setWeakestSubjects] = useState<string[]>([]);
  const [subjectError, setSubjectError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitUnavailable, setSubmitUnavailable] = useState(false);
  const [result, setResult] = useState<Recommendation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setUnavailable(false);
    try {
      const data = await platformChoice.context();
      setContext(data);
      // Prefill from what the system already knows — the student confirms.
      setExam(data.autofill.exam || data.config.exams[0]?.id || '');
      setTargetSession(data.autofill.targetSession || data.config.exams[0]?.defaultSession || '');
      setPreviousResource(data.autofill.previousResource || 'none');
      setWeakestSubjects(data.autofill.weakestSubjects.slice(0, 3));
      setSubjectError('');
    } catch (err) {
      setLoadError(platformChoiceErrorMessage(err, 'Could not load the recommender.'));
      setUnavailable(isPlatformChoiceUnavailable(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exams = useMemo(() => context?.config.exams ?? [], [context]);
  const resourceOptions = context?.config.resourceOptions ?? [];
  const subjectOptions = context?.config.subjects ?? [];
  const hoursBounds = context?.config.studyHours ?? { min: 1, max: 18 };

  const activeExam = useMemo(() => exams.find((e) => e.id === exam) || null, [exams, exam]);
  const miniCctBadges = useMemo(() => {
    if (!context?.miniCct) return new Set<string>();
    return new Set(context.autofill.weakestSubjects);
  }, [context]);

  const onExamChange = (id: string) => {
    setExam(id);
    const next = exams.find((e) => e.id === id);
    setTargetSession(next?.defaultSession || next?.sessions[0]?.id || '');
  };

  const toggleSubject = (label: string) => {
    setSubjectError('');
    setWeakestSubjects((current) => {
      if (current.includes(label)) return current.filter((s) => s !== label);
      if (current.length >= 3) return current; // max 3 — the chip buttons stay visible
      return [...current, label];
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    setSubmitUnavailable(false);
    if (weakestSubjects.length < 1 || weakestSubjects.length > 3) {
      setSubjectError('Pick between 1 and 3 weakest subjects.');
      return;
    }
    const body: RecommendRequest = {
      exam,
      targetSession,
      studyHoursPerDay: studyHours,
      previousResource,
      likelyToSwitch,
      weakestSubjects,
    };
    setSubmitting(true);
    try {
      const data = await platformChoice.recommend(body);
      setResult(data.recommendation);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const field = platformChoiceErrorField(err);
      if (field === 'weakestSubjects') {
        setSubjectError(platformChoiceErrorMessage(err, 'Check your subject picks.'));
      } else {
        setSubmitError(platformChoiceErrorMessage(err, 'Could not generate your recommendations.'));
        setSubmitUnavailable(isPlatformChoiceUnavailable(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
        <div className="container mx-auto px-2 sm:px-4">
          <div className="h-10 w-72 rounded-xl bg-[#18222E] animate-pulse mb-4" />
          <div className="h-5 w-full max-w-xl rounded-lg bg-[#18222E] animate-pulse mb-10" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-[480px] rounded-2xl bg-[#18222E] animate-pulse" />
            <div className="h-[480px] rounded-2xl bg-[#18222E] animate-pulse" />
          </div>
        </div>
      </section>
    );
  }

  if (loadError && !context) {
    return (
      <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
        <div className="container mx-auto px-2 sm:px-4 max-w-2xl">
          <div className="dark-banner-error text-sm">
            <p>{loadError}</p>
            {unavailable && (
              <p className="text-xs mt-1 opacity-80">
                The Eyeconic service may be waking up — this can take up to a minute.
              </p>
            )}
            <div className="flex gap-2.5 mt-3">
              <button onClick={load} className="btn btn-outline text-xs px-3 py-1.5">
                <RefreshCw size={13} className="mr-1.5" /> Try Again
              </button>
              <Link to="/dashboard" className="btn btn-outline text-xs px-3 py-1.5">
                <ArrowLeft size={13} className="mr-1.5" /> Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── Result view ─────────────────────────────────────────────────────────────
  if (result && context) {
    return (
      <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
        <div className="container mx-auto px-2 sm:px-4">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] flex items-center gap-2.5">
                <Sparkles size={24} className="text-[#4DD7C8]" /> Your Platform Recommendations
              </h2>
              <p className="text-[#94A3B8] text-sm mt-1.5">
                Based on your exam, Mini CCT signals, desired branch, study hours and switching
                preference — tuned to <span className="text-[#CBD5E1]">{result.method.version}</span>.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setResult(null)}
                className="btn btn-outline text-sm px-4 py-2"
              >
                <ArrowLeft size={14} className="mr-2" /> Edit Answers
              </button>
              <Link to="/dashboard" className="btn btn-outline text-sm px-4 py-2">
                Dashboard
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            {result.tiers.map((tier, index) => (
              <TierCard key={tier.platform.key} tier={tier} rank={index + 1} />
            ))}
          </div>

          {result.notes.length > 0 && (
            <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-200/90 space-y-1.5 mb-8">
              {result.notes.map((note) => (
                <p key={note} className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {note}
                </p>
              ))}
            </div>
          )}

          <p className="text-xs text-[#94A3B8]/80 max-w-3xl">
            Match scores compare platforms against each other for YOUR profile — they are not
            absolute ratings of the platforms. Recommendations are guidance, not endorsements;
            always review a platform's own materials before subscribing.
          </p>
        </div>
      </section>
    );
  }

  // ── Form view ───────────────────────────────────────────────────────────────
  return (
    <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-2 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] flex items-center gap-2.5">
              <Sparkles size={24} className="text-[#4DD7C8]" /> Platform Choice Recommender
            </h2>
            <p className="text-[#94A3B8] text-sm mt-1.5 max-w-2xl">
              Six quick inputs — we pre-filled everything your Eyeconic account already knows.
              You will get your 3 best-fit prep platforms with personalised reasons.
            </p>
          </div>
          <Link to="/dashboard" className="btn btn-outline text-sm px-4 py-2">
            <ArrowLeft size={14} className="mr-2" /> Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={submit} className="lg:col-span-2 space-y-6" noValidate>
            {/* Exam + session */}
            <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 sm:p-6">
              <h3 className="font-semibold text-[#4DD7C8] mb-4 text-sm uppercase tracking-wide">
                Target exam
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" role="radiogroup" aria-label="Exam">
                {exams.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={exam === option.id}
                    onClick={() => onExamChange(option.id)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      exam === option.id
                        ? 'border-[#18B6A4]/60 bg-[#18B6A4]/10 text-[#4DD7C8]'
                        : 'border-white/[0.08] bg-[#151E29] text-[#CBD5E1] hover:border-[#18B6A4]/30'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {activeExam?.note && (
                <p className="text-xs text-amber-200/80 mt-3 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {activeExam.note}
                </p>
              )}
              <div className="mt-4">
                <label htmlFor="targetSession" className="block text-xs text-[#94A3B8] mb-1.5">
                  Target session
                </label>
                <select
                  id="targetSession"
                  value={targetSession}
                  onChange={(e) => setTargetSession(e.target.value)}
                  className="w-full sm:max-w-xs bg-[#151E29] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#18B6A4]/50"
                >
                  {(activeExam?.sessions ?? []).map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Study hours */}
            <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 sm:p-6">
              <h3 className="font-semibold text-[#4DD7C8] mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
                <Clock size={14} /> Study hours per day
              </h3>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex quick-hour-chips gap-2">
                  {QUICK_HOUR_CHIPS.map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      onClick={() => setStudyHours(hours)}
                      aria-pressed={studyHours === hours}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        studyHours === hours
                          ? 'border-[#18B6A4]/60 bg-[#18B6A4]/10 text-[#4DD7C8]'
                          : 'border-white/[0.08] bg-[#151E29] text-[#CBD5E1] hover:border-[#18B6A4]/30'
                      }`}
                    >
                      {hours}h
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={hoursBounds.min}
                    max={hoursBounds.max}
                    step={1}
                    value={studyHours}
                    onChange={(e) => setStudyHours(Number(e.target.value))}
                    aria-label="Study hours per day"
                    className="w-20 bg-[#151E29] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#18B6A4]/50"
                  />
                  <span className="text-xs text-[#94A3B8]">h/day</span>
                </div>
              </div>
              <p className="text-xs text-[#94A3B8]/80 mt-3">
                Fewer hours favour rapid-revision platforms; longer schedules favour deep,
                extensive course libraries.
              </p>
            </div>

            {/* Previous resource + switching */}
            <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 sm:p-6">
              <h3 className="font-semibold text-[#4DD7C8] mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
                <Timer size={14} /> Current resource
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="previousResource" className="block text-xs text-[#94A3B8] mb-1.5">
                    What do you currently use?
                    {context?.autofill.previousResource && (
                      <span className="text-[#4DD7C8]/80"> · pre-filled from your profile</span>
                    )}
                  </label>
                  <select
                    id="previousResource"
                    value={previousResource}
                    onChange={(e) => setPreviousResource(e.target.value)}
                    className="w-full bg-[#151E29] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#18B6A4]/50"
                  >
                    {resourceOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="block text-xs text-[#94A3B8] mb-1.5">
                    Would you switch if there is a better fit?
                  </span>
                  <div className="flex gap-2.5" role="radiogroup" aria-label="Likelihood to switch">
                    {(['yes', 'no'] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={likelyToSwitch === value}
                        onClick={() => setLikelyToSwitch(value)}
                        className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                          likelyToSwitch === value
                            ? 'border-[#18B6A4]/60 bg-[#18B6A4]/10 text-[#4DD7C8]'
                            : 'border-white/[0.08] bg-[#151E29] text-[#CBD5E1] hover:border-[#18B6A4]/30'
                        }`}
                      >
                        {value === 'yes' ? 'Yes, open to switching' : 'No, prefer to stay'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Weakest subjects */}
            <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-5 sm:p-6">
              <h3 className="font-semibold text-[#4DD7C8] mb-1 text-sm uppercase tracking-wide">
                Your 3 weakest subjects
              </h3>
              <p className="text-xs text-[#94A3B8] mb-4">
                {context?.miniCct
                  ? `Pre-filled from your latest Mini CCT (${context.miniCct.quizTitle || 'most recent'}) — adjust to what YOU feel weakest in.`
                  : 'No Mini CCT on record yet — pick what you feel weakest in.'}{' '}
                Pick 1–3.
              </p>
              <div className="flex flex-wrap gap-2">
                {subjectOptions.map((option) => {
                  const selected = weakestSubjects.includes(option.label);
                  const fromMiniCct = miniCctBadges.has(option.label);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => toggleSubject(option.label)}
                      aria-pressed={selected}
                      title={fromMiniCct ? 'Suggested by your latest Mini CCT' : undefined}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                        selected
                          ? 'border-[#18B6A4]/60 bg-[#18B6A4]/10 text-[#4DD7C8]'
                          : 'border-white/[0.08] bg-[#151E29] text-[#CBD5E1] hover:border-[#18B6A4]/30'
                      }`}
                    >
                      {option.label}
                      {fromMiniCct && !selected && (
                        <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                      )}
                    </button>
                  );
                })}
              </div>
              {subjectError && (
                <p className="text-xs text-rose-300 mt-3 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> {subjectError}
                </p>
              )}
            </div>

            {submitError && (
              <div className="dark-banner-error text-sm">
                <p>{submitError}</p>
                {submitUnavailable && (
                  <p className="text-xs mt-1 opacity-80">
                    The Eyeconic service may be waking up — this can take up to a minute.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting || weakestSubjects.length < 1}
                className="btn btn-primary text-sm px-6 py-3 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 size={15} className="mr-2 animate-spin" /> Building your matches…
                  </>
                ) : (
                  <>
                    <Sparkles size={15} className="mr-2" /> Get My Recommendations
                  </>
                )}
              </button>
              <span className="text-xs text-[#94A3B8]">
                {weakestSubjects.length}/3 subjects picked
              </span>
            </div>
          </form>

          {/* Side rail */}
          <div className="space-y-6">
            {context?.miniCct && (
              <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 text-sm text-[#94A3B8]">
                <h3 className="font-semibold text-[#4DD7C8] mb-3">From your latest Mini CCT</h3>
                <ul className="space-y-2">
                  {context.miniCct.subjectRanking.map((row, index) => (
                    <li key={row.subjectName} className="flex items-center justify-between gap-3">
                      <span className="text-[#CBD5E1]">
                        {index === 0 && <span className="text-rose-300 mr-1">weakest:</span>}
                        {row.subjectName}
                      </span>
                      <span className="tabular-nums">
                        {row.accuracy === null ? '—' : `${Math.round(row.accuracy)}%`}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/tests"
                  className="inline-flex items-center gap-1.5 text-xs text-[#4DD7C8] mt-4 hover:underline"
                >
                  Take the next Mini CCT <ArrowLeft size={11} className="rotate-180" />
                </Link>
              </div>
            )}

            <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 text-sm text-[#94A3B8]">
              <h3 className="font-semibold text-[#4DD7C8] mb-3">How matching works</h3>
              <ul className="space-y-2">
                {Object.entries(context?.config.weights ?? {}).map(([key, weight]) => (
                  <li key={key} className="flex items-center justify-between gap-3">
                    <span>{context?.config.factorLabels[key as keyof typeof context.config.factorLabels]}</span>
                    <span className="tabular-nums text-[#CBD5E1]">{weight}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-[#94A3B8]/80 mt-4">
                Weights are the server's scoring matrix — every card shows its factor breakdown
                under “Know More”. Outbound links may use partner URLs configured server-side.
              </p>
            </div>

            {context?.autofill.desiredBranch && (
              <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 text-sm text-[#94A3B8]">
                <h3 className="font-semibold text-[#4DD7C8] mb-2">Desired branch on record</h3>
                <p className="text-[#CBD5E1]">{context.autofill.desiredBranch}</p>
                <Link to="/predictor" className="inline-flex items-center gap-1.5 text-xs text-[#4DD7C8] mt-3 hover:underline">
                  Update in the Desired Branch planner <ArrowLeft size={11} className="rotate-180" />
                </Link>
              </div>
            )}

            {context?.notes.map((note) => (
              <div
                key={note}
                className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-200/90"
              >
                {note}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PlatformChoice;
