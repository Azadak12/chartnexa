import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

interface Rule {
  alert: string;
  expr: string;
  for: string;
  labels: { severity: string };
  annotations: { summary: string; runbook: string };
}

describe("alert rules", () => {
  // JSON is valid YAML, so Prometheus loads this file as a rule file (rule_files accepts any name).
  const rules = (
    JSON.parse(read("ops/observability/alerts.rules.json")) as {
      groups: { rules: Rule[] }[];
    }
  ).groups.flatMap((g) => g.rules);
  const runbook = read("ops/observability/RUNBOOK.md");

  it("cover the service being down, errors, dependencies and slowness", () => {
    expect(rules.map((r) => r.alert)).toEqual(
      expect.arrayContaining([
        "ApiDown",
        "ApiHighServerErrorRate",
        "ApiDependencyFailures",
        "ApiSlowResponses",
      ]),
    );
  });

  it("each have an expression, a duration, a severity and a runbook section that exists", () => {
    for (const r of rules) {
      expect(r.expr.length).toBeGreaterThan(5);
      expect(r.for).toMatch(/^\d+[smh]$/);
      expect(["page", "ticket"]).toContain(r.labels.severity);
      const anchor = r.annotations.runbook.split("#")[1];
      expect(anchor).toBe(r.alert.toLowerCase());
      expect(runbook).toContain(`## ${r.alert}`);
    }
  });

  it("only use metrics the API exports", () => {
    const exported = [
      "up",
      "http_requests_total",
      "http_request_duration_seconds_bucket",
      "app_errors_total",
      "nodejs_eventloop_delay_p99_seconds",
    ];
    for (const r of rules) {
      const names = r.expr.match(/[a-z_][a-z0-9_]*(?=\{)/g) ?? [];
      for (const n of names) expect(exported).toContain(n);
    }
  });
});
