import { useMemo } from "react";
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
import { fetchPartnerFeedDailyTotal, fetchPartnerFeedOfficePl } from "../../api/client";
import { fmt, fmtPct } from "../../lib/format";
import { chartTheme, useTheme } from "../../lib/chartTheme";
import {
  buildDailyTrend,
  departmentRollup,
  officeScorecard,
  summarize,
  CR,
  type DailyPoint,
  type PartnerFeedSummary,
} from "../../lib/partnerFeed";

function marginCell(v: number | null): string {
  return v === null ? "—" : fmtPct(v, 1);
}

function SummaryCards({ summary }: { summary: PartnerFeedSummary }) {
  return (
    <div className="snapshot-cards mk-summary">
      <div className="snap-card">
        <div className="label">MTD Sales</div>
        <div className="val">
          {fmt(summary.mtdSales / CR)}
          <span className="unit">Cr</span>
        </div>
        <div className="sub">{summary.monthLabel} · net of returns</div>
      </div>
      <div className="snap-card">
        <div className="label">Latest Day</div>
        <div className="val">
          {fmt(summary.todaySales / CR)}
          <span className="unit">Cr</span>
        </div>
        <div className="sub">most recent trading day</div>
      </div>
      <div className="snap-card">
        <div className="label">Avg Daily Sales</div>
        <div className="val">
          {fmt(summary.avgDaily / CR)}
          <span className="unit">Cr</span>
        </div>
        <div className="sub">{summary.days} days reported</div>
      </div>
      <div className="snap-card">
        <div className="label">MTD Net Profit</div>
        <div className="val">
          {fmt(summary.mtdProfit / CR)}
          <span className="unit">Cr</span>
        </div>
        <div className="sub">net sales − cost</div>
      </div>
      <div className="snap-card">
        <div className="label">Gross Margin</div>
        <div className="val">{summary.marginPct === null ? "—" : fmtPct(summary.marginPct, 1)}</div>
        <div className="sub">profit ÷ net sales</div>
      </div>
      <div className="snap-card">
        <div className="label">Outlets Reporting</div>
        <div className="val">{summary.outlets}</div>
        <div className="sub">offices with P&amp;L</div>
      </div>
    </div>
  );
}

function DailyTrend({ points }: { points: DailyPoint[] }) {
  const c = chartTheme(useTheme());
  if (points.length === 0) return <div className="no-data">No daily sales recorded.</div>;
  const series = points.map((p) => ({ ...p, value: p.value / CR }));
  return (
    <div className="mk-chart">
      <div className="mk-chart-title">Daily net sales (Cr)</div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="d" stroke={c.axis} tick={c.tick} minTickGap={24} />
          <YAxis stroke={c.axis} tick={c.tick} width={48} />
          <Tooltip
            contentStyle={c.tooltipStyle}
            labelStyle={c.labelStyle}
            itemStyle={c.itemStyle}
            formatter={(v: number) => [fmt(v), "Cr"]}
          />
          <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DepartmentTable({ pl }: { pl: ReturnType<typeof departmentRollup> }) {
  if (pl.length === 0) return <div className="no-data">No department P&amp;L recorded.</div>;
  return (
    <table className="scorecard-table mk-table">
      <thead>
        <tr>
          <th>Department</th>
          <th className="num">Net Sales (Cr)</th>
          <th className="num">Cost (Cr)</th>
          <th className="num">Profit (Cr)</th>
          <th className="num">Margin</th>
        </tr>
      </thead>
      <tbody>
        {pl.map((d) => (
          <tr key={d.department}>
            <td className="code">{d.department}</td>
            <td className="num">{fmt(d.netSales / CR)}</td>
            <td className="num">{fmt(d.cost / CR)}</td>
            <td className="num">{fmt(d.profit / CR)}</td>
            <td className="num">{marginCell(d.margin)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OutletScorecard({ rows }: { rows: ReturnType<typeof officeScorecard> }) {
  if (rows.length === 0) return <div className="no-data">No outlet P&amp;L recorded.</div>;
  return (
    <div className="mk-table-wrap">
      <table className="scorecard-table mk-table">
        <thead>
          <tr>
            <th>Outlet</th>
            <th className="num">Net Sales (Cr)</th>
            <th className="num">Cost (Cr)</th>
            <th className="num">Profit (Cr)</th>
            <th className="num">Margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.officeId}>
              <td>
                <span className="code">{r.officeName}</span>
                <span className="code-sub">#{r.officeId}</span>
              </td>
              <td className="num">{fmt(r.netSales / CR)}</td>
              <td className="num">{fmt(r.cost / CR)}</td>
              <td className="num">{fmt(r.profit / CR)}</td>
              <td className="num">{marginCell(r.margin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PartnerFeedTab({ reportDate: _reportDate }: { reportDate: string }) {
  const totals = useQuery({
    queryKey: ["partner_feed-daily-total"],
    queryFn: fetchPartnerFeedDailyTotal,
  });
  const pl = useQuery({
    queryKey: ["partner_feed-office-pl"],
    queryFn: fetchPartnerFeedOfficePl,
  });

  const summary = useMemo(
    () => summarize(totals.data ?? [], pl.data ?? []),
    [totals.data, pl.data],
  );
  const trend = useMemo(() => buildDailyTrend(totals.data ?? []), [totals.data]);
  const dept = useMemo(() => departmentRollup(pl.data ?? []), [pl.data]);
  const outlets = useMemo(() => officeScorecard(pl.data ?? []), [pl.data]);

  const loading = totals.isLoading || pl.isLoading;
  const empty = !loading && totals.data?.length === 0 && pl.data?.length === 0;

  return (
    <div className="marketing-tab">
      <div className="biir-hero">
        <div>
          <h2>Partner Feed — Retail Pharmacy</h2>
          <p className="biir-hero-sub">
            Partner outlet performance — daily sales, department P&amp;L and outlet scorecard
          </p>
        </div>
        <div className="biir-hero-meta">
          <span className="badge badge-ok">Source: partner portal · BDT</span>
        </div>
      </div>

      {loading && !empty ? (
        <div className="loading-screen">Loading partner feed data…</div>
      ) : empty ? (
        <div className="chart-box no-data">
          No partner feed data yet. Run the ETL <code>--partner_feed-refresh</code> to populate it.
        </div>
      ) : (
        <div className="marketing-body">
          <SummaryCards summary={summary} />

          <div className="chart-box">
            <div className="analysis-head">
              <h3>Daily net sales</h3>
              <span className="ac-hint">{summary.monthLabel} · 1 Cr = 10 million BDT</span>
            </div>
            <DailyTrend points={trend} />
          </div>

          <div className="chart-box">
            <div className="analysis-head">
              <h3>Department P&amp;L</h3>
              <span className="ac-hint">Net sales, cost and profit by department</span>
            </div>
            <DepartmentTable pl={dept} />
          </div>

          <div className="chart-box">
            <div className="analysis-head">
              <h3>Outlet scorecard</h3>
              <span className="ac-hint">Sorted by net sales · # is the portal office id</span>
            </div>
            <OutletScorecard rows={outlets} />
          </div>
        </div>
      )}
    </div>
  );
}
