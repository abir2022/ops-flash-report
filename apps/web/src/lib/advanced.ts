// Pure analytics for the "Advanced Analysis" tab.
// All functions are side-effect free and operate on plain arrays so they
// are unit-testable without a database.

export interface DailyPoint {
  d: string; // "YYYY-MM-DD"
  value: number; // Cr (or quantity) for that day
}

export interface WeekdayRow {
  dow: number; // 0 = Sunday … 6 = Saturday
  label: string;
  avg: number; // average value on that weekday
  index: number; // avg / overall-avg * 100 (100 = an average day)
  days: number; // number of observations
}

export interface MonthRow {
  month: number; // 1..12
  label: string;
  avg: number; // average daily value in that calendar month (all years pooled)
  index: number; // seasonal index, 100 = average month
  days: number;
}

export interface SkuItem {
  item_id: number;
  name: string;
  value: number; // Cr revenue — the ranking measure
  quantity?: number; // volume (units, in the SBU's dominant UOM)
  uom?: string | null;
  category?: string | null;
}

export interface SkuItemVol {
  item_id: number;
  name: string;
  quantity: number; // separate quantity from value (revenue)
}

export interface SkuAbcRow extends SkuItem {
  rank: number;
  share: number; // % of total
  cumulativeShare: number; // running %
  cls: "A" | "B" | "C";
}

export interface Pareto {
  n: number;
  top5Share: number; // % of total from top 5 SKUs
  top10Share: number; // % of total from top 10 SKUs
  hhi: number; // Herfindahl–Hirschman index (0–10000)
}

export interface SeriesPoint {
  label: string; // "YYYY-MM"
  value: number;
}

export interface MonthlyTarget {
  period_month: string; // "YYYY-MM"
  value: number; // target revenue (Cr) or quantity for that month
}

export interface ForecastMonth {
  month: string; // "YYYY-MM"
  label: string; // "Oct 26"
  target: number;
  actual: number; // current FY actual for that month (0 for future months)
  forecast: number; // forecast for future months (0 otherwise)
  seasonalIndex: number; // 4-FY month-of-year index, 100 = average month
  priorYears: number[]; // 4 prior-year same-month actuals (oldest → newest)
  isForecast: boolean;
}

export interface RunningProjection {
  month: string; // current "YYYY-MM"
  label: string;
  mtd: number; // current month MTD actual
  pacing: number; // historical fraction of the month elapsed by the as-of day (0..1)
  projected: number; // full-month projection
  target: number; // monthly target
  achievementPct: number | null; // projected / target * 100
}

export interface Calibration {
  factorPacing: number; // multiplicative correction for the running (MTD ÷ pacing) projection
  factorSeasonal: number; // multiplicative correction for the rest-of-FY forecast (target × A × S)
  mape: number | null; // mean absolute percentage error over recent closed-month samples, %
  bias: number | null; // signed bias (projected − actual) in Cr over the same samples
  samplesPacing: number; // prior-year pacing backtest samples used
  samplesSeasonal: number; // completed FY months used for the seasonal factor
}

export interface SeasonalShare {
  fyLabel: string; // "FY23"
  monthValue: number; // same-month revenue in that prior FY
  yearTotal: number; // that FY's total revenue (positive months only)
  share: number; // monthValue / yearTotal (0..1)
}

export interface SeasonalDetail {
  month: number; // 1..12
  shares: SeasonalShare[]; // one per prior FY with data
  avgShare: number; // average share (0..1)
  index: number; // avgShare * 12 * 100 (100 = average month)
}

export interface PreviousMonthForecast {
  month: string; // "YYYY-MM"
  label: string; // "Sep 26"
  target: number;
  forecast: number; // forecast that would have been made for it (target × A_before × S × C_s)
  actual: number; // realised revenue for that month
  error: number; // actual − forecast (Cr); positive = beat forecast
  errorPct: number | null; // error / forecast × 100 (forecast-relative), null if forecast ≤ 0
}

export interface ForecastResult {
  achievement: number; // A = Σ actual / Σ target over completed FY months
  months: ForecastMonth[]; // full FY (Jul → Jun), with prior-year overlay
  forecastMonths: ForecastMonth[]; // future months only
  nextMonth: ForecastMonth | null;
  currentMonth: ForecastMonth | null; // the in-progress month (forecast = seasonal engine, actual = MTD)
  previousMonth: PreviousMonthForecast | null; // most recently closed month's forecast vs actual
  basisMonths: number; // completed FY months used for A
  seasonalBasisYears: number; // prior FYs with data behind the seasonal index
  priorYearLabels: string[]; // short labels for priorYears (e.g. "FY23")
  ytdActual: number;
  ytdTarget: number;
  running: RunningProjection | null;
  calibration: Calibration;
  seasonalDetail: SeasonalDetail | null; // how next month's S was built (for the help panel)
}

// Chronological monthly totals (for the revenue-trend module). Distinct from
// monthlySeasonalIndex, which pools months across years to isolate seasonality.
export function monthlySeries(points: DailyPoint[]): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const p of points) {
    const k = p.d.slice(0, 7);
    map.set(k, (map.get(k) ?? 0) + p.value);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value }));
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Day-of-week for a "YYYY-MM-DD" string, evaluated in local time so Dhaka
// business dates are not shifted by UTC.
export function dayOfWeek(d: string): number {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? 0 : dt.getDay();
}

export function monthOf(d: string): number {
  const m = Number(d.slice(5, 7));
  return m >= 1 && m <= 12 ? m : 1;
}

function aggregate(points: DailyPoint[]): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const p of points) {
    total += p.value;
    count += 1;
  }
  return { total, count };
}

// Weekday seasonality: average value per day-of-week, indexed so 100 = the
// average day. Identifies which days of the week over/under-perform.
export function weekdayIndex(points: DailyPoint[]): WeekdayRow[] {
  const totals = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (const p of points) {
    const dow = dayOfWeek(p.d);
    totals[dow] += p.value;
    counts[dow] += 1;
  }
  const { total, count } = aggregate(points);
  const overallAvg = count ? total / count : 0;
  return DOW_LABELS.map((label, dow) => {
    const avg = counts[dow] ? totals[dow] / counts[dow] : 0;
    return {
      dow,
      label,
      avg,
      index: overallAvg ? (avg / overallAvg) * 100 : 0,
      days: counts[dow],
    };
  });
}

// Seasonal decomposition (month-of-year): pools every calendar month across
// all years in the series, then indexes each month so 100 = the average
// month. Exposes structural peaks/troughs (e.g. a construction/festival
// season) separately from growth.
export function monthlySeasonalIndex(points: DailyPoint[]): MonthRow[] {
  const totals = new Array(13).fill(0);
  const counts = new Array(13).fill(0);
  for (const p of points) {
    const m = monthOf(p.d);
    totals[m] += p.value;
    counts[m] += 1;
  }
  const { total, count } = aggregate(points);
  const overallAvg = count ? total / count : 0;
  return MONTH_LABELS.map((label, i) => {
    const m = i + 1;
    const avg = counts[m] ? totals[m] / counts[m] : 0;
    return {
      month: m,
      label,
      avg,
      index: overallAvg ? (avg / overallAvg) * 100 : 0,
      days: counts[m],
    };
  });
}

// SKU ABC (Pareto) classification. A = SKUs needed to reach 80% of total,
// B = the next 15% (to 95%), C = the long tail. Items are returned
// revenue-descending with cumulative share.
export function skuAbc(items: SkuItem[]): SkuAbcRow[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, x) => s + x.value, 0);
  const rows: SkuAbcRow[] = [];
  let running = 0;
  sorted.forEach((x, i) => {
    const share = total ? (x.value / total) * 100 : 0;
    const cumBefore = running;
    running += share;
    const cls: "A" | "B" | "C" = cumBefore < 80 ? "A" : cumBefore < 95 ? "B" : "C";
    rows.push({
      ...x,
      rank: i + 1,
      share,
      cumulativeShare: running,
      cls,
    });
  });
  return rows;
}

// Volume-wise ABC classification (uses quantity instead of revenue value).
// Items are classified A (top 80% of total quantity), B (next 15%), C (rest).
export function skuAbcVol(items: SkuItemVol[]): SkuAbcRow[] {
  return skuAbc(items.map((x) => ({ item_id: x.item_id, name: x.name, value: x.quantity })));
}

// Concentration metrics for volume (quantity): top-N share + HHI.
export function paretoConcentrationVol(items: SkuItemVol[]): Pareto {
  return paretoConcentration(
    items.map((x) => ({ item_id: x.item_id, name: x.name, value: x.quantity })),
  );
}

// ---------------------------------------------------------------------------
// Concentration metrics (revenue): how much of total revenue sits in the top
// SKUs, plus the HHI (higher = more concentrated / more single-SKU risk).
// ---------------------------------------------------------------------------
export function paretoConcentration(items: SkuItem[]): Pareto {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return { n: sorted.length, top5Share: 0, top10Share: 0, hhi: 0 };
  }
  const shareOf = (k: number) => {
    let s = 0;
    for (let i = 0; i < Math.min(k, sorted.length); i++) s += sorted[i].value;
    return (s / total) * 100;
  };
  const hhi = sorted.reduce((acc, x) => acc + (x.value / total) ** 2, 0) * 10000;
  return {
    n: sorted.length,
    top5Share: shareOf(5),
    top10Share: shareOf(10),
    hhi,
  };
}

// ---------------------------------------------------------------------------
// BCG Growth-Share Matrix (SKU level) — unchanged, but now also accepts
// SkuItemVol items via a conversion helper.
// ---------------------------------------------------------------------------

export type BcgQuadrant = "Star" | "Question Mark" | "Cash Cow" | "Dog";

export interface BcgRow {
  item_id: number;
  name: string;
  value: number; // current period revenue (Cr / qty)
  priorValue: number; // prior period revenue (0 = none recorded)
  growth: number | null; // % change vs prior; null = no prior baseline
  growthPlot: number; // growth clamped to [-100, 100] for charting; new = 100
  share: number; // % of current period total
  relativeShare: number; // value ÷ max value (0..1]
  quadrant: BcgQuadrant;
}

export interface BcgMatrix {
  rows: BcgRow[]; // revenue-descending
  shareThreshold: number; // median relative share (the X split)
  hasPriorData: boolean; // false → growth treated as flat
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function skuBcg(items: SkuItem[], prior: Map<number, number>): BcgMatrix {
  const positive = items.filter((x) => x.value > 0);
  const rows: BcgRow[] = [];
  if (positive.length === 0) {
    return { rows, shareThreshold: 0, hasPriorData: prior.size > 0 };
  }

  const total = positive.reduce((s, x) => s + x.value, 0);
  const maxValue = Math.max(...positive.map((x) => x.value));
  const relShares = positive.map((x) => x.value / maxValue);
  const shareThreshold = median(relShares);
  const hasPriorData = prior.size > 0;

  for (const x of positive) {
    const priorValue = prior.get(x.item_id) ?? 0;
    // growth is null when there is no prior baseline for this SKU (brand new).
    // When no prior data was loaded at all, treat growth as flat (0) so the
    // Y split degrades gracefully to a share-only view.
    const growth = !hasPriorData
      ? 0
      : priorValue > 0
        ? ((x.value - priorValue) / priorValue) * 100
        : null;
    const relativeShare = x.value / maxValue;
    const highGrowth = growth === null ? true : growth > 0;
    const highShare = relativeShare >= shareThreshold;
    const quadrant: BcgQuadrant =
      highGrowth && highShare
        ? "Star"
        : highGrowth
          ? "Question Mark"
          : highShare
            ? "Cash Cow"
            : "Dog";

    rows.push({
      item_id: x.item_id,
      name: x.name,
      value: x.value,
      priorValue,
      growth,
      growthPlot: growth === null ? 100 : clamp(growth, -100, 100),
      share: total > 0 ? (x.value / total) * 100 : 0,
      relativeShare,
      quadrant,
    });
  }

  rows.sort((a, b) => b.value - a.value);
  return { rows, shareThreshold, hasPriorData };
}

// ---------------------------------------------------------------------------
// District-level SKU analysis (Bangladesh demarcation).
// SKU sales are attributed to districts via an SBU→districts mapping, then the
// ABC / Pareto classification is computed per district so a user can compare
// concentration across a geographic footprint (e.g. Dhaka vs Chattogram).
// ---------------------------------------------------------------------------

export interface SkuDistrictRow {
  district: string;
  n: number; // number of SKUs in this district
  top5Share: number; // % of district revenue from top 5 SKUs
  top10Share: number;
  hhi: number; // concentration (0–10000)
  total: number; // total revenue in district
  topSkus: SkuAbcRow[]; // ranked SKUs (A/B/C) within the district
}

// A district mapping keyed by SBU id → list of district names it serves.
// Without a mapping, every item falls into a single "National" bucket.
export type SbuDistrictMap = Record<number, string[]>;

// Attribute each item to its district(s) and compute per-district concentration.
// Items that cannot be mapped (no SBU mapping, or empty district list) are
// grouped under "National". When `sbuDistricts` is undefined, every item is
// treated as "National" and a single-row summary is returned.
export function skuByDistrict(
  items: SkuItem[],
  sbuId: number,
  sbuDistricts?: SbuDistrictMap,
): SkuDistrictRow[] {
  const districts = sbuDistricts?.[sbuId];
  const keys = districts && districts.length > 0 ? districts : ["National"];

  // Bucket items into districts. Each item maps to every district in the SBU's
  // list (best-effort attribution when a finer district split is unavailable).
  const buckets = new Map<string, SkuItem[]>();
  for (const k of keys) buckets.set(k, []);
  for (const item of items) {
    for (const k of keys) buckets.get(k)!.push(item);
  }

  const out: SkuDistrictRow[] = [];
  for (const [district, list] of buckets) {
    const p = paretoConcentration(list);
    out.push({
      district,
      n: p.n,
      top5Share: p.top5Share,
      top10Share: p.top10Share,
      hhi: p.hhi,
      total: list.reduce((s, x) => s + x.value, 0),
      topSkus: skuAbc(list),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Category demarcation — the only grouping dimension actually present in the
// SKU sales feed (item `category_name`). Groups SKUs by category and computes
// revenue, volume and concentration per category so a user can see which
// product families dominate and how concentrated each is.
// ---------------------------------------------------------------------------

export interface SkuCategoryRow {
  category: string;
  n: number; // number of SKUs
  revenue: number; // Cr
  quantity: number; // units
  share: number; // % of total revenue
  top5Share: number; // % of category revenue from top 5 SKUs
  hhi: number; // concentration within the category (0–10000)
  topSkus: SkuAbcRow[];
}

export function skuByCategory(items: SkuItem[]): SkuCategoryRow[] {
  const buckets = new Map<string, SkuItem[]>();
  for (const it of items) {
    const key = (it.category ?? "").trim() || "Uncategorised";
    const list = buckets.get(key) ?? [];
    list.push(it);
    buckets.set(key, list);
  }

  const totalRevenue = items.reduce((s, x) => s + x.value, 0);

  const out: SkuCategoryRow[] = [];
  for (const [category, list] of buckets) {
    const p = paretoConcentration(list);
    out.push({
      category,
      n: list.length,
      revenue: list.reduce((s, x) => s + x.value, 0),
      quantity: list.reduce((s, x) => s + (x.quantity ?? 0), 0),
      share: totalRevenue > 0 ? (list.reduce((s, x) => s + x.value, 0) / totalRevenue) * 100 : 0,
      top5Share: p.top5Share,
      hhi: p.hhi,
      topSkus: skuAbc(list),
    });
  }
  return out.sort((a, b) => b.revenue - a.revenue);
}

// Revenue per unit (BDT) for a SKU — a rough proxy for premium vs commodity
// positioning. value is in Cr, so BDT = value × 1e7. Null when volume is absent.
export function skuUnitPrice(item: SkuItem): number | null {
  const qty = item.quantity ?? 0;
  if (qty <= 0) return null;
  return (item.value * 1e7) / qty;
}

// ---------------------------------------------------------------------------
// Forecast (rest-of-fiscal-year projection from 4 fiscal years of history)
// ---------------------------------------------------------------------------

function ymToDate(ym: string): Date {
  return new Date(`${ym}-01T00:00:00`);
}

function addMonths(ym: string, n: number): string {
  const d = ymToDate(ym);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function labelYm(ym: string): string {
  const m = Number(ym.slice(5, 7));
  const y = ym.slice(2, 4);
  return `${MONTH_LABELS[m - 1] ?? m} ${y}`;
}

function daysInMonthYm(ym: string): number {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return new Date(y, m, 0).getDate();
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Positive-month totals for one fiscal year (Jul y .. Jun y+1). Negative
// months (e.g. year-end reversals) are excluded so they cannot distort the
// year's share base.
function fiscalYearPositive(
  monthly: Map<string, number>,
  y: number,
): { total: number; byMonth: Map<number, number> } {
  const byMonth = new Map<number, number>();
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    const calYear = m >= 7 ? y : y + 1;
    const v = monthly.get(`${calYear}-${pad2(m)}`) ?? 0;
    if (v > 0) {
      byMonth.set(m, v);
      total += v;
    }
  }
  return { total, byMonth };
}

// Month-of-year seasonal index from 4 fiscal years, normalized per-year so
// YoY growth does not masquerade as seasonality. For each prior year the month
// share = month / year-total is computed, then averaged across years and
// scaled so 100 = an average month (1/12 of the year).
function seasonalIndex4y(
  monthly: Map<string, number>,
  priorStartYears: number[],
): { index: Map<number, number>; yearsWithData: number } {
  const shareSum = new Array(13).fill(0);
  const monthYears = new Array(13).fill(0);
  let yearsWithData = 0;
  for (const y of priorStartYears) {
    const { total, byMonth } = fiscalYearPositive(monthly, y);
    if (total <= 0) continue;
    yearsWithData += 1;
    for (const [m, v] of byMonth) {
      shareSum[m] += v / total;
      monthYears[m] += 1;
    }
  }
  const index = new Map<number, number>();
  for (let m = 1; m <= 12; m++) {
    const n = monthYears[m] > 0 ? monthYears[m] : yearsWithData;
    const avgShare = n > 0 ? shareSum[m] / n : 1 / 12;
    index.set(m, avgShare * 12 * 100);
  }
  return { index, yearsWithData };
}

// Per-year share breakdown for one month — used to explain how S(m) is built.
function seasonalShareDetail(
  monthly: Map<string, number>,
  priorStartYears: number[],
  month: number,
): SeasonalDetail | null {
  const shares: SeasonalShare[] = [];
  for (const y of priorStartYears) {
    const { total, byMonth } = fiscalYearPositive(monthly, y);
    if (total <= 0) continue;
    const v = byMonth.get(month) ?? 0;
    if (v <= 0) continue;
    shares.push({
      fyLabel: `FY${(y + 1) % 100}`,
      monthValue: v,
      yearTotal: total,
      share: v / total,
    });
  }
  if (shares.length === 0) return null;
  const avgShare = shares.reduce((s, x) => s + x.share, 0) / shares.length;
  return { month, shares, avgShare, index: avgShare * 12 * 100 };
}

function priorYearValues(
  monthly: Map<string, number>,
  priorStartYears: number[],
  month: number,
): number[] {
  return priorStartYears.map((y) => {
    const calYear = month >= 7 ? y : y + 1;
    return monthly.get(`${calYear}-${pad2(month)}`) ?? 0;
  });
}

function buildRunningProjection(
  nowYm: string,
  nowMonth: number,
  asOfDay: number,
  monthly: Map<string, number>,
  daily: Map<string, number>,
  targetMap: Map<string, number>,
  priorStartYears: number[],
  factorPacing = 1,
): RunningProjection {
  const mtd = monthly.get(nowYm) ?? 0;
  const target = targetMap.get(nowYm) ?? 0;

  // Historical pacing: for each prior FY's same calendar month, the fraction
  // of the month realized through the as-of day (capped at month length).
  const pacings: number[] = [];
  for (const y of priorStartYears) {
    const calYear = nowMonth >= 7 ? y : y + 1;
    const ym = `${calYear}-${pad2(nowMonth)}`;
    const full = monthly.get(ym) ?? 0;
    if (full <= 0) continue;
    const capDay = Math.min(asOfDay, daysInMonthYm(ym));
    let through = 0;
    for (let d = 1; d <= capDay; d++) through += daily.get(`${ym}-${pad2(d)}`) ?? 0;
    pacings.push(through / full);
  }
  const pacing =
    pacings.length > 0
      ? pacings.reduce((s, x) => s + x, 0) / pacings.length
      : asOfDay / daysInMonthYm(nowYm);
  const projectedRaw = pacing > 0 ? mtd / pacing : 0;
  const projected = projectedRaw * factorPacing;
  const achievementPct = target > 0 ? (projected / target) * 100 : null;

  return {
    month: nowYm,
    label: labelYm(nowYm),
    mtd,
    pacing,
    projected,
    target,
    achievementPct,
  };
}

// ---- Continuous-learning calibration -------------------------------------
// After each month closes, its realised revenue can be compared to what the
// two projection engines forecast for it, and a per-SBU multiplicative bias
// factor is learned so future projections track reality more closely. Both the
// running (MTD ÷ pacing) engine and the rest-of-FY (target × A × S) engine are
// calibrated independently, with warm-up and clamp guard rails so a single
// noisy month cannot push the model off course.

const CALIB_FACTOR_MIN = 0.8;
const CALIB_FACTOR_MAX = 1.25;
const CALIB_MIN_SAMPLES = 3;

interface CalibrationSample {
  projected: number;
  actual: number;
}

function calibrationFactor(samples: CalibrationSample[]): number {
  const valid = samples.filter((s) => s.projected > 0 && s.actual > 0);
  if (valid.length < CALIB_MIN_SAMPLES) return 1;
  const f =
    valid.reduce((sum, s) => sum + s.actual / s.projected, 0) / valid.length;
  return Math.min(CALIB_FACTOR_MAX, Math.max(CALIB_FACTOR_MIN, f));
}

function calibrationMape(samples: CalibrationSample[]): number | null {
  const valid = samples.filter((s) => s.actual > 0);
  if (valid.length === 0) return null;
  const sum = valid.reduce(
    (acc, s) => acc + Math.abs(s.projected - s.actual) / s.actual,
    0,
  );
  return (sum / valid.length) * 100;
}

function calibrationBias(samples: CalibrationSample[]): number | null {
  const valid = samples.filter((s) => s.actual > 0);
  if (valid.length === 0) return null;
  return valid.reduce((acc, s) => acc + (s.projected - s.actual), 0) / valid.length;
}

// Core calibration given already-indexed data (shared by forecastFiscal and the
// public calibrateForecast wrapper).
function computeCalibration(
  monthly: Map<string, number>,
  daily: Map<string, number>,
  targetMap: Map<string, number>,
  priorStartYears: number[],
  seasonIndex: Map<number, number>,
  achievement: number,
  completed: string[],
  nowMonth: number,
  asOfDay: number,
): Calibration {
  // Pacing engine: replay "MTD ÷ pacing" for the same calendar month in each
  // prior FY as of the current as-of day (leave-one-out pacing so a year never
  // uses its own full-month total when predicting itself), then compare to the
  // realised full-month revenue.
  const pacingSamples: CalibrationSample[] = [];
  for (const y of priorStartYears) {
    const calYear = nowMonth >= 7 ? y : y + 1;
    const ym = `${calYear}-${pad2(nowMonth)}`;
    const full = monthly.get(ym) ?? 0;
    if (full <= 0) continue;
    const capDay = Math.min(asOfDay, daysInMonthYm(ym));
    let through = 0;
    for (let d = 1; d <= capDay; d++) through += daily.get(`${ym}-${pad2(d)}`) ?? 0;

    const pacings: number[] = [];
    for (const z of priorStartYears) {
      if (z === y) continue;
      const zYear = nowMonth >= 7 ? z : z + 1;
      const zYm = `${zYear}-${pad2(nowMonth)}`;
      const zFull = monthly.get(zYm) ?? 0;
      if (zFull <= 0) continue;
      const zCap = Math.min(asOfDay, daysInMonthYm(zYm));
      let zThrough = 0;
      for (let d = 1; d <= zCap; d++) zThrough += daily.get(`${zYm}-${pad2(d)}`) ?? 0;
      pacings.push(zThrough / zFull);
    }
    const pacing =
      pacings.length > 0 ? pacings.reduce((s, x) => s + x, 0) / pacings.length : 0;
    if (pacing <= 0) continue;
    pacingSamples.push({ projected: through / pacing, actual: full });
  }

  // Seasonal engine: for each completed FY month compare target × A × S to the
  // realised revenue. Thin early in the year, so the factor stays at 1 until
  // CALIB_MIN_SAMPLES months have closed.
  const seasonalSamples: CalibrationSample[] = [];
  for (const m of completed) {
    const target = targetMap.get(m) ?? 0;
    const actual = monthly.get(m) ?? 0;
    if (target <= 0 || actual <= 0) continue;
    const sIndex = seasonIndex.get(Number(m.slice(5, 7))) ?? 100;
    const sFactor = sIndex > 0 ? sIndex / 100 : 1;
    seasonalSamples.push({ projected: target * achievement * sFactor, actual });
  }

  const all = [...pacingSamples, ...seasonalSamples];

  return {
    factorPacing: calibrationFactor(pacingSamples),
    factorSeasonal: calibrationFactor(seasonalSamples),
    mape: calibrationMape(all),
    bias: calibrationBias(all),
    samplesPacing: pacingSamples.length,
    samplesSeasonal: seasonalSamples.length,
  };
}

// Public entry point for the calibration maths — self-contained (indexes its own
// maps) so it is unit-testable in isolation from forecastFiscal.
export function calibrateForecast(
  history: DailyPoint[],
  targets: MonthlyTarget[],
  asOf?: string,
): Calibration {
  const now = asOf ?? localToday();
  const nowYm = now.slice(0, 7);
  const nowMonth = monthOf(now);
  const nowYear = Number(now.slice(0, 4));
  const fyStartYear = nowMonth >= 7 ? nowYear : nowYear - 1;
  const fyStart = `${fyStartYear}-07`;

  const monthly = new Map<string, number>();
  const daily = new Map<string, number>();
  for (const p of history) {
    const ym = p.d.slice(0, 7);
    monthly.set(ym, (monthly.get(ym) ?? 0) + p.value);
    daily.set(p.d, (daily.get(p.d) ?? 0) + p.value);
  }
  const targetMap = new Map<string, number>();
  for (const t of targets) {
    const k = t.period_month.slice(0, 7);
    targetMap.set(k, (targetMap.get(k) ?? 0) + t.value);
  }

  const priorStartYears = [
    fyStartYear - 4,
    fyStartYear - 3,
    fyStartYear - 2,
    fyStartYear - 1,
  ];
  const { index: seasonIndex } = seasonalIndex4y(monthly, priorStartYears);

  const completed: string[] = [];
  let cur = fyStart;
  while (cur < nowYm) {
    completed.push(cur);
    cur = addMonths(cur, 1);
  }
  let ytdActual = 0;
  let ytdTarget = 0;
  for (const m of completed) {
    ytdActual += monthly.get(m) ?? 0;
    ytdTarget += targetMap.get(m) ?? 0;
  }
  const achievement = ytdTarget > 0 ? ytdActual / ytdTarget : 1;

  let asOfDay = Number(now.slice(8, 10));
  const dim = daysInMonthYm(nowYm);
  for (let d = 1; d <= dim; d++) {
    if (daily.has(`${nowYm}-${pad2(d)}`)) asOfDay = d;
  }

  return computeCalibration(
    monthly, daily, targetMap, priorStartYears, seasonIndex,
    achievement, completed, nowMonth, asOfDay,
  );
}

// Rest-of-fiscal-year projection:
//   F(m) = target(m) * A * S(m)
// where A = achievement over completed FY months (Σ actual / Σ target) and
// S(m) = 4-fiscal-year month-of-year seasonal index (100 = an average month).
// The current (partial) month is excluded from A and is instead projected via
// historical same-month pacing (see running).
export function forecastFiscal(
  history: DailyPoint[],
  targets: MonthlyTarget[],
  asOf?: string,
): ForecastResult {
  const now = asOf ?? localToday();
  const nowYm = now.slice(0, 7);
  const nowMonth = monthOf(now);
  const nowYear = Number(now.slice(0, 4));

  const fyStartYear = nowMonth >= 7 ? nowYear : nowYear - 1;
  const fyStart = `${fyStartYear}-07`;
  const fyEnd = `${fyStartYear + 1}-06`;

  const monthly = new Map<string, number>();
  const daily = new Map<string, number>();
  for (const p of history) {
    const ym = p.d.slice(0, 7);
    monthly.set(ym, (monthly.get(ym) ?? 0) + p.value);
    daily.set(p.d, (daily.get(p.d) ?? 0) + p.value);
  }

  const targetMap = new Map<string, number>();
  for (const t of targets) {
    const k = t.period_month.slice(0, 7);
    targetMap.set(k, (targetMap.get(k) ?? 0) + t.value);
  }

  const priorStartYears = [
    fyStartYear - 4,
    fyStartYear - 3,
    fyStartYear - 2,
    fyStartYear - 1,
  ];
  const { index: seasonIndex, yearsWithData } = seasonalIndex4y(monthly, priorStartYears);

  // Completed FY months: FY start .. the month before the current month.
  const completed: string[] = [];
  let cur = fyStart;
  while (cur < nowYm) {
    completed.push(cur);
    cur = addMonths(cur, 1);
  }

  let ytdActual = 0;
  let ytdTarget = 0;
  for (const m of completed) {
    ytdActual += monthly.get(m) ?? 0;
    ytdTarget += targetMap.get(m) ?? 0;
  }
  const achievement = ytdTarget > 0 ? ytdActual / ytdTarget : 1;

  // Effective as-of day = last day with data in the current month, else today.
  let asOfDay = Number(now.slice(8, 10));
  const dim = daysInMonthYm(nowYm);
  for (let d = 1; d <= dim; d++) {
    if (daily.has(`${nowYm}-${pad2(d)}`)) asOfDay = d;
  }

  const calibration = computeCalibration(
    monthly, daily, targetMap, priorStartYears, seasonIndex,
    achievement, completed, nowMonth, asOfDay,
  );

  // Previous (most recently closed) month: reconstruct the forecast the model
  // would have made for it — using achievement over the months before it — so
  // the chart can show forecast vs actual vs error for the just-closed month.
  const prevYm = completed.length > 0 ? completed[completed.length - 1] : null;
  let previousMonth: PreviousMonthForecast | null = null;
  let prevForecast = 0;
  if (prevYm) {
    const before = completed.slice(0, -1);
    let beforeActual = 0;
    let beforeTarget = 0;
    for (const bm of before) {
      beforeActual += monthly.get(bm) ?? 0;
      beforeTarget += targetMap.get(bm) ?? 0;
    }
    const achievementBefore = beforeTarget > 0 ? beforeActual / beforeTarget : 1;
    const prevTarget = targetMap.get(prevYm) ?? 0;
    const prevS = seasonIndex.get(Number(prevYm.slice(5, 7))) ?? 100;
    const prevSFactor = prevS > 0 ? prevS / 100 : 1;
    prevForecast = prevTarget * achievementBefore * prevSFactor * calibration.factorSeasonal;
    const prevActual = monthly.get(prevYm) ?? 0;
    const prevError = prevActual - prevForecast;
    previousMonth = {
      month: prevYm,
      label: labelYm(prevYm),
      target: prevTarget,
      forecast: prevForecast,
      actual: prevActual,
      error: prevError,
      errorPct: prevForecast > 0 ? (prevError / prevForecast) * 100 : null,
    };
  }

  // Forecast: the current month .. FY end. The in-progress month uses the same
  // seasonal engine so it always has a forecast even before any sales post.
  const forecastMap = new Map<string, number>();
  let fc = nowYm;
  while (fc <= fyEnd) {
    const target = targetMap.get(fc) ?? 0;
    const sIndex = seasonIndex.get(Number(fc.slice(5, 7))) ?? 100;
    const sFactor = sIndex > 0 ? sIndex / 100 : 1;
    forecastMap.set(fc, target * achievement * sFactor * calibration.factorSeasonal);
    fc = addMonths(fc, 1);
  }

  // Full-FY month rows (Jul → Jun).
  const months: ForecastMonth[] = [];
  let m = fyStart;
  while (m <= fyEnd) {
    const mon = Number(m.slice(5, 7));
    const isForecast = m > nowYm;
    const isCurrent = m === nowYm;
    months.push({
      month: m,
      label: labelYm(m),
      target: targetMap.get(m) ?? 0,
      actual: monthly.get(m) ?? 0,
      forecast: isForecast || isCurrent ? (forecastMap.get(m) ?? 0) : 0,
      seasonalIndex: seasonIndex.get(mon) ?? 100,
      priorYears: priorYearValues(monthly, priorStartYears, mon),
      isForecast,
    });
    m = addMonths(m, 1);
  }

  const forecastMonths = months.filter((x) => x.isForecast);
  const nextMonth = forecastMonths[0] ?? null;

  const seasonalDetail = nextMonth
    ? seasonalShareDetail(monthly, priorStartYears, Number(nextMonth.month.slice(5, 7)))
    : null;

  const running = buildRunningProjection(
    nowYm, nowMonth, asOfDay, monthly, daily, targetMap, priorStartYears,
    calibration.factorPacing,
  );

  // The in-progress month keeps its seasonal-engine forecast (set above), so it
  // has a non-zero forecast even before any sales post. The running projection
  // is exposed separately in the headline as a live MTD ÷ pacing estimate.
  const currentMonth = months.find((x) => x.month === nowYm) ?? null;

  // Show the previous (just-closed) month's forecast bar so it reads next to
  // its actual for a one-month-ago accuracy check.
  if (prevYm && previousMonth) {
    const prevRow = months.find((x) => x.month === prevYm);
    if (prevRow) prevRow.forecast = previousMonth.forecast;
  }

  const priorYearLabels = priorStartYears.map((y) => `FY${(y + 1) % 100}`);

  return {
    achievement,
    months,
    forecastMonths,
    nextMonth,
    currentMonth,
    previousMonth,
    basisMonths: completed.length,
    seasonalBasisYears: yearsWithData,
    priorYearLabels,
    ytdActual,
    ytdTarget,
    running,
    calibration,
    seasonalDetail,
  };
}
