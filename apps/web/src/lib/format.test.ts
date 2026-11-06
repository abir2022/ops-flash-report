import { describe, expect, it } from "vitest";
import { achVerdict, fmt, fmtPct, momVerdict, momentumCls, num } from "./format";

describe("num", () => {
  it("coerces numeric strings and numbers", () => {
    expect(num("42.5")).toBe(42.5);
    expect(num(42.5)).toBe(42.5);
  });
  it("returns null for null/undefined/empty/non-finite", () => {
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num("")).toBeNull();
    expect(num(NaN)).toBeNull();
  });
});

describe("fmt", () => {
  it("formats with thousands separators", () => {
    expect(fmt(1857.232897)).toBe("1,857.23");
  });
  it("renders dash for null", () => {
    expect(fmt(null)).toBe("—");
  });
});

describe("fmtPct", () => {
  it("appends %", () => {
    expect(fmtPct(12.5)).toBe("12.5%");
  });
  it("renders dash for null", () => {
    expect(fmtPct(null)).toBe("—");
  });
});

describe("momentumCls", () => {
  it("maps positive/strong to up", () => {
    expect(momentumCls("Strong +")).toBe("mom-up");
    expect(momentumCls("Positive")).toBe("mom-up");
  });
  it("maps weak/negative to down", () => {
    expect(momentumCls("Weak")).toBe("mom-down");
    expect(momentumCls("Negative")).toBe("mom-down");
  });
  it("defaults to neutral", () => {
    expect(momentumCls("Neutral")).toBe("mom-neu");
    expect(momentumCls(null)).toBe("mom-neu");
  });
});

describe("achVerdict", () => {
  it("says On target at 100%+", () => {
    expect(achVerdict(120).label).toBe("On target");
    expect(achVerdict(100).cls).toBe("good");
  });
  it("says Close between 85–99.99%", () => {
    expect(achVerdict(85).label).toBe("Close");
    expect(achVerdict(99.9).cls).toBe("watch");
  });
  it("says Behind below 85%", () => {
    expect(achVerdict(60).label).toBe("Behind");
    expect(achVerdict(0).cls).toBe("risk");
  });
  it("handles null", () => {
    expect(achVerdict(null).label).toBe("No target set");
  });
});

describe("momVerdict", () => {
  it("says Up for positive, Down for negative, Flat for zero/null", () => {
    expect(momVerdict(5).label).toBe("Up");
    expect(momVerdict(-5).label).toBe("Down");
    expect(momVerdict(0).label).toBe("Flat");
    expect(momVerdict(null).label).toBe("Flat");
  });
});
