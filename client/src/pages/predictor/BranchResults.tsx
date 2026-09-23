import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, ChevronLeft, ChevronRight, ArrowUp } from 'lucide-react';
import { predictorEndpoints, predictorErrorMessage } from '../../lib/predictorClient';
import type { BranchBand, BranchesResponse, BranchRow, PredictionResult } from '../../types/predictor';
import { BAND_META, BRANCH_COVERAGE_TEXT } from './constants';
import { fmtPct, fmtRank, yearFilterLabel } from './format';

type Summary = Exclude<PredictionResult['branches'], { coverage: 'CATEGORY_REQUIRED' }>;

/**
 * P1 — branch results, rebuilt. Constant context (category, quota, round
 * convention, years) is stated ONCE in the header instead of being repeated on
 * every row; rows render as a table on desktop and compact cards on mobile. A
 * sticky summary keeps the predicted ranges visible while scrolling. Filters
 * scroll horizontally on small screens (no wrapping chip soup).
 */
const BranchResults: React.FC<{
  predictionId: string;
  summary: Summary;
  result: PredictionResult;
}> = ({ predictionId, summary, result }) => {
  const [band, setBand] = useState<BranchBand | ''>('');
  const [year, setYear] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BranchesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [announce, setAnnounce] = useState('');

  const PAGE_SIZE = 25;
  const years = summary.dataCoverage.years;
  const isIniCet = result.exam === 'INI_CET';

  const bandCounts = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const y of summary.years) {
      for (const [key, count] of Object.entries(y.counts || {})) {
        if (key === 'total') continue;
        totals[key] = (totals[key] || 0) + count;
      }
    }
    totals.total = summary.years.reduce((acc, y) => acc + (y.counts?.total ?? 0), 0);
    return totals;
  }, [summary]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setAnnounce('Loading branch results…');
    try {
      const res = await predictorEndpoints.branches(predictionId, {
        ...(band ? { band } : {}),
        ...(year ? { year } : {}),
        page,
        limit: PAGE_SIZE,
      });
      setData(res);
      setAnnounce(
        res.total > 0
          ? `${res.total} option${res.total === 1 ? '' : 's'} loaded.`
          : 'No options for this filter.'
      );
    } catch (err) {
      setError(predictorErrorMessage(err, 'Could not load branch results.'));
      setAnnounce('Branch results failed to load.');
    } finally {
      setLoading(false);
    }
  }, [predictionId, band, year, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilterBand = (next: BranchBand | '') => {
    setBand((prev) => (prev === next ? '' : next));
    setPage(1);
  };
  const setFilterYear = (next: number | '') => {
    setYear(next);
    setPage(1);
  };

  const aboveAll = summary.years.some((y) => y.aboveAllClosings);
  const rows = data?.rows ?? [];

  return (
    <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl" data-anim="fade-up">
      {/* sticky summary — the ranges stay visible while scrolling rows (P1).
          Pins just below the fixed navbar, not underneath it. */}
      <div className="sticky top-[var(--nav-h)] z-20 rounded-t-2xl bg-[#18222E]/95 backdrop-blur border-b border-white/[0.06] px-5 sm:px-6 py-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="font-medium text-[#CBD5E1] flex items-center gap-2">
          <Award size={14} className="text-[#4DD7C8]" /> Possible branches &amp; colleges
        </span>
        <span className="text-[#94A3B8] tabular-nums">
          Percentile {fmtPct(result.estimate.percentile.range[0])}–{fmtPct(result.estimate.percentile.range[1])} · AIR{' '}
          {fmtRank(result.rank.bestRank)}–{fmtRank(result.rank.worstRank, result.rank.beyondLastRecordedRank)}
        </span>
        <span className="text-[#94A3B8]">
          {summary.category.value}
          {summary.category.pwd ? ' · PwD' : ''} · {summary.quota === 'INI' ? 'INI pool' : `${summary.quota} quota`}
        </span>
      </div>

      <div className="px-5 sm:px-6 pt-4 pb-6">
        <p className="text-xs text-[#94A3B8]">
          {BRANCH_COVERAGE_TEXT[summary.coverage] ?? ''} Closing ranks are{' '}
          <span className="text-[#CBD5E1]">final-state (end of counselling)</span> for{' '}
          {years.map(yearFilterLabel).join(' · ')}.
        </p>

        {aboveAll ? (
          <p className="mt-3 text-xs text-emerald-300/90 bg-emerald-500/[0.07] border border-emerald-500/20 rounded-xl p-3">
            Your range sits at or above the top of the historical admissions data — every listed
            option is comfortably within reach historically.
          </p>
        ) : null}

        {/* filters: chips scroll horizontally on small screens (no wrap soup) */}
        <div
          className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5"
          role="group"
          aria-label="Filter branch results"
        >
          <button
            type="button"
            onClick={() => setFilterBand('')}
            aria-pressed={band === ''}
            className={`shrink-0 text-xs rounded-full px-3 py-1.5 border transition ${
              band === ''
                ? 'bg-white/[0.08] text-[#F8FAFC] border-white/20'
                : 'text-[#94A3B8] border-white/10 hover:text-[#CBD5E1]'
            }`}
          >
            All bands ({bandCounts.total ?? 0})
          </button>
          {(Object.keys(BAND_META) as BranchBand[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterBand(key)}
              aria-pressed={band === key}
              title={BAND_META[key].hint}
              className={`shrink-0 text-xs rounded-full px-3 py-1.5 border transition ${
                band === key ? BAND_META[key].chip : 'text-[#94A3B8] border-white/10 hover:text-[#CBD5E1]'
              }`}
            >
              {BAND_META[key].label} ({bandCounts[key] ?? 0})
            </button>
          ))}
          <span className="shrink-0 w-px h-5 bg-white/10 mx-0.5" aria-hidden="true" />
          <select
            value={year}
            onChange={(e) => setFilterYear(e.target.value ? Number(e.target.value) : '')}
            aria-label={`Counselling ${isIniCet ? 'session' : 'year'}`}
            className="shrink-0 bg-[#151E29] border border-white/[0.1] rounded-full px-3 py-1.5 text-xs text-[#CBD5E1] outline-none focus:border-[#18B6A4]/60"
          >
            <option value="">All {isIniCet ? 'sessions' : 'years'}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {yearFilterLabel(y)}
              </option>
            ))}
          </select>
        </div>

        <span className="sr-only" aria-live="polite">
          {announce}
        </span>

        <div className="mt-4 min-h-[220px]">
          {loading ? (
            <div className="space-y-2" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-[#151E29] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-sm text-rose-300 py-6 text-center">
              <p className="mb-3">{error}</p>
              <button type="button" onClick={load} className="btn btn-outline text-xs px-3 py-1.5">
                Retry
              </button>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-8 text-center">
              No options for this filter — try another band or {isIniCet ? 'session' : 'year'}.
            </p>
          ) : (
            <div key={`${band}-${year}-${page}`} data-anim="fade">
              {/* desktop: a real table (constant context is in the header, not per-row) */}
              <table className="hidden md:table w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[#94A3B8]">
                    <th scope="col" className="py-2 pr-3 font-medium">College / institute</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Branch</th>
                    <th scope="col" className="py-2 pr-3 font-medium text-right">Closing rank</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{isIniCet ? 'Session' : 'Year'}</th>
                    <th scope="col" className="py-2 font-medium">Chance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: BranchRow, i: number) => (
                    <tr key={`${row.year}-${row.institute}-${row.branch}-${i}`} className="border-t border-white/[0.05]">
                      <td className="py-2.5 pr-3 text-[#F8FAFC] max-w-[280px] truncate" title={row.institute}>
                        {row.institute}
                      </td>
                      <td className="py-2.5 pr-3 text-[#4DD7C8] max-w-[180px] truncate" title={row.branch}>
                        {row.branch}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-[#CBD5E1] tabular-nums">
                        {row.closingRank.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 pr-3 text-[#94A3B8] whitespace-nowrap">{yearFilterLabel(row.year)}</td>
                      <td className="py-2.5">
                        <span
                          className={`inline-block text-[11px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${BAND_META[row.band].chip}`}
                          title={BAND_META[row.band].hint}
                        >
                          {BAND_META[row.band].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* mobile: compact cards */}
              <div className="md:hidden space-y-2">
                {rows.map((row: BranchRow, i: number) => (
                  <div
                    key={`${row.year}-${row.institute}-${row.branch}-${i}`}
                    className="bg-[#151E29] border border-white/[0.06] rounded-xl p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#F8FAFC] truncate">{row.institute}</p>
                        <p className="text-xs text-[#4DD7C8] mt-0.5">{row.branch}</p>
                      </div>
                      <span
                        className={`shrink-0 text-[11px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${BAND_META[row.band].chip}`}
                      >
                        {BAND_META[row.band].label}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#94A3B8] mt-2">
                      Closing rank <strong className="text-[#CBD5E1]">{row.closingRank.toLocaleString('en-IN')}</strong>
                      {' '}· {yearFilterLabel(row.year)}
                    </p>
                  </div>
                ))}
              </div>

              {/* pagination */}
              <div className="flex flex-wrap items-center justify-between gap-3 mt-5 text-xs text-[#94A3B8]">
                <span className="tabular-nums">
                  Page {data?.filters.page ?? 1} of {Math.max(1, data?.totalPages ?? 1)} ·{' '}
                  {(data?.total ?? 0).toLocaleString('en-IN')} options
                </span>
                <span className="flex items-center gap-2">
                  {page > 1 ? (
                    <button
                      type="button"
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      className="btn btn-outline !px-3 !py-2 text-xs"
                    >
                      <ArrowUp size={13} className="mr-1" /> Top
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="btn btn-outline !px-3.5 !py-2 disabled:opacity-30"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={page >= (data?.totalPages ?? 1)}
                    onClick={() => setPage(page + 1)}
                    className="btn btn-outline !px-3.5 !py-2 disabled:opacity-30"
                    aria-label="Next page"
                  >
                    <ChevronRight size={14} />
                  </button>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* §12/§14 framing — one line, next to the results */}
        <p className="mt-5 pt-4 border-t border-white/[0.06] text-[11px] text-[#94A3B8]">
          Historical possibility, not a guarantee — cutoffs move every year with seat matrices,
          candidate behaviour, and exam difficulty.
        </p>
      </div>
    </div>
  );
};

export default BranchResults;
