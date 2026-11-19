// Renders one 960x540 PNG thumbnail per sample course. Run: node thumbnails.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { BLUE, COURSES, candleSvg, candles, lineSvg, movingAverage, payoffSvg, riskRewardSvg } from "./charts.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "thumbnails");
await mkdir(out, { recursive: true });

const W = 960;
const H = 540;
function art(c) {
  const cs = candles(c.kind === "candles" ? 34 : 60, c.seed, 100, 0.2);
  const w = 450;
  const h = 330;
  if (c.kind === "line") return lineSvg(cs, w, h);
  if (c.kind === "candles") return candleSvg(cs, w, h);
  if (c.kind === "ma") {
    return candleSvg(cs, w, h, {
      ma: [
        { values: movingAverage(cs, 8), color: "#FFFFFF" },
        { values: movingAverage(cs, 21), color: "#60A5FA" },
      ],
    });
  }
  if (c.kind === "risk") return riskRewardSvg(w, h);
  return payoffSvg(w, h);
}
const html = (c) => `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;background:#111111;font-family:Inter,'Inter Display',Helvetica,Arial,sans-serif;position:relative;overflow:hidden">
<div style="position:absolute;inset:0;background:radial-gradient(900px 500px at 85% 15%, rgba(37,99,235,0.35), rgba(17,17,17,0) 60%)"></div>
<svg width="450" height="330" viewBox="0 0 450 330" style="position:absolute;right:26px;top:150px;opacity:0.95">${art(c)}</svg>
<div style="position:absolute;left:48px;top:44px;color:#fff;font-weight:700;letter-spacing:0.4px;font-size:22px">ChartNexa <span style="color:${BLUE}">Academy</span></div>
<div style="position:absolute;left:48px;top:140px;width:420px">
  <div style="display:inline-block;background:${BLUE};color:#fff;font-weight:700;font-size:18px;padding:7px 14px;border-radius:999px">${c.level}</div>
  <div style="color:#fff;font-weight:800;font-size:${c.title.length > 26 ? 42 : 50}px;line-height:1.1;margin-top:20px">${c.title}</div>
  <div style="color:#9CA3AF;font-size:24px;margin-top:18px">${c.category} · ${c.tag}</div>
</div>
<div style="position:absolute;left:48px;bottom:34px;color:#6B7280;font-size:16px">Educational content. Not investment advice.</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
for (const c of COURSES) {
  await page.setContent(html(c));
  const png = await page.screenshot({ type: "png" });
  await writeFile(join(out, `${c.slug}.png`), png);
  console.log(`${c.slug}.png ${png.length} bytes`);
}
await browser.close();
