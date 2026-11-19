#!/usr/bin/env node
// Load runner with no dependencies (Node 22+). Each virtual user signs in once, then repeats a
// student browsing journey for the duration. It reports latency percentiles per route and fails
// (exit 1) when a threshold is missed. Results describe the machine it ran on, not production.
//
//   node tools/load/run.mjs --env load-env.json --users 50 --seconds 60 --p95 300 --errors 0.01
//
// --env is the JSON printed by `pnpm --filter @chartnexa/api load:env` after READY.
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const num = (k, d) => (args[k] === undefined ? d : Number(args[k]));
const env = JSON.parse(readFileSync(args.env ?? "load-env.json", "utf8"));
const USERS = num("users", 20);
const SECONDS = num("seconds", 30);
const P95_MS = num("p95", 300);
const MAX_ERROR_RATE = num("errors", 0.01);
const THINK_MS = num("think", 0);

const samples = new Map(); // route -> durations (ms)
let ok = 0;
let failed = 0;
const failures = new Map();
const record = (route, ms, good, status) => {
  if (!samples.has(route)) samples.set(route, []);
  samples.get(route).push(ms);
  if (good) ok++;
  else {
    failed++;
    const k = `${route} ${status}`;
    failures.set(k, (failures.get(k) ?? 0) + 1);
  }
};

async function call(route, path, { method = "GET", token, body } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(env.baseUrl + path, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
    record(route, performance.now() - t0, res.ok, res.status);
    return res.ok ? data : null;
  } catch (e) {
    record(route, performance.now() - t0, false, e.code ?? "network");
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function virtualUser(i, until) {
  const email = env.emails[i % env.emails.length];
  const login = await call("POST /auth/login", "/auth/login", {
    method: "POST",
    body: { email, password: env.password },
  });
  const token = login?.accessToken;
  if (!token) return;
  while (performance.now() < until) {
    await call("GET /courses", "/courses?limit=20");
    const course = env.courseIds[Math.floor(Math.random() * env.courseIds.length)];
    await call("GET /courses/:id", `/courses/${course}`, { token });
    await call("GET /courses/:id/reviews", `/courses/${course}/reviews`);
    const mine = await call("GET /me/courses", "/me/courses", { token });
    const owned = mine?.items?.[0]?.id;
    if (owned) {
      const outline = await call("GET /courses/:id/lessons", `/courses/${owned}/lessons`, {
        token,
      });
      const lesson = outline?.items?.[Math.floor(Math.random() * (outline.items.length || 1))]?.id;
      if (lesson) {
        await call("GET /courses/:id/lessons/:id", `/courses/${owned}/lessons/${lesson}`, {
          token,
        });
        await call("PUT completion", `/me/courses/${owned}/lessons/${lesson}/completion`, {
          method: "PUT",
          token,
        });
      }
      await call("GET /me/courses/:id/progress", `/me/courses/${owned}/progress`, { token });
    }
    await call("GET /me/continue-learning", "/me/continue-learning", { token });
    await call("GET /me/announcements/unread-count", "/me/announcements/unread-count", { token });
    if (THINK_MS) await sleep(THINK_MS);
  }
}

const pct = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const start = performance.now();
const until = start + SECONDS * 1000;
await Promise.all(Array.from({ length: USERS }, (_, i) => virtualUser(i, until)));
const elapsed = (performance.now() - start) / 1000;

const rows = [...samples.entries()].map(([route, d]) => {
  const s = [...d].sort((a, b) => a - b);
  return { route, n: s.length, p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99), max: s.at(-1) };
});
const total = ok + failed;
const errorRate = total ? failed / total : 1;
console.log(
  `users=${USERS} seconds=${SECONDS} requests=${total} rps=${(total / elapsed).toFixed(1)} errors=${(errorRate * 100).toFixed(2)}%`,
);
console.log(
  "route".padEnd(36),
  "n".padStart(7),
  "p50".padStart(8),
  "p95".padStart(8),
  "p99".padStart(8),
  "max".padStart(8),
);
for (const r of rows.sort((a, b) => a.route.localeCompare(b.route))) {
  console.log(
    r.route.padEnd(36),
    String(r.n).padStart(7),
    ...[r.p50, r.p95, r.p99, r.max].map((v) => `${v.toFixed(1)}ms`.padStart(8)),
  );
}
for (const [k, n] of failures) console.log(`FAILED ${k} x${n}`);

// Sign-in is slow by design (password hashing), so it is reported but held to its own threshold.
const LOGIN_P95_MS = num("loginP95", 2000);
const slow = rows.filter((r) => r.p95 > (r.route === "POST /auth/login" ? LOGIN_P95_MS : P95_MS));
const pass = errorRate <= MAX_ERROR_RATE && slow.length === 0 && total > 0;
console.log(
  pass
    ? "RESULT PASS"
    : `RESULT FAIL${slow.length ? ` (slow: ${slow.map((r) => r.route).join(", ")})` : ""}${errorRate > MAX_ERROR_RATE ? " (error rate)" : ""}`,
);
process.exit(pass ? 0 : 1);
