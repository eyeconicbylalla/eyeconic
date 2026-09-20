/**
 * Phase 3 unit tests — GT aggregation (spec §3.3):
 * the one-value-per-GT dedup rule and the transparent statistics.
 */

const {
  aggregate,
  selectAttemptPerGt,
  mean,
  median,
  trimmedMean,
  sampleSd,
  EXCLUSION_REASONS,
} = require('../../predictor/aggregation');

const completed = (corrects, extra = {}) => ({
  corrects,
  totalQuestions: 200,
  status: 'completed',
  endedAt: null,
  retestApprovedUsed: false,
  skippedCount: 0,
  ...extra,
});

describe('dedup rule — one value per GT (§3.3, Phase 1 audit G3)', () => {
  it('keeps the latest completed attempt', () => {
    const pick = selectAttemptPerGt({
      gtId: 'q1',
      provenance: 'auto-captured',
      attempts: [
        completed(100, { endedAt: 1000 }),
        completed(120, { endedAt: 2000 }),
        completed(110, { endedAt: 1500 }),
      ],
    });
    expect(pick.selected.corrects).toBe(120);
    expect(pick.excluded).toHaveLength(2);
    expect(pick.excluded.every((e) => e.reason === EXCLUSION_REASONS.SUPERSEDED)).toBe(true);
  });

  it('prefers an approved-and-used retest over a LATER plain attempt', () => {
    const pick = selectAttemptPerGt({
      gtId: 'q1',
      provenance: 'auto-captured',
      attempts: [
        completed(120, { endedAt: 5000 }), // later, but not the approved retest
        completed(105, { endedAt: 3000, retestApprovedUsed: true }),
      ],
    });
    expect(pick.selected.corrects).toBe(105);
    expect(pick.excluded[0]).toEqual({ corrects: 120, reason: EXCLUSION_REASONS.SUPERSEDED_RETEST });
  });

  it('among several retests, keeps the latest', () => {
    const pick = selectAttemptPerGt({
      gtId: 'q1',
      provenance: 'auto-captured',
      attempts: [
        completed(100, { endedAt: 1000, retestApprovedUsed: true }),
        completed(130, { endedAt: 2000, retestApprovedUsed: true }),
      ],
    });
    expect(pick.selected.corrects).toBe(130);
  });

  it('auto_submitted counts as completed; in_progress is excluded, not selected', () => {
    const pick = selectAttemptPerGt({
      gtId: 'q1',
      provenance: 'auto-captured',
      attempts: [
        completed(140, { status: 'auto_submitted', endedAt: 900 }),
        completed(150, { status: 'in_progress', endedAt: 9999 }),
      ],
    });
    expect(pick.selected.corrects).toBe(140);
    expect(pick.excluded).toEqual([{ corrects: 150, reason: EXCLUSION_REASONS.NOT_COMPLETED }]);
  });

  it('null endedAt sorts as oldest; array order breaks ties (later entry wins)', () => {
    const pick = selectAttemptPerGt({
      gtId: 'q1',
      provenance: 'auto-captured',
      attempts: [completed(100), completed(115)], // both endedAt null
    });
    expect(pick.selected.corrects).toBe(115);
  });

  it('returns null when nothing is completed (validation rejects this earlier)', () => {
    const pick = selectAttemptPerGt({
      gtId: 'q1',
      provenance: 'auto-captured',
      attempts: [completed(100, { status: 'abandoned' })],
    });
    expect(pick).toBeNull();
  });
});

describe('aggregation output', () => {
  it('reports selected values with per-GT provenance and exclusions', () => {
    const { perGt, stats } = aggregate([
      {
        gtId: 'q1',
        provenance: 'auto-captured',
        attempts: [completed(100, { endedAt: 1000 }), completed(120, { endedAt: 2000 })],
      },
      { gtId: null, provenance: 'self-reported', attempts: [completed(110)] },
    ]);
    expect(perGt[0].selected.corrects).toBe(120);
    expect(perGt[0].excluded).toEqual([{ corrects: 100, reason: EXCLUSION_REASONS.SUPERSEDED }]);
    expect(perGt[1].selected.corrects).toBe(110);
    expect(perGt[1].provenance).toBe('self-reported');
    expect(stats.values).toEqual([120, 110]);
  });

  it('computes mean, median, trimmed mean, sd, and range', () => {
    const { stats } = aggregate([
      { gtId: null, provenance: 'self-reported', attempts: [completed(90)] },
      { gtId: null, provenance: 'self-reported', attempts: [completed(140)] },
      { gtId: null, provenance: 'self-reported', attempts: [completed(115)] },
    ]);
    expect(stats.n).toBe(3);
    expect(stats.mean).toBeCloseTo(115, 10);
    expect(stats.median).toBe(115);
    expect(stats.trimmedMean).toBe(115); // drops 90 and 140, leaving 115
    expect(stats.sd).toBeCloseTo(25, 6); // sample sd of (90,140,115)
    expect(stats.min).toBe(90);
    expect(stats.max).toBe(140);
    expect(stats.range).toBe(50);
    expect(stats.aggregate).toBe('mean');
  });

  it('a single GT yields itself with sd 0 and trimmedMean null', () => {
    const { stats } = aggregate([{ gtId: null, provenance: 'self-reported', attempts: [completed(122)] }]);
    expect(stats.mean).toBe(122);
    expect(stats.sd).toBe(0);
    expect(stats.trimmedMean).toBeNull();
  });
});

describe('statistics primitives', () => {
  it('mean and median handle even and odd n', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 4])).toBe(4);
  });

  it('trimmedMean is null below TRIM_MIN_N and drops one min and one max', () => {
    expect(trimmedMean([1, 2])).toBeNull();
    expect(trimmedMean([10, 20, 30])).toBe(20);
    expect(trimmedMean([1, 2, 3, 4, 100])).toBe(3); // mean of 2,3,4
  });

  it('sampleSd: 0 for n<2, population-consistent for larger n', () => {
    expect(sampleSd([5])).toBe(0);
    expect(sampleSd([10, 10, 10])).toBe(0);
    expect(sampleSd([1, 3])).toBeCloseTo(Math.sqrt(2), 10);
  });
});
