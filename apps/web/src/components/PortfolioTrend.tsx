import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchPortfolioTrend } from "../api/client";
import { fmt } from "../lib/format";
import { chartTheme, useTheme } from "../lib/chartTheme";
import { useExportMode } from "../lib/exportMode";

export function PortfolioTrend({ reportDate }: { reportDate: string }) {
  const { data } = useQuery({ queryKey: ["portfolio-trend"], queryFn: fetchPortfolioTrend });
  const exportMode = useExportMode();
  const c = chartTheme(useTheme());

  const rows = useMemo(
    () =>
      (data ?? [])
        .map((r) => ({ ...r, label: r.day.slice(5) }))
        .sort((a, b) => a.day.localeCompare(b.day)),
    [data]
  );

  return (
    <div className="chart-box">
      <h3>Daily revenue trend (BDT Crore)</h3>
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke={c.axis} tick={c.tick} />
            <YAxis
              stroke={c.axis}
              tick={c.tick}
              label={{ value: "Cr", angle: -90, position: "insideLeft", fill: c.axis, fontSize: 11, offset: 8 }}
            />
            <Tooltip
              contentStyle={c.tooltipStyle}
              labelStyle={c.labelStyle}
              itemStyle={c.itemStyle}
              formatter={(v: number) => [fmt(v), "Cr"]}
            />
            {reportDate && (
              <ReferenceLine x={reportDate.slice(5)} stroke="#D97706" strokeDasharray="4 3" />
            )}
            <Line
              type="monotone"
              dataKey="total"
              stroke="#3B82F6"
              strokeWidth={2.5}
              dot={{ r: 2.5 }}
              activeDot={{ r: 4 }}
              isAnimationActive={!exportMode}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
