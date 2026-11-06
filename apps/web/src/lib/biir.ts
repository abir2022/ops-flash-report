// ---------------------------------------------------------------------------
// Business Impact Intelligence Radar (BIIR) — pure intelligence engine.
//
// A deterministic, rule-based AI layer that turns internal business data
// (the live scorecard/KPI the dashboard already pulls from Supabase) plus a
// configurable catalogue of external signals into decision-ready intelligence:
// risk scoring, SBU impact mapping, opportunity detection, an executive
// summary and a what-if (predictive) simulator.
//
// Everything here is side-effect free and operates on plain arrays/objects so
// it is fully unit-testable without a database — the same pattern the rest of
// the app uses (lib/analysis.ts, lib/advanced.ts, lib/decisionPoints.ts).
//
// IMPORTANT — data provenance:
//   • Internal factors are computed from the LIVE scorecard (v_scorecard) the
//     dashboard already loads for the selected report date.
//   • External signals are fed from the `biir_signal` table when present, and
//     fall back to DEFAULT_SIGNALS (a clearly-labelled baseline catalogue)
//     when the table is empty/unmigrated. They are config data, NOT measured
//     market facts, and are labelled as such in the UI.
// ---------------------------------------------------------------------------

import type { BiirSignalRow, ScorecardRow } from "../types";
import { num } from "./format";

// ---- Risk classification (matches the skill's bands) -----------------------
export type RiskClass = "Low" | "Medium" | "Critical";

export const RISK_BANDS: ReadonlyArray<{ min: number; max: number; cls: RiskClass }> = [
  { min: 0, max: 30, cls: "Low" },
  { min: 31, max: 70, cls: "Medium" },
  { min: 71, max: 100, cls: "Critical" },
];

export function classifyRisk(score: number): RiskClass {
  const s = clamp(round1(score), 0, 100);
  for (const b of RISK_BANDS) if (s <= b.max) return b.cls;
  return "Critical";
}

export const RISK_COLOR: Record<RiskClass, string> = {
  Low: "#4ade80",
  Medium: "#fbbf24",
  Critical: "#f87171",
};

// ---- External signals -------------------------------------------------------
export type FactorCategory =
  | "fuel"
  | "energy"
  | "fx"
  | "commodity"
  | "crisis"
  | "supply"
  | "market";

export const CATEGORY_LABEL: Record<FactorCategory, string> = {
  fuel: "Fuel",
  energy: "Energy",
  fx: "FX / Currency",
  commodity: "Commodity",
  crisis: "Global Crisis",
  supply: "Supply Chain",
  market: "Market Demand",
};

export type SignalSeverity = "low" | "medium" | "critical";

export interface ExternalSignal {
  id: string;
  category: FactorCategory;
  name: string;
  value: number;
  unit: string;
  changePct: number; // % change vs prior period (negative = favourable for buyers)
  direction: "up" | "down" | "flat";
  severity: SignalSeverity;
  note: string;
  source: string;
  updatedAt: string; // ISO date
}

// Probability (0..1) implied by a signal's severity, used in risk scoring.
const SEVERITY_PROB: Record<SignalSeverity, number> = {
  low: 0.35,
  medium: 0.6,
  critical: 0.85,
};

export function severityProb(sev: SignalSeverity): number {
  return SEVERITY_PROB[sev];
}

// ---- SBU exposure mapping ---------------------------------------------------
// How sensitive each business area is to each external factor, 0..1.
// Derived deterministically from the SBU's section (DWH business-unit group)
// plus its freight flag, with code-level overrides for known heavy users.
type ExposureRow = Record<FactorCategory, number>;

const SECTION_EXPOSURE: Record<string, ExposureRow> = {
  "Building Material": { fuel: 0.75, energy: 0.8, fx: 0.3, commodity: 0.6, crisis: 0.35, supply: 0.6, market: 0.6 },
  "Building Solution": { fuel: 0.8, energy: 0.7, fx: 0.25, commodity: 0.5, crisis: 0.3, supply: 0.5, market: 0.6 },
  Logistics: { fuel: 0.95, energy: 0.7, fx: 0.5, commodity: 0.4, crisis: 0.5, supply: 0.45, market: 0.4 },
  Trading: { fuel: 0.4, energy: 0.3, fx: 0.85, commodity: 0.85, crisis: 0.7, supply: 0.7, market: 0.6 },
  Food: { fuel: 0.35, energy: 0.5, fx: 0.5, commodity: 0.6, crisis: 0.35, supply: 0.65, market: 0.55 },
  Packaging: { fuel: 0.4, energy: 0.6, fx: 0.4, commodity: 0.55, crisis: 0.3, supply: 0.6, market: 0.5 },
  IT: { fuel: 0.1, energy: 0.2, fx: 0.2, commodity: 0.05, crisis: 0.1, supply: 0.1, market: 0.3 },
  Others: { fuel: 0.3, energy: 0.35, fx: 0.35, commodity: 0.3, crisis: 0.25, supply: 0.35, market: 0.4 },
};

const DEFAULT_EXPOSURE: ExposureRow = {
  fuel: 0.35, energy: 0.4, fx: 0.4, commodity: 0.4, crisis: 0.35, supply: 0.4, market: 0.45,
};

// Code-level overrides (SBU code → partial exposure), layered on top of section.
const CODE_EXPOSURE: Record<string, Partial<ExposureRow>> = {
  NXCL1: { commodity: 0.9, fx: 0.8, crisis: 0.8, supply: 0.7 },
  NXCL2: { commodity: 0.9, fx: 0.8, crisis: 0.8, supply: 0.7 },
  NXST: { commodity: 0.85, energy: 0.85, fx: 0.6, supply: 0.65 }, // steel
  NXCM: { energy: 0.85, fuel: 0.7, commodity: 0.65, supply: 0.6 }, // cement
  NXAB: { commodity: 0.8, fuel: 0.6, fx: 0.55, supply: 0.6 }, // bitumen
  NXMT: { fuel: 0.95, fx: 0.6, crisis: 0.55 }, // marine tankers
};

export function exposureFor(
  section: string | null,
  isFreight: boolean,
  code: string,
): ExposureRow {
  const base = (section && SECTION_EXPOSURE[section]) || DEFAULT_EXPOSURE;
  const out: ExposureRow = { ...base };
  if (isFreight) {
    out.fuel = Math.min(1, out.fuel + 0.15);
    out.energy = Math.min(1, out.energy + 0.1);
  }
  const override = CODE_EXPOSURE[code];
  if (override) {
    (Object.keys(override) as FactorCategory[]).forEach((k) => {
      out[k] = Math.min(1, override[k] as number);
    });
  }
  return out;
}

// ---- Default (baseline) external signal catalogue --------------------------
// Used only when the biir_signal table is absent/empty. Clearly labelled as a
// baseline reference, not live market data.

const CATEGORIES: FactorCategory[] = ["fuel", "energy", "fx", "commodity", "crisis", "supply", "market"];
const SEVERITIES: SignalSeverity[] = ["low", "medium", "critical"];
const DIRECTIONS = ["up", "down", "flat"] as const;

function asCategory(v: string): FactorCategory {
  return (CATEGORIES as string[]).includes(v) ? (v as FactorCategory) : "market";
}
function asSeverity(v: string): SignalSeverity {
  return (SEVERITIES as string[]).includes(v) ? (v as SignalSeverity) : "medium";
}
function asDirection(v: string | null): "up" | "down" | "flat" {
  return (DIRECTIONS as readonly string[]).includes(v ?? "") ? (v as "up" | "down" | "flat") : "flat";
}

// Map Supabase biir_signal rows → ExternalSignal. Defensive coercion so the UI
// never renders NaN (mirrors lib/format.ts's num()).
export function mapSignals(rows: BiirSignalRow[]): ExternalSignal[] {
  return rows
    .filter((r) => r && r.id)
    .map((r) => ({
      id: r.id,
      category: asCategory(r.category),
      name: r.name || r.id,
      value: num(r.value) ?? 0,
      unit: r.unit ?? "",
      changePct: num(r.change_pct) ?? 0,
      direction: asDirection(r.direction),
      severity: asSeverity(r.severity),
      note: r.note ?? "",
      source: r.source ?? "biir_signal",
      updatedAt: r.updated_at ?? new Date().toISOString(),
    }));
}

export function defaultSignals(): ExternalSignal[] {
  const asOf = "2026-09-22T06:00:00Z";
  const src = "Baseline reference — update via biir_signal / market intel";
  return [
    { id: "diesel", category: "fuel", name: "Diesel", value: 135, unit: "BDT/L", changePct: 17.4, direction: "up", severity: "critical", note: "Diesel up ~17% (115→135) — heavy haulage & distribution cost pressure across logistics/manufacturing.", source: src, updatedAt: asOf },
    { id: "octane", category: "fuel", name: "Octane", value: 165, unit: "BDT/L", changePct: 13.8, direction: "up", severity: "medium", note: "Octane up ~14% (145→165) — lifts sales-fleet & delivery operating cost.", source: src, updatedAt: asOf },
    { id: "petrol", category: "fuel", name: "Petrol", value: 160, unit: "BDT/L", changePct: 14.3, direction: "up", severity: "medium", note: "Petrol up ~14% (140→160) — raises field/sales mobility cost.", source: src, updatedAt: asOf },
    { id: "kerosene", category: "fuel", name: "Kerosene", value: 155, unit: "BDT/L", changePct: 14.8, direction: "up", severity: "low", note: "Kerosene up ~15% (135→155) — minor direct impact, watch auxiliary use.", source: src, updatedAt: asOf },
    { id: "gas", category: "energy", name: "Gas (industrial)", value: 0, unit: "index", changePct: 5, direction: "up", severity: "low", note: "Modest gas price pressure on energy-intensive plants.", source: src, updatedAt: asOf },
    { id: "power", category: "energy", name: "Electricity tariff", value: 0, unit: "index", changePct: 10, direction: "up", severity: "medium", note: "Tariff hike raises cost base for cement/steel and processing lines.", source: src, updatedAt: asOf },
    { id: "usd", category: "fx", name: "USD / BDT", value: 122, unit: "BDT/USD", changePct: 4, direction: "up", severity: "medium", note: "Weaker Taka raises landed cost of imported raw materials.", source: src, updatedAt: asOf },
    { id: "coal", category: "commodity", name: "Coal", value: 95, unit: "USD/MT", changePct: 12, direction: "up", severity: "critical", note: "Coal spike directly compresses BTL/DTL coal & energy-linked margins.", source: src, updatedAt: asOf },
    { id: "steel", category: "commodity", name: "Steel / rebar", value: 0, unit: "index", changePct: 9, direction: "up", severity: "medium", note: "Steel input inflation pressures NXST and construction-material margins.", source: src, updatedAt: asOf },
    { id: "bitumen", category: "commodity", name: "Bitumen", value: 0, unit: "index", changePct: 7, direction: "up", severity: "medium", note: "Bitumen cost affects NXAB asphalt channel.", source: src, updatedAt: asOf },
    { id: "freight", category: "supply", name: "Ocean freight rates", value: 0, unit: "index", changePct: 11, direction: "up", severity: "critical", note: "Routing disruption + higher bunker lift import landed cost and lead times.", source: src, updatedAt: asOf },
    { id: "geo", category: "crisis", name: "Geopolitical tension", value: 0, unit: "index", changePct: 0, direction: "up", severity: "medium", note: "Regional shipping/sanctions risk — watch alternative sourcing.", source: src, updatedAt: asOf },
  ];
}

// ---- Internal SBU risk ------------------------------------------------------
export interface SbuRisk {
  sbuId: number;
  code: string;
  name: string | null;
  section: string | null;
  isFreight: boolean;
  mtdRevenue: number;
  achievementPct: number | null;
  momentum: string | null;
  momPct: number | null;
  yoyPct: number | null;
  riskScore: number;
  riskClass: RiskClass;
  signal: string;
  action: string;
  owner: string;
  timeline: string;
}

const MOMENTUM_PROB: Record<string, number> = {
  "Strong +": 0.15,
  Positive: 0.3,
  Neutral: 0.45,
  Weak: 0.7,
  Negative: 0.9,
};

export function momentumProbability(momentum: string | null): number {
  if (!momentum) return 0.5;
  return MOMENTUM_PROB[momentum] ?? 0.5;
}

// Impact factor from target achievement (0..1). On/above target = minimal
// impact; a 40% achievement gap = full impact.
function achievementImpact(ach: number | null): number {
  if (ach === null) return 0.5;
  return clamp((100 - ach) / 60, 0.1, 1);
}

// Exposure factor from portfolio contribution (0..1). An SBU holding ≥20% of
// MTD revenue is fully exposed; smaller SBUs are scaled down, floor 0.15.
function contributionExposure(mtdRev: number, totalMtd: number): number {
  if (totalMtd <= 0) return 0.3;
  return clamp(mtdRev / (totalMtd * 0.2), 0.15, 1);
}

export function computeSbuRisks(rows: ScorecardRow[]): SbuRisk[] {
  const total = rows.reduce((s, r) => s + (num(r.mtd_rev) ?? 0), 0);
  const out: SbuRisk[] = [];
  for (const r of rows) {
    const mtd = num(r.mtd_rev) ?? 0;
    const ach = num(r.mtd_ach_pct);
    const prob = momentumProbability(r.momentum);
    const exposure = contributionExposure(mtd, total);
    const impact = achievementImpact(ach);
    const score = clamp(round1(prob * exposure * impact * 100), 0, 100);

    // Build a plain-language signal + directive action (6-field format).
    const gap = ach !== null && ach < 100 ? `${fmt1(100 - ach)}pt target gap` : "on/above target";
    const signal = `${r.momentum ?? "No"} momentum · ${gap}`;
    let action: string;
    let owner = "SBU Head";
    let timeline = "7 days";
    if (score >= 71) {
      action = `Run a recovery plan for ${r.code}: confirm root cause (demand vs. supply), reprioritise high-margin SKUs and report daily.`;
      timeline = "48 hours";
    } else if (score >= 31) {
      action = `Protect ${r.code}'s remaining days — verify pacing, pull forward confirmed orders, avoid new stock without demand.`;
    } else {
      action = `Sustain ${r.code} momentum; bank surplus and protect margin.`;
    }

    out.push({
      sbuId: r.sbu_id,
      code: r.code,
      name: r.name,
      section: r.section,
      isFreight: r.is_freight,
      mtdRevenue: mtd,
      achievementPct: ach,
      momentum: r.momentum,
      momPct: num(r.mom_pct),
      yoyPct: num(r.yoy_pct),
      riskScore: score,
      riskClass: classifyRisk(score),
      signal,
      action,
      owner,
      timeline,
    });
  }
  return out.sort((a, b) => b.riskScore - a.riskScore);
}

// ---- External factor → SBU impact mapping -----------------------------------
export interface ImpactRow {
  sbuId: number;
  code: string;
  name: string | null;
  section: string | null;
  category: FactorCategory;
  signalName: string;
  probability: number; // 0..1
  exposure: number; // 0..1
  financialImpact: number; // Cr estimate
  riskScore: number; // 0..100
  riskClass: RiskClass;
  action: string;
  owner: string;
  timeline: string;
}

// Recommend a profit-protection action per factor category. Always prioritises
// productivity/optimisation over headcount reduction (per the skill).
export function actionForCategory(cat: FactorCategory): { action: string; owner: string; timeline: string } {
  switch (cat) {
    case "fuel":
      return { action: "Route optimisation, vehicle-utilisation review, supplier contract renegotiation.", owner: "Logistics / Operations", timeline: "7 days" };
    case "energy":
      return { action: "Energy-efficiency audit; shift load to off-peak; review tariff brackets.", owner: "Plant Operations", timeline: "14 days" };
    case "fx":
      return { action: "Hedge/natural-hedge FX exposure; renegotiate LC terms; review import mix.", owner: "Procurement / Treasury", timeline: "7 days" };
    case "commodity":
      return { action: "Forward-buy critical inputs; qualify alternative suppliers; index selling prices.", owner: "Procurement", timeline: "10 days" };
    case "crisis":
      return { action: "Diversify sourcing routes; raise safety stock on critical raw materials.", owner: "Supply Chain", timeline: "14 days" };
    case "supply":
      return { action: "Secure alternate carriers/ports; buffer inventory for high-velocity SKUs.", owner: "Supply Chain", timeline: "14 days" };
    case "market":
      return { action: "Reprice selectively; shift mix to in-demand SKUs; defend key accounts.", owner: "Sales / SBU Head", timeline: "7 days" };
  }
}

export function buildImpactMap(
  rows: ScorecardRow[],
  signals: ExternalSignal[],
): ImpactRow[] {
  const out: ImpactRow[] = [];
  for (const r of rows) {
    const mtd = num(r.mtd_rev) ?? 0;
    if (mtd <= 0) continue; // no material revenue → no measurable impact
    const exposureMap = exposureFor(r.section, r.is_freight, r.code);
    for (const s of signals) {
      const exposure = exposureMap[s.category] ?? 0.3;
      if (exposure <= 0.05) continue; // negligible sensitivity
      const prob = severityProb(s.severity);
      // Financial impact = exposure × MTD revenue × a magnitude term driven by
      // the signal's move (capped so a single signal can't claim >30% of MTD).
      const magnitude = clamp(Math.abs(s.changePct) / 100, 0.02, 0.3);
      const financialImpact = round2(exposure * mtd * magnitude);
      const score = clamp(round1(prob * exposure * financialImpact * 10), 0, 100);
      if (score < 5) continue; // drop noise
      const { action, owner, timeline } = actionForCategory(s.category);
      out.push({
        sbuId: r.sbu_id,
        code: r.code,
        name: r.name,
        section: r.section,
        category: s.category,
        signalName: s.name,
        probability: round2(prob),
        exposure: round2(exposure),
        financialImpact,
        riskScore: score,
        riskClass: classifyRisk(score),
        action,
        owner,
        timeline,
      });
    }
  }
  return out.sort((a, b) => b.riskScore - a.riskScore);
}

// ---- Opportunity detection ---------------------------------------------------
export type OpportunityKind = "growth" | "recovery" | "market";

export interface Opportunity {
  sbuId: number;
  code: string;
  name: string | null;
  section: string | null;
  kind: OpportunityKind;
  detail: string;
  value: number; // Cr upside estimate
  action: string;
  owner: string;
  timeline: string;
}

export function detectOpportunities(rows: ScorecardRow[]): Opportunity[] {
  const out: Opportunity[] = [];
  for (const r of rows) {
    const mtd = num(r.mtd_rev) ?? 0;
    const mom = num(r.mom_pct);
    const yoy = num(r.yoy_pct);
    const ach = num(r.mtd_ach_pct);
    const proj = num(r.proj_rev);
    const tgt = num(r.mo_tgt_rev);

    // Growth: strong momentum with meaningful revenue.
    if (mtd > 0 && mom !== null && mom >= 5 && yoy !== null && yoy >= 0) {
      out.push({
        sbuId: r.sbu_id, code: r.code, name: r.name, section: r.section,
        kind: "growth",
        detail: `MoM ${fmt1(mom)}% and YoY ${fmt1(yoy)}% — accelerating demand.`,
        value: round2(mtd * 0.1),
        action: "Scale supply & channel capacity to capture the upswing before it peaks.",
        owner: "SBU Head", timeline: "This month",
      });
    }

    // Recovery: below target but projection shows a recoverable close.
    if (tgt !== null && tgt > 0 && ach !== null && ach < 100 && proj !== null && proj >= tgt * 0.9) {
      const recover = round2(Math.max(0, proj - mtd));
      out.push({
        sbuId: r.sbu_id, code: r.code, name: r.name, section: r.section,
        kind: "recovery",
        detail: `Achieving ${fmt1(ach)}% but projected ${fmt1(proj)} Cr vs ${fmt1(tgt)} Cr target — recoverable.`,
        value: recover,
        action: "Pull forward confirmed orders and clear delivery bottlenecks to close the gap.",
        owner: "SBU Head", timeline: "This month",
      });
    }
  }

  // Market: portfolio-level growth leader opportunity (top single upside).
  const growth = out.filter((o) => o.kind === "growth").sort((a, b) => b.value - a.value);
  if (growth.length > 0) {
    const g = growth[0];
    out.push({
      sbuId: g.sbuId, code: g.code, name: g.name, section: g.section,
      kind: "market",
      detail: `Top growth driver in the portfolio — capture share while demand is favourable.`,
      value: g.value,
      action: "Allocate incremental marketing/supply budget to the highest-momentum SBU.",
      owner: "CBDO", timeline: "This quarter",
    });
  }

  return out.sort((a, b) => b.value - a.value);
}

// ---- Executive summary (rule-based NLG) -------------------------------------
export interface ExecutiveSummary {
  headline: string;
  whatChanged: string[];
  whyItMatters: string[];
  whoAffected: string[];
  actions: string[];
  generatedAt: string;
}

export function generateExecutiveSummary(
  risks: SbuRisk[],
  impacts: ImpactRow[],
  opportunities: Opportunity[],
  kpi: { total_mtd: number; total_daily: number; active_sbus: number; avg_ach_pct: number | null } | null,
): ExecutiveSummary {
  const critical = risks.filter((r) => r.riskClass === "Critical");
  const medium = risks.filter((r) => r.riskClass === "Medium");
  const topImpact = impacts[0];
  const topOpp = opportunities[0];

  const whatChanged: string[] = [];
  whatChanged.push(
    kpi
      ? `MTD revenue ${fmt1(kpi.total_mtd)} Cr across ${kpi.active_sbus} active SBUs · avg achievement ${kpi.avg_ach_pct != null ? fmt1(kpi.avg_ach_pct) : "—"}%.`
      : "MTD revenue data unavailable for the selected date.",
  );
  if (topImpact) {
    whatChanged.push(
      `Top external pressure: ${topImpact.signalName} (${CATEGORY_LABEL[topImpact.category]}) is flagged, hitting ${topImpact.code} hardest with an estimated ${fmt1(topImpact.financialImpact)} Cr exposure.`,
    );
  }
  if (critical.length > 0) {
    whatChanged.push(`${critical.length} SBU(s) in Critical risk band: ${critical.map((r) => r.code).join(", ")}.`);
  }

  const whyItMatters: string[] = [];
  if (critical.length > 0) {
    whyItMatters.push(`Critical-risk SBUs are the largest contributors to a widening target shortfall — unresolved, they drag FY achievement and margin.`);
  }
  if (topImpact) {
    whyItMatters.push(`Cost inflation from ${topImpact.category} compresses margin unless offset by productivity, pricing or sourcing.`);
  }
  if (topOpp) {
    whyItMatters.push(`Upside exists: ${topOpp.code} offers ~${fmt1(topOpp.value)} Cr of recoverable/growth opportunity this cycle.`);
  }

  const whoAffected: string[] = [];
  if (critical.length > 0) whoAffected.push(...critical.slice(0, 3).map((r) => `${r.code} (${r.section ?? "n/a"})`));
  if (medium.length > 0) whoAffected.push(`${medium.length} additional SBU(s) in Medium risk.`);
  if (whoAffected.length === 0) whoAffected.push("No SBUs are in a material risk band this period.");

  const actions: string[] = [];
  actions.push(critical.length > 0 ? `Hold a daily recovery stand-up with the ${critical.length} Critical SBU heads and the CBDO.` : "Continue tracking; no critical action required today.");
  actions.push(topImpact ? topImpact.action : "Monitor external cost factors.");
  actions.push("Prioritise productivity, automation and sourcing optimisation over any headcount reduction to protect profit targets.");

  return {
    headline:
      critical.length > 0
        ? `${critical.length} SBU(s) in Critical risk — act within 48 hours`
        : medium.length > 0
          ? `${medium.length} SBU(s) in Medium risk — protect the month`
          : "Portfolio stable — bank momentum and protect margin",
    whatChanged,
    whyItMatters,
    whoAffected,
    actions,
    generatedAt: new Date().toISOString(),
  };
}

// ---- What-if / predictive simulator -----------------------------------------
export interface WhatIfScenario {
  id: string;
  label: string;
  category: FactorCategory;
  deltaPct: number; // e.g. +10 → 10, -5 → -5
}

export interface WhatIfResult {
  scenario: string;
  totalImpact: number; // Cr
  impacted: { code: string; impact: number }[];
  recommendation: string;
}

export function simulateImpact(
  rows: ScorecardRow[],
  scenario: WhatIfScenario,
): WhatIfResult {
  const { action } = actionForCategory(scenario.category);
  const impacted: { code: string; impact: number }[] = [];
  let totalImpact = 0;
  for (const r of rows) {
    const mtd = num(r.mtd_rev) ?? 0;
    if (mtd <= 0) continue;
    const exp = exposureFor(r.section, r.is_freight, r.code)[scenario.category] ?? 0.3;
    const magnitude = clamp(Math.abs(scenario.deltaPct) / 100, 0, 1);
    const impact = round2(exp * mtd * magnitude);
    if (impact < 0.01) continue;
    totalImpact += impact;
    impacted.push({ code: r.code, impact });
  }
  impacted.sort((a, b) => b.impact - a.impact);
  return {
    scenario: `${scenario.label} ${scenario.deltaPct >= 0 ? "+" : ""}${scenario.deltaPct}%`,
    totalImpact: round2(totalImpact),
    impacted: impacted.slice(0, 5),
    recommendation: action,
  };
}

// ---- Risk heatmap (SBU × factor pivot) --------------------------------------
export interface HeatmapCell {
  sbuId: number;
  code: string;
  section: string | null;
  maxScore: number;
  byCategory: Partial<Record<FactorCategory, number>>;
}

// Pivot the flat impact list into an SBU × factor matrix for the heatmap,
// keeping only the most-exposed SBUs (by their worst factor score).
export function buildHeatmap(impacts: ImpactRow[], maxSbus = 12): HeatmapCell[] {
  const map = new Map<number, HeatmapCell>();
  for (const i of impacts) {
    let e = map.get(i.sbuId);
    if (!e) {
      e = { sbuId: i.sbuId, code: i.code, section: i.section, maxScore: 0, byCategory: {} };
      map.set(i.sbuId, e);
    }
    e.byCategory[i.category] = Math.max(e.byCategory[i.category] ?? 0, i.riskScore);
    e.maxScore = Math.max(e.maxScore, i.riskScore);
  }
  return [...map.values()].sort((a, b) => b.maxScore - a.maxScore).slice(0, maxSbus);
}

// ---- helpers -----------------------------------------------------------------
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function fmt1(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
