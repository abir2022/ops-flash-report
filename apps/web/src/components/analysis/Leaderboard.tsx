import { useMemo } from "react";
import { fmt, fmtPct } from "../../lib/format";
import { PARAMETERS, rankRows, type ParamKey } from "../../lib/analysis";
import type { ScorecardRow } from "../../types";

export function Leaderboard({
  rows,
  totalMtd,
  param,
  onParamChange,
  onSelect,
  selected,
  export: isExport = false,
}: {
  rows: ScorecardRow[];
  totalMtd: number;
  param: ParamKey;
  onParamChange: (p: ParamKey) => void;
  onSelect: (id: number | null) => void;
  selected: number | null;
  export?: boolean;
}) {
  const ranked = useMemo(() => rankRows(rows, param, totalMtd), [rows, param, totalMtd]);
  const p = PARAMETERS.find((x) => x.key === param)!;

  const withValue = ranked.filter((r) => r.value !== null);
  const top = withValue.slice(0, 5);
  const bottom = withValue.slice(-5).reverse();

  const cell = (v: number | null) =>
    v === null ? "—" : p.pct ? fmtPct(v) : `${fmt(v)} ${p.unit}`;

  if (isExport) {
    return (
      <div className="chart-box" data-export-table>
        <table className="rank-table">
          <caption className="export-caption">How each business is doing</caption>
          <thead data-export-head>
            <tr>
              <th>#</th>
              <th>SBU</th>
              <th className="num">{p.label}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr key={`${r.sbu_id}:${r.channel}`}>
                <td className="rank-num">{r.rank}</td>
                <td>
                  <span className="code">{r.name ?? r.code}</span>
                  {r.name && <span className="rank-sub">{r.code}</span>}
                  {r.channel !== "default" && <span className="channel">{r.channel}</span>}
                </td>
                <td className="num">{cell(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>How each business is doing</h3>
        <select value={param} onChange={(e) => onParamChange(e.target.value as ParamKey)}>
          {PARAMETERS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rank-cols">
        <div className="rank-col">
          <h4 className="rank-good">Doing well</h4>
          <ul className="rank-list">
            {top.map((r) => (
              <li
                key={`${r.sbu_id}:${r.channel}`}
                className={selected === r.sbu_id ? "selected" : ""}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(selected === r.sbu_id ? null : r.sbu_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(selected === r.sbu_id ? null : r.sbu_id);
                  }
                }}
              >
                <span className="rank-num">{r.rank}</span>
                <span className="rank-code">{r.name ?? r.code}</span>
                {r.name && <span className="rank-sub">{r.code}</span>}
                {r.channel !== "default" && <span className="channel">{r.channel}</span>}
                <span className="rank-val">{cell(r.value)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rank-col">
          <h4 className="rank-bad">Needs attention</h4>
          <ul className="rank-list">
            {bottom.map((r) => (
              <li
                key={`${r.sbu_id}:${r.channel}`}
                className={selected === r.sbu_id ? "selected" : ""}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(selected === r.sbu_id ? null : r.sbu_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(selected === r.sbu_id ? null : r.sbu_id);
                  }
                }}
              >
                <span className="rank-num">{r.rank}</span>
                <span className="rank-code">{r.name ?? r.code}</span>
                {r.name && <span className="rank-sub">{r.code}</span>}
                {r.channel !== "default" && <span className="channel">{r.channel}</span>}
                <span className="rank-val">{cell(r.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <table className="rank-table">
        <thead>
          <tr>
            <th>#</th>
            <th>SBU</th>
            <th className="num">{p.label}</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => (
            <tr
              key={`${r.sbu_id}:${r.channel}`}
              className={selected === r.sbu_id ? "selected" : ""}
              tabIndex={0}
              onClick={() => onSelect(selected === r.sbu_id ? null : r.sbu_id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(selected === r.sbu_id ? null : r.sbu_id);
                }
              }}
            >
              <td className="rank-num">{r.rank}</td>
              <td>
                <span className="code">{r.name ?? r.code}</span>
                {r.name && <span className="rank-sub">{r.code}</span>}
                {r.channel !== "default" && <span className="channel">{r.channel}</span>}
              </td>
              <td className="num">{cell(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ac-hint">
        Click any SBU to open its drill-down. Ranking is {p.label}, higher is better. SBUs with no{" "}
        {p.label.toLowerCase()} are listed last.
      </p>
    </div>
  );
}
