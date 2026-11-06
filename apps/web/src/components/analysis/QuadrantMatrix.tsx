import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fmt, num } from "../../lib/format";
import { quadrantOf, quadrantColor, QUADRANT_LABEL, type Quadrant } from "../../lib/analysis";
import { useExportMode } from "../../lib/exportMode";
import type { ScorecardRow } from "../../types";

interface Pt {
  x: number;
  y: number;
  z: number;
  code: string;
  name: string | null;
  sbu_id: number;
  quadrant: Quadrant;
}

function QuadrantTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Pt }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="scatter-tip">
      <strong>{p.name ?? p.code}</strong>
      <span>Growth {p.x.toFixed(1)}%</span>
      <span>Achievement {p.y.toFixed(1)}%</span>
      <span>MTD {fmt(p.z)} Cr</span>
      <span>{QUADRANT_LABEL[p.quadrant]}</span>
    </div>
  );
}

export function QuadrantMatrix({
  rows,
  onSelect,
}: {
  rows: ScorecardRow[];
  onSelect: (id: number) => void;
}) {
  const exportMode = useExportMode();
  const data: Pt[] = useMemo(
    () =>
      rows
        .map((r) => {
          const growth = num(r.mom_pct);
          const ach = num(r.mtd_ach_pct);
          const q = quadrantOf(r);
          if (growth === null || ach === null || !q) return null;
          return {
            x: growth,
            y: ach,
            z: Math.max(num(r.mtd_rev) ?? 0, 1),
            code: r.code,
            name: r.name,
            sbu_id: r.sbu_id,
            quadrant: q,
          };
        })
        .filter((p): p is Pt => p !== null),
    [rows]
  );

  const counts = useMemo(() => {
    const c: Record<Quadrant, number> = { Star: 0, "Question Mark": 0, "Cash Cow": 0, Dog: 0 };
    for (const p of data) c[p.quadrant]++;
    return c;
  }, [data]);

  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>BCG Growth-Share Matrix</h3>
        <span className="ac-hint">{data.length} plotted</span>
      </div>

      <div className="quad-wrap">
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 12, right: 20, bottom: 28, left: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="Month-over-month growth %"
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              label={{ value: "Growth this month % →", position: "insideBottomRight", fill: "var(--muted)", offset: -4, fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Target achievement %"
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              label={{ value: "On target % →", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 12 }}
            />
            <ZAxis type="number" dataKey="z" range={[60, 900]} />
            <ReferenceLine x={0} stroke="var(--muted)" strokeDasharray="4 4" />
            <ReferenceLine y={100} stroke="var(--muted)" strokeDasharray="4 4" />
            <Tooltip content={<QuadrantTooltip />} />
            <Scatter
              data={data}
              isAnimationActive={!exportMode}
              onClick={(p) => onSelect((p as unknown as Pt).sbu_id)}
              label={{
                dataKey: "z",
                position: "top",
                fill: "var(--text-soft)",
                fontSize: 9,
                formatter: (v: number) => (v ? `${Math.round(v)}` : ""),
              }}
            >
              {data.map((d) => (
                <Cell key={d.sbu_id} fill={quadrantColor(d.quadrant)} fillOpacity={0.85} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        <span className="quad-label quad-star">{QUADRANT_LABEL.Star} {counts.Star}</span>
        <span className="quad-label quad-qm">{QUADRANT_LABEL["Question Mark"]} {counts["Question Mark"]}</span>
        <span className="quad-label quad-cow">{QUADRANT_LABEL["Cash Cow"]} {counts["Cash Cow"]}</span>
        <span className="quad-label quad-dog">{QUADRANT_LABEL.Dog} {counts.Dog}</span>
      </div>

      <ul className="legend quad-legend">
        <li><span className="swatch" style={{ background: quadrantColor("Star") }} />Strong — growing & on target</li>
        <li><span className="swatch" style={{ background: quadrantColor("Question Mark") }} />At risk — growing but below target</li>
        <li><span className="swatch" style={{ background: quadrantColor("Cash Cow") }} />Stable — on target but slowing</li>
        <li><span className="swatch" style={{ background: quadrantColor("Dog") }} />Weak — shrinking & below target</li>
      </ul>
    </div>
  );
}
