import { describe, expect, it } from "vitest";
import {
  FACTORS,
  GROUP,
  HEAT,
  NET_COST,
  SBU_PLANS,
  dominantFactor,
  exposureClass,
  type FactorKey,
} from "./factorAnalysis";

describe("factorAnalysis reconciliation", () => {
  it("at-risk = sum of factor down", () => {
    const sum = FACTORS.reduce((s, f) => s + f.down, 0);
    expect(sum).toBe(GROUP.atRisk);
  });
  it("recoverable = sum of factor sav", () => {
    const sum = FACTORS.reduce((s, f) => s + f.sav, 0);
    expect(sum).toBe(GROUP.recoverable);
  });
  it("net cost = at-risk − recoverable", () => {
    expect(NET_COST).toBe(GROUP.atRisk - GROUP.recoverable);
    expect(NET_COST).toBe(431);
  });
  it("has exactly 15 SBU plans", () => {
    expect(SBU_PLANS).toHaveLength(15);
  });
  it("every plan has a HEAT row and atRisk/recoverable", () => {
    for (const p of SBU_PLANS) {
      expect(HEAT[p.code]).toBeDefined();
      expect(p.atRisk).toBeGreaterThanOrEqual(0);
      expect(p.recoverable).toBeGreaterThanOrEqual(0);
    }
  });
  it("every plan has a verdict, health, headwind and at least 1 action", () => {
    for (const p of SBU_PLANS) {
      expect(["Grow", "Protect", "Fix", "Review"]).toContain(p.verdict);
      expect(["Strong", "Fair", "Weak"]).toContain(p.health);
      expect(["Low", "Medium", "High"]).toContain(p.headwind);
      expect(p.actions.length).toBeGreaterThan(0);
      expect(p.actions.every((a) => a.a && a.d && a.impact)).toBe(true);
    }
  });
});

describe("dominantFactor & exposureClass", () => {
  it("returns the highest-exposure factor", () => {
    expect(dominantFactor("NXCM")).toBe("duty"); // duty 90
    expect(dominantFactor("AASL")).toBe("oil"); // oil 95
  });
  it("falls back to fx for unknown codes", () => {
    expect(dominantFactor("UNKNOWN")).toBe("fx");
  });
  it("classifies exposure bands", () => {
    expect(exposureClass(10)).toBe("low");
    expect(exposureClass(45)).toBe("med");
    expect(exposureClass(90)).toBe("high");
  });
});

it("exports a valid FactorKey union", () => {
  const keys: FactorKey[] = ["fx", "oil", "rate", "duty"];
  expect(FACTORS.map((f) => f.key)).toEqual(keys);
});
