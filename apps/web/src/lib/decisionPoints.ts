// Rule-based "Decision Points & Initiatives" engine for the Advanced Analysis
// tab. Pure and unit-testable: it takes a flat set of signals already computed
// elsewhere (scorecard metrics, FY forecast, SKU concentration + BCG) and emits
// directive, severity-badged recommendations. No data fetching here.

import type { BcgMatrix, BcgQuadrant } from "./advanced";
import { fmt, fmtPct } from "./format";

export type DecisionSeverity = "Action" | "Watch" | "Good";

export interface DecisionPoint {
  id: string;
  severity: DecisionSeverity;
  title: string;
  detail: string;
}

export interface DecisionInput {
  // Scorecard (per SBU) — null when unknown.
  mtdAchievementPct: number | null;
  momPct: number | null;
  yoyPct: number | null;
  mtdRevenue: number | null;
  monthlyTarget: number | null;
  projectedMonthEnd: number | null;
  // Forecast.
  fyForecast: number | null; // full-FY projection (closed actual + projection)
  fyTarget: number | null; // full-FY target
  forecastMapePct: number | null; // already in %
  basisMonths: number; // completed FY months
  // SKU.
  hhi: number | null;
  top5Share: number | null; // %
  bcg: BcgMatrix | null;
}

export interface DecisionConfig {
  mtdActionPct: number;
  mtdWatchPct: number;
  fyShortfallActionPct: number;
  hhiThreshold: number;
  top5Threshold: number;
  dogShareActionPct: number;
  mapeHighPct: number;
  basisMonthsLow: number;
  maxPoints: number;
}

export const DEFAULT_DECISION_CONFIG: DecisionConfig = {
  mtdActionPct: 85,
  mtdWatchPct: 100,
  fyShortfallActionPct: 5,
  hhiThreshold: 2500,
  top5Threshold: 90,
  dogShareActionPct: 40,
  mapeHighPct: 20,
  basisMonthsLow: 3,
  maxPoints: 5,
};

const SEV_ORDER: Record<DecisionSeverity, number> = { Action: 0, Watch: 1, Good: 2 };

function quadrantShares(bcg: BcgMatrix): Record<BcgQuadrant, number> {
  const out: Record<BcgQuadrant, number> = {
    Star: 0,
    "Question Mark": 0,
    "Cash Cow": 0,
    Dog: 0,
  };
  const total = bcg.rows.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return out;
  for (const r of bcg.rows) out[r.quadrant] += (r.value / total) * 100;
  return out;
}

export function buildDecisionPoints(
  input: DecisionInput,
  config: DecisionConfig = DEFAULT_DECISION_CONFIG,
): DecisionPoint[] {
  const pts: DecisionPoint[] = [];

  // A1 — monthly target (with run-rate/projection context).
  if (input.mtdAchievementPct != null) {
    const ach = input.mtdAchievementPct;
    if (ach < config.mtdActionPct) {
      const gap = (input.monthlyTarget ?? 0) - (input.mtdRevenue ?? 0);
      const proj = input.projectedMonthEnd;
      pts.push({
        id: "mtd-target",
        severity: "Action",
        title: "Below monthly target — run a mid-month push",
        detail:
          `MTD ${fmt(input.mtdRevenue)} Cr vs ${fmt(input.monthlyTarget)} Cr (${fmtPct(ach)})` +
          (proj != null ? ` · projected month-end ${fmt(proj)} Cr` : "") +
          (gap > 0 ? ` · close a ${fmt(gap)} Cr gap` : "") +
          ".",
      });
    } else if (ach < config.mtdWatchPct) {
      pts.push({
        id: "mtd-target",
        severity: "Watch",
        title: "Slightly below monthly target",
        detail: `MTD ${fmt(input.mtdRevenue)} Cr vs ${fmt(input.monthlyTarget)} Cr (${fmtPct(ach)}) — protect the remaining days.`,
      });
    } else {
      pts.push({
        id: "mtd-target",
        severity: "Good",
        title: "On track for the month",
        detail: `MTD ${fmt(input.mtdRevenue)} Cr vs ${fmt(input.monthlyTarget)} Cr target (${fmtPct(ach)}).`,
      });
    }
  }

  // A2 — full-year forecast vs target.
  if (input.fyForecast != null && input.fyTarget != null && input.fyTarget > 0) {
    const shortfall = input.fyForecast - input.fyTarget;
    const shortPct = (shortfall / input.fyTarget) * 100;
    if (shortPct < 0) {
      const sev = Math.abs(shortPct) >= config.fyShortfallActionPct ? "Action" : "Watch";
      pts.push({
        id: "fy-gap",
        severity: sev,
        title: "Full-year forecast shortfall",
        detail: `Forecast ${fmt(input.fyForecast)} Cr vs ${fmt(input.fyTarget)} Cr target — short ${fmt(Math.abs(shortfall))} Cr (${fmtPct(Math.abs(shortPct))}). Prioritise top SKUs & channels.`,
      });
    } else {
      pts.push({
        id: "fy-gap",
        severity: "Good",
        title: "Full-year forecast ahead of target",
        detail: `Forecast ${fmt(input.fyForecast)} Cr vs ${fmt(input.fyTarget)} Cr target (${fmtPct(shortPct)} ahead).`,
      });
    }
  }

  // B — growth momentum.
  if (input.momPct != null || input.yoyPct != null) {
    const mom = input.momPct;
    const yoy = input.yoyPct;
    if (mom != null && yoy != null && mom < 0 && yoy < 0) {
      pts.push({
        id: "momentum",
        severity: "Action",
        title: "Shrinking vs last month and last year",
        detail: `MoM ${fmt(mom, 1)}% and YoY ${fmt(yoy, 1)}% — review demand & lost accounts before pushing more stock.`,
      });
    } else if (yoy != null && yoy < 0) {
      pts.push({
        id: "momentum",
        severity: "Watch",
        title: "Year-over-year decline",
        detail: `YoY ${fmt(yoy, 1)}% — investigate lost accounts or channel shift.`,
      });
    } else if (mom != null && mom < 0) {
      pts.push({
        id: "momentum",
        severity: "Watch",
        title: "Month-over-month dip",
        detail: `MoM ${fmt(mom, 1)}% — confirm it is seasonal, not structural.`,
      });
    } else {
      const parts = [
        mom != null ? `MoM ${fmt(mom, 1)}%` : "",
        yoy != null ? `YoY ${fmt(yoy, 1)}%` : "",
      ].filter(Boolean);
      pts.push({
        id: "momentum",
        severity: "Good",
        title: "Growth momentum positive",
        detail: `${parts.join(" · ")}.`,
      });
    }
  }

  // D — concentration risk.
  if (input.hhi != null) {
    const concentrated =
      input.hhi >= config.hhiThreshold || (input.top5Share ?? 0) >= config.top5Threshold;
    if (concentrated) {
      pts.push({
        id: "concentration",
        severity: "Watch",
        title: "Revenue over-concentrated in top SKUs",
        detail: `HHI ${fmt(input.hhi, 0)} · top 5 = ${fmtPct(input.top5Share)} — de-risk by scaling B/C SKUs or adding new ones.`,
      });
    }
  }

  // D — BCG portfolio mix.
  if (input.bcg && input.bcg.rows.length > 0) {
    const shares = quadrantShares(input.bcg);
    if (shares.Dog >= config.dogShareActionPct) {
      pts.push({
        id: "bcg",
        severity: "Action",
        title: "Too much revenue in Dogs",
        detail: `${fmtPct(shares.Dog)} of SKU revenue sits in Dogs — review, divest or reposition these SKUs.`,
      });
    } else {
      pts.push({
        id: "bcg",
        severity: "Good",
        title: "SKU portfolio mix",
        detail: `Stars ${fmtPct(shares.Star)} · Question Marks ${fmtPct(shares["Question Mark"])} · Cash Cows ${fmtPct(shares["Cash Cow"])} · Dogs ${fmtPct(shares.Dog)}.`,
      });
    }
  }

  // E — forecast confidence.
  if (input.forecastMapePct != null || input.basisMonths > 0) {
    const highMape = input.forecastMapePct != null && input.forecastMapePct >= config.mapeHighPct;
    const fewMonths = input.basisMonths < config.basisMonthsLow;
    if (highMape || fewMonths) {
      const mape = input.forecastMapePct != null ? fmtPct(input.forecastMapePct, 1) : "—";
      pts.push({
        id: "confidence",
        severity: "Watch",
        title: "Forecast provisional",
        detail: `MAPE ${mape} · ${input.basisMonths} of 12 FY months closed — tighten once ≥${config.basisMonthsLow} months close.`,
      });
    }
  }

  pts.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return pts.slice(0, config.maxPoints);
}
