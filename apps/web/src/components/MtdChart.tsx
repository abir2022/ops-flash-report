import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchScorecard } from "../api/client";
import { fmt, num } from "../lib/format";
import { chartTheme, useTheme } from "../lib/chartTheme";
import { useExportMode } from "../lib/exportMode";

export function MtdChart({ reportDate }: { reportDate: string }) {
  const { data } = useQuery({
    queryKey: ["scorecard", reportDate],
    queryFn: () => fetchScorecard(reportDate),
  });
  const exportMode = useExportMode();
  const c = chartTheme(useTheme());

  const rows = (data ?? [])
    .filter((r) => (num(r.mtd_rev) ?? 0) > 0)
    .sort((a, b) => (num(b.mtd_rev) ?? 0) - (num(a.mtd_rev) ?? 0))
    .slice(0, 15)
    .map((r) => ({ code: r.code, mtd: num(r.mtd_rev) ?? 0 }));

  const max = rows[0]?.mtd ?? 0;

  return (
    <div className="chart-box">
      <h3>Month-to-date revenue — top 15 businesses (Crore)</h3>
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid stroke={c.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              stroke={c.axis}
              tick={c.tick}
              label={{ value: "Cr", position: "insideBottomRight", fill: c.axis, fontSize: 11, offset: -2 }}
            />
            <YAxis
              type="category"
              dataKey="code"
              width={90}
              stroke={c.axis}
              tick={c.tickStrong}
            />
            <Tooltip
              contentStyle={c.tooltipStyle}
              labelStyle={c.labelStyle}
              itemStyle={c.itemStyle}
              formatter={(v: number) => [fmt(v), "Cr"]}
            />
            <ReferenceLine
              x={max}
              stroke="#D97706"
              strokeDasharray="4 3"
              label={{ value: `Max ${fmt(max)}`, fill: "#D97706", fontSize: 10 }}
            />
            <Bar dataKey="mtd" fill="#3B82F6" radius={[0, 4, 4, 0]} isAnimationActive={!exportMode}>
              <LabelList
                dataKey="mtd"
                position="right"
                fill={c.barLabel}
                fontSize={11}
                formatter={(v: number) => fmt(v, 0)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
