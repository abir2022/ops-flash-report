import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchMarketingSpendCampaignable,
  fetchMarketingSpendDetail,
  fetchMarketingSpendMonthlyCampaignable,
  fetchRomiCampaigns,
  fetchRomiSbus,
  fetchScorecard,
} from "../../api/client";
import { fmt, fmtPct } from "../../lib/format";
import { chartTheme, useTheme } from "../../lib/chartTheme";
import {
  buildMarketingRows,
  buildSpendReconciliation,
  efficiencyHow,
  efficiencyWhy,
  summarizeMarketing,
  type Efficiency,
  type MarketingRow,
} from "../../lib/marketing";
import {
  buildBenchmarkRows,
  campaignsForSbu,
  computeEffective,
  marketingLedTargetPct,
  marketingLedTargets,
  marketingLedTargetStr,
  rollupBySbu,
  rollupForSbu,
  sbuTotals,
  type EffectiveCampaign,
  type MarketingLedTarget,
  type SbuCampaignRollup,
} from "../../lib/romi";
import { exportBranchMarkExcel, exportCampaignLedgerExcel } from "../../lib/exportExcel";
import type {
  MarketingSpendDetailRow,
  MarketingSpendMonthlyRow,
} from "../../types";
import { useExportMode } from "../../lib/exportMode";
import { RomiAnalysisLayer } from "./RomiAnalysisLayer";
import { SpendReconciliation } from "./SpendReconciliation";

const EFFICIENCY_LABEL: Record<Efficiency, string> = {
  efficient: "Efficient",
  moderate: "Moderate",
  inefficient: "Inefficient",
  "no-spend": "No spend",
};

function efficiencyClass(e: Efficiency): string {
  switch (e) {
    case "efficient":
      return "mk-eff-good";
    case "moderate":
      return "mk-eff-watch";
    case "inefficient":
      return "mk-eff-risk";
    default:
      return "mk-eff-none";
  }
}

function SummaryCards({ rows, effective }: { rows: MarketingRow[]; effective: EffectiveCampaign[] }) {
  const s = summarizeMarketing(rows);
  const led = sbuTotals(effective);
  return (
    <div className="snapshot-cards mk-summary">
      <div className="snap-card">
        <div className="label">MTD Marketing Spend</div>
        <div className="val">
          {fmt(s.totalMtdSpend)}
          <span className="unit">Cr</span>
        </div>
        <div className="sub">GL 4210001 · actuals</div>
      </div>
      <div className="snap-card">
        <div className="label">Marketing-led Revenue</div>
        <div className="val">
          {effective.length ? fmt(led.total_incr_rev / 10_000_000) : "—"}
          <span className="unit">Cr</span>
        </div>
        <div className="sub">Σ (F − G) across campaigns</div>
      </div>
      <div className="snap-card">
        <div className="label">Portfolio ROMI (led)</div>
        <div className="val">{led.total_romi_top !== null ? `${fmt(led.total_romi_top, 1)}×` : "—"}</div>
        <div className="sub">(led revenue − spend) ÷ spend</div>
      </div>
      <div className="snap-card">
        <div className="label">Spend Intensity</div>
        <div className="val">{s.intensityMtd !== null ? fmtPct(s.intensityMtd, 2) : "—"}</div>
        <div className="sub">of MTD revenue</div>
      </div>
      <div className="snap-card">
        <div className="label">Inefficient SBUs</div>
        <div
          className="val"
          style={{ color: s.inefficientCount > 0 ? "var(--down)" : "var(--up)" }}
        >
          {s.inefficientCount}
        </div>
        <div className="sub">{s.spenders} SBUs spending</div>
      </div>
      <div className="snap-card">
        <div className="label">FY YTD Spend</div>
        <div className="val">
          {fmt(s.totalFyYtdSpend)}
          <span className="unit">Cr</span>
        </div>
        <div className="sub">GL 4210001 · actuals</div>
      </div>
    </div>
  );
}

// ---- Monthly spend trend (per SBU) ----------------------------------------

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[(Number(m) || 1) - 1]} ${String(y).slice(2)}`;
}

function SpendTrend({
  sbuId,
  monthly,
}: {
  sbuId: number;
  monthly: MarketingSpendMonthlyRow[];
}) {
  const c = chartTheme(useTheme());
  const series = monthly
    .filter((m) => m.sbu_id === sbuId)
    .map((m) => ({
      label: monthLabel(m.period_month),
      value: Number(m.spend ?? 0),
    }));
  if (series.length === 0) return <div className="no-data">No monthly spend series.</div>;
  return (
    <div className="mk-chart">
      <div className="mk-chart-title">Monthly marketing spend (Cr)</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" stroke={c.axis} tick={c.tick} minTickGap={16} />
          <YAxis stroke={c.axis} tick={c.tick} width={44} />
          <Tooltip
            contentStyle={c.tooltipStyle}
            labelStyle={c.labelStyle}
            itemStyle={c.itemStyle}
            formatter={(v: number) => [fmt(v), "Cr"]}
          />
          <Line type="monotone" dataKey="value" stroke="#D97706" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---- Intensity bar ---------------------------------------------------------

function IntensityBar({ value }: { value: number | null }) {
  if (value === null) return <span className="mom-neu">—</span>;
  const pct = Math.min(Math.max(value, 0), 100);
  const cls = value > 15 ? "mk-bar-risk" : value > 5 ? "mk-bar-watch" : "mk-bar-good";
  return (
    <span className="mk-bar-wrap">
      <span className={`mk-bar ${cls}`} style={{ width: `${pct}%` }} />
      <span className="mk-bar-label">{fmtPct(value, 2)}</span>
    </span>
  );
}

// Marketing-led revenue achieved so far as a % of the annual target midpoint.
function TargetBar({
  target,
  ledRevCr,
}: {
  target: MarketingLedTarget | null;
  ledRevCr: number | null;
}) {
  if (!target || ledRevCr === null) return <span className="mom-neu">—</span>;
  const pct = marketingLedTargetPct(target, ledRevCr);
  if (pct === null) return <span className="mom-neu">—</span>;
  const w = Math.min(Math.max(pct, 0), 100);
  const label = `${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`;
  return (
    <span className="mk-bar-wrap">
      <span className="mk-bar mk-bar-good" style={{ width: `${w}%` }} />
      <span className="mk-bar-label">{label}</span>
    </span>
  );
}

const QUALITY_LABEL: Record<string, string> = {
  strong: "Strong",
  mixed: "Mixed",
  weak: "Weak",
  "no-data": "No data",
  "no-mark": "No mark",
};

function qualityClass(q: string): string {
  switch (q) {
    case "strong":
      return "mk-eff-good";
    case "mixed":
      return "mk-eff-watch";
    case "weak":
      return "mk-eff-risk";
    default:
      return "mk-eff-none";
  }
}

function romiStr(v: number | null): string {
  return v === null ? "—" : `${fmt(v, 1)}×`;
}

function cr(v: number | null): string {
  return v === null ? "—" : fmt((v ?? 0) / 10_000_000);
}

// Marketing-led revenue (F − G) and its ROMI, from the campaign rollup.
// "—" when the SBU has no campaigns (we do not fabricate attribution).
function ledCr(rollup: SbuCampaignRollup): string {
  if (rollup.n_campaigns === 0) return "—";
  return fmt(rollup.total_incr_rev / 10_000_000);
}

// Numeric marketing-led revenue (Cr) for the vs-target bar; null when the SBU
// has no campaigns (we do not fabricate attribution).
function ledCrNum(rollup: SbuCampaignRollup): number | null {
  if (rollup.n_campaigns === 0) return null;
  return rollup.total_incr_rev / 10_000_000;
}

function ledRomi(rollup: SbuCampaignRollup): string {
  if (rollup.n_campaigns === 0 || !rollup.total_marketing) return "—";
  return `${fmt((rollup.total_incr_rev - rollup.total_marketing) / rollup.total_marketing, 1)}×`;
}

function CampaignAnalysis({
  sbuId,
  effective,
  rollup,
}: {
  sbuId: number;
  effective: EffectiveCampaign[];
  rollup: ReturnType<typeof rollupBySbu>;
}) {
  const campaigns = campaignsForSbu(effective, sbuId);
  const c = rollupForSbu(rollup, sbuId);
  const totals = sbuTotals(campaigns);
  return (
    <div className="mk-expand-block">
      <div className="mk-expand-title">Campaign-wise ROMI</div>
      {campaigns.length === 0 ? (
        <p className="mk-expand-text">No campaign submissions for this SBU yet.</p>
      ) : (
        <>
          <div className="mk-expand-text" style={{ marginBottom: "0.5rem" }}>
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} · Investment quality{" "}
            <span className={`mk-eff ${qualityClass(c.quality)}`}>
              {QUALITY_LABEL[c.quality]}
            </span>
          </div>
          <table className="mk-detail-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Start</th>
                <th>End</th>
                <th className="num">Expense (Cr)</th>
                <th className="num">Top-ROMI</th>
                <th className="num">Bottom-ROMI</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((camp) => (
                <tr key={`${camp.campaign_name}-${camp.start_date ?? ""}`}>
                  <td>
                    <div className="code">{camp.campaign_name}</div>
                    <div className="code-sub">{camp.category ?? ""}</div>
                  </td>
                  <td>{camp.start_date ?? "—"}</td>
                  <td>{camp.end_date ?? "—"}</td>
                  <td className="num">{cr(camp.marketing_expense)}</td>
                  <td className="num">{romiStr(camp.romi_top)}</td>
                  <td className="num">{romiStr(camp.romi_bottom)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="mk-total">
                <td colSpan={3}>Total</td>
                <td className="num">{cr(totals.total_marketing)}</td>
                <td className="num">{romiStr(totals.total_romi_top)}</td>
                <td className="num">{romiStr(totals.total_romi_bottom)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </div>
  );
}

function PurposeBreakdown({
  sbuId,
  detail,
}: {
  sbuId: number;
  detail: MarketingSpendDetailRow[];
}) {
  const rows = detail
    .filter((d) => d.sbu_id === sbuId)
    .sort((a, b) => (b.mtd_spend ?? 0) - (a.mtd_spend ?? 0));
  const total = rows.reduce((a, r) => a + (r.mtd_spend ?? 0), 0);
  return (
    <div className="mk-expand-block">
      <div className="mk-expand-title">Spend purpose breakdown</div>
      {rows.length === 0 ? (
        <p className="mk-expand-text">No SubGL purpose breakdown recorded for this month yet.</p>
      ) : (
        <table className="mk-detail-table">
          <thead>
            <tr>
              <th>Purpose (SubGL)</th>
              <th className="num">MTD Spend (Cr)</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.subgl_code}>
                <td>
                  <div className="code">{d.subgl_name}</div>
                  <div className="code-sub">{d.subgl_code}</div>
                </td>
                <td className="num">{d.mtd_spend === null ? "—" : fmt(d.mtd_spend)}</td>
                <td className="num">
                  {d.mtd_spend === null || total === 0
                    ? "—"
                    : fmtPct((d.mtd_spend / total) * 100, 1)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="mk-total">
              <td>Total</td>
              <td className="num">{fmt(total)}</td>
              <td className="num" />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function ExpandedRow({
  row,
  monthly,
  detail,
  effective,
  rollup,
}: {
  row: MarketingRow;
  monthly: MarketingSpendMonthlyRow[];
  detail: MarketingSpendDetailRow[];
  effective: EffectiveCampaign[];
  rollup: ReturnType<typeof rollupBySbu>;
}) {
  return (
    <tr className="mk-expanded">
      <td colSpan={11}>
        <div className="mk-expand-body">
          <div className="mk-expand-cols">
            <div className="mk-expand-block">
              <div className="mk-expand-title">What the money bought</div>
              <p className="mk-expand-text">{efficiencyWhy(row)}</p>
            </div>
            <div className="mk-expand-block">
              <div className="mk-expand-title">How to improve</div>
              <p className="mk-expand-text">{efficiencyHow(row)}</p>
            </div>
          </div>
          <div className="mk-expand-cols">
            <div className="mk-expand-block">
              <SpendTrend sbuId={row.sbu_id} monthly={monthly} />
            </div>
            <PurposeBreakdown sbuId={row.sbu_id} detail={detail} />
          </div>
          <CampaignAnalysis sbuId={row.sbu_id} effective={effective} rollup={rollup} />
        </div>
      </td>
    </tr>
  );
}

function SpendTable({
  rows,
  monthly,
  detail,
  effective,
  rollup,
  targets,
}: {
  rows: MarketingRow[];
  monthly: MarketingSpendMonthlyRow[];
  detail: MarketingSpendDetailRow[];
  effective: EffectiveCampaign[];
  rollup: ReturnType<typeof rollupBySbu>;
  targets: Map<number, MarketingLedTarget>;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>Marketing efficiency by SBU</h3>
        <span className="ac-hint">
          Marketing-led revenue = actual − organic baseline (F − G) · ROMI (led) = (led revenue −
          spend) ÷ spend · Target = FY27 annual marketing-led target (range) · vs Target = led
          revenue ÷ target midpoint · click a row for trend &amp; campaigns
        </span>
      </div>
      <div className="mk-table-wrap">
        <table className="scorecard-table mk-table">
          <thead>
            <tr>
              <th>SBU</th>
              <th className="num">MTD Spend (Cr)</th>
              <th className="num">Spend MoM</th>
              <th className="num">Marketing-led Revenue (Cr)</th>
              <th className="num">Marketing-led Target (Cr)</th>
              <th className="num">vs Target</th>
              <th className="num">ROMI (led)</th>
              <th className="num">YoY Δ (Cr)</th>
              <th className="num">Intensity</th>
              <th className="num">FY YTD Spend (Cr)</th>
              <th>Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = expanded === r.sbu_id;
              const ru = rollupForSbu(rollup, r.sbu_id);
              const target = targets.get(r.sbu_id) ?? null;
              return (
                <Fragment key={r.sbu_id}>
                  <tr className="mk-row" onClick={() => setExpanded(isOpen ? null : r.sbu_id)}>
                    <td>
                      <span className="code">{r.code}</span>
                      <span className="code-sub">{r.name ?? r.code}</span>
                    </td>
                    <td className="num">{fmt(r.mtdSpend)}</td>
                    <td className={`num ${r.spendMomPct === null ? "mom-neu" : r.spendMomPct > 0 ? "mom-up" : "mom-down"}`}>
                      {r.spendMomPct === null ? "—" : `${fmtPct(r.spendMomPct)}`}
                    </td>
                    <td className="num">{ledCr(ru)}</td>
                    <td className="num">{target ? marketingLedTargetStr(target) : "—"}</td>
                    <td className="num"><TargetBar target={target} ledRevCr={ledCrNum(ru)} /></td>
                    <td className="num">{ledRomi(ru)}</td>
                    <td className="num">{fmt(r.liftRevenue)}</td>
                    <td className="num"><IntensityBar value={r.intensityMtd} /></td>
                    <td className="num">{fmt(r.fyYtdSpend)}</td>
                    <td>
                      <span className={`mk-eff ${efficiencyClass(r.efficiency)}`}>
                        {EFFICIENCY_LABEL[r.efficiency]}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <ExpandedRow
                      row={r}
                      monthly={monthly}
                      detail={detail}
                      effective={effective}
                      rollup={rollup}
                    />
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MarketingTab({
  reportDate,
  export: isExport = false,
}: {
  reportDate: string;
  export?: boolean;
}) {
  const scorecard = useQuery({
    queryKey: ["scorecard", reportDate],
    queryFn: () => fetchScorecard(reportDate),
  });
  const spend = useQuery({
    queryKey: ["marketing-spend-campaignable", reportDate],
    queryFn: () => fetchMarketingSpendCampaignable(reportDate),
  });
  const monthly = useQuery({
    queryKey: ["marketing-spend-monthly-campaignable"],
    queryFn: () => fetchMarketingSpendMonthlyCampaignable(),
  });
  const detail = useQuery({
    queryKey: ["marketing-spend-detail", reportDate],
    queryFn: () => fetchMarketingSpendDetail(reportDate),
  });
  const romi = useQuery({
    queryKey: ["romi-campaigns"],
    queryFn: () => fetchRomiCampaigns(),
  });
  const sbus = useQuery({
    queryKey: ["romi-sbus"],
    queryFn: () => fetchRomiSbus(),
  });
  const exportMode = useExportMode();
  const [layer, setLayer] = useState<"overview" | "romi">("overview");

  const rows = useMemo(
    () => buildMarketingRows(scorecard.data ?? [], spend.data ?? []),
    [scorecard.data, spend.data],
  );

  const effective = useMemo(
    () => (romi.data ?? []).map(computeEffective),
    [romi.data],
  );

  const rollup = useMemo(() => rollupBySbu(effective), [effective]);

  const targets = useMemo(
    () => marketingLedTargets(sbus.data ?? []),
    [sbus.data],
  );

  const recon = useMemo(
    () => buildSpendReconciliation(rows, effective, reportDate),
    [rows, effective, reportDate],
  );

  const benchmarkMonth = useMemo(
    () => buildBenchmarkRows(
      effective.filter((r) => r.report_month === reportDate.slice(0, 7)),
      sbus.data ?? [],
    ),
    [effective, sbus.data, reportDate],
  );

  const monthCampaigns = useMemo(
    () =>
      (romi.data ?? []).filter(
        (r) => r.report_month === reportDate.slice(0, 7),
      ),
    [romi.data, reportDate],
  );

  const loading = scorecard.isLoading || spend.isLoading;

  if (isExport) {
    return (
      <>
        <div className="export-block" data-export-block data-export-keep>
          <h2 className="export-section">Marketing Analysis — ROMI &amp; Spend Efficiency</h2>
          <p className="export-intro">
            Campaign-able marketing spend (GL 4210001 less trade/people/overhead SubGL) against
            revenue, per SBU. <strong>Marketing-led
            revenue</strong> is the campaign increment (F − G): actual campaign-month revenue minus
            the SBU's organic baseline (6-month average before the campaign). <strong>ROMI
            (led)</strong> is (led revenue − campaign spend) ÷ campaign spend. <strong>YoY Δ</strong> is
            the reference year-over-year revenue delta (this month vs prior-year same period).
            <strong>Spend intensity</strong> is marketing spend as a % of MTD revenue.
            <strong>Efficiency</strong> ranks each SBU against the portfolio median.
            <strong>Marketing-led Target</strong> is the FY2026-27 annual marketing-led revenue
            target (a range where Marketing set one); <strong>vs Target</strong> is marketing-led
            revenue ÷ target midpoint.
          </p>
        </div>

        <div className="export-block" data-export-block data-export-keep>
          <SummaryCards rows={rows} effective={effective} />
        </div>

        <div className="export-block" data-export-block>
          <table className="scorecard-table mk-table">
            <thead>
              <tr>
                <th>SBU</th>
                <th className="num">MTD Spend (Cr)</th>
                <th className="num">Spend MoM</th>
                <th className="num">Marketing-led Revenue (Cr)</th>
                <th className="num">Marketing-led Target (Cr)</th>
                <th className="num">vs Target</th>
                <th className="num">ROMI (led)</th>
                <th className="num">YoY Δ (Cr)</th>
                <th className="num">Intensity</th>
                <th className="num">FY YTD Spend (Cr)</th>
                <th>Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ru = rollupForSbu(rollup, r.sbu_id);
                const target = targets.get(r.sbu_id) ?? null;
                const ledRev = ledCrNum(ru);
                const pct = target && ledRev !== null ? marketingLedTargetPct(target, ledRev) : null;
                return (
                  <tr key={r.sbu_id}>
                    <td>
                      <span className="code">{r.code}</span>
                      <span className="code-sub">{r.name ?? r.code}</span>
                    </td>
                    <td className="num">{fmt(r.mtdSpend)}</td>
                    <td className={`num ${r.spendMomPct === null ? "mom-neu" : r.spendMomPct > 0 ? "mom-up" : "mom-down"}`}>
                      {r.spendMomPct === null ? "—" : `${fmtPct(r.spendMomPct)}`}
                    </td>
                    <td className="num">{ledCr(ru)}</td>
                    <td className="num">{target ? marketingLedTargetStr(target) : "—"}</td>
                    <td className="num">{pct === null ? "—" : `${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`}</td>
                    <td className="num">{ledRomi(ru)}</td>
                    <td className="num">{fmt(r.liftRevenue)}</td>
                    <td className="num">{r.intensityMtd !== null ? fmtPct(r.intensityMtd, 2) : "—"}</td>
                    <td className="num">{fmt(r.fyYtdSpend)}</td>
                    <td>
                      <span className={`mk-eff ${efficiencyClass(r.efficiency)}`}>
                        {EFFICIENCY_LABEL[r.efficiency]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="export-block" data-export-block data-export-keep>
          <h2 className="export-section">Marketing Spend Reconciliation</h2>
          <SpendReconciliation rows={recon} />
        </div>
      </>
    );
  }

  return (
    <div className="marketing-tab">
      <div className="biir-hero">
        <div>
          <h2>Marketing Analysis</h2>
          <p className="biir-hero-sub">
            Return on marketing investment (ROMI) and spend efficiency — actuals only
          </p>
        </div>
        <div className="biir-hero-meta">
          <span className="badge badge-ok">Source: GL 4210001 (campaign-able) · actuals (T-1)</span>
        </div>
      </div>

      <div className="layer-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={layer === "overview"}
          className={layer === "overview" ? "layer-tab active" : "layer-tab"}
          onClick={() => setLayer("overview")}
        >
          Marketing Led Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={layer === "romi"}
          className={layer === "romi" ? "layer-tab active" : "layer-tab"}
          onClick={() => setLayer("romi")}
        >
          ROMI Analysis
        </button>
      </div>

      {layer === "romi" ? (
        <RomiAnalysisLayer />
      ) : loading && rows.length === 0 ? (
        <div className="loading-screen">Loading marketing spend…</div>
      ) : rows.length === 0 ? (
        <div className="chart-box no-data">
          No marketing spend recorded for this date. Run the ETL marketing backfill to populate
          historical data.
        </div>
      ) : (
        <div className="marketing-body">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <span className="ac-hint">
              Exports — {reportDate.slice(0, 7)}
            </span>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  void exportCampaignLedgerExcel(monthCampaigns, reportDate.slice(0, 7))
                }
              >
                Export Campaign Detail (.xlsx)
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  void exportBranchMarkExcel(benchmarkMonth, reportDate.slice(0, 7))
                }
              >
                Export Branch Mark (.xlsx)
              </button>
            </div>
          </div>

          <SummaryCards rows={rows} effective={effective} />

          <SpendTable
            rows={rows}
            monthly={monthly.data ?? []}
            detail={detail.data ?? []}
            effective={effective}
            rollup={rollup}
            targets={targets}
          />

          <SpendReconciliation rows={recon} />

          {!exportMode && !isExport && (
            <div className="insight-box">
              <h3>How to read this</h3>
              <ul>
                <li>
                  <b>Marketing spend</b> here is <b>campaign-able</b> spend — GL 4210001 excluding
                  trade/people/overhead SubGL (commission, discount, salary, bonus, etc.). The full
                  GL 4210001 is visible in each SBU's "Spend purpose breakdown".
                </li>
                <li>
                  <b>Marketing-led revenue</b> is the campaign increment <i>F − G</i>: actual
                  campaign-month revenue minus the SBU's organic baseline (the 6-month average
                  before the campaign). It is the revenue we attribute to marketing, not to the
                  business's normal run-rate.
                </li>
                <li>
                  <b>ROMI (led)</b> = (marketing-led revenue − campaign spend) ÷ campaign spend. A
                  2.5× means 2.5 Tk of profit-eligible led revenue above spend per 1 Tk spent.
                </li>
                <li>
                  <b>YoY Δ</b> is the whole-SBU revenue delta vs the prior-year same period — kept
                  only as a reference (it mixes organic growth with marketing effect).
                </li>
                <li>
                  <b>Spend intensity</b> is marketing spend as a % of MTD revenue — a rising
                  intensity with flat led revenue is the first sign of inefficient spend.
                </li>
                <li>
                  <b>Efficiency</b> ranks each SBU against the portfolio median, so it stays
                  meaningful across very different businesses.
                </li>
                <li>
                  <b>Campaign analysis</b> (click a row) shows each campaign's ledger: expense,
                  increment, top/bottom ROMI, and investment quality vs the branch mark.
                </li>
                <li>
                  Attribution assumes <b>same-month</b> effect (a campaign is scored each month it
                  runs); long NXAT carryover is not yet modelled.
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
