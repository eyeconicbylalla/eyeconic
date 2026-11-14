# Phase D — outcome-capture campaign (2026-11-14)

One-line scope: turn result-week attention into the paired
predicted-vs-actual dataset that no official source can ever provide. The
§15 consent flow (Phases 10a/10b) was already complete and unchanged — this
phase adds (1) the time-boxed nudge on the predictor result page and
(2) the weekly counter + calibration-pairs export script.

## 1. The nudge (client)

`OutcomeCard`'s collapsed intro becomes campaign-aware
(`constants.ts`: `OUTCOME_CAMPAIGNS` + `activeOutcomeCampaign(exam, now)`):

- Window: **INI_CET 2026-11-06 → 2027-02-28** (Notification 304/2026 → the
  Jan-2027 counselling's open round). Outside the window the card is exactly
  as before; `data-outcome-campaign` marks the variant for verification.
- In-window, nothing-recorded state: warmer copy ("Wrote the INI-CET on
  1 November 2026? Your result just came out"), primary CTA, reassurance
  line ("Takes a minute · voluntary · edit or withdraw anytime").
- Already-recorded state: unchanged thank-you card (no nagging). The form it
  opens is the untouched §15 flow — re-consent on every save, editable,
  withdrawable; INI students can submit rank/percentile with no score
  (AIIMS publishes no marks — the pair is still a calibration pair).

## 2. The weekly counter + export (server/scripts/outcome_pairs_report.js)

`MONGO_URI=… node server/scripts/outcome_pairs_report.js [--out pairs.json]`

- Counts predictions vs captures by exam, capture rate, value coverage
  (rank / percentile / score / counselling), and linkage integrity
  (capture-time copy vs the live Prediction — the same join the API's
  linkageCheck performs).
- Exports the calibration PAIRS: actual outcome × the stored prediction's
  rank range + mean corrects + half-width + GT count + method version.
  Users are pseudonymized (salted SHA-256, `OUTCOME_EXPORT_SALT` overridable)
  — identity never leaves the database.
- Prints the calibration gates per exam: **30 pairs → first ladder
  correction; 100 → full calibration** (ladder + mock-difficulty offset +
  width recalibration).
- Smoke-tested end-to-end against a seeded in-memory Mongo (report, gates,
  JSON export, linkage match, pseudonym) — see the phase session log.

## What this buys (why it matters)

Every shared result is one true (mock corrects → real rank) point — the only
ground truth that exists for the INI-CET marks→rank step, and simultaneously
the data that answers "are Eyeconic GTs harder or easier than the real
exam?" (Step 1). Collected while memories are fresh; the window closes
2027-02-28.

## Verification

- Client: tsc clean (predictor files), eslint clean, vite build ✓.
- Server: standalone script — syntax-checked, clean no-MONGO_URI error path,
  seeded MongoMemory smoke (console report + `--out` JSON + linkage check).
  No engine/API/model changes → suite state unchanged from Phase C
  (578/578 at `3c60979`).

## Not in this phase

Calibration itself (gated on pairs — run the script weekly), Phase E
(Jul-2026 backfill), Phase F (Jan-2027 counselling ~Feb–Mar 2027), Phase G
(honesty report). Deploy of the nudge rides the next client deploy; server
unchanged.
