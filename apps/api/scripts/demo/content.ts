/**
 * Demo curriculum. Original educational text for a development demo. Examples use hypothetical
 * numbers; nothing here promises returns or is investment advice.
 */
export interface DemoLesson {
  title: string;
  body: string;
  preview?: boolean;
  /** Demo asset file names (under demo-assets/) attached to this lesson. */
  video?: string;
  pdf?: { file: string; title: string; downloadable: boolean };
}
export interface DemoModule {
  title: string;
  lessons: DemoLesson[];
}
export interface DemoCourse {
  slug: string;
  title: string;
  category: string;
  level: "beginner" | "intermediate" | "advanced";
  priceCents: number;
  coverTone: "blue" | "black" | "tint";
  description: string;
  thumbnail: string;
  modules: DemoModule[];
}

const DISCLAIMER =
  "Educational content only. The numbers in this lesson are hypothetical and are not investment advice or a prediction of results.";

export const DEMO_CATEGORIES = [
  "Trading Basics",
  "Charting",
  "Technical Analysis",
  "Risk & Psychology",
  "Options",
] as const;

export const DEMO_COURSES: DemoCourse[] = [
  {
    slug: "trading-fundamentals",
    title: "Trading Fundamentals",
    category: "Trading Basics",
    level: "beginner",
    priceCents: 4900,
    coverTone: "blue",
    thumbnail: "trading-fundamentals.png",
    description:
      "A calm, practical start for new traders. Learn how markets work, how trading platforms and orders behave, what trading really costs, and why managing risk comes before chasing profit. Built around simple examples and practice exercises, with no jargon left unexplained.",
    modules: [
      {
        title: "Markets and platforms",
        lessons: [
          {
            title: "Understanding Financial Markets",
            preview: true,
            video: "trading-fundamentals-preview.mp4",
            pdf: {
              file: "trading-terminology-guide.pdf",
              title: "Trading Terminology Guide",
              downloadable: true,
            },
            body: `A financial market is a place, physical or electronic, where buyers and sellers agree on prices for things like shares, currencies and commodities.

Prices move because of supply and demand. When more people want to buy than sell at the current price, the price tends to rise until sellers appear. When more want to sell, it tends to fall until buyers step in. Every chart you will study is a record of that tug of war.

Three ideas to carry through this course:

- Different markets suit different goals. Share markets let you own parts of companies. Currency markets trade one currency against another. Commodity markets deal in goods such as oil or gold.
- Liquidity matters. A liquid market has many buyers and sellers, so you can trade without moving the price much.
- Nobody knows the future. Good traders plan for being wrong as well as being right.

Try this: open any free chart and write down, in your own words, what you think the last big move was caused by. Then notice how little you can be sure of. That humility is a trader's first skill.

${DISCLAIMER}`,
          },
          {
            title: "How Trading Platforms Work",
            video: "trading-fundamentals-platforms.mp4",
            body: `A trading platform is the software that connects you to the market. Most platforms have the same building blocks.

Watchlist: a list of the instruments you follow, with their latest prices and daily change.

Chart window: shows price history. You can change the time frame (for example one minute, one hour or one day) and add drawings or indicators.

Order ticket: where you choose what to buy or sell, how much, and the type of order. You will meet market, limit and stop orders in a later lesson.

Positions and orders: a list of what you currently hold and any orders waiting to be filled.

Account panel: your balance, the money in use (margin) and your profit or loss so far.

Before you use real money, use a demo account. A demo account behaves like a real one but uses practice money. It will not feel the same emotionally, yet it is the safest place to learn where every button is.

Checklist for your first session: find the watchlist, change a chart's time frame, place and then cancel a pending order, and locate the account balance.

${DISCLAIMER}`,
          },
          {
            title: "Reading Price Charts",
            body: `A price chart plots price on the vertical axis and time on the horizontal axis. The most common styles are:

- Line chart: joins closing prices. Clean and good for the big picture.
- Bar chart: each bar shows the open, high, low and close for a period.
- Candlestick chart: the same four prices, drawn as a body and wicks that are easier to read at a glance.

Time frames change the story. A daily candle summarises a whole day; a five-minute candle summarises five minutes. The same market can look like it is rising on one time frame and falling on another. Start from a larger time frame to see the main direction, then zoom in.

Two simple things to notice on any chart:

1. Trend: is price making higher highs and higher lows (up), lower highs and lower lows (down), or moving sideways?
2. Levels: are there prices where the chart turned around more than once?

Exercise: take one chart and describe it in three sentences: the trend, one level, and one thing you cannot explain. Keep your notes; you will compare them after the technical analysis lessons.

${DISCLAIMER}`,
          },
        ],
      },
      {
        title: "Orders and costs",
        lessons: [
          {
            title: "Market Orders and Limit Orders",
            body: `An order is an instruction to your broker. The type of order decides how and when it can fill.

Market order: buy or sell now at the best available price. It almost always fills, but the price may differ from what you saw, especially in fast markets. This difference is called slippage.

Limit order: buy or sell only at your chosen price or better. You control the price, but the order may never fill if the market does not reach it.

Stop order: becomes active when a price is reached. A stop-loss is used to exit a trade if it moves against you.

Example (hypothetical): a share is quoted at 50.00 bid and 50.04 ask. A market buy fills near 50.04. A limit buy at 49.90 waits until sellers accept 49.90; if the price never falls that far, you do not buy.

Which to use? Market orders suit liquid markets when getting in matters more than a tiny price difference. Limit orders suit situations where price matters more than speed.

Practice in a demo account: place a limit order away from the market, watch it sit, then cancel it. Place a small market order and compare the fill price with what you expected.

${DISCLAIMER}`,
          },
          {
            title: "Understanding Trading Costs",
            body: `Every trade has costs, and costs quietly shape results. The common ones:

Spread: the gap between the bid and the ask. You buy at the ask and could sell at the bid, so you start every trade slightly behind.

Commission or fees: a charge per trade or per share, depending on the broker.

Financing (overnight) charges: if you hold a leveraged position overnight, you may pay interest.

Slippage: the difference between the price you expected and the price you got.

Currency conversion: trading something priced in another currency can add a conversion cost.

Worked example (hypothetical): you trade 100 shares with a 0.04 spread and a 1.00 commission each way. The spread costs 100 x 0.04 = 4.00. Commission is 2.00 in total. The trade must gain more than 6.00 just to break even. If you place many small trades, those costs add up fast.

What to do: read your broker's fee schedule, compare costs across brokers, and factor costs into any plan before you trade. A strategy that looks profitable on paper may not survive realistic costs.

${DISCLAIMER}`,
          },
          {
            title: "Introduction to Risk Management",
            pdf: {
              file: "risk-management-plan-worksheet.pdf",
              title: "Risk Management Plan Worksheet",
              downloadable: true,
            },
            body: `Risk management is the set of rules that stop one bad trade, or one bad week, from ending your account. It matters more than any entry technique.

Three starting rules:

1. Decide your risk before you enter. How much money are you willing to lose on this trade? Many learners use a small fixed share of the account, such as 1%, as a practice limit.
2. Use a stop-loss. A stop-loss is a planned exit if the trade moves against you. Place it where the idea is proven wrong, not where the loss feels comfortable.
3. Size the position from the risk. Position size = money at risk / distance to the stop.

Worked example (hypothetical): account 10,000. Risk per trade 1% = 100. Entry 50.00, stop 48.00, so 2.00 risk per share. Position size = 100 / 2.00 = 50 shares.

Notice what this does: if you are wrong, you lose about 100 whatever the price or share count. Risk is controlled by design, not by hope.

Your assignment for this course is the Risk Management Plan Worksheet attached to this lesson. Complete it with hypothetical figures and submit your answers in the Assignments tab.

${DISCLAIMER}`,
          },
        ],
      },
    ],
  },
  {
    slug: "candlestick-chart-mastery",
    title: "Candlestick Chart Mastery",
    category: "Charting",
    level: "beginner",
    priceCents: 3900,
    coverTone: "black",
    thumbnail: "candlestick-chart-mastery.png",
    description:
      "Learn to read candlesticks the way working analysts do: anatomy first, then the patterns that matter, always in context. Practice on sample charts, learn the common mistakes, and finish with a hands-on chart-reading assignment reviewed by your instructor.",
    modules: [
      {
        title: "Reading candles",
        lessons: [
          {
            title: "Candlestick Anatomy",
            preview: true,
            video: "candlestick-chart-mastery-preview.mp4",
            body: `A candlestick summarises one period of trading using four prices: open, high, low and close.

Body: the thick part, from the open to the close. A long body means price travelled a long way between open and close.

Wicks (also called shadows): the thin lines above and below the body. The upper wick reaches the high, the lower wick reaches the low. Long wicks show price moved far and then came back.

Colour: in this course, blue means the period closed higher than it opened (bullish) and grey means it closed lower (bearish). Many platforms use green and red instead; the meaning is the same.

What the shapes say, in plain words:

- A long body with short wicks: one side dominated the period.
- A small body with long wicks: a fight with no clear winner.
- A tiny body with wicks on both sides: indecision.

Remember that a candle is built from many trades; its shape only describes the outcome. Next lesson you will connect shapes to the balance of buyers and sellers.

${DISCLAIMER}`,
          },
          {
            title: "Bullish and Bearish Candles",
            body: `Bullish candle: the close is above the open. Buyers finished stronger than they started.

Bearish candle: the close is below the open. Sellers finished stronger.

Size matters. A long bullish candle after a quiet period shows strong buying. A small bullish candle after a long fall may only be a pause.

Wick length tells you about rejection. A long lower wick on a bullish candle means price fell and buyers pushed it back up. A long upper wick on a bearish candle means price rose and sellers pushed it back down.

Sequences matter more than single candles. Three bullish candles with rising closes show persistence. A big bullish candle followed by a bearish candle that gives it all back shows the move was rejected.

Practice: print or open a chart and mark ten candles as strong bullish, weak bullish, strong bearish, weak bearish or indecisive. Write one sentence on why. Compare your labels a week later; most learners find they label the same candles differently with experience, which is exactly why context matters.

${DISCLAIMER}`,
          },
          {
            title: "Common Candlestick Patterns",
            pdf: {
              file: "candlestick-reference-sheet.pdf",
              title: "Candlestick Reference Sheet",
              downloadable: true,
            },
            body: `Patterns are shapes that traders have named because they often appear when sentiment changes. They are clues, not guarantees.

Single-candle patterns:
- Doji: open and close are almost equal. Indecision.
- Hammer: small body at the top, long lower wick, after a decline. Buyers pushed back.
- Shooting star: small body at the bottom, long upper wick, after a rise. Sellers pushed back.

Two-candle patterns:
- Bullish engulfing: a large bullish candle whose body covers the previous bearish body.
- Bearish engulfing: the opposite.

Three-candle patterns:
- Morning star: a large bearish candle, a small candle, then a large bullish candle.
- Evening star: the reverse.

How to use them: a pattern means more when it appears at a meaningful level (such as support after a fall) and when the move before it was clear. The same shape in the middle of a sideways range means very little.

The Candlestick Reference Sheet attached to this lesson summarises these patterns on one page. Keep it beside you during the assignment.

${DISCLAIMER}`,
          },
        ],
      },
      {
        title: "Using candles in context",
        lessons: [
          {
            title: "Support and Resistance",
            body: `Support is a price area where falling prices have repeatedly paused or turned up, because buyers appeared there. Resistance is an area where rising prices have repeatedly paused or turned down, because sellers appeared.

Think of them as zones rather than exact lines. Prices rarely turn at precisely the same number; they react in an area.

How to draw them:
1. Zoom out to a larger time frame.
2. Find places where price turned at least twice.
3. Draw a band that covers the wicks and bodies near those turns.

Why they work (when they do): many traders remember the same places and act on them, so those areas attract orders. A level that has held many times is more noticeable.

Role reversal: when a resistance level is broken convincingly, it often becomes support, and the reverse. Price breaking and then retesting a level from the other side is a common sight.

Candlesticks add detail: a hammer at support, or a bearish engulfing at resistance, is more meaningful than the same candle in empty space.

Exercise: mark three support and three resistance zones on a chart, then write which one you trust most and why.

${DISCLAIMER}`,
          },
          {
            title: "Practical Chart Analysis",
            body: `Now combine what you have learned into a routine you can repeat on any chart.

Step 1 - Higher time frame: what is the trend on the larger chart?
Step 2 - Levels: where are the nearest support and resistance zones?
Step 3 - Candles at the level: has a pattern formed where price meets a level? Describe it in plain words.
Step 4 - What would change my mind? Decide in advance what price action would show your reading is wrong.
Step 5 - Write it down. A three-sentence note is enough.

Worked example (hypothetical chart): price has been rising for weeks with higher lows. It pulls back to a zone where it paused twice before, and a long lower wick appears with a bullish close. A cautious reading: buyers defended the level again; the idea is wrong if price closes clearly below the zone.

Notice the wording. We describe what we see and what would invalidate it. We do not predict.

Your assignment, Identify Chart Patterns, uses a PDF of sample charts. For each chart, name the trend, point to one support or resistance area and describe any candlestick pattern you notice. Submit it from the Assignments tab.

${DISCLAIMER}`,
          },
          {
            title: "Common Interpretation Mistakes",
            body: `Most chart-reading errors are habits. Learn to spot them in yourself.

Seeing patterns everywhere. With enough candles you can find any shape you hope for. Require context: trend, level and a clear prior move.

Ignoring the time frame. A pattern on a one-minute chart carries much less weight than the same pattern on a daily chart.

Trading every pattern. Patterns appear constantly; only a few occur at meaningful places. Selectivity is a skill.

Forgetting costs. A small move that matches a pattern may not cover spread and commission.

Confirmation bias. Once you expect a rise, every candle looks bullish. Write your reasons down before the next candle forms.

Treating a pattern as a promise. Patterns improve odds at best; they do not remove risk. Every idea needs a stop and a size.

Hindsight. Old charts always look obvious. Practise on charts where you cannot see the future by covering the right side and revealing it one candle at a time.

A useful habit: keep a screenshot journal of your readings and review the ones you got wrong. The mistakes are the lessons.

${DISCLAIMER}`,
          },
        ],
      },
    ],
  },
  {
    slug: "technical-analysis-essentials",
    title: "Technical Analysis Essentials",
    category: "Technical Analysis",
    level: "intermediate",
    priceCents: 6900,
    coverTone: "tint",
    thumbnail: "technical-analysis-essentials.png",
    description:
      "Move from single charts to a repeatable analysis process. Understand trends and market structure, use moving averages and momentum sensibly, combine indicators without double counting, and finish with a written checklist you can apply to any market.",
    modules: [
      {
        title: "Trend tools",
        lessons: [
          {
            title: "Trends and Market Structure",
            preview: true,
            video: "technical-analysis-essentials-preview.mp4",
            body: `Market structure is the sequence of swing highs and swing lows on a chart.

Uptrend: higher highs and higher lows. Each pullback stops above the previous one.
Downtrend: lower highs and lower lows.
Range: price bounces between a ceiling and a floor without making progress.

A trend is "intact" until its structure breaks: in an uptrend, a close below the most recent higher low is the first sign the character may be changing.

Practical steps:
1. Mark the last few swing highs and lows.
2. Label the structure: up, down or range.
3. Note the level that would break the structure.

Higher time frames carry more weight. A daily uptrend that shows a short-term downtrend on a 15-minute chart is usually just a pullback inside the larger trend.

Trends end, but they usually do not end exactly when you expect. That is why we use structure breaks instead of guesses.

Exercise: find one chart in each state (uptrend, downtrend, range) and write the level that would change your label.

${DISCLAIMER}`,
          },
          {
            title: "Moving Averages",
            body: `A moving average smooths price by averaging recent closes, so the direction is easier to see.

Simple moving average (SMA): the plain average of the last N closes.
Exponential moving average (EMA): gives more weight to recent closes, so it reacts faster.

Common settings: 20 for a short-term view, 50 for medium, 200 for long-term. There is nothing magic about the numbers; they are popular, so many traders watch them.

Uses:
- Direction: price above a rising average is consistent with an uptrend.
- Dynamic support or resistance: in trends, price often pulls back to an average and resumes.
- Crossovers: a faster average crossing a slower one is a signal many people follow, but it lags and gives false signals in ranges.

Limits: moving averages are lagging indicators built from past prices. They describe; they do not predict. In sideways markets they cut back and forth and mislead.

Exercise: add a 20 and a 50 EMA to a chart. Mark places they helped and places they were misleading. Count both.

${DISCLAIMER}`,
          },
          {
            title: "RSI and Momentum",
            body: `Momentum indicators measure how fast price is moving. The Relative Strength Index (RSI) is the best known. It oscillates between 0 and 100.

Common reading: above 70 is often called overbought and below 30 oversold. Be careful: in a strong trend RSI can stay above 70 for a long time. "Overbought" does not mean "about to fall".

More useful ideas:
- Trend confirmation: in uptrends, RSI tends to hold above about 40 on pullbacks; in downtrends it tends to stay below about 60.
- Divergence: price makes a new high but RSI makes a lower high. Momentum is fading. It is a warning, not a sell signal.

Always combine momentum with structure and levels. RSI is one view of the same price data, not independent evidence.

Exercise: on a chart of your choice, mark two divergences. What happened next? What would you have needed to see to act?

${DISCLAIMER}`,
          },
        ],
      },
      {
        title: "Putting it together",
        lessons: [
          {
            title: "Support and Resistance",
            body: `In this course we treat support and resistance as the backbone of the analysis, because most other tools are read relative to levels.

Ways to find levels:
- Swing points: previous highs and lows that price reacted to.
- Round numbers: prices ending in 00 or 50 often attract orders.
- Moving averages: popular averages act as moving levels in trends.
- Previous range edges: where a range broke out.

Quality of a level: more touches, more recent reactions, and a larger time frame usually make a level stronger. Each touch also uses up some of the orders waiting there, so very many touches can precede a break.

Breakouts and retests: price closes beyond a level, returns to test it from the other side and either holds (the level flipped) or fails (a false break). Waiting for a retest is slower but often cleaner.

Always define what would prove the level wrong, and where.

Exercise: draw levels on one chart using only swing points. Add round numbers. Did they cluster in the same places?

${DISCLAIMER}`,
          },
          {
            title: "Combining Indicators",
            body: `Too many indicators create noise. The aim is a small set that answers different questions.

Good combination (each answers something different):
- Structure and levels: where is price and what is the trend?
- A moving average: how steady is the direction?
- Momentum (RSI): is the move accelerating or fading?
- Volume, if available: is activity supporting the move?

Poor combination: three momentum indicators. They are built from the same price data, so agreement is not independent confirmation.

Rule of thumb: require two or three independent clues, and write them down before acting.

Example (hypothetical): price is in an uptrend (structure), pulls back to the 20 EMA near a prior swing low (level and average), and RSI holds above 40 while volume contracts on the pullback. Several independent observations support the idea that the trend is continuing. The idea fails if price closes below the swing low.

Remember: more indicators do not reduce risk. A stop and a position size do.

${DISCLAIMER}`,
          },
          {
            title: "Developing an Analysis Checklist",
            pdf: {
              file: "technical-analysis-checklist.pdf",
              title: "Technical Analysis Checklist",
              downloadable: true,
            },
            body: `A checklist turns good intentions into a repeatable process, and it protects you from your own mood.

A sample structure (the attached Technical Analysis Checklist has a printable version):

1. Context: what is the higher time frame doing? What is the trend?
2. Levels: where are support and resistance?
3. Indicators: do the moving averages and momentum agree? Are there at least two independent clues?
4. Plan: where is my idea proven wrong? What is my position size from that distance? What is the reward compared with the risk?
5. After: record the result and whether I followed the checklist.

Make the checklist yours. Remove anything you never use and add questions that would have saved you from past mistakes.

Use it before every trade, including practice trades. After a month, review: which checklist items did the best trades share? Which items did you skip before the worst ones?

The goal is not to predict but to act consistently, so that you can learn from the results.

${DISCLAIMER}`,
          },
        ],
      },
    ],
  },
  {
    slug: "risk-management-and-psychology",
    title: "Risk Management & Trading Psychology",
    category: "Risk & Psychology",
    level: "intermediate",
    priceCents: 5900,
    coverTone: "blue",
    thumbnail: "risk-management-and-psychology.png",
    description:
      "Survive long enough to improve. Learn how to define and limit risk, think in risk-to-reward ratios, size positions from your stop, and build a written trading plan. Then work on the human side: emotional decision-making, discipline, and keeping a trading journal.",
    modules: [
      {
        title: "Managing risk",
        lessons: [
          {
            title: "Understanding Risk",
            preview: true,
            video: "risk-management-and-psychology-preview.mp4",
            body: `Risk is the chance of losing money, and every trade carries it. The goal is not to avoid risk but to choose it deliberately.

Kinds of risk:
- Market risk: the price moves against you.
- Gap risk: price jumps past your stop, for example overnight or on news.
- Liquidity risk: you cannot exit at a fair price.
- Leverage risk: borrowed money magnifies losses as well as gains.
- Behavioural risk: your own decisions under stress.

Why small losses matter: losses hurt more than the same gains help. If an account falls 50%, it needs a 100% gain to recover. A 10% fall needs about 11%. Keeping losses small keeps recovery realistic.

The first question before any trade is not "how much can I make?" but "how much can I lose, and am I fine with that?"

Exercise: write the largest loss on a single trade you would accept as a percentage of a practice account. Then write what you would do after three losses in a row.

${DISCLAIMER}`,
          },
          {
            title: "Risk-to-Reward Ratios",
            body: `The risk-to-reward ratio compares what you stand to lose with what you aim to gain.

Risk: distance from entry to stop. Reward: distance from entry to target.

Example (hypothetical): entry 50.00, stop 48.00 (risk 2.00), target 54.00 (reward 4.00). The ratio is 1 : 2, often written 2R for the reward.

Why it matters: with a 2R target, you can be right less than half the time and still come out ahead before costs. At 40% wins and 2:1 reward-to-risk, ten trades risking 100 each produce 4 wins of 200 and 6 losses of 100 = 800 - 600 = +200 before costs. At 1:1 the same hit rate loses money.

Important cautions:
- A target must be realistic. A very large target that is rarely reached is not a good ratio.
- Costs reduce reward and increase risk.
- The ratio is one input, not a reason to take a trade.

Exercise: for three charts, mark an entry, stop and target based on levels, then calculate the ratio. Reject any idea where the stop or target is placed only to improve the ratio.

${DISCLAIMER}`,
          },
          {
            title: "Position Sizing Concepts",
            pdf: {
              file: "risk-management-checklist.pdf",
              title: "Risk Management Checklist",
              downloadable: true,
            },
            body: `Position size answers: how many units should I trade so that a stop-out costs only what I planned?

Formula: position size = account risk (money) / risk per unit (entry minus stop).

Example (hypothetical): account 10,000. You risk 1% = 100. Entry 50.00, stop 48.00, risk per share 2.00. Size = 100 / 2.00 = 50 shares. The position is worth 2,500, but the risk is 100.

A common mistake is choosing a size first and then moving the stop to fit it. Let the chart decide the stop and the risk rule decide the size.

Other limits worth planning:
- Total open risk across all positions.
- A daily loss limit after which you stop for the day.
- Correlated trades: two positions that move together are really one larger risk.

Many professionals prefer risking a small, fixed fraction so that a losing streak cannot do serious damage. The right figure depends on your situation and is a personal decision.

Use the attached Risk Management Checklist before each practice trade.

${DISCLAIMER}`,
          },
        ],
      },
      {
        title: "Discipline",
        lessons: [
          {
            title: "Building a Trading Plan",
            body: `A trading plan is a written set of rules you decide in calm conditions so you do not have to decide in stressful ones.

What a plan covers:
1. Markets and time frames you will trade, and the ones you will not.
2. Setup: the conditions that must be present before you consider a trade.
3. Entry: what triggers it.
4. Risk: maximum per trade, per day and per week; how position size is calculated.
5. Exit: stop placement, target or trailing rules, and when to stand aside.
6. Review: how and when you will measure results.

Make it specific enough to test. "Buy dips in uptrends" is vague. "Buy when price pulls back to the 20 EMA in a daily uptrend and RSI is above 40, with a stop below the last swing low" can be checked.

Rules for breaking rules: decide in advance what counts as an exception and require yourself to write down why.

Keep the plan to one page. Review it monthly, and change it only on the review day, not in the middle of a losing streak.

${DISCLAIMER}`,
          },
          {
            title: "Emotional Decision-Making",
            body: `Markets do not cause fear or greed; they trigger them. Knowing the common emotional traps lets you plan around them.

Fear of missing out (FOMO): chasing a move after it has already run. The cure is a rule that you only enter at planned levels.

Revenge trading: trading quickly after a loss to "win it back". The cure is a daily loss limit and a mandatory break after consecutive losses.

Overconfidence: after a winning streak, taking bigger risks. The cure is a fixed risk rule that does not change with recent results.

Loss aversion: holding a losing trade because closing it makes the loss real. The cure is a stop placed in advance.

Cutting winners short: taking small profits out of anxiety. The cure is written exit rules.

Helpful habits: sleep, regular breaks, and not trading when angry, tired or distracted. Rate your emotional state from one to five before each session; skip the session at four or five.

Treat each trade as one of many. A single result tells you very little. Following your process is what you control.

${DISCLAIMER}`,
          },
          {
            title: "Maintaining a Trading Journal",
            body: `A journal is how you turn experience into learning. Without one, you remember the exciting trades and forget the pattern.

What to record for each trade:
- Date, market, direction and size.
- The reason you took it, in a sentence, written before entry.
- Entry, stop and target, and the planned risk.
- What actually happened, and the exit.
- A screenshot of the chart at entry.
- Your emotional state and whether you followed the plan.

What to review, weekly:
- Did I follow my rules? Count the exceptions.
- Which setups produced the best results, and which the worst?
- Were there repeat mistakes, such as moving stops or entering late?
- What is one thing I will do differently next week?

Look at process first and profit second. A loss that followed the plan is a good trade; a win that broke the rules is a warning.

Keep it simple enough that you will actually do it. A spreadsheet or a notes app is fine. The best journal is the one you keep.

${DISCLAIMER}`,
          },
        ],
      },
    ],
  },
  {
    slug: "options-trading-fundamentals",
    title: "Options Trading Fundamentals",
    category: "Options",
    level: "advanced",
    priceCents: 8900,
    coverTone: "black",
    thumbnail: "options-trading-fundamentals.png",
    description:
      "An advanced introduction to options. Understand calls and puts, how the Greeks describe risk, why time decay and volatility drive prices, and see worked strategy examples with their risks stated clearly. Everything is taught with hypothetical numbers and paper-trading exercises.",
    modules: [
      {
        title: "Options basics",
        lessons: [
          {
            title: "Introduction to Options",
            preview: true,
            video: "options-trading-fundamentals-preview.mp4",
            body: `An option is a contract that gives the buyer the right, but not the obligation, to buy or sell an underlying asset at a set price (the strike) on or before a set date (the expiry). The buyer pays a price for this right, called the premium.

Why options exist: they let people manage risk (for example, protect shares they own) or take a view with a limited, known cost.

Key terms:
- Underlying: the asset the option is based on.
- Strike price: the price in the contract.
- Expiry: when the contract ends.
- Premium: what the buyer pays and the seller receives.
- Contract size: often 100 units of the underlying per contract in equity options.

Two sides of every contract: the buyer (long) has limited loss, which is the premium. The seller (short, also called writer) receives the premium but takes on an obligation, and some short positions can lose much more than the premium.

Options can expire worthless. That is the most common way new traders lose money, so we start by learning on paper.

${DISCLAIMER}`,
          },
          {
            title: "Calls and Puts",
            body: `Call option: gives the buyer the right to buy the underlying at the strike. A call gains value when the underlying price rises.

Put option: gives the buyer the right to sell the underlying at the strike. A put gains value when the underlying price falls.

Example (hypothetical): a share trades at 100. You buy one call with a 105 strike for a premium of 2.00 per share (200 for a 100-share contract).
- At expiry, if the share is at 103 the call is worthless; you lose the 200 premium.
- At 105 the call is worthless; you lose 200.
- At 110 the call is worth 5.00; after the 2.00 premium, the profit is 3.00 per share, or 300.
The break-even is the strike plus the premium: 107.

Moneyness: in the money (the option has intrinsic value), at the money (strike near the price) and out of the money (no intrinsic value).

A long put works as the mirror image. Many holders of shares use puts as insurance: the premium is the cost of protection.

Exercise: draw the profit and loss of a long call and a long put at expiry on paper. Mark the break-even on each.

${DISCLAIMER}`,
          },
          {
            title: "Understanding Options Greeks",
            pdf: {
              file: "options-quick-reference.pdf",
              title: "Options Quick Reference",
              downloadable: true,
            },
            body: `The Greeks are numbers that describe how an option's price reacts to different changes. They are tools for understanding risk, not predictions.

Delta: how much the option price changes for a 1.00 move in the underlying. A call's delta is between 0 and 1; a put's between -1 and 0. It is also a rough guide to the chance of finishing in the money.

Gamma: how fast delta itself changes. It is highest for near-the-money options close to expiry.

Theta: time decay, the value the option loses each day as expiry nears, all else equal. It works against option buyers and in favour of sellers.

Vega: sensitivity to changes in implied volatility. Higher expected volatility raises option prices.

Rho: sensitivity to interest rates. Usually the least important for short-dated options.

Example (hypothetical): a call has delta 0.50, theta -0.04 and vega 0.10. If the underlying rises by 1.00, the call gains about 0.50. Each passing day, all else equal, it loses about 0.04. If implied volatility rises by one point, it gains about 0.10.

The attached Options Quick Reference summarises these on one page.

${DISCLAIMER}`,
          },
        ],
      },
      {
        title: "Risk and strategy",
        lessons: [
          {
            title: "Time Decay",
            body: `Options are wasting assets: part of their price is time value, and time value shrinks to zero at expiry. This shrinking is time decay, measured by theta.

Time decay is not steady. It is slow when expiry is far away and speeds up in the final weeks. An option that is at the money loses the most time value as expiry approaches.

What this means in practice:
- Buyers need the move to happen soon enough and be large enough to beat the decay and the premium.
- A correct view with poor timing can still lose money.
- Sellers benefit from decay but carry the risk of a large adverse move.

Example (hypothetical): an at-the-money call with 60 days left costs 4.00. If the underlying does not move at all, it may be worth about 3.00 with 30 days left and near 1.00 with a week left. Nothing went wrong with the view's direction; time simply passed.

Planning questions: how long do I think I need? Does my chosen expiry give the idea enough time? Am I paying for time I do not need?

${DISCLAIMER}`,
          },
          {
            title: "Understanding Volatility",
            body: `Volatility is how much a price moves. In options there are two ideas.

Historical volatility: how much the underlying actually moved recently.
Implied volatility (IV): the volatility the option market is pricing in for the future, taken from current option prices.

When IV is high, options are expensive; when IV is low, they are cheap. IV often rises before known events such as company earnings and falls afterwards, sometimes sharply. This is sometimes called volatility crush: an option can lose value after an event even if the price moved in the expected direction, because IV dropped.

Practical points:
- Compare the current IV with its own recent range, not with other stocks.
- Buying options when IV is already high means paying a premium for uncertainty that may fade.
- Vega tells you how much a position gains or loses for a one-point change in IV.

Exercise: pick a stock with a scheduled event. Record its option price and IV a week before, the day before and the day after. Write down what you notice.

${DISCLAIMER}`,
          },
          {
            title: "Options Risk and Strategy Examples",
            body: `Strategies combine options to shape risk. Here are four simple examples, each with hypothetical numbers and its main risk.

1. Long call. Pay 2.00 for a 105 call with the share at 100. Maximum loss: 2.00. Gains if the share rises well above 107. Risk: the whole premium can be lost if the price does not rise by expiry.

2. Protective put. You own the shares and buy a 95 put for 1.50. Your loss below 95 is limited, at the cost of 1.50 per share. Risk: the premium is a cost every time you renew the protection.

3. Covered call. You own the shares and sell a 105 call for 1.50. You keep the premium, but your gains above 105 are given up. Risk: you still hold all the downside of the shares.

4. Bull call spread. Buy a 100 call for 4.00 and sell a 110 call for 1.50. Net cost 2.50, maximum loss 2.50, maximum gain 7.50. Risk: both options can expire worthless; gains are capped.

Before any real trade: know the maximum loss, the break-even, the expiry, and how you will exit. Selling uncovered (naked) options can lose far more than the premium and is not suitable for beginners.

Practise each of these on paper for a month and review them in your journal.

${DISCLAIMER}`,
          },
        ],
      },
    ],
  },
];

export const DEMO_REVIEWERS = [
  "Alex M.",
  "Priya S.",
  "Jordan T.",
  "Maria G.",
  "Chen W.",
  "Sam O.",
  "Noah B.",
  "Lena K.",
  "Omar H.",
  "Ruth D.",
];

/** Review texts by course slug: [reviewer index, rating, text]. */
export const DEMO_REVIEWS: Record<string, [number, number, string][]> = {
  "trading-fundamentals": [
    [
      0,
      5,
      "Clear and unhurried. The order types lesson finally made limit and market orders click for me.",
    ],
    [1, 4, "Good starting point. I would like a few more worked examples on trading costs."],
    [2, 5, "The risk sizing example was the most useful ten minutes of the whole course."],
    [3, 4, "Well organised, and the glossary PDF is something I keep open."],
    [4, 5, "Great pace for a beginner, with no scary jargon."],
    [5, 4, "Solid basics. The practice exercises are worth actually doing."],
  ],
  "candlestick-chart-mastery": [
    [0, 5, "The mistakes lesson saved me from seeing patterns everywhere. Very honest teaching."],
    [1, 5, "Loved the sample charts assignment. Getting feedback made it stick."],
    [2, 4, "Clear explanations of anatomy. The reference sheet is handy."],
    [6, 5, "Practical and grounded in context rather than hype."],
    [7, 4, "Good course. I would add a few more sample charts."],
  ],
  "technical-analysis-essentials": [
    [3, 5, "The checklist lesson turned my random chart habits into a routine."],
    [4, 4, "Combining indicators without double counting was a new idea for me."],
    [5, 5, "Structure first, indicators second. Exactly the right order."],
    [8, 4, "Dense but rewarding. Take your time with the exercises."],
    [9, 3, "Useful, though I needed to pause often. A bit fast in the RSI lesson."],
  ],
  "risk-management-and-psychology": [
    [0, 5, "The psychology lessons are honest about how hard discipline is."],
    [2, 5, "Position sizing from the stop distance changed how I plan every trade."],
    [6, 4, "The trading plan template was practical and short enough to use."],
    [7, 5, "Journaling advice that I have actually followed. Worth it."],
    [9, 4, "Good balance of numbers and mindset."],
    [1, 5, "I wish I had taken this before I opened my first account."],
  ],
  "options-trading-fundamentals": [
    [4, 5, "Greeks explained with plain examples. Time decay made much more sense."],
    [5, 4, "Careful about risk throughout, which I appreciated. The strategy examples are clear."],
    [8, 4, "Advanced but approachable. Paper trading exercises are essential."],
    [3, 5, "The volatility lesson cleared up why options lose value after earnings."],
  ],
};

export const DEMO_ASSIGNMENTS = {
  patterns: {
    courseSlug: "candlestick-chart-mastery",
    lessonTitle: "Practical Chart Analysis",
    title: "Identify Chart Patterns",
    instructions:
      "Open the attached sample charts. For each of Chart A to Chart D:\n\n1. Name the trend (up, down or sideways) and say what makes you think so.\n2. Point to one support or resistance area and explain how you chose it.\n3. Describe any candlestick pattern you notice and where it appears.\n4. Say one thing that would change your mind.\n\nWrite in your own words. Aim for two to four sentences per chart. The charts are computer-generated for practice and do not show a real market.",
    attachment: "sample-charts.pdf",
    dueInDays: 10,
  },
  risk: {
    courseSlug: "trading-fundamentals",
    lessonTitle: "Introduction to Risk Management",
    title: "Create a Risk Management Plan",
    instructions:
      "Use the attached worksheet and hypothetical figures to write a simple risk management plan for a practice account.\n\nInclude:\n1. Your starting balance and the maximum percentage you would risk on one trade.\n2. One example trade: entry, stop-loss, target, and the risk-to-reward ratio.\n3. The position size, with your calculation shown.\n4. Your daily loss limit and what you will do when you reach it.\n5. Two rules that will keep you disciplined.\n\nThis is a practice exercise. Do not use real money or real account details.",
    attachment: "risk-management-plan-worksheet.pdf",
    dueInDays: 14,
  },
};

export const SAMPLE_SUBMISSIONS = {
  student:
    "Chart A: uptrend, with higher highs and higher lows until the last few candles.\nSupport near the middle of the chart, where price paused twice before rising.\nI see a hammer-like candle just before the final climb, which fits buyers defending that area.\nI would change my mind if price closed below the support zone.\n\nChart B: downtrend, with lower highs. Resistance near the early highs. A shooting-star shape near the top of the first bounce.",
  learner:
    "Chart A rises with pauses. Support is around the second pause. Chart B falls and bounces. I could not find a clear pattern in Chart C, which looked choppy, and that seems like the right answer.",
  feedback:
    "Good start. You named the trend and the level for each chart, and it was sensible to say Chart C had no clear pattern. Next time, say what makes the level meaningful (how many times price reacted there) and what would invalidate your reading.",
};
