import { describe, expect, it } from "vitest";
import {
  actionForCategory,
  buildHeatmap,
  buildImpactMap,
  classifyRisk,
  computeSbuRisks,
  defaultSignals,
  detectOpportunities,
  exposureFor,
  generateExecutiveSummary,
  momentumProbability,
  simulateImpact,
  type ExternalSignal,
  type WhatIfScenario,
} from "./biir";
import type { ScorecardRow } from "../types";

function makeRow(overrides: Partial<ScorecardRow> = {}): ScorecardRow {
  return {
    sbu_id: 1,
    code: "TEST",
    name: "Test SBU",
    section: "Food",
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
    report_date: "2026-09-21",
    ...overrides,
  };
}

describe("classifyRisk", () => {
  it("applies the 0-30 / 31-70 / 71-100 bands", () => {
    expect(classifyRisk(0)).toBe("Low");
    expect(classifyRisk(30)).toBe("Low");
    expect(classifyRisk(31)).toBe("Medium");
    expect(classifyRisk(70)).toBe("Medium");
    expect(classifyRisk(71)).toBe("Critical");
    expect(classifyRisk(100)).toBe("Critical");
  });
  it("clamps out-of-range inputs", () => {
    expect(classifyRisk(-5)).toBe("Low");
    expect(classifyRisk(150)).toBe("Critical");
  });
});

describe("momentumProbability", () => {
  it("maps momentum labels to probabilities", () => {
    expect(momentumProbability("Negative")).toBe(0.9);
    expect(momentumProbability("Weak")).toBe(0.7);
    expect(momentumProbability("Neutral")).toBe(0.45);
    expect(momentumProbability("Positive")).toBe(0.3);
    expect(momentumProbability("Strong +")).toBe(0.15);
  });
  it("defaults unknown/null momentum to 0.5", () => {
    expect(momentumProbability(null)).toBe(0.5);
    expect(momentumProbability("Weird")).toBe(0.5);
  });
});

describe("exposureFor", () => {
  it("returns the section exposure", () => {
    const e = exposureFor("Logistics", false, "NXSL");
    expect(e.fuel).toBeCloseTo(0.95);
  });
  it("boosts fuel for freight SBUs", () => {
    const base = exposureFor("Logistics", false, "NXSL");
    const freight = exposureFor("Logistics", true, "NXSL");
    expect(freight.fuel).toBeGreaterThan(base.fuel);
    expect(freight.fuel).toBeLessThanOrEqual(1);
  });
  it("applies code overrides", () => {
    const coal = exposureFor("Trading", false, "NXCL1");
    expect(coal.commodity).toBe(0.9);
  });
  it("falls back to a default for unknown sections", () => {
    const e = exposureFor(null, false, "XYZ");
    expect(e.fuel).toBeGreaterThan(0);
  });
});

describe("defaultSignals", () => {
  it("returns a non-empty catalogue", () => {
    const s = defaultSignals();
    expect(s.length).toBeGreaterThan(0);
  });
  it("has unique ids", () => {
    const s = defaultSignals();
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
  });
  it("every signal has a valid category and severity", () => {
    for (const sig of defaultSignals()) {
      expect(sig.category).toBeTruthy();
      expect(["low", "medium", "critical"]).toContain(sig.severity);
    }
  });
});

describe("computeSbuRisks", () => {
  const rows = [
    makeRow({ sbu_id: 1, code: "A", mtd_rev: 20, momentum: "Negative", mtd_ach_pct: 40 }),
    makeRow({ sbu_id: 2, code: "B", mtd_rev: 10, momentum: "Positive", mtd_ach_pct: 120 }),
  ];
  it("sorts by risk score descending", () => {
    const risks = computeSbuRisks(rows);
    expect(risks[0].riskScore).toBeGreaterThanOrEqual(risks[1].riskScore);
  });
  it("negative-momentum low-achievement SBU scores higher than a positive one", () => {
    const risks = computeSbuRisks(rows);
    const a = risks.find((r) => r.code === "A")!;
    const b = risks.find((r) => r.code === "B")!;
    expect(a.riskScore).toBeGreaterThan(b.riskScore);
  });
  it("keeps scores within 0-100 and assigns a valid class", () => {
    for (const r of computeSbuRisks(rows)) {
      expect(r.riskScore).toBeGreaterThanOrEqual(0);
      expect(r.riskScore).toBeLessThanOrEqual(100);
      expect(["Low", "Medium", "Critical"]).toContain(r.riskClass);
    }
  });
});

describe("buildImpactMap", () => {
  const rows = [
    makeRow({ sbu_id: 1, code: "COAL", section: "Trading", mtd_rev: 60 }),
    makeRow({ sbu_id: 2, code: "IT", section: "IT", mtd_rev: 5 }),
  ];
  const signals: ExternalSignal[] = [
    { id: "coal", category: "commodity", name: "Coal", value: 95, unit: "USD/MT", changePct: 12, direction: "up", severity: "critical", note: "", source: "test", updatedAt: "2026-09-21" },
  ];
  it("ranks commodity-sensitive SBU above a low-exposure one", () => {
    const impacts = buildImpactMap(rows, signals);
    const coal = impacts.find((i) => i.code === "COAL");
    const it = impacts.find((i) => i.code === "IT");
    expect(coal).toBeDefined();
    expect(it).toBeUndefined(); // negligible exposure dropped
  });
  it("skips zero-revenue SBUs", () => {
    const impacts = buildImpactMap([makeRow({ sbu_id: 9, code: "Z", mtd_rev: 0 })], signals);
    expect(impacts).toHaveLength(0);
  });
});

describe("detectOpportunities", () => {
  it("flags a growth opportunity from positive momentum", () => {
    const rows = [makeRow({ sbu_id: 1, code: "A", mtd_rev: 30, mom_pct: 10, yoy_pct: 5 })];
    const opps = detectOpportunities(rows);
    expect(opps.some((o) => o.kind === "growth" && o.code === "A")).toBe(true);
  });
  it("flags a recovery opportunity when projection is close to target", () => {
    const rows = [makeRow({ sbu_id: 1, code: "A", mtd_rev: 40, mtd_ach_pct: 80, mo_tgt_rev: 50, proj_rev: 49 })];
    const opps = detectOpportunities(rows);
    expect(opps.some((o) => o.kind === "recovery")).toBe(true);
  });
  it("returns empty when nothing qualifies", () => {
    expect(detectOpportunities([makeRow({ sbu_id: 1, code: "A" })])).toHaveLength(0);
  });
});

describe("generateExecutiveSummary", () => {
  it("reflects critical risk in the headline", () => {
    const rows = [makeRow({ sbu_id: 1, code: "A", mtd_rev: 30, momentum: "Negative", mtd_ach_pct: 30 })];
    const risks = computeSbuRisks(rows);
    const summary = generateExecutiveSummary(risks, [], [], {
      total_mtd: 30, total_daily: 1, active_sbus: 1, avg_ach_pct: 30,
    });
    expect(summary.headline).toContain("Critical");
    expect(summary.actions.length).toBeGreaterThan(0);
  });
  it("is calm when there are no risks", () => {
    const rows = [makeRow({ sbu_id: 1, code: "A", mtd_rev: 30, momentum: "Positive", mtd_ach_pct: 120 })];
    const risks = computeSbuRisks(rows);
    const summary = generateExecutiveSummary(risks, [], [], null);
    expect(summary.headline).toContain("stable");
  });
});

describe("simulateImpact", () => {
  const rows = [
    makeRow({ sbu_id: 1, code: "FREIGHT", section: "Logistics", is_freight: true, mtd_rev: 50 }),
    makeRow({ sbu_id: 2, code: "IT", section: "IT", mtd_rev: 5 }),
  ];
  const fuel: WhatIfScenario = { id: "fuel", label: "Diesel", category: "fuel", deltaPct: 15 };
  it("estimates a larger impact for freight than IT", () => {
    const res = simulateImpact(rows, fuel);
    const freight = res.impacted.find((i) => i.code === "FREIGHT");
    const it = res.impacted.find((i) => i.code === "IT");
    expect(freight).toBeDefined();
    expect(freight!.impact).toBeGreaterThan(it ? it.impact : 0);
    expect(res.impacted[0].code).toBe("FREIGHT");
    expect(res.totalImpact).toBeGreaterThan(0);
    expect(res.recommendation).toBeTruthy();
  });
});

describe("buildHeatmap", () => {
  it("pivots impacts into an SBU × factor matrix sorted by max score", () => {
    const rows = [
      makeRow({ sbu_id: 1, code: "A", section: "Logistics", is_freight: true, mtd_rev: 50 }),
      makeRow({ sbu_id: 2, code: "B", section: "Trading", mtd_rev: 40 }),
    ];
    const signals = defaultSignals();
    const impacts = buildImpactMap(rows, signals);
    const heat = buildHeatmap(impacts);
    expect(heat.length).toBeGreaterThan(0);
    expect(heat[0].maxScore).toBeGreaterThanOrEqual(heat[heat.length - 1].maxScore);
    expect(heat[0].byCategory).toBeDefined();
  });
});

describe("actionForCategory", () => {
  it("returns owner and timeline for every category", () => {
    for (const cat of ["fuel", "energy", "fx", "commodity", "crisis", "supply", "market"] as const) {
      const a = actionForCategory(cat);
      expect(a.action).toBeTruthy();
      expect(a.owner).toBeTruthy();
      expect(a.timeline).toBeTruthy();
    }
  });
});
