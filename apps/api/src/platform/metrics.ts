import { timingSafeEqual } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";

type IntervalHistogram = ReturnType<typeof monitorEventLoopDelay>;

/** Request duration buckets in seconds. */
export const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

type Labels = Record<string, string>;
const key = (l: Labels): string =>
  Object.keys(l)
    .sort()
    .map((k) => `${k}="${l[k]!.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`)
    .join(",");

interface Histogram {
  labels: Labels;
  buckets: number[];
  sum: number;
  count: number;
}

/**
 * A small in-process metrics registry rendered as Prometheus text (format 0.0.4). Values are per
 * instance and reset on restart; the scraper adds instances up.
 */
export class Metrics {
  private readonly requests = new Map<string, { labels: Labels; value: number }>();
  private readonly durations = new Map<string, Histogram>();
  private readonly errors = new Map<string, { labels: Labels; value: number }>();
  private readonly loop: IntervalHistogram;
  private readonly started = Date.now();

  constructor() {
    this.loop = monitorEventLoopDelay({ resolution: 20 });
    this.loop.enable();
  }

  stop(): void {
    this.loop.disable();
  }

  observeRequest(method: string, route: string, status: number, seconds: number): void {
    const labels = { method, route, status_class: `${Math.floor(status / 100)}xx` };
    const k = key(labels);
    const c = this.requests.get(k) ?? { labels, value: 0 };
    c.value += 1;
    this.requests.set(k, c);
    const hl = { method, route };
    const hk = key(hl);
    const h = this.durations.get(hk) ?? {
      labels: hl,
      buckets: DURATION_BUCKETS.map(() => 0),
      sum: 0,
      count: 0,
    };
    DURATION_BUCKETS.forEach((b, i) => {
      if (seconds <= b) h.buckets[i]! += 1;
    });
    h.sum += seconds;
    h.count += 1;
    this.durations.set(hk, h);
  }

  observeError(errorClass: string): void {
    const labels = { error_class: errorClass };
    const k = key(labels);
    const c = this.errors.get(k) ?? { labels, value: 0 };
    c.value += 1;
    this.errors.set(k, c);
  }

  render(): string {
    const out: string[] = [];
    out.push("# HELP http_requests_total Requests served, by route pattern and status class.");
    out.push("# TYPE http_requests_total counter");
    for (const c of this.requests.values())
      out.push(`http_requests_total{${key(c.labels)}} ${c.value}`);
    out.push("# HELP http_request_duration_seconds Time to serve a request.");
    out.push("# TYPE http_request_duration_seconds histogram");
    for (const h of this.durations.values()) {
      const l = key(h.labels);
      DURATION_BUCKETS.forEach((b, i) =>
        out.push(`http_request_duration_seconds_bucket{${l},le="${b}"} ${h.buckets[i]}`),
      );
      out.push(`http_request_duration_seconds_bucket{${l},le="+Inf"} ${h.count}`);
      out.push(`http_request_duration_seconds_sum{${l}} ${h.sum}`);
      out.push(`http_request_duration_seconds_count{${l}} ${h.count}`);
    }
    out.push("# HELP app_errors_total Unexpected errors, by class (dependency or server).");
    out.push("# TYPE app_errors_total counter");
    for (const c of this.errors.values()) out.push(`app_errors_total{${key(c.labels)}} ${c.value}`);
    const mem = process.memoryUsage();
    out.push("# HELP process_resident_memory_bytes Resident memory.");
    out.push("# TYPE process_resident_memory_bytes gauge");
    out.push(`process_resident_memory_bytes ${mem.rss}`);
    out.push("# HELP process_heap_used_bytes Heap in use.");
    out.push("# TYPE process_heap_used_bytes gauge");
    out.push(`process_heap_used_bytes ${mem.heapUsed}`);
    out.push("# HELP process_uptime_seconds Seconds since the process started serving.");
    out.push("# TYPE process_uptime_seconds gauge");
    out.push(`process_uptime_seconds ${(Date.now() - this.started) / 1000}`);
    out.push("# HELP nodejs_eventloop_delay_p99_seconds 99th percentile event-loop delay.");
    out.push("# TYPE nodejs_eventloop_delay_p99_seconds gauge");
    out.push(`nodejs_eventloop_delay_p99_seconds ${this.loop.percentile(99) / 1e9}`);
    return `${out.join("\n")}\n`;
  }
}

/**
 * Who may read /metrics. Outside production it is open unless a token is set. In production it is
 * off (404) without a token, and needs exactly `Bearer <token>` otherwise (401).
 */
export function metricsAccess(
  nodeEnv: string,
  token: string | undefined,
  authorization: string | undefined,
): 200 | 401 | 404 {
  if (nodeEnv === "production" && !token) return 404;
  if (!token) return 200;
  const given = Buffer.from(authorization ?? "");
  const want = Buffer.from(`Bearer ${token}`);
  return given.length === want.length && timingSafeEqual(given, want) ? 200 : 401;
}
