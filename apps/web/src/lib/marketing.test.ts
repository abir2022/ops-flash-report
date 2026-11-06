import { describe, expect, it } from "vitest";
import {
  buildMarketingRows,
  buildSpendReconciliation,
  efficiencyHow,
  efficiencyOf,
  efficiencyWhy,
  romi,
  spendIntensity,
  spendPctChange,
  summarizeMarketing,
} from "./marketing";
import { computeEffective } from "./romi";
import type { MarketingSpendRow, RomiCampaignRow, ScorecardRow } from "../types";

function makeScorecardRow(overrides: Partial<ScorecardRow> = {}): ScorecardRow {
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

function makeSpendRow(overrides: Partial<MarketingSpendRow> = {}): MarketingSpendRow {
  return {
    sbu_id: 1,
    code: "TEST",
    name: "Test SBU",
    section: "Food",
    report_date: "2026-09-21",
    mtd_spend: 0,
    mom_spend: 0,
    yoy_spend: 0,
    fy_ytd_spend: 0,
    ...overrides,
  };
}

describe("romi", () => {
  it("returns revenue per 1 Cr of spend", () => {
    expect(romi(2, 100)).toBe(50);
  });
  it("returns null when spend is zero", () => {
    expect(romi(0, 100)).toBeNull();
    expect(romi(-1, 100)).toBeNull();
  });
});

describe("spendIntensity", () => {
  it("expresses spend as % of revenue", () => {
    expect(spendIntensity(10, 100)).toBe(10);
  });
  it("returns null when revenue is zero", () => {
    expect(spendIntensity(10, 0)).toBeNull();
  });
});

describe("spendPctChange", () => {
  it("computes change vs prior", () => {
    expect(spendPctChange(120, 100)).toBeCloseTo(20);
    expect(spendPctChange(100, 0)).toBeNull();
  });
});

describe("efficiencyOf", () => {
  it("labels no-spend correctly", () => {
    expect(efficiencyOf(null, 0, 50)).toBe("no-spend");
  });
  it("flags spent-with-no-revenue as inefficient", () => {
    expect(efficiencyOf(null, 10, 50)).toBe("inefficient");
  });
  it("splits by median and half-median", () => {
    expect(efficiencyOf(60, 10, 50)).toBe("efficient");
    expect(efficiencyOf(50, 10, 50)).toBe("efficient");
    expect(efficiencyOf(30, 10, 50)).toBe("moderate");
    expect(efficiencyOf(25, 10, 50)).toBe("moderate");
    expect(efficiencyOf(20, 10, 50)).toBe("inefficient");
  });
});

describe("buildMarketingRows", () => {
  it("joins scorecard revenue to spend by SBU", () => {
    const rows = buildMarketingRows(
      [makeScorecardRow({ sbu_id: 58, code: "NXCM", mtd_rev: 500, fy_ytd_rev: 4000 })],
      [makeSpendRow({ sbu_id: 58, code: "NXCM", mtd_spend: 5, fy_ytd_spend: 40 })]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].mtdSpend).toBe(5);
    // yoy=0 baseline -> lift = 500, so lift ROMI = 500/5 = 100
    expect(rows[0].liftRevenue).toBe(500);
    expect(rows[0].romiMtd).toBe(100);
    expect(rows[0].intensityMtd).toBe(1);
  });

  it("computes lift as mtd minus prior-year, and total ROMI separately", () => {
    const rows = buildMarketingRows(
      [makeScorecardRow({ sbu_id: 58, code: "NXCM", mtd_rev: 500, yoy_rev: 300 })],
      [makeSpendRow({ sbu_id: 58, code: "NXCM", mtd_spend: 10 })]
    );
    expect(rows[0].liftRevenue).toBe(200);
    expect(rows[0].romiMtd).toBe(20); // lift ROMI: 200 / 10
    expect(rows[0].romiTotal).toBe(50); // total ROMI: 500 / 10
  });

  it("falls back to scorecard name/code/section when spend row is missing", () => {
    const rows = buildMarketingRows(
      [makeScorecardRow({ sbu_id: 58, code: "NXCM", name: "NexaGroup Cement", section: "Cement", mtd_rev: 500 })],
      []
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("NXCM");
    expect(rows[0].name).toBe("NexaGroup Cement");
    expect(rows[0].section).toBe("Cement");
    expect(rows[0].mtdSpend).toBe(0);
    expect(rows[0].efficiency).toBe("no-spend");
  });

  it("sums NXAB channel revenue to a single SBU total", () => {
    const rows = buildMarketingRows(
      [
        makeScorecardRow({ sbu_id: 98, code: "NXAB", channel: "asphalt", mtd_rev: 30 }),
        makeScorecardRow({ sbu_id: 98, code: "NXAB", channel: "lubex", mtd_rev: 20 }),
      ],
      [makeSpendRow({ sbu_id: 98, code: "NXAB", mtd_spend: 10 })]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].mtdRevenue).toBe(50);
    expect(rows[0].romiMtd).toBe(5);
  });

  it("sorts by MTD spend descending", () => {
    const rows = buildMarketingRows(
      [
        makeScorecardRow({ sbu_id: 1, code: "A", mtd_rev: 100 }),
        makeScorecardRow({ sbu_id: 2, code: "B", mtd_rev: 100 }),
      ],
      [
        makeSpendRow({ sbu_id: 1, code: "A", mtd_spend: 1 }),
        makeSpendRow({ sbu_id: 2, code: "B", mtd_spend: 3 }),
      ]
    );
    expect(rows.map((r) => r.code)).toEqual(["B", "A"]);
  });
});

describe("efficiencyWhy / efficiencyHow", () => {
  it("explains a no-spend row", () => {
    const row = buildMarketingRows(
      [makeScorecardRow({ sbu_id: 1, code: "A" })],
      []
    )[0];
    expect(efficiencyWhy(row)).toContain("No marketing spend");
    expect(efficiencyHow(row)).toContain("No action needed");
  });

  it("flags negative lift in the why text", () => {
    const row = buildMarketingRows(
      [makeScorecardRow({ sbu_id: 1, code: "A", mtd_rev: 100, yoy_rev: 200 })],
      [makeSpendRow({ sbu_id: 1, code: "A", mtd_spend: 10 })]
    )[0];
    expect(row.liftRevenue).toBe(-100);
    expect(row.efficiency).toBe("inefficient");
    expect(efficiencyWhy(row)).toContain("down 100.00 Cr vs last year");
  });
});

describe("summarizeMarketing", () => {
  it("totals spend/revenue and portfolio ROMI", () => {
    const rows = buildMarketingRows(
      [
        makeScorecardRow({ sbu_id: 1, code: "A", mtd_rev: 200, fy_ytd_rev: 1000 }),
        makeScorecardRow({ sbu_id: 2, code: "B", mtd_rev: 300, fy_ytd_rev: 2000 }),
      ],
      [
        makeSpendRow({ sbu_id: 1, code: "A", mtd_spend: 10, fy_ytd_spend: 50 }),
        makeSpendRow({ sbu_id: 2, code: "B", mtd_spend: 40, fy_ytd_spend: 100 }),
      ]
    );
    const s = summarizeMarketing(rows);
    expect(s.totalMtdSpend).toBe(50);
    expect(s.totalMtdRevenue).toBe(500);
    expect(s.romiMtd).toBe(10);
    expect(s.intensityMtd).toBe(10);
    expect(s.spenders).toBe(2);
  });
});

function makeCampaign(overrides: Partial<RomiCampaignRow> = {}): RomiCampaignRow {
  return {
    id: 1,
    business_unit_id: 4,
    sbu_id: 58,
    code: "NXCM",
    sbu_name: "NexaGroup Cement",
    section: "Cement",
    campaign_name: "C",
    category: "NXAT",
    report_month: "2026-09",
    start_date: "2026-09-01",
    end_date: "2026-09-30",
    officer_name: null,
    officer_enroll: null,
    marketing_expense_total: 200_000_000,
    extra_fields: null,
    actual_rev: 0,
    organic_rev: 0,
    organic_rev_sply: 0,
    sply_rev: 0,
    gp_margin: 0,
    spend_pool_total: 0,
    n_months: 1,
    as_of: null,
    actual_rev_ov: null,
    organic_rev_ov: null,
    sply_rev_ov: null,
    gp_margin_ov: null,
    incr_rev_ov: null,
    actual_profit_ov: null,
    base_profit_ov: null,
    sply_profit_ov: null,
    incr_profit_ov: null,
    romi_top_ov: null,
    romi_bottom_ov: null,
    benchmark_top: null,
    benchmark_bottom: null,
    benchmark_note: null,
    ...overrides,
  };
}

describe("buildSpendReconciliation", () => {
  it("reconciles top-down GL spend against submitted campaign expense", () => {
    const rows = buildMarketingRows(
      [makeScorecardRow({ sbu_id: 58, code: "NXCM", mtd_rev: 500 })],
      [makeSpendRow({ sbu_id: 58, code: "NXCM", mtd_spend: 30 })]
    );
    const effective = [computeEffective(makeCampaign({ marketing_expense_total: 100_000_000 }))];
    const recon = buildSpendReconciliation(rows, effective, "2026-09-21");
    expect(recon).toHaveLength(1);
    expect(recon[0].topDown).toBe(30);
    expect(recon[0].bottomUp).toBeCloseTo(10);
    expect(recon[0].delta).toBeCloseTo(20);
    expect(recon[0].n_campaigns).toBe(1);
  });

  it("excludes campaigns not overlapping the report month", () => {
    const rows = buildMarketingRows(
      [makeScorecardRow({ sbu_id: 58, code: "NXCM" })],
      [makeSpendRow({ sbu_id: 58, code: "NXCM", mtd_spend: 30 })]
    );
    const effective = [computeEffective(makeCampaign({ start_date: "2026-07-01", end_date: "2026-07-31" }))];
    const recon = buildSpendReconciliation(rows, effective, "2026-09-21");
    expect(recon[0].bottomUp).toBe(0);
    expect(recon[0].delta).toBe(30);
  });

  it("sorts by un-attributed spend descending", () => {
    const rows = buildMarketingRows(
      [makeScorecardRow({ sbu_id: 1, code: "A" }), makeScorecardRow({ sbu_id: 2, code: "B" })],
      [
        makeSpendRow({ sbu_id: 1, code: "A", mtd_spend: 5 }),
        makeSpendRow({ sbu_id: 2, code: "B", mtd_spend: 50 }),
      ]
    );
    const recon = buildSpendReconciliation(rows, [], "2026-09-21");
    expect(recon.map((r) => r.code)).toEqual(["B", "A"]);
  });
});
