// ---------------------------------------------------------------------------
// Demo mode — static fixtures.
//
// Fictional in-memory seed data for the no-backend preview. Ported from this
// repo's own SQL seeds so the shapes match the PostgREST surface exactly:
//   * SBU dimension      — supabase/migrations/seed.sql (ids/codes) renamed by
//                          00004_sbu_section.sql (names/sections)
//   * monthly targets    — 00028_sbu_revenue_targets.sql (24-month plan, Jul
//                          2025 .. Jun 2027, revenue only) + the Sep-2026
//                          example block in seed.sql
//   * external signals   — 00010_biir.sql baseline catalogue
//   * survey form        — 00023_default_survey_form.sql as relabelled by
//                          00029_campaign_expense_actual.sql
//   * marketing-led Cr targets — 00026_marketing_led_target.sql
//   * SBU <-> ROMI bridge — 00013_romi_integration.sql
//
// Fact rows (daily revenue, SKU mix, marketing spend, partner feed) are not
// seeded in SQL — the ETL writes them — so they are generated deterministically
// from these fixtures in demoStore.ts. Everything here is synthetic NexaGroup
// fiction; no real company, entity or figure appears.
// ---------------------------------------------------------------------------

import type {
  BiirSignalRow,
  EmployeeCapability,
  RomiSurveyField,
} from "../../types";

// ---------------------------------------------------------------------------
// Demo "clock". The whole in-memory dataset is frozen around these dates so
// every tab renders numbers without a backend. All values are synthetic.
// ---------------------------------------------------------------------------

/** The most recent report date the demo "today" boots to. */
export const DEMO_LATEST_DATE = "2026-11-05";
/** NexaGroup fiscal year is July–June; FY26-27 opens here. */
export const DEMO_FY_START = "2026-07-01";
/** First calendar-day of the daily-series buffer (>= 4 FYs before latest). */
export const DEMO_SERIES_START = "2022-07-01";

/** public.sbu */
export interface DemoSbuRow {
  id: number;
  code: string;
  name: string | null;
  section: string | null;
  is_freight: boolean;
  is_active: boolean;
  notes: string | null;
}

/**
 * Report-scope SBU dimension (seed.sql ids/codes + 00004 names/sections), then
 * the recon-only and historical entities that exist for the GL tie-out only.
 */
export const DEMO_SBUS: DemoSbuRow[] = [
  { id: 19, code: "NXPL", name: "NexaGroup Poly Fibre Industries Ltd.", section: "Packaging", is_freight: false, is_active: true, notes: null },
  { id: 36, code: "NXES", name: "NexaGroup Essentials Ltd.", section: "Food", is_freight: false, is_active: true, notes: null },
  { id: 58, code: "NXCM", name: "NexaGroup Cement Company Ltd.", section: "Building Material", is_freight: false, is_active: true, notes: "intSBUId=0 remapped here" },
  { id: 64, code: "NXSL", name: "NexaGroup Shipping Line Ltd.", section: "Logistics", is_freight: true, is_active: true, notes: "Freight (GL 3010005)" },
  { id: 69, code: "NXRM", name: "NexaGroup Ready Mix Concrete Ltd", section: "Building Solution", is_freight: false, is_active: true, notes: null },
  { id: 72, code: "NXCL1", name: "Bengal Traders Ltd", section: "Trading", is_freight: false, is_active: true, notes: null },
  { id: 77, code: "NXCL2", name: "Deltas Trading Company Ltd", section: "Trading", is_freight: false, is_active: true, notes: "BTL_G2G dormant since Jul 2026" },
  { id: 79, code: "NXOC", name: "NexaGroup Ocean Line Ltd.", section: "Logistics", is_freight: true, is_active: true, notes: "Freight (GL 3010005)" },
  { id: 80, code: "NXSL1", name: "NEXAGROUP SHIPPING LINES PTE LTD, SINGAPORE", section: "Logistics", is_freight: true, is_active: true, notes: "Freight (GL 3010005)" },
  { id: 81, code: "NXMT", name: "NexaGroup Maritime Limited", section: "Logistics", is_freight: true, is_active: true, notes: "Freight (GL 3010005)" },
  { id: 82, code: "NXBO", name: "NexaSoft Limited", section: "IT", is_freight: false, is_active: true, notes: null },
  { id: 83, code: "NXBP", name: "Bright Byte Limited", section: "IT", is_freight: false, is_active: true, notes: null },
  { id: 84, code: "NXIT", name: "NexaGroup InfoTech Ltd.", section: "IT", is_freight: false, is_active: true, notes: null },
  { id: 86, code: "NXHM", name: "Harvest Rice Mills Ltd.", section: "Food", is_freight: false, is_active: true, notes: null },
  { id: 87, code: "NXFL", name: "Greenfield Agro Ltd.", section: "Food", is_freight: false, is_active: true, notes: null },
  { id: 88, code: "NXSE", name: "NexaGroup Sea Line Limited", section: "Logistics", is_freight: true, is_active: true, notes: "Freight (GL 3010005)" },
  { id: 91, code: "NXNT", name: "Novel Traders Ltd.", section: "Trading", is_freight: false, is_active: true, notes: null },
  { id: 98, code: "NXAB", name: "NexaGroup Building Solutions Limited", section: "Building Solution", is_freight: false, is_active: true, notes: "Split into Asphalt/Lubex channels" },
  { id: 99, code: "NXAL", name: "NexaGroup Commodities Ltd.", section: "Trading", is_freight: false, is_active: true, notes: null },
  { id: 102, code: "NXST", name: "NexaGroup Steel Limited", section: "Building Material", is_freight: false, is_active: true, notes: null },
  { id: 109, code: "NXAF", name: "NexaGroup Agro Feed Ltd.", section: "Food", is_freight: false, is_active: true, notes: null },
  { id: 110, code: "NXSC", name: "NEXAGROUP SEA LINE SHIP MANAGEMENT AND OPERATION L.L.C", section: "Logistics", is_freight: true, is_active: true, notes: "Freight (GL 3010005)" },
  { id: 114, code: "NXLE", name: "NexaGroup Light Engineering Limited", section: "Others", is_freight: false, is_active: true, notes: null },
  { id: 115, code: "NXAI", name: "NEXAGROUP Automobile Industries Ltd.", section: "Others", is_freight: false, is_active: true, notes: null },
  { id: 118, code: "NXAT", name: "NEXAGROUP Telecom Limited", section: "Others", is_freight: false, is_active: true, notes: null },
  { id: 120, code: "NXEF", name: "NexaGroup Electrofab Limited", section: "Others", is_freight: false, is_active: true, notes: null },
  { id: 123, code: "NXEN", name: "NexaGroup Engineering Ltd.", section: "Others", is_freight: false, is_active: true, notes: "New SBU ~Jul 2026" },
  { id: 124, code: "NXBL", name: "NexaGroup Breeders Limited", section: "Others", is_freight: false, is_active: true, notes: "Persistent gap vs portal — override candidate" },
  { id: 126, code: "NXOR", name: "NEXAGROUP Consumer Electronics Limited", section: "Others", is_freight: false, is_active: true, notes: "Persistent gap vs portal — override candidate" },
  { id: 128, code: "NXMX", name: "NEXAGROUP MoveX Ltd.", section: "Others", is_freight: false, is_active: true, notes: null },
  { id: 129, code: "NXNJ", name: "NextJobs Limited", section: "Others", is_freight: false, is_active: true, notes: null },
  { id: 132, code: "NXMP", name: "NexaGroup Mediplex Limited", section: "Others", is_freight: false, is_active: true, notes: null },
  // Recon-only entities (excluded from report scope, present in the full-GL side)
  { id: 103, code: "CC_Center", name: "NexaGroup Logistics Ltd.", section: "Others", is_freight: false, is_active: false, notes: "Recon-only" },
  { id: 116, code: "ALCL", name: "Partner Feed Ltd.", section: "Others", is_freight: false, is_active: false, notes: "Recon-only" },
  { id: 119, code: "AWT", name: "Fields Agro Essence", section: "Others", is_freight: false, is_active: false, notes: "Recon-only" },
  { id: 122, code: "Cables", name: "NexaGroup Air Service Ltd.", section: "Others", is_freight: false, is_active: false, notes: "Recon-only" },
  { id: 111, code: "Recon_111", name: "Skyline Travel & Tours", section: "Others", is_freight: false, is_active: false, notes: "Recon-only — confirm mapping with finance" },
  // Historical-only entities
  { id: 75, code: "DiTCL", name: "Dominion Trading Company Ltd", section: "Trading", is_freight: false, is_active: false, notes: "Historical — negligible FY26-27 revenue" },
  { id: 78, code: "ETCL", name: "Eastern Trading Company Ltd", section: "Trading", is_freight: false, is_active: false, notes: "Historical — negligible FY26-27 revenue" },
];

/**
 * public.target — the 24-month revenue plan from 00028_sbu_revenue_targets.sql
 * (one row per SBU x channel x month; null = no target that month).
 */
export const TARGET_MONTHS: string[] = [
  "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
  "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06",
];

export interface SeedTargetRow {
  sbu: number;
  channel: string;
  /** aligned with TARGET_MONTHS */
  values: (number | null)[];
}

export const SEED_TARGETS: SeedTargetRow[] = [
  { sbu: 19, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, 6.02, null, 7.39, 7, null, null, null, null, null, null, null, null, null] },
  { sbu: 36, channel: "default", values: [38.05, 40.01, 40.53, 41.92, 43.87, 47.55, 51.08, 51.2, 51.35, 55.43, 62.54, 67.4, 50.1, 60, 42.33, 55.14, 56.63, 59.76, 58.18, 51.69, 52.37, 55.7, 48.29, 50.08] },
  { sbu: 58, channel: "default", values: [56.53, 58.3, 58.3, 60.07, 60, 56.67, 59.5, 50.24, 63.33, 60, 56.67, 55.83, 57.67, 57.67, 60.7, 63, 53.33, 66.33, 66.33, 66.33, 67, 64.33, 67, 60.33] },
  { sbu: 69, channel: "default", values: [null, null, null, null, null, null, null, 13.36, null, null, 19.52, 18.33, 12.99, 12.64, 15.01, 14.54, 15.11, 16.2, 20.85, 22.03, 12.89, 24.37, 14.6, 13.46] },
  { sbu: 72, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, 4.65, null, 6.24, 17.67, null, null, null, null, null, null, null, null, null] },
  { sbu: 77, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, 4.65, null, 12.5, 18.96, null, null, null, null, null, null, null, null, null] },
  { sbu: 83, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, 0.67, null, 2, 2.17, null, null, null, null, null, null, null, null, null] },
  { sbu: 84, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, 0.83, null, 1.28, 1.47, null, null, null, null, null, null, null, null, null] },
  { sbu: 86, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, null, 10.22, 10.48, 11.95, 11.84, 7.93, 10.56, 8.91, 11.42, 8.7, 10.27, 8.11, 9.45] },
  { sbu: 91, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, 35.34, null, 15.25, 16.96, null, null, null, null, null, null, null, null, null] },
  { sbu: 98, channel: "asphalt", values: [null, null, null, null, null, null, null, null, null, null, null, 5.58, 2.47, 3, 4.33, 4.29, 4.4, 4.58, 4.58, 4.58, 2.83, 4.4, 2.83, 2.65] },
  { sbu: 98, channel: "lubex", values: [0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 0.76, 0.87, 0.85, 0.9, 0.91, 0.88, 0.89, 0.92, 0.89, 0.93, 0.94, 0.97] },
  { sbu: 99, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, 3.33, 3.2, 0.63, 0.6, null, null, null, null, null, null, null, null, null] },
  { sbu: 102, channel: "default", values: [30.87, 30.25, 32.8, 35.53, 34.88, 42.13, 46.8, 46.08, 35.1, 63, 36.4, 31.2, 40.95, 40.33, 42.39, 39.43, 42.47, 52.13, 65.1, 72.07, 56.4, 78.33, 55.8, 61.33] },
  { sbu: 109, channel: "default", values: [18.16, 21.3, 24.28, 28.26, 25.96, 24.59, 25.35, 25.55, 27.86, 30.62, 32.21, 32.44, 30.33, 34.6, 37, 40.57, 35.96, 33.29, 34.73, 34.41, 35.74, 38.73, 41.27, 43.27] },
  { sbu: 114, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, 5.98, 6.21, 6.58, 6.98, 7.95, 8.71, 9.25, 10, 10.71, 11.55, 12.22, 12.85, 13.69] },
  { sbu: 115, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, 1, null, 1.51, 1.66, null, null, null, null, null, null, null, null, null] },
  { sbu: 120, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, null, null, 0.76, null, null, null, null, null, null, null, null, null, null] },
  { sbu: 124, channel: "default", values: [null, null, null, null, null, null, null, null, null, null, null, null, null, 0.77, 0.67, null, null, null, null, null, null, null, null, null] },
  { sbu: 126, channel: "default", values: [null, null, null, null, null, null, null, null, null, 0.23, 0.26, 0.33, 0.33, 0.37, 0.4, 4.25, 4.76, 5.69, 6.56, 7.54, 8.95, 8.15, 9.81, 7.46] },
];

/**
 * Synthetic revenue model for the SBUs the SQL seed leaves without a plan (and
 * for months outside the 00028 window). `base` = typical monthly revenue (Cr);
 * `unit` = Cr per volume unit (so daily volume is derivable), `uom` its label.
 * `startsFrom` / `dormantFrom` gate a business on or off mid-series.
 */
export interface SbuModel {
  base: number;
  uom?: string;
  unit?: number;
  startsFrom?: string;
  dormantFrom?: string;
  /** GL source label written into daily_snapshot.src */
  src?: string;
}

export const SBU_MODEL: Record<number, SbuModel> = {
  19: { base: 7.1, uom: "MT", unit: 0.042 },
  36: { base: 54, uom: "pcs", unit: 0.0058 },
  58: { base: 60, uom: "MT", unit: 0.0011 },
  64: { base: 18, src: "GL 3010005" },
  69: { base: 14.5, uom: "cum", unit: 0.0062 },
  72: { base: 12, uom: "MT", unit: 0.0035 },
  77: { base: 14, uom: "MT", unit: 0.0034, dormantFrom: "2026-08" },
  79: { base: 21, src: "GL 3010005" },
  80: { base: 9.5, src: "GL 3010005" },
  81: { base: 7.8, src: "GL 3010005" },
  82: { base: 2.6 },
  83: { base: 2.1 },
  84: { base: 1.4 },
  86: { base: 10.6, uom: "MT", unit: 0.0083 },
  87: { base: 5.4, uom: "MT", unit: 0.0071 },
  88: { base: 12.4, src: "GL 3010005" },
  91: { base: 16.2, uom: "MT", unit: 0.0041 },
  98: { base: 4.4, uom: "MT", unit: 0.011 },
  99: { base: 1.1, uom: "MT", unit: 0.006 },
  102: { base: 43, uom: "MT", unit: 0.0091 },
  109: { base: 33, uom: "MT", unit: 0.0061 },
  110: { base: 4.2, src: "GL 3010005" },
  114: { base: 8.4, uom: "pcs", unit: 0.0000177 },
  115: { base: 1.6, uom: "pcs", unit: 0.00029 },
  118: { base: 6.4 },
  120: { base: 0.9 },
  123: { base: 2.4, startsFrom: "2026-07" },
  124: { base: 0.8, uom: "pcs", unit: 0.00004 },
  126: { base: 4.6, uom: "pcs", unit: 0.00092 },
  128: { base: 1.3 },
  129: { base: 0.6 },
  132: { base: 2.2, startsFrom: "2026-01" },
};

/** NXAB (98) is reported as two distribution channels rather than one. */
export const CHANNEL_BY_SBU: Record<number, string[]> = {
  98: ["asphalt", "lubex"],
};

/** Calendar-month seasonality applied when no plan target exists (FY Jul-Jun). */
export const SEASONALITY: Record<string, number> = {
  "07": 1.0, "08": 1.03, "09": 1.05, "10": 1.02, "11": 1.08, "12": 1.05,
  "01": 0.98, "02": 0.95, "03": 1.02, "04": 0.9, "05": 0.96, "06": 1.04,
};

/** Weekday revenue weight (local weekend is Friday/Saturday). */
export const WEEKDAY_WEIGHT: number[] = [
  0.52, // Sun
  1.1, // Mon
  1.14, // Tue
  1.1, // Wed
  1.02, // Thu
  0.56, // Fri
  0.5, // Sat
];

/** Item mix pools per section, used to synthesise SKU rows (all fictional). */
export const ITEM_POOL: Record<string, string[]> = {
  "Building Material": ["OPC 52.5 (50kg)", "PPC 43.5 (50kg)", "Premium blend cement", "TMT bar 8mm", "TMT bar 12mm", "Wire rod", "Ground granulated slag"],
  "Building Solution": ["Ready mix Grade 25", "Ready mix Grade 30", "Bitumen 60/70", "Polymer-modified bitumen", "Industrial lubricant", "Transformer oil"],
  Food: ["Steam rice 5%", "Miniket rice", "Soybean oil (tin)", "Poultry feed 50kg", "Cattle feed 50kg", "Wheat bran", "Spiced snack pack"],
  Logistics: ["Coastal haulage slot", "Container yard stay", "Ocean freight booking", "Bunker surcharge recovery", "Inland barge leg"],
  Trading: ["Thermal coal MT", "Clinker MT", "Feldspar MT", "Scrap metal MT", "Containerised general cargo"],
  Packaging: ["PP woven sack 50kg", "FIBC bulk bag", "Laminated woven sack", "Raffia tape", "Printed sack roll"],
  IT: ["Software licence seat", "Managed integration service", "Hardware supply lot", "Cloud migration project"],
  Others: ["Light engineering part", "Tyre 1000-20", "Telecom airtime bundle", "Fabricated steel structure", "Electrofab panel set", "Diagnostic consumable kit", "Vaccine cold-chain pack"],
};

/** SubGL marketing spend purposes (GL 4210001 breakdown). */
export const MARKETING_SUBGL: { code: string; name: string; share: number }[] = [
  { code: "4210101", name: "Advertisement & Publicity", share: 0.38 },
  { code: "4210104", name: "Sales Promotion & Activation", share: 0.24 },
  { code: "4210107", name: "Event, Sponsorship & Trade Fair", share: 0.13 },
  { code: "4210112", name: "Field Marketing Support", share: 0.1 },
  { code: "4210118", name: "Commission & Discount", share: 0.09 },
  { code: "4210125", name: "Salary & Allowances (Marketing)", share: 0.06 },
];

/** Share of spend that is NOT campaign-able (trade / people / overhead). */
export const NON_CAMPAIGN_SHARE = 0.27;

/** public.biir_signal baseline catalogue — verbatim from 00010_biir.sql. */
export const DEMO_BIIR_SIGNALS: (BiirSignalRow & { active: boolean })[] = [
  { id: "diesel", category: "fuel", name: "Diesel", value: 135, unit: "BDT/L", change_pct: 17.4, direction: "up", severity: "critical", note: "Diesel up ~17% (115→135) — heavy haulage & distribution cost pressure across logistics/manufacturing.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
  { id: "octane", category: "fuel", name: "Octane", value: 165, unit: "BDT/L", change_pct: 13.8, direction: "up", severity: "medium", note: "Octane up ~14% (145→165) — lifts sales-fleet & delivery operating cost.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
  { id: "petrol", category: "fuel", name: "Petrol", value: 160, unit: "BDT/L", change_pct: 14.3, direction: "up", severity: "medium", note: "Petrol up ~14% (140→160) — raises field/sales mobility cost.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
  { id: "kerosene", category: "fuel", name: "Kerosene", value: 155, unit: "BDT/L", change_pct: 14.8, direction: "up", severity: "low", note: "Kerosene up ~15% (135→155) — minor direct impact, watch auxiliary use.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
  { id: "gas", category: "energy", name: "Gas (industrial)", value: 0, unit: "index", change_pct: 5, direction: "up", severity: "low", note: "Modest gas price pressure on energy-intensive plants.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
  { id: "power", category: "energy", name: "Electricity tariff", value: 0, unit: "index", change_pct: 10, direction: "up", severity: "medium", note: "Tariff hike raises cost base for cement/steel and processing lines.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
  { id: "usd", category: "fx", name: "USD / BDT", value: 122, unit: "BDT/USD", change_pct: 4, direction: "up", severity: "medium", note: "Weaker Taka raises landed cost of imported raw materials.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
  { id: "coal", category: "commodity", name: "Coal", value: 95, unit: "USD/MT", change_pct: 12, direction: "up", severity: "critical", note: "Coal spike directly compresses coal & energy-linked trading margins.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
  { id: "steel", category: "commodity", name: "Steel / rebar", value: 0, unit: "index", change_pct: 9, direction: "up", severity: "medium", note: "Steel input inflation pressures NXST and construction-material margins.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
  { id: "bitumen", category: "commodity", name: "Bitumen", value: 0, unit: "index", change_pct: 7, direction: "up", severity: "medium", note: "Bitumen cost affects NXAB asphalt channel.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
  { id: "freight", category: "supply", name: "Ocean freight rates", value: 0, unit: "index", change_pct: 11, direction: "up", severity: "critical", note: "Routing disruption + higher bunker lift import landed cost and lead times.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
  { id: "geo", category: "crisis", name: "Geopolitical tension", value: 0, unit: "index", change_pct: 0, direction: "up", severity: "medium", note: "Regional shipping/sanctions risk — watch alternative sourcing.", source: "Baseline reference — update via biir_signal / market intel", updated_at: "2026-11-02T02:15:00Z", active: true },
];

/** romi_survey_form — 00023 default as relabelled by 00029. */
export const DEMO_SURVEY_FIELDS: RomiSurveyField[] = [
  { key: "campaign_name", label: "Campaign Name", type: "text", required: true },
  { key: "category", label: "Category", type: "select", required: true, options: ["NXAT", "Digital", "BTL", "Outdoor", "Gift & Printing", "Research", "Trade Incentive Offer", "Other"] },
  { key: "start_date", label: "Start Date", type: "date", required: true },
  { key: "end_date", label: "End Date", type: "date", required: true },
  { key: "expense", label: "Actual Expense to Date (BDT)", type: "number", required: true },
];

export const DEMO_SURVEY_TITLE = "Campaign Submission";
export const DEMO_SURVEY_DESCRIPTION =
  "Standard campaign questions collected from ROMI users. Expenses are actuals already incurred: " +
  "for a multi-month campaign enter the cumulative spend from campaign start through the reporting " +
  "(previous) month; for a single-month campaign enter only the cost of that month.";

/** public.sbu_romi_map (00013) — flash sbu.id <-> ROMI business_unit_id. */
export const SBU_ROMI_MAP: { sbu_id: number; business_unit_id: number; code: string }[] = [
  { sbu_id: 19, business_unit_id: 8, code: "NXPL" },
  { sbu_id: 36, business_unit_id: 144, code: "NXES" },
  { sbu_id: 58, business_unit_id: 4, code: "NXCM" },
  { sbu_id: 64, business_unit_id: 17, code: "NXSL" },
  { sbu_id: 69, business_unit_id: 175, code: "NXRM" },
  { sbu_id: 72, business_unit_id: 178, code: "NXCL1" },
  { sbu_id: 77, business_unit_id: 182, code: "NXCL2" },
  { sbu_id: 79, business_unit_id: 12, code: "NXOC" },
  { sbu_id: 80, business_unit_id: 102, code: "NXSL1" },
  { sbu_id: 81, business_unit_id: 117, code: "NXMT" },
  { sbu_id: 82, business_unit_id: 184, code: "NXBO" },
  { sbu_id: 83, business_unit_id: 186, code: "NXBP" },
  { sbu_id: 84, business_unit_id: 138, code: "NXIT" },
  { sbu_id: 86, business_unit_id: 188, code: "NXHM" },
  { sbu_id: 87, business_unit_id: 189, code: "NXFL" },
  { sbu_id: 88, business_unit_id: 208, code: "NXSE" },
  { sbu_id: 91, business_unit_id: 211, code: "NXNT" },
  { sbu_id: 98, business_unit_id: 220, code: "NXAB" },
  { sbu_id: 99, business_unit_id: 221, code: "NXAL" },
  { sbu_id: 102, business_unit_id: 224, code: "NXST" },
  { sbu_id: 109, business_unit_id: 232, code: "NXAF" },
  { sbu_id: 110, business_unit_id: 233, code: "NXSC" },
  { sbu_id: 114, business_unit_id: 237, code: "NXLE" },
  { sbu_id: 115, business_unit_id: 238, code: "NXAI" },
  { sbu_id: 118, business_unit_id: 241, code: "NXAT" },
  { sbu_id: 120, business_unit_id: 243, code: "NXEF" },
  { sbu_id: 123, business_unit_id: 246, code: "NXEN" },
  { sbu_id: 124, business_unit_id: 247, code: "NXBL" },
  { sbu_id: 126, business_unit_id: 249, code: "NXOR" },
  { sbu_id: 128, business_unit_id: 251, code: "NXMX" },
  { sbu_id: 129, business_unit_id: 252, code: "NXNJ" },
  { sbu_id: 132, business_unit_id: 255, code: "NXMP" },
];

/** public.romi_sbu (branch-mark benchmarks + the 00026 marketing-led targets). */
export interface DemoRomiSbuRow {
  business_unit_id: number;
  code: string;
  name: string | null;
  gp_margin: number | null;
  benchmark_top: number | null;
  benchmark_bottom: number | null;
  benchmark_note: string | null;
  is_active: boolean | null;
  mkt_led_target_min_cr: number | null;
  mkt_led_target_max_cr: number | null;
}

export const DEMO_ROMI_SBUS: DemoRomiSbuRow[] = [
  { business_unit_id: 4, code: "NXCM", name: "NexaGroup Cement", gp_margin: 0.21, benchmark_top: 1.6, benchmark_bottom: 0.45, benchmark_note: "FY26-27 branch mark: volume-led retail activation.", is_active: true, mkt_led_target_min_cr: 136.67, mkt_led_target_max_cr: 136.67 },
  { business_unit_id: 224, code: "NXST", name: "NexaGroup Steel", gp_margin: 0.16, benchmark_top: 1.4, benchmark_bottom: 0.35, benchmark_note: "Rebar margin pressure — mark set below cement.", is_active: true, mkt_led_target_min_cr: 218.67, mkt_led_target_max_cr: 218.67 },
  { business_unit_id: 175, code: "NXRM", name: "NexaGroup Readymix", gp_margin: 0.12, benchmark_top: 1.1, benchmark_bottom: 0.25, benchmark_note: "Range target: project-direct sales vary by quarter.", is_active: true, mkt_led_target_min_cr: 16.67, mkt_led_target_max_cr: 26.67 },
  { business_unit_id: 144, code: "NXES", name: "NexaGroup Essentials", gp_margin: 0.24, benchmark_top: 2.1, benchmark_bottom: 0.7, benchmark_note: "FMCG brand-led; highest mark in the portfolio.", is_active: true, mkt_led_target_min_cr: 74.0, mkt_led_target_max_cr: 78.33 },
  { business_unit_id: 232, code: "NXAF", name: "NexaGroup Feed", gp_margin: 0.11, benchmark_top: 1.3, benchmark_bottom: 0.3, benchmark_note: "Farmer-network trade activity.", is_active: true, mkt_led_target_min_cr: 81.67, mkt_led_target_max_cr: 81.67 },
  { business_unit_id: 237, code: "NXLE", name: "NXLE (Enovar)", gp_margin: 0.19, benchmark_top: 1.8, benchmark_bottom: 0.5, benchmark_note: "Consumer appliance launch year.", is_active: true, mkt_led_target_min_cr: 54.67, mkt_led_target_max_cr: 54.67 },
  { business_unit_id: 249, code: "ACEL", name: "Consumer Electronics (Orca)", gp_margin: 0.14, benchmark_top: 1.5, benchmark_bottom: 0.4, benchmark_note: "Retail-chain visibility spend.", is_active: true, mkt_led_target_min_cr: 4.47, mkt_led_target_max_cr: 4.47 },
  { business_unit_id: 221, code: "NXAL", name: "Commodities (Oasis)", gp_margin: 0.08, benchmark_top: 1.0, benchmark_bottom: 0.2, benchmark_note: "Low-margin trading; mark reflects pass-through cost.", is_active: true, mkt_led_target_min_cr: 12.0, mkt_led_target_max_cr: 12.0 },
  { business_unit_id: 238, code: "NXAI", name: "Automobile (Tyre)", gp_margin: 0.1, benchmark_top: 1.2, benchmark_bottom: 0.3, benchmark_note: "Partner-brand tyre pull-through.", is_active: true, mkt_led_target_min_cr: 5.94, mkt_led_target_max_cr: 5.94 },
  { business_unit_id: 220, code: "NXAB", name: "Building Solutions", gp_margin: 0.17, benchmark_top: 1.35, benchmark_bottom: 0.35, benchmark_note: "Asphalt project wins are lumpy.", is_active: true, mkt_led_target_min_cr: null, mkt_led_target_max_cr: null },
  { business_unit_id: 188, code: "NXHM", name: "Harvest Rice Mills", gp_margin: 0.09, benchmark_top: 1.15, benchmark_bottom: 0.28, benchmark_note: "Staple-food trade offers.", is_active: true, mkt_led_target_min_cr: null, mkt_led_target_max_cr: null },
  { business_unit_id: 252, code: "NXNJ", name: "NextJobs", gp_margin: 0.31, benchmark_top: 2.4, benchmark_bottom: 0.9, benchmark_note: "Digital-only acquisition cost base.", is_active: true, mkt_led_target_min_cr: 0.46, mkt_led_target_max_cr: 0.46 },
  { business_unit_id: 255, code: "NXMP", name: "Mediplex", gp_margin: 0.22, benchmark_top: 1.9, benchmark_bottom: 0.6, benchmark_note: "Healthcare channel build-out.", is_active: true, mkt_led_target_min_cr: 2.33, mkt_led_target_max_cr: 2.33 },
  { business_unit_id: 300, code: "ALCL", name: "Pharmacy / PartnerFeed", gp_margin: 0.26, benchmark_top: 2.0, benchmark_bottom: 0.65, benchmark_note: "Retail pharmacy network ramp.", is_active: true, mkt_led_target_min_cr: 10.9, mkt_led_target_max_cr: 10.9 },
  { business_unit_id: 301, code: "AMQL", name: "Mediquip", gp_margin: 0.18, benchmark_top: null, benchmark_bottom: null, benchmark_note: null, is_active: true, mkt_led_target_min_cr: 3.33, mkt_led_target_max_cr: 3.33 },
  { business_unit_id: 302, code: "AASL", name: "NexaGroup Air", gp_margin: 0.06, benchmark_top: 0.9, benchmark_bottom: 0.15, benchmark_note: "Loss-making year — spend mark deliberately low.", is_active: true, mkt_led_target_min_cr: 3.7, mkt_led_target_max_cr: 6.67 },
  { business_unit_id: 303, code: "AALL", name: "AgriLife", gp_margin: 0.2, benchmark_top: 1.7, benchmark_bottom: 0.55, benchmark_note: "Seasonal crop-input window.", is_active: true, mkt_led_target_min_cr: 10.0, mkt_led_target_max_cr: 13.33 },
  { business_unit_id: 304, code: "ALML", name: "Landmark", gp_margin: 0.15, benchmark_top: null, benchmark_bottom: null, benchmark_note: null, is_active: false, mkt_led_target_min_cr: 25.78, mkt_led_target_max_cr: 25.78 },
];

/** public.romi_campaign base rows (money is raw BDT). */
export interface DemoRomiCampaignRow {
  id: number;
  business_unit_id: number;
  campaign_name: string;
  category: string;
  report_month: string;
  start_date: string;
  end_date: string;
  officer_name: string;
  officer_enroll: string;
  marketing_expense_total: number;
  actual_rev: number | null;
  organic_rev: number | null;
  sply_rev: number | null;
  gp_margin: number | null;
  spend_pool_total: number | null;
  n_months: number | null;
  as_of: string | null;
  /** admin overrides — only a couple of rows carry them (mirrors the DB) */
  actual_rev_ov?: number | null;
  gp_margin_ov?: number | null;
  romi_top_ov?: number | null;
  extra_fields?: Record<string, unknown> | null;
}

export const DEMO_ROMI_CAMPAIGNS: DemoRomiCampaignRow[] = [
  { id: 1, business_unit_id: 4, campaign_name: "Monsoon Retail Push", category: "BTL", report_month: "2026-09", start_date: "2026-08-15", end_date: "2026-09-30", officer_name: "Rifat Chowdhury", officer_enroll: "NEX-4021", marketing_expense_total: 42_000_000, actual_rev: 486_000_000, organic_rev: 388_000_000, sply_rev: 351_000_000, gp_margin: 0.21, spend_pool_total: 45_000_000, n_months: 2, as_of: "2026-10-05", extra_fields: { channel: "Retail dealers", regions: "4" } },
  { id: 2, business_unit_id: 4, campaign_name: "Mason Network Programme", category: "Trade Incentive Offer", report_month: "2026-10", start_date: "2026-10-01", end_date: "2026-10-31", officer_name: "Rifat Chowdhury", officer_enroll: "NEX-4021", marketing_expense_total: 18_500_000, actual_rev: 262_000_000, organic_rev: 214_000_000, sply_rev: 205_000_000, gp_margin: 0.21, spend_pool_total: 19_000_000, n_months: 1, as_of: "2026-11-05" },
  { id: 3, business_unit_id: 224, campaign_name: "Site Direct Rebar Tie-up", category: "BTL", report_month: "2026-09", start_date: "2026-09-01", end_date: "2026-09-30", officer_name: "Nusrat Hossain", officer_enroll: "NEX-4188", marketing_expense_total: 26_000_000, actual_rev: 331_000_000, organic_rev: 268_000_000, sply_rev: 244_000_000, gp_margin: 0.16, spend_pool_total: 27_000_000, n_months: 1, as_of: "2026-10-05" },
  { id: 4, business_unit_id: 224, campaign_name: "Fabricator Partnership Drive", category: "Outdoor", report_month: "2026-10", start_date: "2026-10-05", end_date: "2026-11-20", officer_name: "Nusrat Hossain", officer_enroll: "NEX-4188", marketing_expense_total: 21_500_000, actual_rev: 198_000_000, organic_rev: 172_000_000, sply_rev: 150_000_000, gp_margin: 0.16, spend_pool_total: 16_000_000, n_months: 2, as_of: "2026-11-05" },
  { id: 5, business_unit_id: 144, campaign_name: "Festival Pack Refresh", category: "Digital", report_month: "2026-08", start_date: "2026-08-01", end_date: "2026-08-31", officer_name: "Tasnim Rahman", officer_enroll: "NEX-3907", marketing_expense_total: 34_000_000, actual_rev: 402_000_000, organic_rev: 268_000_000, sply_rev: 240_000_000, gp_margin: 0.24, spend_pool_total: 33_000_000, n_months: 1, as_of: "2026-09-05", extra_fields: { platforms: "Social + OTT" } },
  { id: 6, business_unit_id: 144, campaign_name: "Urban Kitchen Sampling", category: "BTL", report_month: "2026-09", start_date: "2026-09-10", end_date: "2026-10-10", officer_name: "Tasnim Rahman", officer_enroll: "NEX-3907", marketing_expense_total: 15_500_000, actual_rev: 176_000_000, organic_rev: 131_000_000, sply_rev: 118_000_000, gp_margin: 0.24, spend_pool_total: 14_000_000, n_months: 1, as_of: "2026-10-05" },
  { id: 7, business_unit_id: 144, campaign_name: "Loyalty Bundle Wave 2", category: "Trade Incentive Offer", report_month: "2026-10", start_date: "2026-10-01", end_date: "2026-11-30", officer_name: "Tasnim Rahman", officer_enroll: "NEX-3907", marketing_expense_total: 12_000_000, actual_rev: 240_000_000, organic_rev: 196_000_000, sply_rev: 171_000_000, gp_margin: 0.24, spend_pool_total: 11_000_000, n_months: 2, as_of: "2026-11-05" },
  { id: 8, business_unit_id: 232, campaign_name: "Poultry Health Camp", category: "BTL", report_month: "2026-09", start_date: "2026-09-05", end_date: "2026-09-28", officer_name: "Mahmud Karim", officer_enroll: "NEX-4410", marketing_expense_total: 9_500_000, actual_rev: 168_000_000, organic_rev: 141_000_000, sply_rev: 133_000_000, gp_margin: 0.11, spend_pool_total: 9_000_000, n_months: 1, as_of: "2026-10-05" },
  { id: 9, business_unit_id: 232, campaign_name: "Feed Dealer Credit Push", category: "Trade Incentive Offer", report_month: "2026-10", start_date: "2026-10-01", end_date: "2026-10-31", officer_name: "Mahmud Karim", officer_enroll: "NEX-4410", marketing_expense_total: 14_000_000, actual_rev: 205_000_000, organic_rev: 178_000_000, sply_rev: 162_000_000, gp_margin: 0.11, spend_pool_total: 13_500_000, n_months: 1, as_of: "2026-11-05" },
  { id: 10, business_unit_id: 175, campaign_name: "Bridge Project Bid Support", category: "Research", report_month: "2026-09", start_date: "2026-08-20", end_date: "2026-09-30", officer_name: "Farhana Yasmin", officer_enroll: "NEX-4033", marketing_expense_total: 6_500_000, actual_rev: 88_000_000, organic_rev: 71_000_000, sply_rev: 64_000_000, gp_margin: 0.12, spend_pool_total: 6_000_000, n_months: 2, as_of: "2026-10-05", actual_rev_ov: 96_000_000 },
  { id: 11, business_unit_id: 237, campaign_name: "ENOVAR Launch Wave 1", category: "Outdoor", report_month: "2026-10", start_date: "2026-10-01", end_date: "2026-12-31", officer_name: "Imran Sadique", officer_enroll: "NEX-3877", marketing_expense_total: 28_000_000, actual_rev: 121_000_000, organic_rev: 74_000_000, sply_rev: 52_000_000, gp_margin: 0.19, spend_pool_total: 26_000_000, n_months: 3, as_of: "2026-11-05" },
  { id: 12, business_unit_id: 249, campaign_name: "Orca Retail Corner Activation", category: "Digital", report_month: "2026-10", start_date: "2026-10-10", end_date: "2026-11-15", officer_name: "Imran Sadique", officer_enroll: "NEX-3877", marketing_expense_total: 7_500_000, actual_rev: 44_000_000, organic_rev: 33_000_000, sply_rev: 29_000_000, gp_margin: 0.14, spend_pool_total: 7_000_000, n_months: 1, as_of: "2026-11-05" },
  { id: 13, business_unit_id: 221, campaign_name: "Commodity Buyer Roundtable", category: "Other", report_month: "2026-08", start_date: "2026-08-01", end_date: "2026-08-14", officer_name: "Sabbir Ahmed", officer_enroll: "NEX-4512", marketing_expense_total: 2_500_000, actual_rev: 61_000_000, organic_rev: 55_000_000, sply_rev: 48_000_000, gp_margin: 0.08, spend_pool_total: 2_400_000, n_months: 1, as_of: "2026-09-05" },
  { id: 14, business_unit_id: 238, campaign_name: "Fleet Tyre Exchange Offer", category: "Trade Incentive Offer", report_month: "2026-09", start_date: "2026-09-01", end_date: "2026-10-31", officer_name: "Sabbir Ahmed", officer_enroll: "NEX-4512", marketing_expense_total: 4_800_000, actual_rev: 29_000_000, organic_rev: 22_000_000, sply_rev: 19_000_000, gp_margin: 0.1, spend_pool_total: 4_600_000, n_months: 2, as_of: "2026-10-05" },
  { id: 15, business_unit_id: 220, campaign_name: "Highway Bitumen Tender Support", category: "BTL", report_month: "2026-10", start_date: "2026-10-01", end_date: "2026-10-31", officer_name: "Farhana Yasmin", officer_enroll: "NEX-4033", marketing_expense_total: 5_500_000, actual_rev: 71_000_000, organic_rev: 58_000_000, sply_rev: 51_000_000, gp_margin: 0.17, spend_pool_total: 5_200_000, n_months: 1, as_of: "2026-11-05" },
  { id: 16, business_unit_id: 188, campaign_name: "Haar Bazaar Direct Sale", category: "BTL", report_month: "2026-10", start_date: "2026-10-15", end_date: "2026-11-10", officer_name: "Jahid Iqbal", officer_enroll: "NEX-4256", marketing_expense_total: 8_200_000, actual_rev: 112_000_000, organic_rev: 96_000_000, sply_rev: 88_000_000, gp_margin: 0.09, spend_pool_total: 7_900_000, n_months: 1, as_of: "2026-11-05" },
  { id: 17, business_unit_id: 252, campaign_name: "Employer Subscription Trial", category: "Digital", report_month: "2026-09", start_date: "2026-09-01", end_date: "2026-09-30", officer_name: "Priya Nath", officer_enroll: "NEX-4699", marketing_expense_total: 1_900_000, actual_rev: 6_200_000, organic_rev: 3_800_000, sply_rev: 2_900_000, gp_margin: 0.31, spend_pool_total: 1_800_000, n_months: 1, as_of: "2026-10-05" },
  { id: 18, business_unit_id: 255, campaign_name: "Hospital Diagnostic Bundle", category: "Gift & Printing", report_month: "2026-10", start_date: "2026-10-01", end_date: "2026-10-31", officer_name: "Priya Nath", officer_enroll: "NEX-4699", marketing_expense_total: 3_100_000, actual_rev: 14_500_000, organic_rev: 11_000_000, sply_rev: 9_400_000, gp_margin: 0.22, spend_pool_total: 3_000_000, n_months: 1, as_of: "2026-11-05", romi_top_ov: 2.1 },
  { id: 19, business_unit_id: 8, campaign_name: "Woven Sack Export Buyer Meet", category: "Research", report_month: "2026-08", start_date: "2026-08-05", end_date: "2026-09-05", officer_name: "Jahid Iqbal", officer_enroll: "NEX-4256", marketing_expense_total: 4_400_000, actual_rev: 52_000_000, organic_rev: 44_000_000, sply_rev: 39_000_000, gp_margin: 0.13, spend_pool_total: 4_200_000, n_months: 1, as_of: "2026-09-05" },
  { id: 20, business_unit_id: 300, campaign_name: "Pharmacy Chain Shelf Deal", category: "Trade Incentive Offer", report_month: "2026-10", start_date: "2026-10-01", end_date: "2026-12-31", officer_name: "Lamia Sarker", officer_enroll: "NEX-4731", marketing_expense_total: 9_800_000, actual_rev: 38_000_000, organic_rev: 24_000_000, sply_rev: 20_000_000, gp_margin: 0.26, spend_pool_total: 9_200_000, n_months: 3, as_of: "2026-11-05" },
];

/** public.employees — fictional demo accounts (see Login.tsx hint). */
export interface DemoEmployeeRow {
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  password: string | null;
  allowed_sbus: number[];
  capability: EmployeeCapability;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export const DEMO_ADMIN_EMAIL = "admin@nexagroup.test";

export const DEMO_EMPLOYEES: DemoEmployeeRow[] = [
  { user_id: "00000000-0000-4000-8000-000000000001", name: "Rifat Chowdhury", email: "officer@nexagroup.test", phone: "+880 1700 000 101", password: "Demo#Pass1", allowed_sbus: [58, 102], capability: "both", is_active: true, expires_at: null, created_at: "2026-06-11T09:15:00Z" },
  { user_id: "00000000-0000-4000-8000-000000000002", name: "Tasnim Rahman", email: "brand@nexagroup.test", phone: "+880 1700 000 102", password: null, allowed_sbus: [36, 86], capability: "romi", is_active: true, expires_at: null, created_at: "2026-07-02T11:40:00Z" },
  { user_id: "00000000-0000-4000-8000-000000000003", name: "Mahmud Karim", email: "view@nexagroup.test", phone: "+880 1700 000 103", password: "Demo#Pass3", allowed_sbus: [109, 87], capability: "view", is_active: true, expires_at: null, created_at: "2026-08-19T08:05:00Z" },
  { user_id: "00000000-0000-4000-8000-000000000004", name: "Nusrat Hossain", email: "ops@nexagroup.test", phone: "+880 1700 000 104", password: null, allowed_sbus: [64, 79, 88], capability: "view", is_active: false, expires_at: null, created_at: "2026-05-28T14:20:00Z" },
];

/** Partner feed (demo retail chain) — outlet and department dimensions. */
export const DEMO_PARTNER_OFFICES: { office_id: number; name: string; address: string }[] = [
  { office_id: 401, name: "NexaMart Gulshan", address: "Gulshan Avenue" },
  { office_id: 402, name: "NexaMart Dhanmondi", address: "Road 27, Dhanmondi" },
  { office_id: 403, name: "NexaMart Uttara", address: "Sector 7, Uttara" },
  { office_id: 404, name: "NexaMart Chattogram", address: "GEC Circle, Chattogram" },
  { office_id: 405, name: "NexaMart Sylhet", address: "Zindabazar, Sylhet" },
  { office_id: 406, name: "NexaMart Khulna", address: "Khan Jahan Avenue, Khulna" },
];

/** department -> share of daily sales, and its margin profile (percent). */
export const DEMO_PARTNER_DEPARTMENTS: {
  name: string;
  share: number;
  margin: number;
}[] = [
  { name: "Grocery & FMCG", share: 0.34, margin: 14 },
  { name: "Personal Care & Beauty", share: 0.18, margin: 26 },
  { name: "Home Appliances", share: 0.16, margin: 11 },
  { name: "Textiles & Apparel", share: 0.14, margin: 31 },
  { name: "Pharmacy", share: 0.11, margin: 19 },
  { name: "Frozen & Dairy", share: 0.07, margin: 12 },
];

/** How much of the demo window the SKU-level fact covers (months). */
export const DEMO_SKU_MONTHS = 12;
