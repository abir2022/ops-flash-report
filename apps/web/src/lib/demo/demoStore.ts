// ---------------------------------------------------------------------------
// Demo mode — deterministic in-memory data store.
//
// Generates every view / RPC payload the web app reads (see api/client.ts)
// from the fixtures in demoData.ts. No network, no backend. Every figure is
// synthetic NexaGroup fiction.
//
// Design notes
//   * A single daily-revenue model (per SBU x channel) is the source of truth
//     for the whole flash / analysis / forecast surface. Prior-month and
//     prior-year windows come from the same model, so MoM / YoY / projections
//     and the 4-FY forecast all stay internally consistent.
//   * Money is in Crore (Cr) exactly like the DWH-sourced tables (1 Cr = 10
//     million BDT). ROMI / marketing / partner-feed bases keep raw BDT, as the
//     real views do.
// ---------------------------------------------------------------------------

import type {
  EmployeeProfile,
  EmployeeRow,
  Kpi,
  MarketingSpendDetailRow,
  MarketingSpendMonthlyRow,
  MarketingSpendRow,
  PartnerFeedDailyTotalRow,
  PartnerFeedOfficePlRow,
  RefreshRequestRow,
  Reconciliation,
  RomiCampaignRow,
  RomiSbuRow,
  RomiSurveyForm,
  ScorecardRow,
  SbuDailyPoint,
  SbuDim,
  SbuMonthlyTarget,
  SkuSaleRow,
} from "../../types";

import {
  CHANNEL_BY_SBU,
  DEMO_ADMIN_EMAIL,
  DEMO_BIIR_SIGNALS,
  DEMO_EMPLOYEES,
  DEMO_FY_START,
  DEMO_LATEST_DATE,
  DEMO_PARTNER_DEPARTMENTS,
  DEMO_PARTNER_OFFICES,
  DEMO_ROMI_CAMPAIGNS,
  DEMO_ROMI_SBUS,
  DEMO_SERIES_START,
  DEMO_SKU_MONTHS,
  DEMO_SBUS,
  DEMO_SURVEY_DESCRIPTION,
  DEMO_SURVEY_FIELDS,
  DEMO_SURVEY_TITLE,
  ITEM_POOL,
  MARKETING_SUBGL,
  NON_CAMPAIGN_SHARE,
  SBU_MODEL,
  SBU_ROMI_MAP,
  SEASONALITY,
  SEED_TARGETS,
  TARGET_MONTHS,
  WEEKDAY_WEIGHT,
  type DemoRomiCampaignRow,
  type DemoSbuRow,
} from "./demoData";

// ---- date helpers ----------------------------------------------------------

const DAY_MS = 86_400_000;
const T0 = Date.parse(`${DEMO_SERIES_START}T00:00:00Z`);

function isoDay(i: number): string {
  return new Date(T0 + i * DAY_MS).toISOString().slice(0, 10);
}
function dayIndex(d: string): number {
  return Math.round((Date.parse(`${d}T00:00:00Z`) - T0) / DAY_MS);
}
function daysInMonth(y: number, m1: number): number {
  return new Date(Date.UTC(y, m1, 0)).getUTCDate();
}
function firstIdxOfMonth(y: number, m1: number): number {
  return dayIndex(`${y}-${pad(m1)}-01`);
}

// ---- series model ----------------------------------------------------------

type Series = {
  key: string;
  sbu_id: number;
  channel: string;
  code: string;
  uom: string | null;
  unit: number | null;
  N: number;
  values: number[]; // Cr per calendar day
  prefix: number[]; // inclusive cumulative sum
};

const DAYS = dayIndex(DEMO_LATEST_DATE) + 1;
const ACTIVE = DEMO_SBUS.filter((s) => s.is_active);

// sbu id -> channel series (NXAB splits asphalt/lubex).
const seriesByKey = new Map<string, Series>();
const sbuSeries = new Map<number, Series[]>();

function planTarget(sbuId: number, channel: string, ymKey: string): number | null {
  const rows = SEED_TARGETS.filter((t) => t.sbu === sbuId && t.channel === channel);
  if (rows.length === 0) return null;
  const idx = TARGET_MONTHS.indexOf(ymKey);
  if (idx < 0) return null;
  const v = rows[0].values[idx];
  return v === null || v === undefined ? null : v;
}

// Year-over-year ramp used only for months that have no plan target, so older
// FYs sit lower than FY26-27 and YoY reads positive.
function growthYear(y: number): number {
  return 0.8 + 0.13 * (y - 2025); // 2022 .41 … 2025 .80, 2026 .93, 2027 1.06
}

// Whole-month actual revenue (Cr) for one SBU x channel.
//   * A plan target is an absolute FY plan — used directly, NOT grown.
//   * No plan → model base x seasonality x (year growth for base-only entities).
// A deterministic performance factor makes actual sit near/around its target so
// achievement spreads ~88-108% across the portfolio.
function monthActualCr(s: DemoSbuRow, channel: string, y: number, m: number): number {
  const ymKey = `${y}-${pad(m)}`;
  const plan = planTarget(s.id, channel, ymKey);
  const model = SBU_MODEL[s.id];
  let base: number;
  if (plan !== null) {
    base = plan;
  } else if (model) {
    const season = SEASONALITY[pad(m)] ?? 1;
    const chShare = channel === "default" ? 1 : 0.85;
    base = model.base * season * chShare * growthYear(y);
  } else {
    return 0;
  }
  return base * perfFactor(s.id, channel, ymKey);
}

function buildSeries(s: DemoSbuRow, channel: string): Series {
  const model = SBU_MODEL[s.id];
  const N = DAYS;
  const values = new Array<number>(N).fill(0);
  const uom = model?.uom ?? null;
  const unit = model?.unit ?? null;

  for (let i = 0; i < N; i++) {
    const d = isoDay(i);
    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(5, 7));

    // gate a business on or off mid-series.
    if (model?.startsFrom && d < model.startsFrom) continue;
    if (model?.dormantFrom && d >= model.dormantFrom) continue;

    const monthCr = monthActualCr(s, channel, y, m);
    if (monthCr <= 0) continue;
    const dm = daysInMonth(y, m);
    const weight = WEEKDAY_WEIGHT[new Date(`${d}T00:00:00Z`).getUTCDay()];
    // sum of weekday weights across the month → daily share keeps month sum exact.
    let wsum = 0;
    for (let k = 1; k <= dm; k++) {
      wsum += WEEKDAY_WEIGHT[new Date(Date.UTC(y, m - 1, k)).getUTCDay()];
    }
    values[i] = (monthCr * weight) / wsum;
  }

  const prefix = new Array<number>(N);
  let run = 0;
  for (let i = 0; i < N; i++) {
    run += values[i];
    prefix[i] = run;
  }
  return {
    key: `${s.id}:${channel}`,
    sbu_id: s.id,
    channel,
    code: s.code,
    uom,
    unit,
    N,
    values,
    prefix,
  };
}

function buildAllSeries(): void {
  for (const s of ACTIVE) {
    const channels = CHANNEL_BY_SBU[s.id] ?? ["default"];
    const list: Series[] = [];
    for (const ch of channels) {
      const ser = buildSeries(s, ch);
      seriesByKey.set(ser.key, ser);
      list.push(ser);
    }
    sbuSeries.set(s.id, list);
  }
}
buildAllSeries();

// deterministic 0.90..1.06 performance vs plan, seeded by (sbu, channel, month)
function perfFactor(sbuId: number, channel: string, month: string): number {
  let h = sbuId * 31;
  for (let i = 0; i < channel.length; i++) h = (h * 33 + channel.charCodeAt(i)) >>> 0;
  for (let i = 0; i < month.length; i++) h = (h * 31 + month.charCodeAt(i)) >>> 0;
  return 0.9 + (h % 17) / 100; // 0.90 .. 1.06
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// window sums ---------------------------------------------------------------
function sumRange(ser: Series, a: number, b: number): number {
  if (b < a || a < 0) return 0;
  const hi = Math.min(b, ser.N - 1);
  if (hi < a) return 0;
  return (ser.prefix[hi] ?? 0) - (a > 0 ? (ser.prefix[a - 1] ?? 0) : 0);
}

function monthWindow(ser: Series, date: string, backMonths: number): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const dayIn = Number(date.slice(8, 10));
  let my = y;
  let mm = m - backMonths;
  while (mm <= 0) {
    mm += 12;
    my -= 1;
  }
  const dm = Math.min(dayIn, daysInMonth(my, mm));
  const a = firstIdxOfMonth(my, mm);
  return sumRange(ser, a, a + dm - 1);
}

function fyStartIdx(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const fyYear = m >= 7 ? y : y - 1;
  return dayIndex(`${fyYear}-07-01`);
}

function momentumOf(mom: number | null): string {
  if (mom === null) return "N/A";
  if (mom >= 20) return "Strong +";
  if (mom >= 4) return "Positive";
  if (mom > -4) return "Neutral";
  if (mom >= -20) return "Weak";
  return "Negative";
}

// ---- report dates ----------------------------------------------------------

const REPORT_COUNT = 10;
const REPORT_DATES: string[] = (() => {
  const out: string[] = [];
  for (let i = 0; i < REPORT_COUNT; i++) out.push(isoDay(dayIndex(DEMO_LATEST_DATE) - i));
  return out; // desc (latest first)
})();

function scorecardForDate(date: string): ScorecardRow[] {
  const idx = dayIndex(date);
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const dayIn = Number(date.slice(8, 10));
  const dim = daysInMonth(y, m);
  const mStart = firstIdxOfMonth(y, m);
  const fyStart = fyStartIdx(date);
  const cyStart = dayIndex(`${y}-01-01`);
  const rows: ScorecardRow[] = [];

  for (const s of ACTIVE) {
    const src = SBU_MODEL[s.id]?.src ?? null;
    for (const ser of sbuSeries.get(s.id) ?? []) {
      const daily = ser.values[idx] ?? 0;
      const prevDaily = idx > 0 ? ser.values[idx - 1] ?? 0 : 0;
      const mtd = sumRange(ser, mStart, idx);
      const mom = monthWindow(ser, date, 1);
      const yoy = monthWindow(ser, date, 12);
      const fyYtd = sumRange(ser, fyStart, idx);
      const cyYtd = sumRange(ser, cyStart, idx);
      const plan = planTarget(s.id, ser.channel, `${y}-${pad(m)}`);
      const moTgtRev = plan;
      const mtdTgtRev = plan === null ? null : (plan * dayIn) / dim;

      const volDaily = ser.unit ? daily / ser.unit : null;
      const volMtd = ser.unit ? mtd / ser.unit : null;
      const volMom = ser.unit ? mom / ser.unit : null;
      const dailyVol = volDaily ?? null;
      const dodVol = ser.unit && prevDaily ? prevDaily / ser.unit : null;
      const mtdVol = volMtd ?? null;
      const moTgtVol = plan && ser.unit ? plan / ser.unit : null;
      const mtdTgtVol = mtdTgtRev && ser.unit ? mtdTgtRev / ser.unit : null;

      const hasRev = mtd > 0 || daily > 0;
      const momPct = mom > 0 && hasRev ? (mtd / mom - 1) * 100 : null;
      const yoyPct = yoy > 0 && hasRev ? (mtd / yoy - 1) * 100 : null;
      const achPct = mtdTgtRev && mtdTgtRev > 0 ? (mtd / mtdTgtRev) * 100 : null;
      const proj = dayIn > 0 ? (mtd / dayIn) * dim : 0;

      rows.push({
        sbu_id: s.id,
        code: s.code,
        name: s.name,
        section: s.section,
        is_freight: s.is_freight,
        channel: ser.channel,
        src,
        daily_rev: r2(daily),
        dod_rev: r2(prevDaily),
        mtd_rev: r2(mtd),
        mom_rev: r2(mom),
        yoy_rev: r2(yoy),
        fy_ytd_rev: r2(fyYtd),
        cy_ytd_rev: r2(cyYtd),
        daily_vol: dailyVol === null ? null : r2(dailyVol),
        dod_vol: dodVol === null ? null : r2(dodVol),
        mtd_vol: mtdVol === null ? null : r2(mtdVol),
        mom_vol: volMom === null ? null : r2(volMom),
        vol_uom: ser.uom,
        has_vol: ser.unit !== null,
        mo_tgt_rev: moTgtRev === null ? null : r2(moTgtRev),
        mtd_tgt_rev: mtdTgtRev === null ? null : r2(mtdTgtRev),
        mo_tgt_vol: moTgtVol === null ? null : r2(moTgtVol),
        mtd_tgt_vol: mtdTgtVol === null ? null : r2(mtdTgtVol),
        mtd_ach_pct: achPct === null ? null : r2(achPct),
        mom_pct: momPct === null ? null : r2(momPct),
        yoy_pct: yoyPct === null ? null : r2(yoyPct),
        proj_rev: r2(proj),
        momentum: momentumOf(momPct),
        report_date: date,
      });
    }
  }
  return rows;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

// Precompute scorecard for every report date once (views filter by date).
const SCORECARD: ScorecardRow[] = REPORT_DATES.flatMap(scorecardForDate);

function kpiForDate(date: string): Kpi {
  const rows = SCORECARD.filter((r) => r.report_date === date);
  const totalDaily = rows.reduce((a, r) => a + (r.daily_rev ?? 0), 0);
  const totalMtd = rows.reduce((a, r) => a + (r.mtd_rev ?? 0), 0);
  const totalFy = rows.reduce((a, r) => a + (r.fy_ytd_rev ?? 0), 0);
  const totalCy = rows.reduce((a, r) => a + (r.cy_ytd_rev ?? 0), 0);
  const activeSbus = rows.filter((r) => (r.mtd_rev ?? 0) > 0).length;
  const withTarget = rows.filter((r) => r.mtd_ach_pct !== null);
  const avgAch =
    withTarget.length > 0
      ? withTarget.reduce((a, r) => a + (r.mtd_ach_pct ?? 0), 0) / withTarget.length
      : null;
  return {
    report_date: date,
    total_daily: r2(totalDaily),
    total_mtd: r2(totalMtd),
    total_fy_ytd: r2(totalFy),
    total_cy_ytd: r2(totalCy),
    active_sbus: activeSbus,
    sbus_with_target: withTarget.length,
    avg_ach_pct: avgAch === null ? null : r2(avgAch),
  };
}
const KPI: Kpi[] = REPORT_DATES.map(kpiForDate);

function reconForDate(date: string): Reconciliation {
  const rows = SCORECARD.filter((r) => r.report_date === date);
  const rptTot = rows.reduce((a, r) => a + (r.mtd_rev ?? 0), 0);
  const rptFrt = rows.filter((r) => r.is_freight).reduce((a, r) => a + (r.mtd_rev ?? 0), 0);
  const rptGl1 = rptTot - rptFrt;
  const g1all = rptGl1 * 1.05;
  const excl = rptGl1 * 0.04;
  const g2all = rptGl1 * 0.13;
  const g5all = rptFrt * 1.18;
  const g6all = rptGl1 * 0.06;
  const g4all = rptGl1 * 0.02;
  const fullTot = g1all + g2all + g5all + g6all + g4all;
  return {
    report_date: date,
    g1all: r2(g1all),
    excl: r2(excl),
    g2all: r2(g2all),
    g5all: r2(g5all),
    g6all: r2(g6all),
    g4all: r2(g4all),
    rpt_gl1: r2(rptGl1),
    rpt_frt: r2(rptFrt),
    rpt_tot: r2(rptTot),
    full_tot: r2(fullTot),
    gap: r2(fullTot - rptTot),
  };
}
const RECON: Reconciliation[] = REPORT_DATES.map(reconForDate);

function freshness(): {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  report_date: string | null;
  dwh_latest_post: string | null;
  dwh_synced_at: string | null;
  error: string | null;
  meta: Record<string, unknown> | null;
}[] {
  // "now" (browser) minus a few hours so the badge reads "Live · updated Xh ago".
  const synced = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const started = new Date(Date.now() - 3 * 3_600_000 - 4 * 60_000).toISOString();
  return [
    {
      id: "00000000-0000-4000-8000-0000000000af",
      started_at: started,
      finished_at: synced,
      status: "success",
      report_date: DEMO_LATEST_DATE,
      dwh_latest_post: synced,
      dwh_synced_at: synced,
      error: null,
      meta: { source: "demo-in-memory", sbu_count: ACTIVE.length, rows: SCORECARD.length },
    },
  ];
}

function portfolioTrend(): { day: string; total: number }[] {
  const fyIdx = dayIndex(DEMO_FY_START);
  const out: { day: string; total: number }[] = [];
  for (let i = fyIdx; i < DAYS; i++) {
    let total = 0;
    for (const ser of seriesByKey.values()) total += ser.values[i] ?? 0;
    out.push({ day: isoDay(i), total: r2(total) });
  }
  return out;
}

function dailyTrend(): { sbu_id: number; d: string; channel: string; value: number }[] {
  const fyIdx = dayIndex(DEMO_FY_START);
  const out: { sbu_id: number; d: string; channel: string; value: number }[] = [];
  for (const ser of seriesByKey.values()) {
    for (let i = fyIdx; i < DAYS; i++) {
      const v = ser.values[i] ?? 0;
      if (v > 0) out.push({ sbu_id: ser.sbu_id, d: isoDay(i), channel: ser.channel, value: r2(v) });
    }
  }
  return out;
}

function sbuMonthlyTargets(): SbuMonthlyTarget[] {
  const out: SbuMonthlyTarget[] = [];
  for (const [sbuId, list] of sbuSeries) {
    for (const t of TARGET_MONTHS) {
      const y = Number(t.slice(0, 4));
      const m = Number(t.slice(5, 7));
      let rev = 0;
      let vol = 0;
      let any = false;
      for (const ser of list) {
        const plan = planTarget(sbuId, ser.channel, t);
        if (plan !== null) {
          rev += plan;
          if (ser.unit) vol += plan / ser.unit;
          any = true;
        }
      }
      if (!any) continue;
      out.push({
        sbu_id: sbuId,
        period_month: `${y}-${pad(m)}-01`,
        mo_target_rev: r2(rev),
        mo_target_vol: vol ? r2(vol) : 0,
      });
    }
  }
  return out;
}

// ---- marketing spend (report-date-scoped, in Cr) ---------------------------

const SPEND_RATE: Record<string, number> = {
  Food: 0.09,
  Others: 0.06,
  "Building Material": 0.035,
  "Building Solution": 0.045,
  Trading: 0.02,
  Logistics: 0.006,
  Packaging: 0.02,
  IT: 0.03,
};
function spendRate(section: string | null): number {
  return SPEND_RATE[section ?? ""] ?? 0.03;
}

function marketingSpendRows(campaignable: boolean): MarketingSpendRow[] {
  const out: MarketingSpendRow[] = [];
  for (const date of REPORT_DATES) {
    for (const s of ACTIVE) {
      const list = sbuSeries.get(s.id) ?? [];
      let mtd = 0;
      for (const ser of list) mtd += monthWindow(ser, date, 0);
      if (mtd <= 0) continue;
      let mom = 0;
      let yoy = 0;
      let fy = 0;
      for (const ser of list) {
        mom += monthWindow(ser, date, 1) * spendRate(s.section);
        yoy += monthWindow(ser, date, 12) * spendRate(s.section);
        fy += (sumRange(ser, fyStartIdx(date), dayIndex(date)) || 0) * spendRate(s.section);
      }
      mtd = mtd * spendRate(s.section);
      const scale = campaignable ? 1 - NON_CAMPAIGN_SHARE : 1;
      out.push({
        sbu_id: s.id,
        code: s.code,
        name: s.name,
        section: s.section,
        report_date: date,
        mtd_spend: r2(mtd * scale),
        mom_spend: r2(mom * scale),
        yoy_spend: r2(yoy * scale),
        fy_ytd_spend: r2(fy * scale),
      });
    }
  }
  return out;
}

function marketingSpendDetail(): MarketingSpendDetailRow[] {
  const out: MarketingSpendDetailRow[] = [];
  for (const date of REPORT_DATES) {
    for (const s of ACTIVE) {
      let mtd = 0;
      for (const ser of sbuSeries.get(s.id) ?? []) mtd += monthWindow(ser, date, 0);
      if (mtd <= 0) continue;
      const totalMtd = mtd * spendRate(s.section);
      for (const sub of MARKETING_SUBGL) {
        out.push({
          sbu_id: s.id,
          code: s.code,
          name: s.name,
          section: s.section,
          report_date: date,
          subgl_code: sub.code,
          subgl_name: sub.name,
          mtd_spend: r2(totalMtd * sub.share),
        });
      }
    }
  }
  return out;
}

function marketingMonthly(campaignable: boolean): MarketingSpendMonthlyRow[] {
  const out: MarketingSpendMonthlyRow[] = [];
  const months = recentMonths(DEMO_SKU_MONTHS);
  for (const s of ACTIVE) {
    for (const mKey of months) {
      let rev = 0;
      for (const ser of sbuSeries.get(s.id) ?? []) rev += monthTotal(ser, mKey);
      if (rev <= 0) continue;
      const scale = campaignable ? 1 - NON_CAMPAIGN_SHARE : 1;
      out.push({
        sbu_id: s.id,
        code: s.code,
        name: s.name,
        period_month: mKey,
        spend: r2(rev * spendRate(s.section) * scale),
      });
    }
  }
  return out;
}

function monthTotal(ser: Series, ymKey: string): number {
  const a = firstIdxOfMonth(Number(ymKey.slice(0, 4)), Number(ymKey.slice(5, 7)));
  return sumRange(ser, a, a + daysInMonth(Number(ymKey.slice(0, 4)), Number(ymKey.slice(5, 7))) - 1);
}
function recentMonths(n: number): string[] {
  const out: string[] = [];
  let y = Number(DEMO_LATEST_DATE.slice(0, 4));
  let m = Number(DEMO_LATEST_DATE.slice(5, 7));
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${pad(m)}`);
    m -= 1;
    if (m <= 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

// ---- ROMI ------------------------------------------------------------------

function romiCampaigns(): RomiCampaignRow[] {
  const byBu = new Map<number, { benchmark_top: number | null; benchmark_bottom: number | null; benchmark_note: string | null }>();
  for (const r of DEMO_ROMI_SBUS) {
    byBu.set(r.business_unit_id, {
      benchmark_top: r.benchmark_top,
      benchmark_bottom: r.benchmark_bottom,
      benchmark_note: r.benchmark_note,
    });
  }
  const mapByBu = new Map(SBU_ROMI_MAP.map((m) => [m.business_unit_id, m]));
  const sbuById = new Map(DEMO_SBUS.map((s) => [s.id, s]));

  const base = DEMO_ROMI_CAMPAIGNS.map(toViewCampaign);
  const submitted = SUBMITTED.map(toViewCampaign);
  return [...base, ...submitted].map((rc) => {
    const mp = mapByBu.get(rc.business_unit_id);
    if (!mp) return null;
    const sbu = sbuById.get(mp.sbu_id);
    const bm = byBu.get(rc.business_unit_id);
    return {
      ...rc,
      sbu_id: sbu?.id ?? null,
      code: sbu?.code ?? null,
      sbu_name: sbu?.name ?? null,
      section: sbu?.section ?? null,
      benchmark_top: bm?.benchmark_top ?? null,
      benchmark_bottom: bm?.benchmark_bottom ?? null,
      benchmark_note: bm?.benchmark_note ?? null,
    };
  }).filter((x): x is RomiCampaignRow => x !== null);
}

function toViewCampaign(rc: DemoRomiCampaignRow): RomiCampaignRow {
  return {
    id: rc.id,
    business_unit_id: rc.business_unit_id,
    sbu_id: null,
    code: null,
    sbu_name: null,
    section: null,
    campaign_name: rc.campaign_name,
    category: rc.category,
    report_month: rc.report_month,
    start_date: rc.start_date,
    end_date: rc.end_date,
    officer_name: rc.officer_name,
    officer_enroll: rc.officer_enroll,
    marketing_expense_total: rc.marketing_expense_total,
    extra_fields: rc.extra_fields ?? null,
    actual_rev: rc.actual_rev,
    organic_rev: rc.organic_rev,
    organic_rev_sply: rc.organic_rev,
    sply_rev: rc.sply_rev,
    gp_margin: rc.gp_margin,
    spend_pool_total: rc.spend_pool_total,
    n_months: rc.n_months,
    as_of: rc.as_of,
    actual_rev_ov: rc.actual_rev_ov ?? null,
    organic_rev_ov: null,
    sply_rev_ov: null,
    gp_margin_ov: rc.gp_margin_ov ?? null,
    incr_rev_ov: null,
    actual_profit_ov: null,
    base_profit_ov: null,
    sply_profit_ov: null,
    incr_profit_ov: null,
    romi_top_ov: rc.romi_top_ov ?? null,
    romi_bottom_ov: null,
    benchmark_top: null,
    benchmark_bottom: null,
    benchmark_note: null,
  };
}

function romiSbus(): RomiSbuRow[] {
  const mapByBu = new Map(SBU_ROMI_MAP.map((m) => [m.business_unit_id, m]));
  return DEMO_ROMI_SBUS.map((r) => ({
    business_unit_id: r.business_unit_id,
    code: r.code,
    name: r.name,
    gp_margin: r.gp_margin,
    benchmark_top: r.benchmark_top,
    benchmark_bottom: r.benchmark_bottom,
    benchmark_note: r.benchmark_note,
    mkt_led_target_min_cr: r.mkt_led_target_min_cr,
    mkt_led_target_max_cr: r.mkt_led_target_max_cr,
    is_active: r.is_active,
    sbu_id: mapByBu.get(r.business_unit_id)?.sbu_id ?? null,
  }));
}

// ---- survey form -----------------------------------------------------------

const SURVEY_FORM: RomiSurveyForm = {
  id: 1,
  title: DEMO_SURVEY_TITLE,
  description: DEMO_SURVEY_DESCRIPTION,
  fields: DEMO_SURVEY_FIELDS,
  is_active: true,
};

// ---- partner feed (raw BDT) ------------------------------------------------

const PARTNER_MONTHS = recentMonths(6);
function partnerDailyTotal(): PartnerFeedDailyTotalRow[] {
  const fyIdx = dayIndex(DEMO_FY_START);
  const out: PartnerFeedDailyTotalRow[] = [];
  for (let i = fyIdx; i < DAYS; i++) {
    const d = isoDay(i);
    const base = 62_000_000; // ~6.2 Cr BDT/day
    const season = SEASONALITY[d.slice(5, 7)] ?? 1;
    const wd = WEEKDAY_WEIGHT[new Date(`${d}T00:00:00Z`).getUTCDay()];
    const noise = 1 + (dayHash(d) % 12) / 100;
    out.push({ report_date: d, amount: Math.round(base * season * wd * noise) });
  }
  return out;
}

function partnerOfficePl(): PartnerFeedOfficePlRow[] {
  const out: PartnerFeedOfficePlRow[] = [];
  for (const mKey of PARTNER_MONTHS) {
    for (const office of DEMO_PARTNER_OFFICES) {
      for (const dept of DEMO_PARTNER_DEPARTMENTS) {
        const net = Math.round(
          9_000_000 * dept.share * (0.8 + ((dayHash(`${mKey}-${office.office_id}`) % 40) / 100))
        );
        const margin = dept.margin;
        const cost = Math.round((net * (100 - margin)) / 100);
        const profit = net - cost;
        out.push({
          period_month: `${mKey}-01`,
          office_id: office.office_id,
          office_name: office.name,
          department_name: dept.name,
          quantity: Math.round(net / 4500),
          net_sales: net,
          cost,
          profit,
          margin: r2(margin),
        });
      }
    }
  }
  return out;
}

function dayHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// ---- employees (mutable, for admin CRUD) -----------------------------------

type DemoEmployee = (typeof DEMO_EMPLOYEES)[number];

let EMPLOYEES: DemoEmployee[] = DEMO_EMPLOYEES.map((e) => ({ ...e }));
let SUBMITTED: DemoRomiCampaignRow[] = [];
let NEXT_ID = 1000;
let REFRESH: RefreshRequestRow | null = null;

const sbuName = (id: number) => DEMO_SBUS.find((s) => s.id === id)?.name ?? null;
const sbuCode = (id: number) => DEMO_SBUS.find((s) => s.id === id)?.code ?? String(id);

function capabilityFlags(cap: string): { can_view: boolean; can_romi: boolean } {
  return { can_view: cap === "view" || cap === "both", can_romi: cap === "romi" || cap === "both" };
}

function employeeRows(): EmployeeRow[] {
  return EMPLOYEES.map((e) => {
    const flags = capabilityFlags(e.capability);
    return {
      user_id: e.user_id,
      name: e.name,
      email: e.email,
      phone: e.phone,
      password: e.password,
      allowed_sbus: e.allowed_sbus,
      sbu_codes: e.allowed_sbus.map(sbuCode),
      sbu_names: e.allowed_sbus.map(sbuName),
      capability: e.capability,
      can_view: flags.can_view,
      can_romi: flags.can_romi,
      is_active: e.is_active,
      expires_at: e.expires_at,
      created_at: e.created_at,
    };
  });
}

function adminProfile(): EmployeeProfile {
  return {
    name: "Demo Administrator",
    email: DEMO_ADMIN_EMAIL,
    phone: "+880 1700 000 000",
    allowed_sbus: ACTIVE.map((s) => s.id),
    sbu_codes: ACTIVE.map((s) => s.code),
    sbu_names: ACTIVE.map((s) => s.name),
    can_view: true,
    can_romi: true,
  };
}

// ---- SKU sales -------------------------------------------------------------

const UOM_BY_SECTION: Record<string, string> = {
  "Building Material": "MT",
  "Building Solution": "MT",
  Food: "MT",
  Trading: "MT",
  Packaging: "MT",
  Logistics: "trip",
  IT: "seat",
  Others: "pcs",
};

function skuSales(sbuId: number, channel: string, from: string, to: string): SkuSaleRow[] {
  const s = DEMO_SBUS.find((x) => x.id === sbuId);
  if (!s) return [];
  const ser = seriesByKey.get(`${sbuId}:${channel}`);
  const pool = ITEM_POOL[s.section ?? "Others"] ?? ITEM_POOL.Others;
  const uom = UOM_BY_SECTION[s.section ?? "Others"] ?? "pcs";
  const totalValue = ser ? sumRange(ser, dayIndex(from), dayIndex(to)) : 0;
  if (totalValue <= 0) return [];
  // split the total across items deterministically (Pareto-ish).
  const n = Math.min(pool.length, 7);
  const weights: number[] = [];
  let wsum = 0;
  for (let i = 0; i < n; i++) {
    const w = n - i + (dayHash(`${sbuId}-${pool[i]}`) % 3);
    weights.push(w);
    wsum += w;
  }
  return pool.slice(0, n).map((name, i) => {
    const value = (totalValue * weights[i]) / wsum;
    const quantity = ser?.unit ? value / ser.unit : value / (0.02 + (i + 1) * 0.001);
    return {
      item_id: sbuId * 1000 + i,
      item_code: `${s.code}-${pad(i + 1)}`,
      item_name: name,
      category_name: s.section,
      quantity: r2(quantity),
      uom,
      value: r2(value),
    };
  });
}

function sbuDaily(sbuId: number, channel: string, from: string, to: string): SbuDailyPoint[] {
  const ser = seriesByKey.get(`${sbuId}:${channel}`);
  if (!ser) return [];
  const out: SbuDailyPoint[] = [];
  for (let i = dayIndex(from); i <= dayIndex(to) && i < ser.N; i++) {
    if (i < 0) continue;
    const v = ser.values[i] ?? 0;
    out.push({ d: isoDay(i), value: r2(v), quantity: ser.unit ? r2(v / ser.unit) : null });
  }
  return out;
}

function sbuHistory(sbuId: number, channel: string, from: string, to: string, limit: number, offset: number): { d: string; value: number }[] {
  const ser = seriesByKey.get(`${sbuId}:${channel}`);
  if (!ser) return [];
  const rows: { d: string; value: number }[] = [];
  for (let i = Math.max(0, dayIndex(from)); i <= Math.min(ser.N - 1, dayIndex(to)); i++) {
    const v = ser.values[i] ?? 0;
    if (v > 0) rows.push({ d: isoDay(i), value: r2(v) });
  }
  return rows.slice(offset, offset + limit);
}

// ---- RPC router ------------------------------------------------------------

function newPass(): string {
  return `Demo#${1000 + (NEXT_ID++ % 9000)}`;
}

export function rpc(name: string, params: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
  switch (name) {
    case "ensure_profile":
      return { data: "admin", error: null };

    case "employee_profile":
      return { data: [adminProfile()], error: null };

    case "get_sbu_daily": {
      const rows = sbuDaily(
        Number(params._sbu),
        String(params._channel ?? "default"),
        String(params._from),
        String(params._to)
      );
      return { data: rows, error: null };
    }
    case "get_sbu_history": {
      const rows = sbuHistory(
        Number(params._sbu),
        String(params._channel ?? "default"),
        String(params._from),
        String(params._to),
        Number(params._limit ?? 1000),
        Number(params._offset ?? 0)
      );
      return { data: rows, error: null };
    }
    case "get_sku_sales": {
      const rows = skuSales(
        Number(params._sbu),
        String(params._channel ?? "default"),
        String(params._from),
        String(params._to)
      );
      return { data: rows, error: null };
    }

    case "admin_list_employees":
      return { data: employeeRows(), error: null };

    case "admin_create_employee": {
      const id = `00000000-0000-4000-8000-${pad(NEXT_ID % 100)}${String(NEXT_ID).padStart(6, "0")}`;
      NEXT_ID++;
      EMPLOYEES.push({
        user_id: id,
        name: String(params._name ?? ""),
        email: String(params._email ?? ""),
        phone: (params._phone as string | null) ?? null,
        password: (params._password as string | null) ?? null,
        allowed_sbus: Array.isArray(params._allowed_sbus) ? (params._allowed_sbus as number[]) : [],
        capability: (params._capability as DemoEmployee["capability"]) ?? "view",
        is_active: true,
        expires_at: (params._expires_at as string | null) ?? null,
        created_at: new Date().toISOString(),
      });
      return { data: null, error: null };
    }
    case "admin_revoke_employee": {
      EMPLOYEES = EMPLOYEES.map((e) => (e.user_id === params._user_id ? { ...e, is_active: false } : e));
      return { data: null, error: null };
    }
    case "admin_reactivate_employee": {
      EMPLOYEES = EMPLOYEES.map((e) => (e.user_id === params._user_id ? { ...e, is_active: true } : e));
      return { data: null, error: null };
    }
    case "admin_update_employee": {
      EMPLOYEES = EMPLOYEES.map((e) =>
        e.user_id === params._user_id ? { ...e, capability: params._capability as DemoEmployee["capability"] } : e
      );
      return { data: null, error: null };
    }
    case "admin_reset_employee_password": {
      const p = newPass();
      EMPLOYEES = EMPLOYEES.map((e) => (e.user_id === params._user_id ? { ...e, password: p } : e));
      const emp = EMPLOYEES.find((e) => e.user_id === params._user_id);
      return { data: [{ email: emp?.email ?? "", password: p }], error: null };
    }
    case "admin_delete_employee": {
      EMPLOYEES = EMPLOYEES.filter((e) => e.user_id !== params._user_id);
      return { data: null, error: null };
    }

    case "employee_submit_campaign": {
      const sbuId = Number(params._sbu_id);
      const bu = SBU_ROMI_MAP.find((m) => m.sbu_id === sbuId)?.business_unit_id ?? 0;
      const start = String(params._start_date ?? DEMO_LATEST_DATE);
      const id = NEXT_ID++;
      SUBMITTED.push({
        id,
        business_unit_id: bu,
        campaign_name: String(params._campaign_name ?? "Untitled campaign"),
        category: String(params._category ?? "Other"),
        report_month: start.slice(0, 7),
        start_date: start,
        end_date: String(params._end_date ?? start),
        officer_name: "Demo Officer",
        officer_enroll: "NEX-DEMO",
        marketing_expense_total: Number(params._marketing_expense_total ?? 0),
        actual_rev: null,
        organic_rev: null,
        sply_rev: null,
        gp_margin: null,
        spend_pool_total: Number(params._marketing_expense_total ?? 0),
        n_months: 1,
        as_of: DEMO_LATEST_DATE,
        extra_fields: (params._extra_fields as Record<string, unknown> | null) ?? null,
      });
      return { data: id, error: null };
    }
    case "employee_list_campaigns": {
      const data = SUBMITTED.map((c) => {
        const sbu = SBU_ROMI_MAP.find((m) => m.business_unit_id === c.business_unit_id);
        const dim = sbu ? DEMO_SBUS.find((s) => s.id === sbu.sbu_id) : undefined;
        return {
          id: c.id,
          sbu_id: dim?.id ?? null,
          sbu_code: dim?.code ?? null,
          sbu_name: dim?.name ?? null,
          campaign_name: c.campaign_name,
          category: c.category,
          report_month: c.report_month,
          start_date: c.start_date,
          end_date: c.end_date,
          marketing_expense_total: c.marketing_expense_total,
          created_at: new Date().toISOString(),
        };
      });
      return { data, error: null };
    }

    case "admin_save_survey_form": {
      SURVEY_FORM.title = String(params._title ?? SURVEY_FORM.title);
      SURVEY_FORM.description = (params._description as string | null) ?? SURVEY_FORM.description;
      SURVEY_FORM.fields = Array.isArray(params._fields) ? (params._fields as RomiSurveyForm["fields"]) : SURVEY_FORM.fields;
      SURVEY_FORM.is_active = Boolean(params._is_active ?? true);
      return { data: null, error: null };
    }

    case "admin_request_refresh": {
      REFRESH = {
        id: NEXT_ID++,
        status: "success",
        requested_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        report_date: DEMO_LATEST_DATE,
        error: null,
      };
      return { data: [REFRESH], error: null };
    }
    case "admin_get_refresh_status": {
      return { data: REFRESH ? [REFRESH] : [], error: null };
    }

    default:
      return { data: null, error: { message: `demo: unhandled rpc "${name}"` } };
  }
}

// ---- table router ----------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTable(name: string): Record<string, any>[] {
  switch (name) {
    case "v_scorecard":
      return SCORECARD;
    case "v_kpi":
      return KPI;
    case "v_reconciliation":
      return RECON;
    case "v_freshness":
      return freshness();
    case "v_portfolio_trend":
      return portfolioTrend();
    case "v_sbu":
      return sbuDims();
    case "v_report_dates":
      return REPORT_DATES.map((d) => ({ report_date: d }));
    case "v_sbu_monthly_targets":
      return sbuMonthlyTargets();
    case "daily_trend":
      return dailyTrend();
    case "biir_signal":
      return DEMO_BIIR_SIGNALS;
    case "v_marketing_spend":
      return marketingSpendRows(false);
    case "v_marketing_spend_campaignable":
      return marketingSpendRows(true);
    case "v_marketing_spend_detail":
      return marketingSpendDetail();
    case "v_marketing_spend_monthly":
      return marketingMonthly(false);
    case "v_marketing_spend_monthly_campaignable":
      return marketingMonthly(true);
    case "v_romi_campaign":
      return romiCampaigns();
    case "v_romi_sbu":
      return romiSbus();
    case "romi_survey_form":
      return [{ ...SURVEY_FORM, created_at: new Date().toISOString() }];
    case "partner_feed_daily_total":
      return partnerDailyTotal();
    case "partner_feed_office_pl":
      return partnerOfficePl();
    default:
      return [];
  }
}

function sbuDims(): SbuDim[] {
  return ACTIVE.map((s) => ({ id: s.id, code: s.code, name: s.name, section: s.section, is_freight: s.is_freight }));
}
