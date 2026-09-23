import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Bookmark, ChevronLeft, ChevronRight, Clock, Loader2, ListChecks } from 'lucide-react';
import { appErrorMessage, appQuizApi } from '../lib/appClient';
import type { Question, QuizDetail, SectionState, StartAttemptResponse } from '../types/app';

/**
 * Web quiz player. Mirrors the mobile app's semantics:
 *  - Timers are SERVER-authoritative (durationDeadline / sectionStates[].endsAt
 *    + serverNow offset); the page only renders the countdown.
 *  - Every answer change is PUT immediately (with retry on transient
 *    failures); SECTION_LOCKED / TIME_EXPIRED stop saving and resync.
 *  - Refresh / navigation away and back re-enters through /start, which the
 *    backend resolves to the same in-progress attempt — no local authority.
 */

interface AnswerValue {
  selectedAnswer: unknown;
  markedForReview?: boolean;
  timeSpent: number;
}

const isAnswered = (value: unknown): boolean => {
  if (value === undefined || value === null || value === -1) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
};

const formatClock = (ms: number): string => {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

const TestAttempt: React.FC = () => {
  const { quizId = '' } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [attemptId, setAttemptId] = useState('');
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [current, setCurrent] = useState(0);
  const [sectionLockEnabled, setSectionLockEnabled] = useState(false);
  const [sectionStates, setSectionStates] = useState<SectionState[]>([]);
  const [deadline, setDeadline] = useState<number | null>(null); // epoch ms
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [banner, setBanner] = useState('');
  const [now, setNow] = useState(Date.now());

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const questionStartRef = useRef(Date.now());
  const submittingRef = useRef(false);
  const saveQueue = useRef<Map<number, { selectedAnswer: unknown; markedForReview: boolean; questionId?: string }>>(new Map());
  const saveTimer = useRef<number | null>(null);

  const activeSectionIndex = useMemo(() => {
    if (!sectionLockEnabled || sectionStates.length === 0) return null;
    const active = sectionStates.find((s) => s.status === 'in_progress');
    return active ? active.index : null;
  }, [sectionLockEnabled, sectionStates]);

  // finalize() changes when attemptId is set; load() must always call the
  // latest version (a stale closure would submit with an empty attemptId).
  const finalizeRef = useRef<(isAutoSubmit: boolean) => Promise<void>>(async () => {});

  const questions: Question[] = useMemo(() => {
    if (!quiz?.questions) return [];
    if (activeSectionIndex === null || !quiz.sections?.length) return quiz.questions;
    const section = quiz.sections[activeSectionIndex];
    if (!section) return [];
    const ids = new Set(section.questionIds.map(String));
    return quiz.questions.filter((q) => ids.has(String(q._id)));
  }, [quiz, activeSectionIndex]);

  const currentIndexWithinSection = useMemo(() => {
    // `current` is a global index into quiz.questions; map into the visible slice.
    if (!quiz?.questions) return 0;
    const globalQuestion = quiz.questions[current];
    const idx = questions.findIndex((q) => q._id === globalQuestion?._id);
    return idx >= 0 ? idx : 0;
  }, [current, questions, quiz]);

  const currentQuestion = questions[currentIndexWithinSection];

  // ---- Load: quiz detail + authoritative attempt (start resumes) ----------
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const detail = await appQuizApi.detail(quizId);
      const start: StartAttemptResponse = await appQuizApi.start(quizId);
      if (start.attemptFinalized || (start.status && start.status !== 'in_progress')) {
        const attempt = (start as { attemptId?: string }).attemptId;
        navigate(`/tests/${quizId}/results/${attempt ?? ''}`, { replace: true });
        return;
      }
      setQuiz(detail);
      setAttemptId(start.attemptId);

      const restored: Record<number, AnswerValue> = {};
      for (const answer of start.answers || []) {
        restored[answer.questionIndex] = {
          selectedAnswer: answer.selectedAnswer,
          markedForReview: answer.markedForReview,
          timeSpent: answer.timeSpent || 0,
        };
      }
      setAnswers(restored);

      // Server clock offset for honest countdowns.
      let offset = 0;
      if (start.serverNow) offset = Date.now() - new Date(start.serverNow).getTime();

      if (start.sectionLockEnabled && start.sectionStates?.length) {
        setSectionLockEnabled(true);
        setSectionStates(start.sectionStates);
        const active = start.sectionStates.find((s) => s.status === 'in_progress');
        if (active?.endsAt) setDeadline(new Date(active.endsAt).getTime() + offset);
        // Land on the first question of the active section.
        const defs = start.sectionDefinitions || [];
        const activeDef = defs.find((d) => d.index === active?.index);
        if (activeDef && detail.questions.length) {
          const firstId = String(activeDef.questionIds[0] || '');
          const idx = detail.questions.findIndex((q) => String(q._id) === firstId);
          if (idx >= 0) setCurrent(idx);
        }
        if (!active) {
          // All sections closed — attempt should have finalized; submit path.
          await finalizeRef.current(false);
        }
      } else {
        const end = start.durationDeadline
          ? new Date(start.durationDeadline).getTime()
          : new Date(start.startTime || Date.now()).getTime() + (start.duration || detail.duration) * 60000;
        setDeadline(end + offset);
        const first = Object.keys(restored).length
          ? Math.min(...Object.keys(restored).map(Number))
          : 0;
        setCurrent(first);
      }
    } catch (err) {
      const message = appErrorMessage(err, 'Could not open this attempt.');
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'APP_REQUEST_REJECTED' && /already completed/i.test(message)) {
        const match = message.match(/([0-9a-f]{24})/i);
        if (match) {
          navigate(`/tests/${quizId}/results/${match[1]}`, { replace: true });
          return;
        }
      }
      setLoadError(message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId, navigate]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Countdown tick -------------------------------------------------------
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = deadline !== null ? deadline - now : null;
  const lowTime = remaining !== null && remaining < 5 * 60 * 1000;

  const finalize = useCallback(async (isAutoSubmit: boolean) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await appQuizApi.submit(quizId, attemptId, isAutoSubmit);
      navigate(`/tests/${quizId}/results/${attemptId}`, { replace: true });
    } catch (err) {
      submittingRef.current = false;
      setSubmitting(false);
      const message = appErrorMessage(err, 'Submission failed — your answers are saved. Try again.');
      setBanner(message);
    }
  }, [quizId, attemptId, navigate]);

  useEffect(() => {
    if (remaining !== null && remaining <= 0 && attemptId && !submittingRef.current) {
      if (sectionLockEnabled) {
        // Auto-submit the ACTIVE section; backend advances or finalizes.
        (async () => {
          if (activeSectionIndex === null) return;
          try {
            const result = await appQuizApi.submitSection(quizId, attemptId, activeSectionIndex, true);
            if ((result as { attemptFinalized?: boolean }).attemptFinalized) {
              navigate(`/tests/${quizId}/results/${attemptId}`, { replace: true });
            } else {
              await load(); // next section becomes active
            }
          } catch {
            await finalize(true);
          }
        })();
      } else {
        finalize(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, attemptId, sectionLockEnabled, activeSectionIndex]);

  // ---- Autosave (flush queue with retry) ------------------------------------
  const flushSave = useCallback(async () => {
    if (!attemptId || saveQueue.current.size === 0) return;
    const entries = [...saveQueue.current.entries()];
    for (const [questionIndex, payload] of entries) {
      try {
        const spent = Math.round((Date.now() - questionStartRef.current) / 1000);
        await appQuizApi.saveAnswer(quizId, attemptId, {
          questionIndex,
          questionId: payload.questionId,
          selectedAnswer: payload.selectedAnswer,
          markedForReview: payload.markedForReview,
          timeSpent: Math.max(0, spent - (answersRef.current[questionIndex]?.timeSpent || 0)),
        });
        saveQueue.current.delete(questionIndex);
        const existing = answersRef.current[questionIndex];
        if (existing) {
          setAnswers((prev) => ({
            ...prev,
            [questionIndex]: { ...prev[questionIndex], timeSpent: spent },
          }));
        }
      } catch (err) {
        const status = (err as { response?: { status?: number; data?: { code?: string } } })?.response;
        if (status?.status === 403 && (status.data?.code === 'SECTION_LOCKED' || status.data?.code === 'TIME_EXPIRED' || /section|time/i.test(String(status.data?.msg)))) {
          // Authoritative rejection — stop retrying this write and resync.
          saveQueue.current.delete(questionIndex);
          setBanner('This section is closed. Re-syncing your attempt…');
          setTimeout(() => load(), 1200);
          return;
        }
        // Transient failure — leave queued; next flush retries.
        return;
      }
    }
  }, [attemptId, quizId, load]);

  useEffect(() => {
    finalizeRef.current = finalize;
  }, [finalize]);

  useEffect(() => {
    saveTimer.current = window.setInterval(() => flushSave(), 4000);
    return () => {
      if (saveTimer.current) window.clearInterval(saveTimer.current);
    };
  }, [flushSave]);

  const queueSave = useCallback((questionIndex: number, payload: { selectedAnswer: unknown; markedForReview: boolean; questionId?: string }) => {
    saveQueue.current.set(questionIndex, payload);
    flushSave();
  }, [flushSave]);

  // ---- Tab-switch logging (parity with app/web-console players) -------------
  useEffect(() => {
    if (!attemptId) return;
    const onVisibility = () => {
      if (document.hidden) appQuizApi.tabSwitch(quizId, attemptId).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [attemptId, quizId]);

  // ---- Unload guard ----------------------------------------------------------
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!submittingRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // ---- Answer mutations -------------------------------------------------------
  const setAnswer = (value: unknown) => {
    if (!currentQuestion || submitting) return;
    const globalIndex = current;
    setAnswers((prev) => ({
      ...prev,
      [globalIndex]: {
        selectedAnswer: value,
        markedForReview: prev[globalIndex]?.markedForReview ?? false,
        timeSpent: prev[globalIndex]?.timeSpent ?? 0,
      },
    }));
    queueSave(globalIndex, {
      selectedAnswer: value,
      markedForReview: answersRef.current[globalIndex]?.markedForReview ?? false,
      questionId: String(currentQuestion._id),
    });
  };

  const toggleMultiOption = (optionIndex: number) => {
    const currentAnswer = answersRef.current[current]?.selectedAnswer;
    const selected = Array.isArray(currentAnswer) ? [...(currentAnswer as number[])] : [];
    const at = selected.indexOf(optionIndex);
    if (at >= 0) selected.splice(at, 1);
    else selected.push(optionIndex);
    selected.sort((a, b) => a - b);
    setAnswer(selected.length ? selected : -1);
  };

  const setMatchPair = (columnAIndex: number, columnBIndex: number) => {
    const currentAnswer = answersRef.current[current]?.selectedAnswer;
    const pairs =
      currentAnswer && typeof currentAnswer === 'object' && !Array.isArray(currentAnswer)
        ? { ...(currentAnswer as Record<string, number>) }
        : {};
    if (columnBIndex === -1) delete pairs[String(columnAIndex)];
    else pairs[String(columnAIndex)] = columnBIndex;
    setAnswer(Object.keys(pairs).length ? pairs : -1);
  };

  const toggleMarkForReview = () => {
    const globalIndex = current;
    const existing = answersRef.current[globalIndex];
    const nextMarked = !(existing?.markedForReview ?? false);
    setAnswers((prev) => ({
      ...prev,
      [globalIndex]: {
        selectedAnswer: prev[globalIndex]?.selectedAnswer ?? -1,
        markedForReview: nextMarked,
        timeSpent: prev[globalIndex]?.timeSpent ?? 0,
      },
    }));
    queueSave(globalIndex, {
      selectedAnswer: existing?.selectedAnswer ?? -1,
      markedForReview: nextMarked,
      questionId: currentQuestion ? String(currentQuestion._id) : undefined,
    });
  };

  const goTo = (target: number) => {
    // `target` indexes the visible (active-section) slice → global index.
    const globalQuestion = questions[target];
    if (!globalQuestion || !quiz?.questions) return;
    const globalIndex = quiz.questions.findIndex((q) => q._id === globalQuestion._id);
    questionStartRef.current = Date.now();
    setCurrent(globalIndex);
    flushSave();
  };

  const submitActiveSection = async () => {
    if (!attemptId || activeSectionIndex === null) return;
    setSubmitting(true);
    try {
      await flushSave();
      const result = await appQuizApi.submitSection(quizId, attemptId, activeSectionIndex, false);
      if ((result as { attemptFinalized?: boolean }).attemptFinalized) {
        navigate(`/tests/${quizId}/results/${attemptId}`, { replace: true });
        return;
      }
      await load();
      setBanner('');
    } catch (err) {
      setBanner(appErrorMessage(err, 'Could not submit the section. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Render -----------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0F14] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#18B6A4] animate-spin mb-3" />
        <span className="text-[#94A3B8] ml-3">Opening your attempt…</span>
      </div>
    );
  }

  if (loadError || !quiz || !currentQuestion) {
    return (
      <div className="min-h-[70vh] bg-[#0A0F14] flex items-center justify-center px-4">
        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-[#CBD5E1] mb-6">{loadError || 'This attempt is unavailable.'}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setLoading(true); load(); }} className="btn btn-primary">Try Again</button>
            <Link to="/tests" className="btn btn-outline">My Tests</Link>
          </div>
        </div>
      </div>
    );
  }

  const answerValue = answers[current]?.selectedAnswer;
  const answeredCount = questions.filter((q) => {
    const globalIndex = quiz.questions!.findIndex((item) => item._id === q._id);
    return isAnswered(answersRef.current[globalIndex]?.selectedAnswer);
  }).length;

  const renderQuestionBody = () => {
    const q = currentQuestion;
    const type = q.questionType || 'mcq_single';
    switch (type) {
      case 'multiple_correct': {
        const selected = Array.isArray(answerValue) ? (answerValue as number[]) : [];
        return (
          <div className="space-y-2.5">
            <p className="text-xs text-[#94A3B8] mb-2">Select all correct options</p>
            {(q.options ?? []).map((option, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleMultiOption(i)}
                disabled={submitting}
                className={`w-full text-left border rounded-xl p-3.5 flex items-start gap-3 transition-all ${
                  selected.includes(i)
                    ? 'border-[#18B6A4] bg-[#18B6A4]/10'
                    : 'border-[#263445] hover:border-[#3A4456] bg-[#151E29]'
                }`}
              >
                <span className={`w-6 h-6 shrink-0 rounded-md border flex items-center justify-center text-xs font-bold ${
                  selected.includes(i) ? 'border-[#18B6A4] bg-[#18B6A4] text-[#0A0F14]' : 'border-[#3A4456] text-[#94A3B8]'
                }`}>{String.fromCharCode(65 + i)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-[#CBD5E1] leading-relaxed">{option}</span>
                  {q.optionImages?.[i] ? <img src={q.optionImages[i]} alt="" className="mt-2 rounded-lg border border-white/[0.06] max-h-40" /> : null}
                </span>
              </button>
            ))}
          </div>
        );
      }
      case 'match_the_following': {
        const pairs =
          answerValue && typeof answerValue === 'object' && !Array.isArray(answerValue)
            ? (answerValue as Record<string, number>)
            : {};
        return (
          <div className="space-y-3">
            <p className="text-xs text-[#94A3B8] mb-1">Match each item in Column A with Column B</p>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">
              <span>Column A</span><span /><span>Column B</span>
            </div>
            {(q.columnA ?? []).map((leftItem, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-center">
                <div className="text-sm text-[#CBD5E1] bg-[#151E29] rounded-xl px-3 py-2.5 border border-[#263445]">{leftItem}</div>
                <ChevronRight className="w-4 h-4 text-[#3A4456]" />
                <select
                  value={pairs[String(i)] ?? ''}
                  onChange={(e) => setMatchPair(i, e.target.value === '' ? -1 : Number(e.target.value))}
                  disabled={submitting}
                  className="w-full border border-[#263445] rounded-xl px-3 py-2.5 text-sm bg-[#151E29] text-[#F8FAFC] focus:border-[#18B6A4] outline-none"
                >
                  <option value="">Select…</option>
                  {(q.columnB ?? []).map((rightItem, j) => (
                    <option key={j} value={j}>{String.fromCharCode(65 + j)}. {rightItem}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );
      }
      case 'numerical':
        return (
          <div>
            <p className="text-xs text-[#94A3B8] mb-2">Enter your numerical answer</p>
            <input
              type="number"
              inputMode="decimal"
              value={answerValue === -1 || answerValue === undefined || answerValue === null ? '' : String(answerValue)}
              onChange={(e) => setAnswer(e.target.value === '' ? -1 : Number(e.target.value))}
              disabled={submitting}
              placeholder="Your answer"
              className="w-full border border-[#263445] rounded-xl p-3.5 text-lg font-semibold bg-[#151E29] text-[#F8FAFC] focus:border-[#18B6A4] outline-none"
            />
          </div>
        );
      default: {
        // mcq_single, assertion_reason, image_based and unknown → single choice.
        const selected = typeof answerValue === 'number' ? answerValue : -1;
        return (
          <div className="space-y-2.5">
            {(q.assertion || q.reason) && (
              <div className="bg-[#151E29] border border-[#263445] rounded-xl p-4 space-y-2 text-sm">
                {q.assertion && <p className="text-[#CBD5E1]"><span className="font-semibold text-[#4DD7C8]">Assertion:</span> {q.assertion}</p>}
                {q.reason && <p className="text-[#CBD5E1]"><span className="font-semibold text-[#4DD7C8]">Reason:</span> {q.reason}</p>}
              </div>
            )}
            {(q.options ?? []).map((option, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setAnswer(i)}
                disabled={submitting}
                className={`w-full text-left border rounded-xl p-3.5 flex items-start gap-3 transition-all ${
                  selected === i
                    ? 'border-[#18B6A4] bg-[#18B6A4]/10'
                    : 'border-[#263445] hover:border-[#3A4456] bg-[#151E29]'
                }`}
              >
                <span className={`w-6 h-6 shrink-0 rounded-full border flex items-center justify-center text-xs font-bold ${
                  selected === i ? 'border-[#18B6A4] bg-[#18B6A4] text-[#0A0F14]' : 'border-[#3A4456] text-[#94A3B8]'
                }`}>{String.fromCharCode(65 + i)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-[#CBD5E1] leading-relaxed">{option}</span>
                  {q.optionImages?.[i] ? <img src={q.optionImages[i]} alt="" className="mt-2 rounded-lg border border-white/[0.06] max-h-40" /> : null}
                </span>
              </button>
            ))}
          </div>
        );
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0F14] flex flex-col">
      {/* Sticky header — pins below the fixed navbar */}
      <header className="bg-[#101720] border-b border-white/[0.06] sticky top-[var(--nav-h)] z-20">
        <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {sectionLockEnabled && activeSectionIndex !== null && quiz.sections?.[activeSectionIndex] && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#18B6A4]/15 text-[#4DD7C8]">
                  {quiz.sections[activeSectionIndex].name || `Section ${activeSectionIndex + 1}`}
                </span>
              )}
              <span className="text-sm font-semibold text-[#F8FAFC] truncate">{quiz.title}</span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Question {currentIndexWithinSection + 1} of {questions.length} · {answeredCount} answered
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 font-mono text-lg font-bold px-4 py-1.5 rounded-xl border ${
            lowTime ? 'text-rose-300 border-rose-400/40 bg-rose-400/10 animate-pulse' : 'text-[#4DD7C8] border-[#18B6A4]/30 bg-[#18B6A4]/10'
          }`}>
            <Clock size={16} />
            {remaining !== null ? formatClock(remaining) : '—'}
          </div>
        </div>
      </header>

      {banner && (
        <div className="dark-banner-error text-sm mx-auto w-full max-w-3xl mt-4">{banner}</div>
      )}

      <main className="container mx-auto px-4 py-6 flex-1 w-full max-w-3xl">
        {currentQuestion.questionImage && (
          <img src={currentQuestion.questionImage} alt="" className="mb-4 rounded-xl border border-white/[0.06] w-full max-h-80 object-contain bg-[#151E29]" />
        )}
        <div className="text-base md:text-lg text-[#F8FAFC] leading-relaxed mb-6 whitespace-pre-line">
          {currentQuestion.question || currentQuestion.questionText}
        </div>
        {renderQuestionBody()}
      </main>

      {/* Footer controls */}
      <footer className="bg-[#101720] border-t border-white/[0.06] sticky bottom-0">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => goTo(Math.max(0, currentIndexWithinSection - 1))}
                disabled={currentIndexWithinSection === 0 || submitting}
                className="btn btn-outline text-sm px-3.5 py-2 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => goTo(Math.min(questions.length - 1, currentIndexWithinSection + 1))}
                disabled={currentIndexWithinSection >= questions.length - 1 || submitting}
                className="btn btn-outline text-sm px-3.5 py-2 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={toggleMarkForReview}
                className={`btn text-sm px-3.5 py-2 ${answers[current]?.markedForReview ? 'btn-primary' : 'btn-outline'}`}
                title="Mark for review"
              >
                <Bookmark size={15} className="mr-1.5" />
                {answers[current]?.markedForReview ? 'Marked' : 'Mark'}
              </button>
            </div>

            <button onClick={() => setConfirmOpen(true)} className="btn btn-primary text-sm px-5 py-2.5">
              {sectionLockEnabled
                ? 'Submit Section'
                : <>Submit Test</>}
            </button>
          </div>

          {/* Palette */}
          <div className="mt-3 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar">
            {questions.map((q, index) => {
              const globalIndex = quiz.questions!.findIndex((item) => item._id === q._id);
              const answered = isAnswered(answers[globalIndex]?.selectedAnswer);
              const marked = answers[globalIndex]?.markedForReview;
              return (
                <button
                  key={q._id}
                  onClick={() => goTo(index)}
                  className={`w-9 h-9 rounded-lg text-xs font-semibold border transition-colors ${
                    index === currentIndexWithinSection
                      ? 'border-[#18B6A4] bg-[#18B6A4] text-[#0A0F14]'
                      : marked
                        ? 'border-amber-400/50 bg-amber-400/15 text-amber-200'
                        : answered
                          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                          : 'border-[#263445] bg-[#151E29] text-[#94A3B8]'
                  }`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>
      </footer>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[#18222E] border border-white/[0.08] rounded-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-lg text-[#F8FAFC] mb-2 flex items-center gap-2">
              <ListChecks size={18} className="text-[#4DD7C8]" />
              {sectionLockEnabled ? 'Submit this section?' : 'Submit your test?'}
            </h3>
            <p className="text-sm text-[#CBD5E1] mb-1">
              {answeredCount} of {questions.length} answered
              {questions.length - answeredCount > 0 && ` · ${questions.length - answeredCount} unanswered`}.
            </p>
            {sectionLockEnabled ? (
              <p className="text-xs text-[#94A3B8] mb-5">
                Once submitted, this section locks and cannot be reopened{quiz.sections && activeSectionIndex !== null && quiz.sections.length - 1 > activeSectionIndex ? ' — the next section starts immediately.' : '.'}
              </p>
            ) : (
              <p className="text-xs text-[#94A3B8] mb-5">Your answers are saved as you go. Submitting grades the test immediately.</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setConfirmOpen(false)} disabled={submitting} className="btn btn-outline flex-1">Cancel</button>
              <button
                onClick={async () => {
                  setConfirmOpen(false);
                  if (sectionLockEnabled && activeSectionIndex !== null) await submitActiveSection();
                  else await finalize(false);
                }}
                disabled={submitting}
                className="btn btn-primary flex-1"
              >
                {submitting ? 'Submitting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compact nav hint */}
      <div className="container mx-auto px-4 pb-3 -mt-1">
        <Link to="/tests" className="text-xs text-[#4A5568] hover:text-[#94A3B8] inline-flex items-center gap-1">
          <ArrowLeft size={11} /> Exit to My Tests (your attempt keeps running)
        </Link>
      </div>
    </div>
  );
};

export default TestAttempt;
