// Scenario runner. Uses stable data-testid hooks, so a redesign does not silently break the suite.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices, webkit } from "playwright-core";

const BASE = process.env.QA_BASE ?? "http://localhost:5173";
const VIDEO = process.env.QA_VIDEO ?? "https://vkvideo.ru/video-195334327_456241064";
const only = (
  process.argv.find((a) => a.startsWith("--only="))?.slice(7) ??
  process.argv[process.argv.indexOf("--only") + 1] ??
  ""
)
  .split(",")
  .filter((s) => s && !s.startsWith("--"));

function findBrowser(prefix, exe) {
  const root = join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (!existsSync(root)) return undefined;
  const dir = readdirSync(root)
    .filter((d) => d.startsWith(prefix))
    .sort()
    .pop();
  return dir ? join(root, dir, exe) : undefined;
}
const CHROME = process.env.QA_CHROME ?? findBrowser("chromium-", "chrome-win64/chrome.exe");
const WEBKIT = process.env.QA_WEBKIT ?? findBrowser("webkit-", "Playwright.exe");

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = (id) => `[data-testid="${id}"]`;

async function launch() {
  return chromium.launch({ executablePath: CHROME, args: ["--autoplay-policy=no-user-gesture-required"] });
}

async function newViewer(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, ...opts.context });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  if (opts.skewMs) {
    await page.addInitScript(`(()=>{const o=Date.now;Date.now=()=>o()+(${opts.skewMs});})()`);
  }
  return { ctx, page };
}

async function createRoomAsHost(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.fill(t("landing-name"), "Хозяин");
  await page.click(t("landing-start"));
  await page.waitForURL(/\/rooms\/[0-9a-f-]{36}/);
  return page.url();
}

async function addVideo(page, url = VIDEO, waitMs = 120000) {
  await page.fill(t("add-video-input"), url);
  await page.click(t("add-video-submit"));
  await page.waitForSelector(t("video"), { timeout: waitMs });
}

async function joinAsGuest(page, roomUrl, name) {
  await page.goto(roomUrl, { waitUntil: "networkidle" });
  await page.fill(t("guest-name"), name);
  await page.click(t("guest-submit"));
  await page.waitForSelector(t("video"), { timeout: 90000 });
}

const state = (page) =>
  page.evaluate(() => {
    const v = document.querySelector("video");
    return v ? { t: +v.currentTime.toFixed(2), paused: v.paused, rs: v.readyState, w: v.videoWidth } : null;
  });

async function waitFor(fn, ms = 30000, step = 400) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

const SCENARIOS = {
  async baseline() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      const friend = await newViewer(b);
      await joinAsGuest(friend.page, url, "Друг");
      await host.page.click(t("play-toggle"));
      await sleep(6000);
      const [h, f] = [await state(host.page), await state(friend.page)];
      check(!h.paused && !f.paused, `не играют: ${JSON.stringify({ h, f })}`);
      check(Math.abs(h.t - f.t) < 1, `расхождение ${Math.abs(h.t - f.t)} с`);
      return `играют, расхождение ${Math.abs(h.t - f.t).toFixed(2)} с, ${h.w}px`;
    } finally {
      await b.close();
    }
  },

  async "slow-viewer"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      const friend = await newViewer(b);
      await joinAsGuest(friend.page, url, "Друг");
      await host.page.click(t("play-toggle"));
      await sleep(5000);

      // ~600 kbit/s, 400 ms RTT: the stream (several Mbit/s) cannot keep up.
      const cdp = await friend.ctx.newCDPSession(friend.page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 400,
        downloadThroughput: (600 * 1024) / 8,
        uploadThroughput: (200 * 1024) / 8,
      });
      const banner = await waitFor(async () => (await host.page.locator(t("waiting-banner")).count()) > 0, 90000);
      check(banner, "комната не встала на паузу, пока у друга нет кадров");
      const paused = await state(host.page);
      check(paused.paused, "хозяин не на паузе во время ожидания");

      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      const resumed = await waitFor(async () => (await host.page.locator(t("waiting-banner")).count()) === 0, 90000);
      check(resumed, "комната не продолжила после улучшения сети");
      await sleep(4000);
      const [h, f] = [await state(host.page), await state(friend.page)];
      check(Math.abs(h.t - f.t) < 1.5, `рассинхрон после ожидания: ${h.t} vs ${f.t}`);
      return `пауза с баннером → продолжили, расхождение ${Math.abs(h.t - f.t).toFixed(2)} с`;
    } finally {
      await b.close();
    }
  },

  async "flaky-segments"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      const friend = await newViewer(b);
      await friend.page.route("**/video/proxy/**/*.ts", async (route) => {
        const r = Math.random();
        if (r < 0.08) return route.abort("connectionreset");
        if (r < 0.18) await sleep(3000);
        return route.continue().catch(() => {});
      });
      await joinAsGuest(friend.page, url, "Друг");
      await host.page.click(t("play-toggle"));
      await sleep(30000);
      const [h, f] = [await state(host.page), await state(friend.page)];
      check(f && f.t > 10, `у друга воспроизведение умерло: ${JSON.stringify(f)}`);
      check(Math.abs(h.t - f.t) < 2.5, `расхождение ${Math.abs(h.t - f.t).toFixed(1)} с`);
      check(friend.page.errors.length === 0, `ошибки страницы: ${friend.page.errors[0]}`);
      return `8% потерь, 10% задержек: играет, расхождение ${Math.abs(h.t - f.t).toFixed(2)} с`;
    } finally {
      await b.close();
    }
  },

  async "socket-drop"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      const friend = await newViewer(b);
      await joinAsGuest(friend.page, url, "Друг");
      await host.page.click(t("play-toggle"));
      await sleep(4000);
      await friend.ctx.setOffline(true);
      await sleep(8000);
      await host.page.click(t("play-toggle")); // host pauses while friend is offline
      await sleep(1000);
      await friend.ctx.setOffline(false);
      const synced = await waitFor(async () => (await state(friend.page))?.paused === true, 40000);
      check(synced, "после возврата сети друг не получил паузу хозяина");
      const [h, f] = [await state(host.page), await state(friend.page)];
      check(Math.abs(h.t - f.t) < 2, `позиции разошлись: ${h.t} vs ${f.t}`);
      return "сокет восстановился, пауза и позиция получены";
    } finally {
      await b.close();
    }
  },

  async "reload-mid-play"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      await host.page.click(t("play-toggle"));
      await sleep(12000);
      const before = await state(host.page);
      await host.page.reload({ waitUntil: "networkidle" });
      await host.page.waitForSelector(t("video"), { timeout: 60000 });
      await sleep(4000);
      const after = await state(host.page);
      const expected = before.t + 4 + 4; // time spent during reload + after
      check(Math.abs(after.t - expected) < 6, `после F5 позиция ${after.t}, ждали ≈${expected.toFixed(0)}`);
      return `вернулся на ${after.t.toFixed(1)} с (до F5: ${before.t.toFixed(1)})`;
    } finally {
      await b.close();
    }
  },

  async "clock-skew"() {
    const b = await launch();
    try {
      const host = await newViewer(b, { skewMs: 150000 });
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      const friend = await newViewer(b, { skewMs: -90000 });
      await joinAsGuest(friend.page, url, "Друг");
      await host.page.click(t("play-toggle"));
      await sleep(6000);
      const [h, f] = [await state(host.page), await state(friend.page)];
      check(h.t > 3 && f.t > 3, `застряли на старте: ${h.t} / ${f.t}`);
      check(Math.abs(h.t - f.t) < 1, `расхождение ${Math.abs(h.t - f.t)} с`);
      return `часы +150с/−90с: расхождение ${Math.abs(h.t - f.t).toFixed(2)} с`;
    } finally {
      await b.close();
    }
  },

  async "late-join"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      await host.page.click(t("play-toggle"));
      await sleep(15000);
      const late = await newViewer(b);
      await joinAsGuest(late.page, url, "Опоздал");
      await sleep(6000);
      const [h, l] = [await state(host.page), await state(late.page)];
      check(Math.abs(h.t - l.t) < 1.5, `опоздавший отстал: ${l.t} vs ${h.t}`);
      return `догнал, расхождение ${Math.abs(h.t - l.t).toFixed(2)} с`;
    } finally {
      await b.close();
    }
  },

  async "iphone-webkit"() {
    check(WEBKIT, "WebKit не найден (QA_WEBKIT)");
    const b = await webkit.launch({ executablePath: WEBKIT });
    try {
      const host = await newViewer(await launch());
      // Host in Chromium creates the room; the iPhone joins as a guest.
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      const ctx = await b.newContext({ ...devices["iPhone 13"] });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      await page.fill(t("guest-name"), "iPhone");
      await page.click(t("guest-submit"));
      await page.waitForSelector(t("video"), { timeout: 90000 });
      await host.page.click(t("play-toggle"));
      await sleep(8000);
      const f = await state(page);
      check(f && f.w > 0 && f.t > 2, `iPhone: нет кадра/времени ${JSON.stringify(f)}`);
      return `Safari/iPhone играет: ${f.w}px, ${f.t.toFixed(1)} с`;
    } finally {
      await b.close();
    }
  },

  async crowd() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      const viewers = [];
      for (let i = 0; i < 7; i++) {
        const v = await newViewer(b);
        viewers.push(v);
        await joinAsGuest(v.page, url, `Зритель${i + 1}`);
      }
      await host.page.click(t("play-toggle"));
      await sleep(8000);
      const times = [];
      for (const v of [host, ...viewers]) times.push((await state(v.page))?.t ?? -1);
      const spread = Math.max(...times) - Math.min(...times);
      check(
        times.every((x) => x > 3),
        `кто-то не играет: ${times}`,
      );
      check(spread < 2, `разброс ${spread.toFixed(1)} с: ${times}`);
      return `8 зрителей, разброс ${spread.toFixed(2)} с`;
    } finally {
      await b.close();
    }
  },

  async "mobile-layout"() {
    const b = await launch();
    try {
      const ctx = await b.newContext({ ...devices["Pixel 7"] });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      await page.fill(t("landing-name"), "Телефон");
      await page.click(t("landing-start"));
      await page.waitForURL(/\/rooms\//);
      await sleep(1000);
      const m = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        input: !!document.querySelector('[data-testid="chat-input"]'),
      }));
      check(m.overflow <= 0, `горизонтальная прокрутка ${m.overflow}px`);
      check(m.input, "поле чата не видно на телефоне");
      const box = await page.locator(t("chat-input")).boundingBox();
      check(box && box.y + box.height <= 915, "поле ввода вне экрана");
      return "без горизонтальной прокрутки, поле чата на экране";
    } finally {
      await b.close();
    }
  },
};

const names = Object.keys(SCENARIOS).filter((n) => only.length === 0 || only.includes(n));
for (const name of names) {
  const t0 = Date.now();
  try {
    const note = await SCENARIOS[name]();
    results.push({ name, ok: true, note });
    console.log(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s): ${note}`);
  } catch (e) {
    results.push({ name, ok: false, note: e.message });
    console.log(`FAIL ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s): ${e.message}`);
  }
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
