import { useQuery } from "@tanstack/react-query";
import { fetchKpi } from "../api/client";
import { achVerdict, fmt, fmtPct, num, type Verdict } from "../lib/format";

export function KpiCards({ reportDate }: { reportDate: string }) {
  const kpi = useQuery({
    queryKey: ["kpi", reportDate],
    queryFn: () => fetchKpi(reportDate),
  });

  const k = kpi.data;

  const daily = k ? k.total_daily : null;
  const mtd = k ? k.total_mtd : null;
  const fy = k ? k.total_fy_ytd : null;
  const cy = k ? k.total_cy_ytd : null;

  const rd = k?.report_date ? new Date(k.report_date) : null;
  const day = rd ? rd.getDate() : null;
  const daysInMonth = rd
    ? new Date(rd.getFullYear(), rd.getMonth() + 1, 0).getDate()
    : null;
  const projME = mtd && day && daysInMonth ? (mtd / day) * daysInMonth : null;
  const runRate = mtd && day ? mtd / day : null;
  const mShort = rd ? rd.toLocaleString("en-US", { month: "short" }) : null;
  const dailyLabel = mShort && day ? `Daily Revenue (${mShort} ${day})` : "Daily Revenue";
  const mtdLabel = mShort && day ? `MTD Revenue (${mShort} 1–${day})` : "MTD Revenue";

  const ach = achVerdict(k?.avg_ach_pct);

  return (
    <div className="kpi-section">
      <div className="kpi-hero">
        <div className="kpi-hero-label">{dailyLabel}</div>
        <div className="kpi-hero-val">
          {fmt(daily)}
          {daily !== null ? <span className="unit">Cr</span> : null}
        </div>
        <div className="kpi-hero-sub">
          Booked today across {k?.active_sbus ?? 0} businesses
        </div>
      </div>

      <div className="kpi-row">
        <Card
          label={mtdLabel}
          value={fmt(mtd)}
          unit="Cr"
          sub={day && daysInMonth ? `Day ${day}/${daysInMonth} of the month` : "So far this month"}
          verdict="neutral"
        />
        <Card
          label="Projected Month-End"
          value={fmt(projME)}
          unit="Cr"
          sub={runRate ? `If today's pace holds` : "—"}
          verdict="neutral"
        />
        <Card
          label="Avg MTD Achievement"
          value={fmtPct(num(k?.avg_ach_pct))}
          unit=""
          sub={`${k?.sbus_with_target ?? 0} businesses measured`}
          verdict={ach.cls}
          verdictLabel={ach.label}
        />
        <Card
          label="Yearly Revenue (CY YTD)"
          value={fmt(cy)}
          unit="Cr"
          sub="Since 1 January"
          verdict="neutral"
        />
        <Card
          label="YTD Revenue FY26-27"
          value={fmt(fy)}
          unit="Cr"
          sub="Since 1 July"
          verdict="neutral"
        />
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  unit,
  sub,
  verdict,
  verdictLabel,
}: {
  label: string;
  value: string;
  unit: string;
  sub: string;
  verdict: Verdict;
  verdictLabel?: string;
}) {
  return (
    <div className="kpi-card">
      <div className="label">{label}</div>
      <div className="val">
        {value}
        {unit && value !== "—" ? <span className="unit">{unit}</span> : null}
      </div>
      <div className="sub">{sub}</div>
      {verdictLabel && (
        <div className={`verdict verdict-${verdict}`}>
          <span className="verdict-sign" aria-hidden="true">
            {verdict === "good" ? "▲" : verdict === "risk" ? "▼" : "•"}
          </span>
          {verdictLabel}
        </div>
      )}
    </div>
  );
}
