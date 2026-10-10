// Scenario runner. Uses stable data-testid hooks, so a redesign does not silently break the suite.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices, webkit } from "playwright-core";

const BASE = process.env.QA_BASE ?? "http://localhost:5173";
const VIDEO = process.env.QA_VIDEO ?? "https://vkvideo.ru/video-195334327_456241064";
// --only a,b  or  --only=a,b ; no flag means "everything".
const onlyIdx = process.argv.findIndex((a) => a === "--only" || a.startsWith("--only="));
const onlyRaw =
  onlyIdx === -1
    ? ""
    : process.argv[onlyIdx].includes("=")
      ? process.argv[onlyIdx].split("=")[1]
      : (process.argv[onlyIdx + 1] ?? "");
const only = onlyRaw.split(",").filter(Boolean);

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

// Short public videos of different lengths, for queue/hand-over scenarios.
const FLOWER = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"; // ~5 s
const BBB_360 = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4"; // 10 s
const BBB_720 = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4"; // 10 s
const BBB_1080 = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4"; // 10 s

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
    return v
      ? {
          t: +v.currentTime.toFixed(2),
          paused: v.paused,
          rs: v.readyState,
          w: v.videoWidth,
          dur: Math.round(v.duration || 0),
        }
      : null;
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
      // From a chosen moment the friend's segment requests hang (a dead mobile network, a lift).
      // Throttling by bandwidth would prove nothing on a low-bitrate clip, so the hold is explicit.
      let hold = false;
      await friend.page.route("**/video/proxy/**", async (route) => {
        if (hold && /\.(ts|m4s)(\?|$)/.test(route.request().url())) await sleep(75000);
        return route.continue().catch(() => {});
      });
      await joinAsGuest(friend.page, url, "Друг");
      await host.page.click(t("play-toggle"));
      await sleep(5000);

      hold = true;
      // Jump far beyond what the friend has buffered: his player must go and fetch, and cannot.
      await host.page.evaluate((sel) => {
        const r = document.querySelector(sel);
        r.value = String(Math.min(Number(r.max) - 5, 400));
        r.dispatchEvent(new Event("input", { bubbles: true }));
        r.dispatchEvent(new Event("change", { bubbles: true }));
      }, t("seek"));
      const banner = await waitFor(async () => (await host.page.locator(t("waiting-banner")).count()) > 0, 45000);
      check(banner, "комната не встала на паузу, пока у друга нет кадров");
      await sleep(1500);
      const paused = await state(host.page);
      check(paused.paused, "хозяин не на паузе во время ожидания");
      const frozenAt = paused.t;
      await sleep(4000);
      check(Math.abs((await state(host.page)).t - frozenAt) < 0.5, "время ушло вперёд, пока комната ждёт");

      hold = false;
      await friend.page.unroute("**/video/proxy/**");
      const resumed = await waitFor(async () => (await host.page.locator(t("waiting-banner")).count()) === 0, 90000);
      check(resumed, "комната не продолжила после возврата сети");
      await sleep(5000);
      const [h, f] = [await state(host.page), await state(friend.page)];
      check(!h.paused, "комната не поехала дальше");
      check(Math.abs(h.t - f.t) < 1.5, `рассинхрон после ожидания: ${h.t} vs ${f.t}`);
      return `пауза с баннером на ${frozenAt.toFixed(0)} с → продолжили, расхождение ${Math.abs(h.t - f.t).toFixed(2)} с`;
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
      // Sit between the friend's page and the server so the socket can be cut for real — the way a
      // metro tunnel or a Wi-Fi/LTE switch cuts it. (`setOffline` alone leaves a local socket open.)
      let blocked = false;
      const live = [];
      await friend.page.routeWebSocket(/socket\.io/, (ws) => {
        if (blocked) return ws.close();
        const server = ws.connectToServer();
        live.push({ ws, server });
      });
      await joinAsGuest(friend.page, url, "Друг");
      await host.page.click(t("play-toggle"));
      await sleep(4000);

      blocked = true;
      for (const c of live.splice(0)) await c.ws.close({ code: 1006 }).catch(() => {});
      await sleep(8000);
      await host.page.click(t("play-toggle")); // host pauses while the friend is cut off
      await host.page.evaluate(() => {
        const input = document.querySelector('[data-testid="chat-input"]');
        input?.focus();
      });
      await host.page.fill(t("chat-input"), "сообщение пока ты был офлайн");
      await host.page.click(t("chat-send"));
      await sleep(1000);

      blocked = false;
      const synced = await waitFor(async () => (await state(friend.page))?.paused === true, 45000);
      check(synced, "после возврата сети друг не получил паузу хозяина (сокет не вошёл в комнату заново)");
      const gotChat = await waitFor(
        async () => (await friend.page.locator(t("chat-log")).innerText()).includes("пока ты был офлайн"),
        20000,
      );
      check(gotChat, "сообщение, отправленное пока друг был офлайн, не догрузилось");
      const [h, f] = [await state(host.page), await state(friend.page)];
      check(Math.abs(h.t - f.t) < 2, `позиции разошлись: ${h.t} vs ${f.t}`);
      return "сокет разорван и восстановлен: пауза, позиция и пропущенный чат получены";
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

  // Playwright's WebKit build for Windows has neither MSE nor native HLS, so real Safari playback
  // cannot be proven here. What this does prove: the iPhone-sized UI, joining, chat both ways with
  // a Chromium host, no horizontal scroll — and that a browser which cannot play says so.
  async "webkit-ui"() {
    check(WEBKIT, "WebKit не найден (QA_WEBKIT)");
    const b = await webkit.launch({ executablePath: WEBKIT });
    const hb = await launch();
    try {
      const host = await newViewer(hb);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      const ctx = await b.newContext({ ...devices["iPhone 13"] });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      await page.fill(t("guest-name"), "iPhone");
      await page.click(t("guest-submit"));
      await page.waitForSelector(t("video"), { timeout: 90000 });
      await page.fill(t("chat-input"), "привет с айфона");
      await page.click(t("chat-send"));
      const gotIt = await waitFor(
        async () => (await host.page.locator(t("chat-log")).innerText()).includes("привет с айфона"),
        15000,
      );
      check(gotIt, "сообщение с iPhone не дошло до хозяина");
      const media = await page.evaluate(() => {
        const v = document.querySelector("video");
        return {
          mse: typeof window.MediaSource !== "undefined" || typeof window.ManagedMediaSource !== "undefined",
          hls: !!v.canPlayType("application/vnd.apple.mpegurl"),
        };
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(overflow <= 0, `горизонтальная прокрутка ${overflow}px`);
      if (!media.mse && !media.hls) {
        check((await page.locator(t("unsupported")).count()) > 0, "браузер не умеет видео, но не сообщает об этом");
        return "UI и чат ок; в этой сборке WebKit нет медиа — показано сообщение «браузер не поддерживает» (воспроизведение Safari проверить нельзя)";
      }
      await host.page.click(t("play-toggle"));
      await sleep(8000);
      const f = await state(page);
      check(f && f.w > 0 && f.t > 2, `iPhone: нет кадра/времени ${JSON.stringify(f)}`);
      return `Safari играет: ${f.w}px, ${f.t.toFixed(1)} с`;
    } finally {
      await b.close();
      await hb.close();
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

  // A guest who is already in one room must be able to open another (the old build pinned a guest
  // to a single room and answered 403 — shown to people as "could not enter the room").
  async "guest-two-rooms"() {
    const b = await launch();
    try {
      const hostA = await newViewer(b);
      const urlA = await createRoomAsHost(hostA.page);
      const hostB = await newViewer(b);
      const urlB = await createRoomAsHost(hostB.page);
      const g = await newViewer(b);
      await g.page.goto(urlA, { waitUntil: "networkidle" });
      await g.page.fill(t("guest-name"), "Гость");
      await g.page.click(t("guest-submit"));
      await g.page.waitForSelector(t("chat-input"), { timeout: 30000 });
      await g.page.goto(urlB, { waitUntil: "networkidle" });
      const inB = await waitFor(async () => (await g.page.locator(t("chat-input")).count()) > 0, 20000);
      check(inB, `гость не смог зайти во вторую комнату: ${(await g.page.innerText("body")).slice(0, 140)}`);
      await g.page.goto(urlA, { waitUntil: "networkidle" });
      const backA = await waitFor(async () => (await g.page.locator(t("chat-input")).count()) > 0, 20000);
      check(backA, "гость не смог вернуться в первую комнату");
      return "один гость зашёл в две комнаты и вернулся в первую";
    } finally {
      await b.close();
    }
  },

  // "Create room" must always create one — same visitor, same name, as many as they like.
  async "new-room-each-time"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const urls = [await createRoomAsHost(host.page)];
      for (let i = 0; i < 2; i++) {
        await host.page.goto(`${BASE}/`, { waitUntil: "networkidle" });
        await host.page.fill(t("landing-name"), "Хозяин");
        await host.page.click(t("landing-start"));
        await host.page.waitForURL((u) => !urls.includes(u.toString()) && /\/rooms\/[0-9a-f-]{36}/.test(u.toString()), {
          timeout: 15000,
        });
        urls.push(host.page.url());
      }
      check(new Set(urls).size === 3, `комнаты не новые: ${urls.map((u) => u.slice(-6))}`);
      return "три комнаты подряд с одним именем — три разные";
    } finally {
      await b.close();
    }
  },

  // A new video must start at 0:00, paused — not at the place the previous film stopped.
  async "new-video-resets"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      await createRoomAsHost(host.page);
      await addVideo(host.page);
      await host.page.click(t("play-toggle"));
      await sleep(3000);
      await host.page.evaluate((sel) => {
        const r = document.querySelector(sel);
        r.value = String(Math.min(Number(r.max) - 5, 300));
        r.dispatchEvent(new Event("input", { bubbles: true }));
        r.dispatchEvent(new Event("change", { bubbles: true }));
      }, t("seek"));
      await sleep(2500);
      const before = await state(host.page);
      check(before.t > 30, `подготовка не удалась: позиция ${before.t}`);

      await host.page.fill(t("queue-add-input"), FLOWER);
      await host.page.click(t("queue-add-submit"));
      await waitFor(
        async () => (await host.page.locator(`${t("queue-item")}[data-status="queued"]`).count()) > 0,
        20000,
      );
      await host.page.locator(t("queue-play")).first().click();
      const switched = await waitFor(
        async () => {
          const s = await state(host.page);
          return s && s.dur > 0 && s.dur < 60;
        },
        90000,
        800,
      );
      check(switched, "новое видео не появилось");
      await sleep(1500);
      const after = await state(host.page);
      check(after.t < 2, `новое видео началось с ${after.t} с, а не с нуля`);
      check(after.paused, "новое видео сразу пошло играть, хотя комната должна ждать");
      return `новое видео стоит на ${after.t.toFixed(1)} с, на паузе`;
    } finally {
      await b.close();
    }
  },

  // Pause must stay paused: a stale "playing" heartbeat must not bring the film back to life.
  async "pause-sticks"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      const friend = await newViewer(b);
      await joinAsGuest(friend.page, url, "Друг");
      await host.page.click(t("play-toggle"));
      await sleep(2000);
      for (let i = 0; i < 16; i++) {
        await host.page.click(t("play-toggle"));
        await sleep(350);
      }
      if (!(await state(host.page)).paused) await host.page.click(t("play-toggle"));
      await sleep(12000);
      const [h1, f1] = [await state(host.page), await state(friend.page)];
      await sleep(3000);
      const [h2, f2] = [await state(host.page), await state(friend.page)];
      check(
        h1.paused && f1.paused && h2.paused && f2.paused,
        `пауза не удержалась: ${JSON.stringify({ h1, f1, h2, f2 })}`,
      );
      check(Math.abs(h2.t - h1.t) < 0.3 && Math.abs(f2.t - f1.t) < 0.3, "время идёт на паузе");
      check(Math.abs(h2.t - f2.t) < 1, `хозяин и друг стоят на разных секундах: ${h2.t} / ${f2.t}`);
      return `16 переключений подряд; пауза держится, обе стороны на ${h2.t.toFixed(1)} с`;
    } finally {
      await b.close();
    }
  },

  // While the room is held because a friend has no frames, the button the host sees is the one that
  // should say "pause" — pressing it must keep the room stopped even after the friend catches up.
  async "pause-during-stall"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      const friend = await newViewer(b);
      let hold = false;
      await friend.page.route("**/video/proxy/**", async (route) => {
        if (hold && /\.(ts|m4s)(\?|$)/.test(route.request().url())) await sleep(40000);
        return route.continue().catch(() => {});
      });
      await joinAsGuest(friend.page, url, "Друг");
      await host.page.click(t("play-toggle"));
      await sleep(3000);
      hold = true;
      await host.page.evaluate((sel) => {
        const r = document.querySelector(sel);
        r.value = String(Math.min(Number(r.max) - 5, 300));
        r.dispatchEvent(new Event("input", { bubbles: true }));
        r.dispatchEvent(new Event("change", { bubbles: true }));
      }, t("seek"));
      const held = await waitFor(async () => (await host.page.locator(t("waiting-banner")).count()) > 0, 40000);
      check(held, "комната не встала в ожидание");
      // The host presses the (only) button once while the room is held.
      await host.page.click(t("play-toggle"));
      await sleep(1500);
      check((await state(host.page)).paused, "после нажатия во время ожидания комната пошла играть");
      hold = false;
      await friend.page.unroute("**/video/proxy/**");
      await waitFor(async () => (await host.page.locator(t("waiting-banner")).count()) === 0, 60000);
      await sleep(6000);
      const [h, f] = [await state(host.page), await state(friend.page)];
      check(h.paused && f.paused, `комната сама поехала после ожидания: ${JSON.stringify({ h, f })}`);
      return "нажал «пауза» во время ожидания — комната осталась на паузе";
    } finally {
      await b.close();
    }
  },

  // Queue: order, hand-over by itself when a video ends (waiting for everybody's first seconds),
  // remove, skip. Short clips so the whole thing runs in a minute.
  async "queue-add-order-advance"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page, FLOWER);
      const friend = await newViewer(b);
      await joinAsGuest(friend.page, url, "Друг");

      for (const u of [BBB_360, BBB_720]) {
        await host.page.fill(t("queue-add-input"), u);
        await host.page.click(t("queue-add-submit"));
        await sleep(600);
      }
      const queued = () => host.page.locator(`${t("queue-item")}[data-status="queued"]`);
      check(await waitFor(async () => (await queued().count()) === 2, 20000), "в очереди не два видео");
      const titles = await queued().evaluateAll((els) => els.map((e) => e.getAttribute("data-title")));
      check(/360/.test(titles[0]) && /720/.test(titles[1]), `порядок очереди неверный: ${titles}`);
      check(
        await waitFor(async () => (await friend.page.locator(t("queue-item")).count()) === 3, 15000),
        "друг не видит очередь",
      );

      // Play the 5-second clip to the end: the room must move on to the 360p clip and start it by itself.
      await host.page.click(t("play-toggle"));
      const playingTitle = async () =>
        (await host.page.locator(`${t("queue-item")}[data-status="playing"]`).getAttribute("data-title")) ?? "";
      check(
        await waitFor(async () => /360/.test(await playingTitle()), 60000),
        "после конца первого видео комната не перешла ко второму",
      );
      const autoStarted = await waitFor(async () => {
        const [h, f] = [await state(host.page), await state(friend.page)];
        return h && f && !h.paused && !f.paused && h.t > 0.5 && f.t > 0.5 && h.dur > 0 && h.dur < 30;
      }, 45000);
      check(autoStarted, "следующее видео не запустилось само");

      // Remove the remaining queued one, then add another and skip to it.
      await host.page.locator(t("queue-remove")).first().click();
      check(await waitFor(async () => (await queued().count()) === 0, 15000), "видео не убралось из очереди");
      await host.page.fill(t("queue-add-input"), BBB_1080);
      await host.page.click(t("queue-add-submit"));
      check(await waitFor(async () => (await queued().count()) === 1, 15000), "новое видео не встало в очередь");
      await host.page.click(t("queue-next"));
      check(await waitFor(async () => /1080/.test(await playingTitle()), 30000), "«Следующее» не переключило на 1080");
      return "порядок, автопереход с автозапуском, удаление и «Следующее» работают";
    } finally {
      await b.close();
    }
  },

  // Nobody can start the film until the first seconds are on the device.
  async "startup-gate"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      await createRoomAsHost(host.page);
      let hold = true;
      await host.page.route("**/video/proxy/**", async (route) => {
        if (hold && /\.(ts|m4s)(\?|$)/.test(route.request().url())) await sleep(9000);
        return route.continue().catch(() => {});
      });
      await addVideo(host.page, BBB_720);
      check((await host.page.locator(t("startup-gate")).count()) > 0, "нет надписи «Загружаем первые секунды…»");
      check(
        await host.page.locator(t("play-toggle")).isDisabled(),
        "кнопка «Смотреть» доступна, пока ничего не загружено",
      );
      hold = false;
      check(
        await waitFor(async () => (await host.page.locator(t("startup-gate")).count()) === 0, 40000),
        "ограничение не снялось после загрузки",
      );
      check(!(await host.page.locator(t("play-toggle")).isDisabled()), "кнопка осталась недоступной");
      await host.page.click(t("play-toggle"));
      await sleep(3000);
      const s = await state(host.page);
      check(!s.paused && s.t > 0.5, `не запустилось: ${JSON.stringify(s)}`);
      return "до загрузки старт недоступен, после — работает";
    } finally {
      await b.close();
    }
  },

  // Chat: every message shows who wrote it, a reply carries a quote of the original (clicking it jumps
  // back), and the others see "X is typing…".
  async "chat-reply-author-typing"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      const friend = await newViewer(b);
      await friend.page.goto(url, { waitUntil: "networkidle" });
      await friend.page.fill(t("guest-name"), "Друг");
      await friend.page.click(t("guest-submit"));
      await friend.page.waitForSelector(t("chat-input"), { timeout: 30000 });

      await friend.page.fill(t("chat-input"), "первое сообщение");
      await friend.page.click(t("chat-send"));
      await friend.page.fill(t("chat-input"), "второе сообщение");
      await friend.page.click(t("chat-send"));
      check(
        await waitFor(async () => (await host.page.locator(t("chat-message")).count()) === 2, 15000),
        "хозяин не получил два сообщения",
      );
      // Two messages in a row from one person: BOTH carry the author's name.
      const authors = await host.page.locator(t("chat-author")).allInnerTexts();
      check(
        authors.length === 2 && authors.every((a) => a.trim() === "Друг"),
        `имя не у каждого сообщения: ${JSON.stringify(authors)}`,
      );

      // Typing indicator on the friend's side while the host types.
      await host.page.locator(t("chat-input")).pressSequentially("пишу ответ", { delay: 60 });
      check(
        await waitFor(
          async () =>
            /Хозяин печатает/.test(
              await friend.page
                .locator(t("chat-typing"))
                .innerText()
                .catch(() => ""),
            ),
          8000,
        ),
        "друг не видит «печатает…»",
      );

      // Reply to the FIRST message.
      await host.page.fill(t("chat-input"), "");
      const first = host.page.locator(t("chat-message")).first();
      await first.hover();
      await first.locator(t("chat-reply")).click();
      check(
        (await host.page.locator(t("chat-replying")).innerText()).includes("первое сообщение"),
        "строка «ответ на…» не показала оригинал",
      );
      await host.page.fill(t("chat-input"), "это ответ");
      await host.page.click(t("chat-send"));

      check(
        await waitFor(async () => (await friend.page.locator(t("chat-quote")).count()) === 1, 15000),
        "у друга нет цитаты в ответе",
      );
      const quote = await friend.page.locator(t("chat-quote")).innerText();
      check(quote.includes("Друг") && quote.includes("первое сообщение"), `цитата не та: ${quote}`);
      // The same quote survives a reload (it comes from stored history, not only from live events).
      await friend.page.reload({ waitUntil: "networkidle" });
      await friend.page.waitForSelector(t("chat-input"), { timeout: 30000 });
      check(
        await waitFor(async () => (await friend.page.locator(t("chat-quote")).count()) === 1, 10000),
        "после перезагрузки цитата пропала",
      );
      return "имя у каждого сообщения, «печатает…», ответ с цитатой (живой и из истории)";
    } finally {
      await b.close();
    }
  },

  // The host loses the connection (tunnel, Wi-Fi switch) while the friend keeps going. When the host
  // comes back he is still the owner, sees the state the friend left, and gets the chat he missed.
  async "reconnect-host"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      let blocked = false;
      const live = [];
      await host.page.routeWebSocket(/socket\.io/, (ws) => {
        if (blocked) return ws.close();
        live.push({ ws, server: ws.connectToServer() });
      });
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page);
      const friend = await newViewer(b);
      await joinAsGuest(friend.page, url, "Друг");
      await host.page.click(t("play-toggle"));
      await sleep(3000);

      blocked = true;
      for (const c of live.splice(0)) await c.ws.close({ code: 1006 }).catch(() => {});
      await sleep(3000);
      await friend.page.click(t("play-toggle")); // friend pauses while the host is cut off
      await friend.page.fill(t("chat-input"), "ты пропустил это");
      await friend.page.click(t("chat-send"));
      await sleep(2000);

      blocked = false;
      check(
        await waitFor(async () => (await state(host.page))?.paused === true, 40000),
        "хозяин не получил паузу после возврата",
      );
      check(
        await waitFor(
          async () => (await host.page.locator(t("chat-log")).innerText()).includes("ты пропустил это"),
          20000,
        ),
        "хозяин не получил пропущенное сообщение",
      );
      check(
        (await host.page.getByRole("button", { name: "Настройки комнаты" }).count()) > 0,
        "хозяин потерял права владельца",
      );
      check((await host.page.locator(t("queue-add-input")).count()) > 0, "у хозяина пропала очередь");
      const [h, f] = [await state(host.page), await state(friend.page)];
      check(Math.abs(h.t - f.t) < 2, `позиции разошлись: ${h.t} / ${f.t}`);
      return "хозяин вернулся: права, пауза, позиция и пропущенный чат на месте";
    } finally {
      await b.close();
    }
  },

  // A viewer is offline while the room moves on to the next video; when he returns he must be
  // on the NEW video and see the new queue, not stare at the old one.
  async "reconnect-mid-switch"() {
    const b = await launch();
    try {
      const host = await newViewer(b);
      const url = await createRoomAsHost(host.page);
      await addVideo(host.page, FLOWER);
      await host.page.fill(t("queue-add-input"), BBB_360);
      await host.page.click(t("queue-add-submit"));
      const friend = await newViewer(b);
      let blocked = false;
      const live = [];
      await friend.page.routeWebSocket(/socket\.io/, (ws) => {
        if (blocked) return ws.close();
        live.push({ ws, server: ws.connectToServer() });
      });
      await joinAsGuest(friend.page, url, "Друг");
      check(
        await waitFor(async () => (await friend.page.locator(t("queue-item")).count()) === 2, 15000),
        "друг не видит очередь",
      );

      blocked = true;
      for (const c of live.splice(0)) await c.ws.close({ code: 1006 }).catch(() => {});
      await sleep(1500);
      await host.page.click(t("queue-next"));
      await sleep(2500);
      blocked = false;

      const title = async () =>
        (await friend.page
          .locator(`${t("queue-item")}[data-status="playing"]`)
          .getAttribute("data-title")
          .catch(() => "")) ?? "";
      check(
        await waitFor(async () => /360/.test(await title()), 40000),
        `после возврата друг не увидел новое видео в очереди: «${await title()}»`,
      );
      const switched = await waitFor(async () => {
        const s = await state(friend.page);
        return s && s.dur >= 8 && s.dur <= 14; // the 10-second clip, not the 5-second flower
      }, 40000);
      check(switched, `друг остался на старом видео: ${JSON.stringify(await state(friend.page))}`);
      return "друг вернулся и оказался на новом видео с новой очередью";
    } finally {
      await b.close();
    }
  },

  // Needs a backend started with ROOM_IDLE_HOURS=0.002 ROOM_CLEANUP_INTERVAL_MS=3000, otherwise skipped.
  async "room-expiry"() {
    if (process.env.QA_ROOM_EXPIRY !== "1")
      throw new Error("SKIP: нужен бэкенд с ROOM_IDLE_HOURS=0.002 и QA_ROOM_EXPIRY=1");
    const b = await launch();
    try {
      const gone = await newViewer(b);
      const urlGone = await createRoomAsHost(gone.page);
      await gone.ctx.close(); // the creator leaves: nobody is in the room any more
      const kept = await newViewer(b);
      const urlKept = await createRoomAsHost(kept.page); // somebody stays inside
      await sleep(16000);
      const probe = await newViewer(b);
      await probe.page.goto(urlGone, { waitUntil: "networkidle" });
      check(
        await waitFor(async () => /не найдена/i.test(await probe.page.innerText("body")), 8000),
        "забытая комната не удалилась",
      );
      await probe.page.goto(urlKept, { waitUntil: "networkidle" });
      await sleep(1500);
      check(!/не найдена/i.test(await probe.page.innerText("body")), "комната, в которой сидят, удалилась");
      return "пустая комната удалена, занятая осталась";
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
    if (String(e.message).startsWith("SKIP:")) {
      results.push({ name, ok: true, note: e.message });
      console.log(`SKIP ${name}: ${e.message.slice(5).trim()}`);
      continue;
    }
    results.push({ name, ok: false, note: e.message });
    console.log(`FAIL ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s): ${e.message}`);
  }
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
