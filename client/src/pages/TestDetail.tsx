import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Calendar, CheckCircle2, Clock, FileText, Info, Loader2, Lock, PlayCircle, ShieldCheck } from 'lucide-react';
import { appErrorMessage, appQuizApi } from '../lib/appClient';
import type { QuizDetail as QuizDetailType } from '../types/app';
import OpenInAppButton from '../components/app/OpenInAppButton';

const TEST_TYPE_LABEL: Record<string, string> = { daily: 'Daily Test', weekly: 'Weekly Test', grand: 'Grand Test' };

const TestDetail: React.FC = () => {
  const { quizId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setQuiz(await appQuizApi.detail(quizId));
    } catch (err) {
      setError(appErrorMessage(err, 'This test could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    load();
  }, [load]);

  const attemptStatus = quiz?.attemptStatus;
  const completed = !!attemptStatus?.hasAttempted && attemptStatus.status !== 'in_progress';
  const resumable = attemptStatus?.hasAttempted && attemptStatus.status === 'in_progress';
  const autoStart = params.get('resume') === '1' || params.get('start') === '1';

  const startAttempt = useCallback(async () => {
    setStarting(true);
    setActionError('');
    try {
      const start = await appQuizApi.start(quizId);
      if (start.attemptFinalized || (start.status && start.status !== 'in_progress')) {
        // Expired server-side before we got here — already graded.
        await load();
        return;
      }
      navigate(`/tests/${quizId}/attempt`, { state: { start, quizId } });
    } catch (err) {
      const message = appErrorMessage(err, 'Could not start this test.');
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'APP_REQUEST_REJECTED' && /already completed/i.test(message)) {
        await load();
        return;
      }
      setActionError(message);
    } finally {
      setStarting(false);
    }
  }, [quizId, navigate, load]);

  // Auto-start when arriving from the list with ?start=1/?resume=1.
  useEffect(() => {
    if (!loading && quiz && autoStart && !starting) {
      if (resumable || !completed) startAttempt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, quiz]);

  const scheduleInfo = useMemo(() => {
    if (!quiz) return null;
    if (quiz.scheduledDate && new Date(quiz.scheduledDate) > new Date()) {
      return { blocked: true, text: `This test opens on ${new Date(quiz.scheduledDate).toLocaleString()}.` };
    }
    if (quiz.expiryDate && new Date(quiz.expiryDate) < new Date()) {
      return { blocked: true, text: 'This test has expired.' };
    }
    return null;
  }, [quiz]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#18B6A4] animate-spin" />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <section className="py-16 md:py-24 bg-[#0A0F14] min-h-[60vh]">
        <div className="container mx-auto px-4 max-w-lg text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
          <p className="text-[#CBD5E1] mb-6">{error}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={load} className="btn btn-primary">Try Again</button>
            <Link to="/tests" className="btn btn-outline">Back to My Tests</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-2 sm:px-4 max-w-4xl">
        <Link to="/tests" className="inline-flex items-center gap-1.5 text-sm text-[#94A3B8] hover:text-[#4DD7C8] mb-6">
          <ArrowLeft size={15} /> My Tests
        </Link>

        <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 md:p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-[#18B6A4]/15 text-[#4DD7C8]">
              {TEST_TYPE_LABEL[quiz.testType] || quiz.testType}
            </span>
            {quiz.subjectNames?.slice(0, 3).map((name) => (
              <span key={name} className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.05] text-[#94A3B8]">{name}</span>
            ))}
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] mb-6">{quiz.title}</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[
              { icon: <FileText size={15} />, label: 'Questions', value: String(quiz.questions.length) },
              { icon: <Clock size={15} />, label: 'Duration', value: `${quiz.duration} min` },
              { icon: <Info size={15} />, label: 'Marks', value: `${quiz.totalMarks ?? quiz.questions.length * (quiz.positiveMarks ?? 4)}` },
              {
                icon: <Calendar size={15} />,
                label: 'Marking',
                value: `+${quiz.positiveMarks ?? 4} / −${quiz.negativeMarks ?? 1}`,
              },
            ].map((item) => (
              <div key={item.label} className="bg-[#151E29] border border-white/[0.06] rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 text-[#94A3B8] text-xs mb-1">{item.icon}{item.label}</div>
                <div className="font-semibold text-[#F8FAFC]">{item.value}</div>
              </div>
            ))}
          </div>

          {quiz.sections && quiz.sections.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-[#4DD7C8] mb-3 flex items-center gap-2">
                <Lock size={15} /> Section-wise schedule ({quiz.sections.length})
              </h3>
              <div className="space-y-2">
                {quiz.sections.map((section, index) => (
                  <div key={index} className="flex items-center justify-between bg-[#151E29] border border-white/[0.06] rounded-xl px-4 py-3 text-sm">
                    <span className="text-[#CBD5E1]">{section.name || `Section ${index + 1}`}</span>
                    <span className="text-[#94A3B8]">{section.questionIds.length} Qs · {section.duration} min</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {quiz.instructions && quiz.instructions.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-[#4DD7C8] mb-3">Instructions</h3>
              <ul className="space-y-2">
                {quiz.instructions.map((line, index) => (
                  <li key={index} className="flex gap-2.5 text-sm text-[#CBD5E1]">
                    <span className="text-[#18B6A4] font-semibold shrink-0">{index + 1}.</span> {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {quiz.proctoringRequired && (
            <div className="dark-banner-error mb-6 flex items-start gap-3">
              <ShieldCheck size={18} className="shrink-0 mt-0.5" />
              <div className="text-sm">
                This test is AI-proctored and must be taken inside the Eyeconic mobile app.
                <div className="mt-2"><OpenInAppButton destination={{ screen: 'quiz', quizId }} label="Open this Test in App" /></div>
              </div>
            </div>
          )}

          {actionError && <div className="dark-banner-error mb-6 text-sm">{actionError}</div>}

          {completed ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="inline-flex items-center gap-2 text-emerald-300 text-sm font-semibold">
                <CheckCircle2 size={16} /> Completed — {attemptStatus?.marksObtained ?? '—'} marks
              </div>
              {attemptStatus?.attemptId && (
                <Link to={`/tests/${quizId}/results/${attemptStatus.attemptId}`} className="btn btn-primary">
                  View Result
                </Link>
              )}
              <OpenInAppButton destination={{ screen: 'quiz', quizId }} />
            </div>
          ) : quiz.proctoringRequired ? null : scheduleInfo?.blocked ? (
            <div className="dark-banner-error text-sm flex items-center gap-2">
              <AlertTriangle size={16} /> {scheduleInfo.text}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={startAttempt} disabled={starting} className="btn btn-primary min-w-[12rem]">
                {starting ? <><Loader2 size={16} className="mr-2 animate-spin" /> Preparing…</>
                  : resumable ? <><PlayCircle size={16} className="mr-2" /> Resume Test</>
                  : <><PlayCircle size={16} className="mr-2" /> Start Test</>}
              </button>
              <OpenInAppButton destination={{ screen: 'quiz', quizId }} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default TestDetail;
