import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const reportValues = [
  "00000000-0000-4000-8000-000000000001",
  "Example Reporter",
  "report-1",
  "example.com",
  1_700_000_000,
  1_700_086_400,
  "reject",
  null,
  100,
  "r",
  "r",
  1_700_100_000,
  "developer@example.com",
  "fingerprint-1",
] as const;

async function insertReport(overrides: Partial<Record<number, unknown>> = {}) {
  const values = reportValues.map((value, index) => overrides[index] ?? value);
  return env.DB.prepare(
    `INSERT INTO reports (
      id, org_name, external_report_id, domain, period_begin, period_end,
      policy_p, policy_sp, policy_pct, policy_adkim, policy_aspf,
      imported_at, imported_by, fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(...values)
    .run();
}

describe("initial D1 migration", () => {
  it("creates all normalized report tables", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all<{ name: string }>();

    expect(result.results.map(({ name }) => name)).toEqual([
      "dkim_results",
      "policy_overrides",
      "report_records",
      "reports",
      "spf_results",
    ]);
  });

  it("rejects duplicate report fingerprints", async () => {
    await insertReport();

    await expect(
      insertReport({
        0: "00000000-0000-4000-8000-000000000002",
      }),
    ).rejects.toThrow();
  });

  it("cascades a report deletion to every child table", async () => {
    await insertReport();
    await env.DB.prepare(
      `INSERT INTO report_records (
        id, report_id, source_ip, message_count, disposition,
        evaluated_dkim, evaluated_spf, classification, dmarc_pass,
        header_from, envelope_from, envelope_to
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "00000000-0000-4000-8000-000000000010",
        reportValues[0],
        "192.0.2.1",
        1,
        "none",
        "pass",
        "fail",
        "pass",
        1,
        "example.com",
        null,
        null,
      )
      .run();

    const childId = "00000000-0000-4000-8000-000000000010";
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO dkim_results (id, record_id, domain, selector, result, human_result) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("00000000-0000-4000-8000-000000000011", childId, "example.com", "s1", "pass", null),
      env.DB.prepare(
        "INSERT INTO spf_results (id, record_id, domain, scope, result) VALUES (?, ?, ?, ?, ?)",
      ).bind("00000000-0000-4000-8000-000000000012", childId, "example.com", "mfrom", "pass"),
      env.DB.prepare(
        "INSERT INTO policy_overrides (id, record_id, override_type, comment) VALUES (?, ?, ?, ?)",
      ).bind("00000000-0000-4000-8000-000000000013", childId, "forwarded", null),
    ]);

    await env.DB.prepare("DELETE FROM reports WHERE id = ?").bind(reportValues[0]).run();

    for (const table of [
      "reports",
      "report_records",
      "dkim_results",
      "spf_results",
      "policy_overrides",
    ]) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
      expect(row?.count).toBe(0);
    }
  });

  it.each([
    ["policy percentage", { 8: 101 }],
    ["report period", { 4: 1_700_086_400, 5: 1_700_000_000 }],
    ["policy", { 6: "invalid" }],
    ["alignment", { 9: "invalid" }],
  ])("rejects an invalid %s", async (_name, overrides) => {
    await expect(insertReport(overrides)).rejects.toThrow();
  });

  it("creates the required indexes", async () => {
    const expected = new Set([
      "reports_domain_period_idx",
      "reports_imported_at_idx",
      "report_records_report_id_idx",
      "report_records_source_ip_idx",
      "report_records_classification_idx",
      "dkim_results_record_id_idx",
      "spf_results_record_id_idx",
      "policy_overrides_record_id_idx",
    ]);

    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL",
    ).all<{ name: string }>();

    const actual = new Set(result.results.map(({ name }) => name));
    for (const index of expected) {
      expect(actual.has(index), `missing index ${index}`).toBe(true);
    }
  });
});
