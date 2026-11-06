import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchTrend } from "../api/client";
import { fmt } from "../lib/format";
import { chartTheme, useTheme } from "../lib/chartTheme";

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// July 1 of the fiscal year containing `to` (NexaGroup FY = July–June).
function fyStart(to: string): Date {
  const d = new Date(`${to}T00:00:00`);
  const fyYear = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(fyYear, 6, 1);
}

export function SbuTrendChart({
  sbuId,
  channel,
  to,
}: {
  sbuId: number;
  channel: string;
  to: string;
}) {
  const { data } = useQuery({
    queryKey: ["trend", sbuId, channel],
    queryFn: () => fetchTrend(sbuId, channel),
  });
  const c = chartTheme(useTheme());

  if (!to) return null;

  const map = new Map((data ?? []).map((t) => [t.d, t.value]));

  // Continuous FY-to-date daily series, zero-filled on days with no sale so
  // the line stays at 0 (down) when idle and rises on days with revenue.
  const end = new Date(`${to}T00:00:00`);
  const start = fyStart(to);
  const rows: { label: string; daily: number }[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const key = iso(cursor);
    rows.push({ label: key, daily: map.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <div className="chart-canvas">
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            stroke={c.axis}
            tick={c.tick}
            tickFormatter={(v: string) => v.slice(5)}
            minTickGap={24}
          />
          <YAxis
            stroke={c.axis}
            tick={c.tick}
            label={{ value: "Cr", angle: -90, position: "insideLeft", fill: c.axis, fontSize: 11, offset: 8 }}
          />
          <Tooltip
            contentStyle={c.tooltipStyle}
            labelStyle={c.labelStyle}
            itemStyle={c.itemStyle}
            formatter={(v: number) => [fmt(v), "Daily Cr"]}
          />
          <Bar dataKey="daily" fill="#38bdf8" radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="daily" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
