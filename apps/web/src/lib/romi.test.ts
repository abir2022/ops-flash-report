import { describe, expect, it } from "vitest";
import {
  buildBenchmarkRows,
  campaignsForSbu,
  computeEffective,
  investmentQuality,
  marketingLedTargetPct,
  marketingLedTargets,
  marketingLedTargetStr,
  rankCampaigns,
  sbuTotals,
  submittedExpenseForMonth,
} from "./romi";
import type { RomiCampaignRow, RomiSbuRow } from "../types";

function makeCampaign(overrides: Partial<RomiCampaignRow> = {}): RomiCampaignRow {
  return {
    id: 1,
    business_unit_id: 4,
    sbu_id: 58,
    code: "NXCM",
    sbu_name: "NexaGroup Cement",
    section: "Cement",
    campaign_name: "Test Campaign",
    category: "NXAT",
    report_month: "2026-08",
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    officer_name: "Siam",
    officer_enroll: "566325",
    marketing_expense_total: 100,
    extra_fields: null,
    actual_rev: 200,
    organic_rev: 150,
    organic_rev_sply: 140,
    sply_rev: 150,
    gp_margin: 0.3,
    spend_pool_total: 100,
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
    benchmark_top: 3,
    benchmark_bottom: 1,
    benchmark_note: null,
    ...overrides,
  };
}

function makeSbu(overrides: Partial<RomiSbuRow> = {}): RomiSbuRow {
  return {
    business_unit_id: 4,
    code: "NXCM",
    name: "NexaGroup Cement",
    gp_margin: 0.3,
    benchmark_top: 3,
    benchmark_bottom: 1,
    benchmark_note: null,
    mkt_led_target_min_cr: null,
    mkt_led_target_max_cr: null,
    is_active: true,
    sbu_id: 58,
    ...overrides,
  };
}

describe("computeEffective", () => {
  it("computes increment, profit and ROMI from base values", () => {
    const e = computeEffective(makeCampaign());
    // F=200, G=150 -> baseline 150, increment = 50
    expect(e.incr_rev).toBe(50);
    expect(e.incr_profit).toBeCloseTo(15); // 50 * 0.3
    // top-line = (50 - 100)/100 = -0.5
    expect(e.romi_top).toBeCloseTo(-0.5);
    expect(e.romi_bottom).toBeCloseTo((15 - 100) / 100);
  });

  it("prefers override over computed value", () => {
    const e = computeEffective(
      makeCampaign({ romi_top_ov: 5, incr_rev_ov: 999 })
    );
    expect(e.romi_top).toBe(5);
    expect(e.incr_rev).toBe(999);
  });

  it("falls back to SPLY baseline when organic is zero", () => {
    const e = computeEffective(makeCampaign({ organic_rev: 0, sply_rev: 180 }));
    expect(e.baseline_rev).toBe(180);
    expect(e.incr_rev).toBe(20); // 200 - 180
  });
});

describe("sbuTotals", () => {
  it("aggregates increments, profit and portfolio ROMI", () => {
    const a = computeEffective(makeCampaign({ id: 1, campaign_name: "A" }));
    const b = computeEffective(
      makeCampaign({ id: 2, campaign_name: "B", actual_rev: 300, organic_rev: 100, spend_pool_total: 50 })
    );
    const t = sbuTotals([a, b]);
    // a: incr 50, profit 15, spend 100
    // b: incr 200, profit 60, spend 50
    expect(t.total_incr_rev).toBeCloseTo(250);
    expect(t.total_incr_profit).toBeCloseTo(75);
    expect(t.total_marketing).toBe(150);
    expect(t.total_romi_top).toBeCloseTo((250 - 150) / 150);
  });

  it("returns null ROMI when no spend", () => {
    const a = computeEffective(makeCampaign({ spend_pool_total: 0 }));
    expect(sbuTotals([a]).total_romi_top).toBeNull();
  });
});

describe("investmentQuality", () => {
  it("strong when both top and bottom at/above mark", () => {
    expect(investmentQuality(5, 3, 3, 1)).toBe("strong");
  });
  it("mixed when only one passes", () => {
    expect(investmentQuality(5, 0.5, 3, 1)).toBe("mixed");
    expect(investmentQuality(2, 3, 3, 1)).toBe("mixed");
  });
  it("weak when both below mark", () => {
    expect(investmentQuality(0.2, 0.1, 3, 1)).toBe("weak");
  });
  it("no-mark when no benchmark set", () => {
    expect(investmentQuality(5, 3, null, null)).toBe("no-mark");
  });
  it("no-data when no campaign spend", () => {
    expect(investmentQuality(null, null, 3, 1)).toBe("no-data");
  });
  it("ignores a null half of the mark", () => {
    // only top mark set; bottom ignored
    expect(investmentQuality(5, 0.1, 3, null)).toBe("strong");
  });
});

describe("buildBenchmarkRows", () => {
  it("includes benchmarked SBUs with no campaigns", () => {
    const rows = buildBenchmarkRows([], [makeSbu()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].n_campaigns).toBe(0);
    expect(rows[0].quality).toBe("no-data");
  });

  it("attaches branch mark and grades quality", () => {
    const eff = computeEffective(makeCampaign({ actual_rev: 500, organic_rev: 100, spend_pool_total: 100 }));
    // incr 400, profit 120; top=(400-100)/100=3, bottom=(120-100)/100=0.2
    const rows = buildBenchmarkRows([eff], [makeSbu()]);
    expect(rows[0].total_romi_top).toBeCloseTo(3);
    expect(rows[0].quality).toBe("mixed"); // top 3 >= 3 (hit), bottom 0.2 < 1 (miss)
  });
});

describe("rankCampaigns", () => {
  it("returns best first and worst first", () => {
    const rows = [
      computeEffective(makeCampaign({ id: 1, campaign_name: "Low", actual_rev: 120, organic_rev: 100 })),
      computeEffective(makeCampaign({ id: 2, campaign_name: "High", actual_rev: 1000, organic_rev: 100 })),
      computeEffective(makeCampaign({ id: 3, campaign_name: "Mid", actual_rev: 500, organic_rev: 100 })),
    ];
    const { top, bottom } = rankCampaigns(rows, 10);
    expect(top[0].campaign_name).toBe("High");
    expect(bottom[0].campaign_name).toBe("Low");
  });

  it("skips rows with no spend", () => {
    const rows = [
      computeEffective(makeCampaign({ id: 1, campaign_name: "NoSpend", spend_pool_total: 0 })),
      computeEffective(makeCampaign({ id: 2, campaign_name: "Real", actual_rev: 500 })),
    ];
    const { top } = rankCampaigns(rows, 10);
    expect(top.map((r) => r.campaign_name)).toEqual(["Real"]);
  });
});

describe("campaignsForSbu", () => {
  it("filters by sbu_id and sorts newest end date first", () => {
    const rows = [
      computeEffective(makeCampaign({ id: 1, sbu_id: 58, campaign_name: "Older", end_date: "2026-07-31" })),
      computeEffective(makeCampaign({ id: 2, sbu_id: 58, campaign_name: "Newer", end_date: "2026-09-30" })),
      computeEffective(makeCampaign({ id: 3, sbu_id: 36, campaign_name: "Other SBU", end_date: "2026-09-30" })),
    ];
    const list = campaignsForSbu(rows, 58);
    expect(list.map((r) => r.campaign_name)).toEqual(["Newer", "Older"]);
  });

  it("falls back to business_unit_id when sbu_id is null", () => {
    const rows = [
      computeEffective(makeCampaign({ id: 1, sbu_id: null, business_unit_id: 4, campaign_name: "ByBu" })),
    ];
    expect(campaignsForSbu(rows, 4).map((r) => r.campaign_name)).toEqual(["ByBu"]);
  });
});

describe("submittedExpenseForMonth", () => {
  it("includes campaigns overlapping the report month", () => {
    const eff = computeEffective(
      makeCampaign({
        start_date: "2026-09-01",
        end_date: "2026-09-30",
        marketing_expense_total: 250,
      })
    );
    const m = submittedExpenseForMonth([eff], "2026-09-27");
    expect(m.get(58)).toEqual({ expense: 250, n_campaigns: 1 });
  });

  it("excludes campaigns outside the report month", () => {
    const eff = computeEffective(makeCampaign()); // Aug 1–31
    expect(submittedExpenseForMonth([eff], "2026-09-27").size).toBe(0);
  });

  it("falls back to report_month when dates are missing", () => {
    const eff = computeEffective(
      makeCampaign({
        start_date: null,
        end_date: null,
        report_month: "2026-09",
        marketing_expense_total: 80,
      })
    );
    const m = submittedExpenseForMonth([eff], "2026-09-10");
    expect(m.get(58)?.expense).toBe(80);
  });

  it("keys by business_unit_id when sbu_id is null", () => {
    const eff = computeEffective(
      makeCampaign({
        sbu_id: null,
        start_date: "2026-09-01",
        end_date: "2026-09-30",
        marketing_expense_total: 40,
      })
    );
    const m = submittedExpenseForMonth([eff], "2026-09-15");
    expect(m.get(4)?.expense).toBe(40);
  });

  it("sums multiple campaigns for the same SBU", () => {
    const a = computeEffective(
      makeCampaign({ id: 1, campaign_name: "A", start_date: "2026-09-01", end_date: "2026-09-30", marketing_expense_total: 100 })
    );
    const b = computeEffective(
      makeCampaign({ id: 2, campaign_name: "B", start_date: "2026-09-01", end_date: "2026-09-30", marketing_expense_total: 50 })
    );
    const m = submittedExpenseForMonth([a, b], "2026-09-15");
    expect(m.get(58)).toEqual({ expense: 150, n_campaigns: 2 });
  });
});

describe("marketingLedTargets", () => {
  it("keys targets by flash sbu_id and skips rows with no target", () => {
    const map = marketingLedTargets([
      makeSbu({ sbu_id: 58, mkt_led_target_min_cr: 410, mkt_led_target_max_cr: 410 }),
      makeSbu({ sbu_id: 69, mkt_led_target_min_cr: 50, mkt_led_target_max_cr: 80 }),
      makeSbu({ sbu_id: 102, mkt_led_target_min_cr: null, mkt_led_target_max_cr: null }),
      makeSbu({ sbu_id: null, mkt_led_target_min_cr: 5, mkt_led_target_max_cr: 5 }),
    ]);
    expect(map.size).toBe(2);
    expect(map.get(58)).toEqual({ minCr: 410, maxCr: 410 });
    expect(map.get(69)).toEqual({ minCr: 50, maxCr: 80 });
  });

  it("formats a single value and a range", () => {
    expect(marketingLedTargetStr({ minCr: 410, maxCr: 410 })).toBe("410");
    expect(marketingLedTargetStr({ minCr: 50, maxCr: 80 })).toBe("50–80");
    expect(marketingLedTargetStr({ minCr: 17.82, maxCr: 17.82 })).toBe("17.82");
  });

  it("computes led revenue as % of the target midpoint", () => {
    expect(marketingLedTargetPct({ minCr: 50, maxCr: 80 }, 32.5)).toBeCloseTo(50);
    expect(marketingLedTargetPct({ minCr: 410, maxCr: 410 }, 410)).toBeCloseTo(100);
    expect(marketingLedTargetPct({ minCr: 0, maxCr: 0 }, 10)).toBeNull();
  });
});
