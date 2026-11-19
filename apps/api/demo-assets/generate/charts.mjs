// Original chart artwork for the demo (no external images). Deterministic: a seeded generator
// draws the same prices every time, so regenerated assets are identical.
export const BLUE = "#2563EB";
export const INK = "#111111";
export const WHITE = "#FFFFFF";

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A believable random walk of OHLC candles. */
export function candles(n, seed, start = 100, drift = 0.15, vol = 1.6) {
  const r = rng(seed);
  const out = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = open + (r() - 0.5) * 2 * vol + drift;
    const high = Math.max(open, close) + r() * vol * 0.8;
    const low = Math.min(open, close) - r() * vol * 0.8;
    out.push({ open, high, low, close });
    price = close;
  }
  return out;
}

export function movingAverage(cs, period) {
  return cs.map((_, i) =>
    i < period - 1 ? null : cs.slice(i - period + 1, i + 1).reduce((a, c) => a + c.close, 0) / period,
  );
}

/** Candlesticks as SVG inside a w x h box. `upTo` limits how many candles are drawn (animation). */
export function candleSvg(cs, w, h, { upTo = cs.length, pad = 24, up = BLUE, down = "#9CA3AF", ma = [] } = {}) {
  const lo = Math.min(...cs.map((c) => c.low));
  const hi = Math.max(...cs.map((c) => c.high));
  const x = (i) => pad + (i + 0.5) * ((w - pad * 2) / cs.length);
  const y = (p) => h - pad - ((p - lo) / (hi - lo || 1)) * (h - pad * 2);
  const bw = Math.max(3, ((w - pad * 2) / cs.length) * 0.58);
  let svg = "";
  for (let g = 0; g <= 4; g++) {
    const gy = pad + (g * (h - pad * 2)) / 4;
    svg += `<line x1="${pad}" x2="${w - pad}" y1="${gy}" y2="${gy}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  }
  cs.slice(0, upTo).forEach((c, i) => {
    const color = c.close >= c.open ? up : down;
    svg += `<line x1="${x(i)}" x2="${x(i)}" y1="${y(c.high)}" y2="${y(c.low)}" stroke="${color}" stroke-width="2"/>`;
    const top = y(Math.max(c.open, c.close));
    const bh = Math.max(2, Math.abs(y(c.open) - y(c.close)));
    svg += `<rect x="${x(i) - bw / 2}" y="${top}" width="${bw}" height="${bh}" rx="1.5" fill="${color}"/>`;
  });
  for (const m of ma) {
    const pts = m.values
      .map((v, i) => (v === null || i >= upTo ? null : `${x(i)},${y(v)}`))
      .filter(Boolean);
    if (pts.length > 1) {
      svg += `<polyline points="${pts.join(" ")}" fill="none" stroke="${m.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
  }
  return svg;
}

/** A smooth line (closing prices) with a soft area fill. */
export function lineSvg(cs, w, h, { upTo = cs.length, pad = 24, color = BLUE } = {}) {
  const lo = Math.min(...cs.map((c) => c.low));
  const hi = Math.max(...cs.map((c) => c.high));
  const x = (i) => pad + (i / (cs.length - 1)) * (w - pad * 2);
  const y = (p) => h - pad - ((p - lo) / (hi - lo || 1)) * (h - pad * 2);
  const pts = cs.slice(0, upTo).map((c, i) => `${x(i)},${y(c.close)}`);
  if (pts.length < 2) return "";
  const last = Math.min(upTo, cs.length) - 1;
  const area = `${x(0)},${h - pad} ${pts.join(" ")} ${x(last)},${h - pad}`;
  let grid = "";
  for (let g = 0; g <= 4; g++) {
    const gy = pad + (g * (h - pad * 2)) / 4;
    grid += `<line x1="${pad}" x2="${w - pad}" y1="${gy}" y2="${gy}" stroke="rgba(255,255,255,0.08)"/>`;
  }
  return `${grid}<polygon points="${area}" fill="${color}" opacity="0.18"/><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
}

/** An options payoff diagram: a long call at a strike, with the premium paid. */
export function payoffSvg(w, h, { upTo = 1, pad = 40 } = {}) {
  const strike = 0.5;
  const premium = 0.12;
  const pts = [];
  const steps = 60;
  for (let i = 0; i <= Math.floor(steps * upTo); i++) {
    const t = i / steps;
    const pnl = Math.max(0, t - strike) - premium;
    pts.push([pad + t * (w - pad * 2), h / 2 - pnl * (h - pad * 2) * 0.9]);
  }
  const zero = h / 2;
  let svg = `<line x1="${pad}" x2="${w - pad}" y1="${zero}" y2="${zero}" stroke="rgba(255,255,255,0.35)" stroke-dasharray="6 6"/>`;
  svg += `<line x1="${pad + strike * (w - pad * 2)}" x2="${pad + strike * (w - pad * 2)}" y1="${pad}" y2="${h - pad}" stroke="rgba(255,255,255,0.15)"/>`;
  svg += `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${BLUE}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
  return svg;
}

/** A trade idea drawn as risk and reward boxes around an entry (educational, hypothetical). */
export function riskRewardSvg(w, h, { upTo = 1, pad = 40 } = {}) {
  const x0 = pad + 40;
  const bw = (w - pad * 2 - 80) * upTo;
  const entry = h * 0.55;
  const stop = h * 0.75;
  const target = h * 0.2;
  return (
    `<rect x="${x0}" y="${target}" width="${bw}" height="${entry - target}" fill="${BLUE}" opacity="0.28"/>` +
    `<rect x="${x0}" y="${entry}" width="${bw}" height="${stop - entry}" fill="#9CA3AF" opacity="0.28"/>` +
    `<line x1="${x0}" x2="${x0 + bw}" y1="${entry}" y2="${entry}" stroke="white" stroke-width="3"/>` +
    `<line x1="${x0}" x2="${x0 + bw}" y1="${target}" y2="${target}" stroke="${BLUE}" stroke-width="3"/>` +
    `<line x1="${x0}" x2="${x0 + bw}" y1="${stop}" y2="${stop}" stroke="#9CA3AF" stroke-width="3"/>` +
    (upTo > 0.6
      ? `<text x="${x0 + 12}" y="${target + 30}" fill="#fff" font-size="22" font-weight="700" font-family="Inter,sans-serif">Reward 2R</text>` +
        `<text x="${x0 + 12}" y="${stop - 12}" fill="#E5E7EB" font-size="22" font-weight="700" font-family="Inter,sans-serif">Risk 1R</text>` +
        `<polyline points="${x0 + 10},${entry + 20} ${x0 + bw * 0.3},${entry - 30} ${x0 + bw * 0.5},${entry + 10} ${x0 + bw * 0.8},${target + 40}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>`
      : "")
  );
}

export const COURSES = [
  { slug: "trading-fundamentals", title: "Trading Fundamentals", category: "Trading Basics", level: "Beginner", kind: "line", seed: 11, tag: "Start here" },
  { slug: "candlestick-chart-mastery", title: "Candlestick Chart Mastery", category: "Charting", level: "Beginner", kind: "candles", seed: 23, tag: "Read the chart" },
  { slug: "technical-analysis-essentials", title: "Technical Analysis Essentials", category: "Technical Analysis", level: "Intermediate", kind: "ma", seed: 37, tag: "Trends and indicators" },
  { slug: "risk-management-and-psychology", title: "Risk Management & Psychology", category: "Risk & Psychology", level: "Intermediate", kind: "risk", seed: 41, tag: "Protect your capital" },
  { slug: "options-trading-fundamentals", title: "Options Trading Fundamentals", category: "Options", level: "Advanced", kind: "payoff", seed: 53, tag: "Calls, puts and Greeks" },
];
