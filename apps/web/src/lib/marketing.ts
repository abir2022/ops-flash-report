// ---------------------------------------------------------------------------
// Marketing Analysis — pure ROMI / spend-efficiency engine.
//
// Turns the live scorecard (revenue) plus the marketing_spend actuals
// (GL 4210001) into per-SBU marketing efficiency: ROMI (revenue generated per
// 1 Cr of marketing spend), spend intensity (spend as % of revenue), and an
// efficiency verdict.
//
// The headline ROMI is now measured on *incremental (lift) revenue* — revenue
// this year minus the prior-year same-period baseline — so a business that is
// flat-to-down in total terms is not flattered by a big headline. Total-revenue
// ROMI is retained as a secondary reference (romiTotal).
//
// Side-effect free and unit-testable — same pattern as lib/analysis.ts /
// lib/biir.ts. Data provenance: revenue comes from v_scorecard (the live
// flash-report revenue definition), spend comes from v_marketing_spend.
// ---------------------------------------------------------------------------

import type { MarketingSpendRow, ScorecardRow } from "../types";
import { num } from "./format";
import { submittedExpenseForMonth, type EffectiveCampaign } from "./romi";

// ---- Derived row -----------------------------------------------------------

export type Efficiency = "efficient" | "moderate" | "inefficient" | "no-spend";

export interface MarketingRow {
  sbu_id: number;
  code: string;
  name: string | null;
  section: string | null;
  mtdSpend: number;
  momSpend: number;
  yoySpend: number;
  fyYtdSpend: number;
  mtdRevenue: number; // total MTD revenue (intensity/context)
  yoyRevenue: number; // prior-year same-period revenue (baseline)
  liftRevenue: number; // mtdRevenue - yoyRevenue (marketing-led incremental)
  fyYtdRevenue: number;
  romiMtd: number | null; // incremental-revenue ROMI (headline)
  romiTotal: number | null; // total-revenue ROMI (reference)
  romiFyYtd: number | null;
  intensityMtd: number | null; // spend as % of total revenue
  intensityFyYtd: number | null;
  spendMomPct: number | null;
  spendYoyPct: number | null;
  efficiency: Efficiency;
}

export interface MarketingSummary {
  totalMtdSpend: number;
  totalFyYtdSpend: number;
  totalMtdRevenue: number;
  totalLiftRevenue: number;
  totalFyYtdRevenue: number;
  romiMtd: number | null; // incremental (lift) ROMI
  romiTotal: number | null;
  romiFyYtd: number | null;
  intensityMtd: number | null;
  intensityFyYtd: number | null;
  inefficientCount: number;
  spenders: number; // SBUs with any MTD spend
}

// ---- Pure math -------------------------------------------------------------

// Revenue generated per 1 Cr of marketing spend. null when spend <= 0.
export function romi(spend: number, revenue: number): number | null {
  if (!(spend > 0)) return null;
  return revenue / spend;
}

// Marketing spend as a percentage of revenue. null when revenue <= 0.
export function spendIntensity(spend: number, revenue: number): number | null {
  if (!(revenue > 0)) return null;
  return (spend / revenue) * 100;
}

export function spendPctChange(current: number, prev: number): number | null {
  if (!(prev > 0)) return null;
  return ((current - prev) / prev) * 100;
}

// ---- Classification --------------------------------------------------------

// Efficiency is relative to the portfolio's median ROMI, because the "right"
// marketing multiple varies wildly by industry and scale (a consumer brand can
// return 100 Cr per Cr while an industrial line returns 10). Splitting at the
// median and half-median is scale-invariant and needs no hard-coded benchmark.
// romiValue here is the incremental (lift) ROMI: a negative lift means the
// business shrank vs last year despite the spend — unambiguously inefficient.
export function efficiencyOf(romiValue: number | null, spend: number, median: number): Efficiency {
  if (!(spend > 0)) return "no-spend";
  if (romiValue === null) return "inefficient"; // spent with no positive revenue
  if (romiValue < 0) return "inefficient"; // spent but revenue shrank vs last year
  if (!(median > 0)) return "moderate";
  if (romiValue >= median) return "efficient";
  if (romiValue >= median / 2) return "moderate";
  return "inefficient";
}

// ---- Assembly --------------------------------------------------------------

interface SbURevenue {
  mtd: number;
  fy: number;
  yoy: number;
  code: string;
  name: string | null;
  section: string | null;
}

// Aggregate scorecard revenue to SBU level (the scorecard can carry two rows
// for NXAB: asphalt/lubex — marketing spend is SBU-level, so sum channels).
// Also captures the SBU dimension (code/name/section) from the scorecard, which
// is authoritative even when the spend row is missing.
function aggregateRevenue(rows: ScorecardRow[]): Map<number, SbURevenue> {
  const out = new Map<number, SbURevenue>();
  for (const r of rows) {
    const cur = out.get(r.sbu_id) ?? {
      mtd: 0,
      fy: 0,
      yoy: 0,
      code: "",
      name: null,
      section: null,
    };
    cur.mtd += num(r.mtd_rev) ?? 0;
    cur.fy += num(r.fy_ytd_rev) ?? 0;
    cur.yoy += num(r.yoy_rev) ?? 0;
    if (!cur.code && r.code) cur.code = r.code;
    if (!cur.name && r.name) cur.name = r.name;
    if (!cur.section && r.section) cur.section = r.section;
    out.set(r.sbu_id, cur);
  }
  return out;
}

export function buildMarketingRows(
  scorecard: ScorecardRow[],
  spendRows: MarketingSpendRow[]
): MarketingRow[] {
  const rev = aggregateRevenue(scorecard);
  const spendBySbu = new Map<number, MarketingSpendRow>(
    spendRows.map((s) => [s.sbu_id, s])
  );

  // Union of SBU ids: report scope from the scorecard (authoritative) plus any
  // spend rows that may exist even if a snapshot row is missing.
  const ids = new Set<number>([...rev.keys(), ...spendBySbu.keys()]);

  const rows: MarketingRow[] = [];
  const medians: Array<{ sbu_id: number; r: number | null }> = [];

  for (const sbu_id of ids) {
    const s = spendBySbu.get(sbu_id);
    const r = rev.get(sbu_id);
    const mtdSpend = num(s?.mtd_spend) ?? 0;
    const fyYtdSpend = num(s?.fy_ytd_spend) ?? 0;
    const mtdRevenue = r?.mtd ?? 0;
    const yoyRevenue = r?.yoy ?? 0;
    const fyYtdRevenue = r?.fy ?? 0;
    const liftRevenue = mtdRevenue - yoyRevenue;

    const romiMtd = romi(mtdSpend, liftRevenue);
    const romiTotal = romi(mtdSpend, mtdRevenue);
    const romiFyYtd = romi(fyYtdSpend, fyYtdRevenue);

    medians.push({ sbu_id, r: romiMtd });

    rows.push({
      sbu_id,
      code: s?.code || r?.code || "",
      name: s?.name ?? r?.name ?? null,
      section: s?.section ?? r?.section ?? null,
      mtdSpend,
      momSpend: num(s?.mom_spend) ?? 0,
      yoySpend: num(s?.yoy_spend) ?? 0,
      fyYtdSpend,
      mtdRevenue,
      yoyRevenue,
      liftRevenue,
      fyYtdRevenue,
      romiMtd,
      romiTotal,
      romiFyYtd,
      intensityMtd: spendIntensity(mtdSpend, mtdRevenue),
      intensityFyYtd: spendIntensity(fyYtdSpend, fyYtdRevenue),
      spendMomPct: spendPctChange(mtdSpend, num(s?.mom_spend) ?? 0),
      spendYoyPct: spendPctChange(mtdSpend, num(s?.yoy_spend) ?? 0),
      efficiency: "no-spend",
    });
  }

  const median = medianOf(medians.map((m) => m.r).filter((v): v is number => v !== null));
  for (const row of rows) {
    row.efficiency = efficiencyOf(row.romiMtd, row.mtdSpend, median);
  }

  return rows.sort((a, b) => b.mtdSpend - a.mtdSpend);
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function summarizeMarketing(rows: MarketingRow[]): MarketingSummary {
  let mtdSpend = 0;
  let fySpend = 0;
  let mtdRev = 0;
  let liftRev = 0;
  let fyRev = 0;
  let inefficient = 0;
  let spenders = 0;

  for (const r of rows) {
    mtdSpend += r.mtdSpend;
    fySpend += r.fyYtdSpend;
    mtdRev += r.mtdRevenue;
    liftRev += r.liftRevenue;
    fyRev += r.fyYtdRevenue;
    if (r.mtdSpend > 0) spenders += 1;
    if (r.efficiency === "inefficient") inefficient += 1;
  }

  return {
    totalMtdSpend: mtdSpend,
    totalFyYtdSpend: fySpend,
    totalMtdRevenue: mtdRev,
    totalLiftRevenue: liftRev,
    totalFyYtdRevenue: fyRev,
    romiMtd: romi(mtdSpend, liftRev),
    romiTotal: romi(mtdSpend, mtdRev),
    romiFyYtd: romi(fySpend, fyRev),
    intensityMtd: spendIntensity(mtdSpend, mtdRev),
    intensityFyYtd: spendIntensity(fySpend, fyRev),
    inefficientCount: inefficient,
    spenders,
  };
}

// ---- Plain-language efficiency explanation ---------------------------------
//
// One sentence explaining *why* an SBU earned its efficiency label, grounded in
// the actual lift ROMI, intensity, and spend momentum. Kept as a pure function
// so the wording is unit-testable and never drifts from the classification.

export function efficiencyWhy(row: MarketingRow): string {
  if (row.mtdSpend <= 0) {
    return "No marketing spend recorded for this month.";
  }
  if (row.romiMtd === null) {
    return `${row.code} spent ${row.mtdSpend.toFixed(2)} Cr but has no positive revenue lift to show for it.`;
  }
  const lift = row.liftRevenue;
  const liftTxt =
    lift >= 0
      ? `revenue is up ${lift.toFixed(2)} Cr vs last year`
      : `revenue is down ${Math.abs(lift).toFixed(2)} Cr vs last year`;
  const romiTxt = `returning ${row.romiMtd.toFixed(1)} Cr of lift per 1 Cr spent`;
  switch (row.efficiency) {
    case "efficient":
      return `${row.code} is efficient — ${liftTxt}, ${romiTxt}, above the portfolio median.`;
    case "moderate":
      return `${row.code} is moderate — ${liftTxt}, ${romiTxt}, between half and full portfolio median.`;
    case "inefficient":
      return `${row.code} is inefficient — ${liftTxt}, ${romiTxt}, below half the portfolio median.`;
    default:
      return `${row.code} has no marketing spend this month.`;
  }
}

export function efficiencyHow(row: MarketingRow): string {
  if (row.efficiency === "no-spend") {
    return "No action needed — nothing was spent.";
  }
  if (row.efficiency === "efficient") {
    return "Protect the current mix and consider re-investing incremental spend here — it is the highest-returning SBU band.";
  }
  const intensity = row.intensityMtd;
  const rising = row.spendMomPct !== null && row.spendMomPct > 0;
  if (row.efficiency === "inefficient") {
    const base = "Shift spend toward higher-returning SBUs, or cut the lowest-return purpose line (see breakdown) before adding more.";
    return rising ? `Spend is also rising month-over-month (${row.spendMomPct!.toFixed(0)}%) — ${base}` : base;
  }
  const intTxt = intensity !== null ? ` Spend intensity is ${intensity.toFixed(2)}% of revenue.` : "";
  return `Close to the median — tighten the lowest-return purpose line or renegotiate rates before scaling.${intTxt}`;
}

// ---- Spend reconciliation (top-down GL vs bottom-up campaign submissions) ----

const CR = 10_000_000; // 1 Cr = 10 million BDT

export interface SpendReconciliationRow {
  sbu_id: number;
  code: string;
  name: string | null;
  topDown: number; // campaign-able GL 4210001 spend (Cr)
  bottomUp: number; // Σ officer-entered expense for the month (Cr)
  delta: number; // topDown - bottomUp (un-attributed spend, Cr)
  n_campaigns: number;
}

// Reconciles the two marketing-spend views: top-down campaign-able GL spend
// (MarketingRow.mtdSpend) against bottom-up officer-submitted campaign expense
// (romi_campaign.marketing_expense_total, same-month attribution). A positive
// delta is campaign-able spend with no campaign submission; a negative delta is
// officer-submitted expense exceeding the month's campaign-able GL pool.
export function buildSpendReconciliation(
  rows: MarketingRow[],
  effective: EffectiveCampaign[],
  reportDate: string
): SpendReconciliationRow[] {
  const submitted = submittedExpenseForMonth(effective, reportDate);
  const out: SpendReconciliationRow[] = rows.map((r) => {
    const s = submitted.get(r.sbu_id);
    const bottomUp = (s?.expense ?? 0) / CR;
    return {
      sbu_id: r.sbu_id,
      code: r.code,
      name: r.name,
      topDown: r.mtdSpend,
      bottomUp,
      delta: r.mtdSpend - bottomUp,
      n_campaigns: s?.n_campaigns ?? 0,
    };
  });
  return out.sort((a, b) => b.delta - a.delta);
}
