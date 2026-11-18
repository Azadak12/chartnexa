import { afterEach, describe, expect, it } from "vitest";
import { Metrics, metricsAccess } from "./metrics.js";

let m: Metrics | undefined;
afterEach(() => m?.stop());

describe("metrics text", () => {
  it("counts requests by method, route and status class, with a duration histogram", () => {
    m = new Metrics();
    m.observeRequest("GET", "/courses/:id", 200, 0.02);
    m.observeRequest("GET", "/courses/:id", 204, 0.3);
    m.observeRequest("GET", "/courses/:id", 404, 0.001);
    m.observeError("dependency");
    const t = m.render();
    expect(t).toContain(
      'http_requests_total{method="GET",route="/courses/:id",status_class="2xx"} 2',
    );
    expect(t).toContain(
      'http_requests_total{method="GET",route="/courses/:id",status_class="4xx"} 1',
    );
    expect(t).toContain(
      'http_request_duration_seconds_bucket{method="GET",route="/courses/:id",le="0.025"} 2',
    );
    expect(t).toContain(
      'http_request_duration_seconds_bucket{method="GET",route="/courses/:id",le="+Inf"} 3',
    );
    expect(t).toContain('http_request_duration_seconds_count{method="GET",route="/courses/:id"} 3');
    expect(t).toContain('app_errors_total{error_class="dependency"} 1');
    for (const g of [
      "process_resident_memory_bytes",
      "process_uptime_seconds",
      "nodejs_eventloop_delay_p99_seconds",
    ]) {
      expect(t).toMatch(new RegExp(`^${g} [0-9.e+-]+$`, "m"));
    }
    // Every sample line is name{labels} value or name value.
    for (const line of t
      .trim()
      .split("\n")
      .filter((l) => !l.startsWith("#"))) {
      expect(line).toMatch(/^[a-z0-9_]+(\{[^}]*\})? [0-9.e+-]+$/);
    }
  });

  it("escapes label values", () => {
    m = new Metrics();
    m.observeRequest("GET", 'a"b\\c', 500, 1);
    expect(m.render()).toContain('route="a\\"b\\\\c"');
  });
});

describe("metrics access", () => {
  const token = "t".repeat(40);
  it("is open outside production without a token", () => {
    expect(metricsAccess("development", undefined, undefined)).toBe(200);
    expect(metricsAccess("test", undefined, "Bearer anything")).toBe(200);
  });
  it("is off in production without a token", () => {
    expect(metricsAccess("production", undefined, `Bearer ${token}`)).toBe(404);
  });
  it("needs the exact bearer token when one is set", () => {
    for (const env of ["production", "development"]) {
      expect(metricsAccess(env, token, `Bearer ${token}`)).toBe(200);
      expect(metricsAccess(env, token, undefined)).toBe(401);
      expect(metricsAccess(env, token, `Bearer ${token}x`)).toBe(401);
      expect(metricsAccess(env, token, token)).toBe(401);
    }
  });
});
