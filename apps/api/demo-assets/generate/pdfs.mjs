// Renders the sample PDFs (learning resources and assignment attachments). Run: node pdfs.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { candleSvg, candles, lineSvg, movingAverage, payoffSvg } from "./charts.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "pdfs");
await mkdir(out, { recursive: true });

const css = `
@page { size: A4; margin: 18mm 16mm; }
body { font-family: Inter, Helvetica, Arial, sans-serif; color: #111; font-size: 11.5pt; line-height: 1.5; }
h1 { font-size: 24pt; margin: 0 0 4pt; } h2 { font-size: 14pt; margin: 18pt 0 6pt; color: #2563EB; }
.brand { color: #111; font-weight: 800; letter-spacing: .3px; margin-bottom: 14pt; } .brand span { color: #2563EB; }
.sub { color: #6B7280; margin-bottom: 14pt; } table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
td, th { border: 1px solid #D1D5DB; padding: 6pt 8pt; vertical-align: top; text-align: left; } th { background: #EFF6FF; }
.box { border: 1.5px solid #2563EB; border-radius: 8px; padding: 10pt 12pt; margin: 10pt 0; background: #F8FAFF; }
.foot { margin-top: 22pt; color: #6B7280; font-size: 9pt; border-top: 1px solid #E5E7EB; padding-top: 8pt; }
.line { border-bottom: 1px solid #9CA3AF; height: 18pt; margin: 4pt 0; } ul { margin: 4pt 0 4pt 16pt; padding: 0; } li { margin: 3pt 0; }
.chart { background: #111; border-radius: 10px; padding: 6pt; margin: 6pt 0; } .cap { font-size: 10pt; color: #374151; margin-bottom: 10pt; }
`;
const page = (title, sub, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="brand">ChartNexa <span>Academy</span></div><h1>${title}</h1><div class="sub">${sub}</div>${body}
<div class="foot">Educational material for demonstration. Examples use hypothetical numbers and are not investment advice or a recommendation to trade.</div></body></html>`;
const terms = (rows) => `<table><tr><th style="width:28%">Term</th><th>Plain-language meaning</th></tr>${rows.map(([a, b]) => `<tr><td><b>${a}</b></td><td>${b}</td></tr>`).join("")}</table>`;
const check = (items) => `<ul>${items.map((i) => `<li>☐ ${i}</li>`).join("")}</ul>`;
const chartBlock = (svg, cap) => `<div class="chart"><svg width="640" height="190" viewBox="0 0 640 190">${svg}</svg></div><div class="cap">${cap}</div>`;

const docs = {
  "trading-terminology-guide": page("Trading Terminology Guide", "A quick glossary for new learners", terms([
    ["Asset", "Something that can be bought or sold, such as a share, a currency pair or a commodity."],
    ["Bid / Ask", "The highest price a buyer offers (bid) and the lowest price a seller accepts (ask)."],
    ["Spread", "The gap between the bid and the ask. It is a cost every time you trade."],
    ["Market order", "An instruction to trade right now at the best available price."],
    ["Limit order", "An instruction to trade only at your chosen price or better. It may not fill."],
    ["Stop order", "An order that becomes active only after a chosen price is reached."],
    ["Volume", "How many units traded in a period. High volume usually means more activity and tighter spreads."],
    ["Volatility", "How much and how fast a price moves. Higher volatility means bigger swings in both directions."],
    ["Liquidity", "How easily something can be traded without moving its price."],
    ["Leverage", "Using borrowed money to control a larger position. It magnifies gains and losses."],
    ["Drawdown", "The fall from a peak value of an account to a later low."],
    ["Position size", "How many units you buy or sell in one trade."],
  ])),
  "candlestick-reference-sheet": page("Candlestick Reference Sheet", "Anatomy and common patterns on one page", `
    ${chartBlock(candleSvg(candles(22, 23, 100, 0.2), 640, 190), "Each candle shows the open, high, low and close of one period. A filled blue body means the close was above the open.")}
    <h2>Anatomy</h2>${terms([["Body", "The range between the open and the close."], ["Wick (shadow)", "The thin line to the high or low. It shows how far price travelled and came back."], ["Colour", "Direction of the period: close above open (bullish) or below (bearish)."]])}
    <h2>Common patterns (read them in context)</h2>${terms([
      ["Doji", "Open and close almost equal. Shows indecision."],
      ["Hammer", "Small body, long lower wick, after a fall. Buyers pushed back."],
      ["Shooting star", "Small body, long upper wick, after a rise. Sellers pushed back."],
      ["Bullish engulfing", "A large up candle that covers the previous down candle's body."],
      ["Bearish engulfing", "A large down candle that covers the previous up candle's body."],
      ["Morning / evening star", "Three-candle reversal ideas: a large candle, a small one, then a large opposite one."],
    ])}
    <div class="box"><b>Remember:</b> a pattern is a clue, not a promise. Check the trend, nearby support and resistance, and volume before you trust it.</div>`),
  "technical-analysis-checklist": page("Technical Analysis Checklist", "Use the same questions on every chart", `
    <h2>1. Context</h2>${check(["Which time frame am I studying, and what is the higher time frame doing?", "Is price trending up, down or moving sideways?"])}
    <h2>2. Levels</h2>${check(["Where are the nearest support and resistance levels?", "Has price reacted at these levels before?"])}
    <h2>3. Indicators (confirm, do not decide)</h2>${check(["Do the moving averages agree with the trend?", "Is momentum (RSI) rising, falling or showing divergence?", "Do two or more independent clues point the same way?"])}
    <h2>4. Plan and risk</h2>${check(["What would prove this idea wrong, and where is that price?", "How much of the account am I willing to risk if it is wrong?", "Is the possible reward clearly larger than the risk?"])}
    <h2>5. After</h2>${check(["Did I follow the checklist? Record the result in my journal.", "What would I do differently next time?"])}`),
  "risk-management-checklist": page("Risk Management Checklist", "Before every trade, answer these honestly", `
    ${check(["I know the most I can lose on this trade, in money and as a percentage of my account.", "That loss is within the limit in my trading plan (for example 1% of the account).", "My stop-loss level is based on the chart, not on how much I hope to win.", "The position size is calculated from my risk and stop distance, not guessed.", "The reward is at least twice the risk (a 2:1 ratio), or I have a written reason to accept less.", "I am not adding to a losing position to get back to even.", "My total open risk across all trades is within my daily and weekly limits.", "I have no unusual stress, distraction or urgency right now.", "I will write down the reason for this trade before I place it.", "I accept the outcome, win or lose, and will review it afterwards."])}
    <h2>Worked example (hypothetical numbers)</h2>
    <table><tr><th>Account size</th><td>$10,000</td></tr><tr><th>Risk per trade</th><td>1% = $100</td></tr><tr><th>Entry / stop</th><td>$50.00 / $48.00 → $2.00 risk per share</td></tr><tr><th>Position size</th><td>$100 ÷ $2.00 = 50 shares</td></tr><tr><th>Target (2:1)</th><td>$54.00 → possible reward $200</td></tr></table>`),
  "risk-management-plan-worksheet": page("Risk Management Plan Worksheet", "Complete this for the assignment using hypothetical figures", `
    <div class="box">Imagine a practice account. Choose your own numbers, then answer each part in the app. Write at least a few sentences for each section.</div>
    <h2>1. My practice account</h2><table><tr><th style="width:45%">Starting balance (hypothetical)</th><td></td></tr><tr><th>Maximum risk per trade (% of balance)</th><td></td></tr><tr><th>Maximum loss per day / per week</th><td></td></tr></table>
    <h2>2. One example trade</h2><table><tr><th style="width:45%">Instrument (example only)</th><td></td></tr><tr><th>Entry price</th><td></td></tr><tr><th>Stop-loss price and why</th><td></td></tr><tr><th>Target price</th><td></td></tr><tr><th>Risk-to-reward ratio</th><td></td></tr><tr><th>Position size (show the calculation)</th><td></td></tr></table>
    <h2>3. Rules I will follow</h2><div class="line"></div><div class="line"></div><div class="line"></div>
    <h2>4. When I will stop trading for the day</h2><div class="line"></div><div class="line"></div>
    <h2>5. How I will keep myself disciplined</h2><div class="line"></div><div class="line"></div>`),
  "options-quick-reference": page("Options Quick Reference", "Calls, puts and the Greeks", `
    ${chartBlock(payoffSvg(640, 190, { pad: 24 }), "Payoff at expiry of a long call (hypothetical): the most you can lose is the premium paid.")}
    ${terms([["Call", "The right, not the obligation, to buy at the strike price before expiry."], ["Put", "The right, not the obligation, to sell at the strike price before expiry."], ["Strike", "The agreed price in the contract."], ["Premium", "The price paid for the option."], ["Expiry", "The date the contract ends."], ["In / at / out of the money", "Whether exercising now would have value, none, or would not make sense."]])}
    <h2>The Greeks</h2>${terms([["Delta", "How much the option price moves for a $1 move in the underlying."], ["Gamma", "How fast delta itself changes."], ["Theta", "Time decay: value lost each day as expiry approaches."], ["Vega", "Sensitivity to changes in implied volatility."], ["Rho", "Sensitivity to interest rates (usually small)."]])}
    <div class="box"><b>Risk note:</b> options can expire worthless. Selling options can lose far more than the premium received. Learn on paper before using money.</div>`),
  "sample-charts": page("Sample Charts for Pattern Practice", "Assignment attachment: study each chart, then describe what you see", (() => {
    const set = [
      ["Chart A", candleSvg(candles(26, 101, 100, 0.4, 1.4), 640, 190), "A rising chart with pauses."],
      ["Chart B", candleSvg(candles(26, 203, 120, -0.45, 1.5), 640, 190), "A falling chart with bounces."],
      ["Chart C", candleSvg(candles(26, 307, 100, 0.0, 1.9), 640, 190, { ma: [{ values: movingAverage(candles(26, 307, 100, 0.0, 1.9), 8), color: "#fff" }] }), "A choppy chart with an 8-period average (white line)."],
      ["Chart D", lineSvg(candles(40, 409, 100, 0.1, 1.2), 640, 190), "Closing prices only, drawn as a line."],
    ];
    return set.map(([t, svg, cap]) => `<div style="break-inside:avoid"><h2>${t}</h2>${chartBlock(svg, cap)}</div>`).join("") + `<div class="box">For each chart: name the trend, point to one support or resistance area, and describe any candlestick pattern you notice. Charts are computer-generated for practice and do not show a real market.</div>`;
  })()),
};

const browser = await chromium.launch();
const p = await browser.newPage();
for (const [name, html] of Object.entries(docs)) {
  await p.setContent(html);
  const pdf = await p.pdf({ format: "A4", printBackground: true });
  await writeFile(join(out, `${name}.pdf`), pdf);
  console.log(`${name}.pdf ${pdf.length} bytes`);
}
await browser.close();
