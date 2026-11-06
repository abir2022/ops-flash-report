import { describe, expect, it } from "vitest";
import {
  buildTargetProgress,
  computeHealth,
  contributionPct,
  PARAMETERS,
  quadrantOf,
  rankRows,
} from "./analysis";
import type { ScorecardRow } from "../types";

function makeRow(overrides: Partial<ScorecardRow> = {}): ScorecardRow {
  return {
    sbu_id: 1,
    code: "TEST",
    name: null,
    section: null,
    is_freight: false,
    channel: "default",
    src: null,
    daily_rev: 0,
    dod_rev: 0,
    mtd_rev: 0,
    mom_rev: 0,
    yoy_rev: 0,
    fy_ytd_rev: 0,
    cy_ytd_rev: 0,
    daily_vol: null,
    dod_vol: null,
    mtd_vol: null,
    mom_vol: null,
    vol_uom: null,
    has_vol: false,
    mo_tgt_rev: null,
    mtd_tgt_rev: null,
    mo_tgt_vol: null,
    mtd_tgt_vol: null,
    mtd_ach_pct: null,
    mom_pct: null,
    yoy_pct: null,
    proj_rev: null,
    momentum: null,
    report_date: "2026-09-05",
    ...overrides,
  };
}

describe("contributionPct", () => {
  it("computes share of MTD", () => {
    expect(contributionPct(makeRow({ mtd_rev: 25 }), 100)).toBe(25);
  });
  it("returns null when no total or no revenue", () => {
    expect(contributionPct(makeRow({ mtd_rev: 25 }), 0)).toBeNull();
    expect(contributionPct(makeRow({ mtd_rev: null }), 100)).toBeNull();
  });
});

describe("quadrantOf", () => {
  it("classifies the four quadrants", () => {
    expect(quadrantOf(makeRow({ mom_pct: 5, mtd_ach_pct: 110 }))).toBe("Star");
    expect(quadrantOf(makeRow({ mom_pct: 5, mtd_ach_pct: 80 }))).toBe("Question Mark");
    expect(quadrantOf(makeRow({ mom_pct: -2, mtd_ach_pct: 105 }))).toBe("Cash Cow");
    expect(quadrantOf(makeRow({ mom_pct: 0, mtd_ach_pct: 99 }))).toBe("Dog");
  });
  it("returns null when growth or achievement missing", () => {
    expect(quadrantOf(makeRow({ mom_pct: null, mtd_ach_pct: 100 }))).toBeNull();
    expect(quadrantOf(makeRow({ mom_pct: 5, mtd_ach_pct: null }))).toBeNull();
  });
});

describe("rankRows", () => {
  const rows = [
    makeRow({ sbu_id: 1, mtd_rev: 10 }),
    makeRow({ sbu_id: 2, mtd_rev: 30 }),
    makeRow({ sbu_id: 3, mtd_rev: 20 }),
    makeRow({ sbu_id: 4, mtd_rev: null }),
  ];
  it("ranks by chosen param, higher first", () => {
    const ranked = rankRows(rows, "mtd_rev", 60);
    expect(ranked.map((r) => r.sbu_id)).toEqual([2, 3, 1, 4]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
  it("pushes nulls to the end", () => {
    const ranked = rankRows(rows, "mtd_rev", 60);
    expect(ranked[ranked.length - 1].value).toBeNull();
  });
});

describe("computeHealth", () => {
  const rows = [
    makeRow({ sbu_id: 1, code: "A", mtd_rev: 10, mom_pct: 5, yoy_pct: 3, mtd_ach_pct: 120 }),
    makeRow({ sbu_id: 2, code: "B", mtd_rev: 50, mom_pct: 15, yoy_pct: 10, mtd_ach_pct: 150 }),
    makeRow({ sbu_id: 3, code: "C", mtd_rev: 30, mom_pct: -5, yoy_pct: -2, mtd_ach_pct: 60 }),
  ];
  it("returns one result per SBU, sorted descending", () => {
    const health = computeHealth(rows);
    expect(health).toHaveLength(3);
    expect(health[0].score).toBeGreaterThanOrEqual(health[1].score);
    expect(health[1].score).toBeGreaterThanOrEqual(health[2].score);
  });
  it("keeps scores within 0-100 and assigns bands", () => {
    for (const h of computeHealth(rows)) {
      expect(h.score).toBeGreaterThanOrEqual(0);
      expect(h.score).toBeLessThanOrEqual(100);
      expect(["Good", "Watch", "Risk"]).toContain(h.band);
    }
  });
  it("best row outranks worst row", () => {
    const health = computeHealth(rows);
    expect(health[0].row.code).toBe("B");
    expect(health[health.length - 1].row.code).toBe("C");
  });
});

describe("PARAMETERS", () => {
  it("has no duplicate keys", () => {
    const keys = PARAMETERS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("buildTargetProgress", () => {
  const rows = [
    makeRow({ sbu_id: 1, code: "A", mtd_rev: 12, mo_tgt_rev: 50 }),
    makeRow({ sbu_id: 2, code: "B", mtd_rev: 30, mo_tgt_rev: 40 }),
    makeRow({ sbu_id: 3, code: "C", mtd_rev: 5, mo_tgt_rev: null }),
    makeRow({ sbu_id: 4, code: "D", mtd_rev: 60, mo_tgt_rev: 50 }),
  ];
  it("drops SBUs without a positive monthly target", () => {
    const out = buildTargetProgress(rows);
    expect(out.map((r) => r.code)).toEqual(["D", "B", "A"]);
  });
  it("computes pct and caps the bar at 100", () => {
    const out = buildTargetProgress(rows);
    const a = out.find((r) => r.code === "A")!;
    expect(a.pct).toBeCloseTo(24);
    expect(a.cappedPct).toBeCloseTo(24);
    expect(a.over).toBe(false);
    const d = out.find((r) => r.code === "D")!;
    expect(d.pct).toBeCloseTo(120);
    expect(d.cappedPct).toBe(100);
    expect(d.over).toBe(true);
  });
  it("sorts by progress descending", () => {
    const out = buildTargetProgress(rows);
    expect(out[0].pct).toBeGreaterThanOrEqual(out[1].pct);
    expect(out[1].pct).toBeGreaterThanOrEqual(out[2].pct);
  });
  it("treats zero/negative target as missing", () => {
    const out = buildTargetProgress([makeRow({ sbu_id: 9, code: "Z", mtd_rev: 1, mo_tgt_rev: 0 })]);
    expect(out).toHaveLength(0);
  });
});
