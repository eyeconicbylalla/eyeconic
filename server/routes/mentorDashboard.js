const express = require('express');
const { callAppApi, AppApiError } = require('../config/appApi');
const { clearSessionCookie } = require('../services/appSession');
const requireAppSession = require('../middleware/appSession');
const { ensureDbConnection } = require('../config/db');
const Prediction = require('../models/Prediction');
const DesiredBranchQuery = require('../models/DesiredBranchQuery');

/**
 * Free Login User Dashboard (Feature 08) — mentor/admin web surface.
 *
 * Layered authorization:
 *  1. Here: the encrypted App session must resolve AND its user snapshot must
 *     carry the mentor/admin role — students are turned away with 403 before
 *     any data leaves this server.
 *  2. Upstream: every call forwards the mentor/admin App JWT, and the App API
 *     re-authorizes against the LIVE database role — a demoted or deleted
 *     mentor is rejected there even if the session snapshot is stale.
 *
 * Data model: the App API (eyeconic-app backend) is the single source of
 * truth for the free-user population and their Mini CCT / Daily PYQ /
 * Platform Choice activity; this server adds the two predictor collections it
 * owns (Prediction, DesiredBranchQuery — same canonical App userId) and merges
 * them per metric. Nothing here redefines "free user": the id set always
 * comes from the App API's /free-user-analytics/ids.
 */

const router = express.Router();

const EXAM_LABELS = Object.freeze({ NEET_PG: 'NEET PG', INI_CET: 'INI-CET' });
const IDS_CACHE_TTL_MS = 60 * 1000;
const EXPORT_PAGE_LIMIT = 100;
const EXPORT_MAX_USERS = 10000;

// ---- IST windows (mirrors the App API's definitions — IST-day based) --------

function istDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function istMidnightUtc(dateKey) {
  return new Date(`${dateKey}T00:00:00+05:30`);
}

function addDaysKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// ---- Middleware --------------------------------------------------------------

router.use(requireAppSession);

router.use((req, res, next) => {
  const role = req.appSession.user && req.appSession.user.role;
  if (role !== 'mentor' && role !== 'admin') {
    return res.status(403).json({
      msg: 'Mentor or admin access is required for this dashboard.',
      code: 'FORBIDDEN_ROLE',
    });
  }
  return next();
});

// ---- Helpers -----------------------------------------------------------------

function sendAppError(res, error, requestId) {
  if (error instanceof AppApiError) {
    if (error.status === 401) {
      clearSessionCookie(res);
      return res.status(401).json({
        msg: 'Your session has expired. Please log in again.',
        code: 'APP_SESSION_REQUIRED',
      });
    }
    if (error.status === 403) {
      // Upstream rejected the caller's live role — same verdict here.
      return res.status(403).json({
        msg: 'Mentor or admin access is required for this dashboard.',
        code: 'FORBIDDEN_ROLE',
      });
    }
    return res.status(error.status).json({ msg: error.message, code: error.code });
  }
  console.error('[mentor-dashboard] Unexpected error', {
    requestId,
    message: error && error.message,
    name: error && error.name,
  });
  return res.status(500).json({ msg: 'Server error', code: 'SERVER_ERROR' });
}

/** App-side call with the mentor/admin user token. */
function appApi(req, path, options = {}) {
  return callAppApi(path, { userToken: req.appSession.token, requestId: req.requestId, ...options });
}

let idsCache = { at: 0, ids: [] };

/** Free-user id set (strings) from the App API — the population definition. */
async function freeUserIds(req, { forceRefresh = false } = {}) {
  if (!forceRefresh && Date.now() - idsCache.at < IDS_CACHE_TTL_MS) return idsCache.ids;
  const data = await appApi(req, '/free-user-analytics/ids');
  const ids = Array.isArray(data && data.ids) ? data.ids : [];
  idsCache = { at: Date.now(), ids };
  return ids;
}

/**
 * Predictor rollups scoped to a set of user ids (strings): per-user counts,
 * last-use timestamps, last exam and last desired branch. Two aggregations,
 * regardless of how many ids are asked about.
 */
async function predictorRollups(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return new Map();

  await ensureDbConnection();

  const [predRows, desiredRows] = await Promise.all([
    Prediction.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: '$userId',
          predictions: { $sum: 1 },
          lastPredictionAt: { $max: '$createdAt' },
          lastExam: { $last: '$exam' },
        },
      },
    ]),
    DesiredBranchQuery.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: '$userId',
          queries: { $sum: 1 },
          lastQueryAt: { $max: '$createdAt' },
          lastExamDesired: { $last: '$exam' },
          lastBranch: { $last: '$input.branch.display' },
        },
      },
    ]),
  ]);

  const merged = new Map();
  for (const row of predRows) {
    merged.set(row._id, {
      predictions: row.predictions,
      lastPredictionAt: row.lastPredictionAt,
      lastExam: row.lastExam,
      desiredBranchQueries: 0,
      lastDesiredQueryAt: null,
      desiredBranch: null,
    });
  }
  for (const row of desiredRows) {
    const existing = merged.get(row._id) || {
      predictions: 0,
      lastPredictionAt: null,
      lastExam: null,
      desiredBranchQueries: 0,
      lastDesiredQueryAt: null,
      desiredBranch: null,
    };
    existing.desiredBranchQueries = row.queries;
    existing.lastDesiredQueryAt = row.lastQueryAt;
    existing.desiredBranch = row.lastBranch || null;
    // "Exam selected" = the NEWEST predictor usage across both collections.
    if (row.lastExamDesired && (!existing.lastPredictionAt || row.lastQueryAt > existing.lastPredictionAt)) {
      existing.lastExam = row.lastExamDesired;
    }
    merged.set(row._id, existing);
  }
  return merged;
}

/** Distinct free-user ids with predictor activity at/after `from`. */
async function predictorActiveIds(userIds, from) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  await ensureDbConnection();
  const [p, d] = await Promise.all([
    Prediction.distinct('userId', { userId: { $in: userIds }, createdAt: { $gte: from } }),
    DesiredBranchQuery.distinct('userId', { userId: { $in: userIds }, createdAt: { $gte: from } }),
  ]);
  return [...new Set([...p, ...d])];
}

const laterDate = (a, b) => {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a) > new Date(b) ? new Date(a) : new Date(b);
};

const EXAM_LABEL = (exam) => EXAM_LABELS[exam] || exam || null;

// ---- GET /overview -----------------------------------------------------------

router.get('/overview', async (req, res) => {
  try {
    const [overview, freeIds] = await Promise.all([
      appApi(req, '/free-user-analytics/overview'),
      freeUserIds(req),
    ]);

    const today = istDateKey();
    const win = {
      dauFrom: istMidnightUtc(today),
      wauFrom: istMidnightUtc(addDaysKey(today, -6)),
      mauFrom: istMidnightUtc(addDaysKey(today, -29)),
    };

    // Union the App-side active ids with predictor activity (exact, not
    // approximate: both sides return id sets for the same windows).
    const [predDau, predWau, predMau, rollups] = await Promise.all([
      predictorActiveIds(freeIds, win.dauFrom),
      predictorActiveIds(freeIds, win.wauFrom),
      predictorActiveIds(freeIds, win.mauFrom),
      predictorRollups(freeIds),
    ]);

    const freeIdSet = new Set(freeIds);
    const union = (appIds, predIds) =>
      new Set([...(appIds || []), ...predIds.filter((id) => freeIdSet.has(id))]).size;

    // Exam selected = each user's newest predictor usage; everyone else "Not set".
    const examCounts = new Map();
    for (const id of freeIds) {
      const row = rollups.get(id);
      const label = row && row.lastExam ? EXAM_LABEL(row.lastExam) : null;
      const key = label || 'Not set';
      examCounts.set(key, (examCounts.get(key) || 0) + 1);
    }

    let predictionCount = 0;
    let desiredCount = 0;
    let predictorUsers = 0;
    for (const row of rollups.values()) {
      predictionCount += row.predictions;
      desiredCount += row.desiredBranchQueries;
      if (row.predictions > 0 || row.desiredBranchQueries > 0) predictorUsers += 1;
    }

    return res.json({
      ...overview,
      // The App API ships raw id arrays for the exact union merge above; the
      // browser only ever receives the merged counts.
      activeUserIds: undefined,
      active: {
        dau: union(overview.activeUserIds && overview.activeUserIds.dau, predDau),
        wau: union(overview.activeUserIds && overview.activeUserIds.wau, predWau),
        mau: union(overview.activeUserIds && overview.activeUserIds.mau, predMau),
      },
      rankPredictor: {
        predictionsTotal: predictionCount,
        desiredBranchQueriesTotal: desiredCount,
        usingUsers: predictorUsers,
        examDistribution: [...examCounts.entries()].map(([exam, count]) => ({ exam, count })),
      },
    });
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// ---- GET /users (paginated, server-side filters incl. exam via id set) -------

const EXAM_FILTER_VALUES = new Set(['NEET_PG', 'INI_CET', 'none']);

router.get('/users', async (req, res) => {
  try {
    const forward = {};
    for (const key of ['page', 'limit', 'q', 'from', 'to', 'sort']) {
      if (typeof req.query[key] === 'string' && req.query[key] !== '') forward[key] = req.query[key];
    }

    // "Exam selected" is website-derived: resolve it to a user-id set and let
    // the App API filter server-side (pagination stays exact).
    const exam = String(req.query.exam || '');
    if (EXAM_FILTER_VALUES.has(exam)) {
      const freeIds = await freeUserIds(req);
      const rollups = await predictorRollups(freeIds);
      const matches = freeIds.filter((id) => {
        const row = rollups.get(id);
        const userExam = row && row.lastExam ? row.lastExam : null;
        return exam === 'none' ? userExam === null : userExam === exam;
      });
      if (matches.length === 0) {
        return res.json({ users: [], total: 0, page: 1, pages: 0, limit: Number(forward.limit) || 20 });
      }
      forward.ids = matches.slice(0, 2000).join(',');
    }

    const data = await appApi(req, `/free-user-analytics/users?${new URLSearchParams(forward).toString()}`);
    const users = Array.isArray(data && data.users) ? data.users : [];

    // Enrich just this page with predictor usage + merged last-active.
    const pageIds = users.map((u) => u._id);
    const rollups = await predictorRollups(pageIds);

    const enriched = users.map((user) => {
      const row = rollups.get(user._id) || {};
      return {
        ...user,
        predictions: row.predictions || 0,
        desiredBranchQueries: row.desiredBranchQueries || 0,
        desiredBranch: row.desiredBranch || null,
        examSelected: row.lastExam ? EXAM_LABEL(row.lastExam) : null,
        lastActiveAt: laterDate(user.lastActiveAt, laterDate(row.lastPredictionAt, row.lastDesiredQueryAt)),
      };
    });

    return res.json({ ...data, users: enriched });
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// ---- GET /users/:id (drilldown with predictor history) ------------------------

router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({ msg: 'Invalid user id', code: 'VALIDATION_ERROR' });
    }

    await ensureDbConnection();
    const [data, predictions, desiredQueries] = await Promise.all([
      appApi(req, `/free-user-analytics/users/${id}`),
      Prediction.find({ userId: id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('exam createdAt request.gts')
        .lean(),
      DesiredBranchQuery.find({ userId: id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('exam input.branch createdAt')
        .lean(),
    ]);

    // GT corrects entered: from the student's LATEST prediction's exact
    // request body (auto-captured quiz GTs and self-reported entries alike).
    const latest = predictions[0];
    const gtCorrects = [];
    if (latest && Array.isArray(latest.request && latest.request.gts)) {
      for (const gt of latest.request.gts) {
        if (!gt || !Array.isArray(gt.attempts)) continue;
        for (const attempt of gt.attempts) {
          if (Number.isFinite(Number(attempt.corrects))) {
            gtCorrects.push({
              gtTitle: gt.title || null,
              provenance: gt.provenance || null,
              corrects: Number(attempt.corrects),
              totalQuestions: Number.isFinite(Number(attempt.totalQuestions)) ? Number(attempt.totalQuestions) : null,
            });
          }
        }
      }
    }

    const predictionRows = predictions.map((p) => ({
      _id: String(p._id),
      exam: EXAM_LABEL(p.exam),
      createdAt: p.createdAt,
    }));
    const desiredRows = desiredQueries.map((d) => ({
      _id: String(d._id),
      exam: EXAM_LABEL(d.exam),
      branch: d.input && d.input.branch ? d.input.branch.display : null,
      createdAt: d.createdAt,
    }));

    const [predCount, desiredCount] = await Promise.all([
      Prediction.countDocuments({ userId: id }),
      DesiredBranchQuery.countDocuments({ userId: id }),
    ]);

    const lastPredictorAt = laterDate(
      predictionRows.length > 0 ? predictionRows[0].createdAt : null,
      desiredRows.length > 0 ? desiredRows[0].createdAt : null
    );

    return res.json({
      ...data,
      predictor: {
        predictions: predictionRows,
        desiredBranchQueries: desiredRows,
        totals: { predictions: predCount, desiredBranchQueries: desiredCount },
        gtCorrects,
      },
      lastActiveAt: laterDate(data.lastActiveAt, lastPredictorAt),
    });
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// ---- GET /performance ---------------------------------------------------------

router.get('/performance', async (req, res) => {
  try {
    const dropOffDays = String(req.query.dropOffDays || '');
    const appQuery = /^\d+$/.test(dropOffDays) ? `?dropOffDays=${Number(dropOffDays)}` : '';

    const [data, freeIds] = await Promise.all([
      appApi(req, `/free-user-analytics/performance${appQuery}`),
      freeUserIds(req),
    ]);
    const rollups = await predictorRollups(freeIds);

    // Exam distribution (newest predictor usage per user) + desired branch
    // top-10 + usage counts — free-user population only.
    const examCounts = new Map();
    const branchCounts = new Map();
    let predictionCount = 0;
    let desiredCount = 0;
    for (const id of freeIds) {
      const row = rollups.get(id);
      const examLabel = row && row.lastExam ? EXAM_LABEL(row.lastExam) : null;
      const key = examLabel || 'Not set';
      examCounts.set(key, (examCounts.get(key) || 0) + 1);
      if (row) {
        predictionCount += row.predictions;
        desiredCount += row.desiredBranchQueries;
        if (row.desiredBranch) {
          branchCounts.set(row.desiredBranch, (branchCounts.get(row.desiredBranch) || 0) + 1);
        }
      }
    }

    const desiredBranchTop = [...branchCounts.entries()]
      .map(([branch, count]) => ({ branch, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Feature usage heatmap: add the two website-owned features to the App's
    // week rows, bucketed by the SAME IST-week boundaries.
    const weekLabels = (data.featureUsage && data.featureUsage.weekLabels) || [];
    const rows = Array.isArray(data.featureUsage && data.featureUsage.rows) ? [...data.featureUsage.rows] : [];
    if (weekLabels.length > 0) {
      await ensureDbConnection();
      const boundaries = weekLabels.map((label) => istMidnightUtc(label));
      const finalEdge = istMidnightUtc(addDaysKey(istDateKey(), 1));
      const bucketCounts = async (Model) => {
        const agg = await Model.aggregate([
          {
            $match: {
              userId: { $in: freeIds },
              createdAt: { $gte: boundaries[0], $lt: finalEdge },
            },
          },
          {
            $bucket: {
              groupBy: '$createdAt',
              boundaries: [...boundaries, finalEdge],
              default: 'outside',
            },
          },
        ]);
        const counts = new Array(weekLabels.length).fill(0);
        for (const row of agg) {
          const idx = boundaries.findIndex((b) => Number(b) === Number(row._id));
          if (idx >= 0) counts[idx] = row.count;
        }
        return counts;
      };
      const [predCounts, desiredCounts] = await Promise.all([
        bucketCounts(Prediction),
        bucketCounts(DesiredBranchQuery),
      ]);
      rows.push({ feature: 'Rank Predictor', counts: predCounts });
      rows.push({ feature: 'Desired Branch', counts: desiredCounts });
    }

    // Drop-off refinement: remove users whose ONLY recent activity is on the
    // website predictors (their drop-off was computed from App data alone).
    const dropoffUsers = Array.isArray(data.dropoff && data.dropoff.users) ? data.dropoff.users : [];
    const thresholdDays = (data.dropoff && Number(data.dropoff.thresholdDays)) || 7;
    const today = istDateKey();
    const cutoff = istMidnightUtc(addDaysKey(today, -thresholdDays));
    const dropoffRollups = await predictorRollups(dropoffUsers.map((u) => u.userId));
    const refined = [];
    let removed = 0;
    for (const user of dropoffUsers) {
      const row = dropoffRollups.get(user.userId);
      const lastPredictorAt = row ? laterDate(row.lastPredictionAt, row.lastDesiredQueryAt) : null;
      const mergedLastActive = laterDate(user.lastActiveAt, lastPredictorAt);
      if (mergedLastActive && mergedLastActive >= cutoff) {
        removed += 1;
        continue;
      }
      refined.push({ ...user, lastActiveAt: mergedLastActive, neverActive: !mergedLastActive });
    }

    return res.json({
      ...data,
      examDistribution: [...examCounts.entries()].map(([exam, count]) => ({ exam, count })),
      desiredBranchTop,
      rankPredictor: {
        predictionsTotal: predictionCount,
        desiredBranchQueriesTotal: desiredCount,
      },
      featureUsage: { weekLabels, rows },
      dropoff: { ...data.dropoff, users: refined, removedByWebsiteActivity: removed },
    });
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

// ---- GET /export/users (CSV | JSON, respects filters) --------------------------

const csvCell = (value) => {
  let text = value === null || value === undefined ? '' : String(value);
  // Formula-injection guard for spreadsheet apps.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const toDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 19).replace('T', ' ');
};

router.get('/export/users', async (req, res) => {
  try {
    const forward = {};
    for (const key of ['q', 'from', 'to', 'sort']) {
      if (typeof req.query[key] === 'string' && req.query[key] !== '') forward[key] = req.query[key];
    }

    const rows = [];
    let page = 1;
    // Server-side paged fetch from the App API (never a browser dump); the
    // cap bounds worst-case memory for very large populations.
    while (rows.length < EXPORT_MAX_USERS) {
      const query = new URLSearchParams({ ...forward, page: String(page), limit: String(EXPORT_PAGE_LIMIT) });
      const data = await appApi(req, `/free-user-analytics/users?${query.toString()}`);
      const users = Array.isArray(data && data.users) ? data.users : [];
      if (users.length === 0) break;

      const rollups = await predictorRollups(users.map((u) => u._id));
      for (const user of users) {
        const row = rollups.get(user._id) || {};
        rows.push({
          'Name': user.name,
          'Email': user.email,
          'Phone': user.phone || '',
          'Registered at': toDate(user.registeredAt),
          'Last active': toDate(laterDate(user.lastActiveAt, laterDate(row.lastPredictionAt, row.lastDesiredQueryAt))),
          'Profile complete': user.isProfileComplete ? 'yes' : 'no',
          'Year': user.year || '',
          'Platforms': (user.platforms || []).join('; '),
          'Mini CCT attempts': user.miniCct ? user.miniCct.attempts : 0,
          'Mini CCT avg %': user.miniCct && user.miniCct.avgScorePercentage !== null ? user.miniCct.avgScorePercentage : '',
          'Daily PYQ attempts': user.dailyPyq ? user.dailyPyq.attempts : 0,
          'Current streak': user.dailyPyq ? user.dailyPyq.currentStreak : 0,
          'Rank Predictor uses': row.predictions || 0,
          'Desired Branch queries': row.desiredBranchQueries || 0,
          'Exam selected': row.lastExam ? EXAM_LABEL(row.lastExam) : '',
        });
      }

      const pages = Number(data && data.pages);
      if (!Number.isFinite(pages) || page >= pages) break;
      page += 1;
    }

    if (String(req.query.format) === 'json') {
      return res.json({ rows, total: rows.length });
    }

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const lines = [columns.join(',')];
    for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','));
    const csv = `﻿${lines.join('\r\n')}`; // BOM so Excel reads UTF-8

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="eyeconic-free-users.csv"');
    return res.send(csv);
  } catch (error) {
    return sendAppError(res, error, req.requestId);
  }
});

router.use((_req, res) => res.status(404).json({ msg: 'Not found', code: 'NOT_FOUND' }));

module.exports = router;
