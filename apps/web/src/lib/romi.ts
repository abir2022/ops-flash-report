// ---------------------------------------------------------------------------
// ROMI Analysis — pure effective-value engine (a port of the "Automated ROMI
// for all SBU" project's romi_logic.py).
//
// Effective value = override if set, else computed/derived. Side-effect free
// and unit-testable, mirroring lib/marketing.ts / lib/analysis.ts.
// ---------------------------------------------------------------------------

import type { RomiCampaignRow, RomiSbuRow } from "../types";
import { num } from "./format";

// Marketing campaign categories (source: Automated ROMI project,
// officer_portal.py CATEGORIES). Single source of truth for the officer
// survey form, the admin campaign editor, and any category filter.
export const CAMPAIGN_CATEGORIES = [
  "NXAT",
  "Digital",
  "BTL",
  "Outdoor",
  "Gift & Printing",
  "Research",
  "Trade Incentive Offer",
  "Other",
] as const;

export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number];

// ---- Effective-value helpers (mirror romi_logic._ov / _romi / _baseline) --

function ov(override: number | null, base: number): number {
  return override !== null && override !== undefined ? override : base;
}

// Top/bottom-line ROMI: (increment - expense) / expense.
function romiRatio(increment: number, expense: number): number {
  if (!expense) return 0;
  return (increment - expense) / expense;
}

function baseline(organicRev: number, splyRev: number): number {
  if (organicRev > 0) return organicRev;
  return splyRev || 0;
}

// ---- Effective campaign row -------------------------------------------------

export interface EffectiveCampaign {
  business_unit_id: number;
  sbu_id: number | null;
  code: string | null;
  sbu_name: string | null;
  campaign_name: string;
  category: string | null;
  report_month: string | null;
  start_date: string | null;
  end_date: string | null;
  actual_rev: number;
  organic_rev: number;
  sply_rev: number;
  baseline_rev: number;
  incr_rev: number;
  gp_margin: number;
  actual_profit: number;
  base_profit: number;
  sply_profit: number;
  incr_profit: number;
  marketing_expense: number; // O = GL campaign-able spend in reporting month
  officer_expense_total: number; // officer-entered full-campaign expense
  romi_top: number;
  romi_bottom: number;
  officer_name: string | null;
  officer_enroll: string | null;
  extra_fields: Record<string, unknown> | null;
  benchmark_top: number | null;
  benchmark_bottom: number | null;
}

export function computeEffective(row: RomiCampaignRow): EffectiveCampaign {
  const f = ov(row.actual_rev_ov, num(row.actual_rev) ?? 0);
  const g = ov(row.organic_rev_ov, num(row.organic_rev) ?? 0);
  const h = ov(row.sply_rev_ov, num(row.sply_rev) ?? 0);
  const j = ov(row.gp_margin_ov, num(row.gp_margin) ?? 0);
  const o = num(row.spend_pool_total) ?? 0;
  const officerExpense = num(row.marketing_expense_total) ?? 0;

  const b = baseline(g, h);
  const i = ov(row.incr_rev_ov, f - b);
  const k = ov(row.actual_profit_ov, f * j);
  const l = ov(row.base_profit_ov, g * j);
  const m = ov(row.sply_profit_ov, h * j);
  const n = ov(row.incr_profit_ov, i * j);
  const p = ov(row.romi_top_ov, romiRatio(i, o));
  const r = ov(row.romi_bottom_ov, romiRatio(n, o));

  return {
    business_unit_id: row.business_unit_id,
    sbu_id: row.sbu_id,
    code: row.code,
    sbu_name: row.sbu_name,
    campaign_name: row.campaign_name,
    category: row.category,
    report_month: row.report_month,
    start_date: row.start_date,
    end_date: row.end_date,
    actual_rev: f,
    organic_rev: g,
    sply_rev: h,
    baseline_rev: b,
    incr_rev: i,
    gp_margin: j,
    actual_profit: k,
    base_profit: l,
    sply_profit: m,
    incr_profit: n,
    marketing_expense: o,
    officer_expense_total: officerExpense,
    romi_top: p,
    romi_bottom: r,
    officer_name: row.officer_name,
    officer_enroll: row.officer_enroll,
    extra_fields: row.extra_fields,
    benchmark_top: num(row.benchmark_top),
    benchmark_bottom: num(row.benchmark_bottom),
  };
}

// ---- SBU totals -------------------------------------------------------------

export interface SbuRomiTotals {
  n_campaigns: number;
  total_incr_rev: number;
  total_incr_profit: number;
  total_marketing: number;
  total_actual_rev: number;
  total_romi_top: number | null;
  total_romi_bottom: number | null;
}

export function sbuTotals(rows: EffectiveCampaign[]): SbuRomiTotals {
  const totalI = rows.reduce((a, r) => a + (r.incr_rev || 0), 0);
  const totalN = rows.reduce((a, r) => a + (r.incr_profit || 0), 0);
  const totalO = rows.reduce((a, r) => a + (r.marketing_expense || 0), 0);
  const totalRev = rows.reduce((a, r) => a + (r.actual_rev || 0), 0);
  return {
    n_campaigns: rows.length,
    total_incr_rev: totalI,
    total_incr_profit: totalN,
    total_marketing: totalO,
    total_actual_rev: totalRev,
    total_romi_top: totalO ? (totalI - totalO) / totalO : null,
    total_romi_bottom: totalO ? (totalN - totalO) / totalO : null,
  };
}

// ---- Branch-mark comparison -------------------------------------------------

export type InvestmentQuality = "strong" | "mixed" | "weak" | "no-data" | "no-mark";

export interface BenchmarkRow {
  business_unit_id: number;
  code: string;
  name: string | null;
  n_campaigns: number;
  total_romi_top: number | null;
  total_romi_bottom: number | null;
  benchmark_top: number | null;
  benchmark_bottom: number | null;
  benchmark_note: string;
  quality: InvestmentQuality;
}

// 3-tier "Marketing Investment Quality": compare the SBU's top- and bottom-line
// ROMI against the branch mark. Strong = both at/above mark; Mixed = one of two;
// Weak = both below; no-data = no campaign spend; no-mark = no benchmark set.
export function investmentQuality(
  totalTop: number | null,
  totalBottom: number | null,
  markTop: number | null,
  markBottom: number | null
): InvestmentQuality {
  const hasMark = markTop !== null || markBottom !== null;
  const hasData = totalTop !== null || totalBottom !== null;
  if (!hasMark) return "no-mark";
  if (!hasData) return "no-data";

  const topHit =
    markTop === null || (totalTop !== null && totalTop >= markTop);
  const bottomHit =
    markBottom === null || (totalBottom !== null && totalBottom >= markBottom);

  if (topHit && bottomHit) return "strong";
  if (topHit || bottomHit) return "mixed";
  return "weak";
}

export function buildBenchmarkRows(
  effective: EffectiveCampaign[],
  sbus: RomiSbuRow[]
): BenchmarkRow[] {
  const sbuById = new Map<number, RomiSbuRow>(
    sbus.map((s) => [Number(s.business_unit_id), s])
  );

  const byBu = new Map<number, EffectiveCampaign[]>();
  for (const r of effective) {
    const list = byBu.get(r.business_unit_id) ?? [];
    list.push(r);
    byBu.set(r.business_unit_id, list);
  }

  const out: BenchmarkRow[] = [];
  const seen = new Set<number>();
  for (const [buId, rows] of byBu) {
    const s = sbuById.get(buId);
    const t = sbuTotals(rows);
    seen.add(buId);
    out.push(makeBenchmarkRow(buId, s, t));
  }

  // Include benchmarked SBUs with no campaign data yet (full branch-mark list).
  for (const s of sbus) {
    const buId = Number(s.business_unit_id);
    if (seen.has(buId)) continue;
    if (s.benchmark_top === null && s.benchmark_bottom === null) continue;
    out.push(makeBenchmarkRow(buId, s, {
      n_campaigns: 0,
      total_incr_rev: 0,
      total_incr_profit: 0,
      total_marketing: 0,
      total_actual_rev: 0,
      total_romi_top: null,
      total_romi_bottom: null,
    }));
  }

  out.sort((a, b) => {
    const av = a.total_romi_top ?? -Infinity;
    const bv = b.total_romi_top ?? -Infinity;
    if (av !== bv) return bv - av;
    return a.code.localeCompare(b.code);
  });
  return out;
}

function makeBenchmarkRow(
  buId: number,
  s: RomiSbuRow | undefined,
  t: SbuRomiTotals
): BenchmarkRow {
  return {
    business_unit_id: buId,
    code: s?.code ?? String(buId),
    name: s?.name ?? null,
    n_campaigns: t.n_campaigns,
    total_romi_top: t.total_romi_top,
    total_romi_bottom: t.total_romi_bottom,
    benchmark_top: s?.benchmark_top ?? null,
    benchmark_bottom: s?.benchmark_bottom ?? null,
    benchmark_note: s?.benchmark_note ?? "",
    quality: investmentQuality(
      t.total_romi_top,
      t.total_romi_bottom,
      s?.benchmark_top ?? null,
      s?.benchmark_bottom ?? null
    ),
  };
}

// ---- Campaign ranking -------------------------------------------------------

// (top, bottom) campaign lists sorted by top-line ROMI, skipping rows with no
// spend or no computable ROMI.
export function rankCampaigns(
  effective: EffectiveCampaign[],
  n = 10
): { top: EffectiveCampaign[]; bottom: EffectiveCampaign[] } {
  const valid = effective.filter(
    (r) => (r.marketing_expense || 0) > 0 && r.romi_top !== null
  );
  const sorted = [...valid].sort((a, b) => (b.romi_top || 0) - (a.romi_top || 0));
  const top = sorted.slice(0, n);
  const bottom = sorted.slice(-n).reverse();
  return { top, bottom };
}

// ---- Campaign rollup by SBU (Layer-1 "campaign analysis" subsection) --------

export interface SbuCampaignRollup {
  sbu_id: number;
  code: string;
  name: string | null;
  n_campaigns: number;
  expense: number; // officer-entered total campaign expense (raw BDT)
  total_incr_rev: number; // Σ (F - G) marketing-led revenue across campaigns (raw BDT)
  total_marketing: number; // Σ campaign-able GL spend pool (raw BDT)
  top_romi: number | null; // best campaign top-line ROMI
  bottom_romi: number | null; // worst campaign bottom-line ROMI
  benchmark_top: number | null;
  benchmark_bottom: number | null;
  quality: InvestmentQuality;
}

const NO_MARK: SbuCampaignRollup = {
  sbu_id: -1,
  code: "",
  name: null,
  n_campaigns: 0,
  expense: 0,
  total_incr_rev: 0,
  total_marketing: 0,
  top_romi: null,
  bottom_romi: null,
  benchmark_top: null,
  benchmark_bottom: null,
  quality: "no-mark",
};

// Group effective campaigns by flash sbu_id and roll up: total officer-entered
// expense, best top-line ROMI, worst bottom-line ROMI, and the 3-tier investment
// quality versus the branch mark. Benchmark is read from the first row of the
// group (all rows of a business unit carry the same romi_sbu benchmark).
export function rollupBySbu(effective: EffectiveCampaign[]): Map<number, SbuCampaignRollup> {
  const out = new Map<number, SbuCampaignRollup>();
  const bySbu = new Map<number, EffectiveCampaign[]>();
  for (const r of effective) {
    const key = r.sbu_id ?? r.business_unit_id;
    const list = bySbu.get(key) ?? [];
    list.push(r);
    bySbu.set(key, list);
  }

  for (const [sbuId, rows] of bySbu) {
    const spenders = rows.filter((r) => (r.marketing_expense || 0) > 0);
    const top = spenders.length
      ? Math.max(...spenders.map((r) => r.romi_top || 0))
      : null;
    const bottom = spenders.length
      ? Math.min(...spenders.map((r) => r.romi_bottom || 0))
      : null;
    const expense = rows.reduce((a, r) => a + (r.officer_expense_total || 0), 0);
    const total_incr_rev = rows.reduce((a, r) => a + (r.incr_rev || 0), 0);
    const total_marketing = rows.reduce((a, r) => a + (r.marketing_expense || 0), 0);
    const first = rows[0];
    out.set(sbuId, {
      sbu_id: sbuId,
      code: first.code ?? String(sbuId),
      name: first.sbu_name,
      n_campaigns: rows.length,
      expense,
      total_incr_rev,
      total_marketing,
      top_romi: top,
      bottom_romi: bottom,
      benchmark_top: first.benchmark_top,
      benchmark_bottom: first.benchmark_bottom,
      quality: investmentQuality(
        top,
        bottom,
        first.benchmark_top,
        first.benchmark_bottom
      ),
    });
  }
  return out;
}

export function rollupForSbu(
  rollup: Map<number, SbuCampaignRollup>,
  sbuId: number
): SbuCampaignRollup {
  return rollup.get(sbuId) ?? NO_MARK;
}

// Per-campaign list for a single flash SBU, newest first. Each row keeps its
// own top- and bottom-line ROMI (not an aggregate) so the Layer-1 expander can
// show campaign-wise ROMI alongside the SBU-level spend-efficiency numbers.
export function campaignsForSbu(
  effective: EffectiveCampaign[],
  sbuId: number
): EffectiveCampaign[] {
  return effective
    .filter((r) => (r.sbu_id ?? r.business_unit_id) === sbuId)
    .sort((a, b) => {
      const aEnd = a.end_date ?? "";
      const bEnd = b.end_date ?? "";
      if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
      return (b.campaign_name ?? "").localeCompare(a.campaign_name ?? "");
    });
}

// ---- Spend reconciliation (top-down vs bottom-up) ---------------------------

export interface SubmittedExpense {
  expense: number; // officer-entered campaign expense (raw BDT)
  n_campaigns: number;
}

// "YYYY-MM" key from an ISO date/month string.
function monthKey(d: string): string {
  return d.slice(0, 7);
}

// Inclusive calendar-month bounds for a "YYYY-MM" key ("YYYY-MM-01" .. last day).
function monthBounds(mk: string): [string, string] {
  const y = Number(mk.slice(0, 4));
  const m = Number(mk.slice(5, 7));
  const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
  return [`${mk}-01`, `${mk}-${String(lastDay).padStart(2, "0")}`];
}

// Same-month attribution (v1): a campaign is attributed to a month if its
// [start_date, end_date] interval overlaps the calendar month. A campaign with
// no dates falls back to its report_month matching the target month.
function overlapsMonth(
  r: EffectiveCampaign,
  mk: string,
  monthStart: string,
  monthEnd: string
): boolean {
  const start = r.start_date ?? null;
  const end = r.end_date ?? null;
  if (start || end) {
    const s = start ?? monthStart;
    const e = end ?? monthEnd;
    return s <= monthEnd && e >= monthStart;
  }
  return r.report_month !== null && monthKey(r.report_month) === mk;
}

// ---- Marketing-led revenue targets (FY26-27) ---------------------------------
//
// The Marketing team's annual "marketing-led revenue" targets (in Crore), stored
// on romi_sbu. Several are ranges, so we keep a min and a max; single values
// carry min == max. Keyed by flash sbu_id (via v_romi_sbu.sbu_id).

export interface MarketingLedTarget {
  minCr: number;
  maxCr: number;
}

export function marketingLedTargets(sbus: RomiSbuRow[]): Map<number, MarketingLedTarget> {
  const out = new Map<number, MarketingLedTarget>();
  for (const s of sbus) {
    if (s.sbu_id === null || s.sbu_id === undefined) continue;
    const min = num(s.mkt_led_target_min_cr);
    const max = num(s.mkt_led_target_max_cr);
    if (min === null && max === null) continue;
    out.set(Number(s.sbu_id), {
      minCr: min ?? 0,
      maxCr: max ?? 0,
    });
  }
  return out;
}

// "410" for a single value, "50–80" for a range.
export function marketingLedTargetStr(t: MarketingLedTarget): string {
  const f = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (t.minCr === t.maxCr) return f(t.minCr);
  return `${f(t.minCr)}–${f(t.maxCr)}`;
}

// Marketing-led revenue achieved (Cr) as a % of the annual target midpoint.
export function marketingLedTargetPct(
  t: MarketingLedTarget,
  ledRevCr: number
): number | null {
  const mid = (t.minCr + t.maxCr) / 2;
  if (!(mid > 0)) return null;
  return (ledRevCr / mid) * 100;
}

// Per-SBU officer-entered campaign expense for the report month, keyed by flash
// sbu_id (falling back to business_unit_id for unmapped campaigns). This is the
// "bottom-up" half of the Marketing tab's spend reconciliation.
export function submittedExpenseForMonth(
  effective: EffectiveCampaign[],
  reportDate: string
): Map<number, SubmittedExpense> {
  const mk = monthKey(reportDate);
  const [monthStart, monthEnd] = monthBounds(mk);
  const out = new Map<number, SubmittedExpense>();
  for (const r of effective) {
    if (!overlapsMonth(r, mk, monthStart, monthEnd)) continue;
    const key = r.sbu_id ?? r.business_unit_id;
    const cur = out.get(key) ?? { expense: 0, n_campaigns: 0 };
    cur.expense += r.officer_expense_total || 0;
    cur.n_campaigns += 1;
    out.set(key, cur);
  }
  return out;
}
