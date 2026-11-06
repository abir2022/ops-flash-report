import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchRomiCampaigns, fetchRomiSbus } from "../../api/client";
import { fmt, fmtPct } from "../../lib/format";
import { chartTheme, useTheme } from "../../lib/chartTheme";
import {
  buildBenchmarkRows,
  computeEffective,
  rankCampaigns,
  sbuTotals,
  type BenchmarkRow,
  type EffectiveCampaign,
} from "../../lib/romi";
import { exportBranchMarkExcel, exportCampaignLedgerExcel } from "../../lib/exportExcel";
import type { RomiCampaignRow } from "../../types";

// ---- formatting -------------------------------------------------------------

// Raw BDT → Cr (1 Cr = 10 million BDT).
function cr(v: number | null): string {
  return v === null ? "—" : fmt(v / 10_000_000);
}

function romiStr(v: number | null): string {
  return v === null ? "—" : `${fmt(v, 1)}×`;
}

// gp_margin is stored as a fraction (0.35 = 35%).
function gpPct(v: number): string {
  return fmtPct(v * 100, 1);
}

// ---- branch-mark status / gap helpers --------------------------------------

function branchStatus(r: BenchmarkRow): { label: string; cls: string } {
  const hasMark = r.benchmark_top !== null || r.benchmark_bottom !== null;
  const hasData = r.total_romi_top !== null || r.total_romi_bottom !== null;
  if (!hasMark) return { label: "—", cls: "mk-eff-none" };
  if (!hasData) return { label: "NO DATA", cls: "mk-eff-watch" };
  const topHit =
    r.benchmark_top === null ||
    (r.total_romi_top !== null && r.total_romi_top >= r.benchmark_top);
  const bottomHit =
    r.benchmark_bottom === null ||
    (r.total_romi_bottom !== null && r.total_romi_bottom >= r.benchmark_bottom);
  if (topHit && bottomHit) return { label: "ON TRACK", cls: "mk-eff-good" };
  return { label: "BELOW MARK", cls: "mk-eff-risk" };
}

function gapStr(actual: number | null, mark: number | null): string {
  if (actual === null || mark === null) return "—";
  const g = actual - mark;
  return `${g >= 0 ? "+" : ""}${fmt(g, 2)}×`;
}

function gapCls(actual: number | null, mark: number | null): string {
  if (actual === null || mark === null) return "mom-neu";
  return actual - mark >= 0 ? "mom-up" : "mom-down";
}

function markCell(v: number | null): string {
  if (v === null) return "—";
  return v >= 0 ? `≥${fmt(v, 2)}×` : `${fmt(v, 2)}×`;
}

// ---- overview KPIs ----------------------------------------------------------

function OverviewCards({
  effective,
  benchmarkCount,
}: {
  effective: EffectiveCampaign[];
  benchmarkCount: number;
}) {
  const t = sbuTotals(effective);
  return (
    <div className="snapshot-cards mk-summary">
      <div className="snap-card">
        <div className="label">Campaigns tracked</div>
        <div className="val">{effective.length}</div>
        <div className="sub">campaign ledger this month</div>
      </div>
      <div className="snap-card">
        <div className="label">Marketing Led Increment</div>
        <div className="val">
          {effective.length ? cr(t.total_incr_rev) : "—"}
          <span className="unit">Cr</span>
        </div>
        <div className="sub">Σ (F − G) across campaigns</div>
      </div>
      <div className="snap-card">
        <div className="label">Marketing Expense</div>
        <div className="val">
          {effective.length ? cr(t.total_marketing) : "—"}
          <span className="unit">Cr</span>
        </div>
        <div className="sub">GL campaign pool (month)</div>
      </div>
      <div className="snap-card">
        <div className="label">ROMI (Top Line)</div>
        <div className="val">{t.total_romi_top !== null ? romiStr(t.total_romi_top) : "—"}</div>
        <div className="sub">(led revenue − spend) ÷ spend</div>
      </div>
      <div className="snap-card">
        <div className="label">SBUs benchmarked</div>
        <div className="val">{benchmarkCount}</div>
        <div className="sub">branch-mark comparison</div>
      </div>
    </div>
  );
}

// ---- full campaign ledger ---------------------------------------------------

function CampaignLedgerTable({ rows }: { rows: EffectiveCampaign[] }) {
  return (
    <div className="mk-table-wrap">
        <table className="scorecard-table mk-table">
          <thead>
            <tr>
              <th>SBU</th>
              <th>Campaign</th>
              <th>Category</th>
              <th>Month</th>
              <th>Start</th>
              <th>End</th>
              <th className="num">Actual Rev</th>
              <th className="num">Organic</th>
              <th className="num">SPLY</th>
              <th className="num">Led Increment</th>
              <th className="num">GP %</th>
              <th className="num">Actual Profit</th>
              <th className="num">Base Profit</th>
              <th className="num">SPLY Profit</th>
              <th className="num">Led Profit</th>
              <th className="num">Expense (GL)</th>
              <th className="num">Officer Exp</th>
              <th className="num">ROMI Top</th>
              <th className="num">ROMI Bottom</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={19} className="no-data">No campaign data for this month.</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.business_unit_id}-${r.campaign_name}-${i}`}>
                  <td>
                    <span className="code">{r.code ?? r.business_unit_id}</span>
                    <span className="code-sub">{r.sbu_name ?? ""}</span>
                  </td>
                  <td>
                    <div className="code">{r.campaign_name}</div>
                  </td>
                  <td>{r.category ?? "—"}</td>
                  <td>{r.report_month ?? "—"}</td>
                  <td>{r.start_date ?? "—"}</td>
                  <td>{r.end_date ?? "—"}</td>
                  <td className="num">{cr(r.actual_rev)}</td>
                  <td className="num">{cr(r.organic_rev)}</td>
                  <td className="num">{cr(r.sply_rev)}</td>
                  <td className="num">{cr(r.incr_rev)}</td>
                  <td className="num">{gpPct(r.gp_margin)}</td>
                  <td className="num">{cr(r.actual_profit)}</td>
                  <td className="num">{cr(r.base_profit)}</td>
                  <td className="num">{cr(r.sply_profit)}</td>
                  <td className="num">{cr(r.incr_profit)}</td>
                  <td className="num">{cr(r.marketing_expense)}</td>
                  <td className="num">{cr(r.officer_expense_total)}</td>
                  <td className="num">{romiStr(r.romi_top)}</td>
                  <td className="num">{romiStr(r.romi_bottom)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
  );
}

function FullCampaignTable({
  rows,
  raw,
  reportMonth,
}: {
  rows: EffectiveCampaign[];
  raw: RomiCampaignRow[];
  reportMonth?: string;
}) {
  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>Campaign Ledger</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <span className="ac-hint">All filed campaigns for the selected reporting month</span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void exportCampaignLedgerExcel(raw, reportMonth)}
          >
            Export Campaign Detail (.xlsx)
          </button>
        </div>
      </div>
      <CampaignLedgerTable rows={rows} />
    </div>
  );
}

// ---- SBU-wise totals --------------------------------------------------------

function SbuTotalsTable({ rows }: { rows: EffectiveCampaign[] }) {
  const byBu = new Map<number, EffectiveCampaign[]>();
  for (const r of rows) {
    const list = byBu.get(r.business_unit_id) ?? [];
    list.push(r);
    byBu.set(r.business_unit_id, list);
  }
  const entries = Array.from(byBu.entries())
    .map(([buId, rws]) => {
      const first = rws[0];
      return {
        buId,
        code: first.code ?? String(buId),
        name: first.sbu_name,
        t: sbuTotals(rws),
      };
    })
    .sort((a, b) => (b.t.total_romi_top ?? -Infinity) - (a.t.total_romi_top ?? -Infinity));

  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>SBU-wise Totals</h3>
        <span className="ac-hint">Campaign-level figures rolled up per SBU</span>
      </div>
      <div className="mk-table-wrap">
        <table className="scorecard-table mk-table">
          <thead>
            <tr>
              <th>SBU</th>
              <th className="num">Campaigns</th>
              <th className="num">Led Increment (Cr)</th>
              <th className="num">Led Profit (Cr)</th>
              <th className="num">Expense (Cr)</th>
              <th className="num">ROMI Top</th>
              <th className="num">ROMI Bottom</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="no-data">No SBU campaign totals yet.</td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.buId}>
                  <td>
                    <span className="code">{e.code}</span>
                    <span className="code-sub">{e.name ?? ""}</span>
                  </td>
                  <td className="num">{e.t.n_campaigns}</td>
                  <td className="num">{cr(e.t.total_incr_rev)}</td>
                  <td className="num">{cr(e.t.total_incr_profit)}</td>
                  <td className="num">{cr(e.t.total_marketing)}</td>
                  <td className="num">{romiStr(e.t.total_romi_top)}</td>
                  <td className="num">{romiStr(e.t.total_romi_bottom)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- branch mark vs actual --------------------------------------------------

function BranchMarkChart({
  rows,
  which,
  logScale,
}: {
  rows: BenchmarkRow[];
  which: "top" | "bottom";
  logScale: boolean;
}) {
  const c = chartTheme(useTheme());
  if (rows.length === 0) {
    return <div className="no-data">No benchmarked SBUs to compare.</div>;
  }
  const data = rows.map((r) => {
    const actual = which === "top" ? r.total_romi_top : r.total_romi_bottom;
    const mark = which === "top" ? r.benchmark_top : r.benchmark_bottom;
    return {
      code: r.code,
      actual: logScale && actual !== null && actual > 0 ? actual : logScale ? null : actual,
      mark: logScale && mark !== null && mark > 0 ? mark : logScale ? null : mark,
    };
  });

  const positives = data
    .flatMap((d) => [d.actual, d.mark])
    .filter((v): v is number => v !== null && v > 0);
  const minPositive = positives.length ? Math.min(...positives) : 1;
  const domain: [number, "auto"] = logScale ? [minPositive / 2, "auto"] : [0, "auto"];

  const title = which === "top" ? "Top-line ROMI — actual vs mark" : "Bottom-line ROMI — actual vs mark";
  return (
    <div className="mk-chart" style={{ marginBottom: "1rem" }}>
      <div className="mk-chart-title">{title}</div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="code"
            stroke={c.axis}
            tick={{ fill: c.tick.fill, fontSize: 10 }}
            angle={-45}
            textAnchor="end"
            height={64}
            interval={0}
          />
          <YAxis
            stroke={c.axis}
            tick={c.tick}
            scale={logScale ? "log" : "auto"}
            domain={domain}
            allowDataOverflow={false}
          />
          <Tooltip
            contentStyle={c.tooltipStyle}
            labelStyle={c.labelStyle}
            itemStyle={c.itemStyle}
            formatter={(v) => `${fmt(Number(v), 2)}×`}
          />
          <Bar dataKey="actual" name="Actual" fill="#2563eb" radius={[3, 3, 0, 0]} />
          <Bar dataKey="mark" name="Mark (≥)" fill="#f59e0b" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mk-chart-legend">
        <span>
          <i style={{ background: "#2563eb" }} /> Actual
        </span>
        <span>
          <i style={{ background: "#f59e0b" }} /> Mark (≥)
        </span>
      </div>
    </div>
  );
}

function BranchMarkTable({
  rows,
  campaigns,
}: {
  rows: BenchmarkRow[];
  campaigns: EffectiveCampaign[];
}) {
  const [expandedBu, setExpandedBu] = useState<number | null>(null);
  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>Branch Mark vs Actual</h3>
        <span className="ac-hint">
          Portfolio top/bottom ROMI vs each SBU's branch mark — hover a mark for its rationale
        </span>
      </div>
      <div className="mk-table-wrap">
        <table className="scorecard-table mk-table">
          <thead>
            <tr>
              <th>SBU</th>
              <th className="num">Campaigns</th>
              <th className="num">Branch Mark Top</th>
              <th className="num">ROMI Top</th>
              <th className="num">Gap Top</th>
              <th className="num">Branch Mark Bottom</th>
              <th className="num">ROMI Bottom</th>
              <th className="num">Gap Bottom</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="no-data">No benchmarked SBUs yet.</td>
              </tr>
            ) : rows.map((r) => {
              const status = branchStatus(r);
              const isOpen = expandedBu === r.business_unit_id;
              const buCampaigns = campaigns.filter(
                (c) => c.business_unit_id === r.business_unit_id,
              );
              return (
                <Fragment key={r.business_unit_id}>
                  <tr
                    className="mk-row"
                    onClick={() => setExpandedBu(isOpen ? null : r.business_unit_id)}
                  >
                    <td>
                      <span className="code">{r.code}</span>
                      <span className="code-sub">{r.name ?? r.code}</span>
                    </td>
                    <td className="num">{r.n_campaigns}</td>
                  <td className="num">
                    <span className="bm-mark" title={r.benchmark_note || undefined}>
                      {markCell(r.benchmark_top)}
                    </span>
                  </td>
                  <td className="num">{romiStr(r.total_romi_top)}</td>
                  <td className={`num ${gapCls(r.total_romi_top, r.benchmark_top)}`}>
                    {gapStr(r.total_romi_top, r.benchmark_top)}
                  </td>
                  <td className="num">
                    <span className="bm-mark" title={r.benchmark_note || undefined}>
                      {markCell(r.benchmark_bottom)}
                    </span>
                  </td>
                  <td className="num">{romiStr(r.total_romi_bottom)}</td>
                  <td className={`num ${gapCls(r.total_romi_bottom, r.benchmark_bottom)}`}>
                    {gapStr(r.total_romi_bottom, r.benchmark_bottom)}
                  </td>
                    <td>
                      <span className={`mk-eff ${status.cls}`}>{status.label}</span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="mk-expanded">
                      <td colSpan={9}>
                        <div className="mk-expand-title">
                          {r.code} — Campaign ROMI Analysis ({buCampaigns.length})
                        </div>
                        <CampaignLedgerTable rows={buCampaigns} />
                      </td>
                    </tr>
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

// ---- top & bottom campaigns -------------------------------------------------

function RankTable({ rows }: { rows: EffectiveCampaign[] }) {
  return (
    <div className="mk-table-wrap">
      <table className="scorecard-table mk-table">
        <thead>
          <tr>
            <th>SBU</th>
            <th>Campaign</th>
            <th>Activity</th>
            <th className="num">Expense (Cr)</th>
            <th className="num">Led Increment (Cr)</th>
            <th className="num">ROMI Top</th>
            <th className="num">ROMI Bottom</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="no-data">No campaigns to rank.</td>
            </tr>
          ) : rows.map((r, i) => (
            <tr key={`${r.business_unit_id}-${r.campaign_name}-${i}`}>
              <td>{r.code ?? r.business_unit_id}</td>
              <td>
                <div className="code">{r.campaign_name}</div>
              </td>
              <td>{r.category ?? "—"}</td>
              <td className="num">{cr(r.marketing_expense)}</td>
              <td className="num">{cr(r.incr_rev)}</td>
              <td className="num">{romiStr(r.romi_top)}</td>
              <td className="num">{romiStr(r.romi_bottom)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- main layer -------------------------------------------------------------

export function RomiAnalysisLayer() {
  const campaigns = useQuery({
    queryKey: ["romi-campaigns"],
    queryFn: fetchRomiCampaigns,
  });
  const sbus = useQuery({
    queryKey: ["romi-sbus"],
    queryFn: fetchRomiSbus,
  });

  const effective = useMemo(
    () => (campaigns.data ?? []).map(computeEffective),
    [campaigns.data],
  );

  const months = useMemo(() => {
    const seen = new Set<string>();
    for (const r of effective) {
      if (r.report_month) seen.add(r.report_month);
    }
    return Array.from(seen).sort().reverse();
  }, [effective]);

  const [month, setMonth] = useState<string | null>(null);
  const [logScale, setLogScale] = useState(true);
  const [sbuSel, setSbuSel] = useState<string>("__all");
  const selectedMonth = month ?? months[0] ?? null;

  const monthEffective = useMemo(
    () =>
      selectedMonth
        ? effective.filter((r) => r.report_month === selectedMonth)
        : effective,
    [effective, selectedMonth],
  );

  const monthRaw = useMemo(
    () =>
      selectedMonth
        ? (campaigns.data ?? []).filter((r) => r.report_month === selectedMonth)
        : (campaigns.data ?? []),
    [campaigns.data, selectedMonth],
  );

  const benchmarkRows = useMemo(
    () => buildBenchmarkRows(monthEffective, sbus.data ?? []),
    [monthEffective, sbus.data],
  );

  const sbuLabels = useMemo(() => {
    const seen = new Set<string>();
    const out: { code: string }[] = [];
    for (const r of monthEffective) {
      const key = r.code ?? String(r.business_unit_id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ code: key });
    }
    return out.sort((a, b) => a.code.localeCompare(b.code));
  }, [monthEffective]);

  const subset = useMemo(
    () =>
      sbuSel === "__all"
        ? monthEffective
        : monthEffective.filter(
            (r) => (r.code ?? String(r.business_unit_id)) === sbuSel,
          ),
    [monthEffective, sbuSel],
  );
  const ranking = useMemo(() => rankCampaigns(subset, 10), [subset]);

  if (campaigns.isLoading || sbus.isLoading) {
    return <div className="loading-screen">Loading ROMI analysis…</div>;
  }
  if (campaigns.isError || sbus.isError) {
    return (
      <div className="chart-box no-data">
        ROMI data unavailable
        {(campaigns.error as Error)?.message ? ` — ${(campaigns.error as Error).message}` : ""}
      </div>
    );
  }

  return (
    <div className="marketing-body">
      {effective.length === 0 && (
        <div className="chart-box no-data" style={{ marginBottom: "1rem" }}>
          No campaigns filed yet — the tables and charts below are empty until officers submit
          campaigns via the Officer Portal.
        </div>
      )}
      <div className="chart-box">
        <div className="analysis-head">
          <h3>Reporting Month</h3>
          {months.length > 0 ? (
            <select value={selectedMonth} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <span className="mom-neu">No reporting month yet</span>
          )}
        </div>
        <span className="ac-hint">
          Campaigns are scored each month they run — pick a month to see that month's ledger, SBU
          totals and branch-mark comparison.
        </span>
      </div>

      <OverviewCards effective={monthEffective} benchmarkCount={benchmarkRows.length} />

      <FullCampaignTable rows={monthEffective} raw={monthRaw} reportMonth={selectedMonth ?? undefined} />

      <SbuTotalsTable rows={monthEffective} />

      <div className="chart-box">
        <div className="analysis-head">
          <h3>Branch Mark vs Actual</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <label className="bm-toggle">
              <input
                type="checkbox"
                checked={logScale}
                onChange={(e) => setLogScale(e.target.checked)}
              />
              Log scale (recommended — keeps the branch marks visible)
            </label>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void exportBranchMarkExcel(benchmarkRows, selectedMonth ?? undefined)}
            >
              Export Excel (.xlsx)
            </button>
          </div>
        </div>
        <BranchMarkChart rows={benchmarkRows} which="top" logScale={logScale} />
        <BranchMarkChart rows={benchmarkRows} which="bottom" logScale={logScale} />
      </div>

      <BranchMarkTable rows={benchmarkRows} campaigns={monthEffective} />

      <div className="chart-box">
        <div className="analysis-head">
          <h3>Top &amp; Bottom Campaigns</h3>
          <select value={sbuSel} onChange={(e) => setSbuSel(e.target.value)}>
            <option value="__all">All SBUs</option>
            {sbuLabels.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}
              </option>
            ))}
          </select>
        </div>
        <div className="mk-expand-cols">
          <div>
            <div className="mk-expand-title">Top 10 Campaigns</div>
            <RankTable rows={ranking.top} />
          </div>
          <div>
            <div className="mk-expand-title">Bottom 10 Campaigns</div>
            <RankTable rows={ranking.bottom} />
          </div>
        </div>
      </div>
    </div>
  );
}
