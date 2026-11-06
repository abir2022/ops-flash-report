import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchScorecard } from "../../api/client";
import { useForecast } from "../../hooks/useForecast";
import {
  paretoConcentration,
  skuBcg,
  type BcgMatrix,
  type SkuItem,
} from "../../lib/advanced";
import { buildDecisionPoints, type DecisionSeverity } from "../../lib/decisionPoints";
import { num } from "../../lib/format";

const SEV_COLOR: Record<DecisionSeverity, string> = {
  Action: "#f87171",
  Watch: "#fbbf24",
  Good: "#4ade80",
};

export function DecisionPointsCard({
  sbuId,
  channel,
  reportDate,
  items,
  prior,
}: {
  sbuId: number;
  channel: string;
  reportDate: string;
  items: SkuItem[];
  prior: Map<number, number>;
}) {
  const { data: scorecard } = useQuery({
    queryKey: ["scorecard", reportDate],
    queryFn: () => fetchScorecard(reportDate),
    enabled: !!reportDate,
  });
  const forecast = useForecast(sbuId, channel);

  const row = useMemo(() => {
    const rows = scorecard ?? [];
    return (
      rows.find((r) => r.sbu_id === sbuId && r.channel === channel) ??
      rows.find((r) => r.sbu_id === sbuId) ??
      null
    );
  }, [scorecard, sbuId, channel]);

  const points = useMemo(() => {
    const p = paretoConcentration(items);
    const bcg: BcgMatrix | null = items.length ? skuBcg(items, prior) : null;

    let fyForecast: number | null = null;
    let fyTarget: number | null = null;
    if (forecast) {
      const futureForecast = forecast.forecastMonths.reduce((s, m) => s + m.forecast, 0);
      const currentProjection = forecast.running?.projected ?? 0;
      fyForecast = forecast.ytdActual + currentProjection + futureForecast;
      fyTarget = forecast.months.reduce((s, m) => s + m.target, 0);
    }

    return buildDecisionPoints({
      mtdAchievementPct: num(row?.mtd_ach_pct),
      momPct: num(row?.mom_pct),
      yoyPct: num(row?.yoy_pct),
      mtdRevenue: num(row?.mtd_rev),
      monthlyTarget: num(row?.mo_tgt_rev),
      projectedMonthEnd: num(row?.proj_rev),
      fyForecast,
      fyTarget,
      forecastMapePct: forecast ? forecast.calibration.mape : null,
      basisMonths: forecast?.basisMonths ?? 0,
      hhi: p.n ? p.hhi : null,
      top5Share: p.n ? p.top5Share : null,
      bcg,
    });
  }, [items, prior, forecast, row]);

  return (
    <div className="dp-wrap">
      <div className="analysis-head">
        <h3>Decision Points &amp; Initiatives</h3>
        <span className="ac-hint">rule-based · top actions for this SBU</span>
      </div>

      {points.length === 0 ? (
        <div className="no-data">No decision points available for this SBU yet.</div>
      ) : (
        <ul className="dp-list">
          {points.map((d) => (
            <li key={d.id} className="dp-item">
              <span
                className="dp-badge"
                style={{ color: SEV_COLOR[d.severity], borderColor: SEV_COLOR[d.severity] }}
              >
                {d.severity}
              </span>
              <div className="dp-body">
                <div className="dp-title">{d.title}</div>
                <div className="dp-detail">{d.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
