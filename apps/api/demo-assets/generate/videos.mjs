// Renders short original preview videos (silent, 960x540, 10 fps) from animated chart scenes:
// Playwright draws each frame, ffmpeg encodes H.264 with the index at the front for streaming.
// Run: node videos.mjs   (needs Chromium via Playwright and ffmpeg on PATH)
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  BLUE,
  candleSvg,
  candles,
  lineSvg,
  movingAverage,
  payoffSvg,
  riskRewardSvg,
} from "./charts.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "videos");
await mkdir(out, { recursive: true });

const FPS = 10;
const W = 960;
const H = 540;
const SECONDS = 15;
const FRAMES = FPS * SECONDS;

const clips = [
  {
    slug: "trading-fundamentals-preview",
    title: "Understanding Financial Markets",
    kind: "line",
    seed: 11,
    lines: [
      "A market is where buyers and sellers meet.",
      "Price rises when buyers are more eager than sellers.",
      "Price falls when sellers are more eager than buyers.",
      "Charts record that tug of war over time.",
    ],
  },
  {
    slug: "trading-fundamentals-platforms",
    title: "How Trading Platforms Work",
    kind: "line",
    seed: 12,
    lines: [
      "A platform shows prices and lets you place orders.",
      "Watchlists track the markets you follow.",
      "Order tickets set what, how much and at what price.",
      "Practice first: use a demo account.",
    ],
  },
  {
    slug: "candlestick-chart-mastery-preview",
    title: "Candlestick Anatomy",
    kind: "candles",
    seed: 23,
    lines: [
      "One candle shows one period of trading.",
      "The body spans the open to the close.",
      "The wicks reach the high and the low.",
      "Blue closed higher. Grey closed lower.",
    ],
  },
  {
    slug: "technical-analysis-essentials-preview",
    title: "Trends and Market Structure",
    kind: "ma",
    seed: 37,
    lines: [
      "An uptrend makes higher highs and higher lows.",
      "A downtrend makes lower highs and lower lows.",
      "A moving average smooths the noise.",
      "Trade with the trend until the structure breaks.",
    ],
  },
  {
    slug: "risk-management-and-psychology-preview",
    title: "Understanding Risk",
    kind: "risk",
    seed: 41,
    lines: [
      "Every trade can lose. Decide how much first.",
      "Risk 1R to aim for 2R.",
      "Small, planned losses keep you in the game.",
      "Protect capital before chasing profit.",
    ],
  },
  {
    slug: "options-trading-fundamentals-preview",
    title: "Introduction to Options",
    kind: "payoff",
    seed: 53,
    lines: [
      "An option is a contract with a strike and an expiry.",
      "A call gains value when the price rises above the strike.",
      "The most a buyer can lose is the premium paid.",
      "Options can expire worthless. Learn on paper first.",
    ],
  },
];

function scene(c, t) {
  const p = Math.min(1, Math.max(0, (t - 2) / (SECONDS - 5)));
  const cs = candles(c.kind === "candles" ? 34 : 60, c.seed, 100, 0.2);
  const w = 820;
  const h = 300;
  const n = cs.length;
  const upTo = Math.max(2, Math.round(p * n));
  let art;
  if (c.kind === "line") art = lineSvg(cs, w, h, { upTo });
  else if (c.kind === "candles") art = candleSvg(cs, w, h, { upTo });
  else if (c.kind === "ma")
    art = candleSvg(cs, w, h, {
      upTo,
      ma: [
        { values: movingAverage(cs, 8), color: "#FFFFFF" },
        { values: movingAverage(cs, 21), color: "#60A5FA" },
      ],
    });
  else if (c.kind === "risk") art = riskRewardSvg(w, h, { upTo: Math.max(0.05, p) });
  else art = payoffSvg(w, h, { upTo: Math.max(0.05, p) });
  const idx = Math.min(c.lines.length - 1, Math.floor(p * c.lines.length));
  const title = t < 2.4;
  const outro = t > SECONDS - 1.6;
  const fade = title ? Math.min(1, t / 0.6) : outro ? Math.max(0, (SECONDS - t) / 0.8) : 1;
  return `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;background:#111;font-family:Inter,Helvetica,Arial,sans-serif;position:relative;overflow:hidden;color:#fff">
<div style="position:absolute;inset:0;background:radial-gradient(800px 420px at 85% 10%, rgba(37,99,235,0.35), rgba(17,17,17,0) 60%)"></div>
<div style="position:absolute;left:36px;top:26px;font-weight:700;font-size:18px">ChartNexa <span style="color:${BLUE}">Academy</span></div>
${
  title
    ? `<div style="position:absolute;left:0;right:0;top:190px;text-align:center;opacity:${fade}"><div style="font-size:46px;font-weight:800;padding:0 60px">${c.title}</div><div style="color:#9CA3AF;font-size:22px;margin-top:14px">Course preview</div></div>`
    : outro
      ? `<div style="position:absolute;left:0;right:0;top:210px;text-align:center;opacity:${fade}"><div style="font-size:34px;font-weight:800">Keep going in the full course</div><div style="color:#9CA3AF;font-size:20px;margin-top:12px">Educational content only. Not investment advice.</div></div>`
      : `<div style="position:absolute;left:36px;top:70px;font-size:28px;font-weight:800;width:880px">${c.title}</div>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:70px;top:130px">${art}</svg>
<div style="position:absolute;left:36px;right:36px;bottom:34px;font-size:26px;font-weight:600;background:rgba(255,255,255,0.08);border-left:5px solid ${BLUE};padding:14px 18px;border-radius:8px">${c.lines[idx]}</div>`
}
</body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
for (const c of clips) {
  const dir = await mkdtemp(join(tmpdir(), "chartnexa-frames-"));
  for (let f = 0; f < FRAMES; f++) {
    await page.setContent(scene(c, f / FPS));
    await writeFile(
      join(dir, `f_${String(f).padStart(4, "0")}.png`),
      await page.screenshot({ type: "png" }),
    );
  }
  const target = join(out, `${c.slug}.mp4`);
  const r = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      String(FPS),
      "-i",
      join(dir, "f_%04d.png"),
      "-c:v",
      "libx264",
      "-profile:v",
      "main",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "30",
      "-preset",
      "slow",
      "-movflags",
      "+faststart",
      target,
    ],
    { encoding: "utf8" },
  );
  await rm(dir, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  console.log(`${c.slug}.mp4`);
}
await browser.close();
