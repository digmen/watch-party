// Real Lighthouse runs (not the DevTools button): every public page and the room, in all three modes
// (navigation / timespan / snapshot) on mobile and desktop. Reports go to qa/reports/.
//
//   QA_BASE=https://watch.kerry.zone node lighthouse.mjs [--only navigation] [--form mobile]
//
// Thresholds are checked at the end; exit code 1 if any is missed.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startFlow } from "lighthouse";
import puppeteer from "puppeteer-core";

const BASE = process.env.QA_BASE ?? "https://watch.kerry.zone";
const OUT = join(import.meta.dirname, "reports");
mkdirSync(OUT, { recursive: true });

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
};
const onlyMode = arg("only");
const onlyForm = arg("form");

function chromePath() {
  const root = join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const dir = readdirSync(root)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .pop();
  return process.env.QA_CHROME ?? join(root, dir, "chrome-win64", "chrome.exe");
}

const PAGES = [
  { name: "landing", path: "/" },
  { name: "public", path: "/public" },
  { name: "about", path: "/about" },
  { name: "login", path: "/login" },
  { name: "privacy", path: "/privacy" },
  { name: "terms", path: "/terms" },
  { name: "notfound", path: "/this-page-does-not-exist" },
];

const THRESHOLDS = { performance: 0.8, accessibility: 0.95, "best-practices": 0.95, seo: 0.95 };

const configFor = (form) => ({
  extends: "lighthouse:default",
  settings: {
    formFactor: form,
    screenEmulation:
      form === "mobile"
        ? { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false }
        : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
    // Lighthouse's "slow 4G" mobile simulation is what real phones on mobile data resemble.
    throttlingMethod: "simulate",
  },
});

const rows = [];

function record(label, form, mode, lhr) {
  const scores = {};
  for (const [id, cat] of Object.entries(lhr.categories)) scores[id] = cat.score;
  rows.push({ label, form, mode, scores });
  const fmt = (v) => (v === null || v === undefined ? "  – " : String(Math.round(v * 100)).padStart(3));
  console.log(
    `${form.padEnd(7)} ${mode.padEnd(10)} ${label.padEnd(16)} perf ${fmt(scores.performance)}  a11y ${fmt(scores.accessibility)}  bp ${fmt(scores["best-practices"])}  seo ${fmt(scores.seo)}`,
  );
}

async function run(form) {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const page = await browser.newPage();
    const flow = await startFlow(page, { config: configFor(form), name: `watch-party ${form}` });

    if (!onlyMode || onlyMode === "navigation") {
      for (const p of PAGES) await flow.navigate(`${BASE}${p.path}`, { name: `navigation ${p.name}` });
    }

    // Snapshots: the page as it is after load, no reload.
    if (!onlyMode || onlyMode === "snapshot") {
      for (const p of PAGES) {
        await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle0" });
        await flow.snapshot({ name: `snapshot ${p.name}` });
      }
    }

    // Timespan + room: start a room as a guest while Lighthouse is watching the interaction.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    if (!onlyMode || onlyMode === "timespan") {
      await flow.startTimespan({ name: "timespan landing -> room" });
      await page.type('[data-testid="landing-name"]', "Lighthouse");
      await page.click('[data-testid="landing-start"]');
      await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1500));
      await flow.endTimespan();
    } else {
      await page.type('[data-testid="landing-name"]', "Lighthouse");
      await page.click('[data-testid="landing-start"]');
      await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
    }
    if (!onlyMode || onlyMode === "snapshot") await flow.snapshot({ name: "snapshot room (empty)" });

    const result = await flow.createFlowResult();
    writeFileSync(join(OUT, `flow-${form}.json`), JSON.stringify(result));
    writeFileSync(join(OUT, `flow-${form}.html`), await flow.generateReport());
    for (const step of result.steps)
      record(step.name.replace(/^(navigation|snapshot|timespan) /, ""), form, step.lhr.gatherMode, step.lhr);
  } finally {
    await browser.close();
  }
}

for (const form of ["mobile", "desktop"]) {
  if (onlyForm && onlyForm !== form) continue;
  try {
    await run(form);
  } catch (e) {
    console.log(`FAILED to run ${form}: ${e.message}`);
    process.exitCode = 1;
  }
}

writeFileSync(join(OUT, "summary.json"), JSON.stringify(rows, null, 1));
let failed = 0;
// Pages that are deliberately kept out of search results: "is the page crawlable" cannot be a goal there.
const NOINDEX_ON_PURPOSE = new Set(["login", "notfound"]);
for (const r of rows) {
  for (const [cat, min] of Object.entries(THRESHOLDS)) {
    const v = r.scores[cat];
    // Timespan runs have no SEO score by design; snapshots have no performance score.
    if (v === null || v === undefined) continue;
    if (cat === "performance" && r.mode === "snapshot") continue;
    if (cat === "seo" && NOINDEX_ON_PURPOSE.has(r.label)) continue;
    if (v < min) {
      failed++;
      console.log(`BELOW ${cat} ${Math.round(v * 100)} < ${Math.round(min * 100)}  (${r.form} ${r.mode} ${r.label})`);
    }
  }
}
console.log(failed ? `\n${failed} score(s) below target` : "\nAll scores meet the targets");
if (failed) process.exitCode = 1;
