# My checklist — INI-CET predictor program (for the owner)

Last updated: 15 November 2026.

**How this works:** Claude does all the technical work.
My jobs are only 4 things: **deploy, run one weekly command, save PDFs, say yes/no.**
If I am ever unsure, I just ask Claude. Nothing can break by asking first.

---

## JOB 1 — Deploy (DO THIS FIRST, this week)

**When:** Now. November 2026. Everything else waits for this.

**Why:** Phases C, D, E are finished in the code, but students cannot see them
until I deploy. The new INI-CET numbers, the 7-session branch data, and the
"record your result" card are all waiting behind this deploy.

**Steps:**

1. Open **vercel.com** → log in → open the **eyeconic-server** project.
2. Go to **Settings → Environment Variables**.
3. Look at every variable. **Every box must have a value.**
   In September some were wiped empty. If any box is empty → **STOP. Do not
   deploy.** Ask Claude what the value should be, fix it, then continue.
4. Deploy **eyeconic-server** the way I always do.
5. Run the smoke test. Easiest way: tell Claude **"prod is deployed, run the
   smoke test"** and Claude runs it. (It logs into the real site and checks
   the predictor works end to end.)
6. Deploy the **website (client)** too — it carries the result-week card that
   asks students to record their real rank.
7. Tell Claude **"deploy done"** so it is written down in memory.

**Done when:** the smoke test passes and the site shows the new predictor data.

---

## JOB 2 — Weekly pairs check (every week, starting after the deploy)

**When:** Once a week, same day each week (for example every Monday),
from now until about March 2027.

**Why:** Students are now recording their real exam results. Each record is a
"pair" (what we predicted vs what really happened).

- **30 pairs** → Claude does the first ladder correction.
- **100 pairs** → Claude does the full calibration.

**Steps:**

1. Tell Claude: **"run the pairs report."**
   (Claude will need the database link — it is in Vercel, eyeconic-server,
   Settings → Environment Variables → `MONGO_URI`. Copy it and paste it.)
2. Claude shows the count. That is all.
3. When Claude says **"30 reached"** → I say **"start calibration 1"**.
4. When Claude says **"100 reached"** → I say **"start full calibration"**.

Takes 5 minutes a week. Nothing else needed from me.

---

## JOB 3 — Save the January 2027 counselling PDFs (Phase F)

**When:** Around **February–March 2027**. I can wait until all three exist.

**Why:** The January 2027 exam result is already inside the predictor. But the
seat allotment rounds happen later. When all rounds are published, Claude adds
them and the January 2027 session is complete end to end.

**What to expect (rough dates):**

| PDF | Roughly when |
|---|---|
| 1st round seat allocation | late December 2026 |
| 2nd round seat allocation | late January 2027 |
| Open (final) round | February 2027 |

**Steps:**

1. Go to the same AIIMS exams website where I found the last PDFs.
2. Find the three notifications. They say **"January 2027 Session"** in the
   title. Names look like:
   - "Result of 1st Round of seat allocation … January 2027 Session"
   - "Result of 02nd Round of Seat Allocation … January 2027 Session"
   - "Result of Open Round of Seat Allocation … January 2027 Session"
3. Rules (same as always):
   - **January 2027 session only.** Not July.
   - **Skip mock rounds.** Never take those.
   - If AIIMS fixed a PDF later, take the **latest corrected** one.
4. Save all 3 PDFs into **one new folder on my Desktop**.
5. Paste the 3 file paths into Claude and say: **"start Phase F."**
6. Claude does everything else and shows me the proofs, like this time.

**NOT needed:** the January 2027 result PDF — we already have it (Phase A).

---

## JOB 4 — Honesty report (Phase G) — nothing to prepare

**When:** Claude will tell me. It needs the pairs from JOB 2 to grow first.
Probably early-to-mid 2027.

**What:** Claude writes a report "how close were our predictions vs reality"
and a plan to show it to users. I only read it and say **yes / no / change**.

---

## Calendar at a glance

| When | What I do |
|---|---|
| Now (Nov 2026) | JOB 1: deploy + smoke test |
| Every week after that | JOB 2: "run the pairs report" |
| Late Dec 2026 | 1st round PDF appears — no action yet, just note it |
| Late Jan 2027 | 2nd round PDF appears — still wait |
| Feb–Mar 2027 | Open round PDF appears → JOB 3: save 3 PDFs, "start Phase F" |
| When pairs mature | JOB 4: read report, say yes/no |
| 30 pairs → 100 pairs | Say "start calibration 1" → "start full calibration" |

---

## Golden rules (never break these)

1. **Never deploy with an empty environment variable.** Check first.
2. **Never take mock round PDFs.** Mock rounds are practice, not real seats.
3. **Old records never break.** Claude proves this on every change. If a
   change cannot prove it, the change does not happen.
4. **When a website blocks Claude** (like Reddit), I copy the content myself
   and paste it into the chat.
5. **Deploying is always my job.** Claude never deploys unless I say so.

---

## Where things are written down (for Claude sessions)

- Program state: Claude's memory file `ini-cet-2027-result-program`
- Full phase history: memory file `rank-branch-predictor-data-sources`
- This phase's report: `docs/RANK_PREDICTOR_PHASEE_2026_07_BACKFILL_REPORT.md`

When I start a new chat, I just say: **"check the program state memory"** —
Claude reads these and knows everything.
