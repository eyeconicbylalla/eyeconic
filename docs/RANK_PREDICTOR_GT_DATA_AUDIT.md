# Rank & Branch Predictor — Phase 1: Eyeconic GT Data Audit

| | |
|---|---|
| **Purpose** | Phase 1 deliverable: what GT data exists today, where it lives, what's retrievable, what's missing |
| **Method** | Read-only: code audit of both repos + one read-only count query against the app DB (2026-09-19). No code changed, no migrations, no writes. |
| **Spec** | `docs/RANK_AND_BRANCH_PREDICTOR.md` §6A, §18 Phase 1 |
| **Count script** | `scripts/audit_gt_counts.js` (re-runnable, read-only) |

## 1. Where GT data lives

Per the two-repo integration (`INTEGRATION_PHASE2.md`), the **app backend** (`C:\Projects\eyeconic-app\backend`) is the single source of truth for students/quizzes/attempts. The website has **no quiz models** — its quiz surface proxies the app:

- Mobile app → app backend directly
- Website → `server/routes/appProxy.js` (`GET /api/app/quizzes`, `GET /api/app/analytics/me`) with the student's App JWT in the encrypted cookie
- The legacy website page (`client/src/pages/GtPredictor.tsx`) saves only a **self-reported** `{current, time, predicted}` triple to the website's CRM User (`server/routes/auth.js:129`) — not attempt data; retires at M1 Phase 8.

## 2. Schema findings (the quiz engine is predictor-ready)

**Quiz model** (`backend/models/Quiz.js`):

| Field | Value | Relevance |
|---|---|---|
| `testType` | enum `['daily','weekly','grand']` (lines 19–23) | **Grand Test is a first-class type** — GT filtering is native |
| `positiveMarks` / `negativeMarks` | defaults **4 / 1** (lines 40–46) | Matches NEET PG's +4/−1 pattern (spec §10) |
| `totalMarks`, `questions[]`, `duration`, `sections[]` | auto-computed, refs QuestionBank | Total questions per GT is authoritative |
| `scheduledDate`/`expiryDate`, `isActive`, `isDeleted` | — | Lifecycle/quality filters |

**QuizAttempt model** (`backend/models/QuizAttempt.js`):

| Field | Relevance |
|---|---|
| `student` → User ref | User linkage ✓ (canonical identity = App `User._id`, Phase 3 integration) |
| `score` | **= correct count** — verified in submit logic (`routes/quizzes.js:378`: `score: correctCount`) |
| `marksObtained` / `totalMarks` | Negative-marked marks (`quizzes.js:324–336`) — usable to cross-check corrects |
| `totalQuestions` | Totals captured ✓ |
| `startTime`/`endTime` + timestamps | Dates captured ✓ |
| `answers[]` per question (`selectedAnswer`, `isCorrect`, `timeSpent`) | **Unanswered is distinguishable** (`-1`/null = unanswered, `QuizAttempt.js:35–39`) — skipped questions are knowable, not just assumable |
| `sectionPerformance[]` (`correct/incorrect/skipped/accuracy`) | Per-section correct + **skipped counts** |
| `status` (`completed`/`auto_submitted`/`in_progress`) | Filter to completed/auto_submitted for predictions |
| retest workflow (`retestRequested/Approved/Used`) | **Multiple attempts per quiz per student are possible** — see gap G3 |

**User model** (`backend/models/User.js`): `role` (admin/mentor/student); `studentProfile` already self-reports `grandTestsGiven`, `averageCorrects`, `averageScore`, `weakestSubjects`, **`targetBranch`** (useful cross-check + future reverse predictor). **No category, no target-exam field** (gaps G1/G2).

**GuestAttempt** mirrors the attempt schema per public quiz (guestId string, no user) — potential anonymous Tier-2 cohort feed, currently zero rows on GTs.

## 3. §6A field mapping — what's captured today

| §6A field | Captured? | Source |
|---|---|---|
| GT correct count | ✅ | `attempt.score` (verified = correctCount) |
| Total questions / max corrects | ✅ | `attempt.totalQuestions` / `quiz.questions.length` |
| GT test type & identity | ✅ | `quiz.testType='grand'` + `quiz._id` |
| GT date | ✅ | `attempt.startTime/endTime`, `createdAt` |
| Selected exam (NEET PG / INI-CET) | ❌ **G1** | Not on Quiz or User; M1 implicitly NEET PG (+4/−1 defaults); INI-CET (M2) needs an exam tag or marking config |
| Whether the student skipped | ✅ (derivable) | `answers.selectedAnswer == -1/null`; `sectionPerformance.skipped` — the UI no-skip assumption stays for MVP manual entry, but auto-captured GTs can compute it exactly |
| Input provenance (auto vs self-reported) | ✅ (by construction) | Auto-captured = QuizAttempt rows; manual entries tagged at prediction time (spec §6A/Phase 7) |

## 4. Retrieval paths (already built)

- `GET /quizzes/analytics/me` (`routes/quizzes.js:2554`) — student's own attempt history, **populates `testType`** (`utils/studentPerformance.js:79`), paginated, status-filtered. This is most of Phase 7's "student-specific GT retrieval."
- `GET /api/app/analytics/me` website proxy (`server/routes/appProxy.js:160`) — same data from the website.
- Direct aggregation (Phase 3 engine): `QuizAttempt.find({student, status:{$in:['completed','auto_submitted']}})` + quiz populate, filter `testType==='grand'`.

## 5. Empirical counts (read-only DB query, 2026-09-19)

```
students (role=student):        172
quizzes by type:                daily: 3 (active 3)   weekly: 0   grand: 0
grand quizzes:                  0
grand completed attempts:       0
distinct students with GTs:     0
guest attempts on GTs:          0
```

**Conclusions:**

1. **Eyeconic has not yet run any Grand Tests.** The GT intake pipeline exists and is predictor-ready, but zero GTs have been authored/attempted.
2. **Tier 2 (GT-cohort percentile transfer) is unreachable at launch** — no cohorts exist. The §5.4 fallback ladder is empirically validated: every prediction starts on **Tier 1 (fraction-correct parity)**; the per-GT threshold flips individual GTs to Tier 2 as cohorts grow.
3. The 172 existing students are the day-one audience; GT authoring needs to start for any Tier 2 / outcome-capture value to accrue.

## 6. Gaps & recommendations (no implementation now)

| # | Gap | Impact | Recommendation |
|---|---|---|---|
| G1 | No `targetExam` on Quiz/User | M2 (INI-CET GTs use +1/−⅓, not +4/−1) | When GT authoring starts, add an optional exam tag (or per-quiz marking config) on Quiz — app-repo change, coordinate with feature freeze |
| G2 | No category on profile | Branch stage needs category (spec §3.6) | Predictor collects category at input and stores it **with the prediction** (Phase 7) — do not touch the app's User model for M1 |
| G3 | Retest workflow → multiple attempts per GT per student | Aggregation ambiguity (spec §3.3 says "one value per GT") | Phase 3 defines the dedup rule: **latest completed attempt per quiz, preferring an approved+used retest**; rule is versioned with the method |
| G4 | Tier 2 cold-start | Expected, not a defect | Re-run `scripts/audit_gt_counts.js` after each GT window; flip GTs crossing the threshold (mechanism already spec'd §5.4) |
| G5 | `studentProfile` self-reported `averageCorrects` is a String | Only a cross-check input, not predictor input | Ignore for MVP; consider profile cleanup much later |

## 7. Phase 1 done-when — answers

- **Can we retrieve, per student, their GT corrects + totals + dates?** ✅ **Yes** — schema + APIs fully support it today (`score`=corrects, `totalQuestions`, timestamps; `/analytics/me` with `testType` populated). Currently returns zero rows only because no GTs exist yet.
- **Are there enough attempts for cohort percentiles?** ❌ **No — zero GT attempts exist.** Tier 1 is the launch mode by necessity, exactly as the fallback ladder anticipated.

## Re-run

```bash
cd C:\Projects\eyeconic-app\backend && node C:\Projects\eyeconic-main\scripts\audit_gt_counts.js
```

Read-only; prints counts only; never prints connection strings or user data.
