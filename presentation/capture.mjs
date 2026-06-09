// Drives Google Chrome via Playwright to capture product screenshots of
// chat-scratchy (Traditional Chinese UI). Re-seeds demo data first so the
// teacher roster shows students as "online", then captures teacher views
// (fast) before the slower live-LLM student view.
//
//   node capture.mjs
//
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
const BASE = 'http://localhost:5173';
const VIEWPORT = { width: 1440, height: 900 };

const TEACHER = { email: 'teacher@scratchy.app', password: 'scratchy123' };
const JOIN_CODE = 'MEOW42';

const DANCING_CAT = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'event_whenflagclicked', x: 40, y: 40,
        next: { block: {
          type: 'controls_repeat_ext',
          inputs: {
            TIMES: { block: { type: 'math_number', fields: { NUM: 10 } } },
            DO: { block: {
              type: 'scratch_movesteps',
              inputs: { STEPS: { block: { type: 'math_number', fields: { NUM: 15 } } } },
              next: { block: {
                type: 'scratch_ifonedgebounce',
                next: { block: {
                  type: 'scratch_nextcostume',
                  next: { block: {
                    type: 'scratch_wait',
                    inputs: { SECONDS: { block: { type: 'math_number', fields: { NUM: 0.3 } } } },
                  } },
                } },
              } },
            } },
          },
        } },
      },
    ],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('•', ...a);

async function main() {
  log('Re-seeding demo data…');
  execSync('node scripts/seed-demo.mjs', { cwd: path.join(HERE, '..', 'server'), stdio: 'inherit' });

  const browser = await chromium.launch({ channel: 'chrome' });

  // ───────────────────────── TEACHER (fast, while online) ─────────────────
  const tctx = await browser.newContext({ viewport: VIEWPORT });
  const tp = await tctx.newPage();

  log('Teacher login page…');
  await tp.goto(`${BASE}/teacher/login`, { waitUntil: 'networkidle' });
  await sleep(600);
  await tp.screenshot({ path: `${SHOTS}/04-teacher-login.png` });

  // Fill + submit login
  await tp.locator('input[type="email"]').first().fill(TEACHER.email);
  await tp.locator('input[type="password"]').first().fill(TEACHER.password);
  await tp.getByRole('button', { name: '登入', exact: true }).click();
  await tp.waitForURL(/\/teacher\/?$/, { timeout: 8000 }).catch(() => {});
  await sleep(1200);
  await tp.screenshot({ path: `${SHOTS}/05-teacher-classes.png` });
  log('Captured classes list.');

  // Find class + sessions via API (cookies shared in context)
  const classes = await tctx.request.get(`${BASE}/api/teacher/classes`).then((r) => r.json());
  const classId = classes[0].id;
  await tp.goto(`${BASE}/teacher/classes/${classId}`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await tp.screenshot({ path: `${SHOTS}/06-teacher-classdetail.png`, fullPage: true });
  log('Captured class detail / roster.');

  const detail = await tctx.request.get(`${BASE}/api/teacher/classes/${classId}`).then((r) => r.json());
  const ming = detail.roster.find((r) => r.displayName === '陳小明') ?? detail.roster[0];
  const sid = ming.latestSessionId;

  log('Session viewer…', sid);
  await tp.goto(`${BASE}/teacher/sessions/${sid}`, { waitUntil: 'domcontentloaded' });
  await sleep(2000); // let Blockly render the snapshot
  await tp.screenshot({ path: `${SHOTS}/07-teacher-session-blocks.png` });

  await tp.getByRole('button', { name: 'Code' }).click().catch(() => {});
  await sleep(800);
  await tp.screenshot({ path: `${SHOTS}/08-teacher-session-code.png` });

  await tp.getByRole('button', { name: 'Timeline' }).click().catch(() => {});
  await sleep(900);
  await tp.screenshot({ path: `${SHOTS}/09-teacher-session-timeline.png` });
  log('Captured session viewer tabs.');

  await tctx.close();

  // ───────────────────────── STUDENT ─────────────────────────────────────
  const sctx = await browser.newContext({ viewport: VIEWPORT });
  const sp = await sctx.newPage();

  log('Student join page…');
  await sp.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await sleep(800);
  await sp.screenshot({ path: `${SHOTS}/01-join.png` });

  await sp.locator('input').nth(0).fill(JOIN_CODE);
  await sp.locator('input').nth(1).fill('小安');
  await sp.locator('button').last().click();
  await sp.waitForTimeout(2500);

  // Load a real program into the live Blockly workspace
  log('Loading blocks into workspace…');
  await sp.waitForFunction(() => typeof window.__loadScratchProgram === 'function', { timeout: 8000 });
  await sp.evaluate((json) => window.__loadScratchProgram(json), DANCING_CAT);
  await sp.waitForTimeout(1200);

  // Send a chat message to the live AI tutor
  log('Asking the AI tutor (live LLM)…');
  const input = sp.locator('textarea').first();
  await input.click();
  await input.fill('我想讓貓咪一直跳舞，要怎麼做？');
  await sp.keyboard.press('Enter');

  // Wait for an assistant reply to stream in (best-effort up to 45s)
  log('Waiting for AI response…');
  const before = await sp.locator('body').innerText();
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const now = await sp.locator('body').innerText();
    // assistant reply tends to be long; stop once body grew substantially & idle
    if (now.length > before.length + 80) {
      // wait a little more for streaming to settle, then break on stability
      const a = now.length; await sleep(2500); const b = (await sp.locator('body').innerText()).length;
      if (b === a || b > a) { if (b === a) break; }
    }
  }
  await sleep(1500);
  await sp.screenshot({ path: `${SHOTS}/02-student-workspace.png` });
  log('Captured student workspace + chat.');

  // Run the program (green flag) and snap the animated stage
  log('Running program…');
  await sp.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const run = btns.find((b) => /▶|執行|run|start/i.test((b.textContent || '') + (b.title || '') + (b.getAttribute('aria-label') || '')));
    run?.click();
  });
  await sleep(1500);
  await sp.screenshot({ path: `${SHOTS}/03-student-running.png` });
  log('Captured running state.');

  await sctx.close();
  await browser.close();
  log('DONE. Screenshots in', SHOTS);
}

main().catch((e) => { console.error(e); process.exit(1); });
