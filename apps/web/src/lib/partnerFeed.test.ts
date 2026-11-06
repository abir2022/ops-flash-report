import { describe, expect, it } from "vitest";
import {
  buildDailyTrend,
  departmentRollup,
  latestPeriod,
  officeScorecard,
  summarize,
} from "./partnerFeed";
import type { PartnerFeedDailyTotalRow, PartnerFeedOfficePlRow } from "../types";

const totals: PartnerFeedDailyTotalRow[] = [
  { report_date: "2026-09-01", amount: 100 },
  { report_date: "2026-09-02", amount: 200 },
];

function plRow(
  office_id: number,
  office_name: string,
  department_name: string,
  net_sales: number,
  cost: number,
): PartnerFeedOfficePlRow {
  return {
    period_month: "2026-09-01",
    office_id,
    office_name,
    department_name,
    quantity: 1,
    net_sales,
    cost,
    profit: net_sales - cost,
    margin: (net_sales - cost) / net_sales * 100,
  };
}

const pl: PartnerFeedOfficePlRow[] = [
  plRow(1, "Outlet A", "PHARMA", 600, 400),
  plRow(1, "Outlet A", "FOOD", 200, 150),
  plRow(2, "Outlet B", "PHARMA", 300, 200),
];

describe("buildDailyTrend", () => {
  it("sorts by date", () => {
    const t = buildDailyTrend([
      { report_date: "2026-09-02", amount: 200 },
      { report_date: "2026-09-01", amount: 100 },
    ]);
    expect(t.map((p) => p.d)).toEqual(["2026-09-01", "2026-09-02"]);
  });
});

describe("latestPeriod", () => {
  it("returns the max period_month", () => {
    expect(latestPeriod(pl)).toBe("2026-09-01");
  });
  it("returns empty when no rows", () => {
    expect(latestPeriod([])).toBe("");
  });
});

describe("departmentRollup", () => {
  it("aggregates net sales/cost/profit by department across offices", () => {
    const dept = departmentRollup(pl);
    expect(dept).toHaveLength(2);
    const pharma = dept.find((d) => d.department === "PHARMA")!;
    expect(pharma.netSales).toBe(900);
    expect(pharma.cost).toBe(600);
    expect(pharma.profit).toBe(300);
    expect(pharma.margin).toBeCloseTo(300 / 900 * 100, 5);
  });
  it("sorts by net sales desc", () => {
    const dept = departmentRollup(pl);
    expect(dept[0].department).toBe("PHARMA");
  });
});

describe("officeScorecard", () => {
  it("aggregates by office across departments", () => {
    const offices = officeScorecard(pl);
    expect(offices).toHaveLength(2);
    const a = offices.find((o) => o.officeId === 1)!;
    expect(a.netSales).toBe(800);
    expect(a.profit).toBe(250);
    expect(a.margin).toBeCloseTo(250 / 800 * 100, 5);
  });
  it("sorts by net sales desc", () => {
    const offices = officeScorecard(pl);
    expect(offices[0].officeId).toBe(1);
  });
});

describe("summarize", () => {
  it("computes MTD, latest day, avg, profit, margin and outlet count", () => {
    const s = summarize(totals, pl);
    expect(s.mtdSales).toBe(300);
    expect(s.todaySales).toBe(200);
    expect(s.avgDaily).toBe(150);
    expect(s.days).toBe(2);
    expect(s.monthLabel).toBe("Sep 2026");
    expect(s.mtdProfit).toBe(250 + 100); // A profit 250 + B profit 100
    expect(s.marginPct).toBeCloseTo(350 / 1100 * 100, 5);
    expect(s.outlets).toBe(2);
  });
});
