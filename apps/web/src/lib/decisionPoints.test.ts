import { describe, expect, it } from "vitest";
import {
  buildDecisionPoints,
  DEFAULT_DECISION_CONFIG,
  type DecisionInput,
} from "./decisionPoints";
import type { BcgMatrix, BcgRow } from "./advanced";

const base = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  mtdAchievementPct: null,
  momPct: null,
  yoyPct: null,
  mtdRevenue: null,
  monthlyTarget: null,
  projectedMonthEnd: null,
  fyForecast: null,
  fyTarget: null,
  forecastMapePct: null,
  basisMonths: 0,
  hhi: null,
  top5Share: null,
  bcg: null,
  ...over,
});

const dogRows: BcgRow[] = [
  { item_id: 1, name: "d1", value: 60, priorValue: 60, growth: 0, growthPlot: 0, share: 60, relativeShare: 1, quadrant: "Dog" },
  { item_id: 2, name: "s1", value: 40, priorValue: 20, growth: 100, growthPlot: 100, share: 40, relativeShare: 0.67, quadrant: "Star" },
];
const dogMatrix: BcgMatrix = { rows: dogRows, shareThreshold: 0.5, hasPriorData: true };

describe("buildDecisionPoints", () => {
  it("flags a below-target SBU as Action", () => {
    const pts = buildDecisionPoints(base({
      mtdAchievementPct: 72,
      mtdRevenue: 72,
      monthlyTarget: 100,
      projectedMonthEnd: 88,
    }));
    const m = pts.find((p) => p.id === "mtd-target")!;
    expect(m.severity).toBe("Action");
    expect(m.detail).toContain("72 Cr");
  });

  it("flags a slightly-below-target SBU as Watch", () => {
    const pts = buildDecisionPoints(base({ mtdAchievementPct: 92, mtdRevenue: 92, monthlyTarget: 100 }));
    expect(pts.find((p) => p.id === "mtd-target")!.severity).toBe("Watch");
  });

  it("confirms an on-track SBU as Good", () => {
    const pts = buildDecisionPoints(base({ mtdAchievementPct: 104, mtdRevenue: 104, monthlyTarget: 100 }));
    expect(pts.find((p) => p.id === "mtd-target")!.severity).toBe("Good");
  });

  it("flags a full-year forecast shortfall as Action", () => {
    const pts = buildDecisionPoints(base({ fyForecast: 900, fyTarget: 1000 }));
    const f = pts.find((p) => p.id === "fy-gap")!;
    expect(f.severity).toBe("Action");
    expect(f.detail).toContain("100 Cr");
  });

  it("flags double-negative momentum as Action", () => {
    const pts = buildDecisionPoints(base({ momPct: -4, yoyPct: -9 }));
    const m = pts.find((p) => p.id === "momentum")!;
    expect(m.severity).toBe("Action");
  });

  it("flags YoY-only decline as Watch", () => {
    const pts = buildDecisionPoints(base({ momPct: 2, yoyPct: -6 }));
    expect(pts.find((p) => p.id === "momentum")!.severity).toBe("Watch");
  });

  it("flags high SKU concentration as Watch", () => {
    const pts = buildDecisionPoints(base({ hhi: 3200, top5Share: 93 }));
    expect(pts.find((p) => p.id === "concentration")!.severity).toBe("Watch");
  });

  it("flags too much Dog revenue as Action", () => {
    const pts = buildDecisionPoints(base({ bcg: dogMatrix }));
    const b = pts.find((p) => p.id === "bcg")!;
    expect(b.severity).toBe("Action");
    expect(b.detail).toContain("60%");
  });

  it("flags a provisional forecast (few closed months) as Watch", () => {
    const pts = buildDecisionPoints(base({ forecastMapePct: null, basisMonths: 2 }));
    expect(pts.find((p) => p.id === "confidence")!.severity).toBe("Watch");
  });

  it("sorts Action before Watch before Good and caps at maxPoints", () => {
    const pts = buildDecisionPoints(
      base({
        mtdAchievementPct: 104, mtdRevenue: 104, monthlyTarget: 100, // Good
        momPct: -3, yoyPct: -8, // Action
        hhi: 3000, top5Share: 91, // Watch
        forecastMapePct: null, basisMonths: 2, // Watch
      }),
      { ...DEFAULT_DECISION_CONFIG, maxPoints: 3 },
    );
    expect(pts.length).toBeLessThanOrEqual(3);
    expect(pts[0].severity).toBe("Action");
    const sev = pts.map((p) => p.severity);
    const order: Record<string, number> = { Action: 0, Watch: 1, Good: 2 };
    for (let i = 1; i < sev.length; i++) {
      expect(order[sev[i - 1]]).toBeLessThanOrEqual(order[sev[i]]);
    }
  });

  it("returns no points for empty input", () => {
    expect(buildDecisionPoints(base())).toEqual([]);
  });
});
