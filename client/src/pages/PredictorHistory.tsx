import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, History, Loader2, Target } from 'lucide-react';
import { predictorEndpoints, predictorErrorMessage } from '../lib/predictorClient';
import type { PredictionHistoryItem, PredictionResult, StoredPredictionRecord } from '../types/predictor';
import { EXAM_LABELS } from './predictor/constants';
import { fmtPct, fmtRank } from './predictor/format';
import ResultView from './predictor/ResultView';

/**
 * P3 — prediction history (§18 Phase 9's "stored AND retrievable" promise,
 * finally visible): every prediction the student has run, newest first, each
 * re-openable as the full result view (branch rows + outcome capture included
 * — they work off the stored predictionId).
 */
const PAGE_SIZE = 10;

const HistoryList: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const [items, setItems] = useState<PredictionHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const data = await predictorEndpoints.history(p, PAGE_SIZE);
      setItems(data.predictions);
      setPage(data.pagination.page);
      setTotalPages(Math.max(1, data.pagination.totalPages));
      setTotal(data.pagination.total);
    } catch (err) {
      setError(predictorErrorMessage(err, 'Could not load your history.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div data-anim="fade-up">
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6">
        <h3 className="font-semibold text-[#F8FAFC] flex items-center gap-2 mb-1">
          <History size={16} className="text-[#4DD7C8]" /> Your predictions
        </h3>
        <p className="text-xs text-[#94A3B8] mb-5">
          Every prediction is saved with the exact data it ran against — {total}{' '}
          {total === 1 ? 'prediction' : 'predictions'} so far.
        </p>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 bg-[#151E29] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-rose-300 py-4 text-center">
            <p className="mb-3">{error}</p>
            <button type="button" onClick={() => load(page)} className="btn btn-outline text-xs px-3 py-1.5">
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8">
            <Target className="w-9 h-9 text-[#18B6A4] mx-auto mb-3" />
            <p className="text-[#CBD5E1] text-sm">No predictions yet.</p>
            <p className="text-xs text-[#94A3B8] mt-1 mb-4">Run your first one — it takes a minute.</p>
          </div>
        ) : (
          <ul className="space-y-2.5" data-stagger>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className="w-full text-left bg-[#151E29] border border-white/[0.06] rounded-xl p-4 hover:border-[#18B6A4]/40 transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-xs text-[#94A3B8]">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-[#CBD5E1] border border-white/10 rounded-full px-2 py-0.5">
                        {EXAM_LABELS[item.exam] ?? item.exam}
                      </span>
                      {item.gtsUsed ?? '—'} GT{item.gtsUsed === 1 ? '' : 's'}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
                      <Clock size={12} />
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-[#F8FAFC] tabular-nums">
                    {item.percentileRange ? (
                      <span>
                        Percentile{' '}
                        <strong>
                          {fmtPct(item.percentileRange[0])}–{fmtPct(item.percentileRange[1])}
                        </strong>
                      </span>
                    ) : null}
                    {item.rankRange ? (
                      <span>
                        AIR{' '}
                        <strong>
                          {fmtRank(item.rankRange[0] ?? null)}–{fmtRank(item.rankRange[1] ?? null)}
                        </strong>
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-[#94A3B8] mt-1.5">
                    {item.branchesCoverage === 'CATEGORY_REQUIRED'
                      ? 'No category selected — rank only'
                      : 'Branch predictions included'}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && totalPages > 1 ? (
          <div className="flex items-center justify-between mt-5 text-xs text-[#94A3B8]">
            <span>
              Page {page} of {totalPages}
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => load(page - 1)}
                className="btn btn-outline !px-3.5 !py-2 disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => load(page + 1)}
                className="btn btn-outline !px-3.5 !py-2 disabled:opacity-30"
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const HistoryDetail: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const [record, setRecord] = useState<StoredPredictionRecord | null>(null);
  const [integrityMatches, setIntegrityMatches] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await predictorEndpoints.historyItem(id);
        if (cancelled) return;
        setRecord(data.prediction);
        setIntegrityMatches(data.integrity.matches);
      } catch (err) {
        if (!cancelled) setError(predictorErrorMessage(err, 'Could not load this prediction.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" role="status" aria-label="Loading prediction">
        <Loader2 className="w-8 h-8 text-[#18B6A4] animate-spin" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-8 text-center" data-anim="fade-up">
        <p className="text-sm text-rose-300 mb-4">{error || 'Prediction not found.'}</p>
        <button type="button" onClick={onBack} className="btn btn-outline text-sm px-4 py-2">
          Back to history
        </button>
      </div>
    );
  }

  const result: PredictionResult = {
    ...record,
    examLabel: EXAM_LABELS[record.exam] ?? record.exam,
  };

  return (
    <ResultView
      result={result}
      predictionId={id}
      onBack={onBack}
      backLabel="Back to history"
      integrityWarning={!integrityMatches}
      readonly
    />
  );
};

const PredictorHistory: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Prediction History | EyeConic NEET PG';
    return () => {
      document.title = 'EyeConic NEET PG';
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  return (
    <section className="ec-predictor py-10 md:py-14 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] flex items-center gap-3">
            <History size={26} className="text-[#4DD7C8]" /> Prediction history
          </h2>
          <p className="text-[#94A3B8] text-sm mt-2">
            Every prediction you run is saved — reopen any of them exactly as it was served.
          </p>
        </div>
        {id ? (
          <HistoryDetail id={id} onBack={() => navigate('/predictor/history')} />
        ) : (
          <HistoryList onOpen={(itemId) => navigate(`/predictor/history/${itemId}`)} />
        )}
      </div>
    </section>
  );
};

export default PredictorHistory;
