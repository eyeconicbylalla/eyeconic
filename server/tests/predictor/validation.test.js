/**
 * Phase 3 unit tests — GT input validation (spec §3.5–§3.6).
 * Values outside bounds must be REJECTED with clear messages, never clamped.
 */

const {
  validateRequest,
  validateForBranches,
  toEpochMs,
} = require('../../predictor/validation');
const { CODES, PredictorError } = require('../../predictor/errors');

const manualGt = (corrects, extra = {}) => ({
  provenance: 'self-reported',
  attempts: [{ corrects, ...extra }],
});

function expectInvalid(fn, fieldSubstring) {
  let err = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(PredictorError);
  expect(err.code).toBe(CODES.INVALID_INPUT);
  if (fieldSubstring) {
    expect(err.details.field).toContain(fieldSubstring);
  }
  return err;
}

describe('predictor validation — exam selection', () => {
  it('accepts NEET PG with a single manual GT', () => {
    const ctx = validateRequest({ exam: 'NEET_PG', gts: [manualGt(120)] });
    expect(ctx.exam.id).toBe('NEET_PG');
    expect(ctx.gts).toHaveLength(1);
  });

  it('rejects an unknown exam id', () => {
    expectInvalid(() => validateRequest({ exam: 'FMGE', gts: [manualGt(100)] }), 'exam');
  });

  it('rejects a missing exam', () => {
    expectInvalid(() => validateRequest({ gts: [manualGt(100)] }), 'exam');
  });

  it('accepts INI-CET (live since M2) with the single INI pool quota', () => {
    const v = validateRequest({ exam: 'INI_CET', gts: [manualGt(100)] });
    expect(v.exam.id).toBe('INI_CET');
    expect(v.quota).toBe('INI');
    expect(v.quotaDefaulted).toBe(true); // §3.6: single pool, no quota selection
  });
});

describe('predictor validation — GT rules (§3.5)', () => {
  const base = { exam: 'NEET_PG' };

  it('requires at least one GT', () => {
    expectInvalid(() => validateRequest({ ...base, gts: [] }), 'gts');
    expectInvalid(() => validateRequest({ ...base }), 'gts');
  });

  it('has no maximum — 12 GTs are accepted', () => {
    const gts = Array.from({ length: 12 }, (_, i) => manualGt(100 + i));
    const ctx = validateRequest({ ...base, gts });
    expect(ctx.gts).toHaveLength(12);
  });

  it('accepts 0 and 180 corrects (inclusive bounds of the 180-question pattern)', () => {
    expect(() => validateRequest({ ...base, gts: [manualGt(0), manualGt(180)] })).not.toThrow();
  });

  it('rejects negatives, decimals, non-numbers, and out-of-pattern values', () => {
    expectInvalid(() => validateRequest({ ...base, gts: [manualGt(-1)] }), 'corrects');
    expectInvalid(() => validateRequest({ ...base, gts: [manualGt(12.5)] }), 'corrects');
    expectInvalid(() => validateRequest({ ...base, gts: [manualGt('120')] }), 'corrects');
    expectInvalid(() => validateRequest({ ...base, gts: [manualGt(null)] }), 'corrects');
    expectInvalid(() => validateRequest({ ...base, gts: [manualGt(181)] }), 'corrects');
    expectInvalid(() => validateRequest({ ...base, gts: [manualGt(9999)] }), 'corrects');
  });

  it('rejects non-full-length totals (§3.4 Assumption 2) — including the retired 200-question pattern', () => {
    expectInvalid(
      () => validateRequest({ ...base, gts: [manualGt(90, { totalQuestions: 100 })] }),
      'totalQuestions'
    );
    expectInvalid(
      () => validateRequest({ ...base, gts: [manualGt(90, { totalQuestions: 200 })] }),
      'totalQuestions'
    );
  });

  it('accepts an explicit full-length total (180)', () => {
    const ctx = validateRequest({ ...base, gts: [manualGt(90, { totalQuestions: 180 })] });
    expect(ctx.gts[0].attempts[0].totalQuestions).toBe(180);
  });

  it('rejects corrects above a supplied total', () => {
    // totalQuestions is pinned to 180 by the full-length rule; the bound check
    // itself is exercised with the pattern default via corrects > 180 above.
    expectInvalid(() => validateRequest({ ...base, gts: [manualGt(181, { totalQuestions: 180 })] }), 'corrects');
  });

  it('INI-CET keeps its own 200-question pattern (200 accepted, 201 rejected)', () => {
    expect(() =>
      validateRequest({ exam: 'INI_CET', gts: [manualGt(0), manualGt(200)] })
    ).not.toThrow();
    expectInvalid(() => validateRequest({ exam: 'INI_CET', gts: [manualGt(201)] }), 'corrects');
    const ctx = validateRequest({
      exam: 'INI_CET',
      gts: [manualGt(150, { totalQuestions: 200 })],
    });
    expect(ctx.gts[0].attempts[0].totalQuestions).toBe(200);
  });

  it('rejects untagged or wrongly-tagged provenance (§6A)', () => {
    expectInvalid(() => validateRequest({ ...base, gts: [{ attempts: [{ corrects: 100 }] }] }), 'provenance');
    expectInvalid(
      () => validateRequest({ ...base, gts: [{ provenance: 'guessed', attempts: [{ corrects: 100 }] }] }),
      'provenance'
    );
  });

  it('requires auto-captured GTs to carry a gtId', () => {
    expectInvalid(
      () => validateRequest({ ...base, gts: [{ provenance: 'auto-captured', attempts: [{ corrects: 100 }] }] }),
      'gts[0]'
    );
    expect(() =>
      validateRequest({
        ...base,
        gts: [{ gtId: 'q1', provenance: 'auto-captured', attempts: [{ corrects: 100 }] }],
      })
    ).not.toThrow();
  });

  it('rejects a GT with no completed attempt (nothing silently dropped)', () => {
    expectInvalid(
      () =>
        validateRequest({
          ...base,
          gts: [manualGt(100), { gtId: 'q2', provenance: 'auto-captured', attempts: [{ corrects: 90, status: 'in_progress' }] }],
        }),
      'gts[1].attempts'
    );
  });

  it('normalizes endedAt from ISO strings, Dates, and epoch ms; null stays null', () => {
    const ctx = validateRequest({
      ...base,
      gts: [
        {
          gtId: 'q1',
          provenance: 'auto-captured',
          attempts: [
            { corrects: 100, endedAt: '2026-09-01T10:00:00Z' },
            { corrects: 110, endedAt: new Date('2026-09-02T10:00:00Z').getTime() },
            { corrects: 120, endedAt: new Date('2026-09-03T10:00:00Z') },
            { corrects: 130 },
          ],
        },
      ],
    });
    const ended = ctx.gts[0].attempts.map((a) => a.endedAt);
    expect(ended[0]).toBe(Date.parse('2026-09-01T10:00:00Z'));
    expect(ended[1]).toBe(Date.parse('2026-09-02T10:00:00Z'));
    expect(ended[2]).toBe(Date.parse('2026-09-03T10:00:00Z'));
    expect(ended[3]).toBeNull();
  });

  it('defaults missing status to completed and validates skippedCount', () => {
    const ctx = validateRequest({
      ...base,
      gts: [{ gtId: 'q1', provenance: 'auto-captured', attempts: [{ corrects: 100, skippedCount: 3 }] }],
    });
    expect(ctx.gts[0].attempts[0].status).toBe('completed');
    expect(ctx.gts[0].attempts[0].skippedCount).toBe(3);
    expectInvalid(
      () =>
        validateRequest({
          ...base,
          gts: [{ gtId: 'q1', provenance: 'auto-captured', attempts: [{ corrects: 100, skippedCount: -1 }] }],
        }),
      'skippedCount'
    );
  });
});

describe('predictor validation — category & quota (§3.6)', () => {
  const base = { exam: 'NEET_PG', gts: [manualGt(120)] };

  it('accepts each canonical category, with and without PwD', () => {
    for (const category of ['UR', 'EWS', 'OBC', 'SC', 'ST']) {
      const ctx = validateRequest({ ...base, category });
      expect(ctx.category).toEqual({ value: category, pwd: false });
      const ctxPwd = validateRequest({ ...base, category, pwd: true });
      expect(ctxPwd.category).toEqual({ value: category, pwd: true });
    }
  });

  it('rejects unknown categories and non-boolean pwd', () => {
    expectInvalid(() => validateRequest({ ...base, category: 'General' }), 'category');
    expectInvalid(() => validateRequest({ ...base, category: 'UR', pwd: 'yes' }), 'pwd');
  });

  it('category stays null when absent — never defaulted (§3.6)', () => {
    const ctx = validateRequest({ ...base });
    expect(ctx.category).toBeNull();
  });

  it('pwd without category is rejected', () => {
    expectInvalid(() => validateRequest({ ...base, pwd: true }), 'category');
  });

  it('quota: absent → AIQ echoed as defaulted; AIQ accepted; anything else rejected', () => {
    const defaulted = validateRequest({ ...base });
    expect(defaulted.quota).toBe('AIQ');
    expect(defaulted.quotaDefaulted).toBe(true);

    const explicit = validateRequest({ ...base, quota: 'AIQ' });
    expect(explicit.quota).toBe('AIQ');
    expect(explicit.quotaDefaulted).toBe(false);

    expectInvalid(() => validateRequest({ ...base, quota: 'DU' }), 'quota');
  });

  it('validateForBranches requires a category (Phase 6 gate)', () => {
    const ctx = validateRequest({ ...base });
    expectInvalid(() => validateForBranches(ctx));
    const withCat = validateRequest({ ...base, category: 'OBC' });
    expect(validateForBranches(withCat)).toEqual({ value: 'OBC', pwd: false });
  });
});

describe('predictor validation — toEpochMs helper', () => {
  it('handles null, garbage, and valid values', () => {
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs(undefined)).toBeNull();
    expect(toEpochMs('not-a-date')).toBeNull();
    expect(toEpochMs(1234567890)).toBe(1234567890);
    expect(toEpochMs('2026-01-01T00:00:00Z')).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });
});
