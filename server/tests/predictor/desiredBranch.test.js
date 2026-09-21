/**
 * Desired Branch Predictor — Phase 1 unit tests (docs/DESIRED_BRANCH_PREDICTOR.md
 * §6.2): the normalized branch catalog and the branch → historical target
 * rank resolver, on the committed snapshots (golden-pinned, same discipline as
 * store/branchAcceptance tests — the snapshots are hash-verified, so any
 * golden change must come from a re-verified source) plus synthetic fixtures
 * for edge states (test inputs only — never stored as data, §4).
 */

const {
  normalizeKey,
  buildBranchCatalog,
  resolveTarget,
} = require('../../predictor/desiredBranch');
const { buildCounsellingIndex } = require('../../predictor/branchMatching');
const store = require('../../predictor/store');
const { PredictorError, CODES } = require('../../predictor/errors');
const { DESIRED_BRANCH } = require('../../predictor/config');

// ---- real indexes (committed, hash-verified store) ---------------------------

const neetIdx = [2024, 2025].map((y) => buildCounsellingIndex(store.loadNeetPgCounselling(y).data));
const iniIdx = ['2023-01', '2024-01', '2024-07', '2025-01', '2025-07', '2026-01'].map((s) =>
  buildCounsellingIndex(store.loadIniCetCounselling(s).data)
);

// ---- synthetic fixtures (edge states) ----------------------------------------

/** Two-year fixture: same branch under different raw spellings across years. */
function fixtureIndexes() {
  const y2024 = buildCounsellingIndex({
    snapshot_id: 'DS-TEST-A-2024',
    exam_year: 2024,
    quota_enum: ['AIQ', 'DNB'],
    category_enum: ['UR', 'OBC'],
    institutes: ['Inst A', 'Inst B'],
    courses: ['MD Surgery'],
    rows: [
      // [inst, course, quota, cat, pwd, closing, opening, count]
      [0, 0, 0, 0, 0, 1000, 500, 2], // UR, AIQ
      [1, 0, 0, 1, 0, 3000, 1500, 2], // OBC, AIQ
      [0, 0, 1, 0, 0, 999999, 999998, 1], // DNB quota — outside the AIQ pool
    ],
  });
  const y2025 = buildCounsellingIndex({
    snapshot_id: 'DS-TEST-A-2025',
    exam_year: 2025,
    quota_enum: ['AIQ'],
    category_enum: ['UR'],
    institutes: ['Inst A', 'Inst C'],
    // different spacing/case of the SAME branch — must merge onto one key
    courses: ['md  SURGERY'],
    rows: [
      [0, 0, 0, 0, 0, 900, 400, 3], // UR tie with 2024's 1000? no: 900 < 1000
      [1, 0, 0, 0, 1, 250, 100, 1], // UR-PwD
    ],
  });
  const y2026 = buildCounsellingIndex({
    snapshot_id: 'DS-TEST-A-2026',
    exam_year: 2026,
    quota_enum: ['AIQ'],
    category_enum: ['UR'],
    institutes: ['Inst D'],
    courses: ['MD Paediatrics'], // Surgery absent entirely this year
    rows: [[0, 0, 0, 0, 0, 5000, 4000, 1]],
  });
  return [y2024, y2025, y2026];
}

describe('normalizeKey — name-normalization-v1 key algorithm', () => {
  it('collapses the 2024 mirror’s embedded \\r\\n artifacts (real variant)', () => {
    expect(normalizeKey('M.D. (GENERAL\r\nMEDICINE)')).toBe('m.d. (general medicine)');
  });

  it('trims, collapses internal whitespace, lowercases; idempotent', () => {
    expect(normalizeKey('  MD   Radiology ')).toBe('md radiology');
    expect(normalizeKey('MD Radiology')).toBe(normalizeKey(normalizeKey(' md  radiology ')));
  });

  it('rejects non-strings', () => {
    expect(() => normalizeKey(42)).toThrow(TypeError);
  });
});

describe('buildBranchCatalog — NEET PG (committed snapshots, AIQ pool)', () => {
  const catalog = buildBranchCatalog({ indexes: neetIdx, quota: 'AIQ' });

  it('is scoped to the counselling pool: AIQ branches only (75 golden)', () => {
    // '(NBEMS) GENERAL MEDICINE' etc. are DNB-quota course keys — excluded.
    expect(catalog.branches).toHaveLength(75);
    expect(catalog.branches.find((b) => b.key === '(nbems) general medicine')).toBeUndefined();
    expect(catalog.builtFrom.map((b) => b.year)).toEqual([2024, 2025]);
  });

  it('merges years onto normalized keys with per-year group/institute counts (golden)', () => {
    const gm = catalog.branches.find((b) => b.key === 'm.d. (general medicine)');
    expect(gm).toBeDefined();
    expect(gm.perYear).toEqual({
      2024: { groups: 1027, instituteCount: 349 },
      2025: { groups: 1138, instituteCount: 396 },
    });
    // both raw spellings kept as variants, including the \r\n artifact
    expect(gm.variants).toContain('M.D. (GENERAL\r\nMEDICINE)');
    expect(gm.variants).toContain('M.D. (GENERAL MEDICINE)');
    // representative display comes from the LATEST year carrying the key
    expect(gm.display).toBe('M.D. (GENERAL MEDICINE)');
  });

  it('keeps every catalog entry internally consistent (key = normalizeKey(display))', () => {
    for (const b of catalog.branches) {
      expect(b.key).toBeTruthy();
      expect(b.variants.length).toBeGreaterThan(0);
      for (const v of b.variants) expect(normalizeKey(v)).toBe(b.key);
      expect(normalizeKey(b.display)).toBe(b.key);
    }
  });

  it('sorts branches by display for a stable picker order', () => {
    const displays = catalog.branches.map((b) => b.display);
    const sorted = [...displays].sort((a, b) => a.localeCompare(b));
    expect(displays).toEqual(sorted);
  });
});

describe('buildBranchCatalog — INI-CET (committed snapshots, INI pool)', () => {
  const catalog = buildBranchCatalog({ indexes: iniIdx, quota: 'INI' });

  it('carries the six YYYYMM session tags with session strings (Jan/Jul distinct)', () => {
    expect(catalog.builtFrom.map((b) => b.year)).toEqual([202301, 202401, 202407, 202501, 202507, 202601]);
    expect(catalog.builtFrom.map((b) => b.session)).toEqual([
      '2023-01', '2024-01', '2024-07', '2025-01', '2025-07', '2026-01',
    ]);
    expect(catalog.branches).toHaveLength(105); // golden
  });

  it('covers GENERAL MEDICINE in all six sessions', () => {
    const gm = catalog.branches.find((b) => b.key === 'general medicine');
    expect(gm).toBeDefined();
    expect(gm.display).toBe('GENERAL MEDICINE');
    expect(Object.keys(gm.perYear)).toEqual(['202301', '202401', '202407', '202501', '202507', '202601']);
    expect(gm.perYear['202507'].groups).toBe(65); // golden
  });
});

describe('buildBranchCatalog — synthetic edge behavior', () => {
  it('merges differently-spelled raw course strings across years onto one key', () => {
    const catalog = buildBranchCatalog({ indexes: fixtureIndexes(), quota: 'AIQ' });
    const surgery = catalog.branches.find((b) => b.key === 'md surgery');
    expect(surgery.variants.sort()).toEqual(['MD Surgery', 'md  SURGERY'].sort());
    expect(Object.keys(surgery.perYear)).toEqual(['2024', '2025']);
    // DNB row excluded from AIQ counts (2024: 2 AIQ groups, 2 institutes)
    expect(surgery.perYear[2024]).toEqual({ groups: 2, instituteCount: 2 });
  });

  it('rejects empty/non-array indexes and a missing pool quota', () => {
    expect(() => buildBranchCatalog({ indexes: [], quota: 'AIQ' })).toThrow(TypeError);
    expect(() => buildBranchCatalog({ indexes: fixtureIndexes() })).toThrow(TypeError);
  });
});

describe('resolveTarget — NEET PG real data (D1 target semantics)', () => {
  it('UR non-PwD General Medicine: per-year ranges + [tightest, loosest] target (golden)', () => {
    const t = resolveTarget({
      indexes: neetIdx, branchKey: 'm.d. (general medicine)', category: 'UR', pwd: false, quota: 'AIQ',
    });
    expect(t.stage).toBe('TARGET_RANK');
    expect(t.coverage).toBe('MATCHED');
    expect(t.branch.display).toBe('M.D. (GENERAL MEDICINE)');
    const y24 = t.years.find((y) => y.year === 2024);
    const y25 = t.years.find((y) => y.year === 2025);
    expect(y24).toMatchObject({ present: true, matched: true, groups: 282, closingMin: 49, closingMax: 5491 });
    expect(y25).toMatchObject({ present: true, matched: true, groups: 312, closingMin: 13, closingMax: 9511 });
    // D1: tightest historical closing across years → safe end; loosest → likely end
    expect(t.targetRankRange).toEqual([13, 9511]);
    expect(t.tightest).toMatchObject({ closing: 13, year: 2025, opening: 13, allottedCount: 1 });
    expect(t.tightest.institute).toContain('RML');
    expect(t.loosest).toMatchObject({ closing: 9511, year: 2025 });
    expect(t.loosest.institute).toContain('NAMO');
    // branch-only (D2): ends NAME their institutes; wide spread is flagged
    expect(t.variability).toEqual({ tightest: 13, loosest: 9511, ratio: 731.62, high: true });
    expect(t.notes.join(' ')).toContain('wide');
    expect(t.dataCoverage.matchedYears).toEqual([2024, 2025]);
  });

  it('reserved-category targets differ from UR (§3.6 principle, real data)', () => {
    const obc = resolveTarget({
      indexes: neetIdx, branchKey: 'm.d. (general medicine)', category: 'OBC', pwd: false, quota: 'AIQ',
    });
    expect(obc.coverage).toBe('MATCHED');
    expect(obc.targetRankRange).toEqual([174, 10075]); // golden — not the UR range
    expect(obc.category).toEqual({ value: 'OBC', pwd: false });
  });

  it('SINGLE_YEAR: key present both years but matched in 2025 only (golden)', () => {
    const t = resolveTarget({
      indexes: neetIdx, branchKey: 'dip. in forensic medicine', category: 'UR', pwd: false, quota: 'AIQ',
    });
    expect(t.coverage).toBe('SINGLE_YEAR');
    expect(t.years.find((y) => y.year === 2024)).toMatchObject({ present: true, matched: false, groups: 0 });
    expect(t.years.find((y) => y.year === 2025)).toMatchObject({ present: true, matched: true, groups: 2 });
    expect(t.targetRankRange).toEqual([85144, 121667]);
    expect(t.notes.join(' ')).toContain('single counselling cycle');
  });
});

describe('resolveTarget — INI-CET real data (session semantics)', () => {
  it('UR non-PwD General Medicine across six sessions; AIIMS-New-Delhi tight end (golden)', () => {
    const t = resolveTarget({
      indexes: iniIdx, branchKey: 'general medicine', category: 'UR', pwd: false, quota: 'INI',
    });
    expect(t.coverage).toBe('MATCHED');
    expect(t.targetRankRange).toEqual([4, 2910]);
    // matches the pinned inicetStore golden: AIIMS ND GenMed UR closes at 4 (Jul-2025)
    expect(t.tightest).toMatchObject({ closing: 4, year: 202507, session: '2025-07', institute: 'AIIMS NEW DELHI' });
    expect(t.loosest).toMatchObject({ closing: 2910, year: 202601, session: '2026-01' });
    const sess = t.years.map((y) => y.session);
    expect(sess).toEqual(['2023-01', '2024-01', '2024-07', '2025-01', '2025-07', '2026-01']);
    // every year entry is session-tagged with its own snapshot id
    for (const y of t.years) {
      expect(y.snapshotId).toMatch(/^DS-INICET-COUNSELLING-\d{6}-v1$/);
    }
  });

  it('PwD filter isolates PwD seats (real data, golden range)', () => {
    const t = resolveTarget({
      indexes: iniIdx, branchKey: 'general medicine', category: 'UR', pwd: true, quota: 'INI',
    });
    expect(t.coverage).toBe('MATCHED');
    expect(t.targetRankRange).toEqual([659, 47087]);
    expect(t.category).toEqual({ value: 'UR', pwd: true });
  });

  it('NO_DATA_FOR_FILTER: branch exists but never closed for ST non-PwD', () => {
    const t = resolveTarget({
      indexes: iniIdx, branchKey: 'dermatology, venerology & leprosy', category: 'ST', pwd: false, quota: 'INI',
    });
    expect(t.coverage).toBe('NO_DATA_FOR_FILTER');
    expect(t.targetRankRange).toBeNull();
    expect(t.variability).toBeNull();
    expect(t.years.every((y) => !y.matched)).toBe(true);
    // present flags still tell the UI where the branch existed at all
    expect(t.years.filter((y) => y.present).map((y) => y.session)).toEqual(['2025-01', '2025-07']);
    expect(t.notes[0]).toContain('ST');
  });
});

describe('resolveTarget — input validation and unknown branches', () => {
  it('throws INVALID_INPUT with near-miss suggestions for an unknown branch', () => {
    let err = null;
    try {
      resolveTarget({ indexes: neetIdx, branchKey: 'general medicin', category: 'UR', pwd: false, quota: 'AIQ' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PredictorError);
    expect(err.code).toBe(CODES.INVALID_INPUT);
    expect(err.details).toMatchObject({ field: 'branchKey', reason: 'unknown-branch' });
    expect(err.details.suggestions).toContain('m.d. (general medicine)');
    expect(err.message).toContain('Did you mean');
  });

  it('normalizes the incoming branchKey defensively (case/whitespace tolerated)', () => {
    const t = resolveTarget({
      indexes: iniIdx, branchKey: '  GENERAL  Medicine ', category: 'UR', pwd: false, quota: 'INI',
    });
    expect(t.coverage).toBe('MATCHED');
    expect(t.branch.key).toBe('general medicine');
  });

  it('requires a category (never defaulted — §3.6) and a boolean pwd', () => {
    expect(() =>
      resolveTarget({ indexes: neetIdx, branchKey: 'm.d. (general medicine)', category: '', pwd: false, quota: 'AIQ' })
    ).toThrow(PredictorError);
    expect(() =>
      resolveTarget({ indexes: neetIdx, branchKey: 'm.d. (general medicine)', pwd: false, quota: 'AIQ' })
    ).toThrow(/Category is required/);
    expect(() =>
      resolveTarget({ indexes: neetIdx, branchKey: 'm.d. (general medicine)', category: 'UR', pwd: 'no', quota: 'AIQ' })
    ).toThrow(/pwd must be true or false/);
  });

  it('rejects an empty branch key', () => {
    expect(() =>
      resolveTarget({ indexes: neetIdx, branchKey: '   ', category: 'UR', pwd: false, quota: 'AIQ' })
    ).toThrow(/Select the branch/);
  });
});

describe('resolveTarget — synthetic fixture semantics', () => {
  const indexes = fixtureIndexes();

  it('filters by quota/category/pwd within years and reports per-year presence', () => {
    const t = resolveTarget({ indexes, branchKey: 'md surgery', category: 'UR', pwd: false, quota: 'AIQ' });
    expect(t.coverage).toBe('MATCHED');
    const [y24, y25, y26] = t.years;
    // 2024: UR non-PwD = 1 group (the OBC row and the DNB row are excluded)
    expect(y24).toMatchObject({ present: true, matched: true, groups: 1, closingMin: 1000, closingMax: 1000 });
    expect(y25).toMatchObject({ present: true, matched: true, groups: 1, closingMin: 900, closingMax: 900 });
    // 2026: the branch does not exist at all
    expect(y26).toMatchObject({ present: false, matched: false, groups: 0 });
    expect(t.targetRankRange).toEqual([900, 1000]);
    expect(t.tightest).toMatchObject({ closing: 900, year: 2025, institute: 'Inst A' });
    expect(t.loosest).toMatchObject({ closing: 1000, year: 2024, institute: 'Inst A' });
    expect(t.dataCoverage.matchedYears).toEqual([2024, 2025]);
  });

  it('PwD queries only see PwD rows; missing everywhere yields NO_DATA_FOR_FILTER', () => {
    const pwd = resolveTarget({ indexes, branchKey: 'md surgery', category: 'UR', pwd: true, quota: 'AIQ' });
    expect(pwd.coverage).toBe('SINGLE_YEAR'); // only the 2025 PwD row
    expect(pwd.years.find((y) => y.year === 2025).groups).toBe(1);
    expect(pwd.targetRankRange).toEqual([250, 250]);

    const miss = resolveTarget({ indexes, branchKey: 'md paediatrics', category: 'OBC', pwd: false, quota: 'AIQ' });
    expect(miss.coverage).toBe('NO_DATA_FOR_FILTER');
    expect(miss.years.find((y) => y.year === 2026)).toMatchObject({ present: true, matched: false });
  });

  it('breaks tight/loose ties deterministically (first index in config order wins)', () => {
    const tieA = buildCounsellingIndex({
      snapshot_id: 'DS-TEST-TIE-A', exam_year: 2024, quota_enum: ['AIQ'], category_enum: ['UR'],
      institutes: ['First Inst'], courses: ['MD X'],
      rows: [[0, 0, 0, 0, 0, 500, 100, 1]],
    });
    const tieB = buildCounsellingIndex({
      snapshot_id: 'DS-TEST-TIE-B', exam_year: 2025, quota_enum: ['AIQ'], category_enum: ['UR'],
      institutes: ['Second Inst'], courses: ['MD X'],
      rows: [[0, 0, 0, 0, 0, 500, 100, 1]],
    });
    const t = resolveTarget({ indexes: [tieA, tieB], branchKey: 'md x', category: 'UR', pwd: false, quota: 'AIQ' });
    expect(t.tightest).toMatchObject({ institute: 'First Inst', year: 2024 });
    expect(t.loosest).toMatchObject({ institute: 'First Inst', year: 2024 });
  });
});

describe('HIGH_VARIABILITY flag — provisional constant', () => {
  it('flags ratio ≥ 2 and passes sub-2 ranges through unflagged', () => {
    expect(DESIRED_BRANCH.HIGH_VARIABILITY_RATIO).toBe(2);
    expect(DESIRED_BRANCH.HIGH_VARIABILITY_RATIO_PROVISIONAL).toBe(true);
    const t = resolveTarget({
      indexes: neetIdx, branchKey: 'dip. in forensic medicine', category: 'UR', pwd: false, quota: 'AIQ',
    });
    expect(t.variability.ratio).toBeLessThan(2);
    expect(t.variability.high).toBe(false);
    expect(t.notes.join(' ')).not.toContain('wide (loosest');
  });
});
