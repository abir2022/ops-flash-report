import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchScorecard } from "../api/client";
import { buildTargetProgress } from "../lib/analysis";
import { fmt, fmtPct } from "../lib/format";

export function TargetProgress({ reportDate }: { reportDate: string }) {
  const { data } = useQuery({
    queryKey: ["scorecard", reportDate],
    queryFn: () => fetchScorecard(reportDate),
  });

  const rows = useMemo(() => buildTargetProgress(data ?? []), [data]);

  return (
    <div className="chart-box">
      <h3>Monthly Target vs MTD Achievement</h3>
      {rows.length === 0 ? (
        <p className="no-data">No monthly revenue targets for this date.</p>
      ) : (
        <div className="tgt-list">
          {rows.map((r) => (
            <div className="tgt-row" key={`${r.sbu_id}:${r.channel}`}>
              <span className="tgt-code" title={r.name ? `${r.name} (${r.code})` : r.code}>
                {r.name ?? r.code}
                {r.channel !== "default" && <span className="channel">{r.channel}</span>}
              </span>
              <div className="tgt-bar">
                <span
                  className={r.over ? "tgt-fill over" : "tgt-fill"}
                  style={{ width: `${r.cappedPct}%` }}
                />
              </div>
              <span className="tgt-nums">
                {fmt(r.mtd)} / {fmt(r.target)} Cr · {fmtPct(r.pct)}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="ac-hint">
        Bar = MTD revenue as % of the full monthly target (capped at 100%). Sorted by progress.
      </p>
    </div>
  );
}
