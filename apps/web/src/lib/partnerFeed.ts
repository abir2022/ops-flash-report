// ---------------------------------------------------------------------------
// Partner feed (demo retail-chain source) — pure aggregation engine.
//
// Turns the portal-sourced tables (partner_feed_daily_total, partner_feed_office_pl)
// into the PartnerFeed flash report: daily sales trend, department P&L rollup,
// and a per-outlet scorecard. Money is raw BDT (Tk); the UI converts to Cr
// (1 Cr = 10 million BDT) where that is clearer.
//
// Side-effect free and unit-testable — same pattern as lib/analysis.ts /
// lib/marketing.ts.
// ---------------------------------------------------------------------------

import type { PartnerFeedDailyTotalRow, PartnerFeedOfficePlRow } from "../types";
import { num } from "./format";

export const CR = 10_000_000; // 1 Crore (Cr) = 10 million BDT

export interface DailyPoint {
  d: string;
  value: number;
}

export interface DepartmentRollup {
  department: string;
  netSales: number;
  cost: number;
  profit: number;
  margin: number | null; // percent
}

export interface OfficeScorecardRow {
  officeId: number;
  officeName: string;
  quantity: number;
  netSales: number;
  cost: number;
  profit: number;
  margin: number | null; // percent
}

export interface PartnerFeedSummary {
  monthLabel: string; // "Sep 2026"
  mtdSales: number; // BDT
  todaySales: number; // BDT (latest day)
  avgDaily: number; // BDT
  days: number;
  mtdProfit: number; // BDT
  marginPct: number | null; // percent
  outlets: number; // offices with any P&L
}

export function buildDailyTrend(rows: PartnerFeedDailyTotalRow[]): DailyPoint[] {
  return rows
    .map((r) => ({ d: r.report_date, value: num(r.amount) ?? 0 }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}

function monthLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split("-");
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${names[(Number(m) || 1) - 1]} ${y}`;
}

function marginPct(profit: number, netSales: number): number | null {
  return netSales > 0 ? (profit / netSales) * 100 : null;
}

// Latest reporting month from the P&L rows (the tab shows the freshest month).
export function latestPeriod(pl: PartnerFeedOfficePlRow[]): string {
  if (pl.length === 0) return "";
  return pl.map((r) => r.period_month).sort().pop() ?? "";
}

export function departmentRollup(pl: PartnerFeedOfficePlRow[]): DepartmentRollup[] {
  const agg = new Map<string, { netSales: number; cost: number; profit: number }>();
  for (const r of pl) {
    const cur = agg.get(r.department_name) ?? { netSales: 0, cost: 0, profit: 0 };
    cur.netSales += num(r.net_sales) ?? 0;
    cur.cost += num(r.cost) ?? 0;
    cur.profit += num(r.profit) ?? 0;
    agg.set(r.department_name, cur);
  }
  const out: DepartmentRollup[] = [];
  for (const [department, v] of agg) {
    out.push({
      department,
      netSales: v.netSales,
      cost: v.cost,
      profit: v.profit,
      margin: marginPct(v.profit, v.netSales),
    });
  }
  return out.sort((a, b) => b.netSales - a.netSales);
}

export function officeScorecard(pl: PartnerFeedOfficePlRow[]): OfficeScorecardRow[] {
  const agg = new Map<
    number,
    { officeName: string; quantity: number; netSales: number; cost: number; profit: number }
  >();
  for (const r of pl) {
    const cur =
      agg.get(r.office_id) ?? { officeName: r.office_name, quantity: 0, netSales: 0, cost: 0, profit: 0 };
    cur.officeName = r.office_name;
    cur.quantity += num(r.quantity) ?? 0;
    cur.netSales += num(r.net_sales) ?? 0;
    cur.cost += num(r.cost) ?? 0;
    cur.profit += num(r.profit) ?? 0;
    agg.set(r.office_id, cur);
  }
  const out: OfficeScorecardRow[] = [];
  for (const [officeId, v] of agg) {
    out.push({
      officeId,
      officeName: v.officeName,
      quantity: v.quantity,
      netSales: v.netSales,
      cost: v.cost,
      profit: v.profit,
      margin: marginPct(v.profit, v.netSales),
    });
  }
  return out.sort((a, b) => b.netSales - a.netSales);
}

export function summarize(
  totals: PartnerFeedDailyTotalRow[],
  pl: PartnerFeedOfficePlRow[],
): PartnerFeedSummary {
  const trend = buildDailyTrend(totals);
  const mtdSales = trend.reduce((a, p) => a + p.value, 0);
  const todaySales = trend.length ? trend[trend.length - 1].value : 0;
  const days = trend.length;
  const avgDaily = days ? mtdSales / days : 0;

  const period = latestPeriod(pl);
  const periodRows = pl.filter((r) => r.period_month === period);
  let mtdProfit = 0;
  let netSales = 0;
  for (const r of periodRows) {
    mtdProfit += num(r.profit) ?? 0;
    netSales += num(r.net_sales) ?? 0;
  }

  return {
    monthLabel: period ? monthLabel(period) : "—",
    mtdSales,
    todaySales,
    avgDaily,
    days,
    mtdProfit,
    marginPct: marginPct(mtdProfit, netSales),
    outlets: officeScorecard(periodRows).length,
  };
}
