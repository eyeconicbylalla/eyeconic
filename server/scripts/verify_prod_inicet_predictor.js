/**
 * Production smoke test for the predictor endpoints (written for the
 * 2026-09-26 INI-CET snapshot hash fix). Walks the REAL auth chain
 * (app login -> web-handoff code -> website session cookie) and exercises
 * both INI-CET predictor modes plus a NEET-PG regression check against
 * https://www.eyeconicneetpg.com.
 *
 * Requires a real student account (any) in the app backend DB:
 *   E2E_EMAIL=... E2E_PASSWORD=... node scripts/verify_prod_inicet_predictor.js
 * Override the targets with APP_BASE / SITE for other environments.
 */
const APP_BASE = process.env.APP_BASE || 'https://eyeconic-app-prod-1r8o.onrender.com';
const SITE = process.env.SITE || 'https://www.eyeconicneetpg.com';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Set E2E_EMAIL and E2E_PASSWORD (any valid app student account).');
  process.exit(1);
}

async function j(url, opts) {
  const r = await fetch(url, opts);
  let body = null;
  try { body = await r.json(); } catch (_) { /* non-JSON */ }
  return { status: r.status, body, headers: r.headers };
}

(async () => {
  // 1. App login
  const login = await j(`${APP_BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (login.status !== 200) throw new Error(`login ${login.status}: ${JSON.stringify(login.body)}`);
  const token = login.body.token;
  console.log(`1. app login OK (${login.body.user.email})`);

  // 2. Mint one-time web-handoff code
  const handoff = await j(`${APP_BASE}/api/auth/web-handoff`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  if (handoff.status !== 200) throw new Error(`web-handoff ${handoff.status}: ${JSON.stringify(handoff.body)}`);
  console.log('2. handoff code minted OK');

  // 3. Consume at the website -> session cookie
  const sess = await j(`${SITE}/api/app-auth/handoff`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE },
    body: JSON.stringify({ code: handoff.body.code }),
  });
  if (sess.status !== 200) throw new Error(`website handoff ${sess.status}: ${JSON.stringify(sess.body)}`);
  const cookie = (sess.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('no session cookie set');
  console.log('3. website session OK');

  const POST = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE, Cookie: cookie },
  };
  const GT = [{ provenance: 'self-reported', attempts: [{ corrects: 140, totalQuestions: 200, status: 'completed', skipped: 0 }] }];

  // 4. exams list (INI-CET must be listed + available)
  const exams = await j(`${SITE}/api/predictor/exams`, { headers: { Cookie: cookie } });
  const ini = exams.body && exams.body.exams && exams.body.exams.find((e) => e.id === 'INI_CET');
  console.log(`4. GET /exams ${exams.status} | INI_CET available: ${ini && ini.available}`);
  if (exams.status !== 200 || !ini || !ini.available) throw new Error('INI_CET not available in exams list');

  // 5. INI-CET Rank & Branch Predictor
  const iniPredict = await j(`${SITE}/api/predictor/predict`, {
    ...POST, body: JSON.stringify({ exam: 'INI_CET', gts: GT, category: 'UR' }),
  });
  const iniPred = iniPredict.body && iniPredict.body.prediction;
  const iniRank = iniPred && iniPred.rank;
  console.log(`5. INI-CET predict ${iniPredict.status} | ${iniPred && iniPred.method && iniPred.method.version} | AIR ${iniRank && JSON.stringify(iniRank.rankRange)} (coverage ${iniRank && iniRank.coverage})`);
  if (iniPredict.status !== 201) throw new Error(`INI-CET predict FAILED ${iniPredict.status}: ${JSON.stringify(iniPredict.body).slice(0, 400)}`);
  if (!iniRank || !Array.isArray(iniRank.rankRange)) throw new Error('INI-CET predict 201 but no rank range');

  // 6. INI-CET Desired Branch Predictor
  const iniDesired = await j(`${SITE}/api/predictor/desired-branch`, {
    ...POST, body: JSON.stringify({ exam: 'INI_CET', branchKey: 'general medicine', category: 'UR', gts: GT }),
  });
  const desired = (iniDesired.body && iniDesired.body.result) || {};
  const target = desired.target || {};
  console.log(`6. INI-CET desired-branch ${iniDesired.status} | target AIR ${JSON.stringify(target.targetRankRange)} | gap: ${JSON.stringify(desired.gap && desired.gap.status)}`);
  if (iniDesired.status !== 201) throw new Error(`INI-CET desired-branch FAILED ${iniDesired.status}: ${JSON.stringify(iniDesired.body).slice(0, 400)}`);

  // 7. NEET-PG regression
  const neet = await j(`${SITE}/api/predictor/predict`, {
    ...POST,
    body: JSON.stringify({
      exam: 'NEET_PG',
      gts: [{ provenance: 'self-reported', attempts: [{ corrects: 140, totalQuestions: 180, status: 'completed', skipped: 0 }] }],
      category: 'UR', quota: 'AIQ',
    }),
  });
  const neetRank = neet.body && neet.body.prediction && neet.body.prediction.rank;
  console.log(`7. NEET-PG predict ${neet.status} | rank: ${neetRank && JSON.stringify(neetRank.rankRange)}`);
  if (neet.status !== 201) throw new Error(`NEET-PG predict FAILED ${neet.status}: ${JSON.stringify(neet.body).slice(0, 400)}`);
  if (!neetRank || !Array.isArray(neetRank.rankRange)) throw new Error('NEET-PG predict 201 but no rank range');

  console.log('\nPRODUCTION VERIFICATION PASSED: both INI-CET modes + NEET-PG all green.');
})().catch((e) => { console.error('PRODUCTION VERIFICATION FAILED:', e.message); process.exit(1); });
