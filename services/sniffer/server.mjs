// POST /sniff {"url": "https://page"}  ->  {"ok":true,"media":{url,kind,headers},"title":"..."}
// One page at a time (a browser is ~300-400 MB), hard 40 s ceiling per request.
import dns from "node:dns/promises";
import http from "node:http";
import net from "node:net";
import { chromium } from "playwright-core";

const PORT = Number(process.env.PORT ?? 4000);
const TOTAL_MS = 40_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const EXECUTABLE = process.env.CHROME_PATH || undefined;

// --- network safety: the browser must never reach private/internal addresses -------------------
function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}
const hostCache = new Map();
async function hostIsPublic(hostname) {
  if (hostCache.has(hostname)) return hostCache.get(hostname);
  let ok = false;
  try {
    if (net.isIP(hostname)) ok = !isPrivateIp(hostname);
    else if (hostname !== "localhost" && !hostname.endsWith(".internal") && !hostname.endsWith(".local")) {
      const addrs = await dns.lookup(hostname, { all: true });
      ok = addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
    }
  } catch {
    ok = false;
  }
  hostCache.set(hostname, ok);
  return ok;
}

// --- what counts as "the video" ---------------------------------------------------------------
const BLOCKED_TYPES = new Set(["image", "font", "stylesheet"]);
const AD_HOSTS =
  /(doubleclick|googlesyndication|google-analytics|googletagmanager|adservice|adsystem|mc\.yandex|top-fwz|hotjar|adriver|adfox|smi2|popunder|clickadu|exoclick|propeller)/i;
const MEDIA_URL = /\.(m3u8|mpd|mp4|webm|m4v)(\?|#|$)/i;

function classify(url, contentType) {
  const ct = (contentType ?? "").toLowerCase();
  if (/\.m3u8(\?|#|$)/i.test(url) || ct.includes("mpegurl")) return "hls";
  if (/\.mpd(\?|#|$)/i.test(url) || ct.includes("dash+xml")) return "dash";
  if (MEDIA_URL.test(url) || ct.startsWith("video/")) return "mp4";
  return null;
}

// Prefer an HLS master playlist (all qualities), then any HLS, then DASH, then the biggest mp4.
function pick(found) {
  if (found.length === 0) return null;
  const rank = (f) => (f.kind === "hls" ? (f.master ? 4 : 3) : f.kind === "dash" ? 2 : 1);
  return [...found].sort((a, b) => rank(b) - rank(a) || b.len - a.len || b.at - a.at)[0];
}

const TRIGGERS = [
  ".vjs-big-play-button",
  ".jw-icon-display",
  ".plyr__control--overlaid",
  "[class*=play-button]",
  "[class*=PlayButton]",
  "[class*=play_btn]",
  "[aria-label*=Play i]",
  "[aria-label*=Воспроизв i]",
  ".play",
  "#play",
];

async function sniff(pageUrl) {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--disable-dev-shm-usage"],
  });
  const started = Date.now();
  const left = () => TOTAL_MS - (Date.now() - started);
  try {
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 720 },
      locale: "ru-RU",
    });
    const page = await context.newPage();
    // Pop-unders and "open in new tab" ads: close anything that is not the main page.
    context.on("page", (p) => {
      if (p !== page) p.close().catch(() => {});
    });
    await context.route("**/*", async (route) => {
      const req = route.request();
      let u;
      try {
        u = new URL(req.url());
      } catch {
        return route.abort();
      }
      if (!/^https?:$/.test(u.protocol)) return route.continue();
      if (BLOCKED_TYPES.has(req.resourceType())) return route.abort();
      if (AD_HOSTS.test(req.url())) return route.abort();
      if (!(await hostIsPublic(u.hostname))) return route.abort("blockedbyclient");
      return route.continue();
    });

    const found = [];
    page.on("response", async (res) => {
      const url = res.url();
      const kind = classify(url, res.headers()["content-type"]);
      if (!kind || res.status() >= 400 || /\.ts(\?|$)|\.m4s(\?|$)|\/seg[-_]/i.test(url)) return;
      const len = Number(res.headers()["content-length"] ?? 0);
      // Tiny mp4 responses are ad stingers / previews, not the film.
      if (kind === "mp4" && len > 0 && len < 1_500_000) return;
      let master = false;
      if (kind === "hls") {
        try {
          master = (await res.text()).includes("#EXT-X-STREAM-INF");
        } catch {
          // body not readable (already consumed): treat as a plain playlist
        }
      }
      const req = res.request();
      found.push({
        url,
        kind,
        master,
        len,
        referer: req.headers().referer,
        origin: req.headers().origin,
        at: Date.now(),
      });
    });

    page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 25_000 }).catch(() => {});

    let attempt = 0;
    while (left() > 2000) {
      await new Promise((r) => setTimeout(r, 1000));
      attempt++;
      const best = pick(found);
      if (best && (best.master || Date.now() - best.at > 2500)) break;
      if (attempt === 2 || attempt % 3 === 0) {
        for (const frame of page.frames()) {
          // 1) ask any <video> to play  2) press common play buttons  3) click the middle of the page
          await frame
            .evaluate(() =>
              document.querySelectorAll("video").forEach((v) => {
                v.muted = true;
                v.play().catch(() => {});
              }),
            )
            .catch(() => {});
          for (const sel of TRIGGERS)
            await frame
              .locator(sel)
              .first()
              .click({ timeout: 300, force: true })
              .catch(() => {});
        }
        await page.mouse.click(640, 360).catch(() => {});
      }
    }

    const best = pick(found);
    if (!best) return { ok: false, error: "Не нашёл видео на этой странице" };
    const cookies = await context.cookies(best.url).catch(() => []);
    const headers = {
      "User-Agent": UA,
      Referer: best.referer ?? pageUrl,
      ...(best.origin ? { Origin: best.origin } : {}),
      ...(cookies.length ? { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") } : {}),
    };
    return {
      ok: true,
      media: { url: best.url, kind: best.kind, headers },
      title: (await page.title().catch(() => "")) || null,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

let busy = Promise.resolve();
const server = http.createServer(async (req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });
  if (req.method !== "POST" || req.url !== "/sniff") return send(404, { ok: false });
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let url;
  try {
    url = new URL(JSON.parse(raw).url);
    if (!/^https?:$/.test(url.protocol)) throw new Error("scheme");
  } catch {
    return send(400, { ok: false, error: "bad url" });
  }
  // Serialise: wait for the previous page to finish, then run ours.
  const run = busy.then(() =>
    sniff(url.toString()).catch((e) => ({ ok: false, error: String(e.message ?? e).slice(0, 200) })),
  );
  busy = run.catch(() => {});
  send(200, await run);
});
server.listen(PORT, () => console.log(`sniffer listening on :${PORT}`));
