import type { ScorecardRow } from "../types";
import { num } from "./format";

// ---- Business parameters for cross-SBU ranking ----------------------------
// Only metrics that are comparable across SBUs are ranked here (revenue in Cr,
// growth/achievement in %). Volume is deliberately excluded because each SBU
// reports in its own UOM (MT, sqft, pcs…), so cross-SBU volume ranking would be
// apples-to-oranges; volume is shown per-SBU in the drill-down instead.
export type ParamKey =
  | "mtd_rev"
  | "fy_ytd_rev"
  | "contribution"
  | "mom_pct"
  | "yoy_pct"
  | "mtd_ach_pct"
  | "proj_rev";

export interface Parameter {
  key: ParamKey;
  label: string;
  unit: string;
  pct: boolean;
  accessor: (r: ScorecardRow, totalMtd: number) => number | null;
}

export function contributionPct(r: ScorecardRow, totalMtd: number): number | null {
  const v = num(r.mtd_rev);
  if (v === null || !totalMtd) return null;
  return (v / totalMtd) * 100;
}

export const PARAMETERS: Parameter[] = [
  { key: "mtd_rev", label: "Month-to-date revenue", unit: "Cr", pct: false, accessor: (r) => num(r.mtd_rev) },
  { key: "fy_ytd_rev", label: "Year-to-date revenue (FY)", unit: "Cr", pct: false, accessor: (r) => num(r.fy_ytd_rev) },
  { key: "contribution", label: "Share of total revenue", unit: "%", pct: true, accessor: contributionPct },
  { key: "mom_pct", label: "Month-over-month growth", unit: "%", pct: true, accessor: (r) => num(r.mom_pct) },
  { key: "yoy_pct", label: "Year-over-year growth", unit: "%", pct: true, accessor: (r) => num(r.yoy_pct) },
  { key: "mtd_ach_pct", label: "Target achievement", unit: "%", pct: true, accessor: (r) => num(r.mtd_ach_pct) },
  { key: "proj_rev", label: "Projected month-end", unit: "Cr", pct: false, accessor: (r) => num(r.proj_rev) },
];

export function parameter(key: ParamKey): Parameter {
  return PARAMETERS.find((p) => p.key === key)!;
}

// One color per quadrant (not per SBU) so the matrix color actually means
// something and is legend-able. Green = strong, amber = at risk, cyan = stable,
// red = weak.
export function quadrantColor(q: Quadrant): string {
  switch (q) {
    case "Star": return "#4ade80";
    case "Question Mark": return "#fbbf24";
    case "Cash Cow": return "#38bdf8";
    default: return "#f87171";
  }
}

// ---- Quadrant (BCG-style) segmentation ------------------------------------
export type Quadrant = "Star" | "Question Mark" | "Cash Cow" | "Dog";

export const QUADRANT_RECO: Record<Quadrant, string> = {
  Star: "Growing and on target — invest and scale.",
  "Question Mark": "Growing but below target — find and fix the bottleneck.",
  "Cash Cow": "On target but slowing — protect and stay lean.",
  Dog: "Shrinking and below target — review or exit.",
};

// Plain-language display names for each quadrant (the BCG terms are jargon).
export const QUADRANT_LABEL: Record<Quadrant, string> = {
  Star: "Strong",
  "Question Mark": "At risk",
  "Cash Cow": "Stable",
  Dog: "Weak",
};

// X-axis = MoM growth (0 split), Y-axis = achievement (100% split).
export function quadrantOf(r: ScorecardRow): Quadrant | null {
  const growth = num(r.mom_pct);
  const ach = num(r.mtd_ach_pct);
  if (growth === null || ach === null) return null;
  const growing = growth > 0;
  const aboveTarget = ach >= 100;
  if (growing && aboveTarget) return "Star";
  if (growing && !aboveTarget) return "Question Mark";
  if (!growing && aboveTarget) return "Cash Cow";
  return "Dog";
}

// ---- Composite health score (percentile-rank weighted) --------------------
interface HealthMetric {
  label: string;
  weight: number;
  accessor: (r: ScorecardRow) => number | null;
}

const HEALTH_METRICS: HealthMetric[] = [
  { label: "Achievement", weight: 0.4, accessor: (r) => num(r.mtd_ach_pct) },
  { label: "MoM Growth", weight: 0.25, accessor: (r) => num(r.mom_pct) },
  { label: "YoY Growth", weight: 0.15, accessor: (r) => num(r.yoy_pct) },
  { label: "Contribution", weight: 0.2, accessor: (r) => num(r.mtd_rev) },
];

export type Band = "Good" | "Watch" | "Risk";

export interface HealthRow {
  row: ScorecardRow;
  score: number;
  band: Band;
  parts: { label: string; pct: number }[];
}

function percentileRank(value: number, values: number[]): number {
  const n = values.length;
  if (n === 0) return 50;
  let less = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) less++;
    else if (v === value) equal++;
  }
  return ((less + equal / 2) / n) * 100;
}

export function computeHealth(rows: ScorecardRow[]): HealthRow[] {
  const perMetric = HEALTH_METRICS.map((m) =>
    rows.map((r) => m.accessor(r)).filter((v): v is number => v !== null)
  );

  const results: HealthRow[] = rows.map((r) => {
    let scoreSum = 0;
    let weightSum = 0;
    const parts: { label: string; pct: number }[] = [];
    HEALTH_METRICS.forEach((m, i) => {
      const v = m.accessor(r);
      if (v === null) return;
      const p = percentileRank(v, perMetric[i]);
      scoreSum += m.weight * p;
      weightSum += m.weight;
      parts.push({ label: m.label, pct: p });
    });
    const score = weightSum > 0 ? scoreSum / weightSum : 0;
    return {
      row: r,
      score,
      band: score >= 66 ? "Good" : score >= 33 ? "Watch" : "Risk",
      parts,
    };
  });

  return results.sort((a, b) => b.score - a.score);
}

// ---- Ranking ---------------------------------------------------------------
export interface RankedRow extends ScorecardRow {
  rank: number;
  value: number | null;
}

export function rankRows(rows: ScorecardRow[], key: ParamKey, totalMtd: number): RankedRow[] {
  const p = parameter(key);
  return rows
    .map((r) => ({ ...r, value: p.accessor(r, totalMtd) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return 0;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return b.value - a.value;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---- Target vs MTD progress ------------------------------------------------
// MTD revenue as a % of the FULL monthly target (not the prorated MTD target).
// NXAB (SBU 98) surfaces as two rows (asphalt/lubex), each with its own target.
export interface TargetProgressRow {
  sbu_id: number;
  code: string;
  name: string | null;
  channel: string;
  mtd: number;
  target: number;
  pct: number; // uncapped (can exceed 100)
  cappedPct: number; // 0..100, for the bar width
  over: boolean; // achieved >= 100% of the monthly target
}

export function buildTargetProgress(rows: ScorecardRow[]): TargetProgressRow[] {
  const out: TargetProgressRow[] = [];
  for (const r of rows) {
    const mtd = num(r.mtd_rev) ?? 0;
    const target = num(r.mo_tgt_rev);
    if (target === null || target <= 0) continue;
    const pct = (mtd / target) * 100;
    out.push({
      sbu_id: r.sbu_id,
      code: r.code,
      name: r.name,
      channel: r.channel,
      mtd,
      target,
      pct,
      cappedPct: Math.min(100, Math.max(0, pct)),
      over: pct >= 100,
    });
  }
  return out.sort((a, b) => b.pct - a.pct);
}
