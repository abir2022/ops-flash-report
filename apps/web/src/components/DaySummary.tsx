import { useQuery } from "@tanstack/react-query";
import { fetchKpi, fetchScorecard } from "../api/client";
import { fmt, fmtPct, num } from "../lib/format";
import { Term } from "./Term";

export function DaySummary({ reportDate }: { reportDate: string }) {
  const kpi = useQuery({ queryKey: ["kpi", reportDate], queryFn: () => fetchKpi(reportDate) });
  const scorecard = useQuery({
    queryKey: ["scorecard", reportDate],
    queryFn: () => fetchScorecard(reportDate),
  });

  const k = kpi.data;
  const rows = scorecard.data ?? [];

  if (!k) return null;

  const active = rows.filter((r) => (num(r.mtd_rev) ?? 0) > 0);
  const withTarget = active.filter((r) => num(r.mtd_ach_pct) !== null);
  const above = withTarget.filter((r) => (num(r.mtd_ach_pct) ?? 0) >= 100).length;

  const lead = [...active]
    .sort((a, b) => (num(b.mtd_rev) ?? 0) - (num(a.mtd_rev) ?? 0))
    .slice(0, 3)
    .map((r) => r.name ?? r.code);

  const gainers = [...active]
    .filter((r) => (num(r.mom_pct) ?? 0) > 0)
    .sort((a, b) => (num(b.mom_pct) ?? 0) - (num(a.mom_pct) ?? 0))
    .slice(0, 3)
    .map((r) => r.name ?? r.code);

  const rd = k.report_date ? new Date(k.report_date) : null;
  const day = rd ? rd.getDate() : null;
  const daysInMonth = rd ? new Date(rd.getFullYear(), rd.getMonth() + 1, 0).getDate() : null;
  const projME = k.total_mtd && day && daysInMonth ? (k.total_mtd / day) * daysInMonth : null;

  return (
    <div className="day-summary">
      <div className="ds-lead">
        Today NexaGroup booked <b>{fmt(k.total_daily)} crore</b> (BDT) across{" "}
        <b>{active.length} businesses</b>.
      </div>
      <div className="ds-body">
        <b>{lead.join(", ")}</b> lead the month. {above} of {withTarget.length} businesses
        with a target are at or above it (average {fmtPct(num(k.avg_ach_pct))}).
        {gainers.length > 0 && <> Biggest risers vs last month: {gainers.join(", ")}.</>}
      </div>
      <div className="ds-plain">
        <Term>MTD</Term> revenue is <b>{fmt(k.total_mtd)} crore</b> —{" "}
        {above === 0
          ? "every business is currently below its monthly target."
          : `${above} of ${withTarget.length} businesses are on or above target, so performance is ${
              above / Math.max(withTarget.length, 1) >= 0.7 ? "healthy" : "mixed"
            }.`}{" "}
        At today's pace, the month is on track to close around{" "}
        <b>{projME !== null ? fmt(projME) : fmt(k.total_mtd)} crore</b> in total revenue.
      </div>
    </div>
  );
}
