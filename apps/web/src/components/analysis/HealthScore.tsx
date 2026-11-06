import { useMemo } from "react";
import { computeHealth } from "../../lib/analysis";
import type { ScorecardRow } from "../../types";

const BAND_CLS: Record<string, string> = {
  Good: "band-good",
  Watch: "band-watch",
  Risk: "band-risk",
};

export function HealthScore({
  rows,
  onSelect,
  selected,
}: {
  rows: ScorecardRow[];
  onSelect: (id: number | null) => void;
  selected: number | null;
}) {
  const health = useMemo(() => computeHealth(rows), [rows]);
  const counts = useMemo(() => {
    const c = { Good: 0, Watch: 0, Risk: 0 };
    for (const h of health) c[h.band]++;
    return c;
  }, [health]);

  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>SBU health score</h3>
        <span className="ac-hint">
          {counts.Good} good · {counts.Watch} watch · {counts.Risk} risk
        </span>
      </div>

      <ul className="health-list">
        {health.map((h) => (
          <li
            key={`${h.row.sbu_id}:${h.row.channel}`}
            className={selected === h.row.sbu_id ? "selected" : ""}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(selected === h.row.sbu_id ? null : h.row.sbu_id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(selected === h.row.sbu_id ? null : h.row.sbu_id);
              }
            }}
          >
            <span
              className="health-code"
              title={h.row.name ? `${h.row.code} — ${h.row.name}` : h.row.code}
            >
              {h.row.name ?? h.row.code}
            </span>
            {h.row.channel !== "default" && <span className="channel">{h.row.channel}</span>}
            <span className="health-bar">
              <span
                className="health-fill"
                style={{ width: `${h.score.toFixed(0)}%` }}
              />
            </span>
            <span className="health-score">{h.score.toFixed(0)}</span>
            <span className={`band ${BAND_CLS[h.band]}`}>{h.band}</span>
          </li>
        ))}
      </ul>

      <p className="ac-hint">
        Weighted percentile score — Achievement 40%, MoM 25%, YoY 15%, Contribution 20%.
      </p>
    </div>
  );
}
