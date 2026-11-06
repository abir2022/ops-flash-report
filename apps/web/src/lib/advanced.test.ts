import { describe, expect, it } from "vitest";
import {
  calibrateForecast,
  dayOfWeek,
  forecastFiscal,
  monthOf,
  monthlySeasonalIndex,
  monthlySeries,
  paretoConcentration,
  paretoConcentrationVol,
  skuAbc,
  skuAbcVol,
  skuBcg,
  skuByCategory,
  skuByDistrict,
  skuUnitPrice,
  weekdayIndex,
  type DailyPoint,
} from "./advanced";

const pad = (n: number) => String(n).padStart(2, "0");

describe("dayOfWeek", () => {
  it("returns JS getDay values (0=Sun)", () => {
    // 2026-09-21 is a Monday.
    expect(dayOfWeek("2026-09-21")).toBe(1);
  });
});

describe("monthOf", () => {
  it("extracts 1-based month", () => {
    expect(monthOf("2026-01-15")).toBe(1);
    expect(monthOf("2026-12-31")).toBe(12);
  });
});

describe("monthlySeries", () => {
  it("sums chronologically by month", () => {
    const points = [
      { d: "2026-02-01", value: 10 },
      { d: "2026-01-15", value: 5 },
      { d: "2026-01-20", value: 7 },
    ];
    expect(monthlySeries(points)).toEqual([
      { label: "2026-01", value: 12 },
      { label: "2026-02", value: 10 },
    ]);
  });
});

describe("weekdayIndex", () => {
  it("indexes a weekday that always doubles the others", () => {
    // Monday (dow 1) gets 200 every week, all other days 100.
    const points = [
      { d: "2026-09-20", value: 100 }, // Sun
      { d: "2026-09-21", value: 200 }, // Mon
      { d: "2026-09-22", value: 100 }, // Tue
    ];
    const rows = weekdayIndex(points);
    expect(rows).toHaveLength(7);
    const mon = rows.find((r) => r.dow === 1)!;
    // overall avg = 400/3 ≈ 133.33; mon avg = 200 -> index ≈ 150
    expect(mon.index).toBeCloseTo(150, 5);
  });

  it("handles empty input without NaN", () => {
    const rows = weekdayIndex([]);
    expect(rows.every((r) => r.index === 0 && r.avg === 0)).toBe(true);
  });
});

describe("monthlySeasonalIndex", () => {
  it("pools the same calendar month across years", () => {
    const points = [
      { d: "2025-01-01", value: 100 },
      { d: "2026-01-01", value: 100 },
      { d: "2026-02-01", value: 100 },
    ];
    const rows = monthlySeasonalIndex(points);
    expect(rows).toHaveLength(12);
    const jan = rows.find((r) => r.month === 1)!;
    expect(jan.days).toBe(2);
    // Jan avg = 100, overall avg = 100 -> index 100
    expect(jan.index).toBeCloseTo(100, 5);
  });
});

describe("skuAbc", () => {
  const items = [
    { item_id: 1, name: "tail", value: 5 },
    { item_id: 2, name: "mid", value: 10 },
    { item_id: 3, name: "top", value: 70 },
    { item_id: 4, name: "second", value: 15 },
  ];

  it("sorts revenue-descending and computes cumulative share", () => {
    const rows = skuAbc(items);
    expect(rows[0].item_id).toBe(3);
    expect(rows[0].share).toBeCloseTo(70, 5);
    expect(rows[0].cumulativeShare).toBeCloseTo(70, 5);
  });

  it("classifies A/B/C at 80/95 cutoffs", () => {
    const rows = skuAbc(items);
    // sorted: 70 (A), 15 (A, cumBefore 70), 10 (B, cumBefore 85), 5 (C, cumBefore 95)
    const byId = Object.fromEntries(rows.map((r) => [r.item_id, r.cls]));
    expect(byId[3]).toBe("A");
    expect(byId[4]).toBe("A");
    expect(byId[2]).toBe("B");
    expect(byId[1]).toBe("C");
  });
});

describe("paretoConcentration", () => {
  it("computes top-N share and HHI", () => {
    const items = [
      { item_id: 1, name: "a", value: 50 },
      { item_id: 2, name: "b", value: 30 },
      { item_id: 3, name: "c", value: 20 },
    ];
    const p = paretoConcentration(items);
    expect(p.n).toBe(3);
    expect(p.top5Share).toBeCloseTo(100, 5);
    expect(p.hhi).toBeCloseTo((0.5 ** 2 + 0.3 ** 2 + 0.2 ** 2) * 10000, 5);
  });

  it("returns zeros for empty input", () => {
    const p = paretoConcentration([]);
    expect(p.hhi).toBe(0);
    expect(p.top5Share).toBe(0);
  });
});

describe("skuAbcVol", () => {
  const items = [
    { item_id: 1, name: "tail", quantity: 5 },
    { item_id: 2, name: "mid", quantity: 10 },
    { item_id: 3, name: "top", quantity: 70 },
    { item_id: 4, name: "second", quantity: 15 },
  ];

  it("classifies by quantity with the same 80/95 cutoffs", () => {
    const rows = skuAbcVol(items);
    expect(rows[0].item_id).toBe(3);
    const byId = Object.fromEntries(rows.map((r) => [r.item_id, r.cls]));
    expect(byId[3]).toBe("A");
    expect(byId[4]).toBe("A");
    expect(byId[2]).toBe("B");
    expect(byId[1]).toBe("C");
  });

  it("handles empty input", () => {
    expect(skuAbcVol([])).toEqual([]);
  });
});

describe("paretoConcentrationVol", () => {
  it("computes top-N share and HHI from quantity", () => {
    const items = [
      { item_id: 1, name: "a", quantity: 50 },
      { item_id: 2, name: "b", quantity: 30 },
      { item_id: 3, name: "c", quantity: 20 },
    ];
    const p = paretoConcentrationVol(items);
    expect(p.n).toBe(3);
    expect(p.top5Share).toBeCloseTo(100, 5);
    expect(p.hhi).toBeCloseTo((0.5 ** 2 + 0.3 ** 2 + 0.2 ** 2) * 10000, 5);
  });

  it("returns zeros for empty input", () => {
    const p = paretoConcentrationVol([]);
    expect(p.hhi).toBe(0);
    expect(p.top5Share).toBe(0);
  });
});

describe("skuByDistrict", () => {
  const items = [
    { item_id: 1, name: "a", value: 50 },
    { item_id: 2, name: "b", value: 30 },
    { item_id: 3, name: "c", value: 20 },
  ];

  it("falls back to a single National bucket with no mapping", () => {
    const rows = skuByDistrict(items, 58);
    expect(rows).toHaveLength(1);
    expect(rows[0].district).toBe("National");
    expect(rows[0].n).toBe(3);
    expect(rows[0].total).toBeCloseTo(100, 5);
  });

  it("splits items across the SBU's mapped districts", () => {
    const rows = skuByDistrict(items, 58, { 58: ["Dhaka", "Chattogram"] });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.district).sort()).toEqual(["Chattogram", "Dhaka"]);
    // Each district holds the full item set (best-effort attribution).
    for (const r of rows) {
      expect(r.n).toBe(3);
      expect(r.total).toBeCloseTo(100, 5);
    }
  });

  it("treats an empty district list as National", () => {
    const rows = skuByDistrict(items, 58, { 58: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].district).toBe("National");
  });
});

describe("skuByCategory", () => {
  const items = [
    { item_id: 1, name: "a", value: 50, quantity: 10, category: "Cement" },
    { item_id: 2, name: "b", value: 30, quantity: 20, category: "Cement" },
    { item_id: 3, name: "c", value: 20, quantity: 5, category: "Steel" },
    { item_id: 4, name: "d", value: 5, quantity: 1, category: null },
  ];

  it("groups by category and sorts by revenue descending", () => {
    const rows = skuByCategory(items);
    expect(rows.map((r) => r.category)).toEqual(["Cement", "Steel", "Uncategorised"]);
    expect(rows[0].revenue).toBeCloseTo(80, 5);
    expect(rows[0].n).toBe(2);
    expect(rows[0].quantity).toBeCloseTo(30, 5);
  });

  it("computes share of total revenue per category", () => {
    const rows = skuByCategory(items);
    const cement = rows.find((r) => r.category === "Cement")!;
    // total = 105; cement = 80 -> 76.19%
    expect(cement.share).toBeCloseTo((80 / 105) * 100, 5);
  });

  it("returns an empty list for no items", () => {
    expect(skuByCategory([])).toEqual([]);
  });
});

describe("skuUnitPrice", () => {
  it("returns BDT per unit (value Cr × 1e7 ÷ qty)", () => {
    const item = { item_id: 1, name: "bag", value: 0.00005, quantity: 1000 };
    // 0.00005 Cr = 500 BDT; /1000 units = 0.5 BDT/unit
    expect(skuUnitPrice(item)).toBeCloseTo(0.5, 5);
  });

  it("returns null when quantity is absent or zero", () => {
    expect(skuUnitPrice({ item_id: 1, name: "x", value: 10 })).toBeNull();
    expect(skuUnitPrice({ item_id: 1, name: "x", value: 10, quantity: 0 })).toBeNull();
  });
});

describe("skuBcg", () => {
  const items = [
    { item_id: 1, name: "cow", value: 80 },
    { item_id: 2, name: "star", value: 60 },
    { item_id: 3, name: "question", value: 30 },
    { item_id: 4, name: "dog", value: 20 },
  ];
  // prior values: cow flat, star +50%, question +100%, dog -50%
  const prior = new Map<number, number>([
    [1, 80],
    [2, 40],
    [3, 15],
    [4, 40],
  ]);

  it("assigns the four quadrants from growth and relative share", () => {
    const m = skuBcg(items, prior);
    const byId = new Map(m.rows.map((r) => [r.item_id, r.quadrant]));
    // relative share: cow 1.0 (high), star 0.75 (high, >= median 0.5625),
    // question 0.375 (low), dog 0.25 (low)
    expect(byId.get(2)).toBe("Star"); // high growth, high share
    expect(byId.get(1)).toBe("Cash Cow"); // low growth, high share
    expect(byId.get(3)).toBe("Question Mark"); // high growth, low share
    expect(byId.get(4)).toBe("Dog"); // low growth, low share
  });

  it("computes growth percentages against prior values", () => {
    const m = skuBcg(items, prior);
    const byId = new Map(m.rows.map((r) => [r.item_id, r]));
    expect(byId.get(2)!.growth).toBeCloseTo(50, 5);
    expect(byId.get(3)!.growth).toBeCloseTo(100, 5);
    expect(byId.get(4)!.growth).toBeCloseTo(-50, 5);
    expect(byId.get(1)!.growth).toBeCloseTo(0, 5);
  });

  it("treats a brand-new SKU (no prior) as high growth", () => {
    const m = skuBcg(items, prior);
    const newcomer = { item_id: 9, name: "new", value: 90 };
    const m2 = skuBcg([...items, newcomer], prior);
    const row = m2.rows.find((r) => r.item_id === 9)!;
    expect(row.growth).toBeNull();
    expect(row.growthPlot).toBe(100);
    expect(row.quadrant).toBe("Star");
    expect(m.rows.length).toBe(4);
  });

  it("degrades to flat growth when no prior data is loaded", () => {
    const m = skuBcg(items, new Map());
    expect(m.hasPriorData).toBe(false);
    const byId = new Map(m.rows.map((r) => [r.item_id, r]));
    expect(byId.get(1)!.growth).toBe(0);
    expect(byId.get(1)!.quadrant).toBe("Cash Cow");
  });

  it("ignores zero-value items", () => {
    const m = skuBcg([{ item_id: 1, name: "a", value: 10 }, { item_id: 2, name: "zero", value: 0 }], new Map());
    expect(m.rows.map((r) => r.item_id)).toEqual([1]);
  });
});

describe("forecastFiscal", () => {
  // 4 prior FYs (Jul 2022..Jun 2026): every month = 100 except Oct = 200.
  function priorYears(): DailyPoint[] {
    const pts: DailyPoint[] = [];
    for (const y of [2022, 2023, 2024, 2025]) {
      for (let m = 7; m <= 12; m++) pts.push({ d: `${y}-${pad(m)}-01`, value: 100 });
      for (let m = 1; m <= 6; m++) pts.push({ d: `${y + 1}-${pad(m)}-01`, value: 100 });
      pts.push({ d: `${y}-10-01`, value: 100 }); // Oct -> 200
    }
    return pts;
  }

  it("projects the rest of FY from the month after the current month", () => {
    const actuals = [
      { d: "2026-07-01", value: 100 },
      { d: "2026-08-01", value: 50 },
    ];
    const targets = [
      { period_month: "2026-07", value: 200 },
      { period_month: "2026-08", value: 100 },
      { period_month: "2026-10", value: 200 },
    ];
    const r = forecastFiscal([...priorYears(), ...actuals], targets, "2026-09-21");
    expect(r.basisMonths).toBe(2);
    expect(r.ytdActual).toBe(150);
    expect(r.ytdTarget).toBe(300);
    expect(r.achievement).toBeCloseTo(0.5, 5);
    expect(r.months).toHaveLength(12); // full FY Jul..Jun
    expect(r.forecastMonths).toHaveLength(9); // Oct..Jun
    expect(r.forecastMonths[0].month).toBe("2026-10");
    expect(r.forecastMonths[0].label).toBe("Oct 26");
    // Oct is a seasonal peak in the prior years; A = 0.5.
    expect(r.forecastMonths[0].seasonalIndex).toBeGreaterThan(100);
    expect(r.forecastMonths[0].forecast).toBeCloseTo(
      200 * 0.5 * (r.forecastMonths[0].seasonalIndex / 100),
      5,
    );
    expect(r.nextMonth?.month).toBe("2026-10");
    expect(r.seasonalBasisYears).toBe(4);
  });

  it("falls back to achievement 1 when there is no completed-month target", () => {
    const actuals = [{ d: "2026-07-01", value: 100 }];
    const targets = [{ period_month: "2026-10", value: 200 }];
    const r = forecastFiscal([...priorYears(), ...actuals], targets, "2026-09-21");
    expect(r.achievement).toBe(1);
    expect(r.forecastMonths[0].forecast).toBeCloseTo(
      200 * (r.forecastMonths[0].seasonalIndex / 100),
      5,
    );
  });

  it("returns an empty forecast when the FY is already complete", () => {
    const r = forecastFiscal([], [], "2027-06-15");
    expect(r.forecastMonths).toHaveLength(0);
    expect(r.nextMonth).toBeNull();
  });

  it("matches targets keyed by full date (YYYY-MM-DD)", () => {
    // PostgREST serializes the period_month `date` column as "YYYY-MM-DD";
    // the function must still key it to the month.
    const actuals = [
      { d: "2026-07-01", value: 100 },
      { d: "2026-08-01", value: 100 },
    ];
    const targets = [
      { period_month: "2026-07-01", value: 200 },
      { period_month: "2026-08-01", value: 200 },
      { period_month: "2026-10-01", value: 200 },
    ];
    const r = forecastFiscal([...priorYears(), ...actuals], targets, "2026-09-21");
    expect(r.ytdTarget).toBe(400);
    expect(r.achievement).toBeCloseTo(0.5, 5);
    const oct = r.forecastMonths.find((m) => m.month === "2026-10")!;
    expect(oct.target).toBe(200);
    expect(oct.forecast).toBeCloseTo(200 * 0.5 * (oct.seasonalIndex / 100), 5);
  });

  it("normalizes the seasonal index per-year so growth does not distort it", () => {
    // Oct is 2x an average month in every prior year -> Oct share = 2/13,
    // index = 2/13 * 12 * 100 ≈ 184.615, independent of each year's total size.
    const r = forecastFiscal(priorYears(), [], "2026-09-21");
    const oct = r.months.find((m) => m.month === "2026-10")!;
    expect(oct.seasonalIndex).toBeCloseTo(184.615, 2);
  });

  it("ignores negative month reversals so they cannot blow up seasonality", () => {
    // A year-end June reversal (e.g. -2100 Cr) must not turn the seasonal index
    // into a huge number that wrecks the forecast and the chart axis.
    const pts = priorYears();
    pts.push({ d: "2023-06-01", value: -2156 });
    pts.push({ d: "2024-06-01", value: -2106 });
    const r = forecastFiscal(pts, [], "2026-09-21");
    const oct = r.months.find((m) => m.month === "2026-10")!;
    expect(Number.isFinite(oct.seasonalIndex)).toBe(true);
    expect(oct.seasonalIndex).toBeGreaterThan(0);
    expect(oct.seasonalIndex).toBeLessThan(500);
  });

  it("projects the running month from historical pacing", () => {
    // Each prior Sep = 30 days × 10 = 300; through day 21 = 210 -> pacing 0.7.
    const prior: DailyPoint[] = [];
    for (const y of [2022, 2023, 2024, 2025]) {
      for (let d = 1; d <= 30; d++) prior.push({ d: `${y}-09-${pad(d)}`, value: 10 });
    }
    const current: DailyPoint[] = [];
    for (let d = 1; d <= 21; d++) current.push({ d: `2026-09-${pad(d)}`, value: 10 });
    const targets = [{ period_month: "2026-09", value: 400 }];
    const r = forecastFiscal([...prior, ...current], targets, "2026-09-21");
    const run = r.running!;
    expect(run.mtd).toBeCloseTo(210, 5);
    expect(run.pacing).toBeCloseTo(0.7, 5);
    expect(run.projected).toBeCloseTo(300, 5);
    expect(run.target).toBe(400);
    expect(run.achievementPct).toBeCloseTo(75, 5);
  });

  it("gives the current month a seasonal-engine forecast before sales post", () => {
    // Month just started: no MTD yet, so the running projection is 0. The
    // current month must still show a forecast (the user wants to see October's
    // expected figure even before any sales land).
    const prior: DailyPoint[] = [];
    for (const y of [2022, 2023, 2024, 2025]) {
      for (let d = 1; d <= 30; d++) prior.push({ d: `${y}-09-${pad(d)}`, value: 10 });
    }
    const targets = [{ period_month: "2026-09", value: 400 }];
    const r = forecastFiscal(prior, targets, "2026-09-21");
    const sep = r.months.find((m) => m.month === "2026-09")!;
    expect(sep.isForecast).toBe(false);
    expect(sep.actual).toBe(0);
    expect(sep.forecast).toBeGreaterThan(0); // seasonal engine, not the 0 running projection
    expect(sep.forecast).toBeCloseTo(400 * (sep.seasonalIndex / 100), 5);
    expect(r.currentMonth?.month).toBe("2026-09");
  });

  it("reconstructs the previous month's forecast and error", () => {
    // Jul: target 200 / actual 100 -> A_before = 0.5 used to forecast Aug.
    // Aug: target 100 / actual 80.
    const actuals = [
      { d: "2026-07-01", value: 100 },
      { d: "2026-08-01", value: 80 },
    ];
    const targets = [
      { period_month: "2026-07", value: 200 },
      { period_month: "2026-08", value: 100 },
    ];
    const r = forecastFiscal([...priorYears(), ...actuals], targets, "2026-09-21");
    const aug = r.months.find((m) => m.month === "2026-08")!;
    const expected = 100 * 0.5 * (aug.seasonalIndex / 100); // C_s = 1 (only 2 closed)
    expect(r.previousMonth?.month).toBe("2026-08");
    expect(r.previousMonth?.label).toBe("Aug 26");
    expect(r.previousMonth?.target).toBe(100);
    expect(r.previousMonth?.actual).toBe(80);
    expect(r.previousMonth?.forecast).toBeCloseTo(expected, 5);
    expect(r.previousMonth?.error).toBeCloseTo(80 - expected, 5);
    expect(r.previousMonth?.errorPct).toBeCloseTo(((80 - expected) / expected) * 100, 5);
    expect(aug.forecast).toBeCloseTo(expected, 5);
  });

  it("returns no previous month at the very start of the FY", () => {
    const r = forecastFiscal(priorYears(), [], "2026-07-15");
    expect(r.previousMonth).toBeNull();
  });
});

describe("calibrateForecast", () => {
  it("returns neutral factors with no samples (warm-up)", () => {
    const c = calibrateForecast([], [], "2026-07-21");
    expect(c.factorPacing).toBe(1);
    expect(c.factorSeasonal).toBe(1);
    expect(c.mape).toBeNull();
    expect(c.bias).toBeNull();
    expect(c.samplesPacing).toBe(0);
    expect(c.samplesSeasonal).toBe(0);
  });

  it("stays neutral on a perfectly periodic, on-target history", () => {
    const prior: DailyPoint[] = [];
    for (const y of [2022, 2023, 2024, 2025]) {
      for (let d = 1; d <= 30; d++) prior.push({ d: `${y}-09-${pad(d)}`, value: 10 });
    }
    const c = calibrateForecast(prior, [], "2026-09-21");
    expect(c.samplesPacing).toBe(4);
    expect(c.samplesSeasonal).toBe(0);
    expect(c.factorPacing).toBeCloseTo(1, 5);
    expect(c.factorSeasonal).toBe(1);
    expect(c.mape).toBeCloseTo(0, 5);
    expect(c.bias).toBeCloseTo(0, 5);
  });

  it("learns a pacing bias factor from prior-year backtests", () => {
    const prior: DailyPoint[] = [];
    // 3 years finish the month at 0.8 through/full by day 21; 1 year at 0.4.
    for (const y of [2022, 2023, 2024]) {
      for (let d = 1; d <= 21; d++) prior.push({ d: `${y}-09-${pad(d)}`, value: 24 });
      for (let d = 22; d <= 30; d++) prior.push({ d: `${y}-09-${pad(d)}`, value: 14 });
    }
    for (let d = 1; d <= 21; d++) prior.push({ d: `2025-09-${pad(d)}`, value: 2 });
    for (let d = 22; d <= 30; d++) prior.push({ d: `2025-09-${pad(d)}`, value: 7 });

    const c = calibrateForecast(prior, [], "2026-09-21");
    // 3 years project 1.2x (ratio 0.8333), 1 year projects 0.5x (ratio 2.0):
    // mean ratio = 1.125.
    expect(c.factorPacing).toBeCloseTo(1.125, 5);
    expect(c.mape).toBeCloseTo(27.5, 5);
    expect(c.bias).toBeCloseTo(81.375, 5);
  });

  it("keeps the seasonal factor at 1 until three months have closed", () => {
    const history: DailyPoint[] = [{ d: "2026-07-01", value: 90 }];
    const targets = [{ period_month: "2026-07", value: 100 }];
    const c = calibrateForecast(history, targets, "2026-08-21");
    expect(c.samplesSeasonal).toBe(1);
    expect(c.factorSeasonal).toBe(1);
  });
});
