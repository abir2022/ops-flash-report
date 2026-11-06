import { useState } from "react";
import { BD_DIVISIONS, BD_MAP_VIEWBOX } from "../../lib/bdDivisions";

const COLOR_NONE = "#e9eef3";
const COLOR_LOW = "#7fb2dd";
const COLOR_MID = "#2E74B5";
const COLOR_HIGH = "#1F4E78";

function colorFor(value: number, max: number): string {
  if (max <= 0 || value <= 0) return COLOR_NONE;
  const t = value / max;
  return t > 0.66 ? COLOR_HIGH : t > 0.33 ? COLOR_MID : COLOR_LOW;
}

export function BdDivisionMap({
  values,
  selectedId,
  onSelect,
  formatValue,
}: {
  values: Record<string, number>;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  formatValue?: (value: number) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...Object.values(values).filter((v) => v > 0));
  const fmt = formatValue ?? ((v: number) => v.toLocaleString("en-US"));

  return (
    <div className="bd-map">
      <svg viewBox={BD_MAP_VIEWBOX} preserveAspectRatio="xMidYMid meet">
        {BD_DIVISIONS.map((d) => {
          const value = values[d.id] ?? 0;
          const isSel = selectedId === d.id;
          return (
            <path
              key={d.id}
              d={d.path}
              fill={colorFor(value, max)}
              className={isSel ? "bd-sel" : ""}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(isSel ? null : d.id)}
            >
              <title>{`${d.name}: ${value > 0 ? fmt(value) : "no data"}`}</title>
            </path>
          );
        })}
        {BD_DIVISIONS.map((d) => (
          <text key={d.id} x={d.lx} y={d.ly} fontSize="0.16" textAnchor="middle">
            {d.name}
          </text>
        ))}
      </svg>
      <div className="bd-map-legend">
        <span><i style={{ background: COLOR_NONE }} />None</span>
        <span><i style={{ background: COLOR_LOW }} />Low</span>
        <span><i style={{ background: COLOR_MID }} />Mid</span>
        <span><i style={{ background: COLOR_HIGH }} />High</span>
        {hover && (
          <span className="bd-map-hover">{hover}: {values[hover] > 0 ? fmt(values[hover]) : "no data"}</span>
        )}
      </div>
    </div>
  );
}
