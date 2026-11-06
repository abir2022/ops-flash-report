import { useQuery } from "@tanstack/react-query";
import { Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchScorecard } from "../api/client";
import { chartTheme, useTheme } from "../lib/chartTheme";
import { useExportMode } from "../lib/exportMode";

const COLORS: Record<string, string> = {
  "Strong +": "#10B981",
  Positive: "#34D399",
  Neutral: "#F59E0B",
  Weak: "#D97706",
  Negative: "#DC2626",
  "N/A": "#94A3B8",
};

const ORDER = ["Strong +", "Positive", "Neutral", "Weak", "Negative", "N/A"];

export function MomentumChart({ reportDate }: { reportDate: string }) {
  const { data } = useQuery({
    queryKey: ["scorecard", reportDate],
    queryFn: () => fetchScorecard(reportDate),
  });
  const exportMode = useExportMode();
  const c = chartTheme(useTheme());

  const counts = ORDER.map((cat) => ({
    name: cat,
    value: (data ?? []).filter((r) => (r.momentum ?? "N/A") === cat).length,
  })).filter((c) => c.value > 0);

  return (
    <div className="chart-box">
      <h3>Momentum distribution</h3>
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={counts}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              isAnimationActive={!exportMode}
            >
              {counts.map((c) => (
                <Cell key={c.name} fill={COLORS[c.name]} />
              ))}
              <LabelList dataKey="value" position="outside" fill={c.barLabel} fontSize={12} />
            </Pie>
            <Tooltip
              contentStyle={c.tooltipStyle}
              labelStyle={c.labelStyle}
              itemStyle={c.itemStyle}
              formatter={(v: number, name: string) => [`${v} SBUs`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="legend">
        {counts.map((c) => (
          <li key={c.name}>
            <span className="swatch" style={{ background: COLORS[c.name] }} />
            {c.name}: {c.value} SBUs
          </li>
        ))}
      </ul>
    </div>
  );
}
