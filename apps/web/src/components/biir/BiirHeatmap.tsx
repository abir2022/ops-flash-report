import {
  CATEGORY_LABEL,
  RISK_COLOR,
  buildHeatmap,
  classifyRisk,
  type FactorCategory,
  type ImpactRow,
} from "../../lib/biir";

const COLS: FactorCategory[] = ["fuel", "energy", "fx", "commodity", "crisis", "supply", "market"];

export function RiskHeatmap({ impacts }: { impacts: ImpactRow[] }) {
  const cells = buildHeatmap(impacts);
  if (cells.length === 0) {
    return (
      <div className="chart-box">
        <div className="analysis-head"><h3>Risk Heatmap</h3></div>
        <div className="no-data">No material external exposure detected for active SBUs.</div>
      </div>
    );
  }

  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>Risk Heatmap</h3>
        <span className="ac-hint">SBU × external factor exposure (score 0–100)</span>
      </div>
      <div className="biir-heatmap-wrap">
        <table className="biir-heatmap">
          <thead>
            <tr>
              <th className="hm-sbu">SBU</th>
              {COLS.map((c) => (
                <th key={c} title={CATEGORY_LABEL[c]}>{CATEGORY_LABEL[c].split(" ")[0]}</th>
              ))}
              <th className="num">Peak</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell) => (
              <tr key={cell.sbuId}>
                <td className="hm-sbu">
                  <span className="code">{cell.code}</span>
                  <span className="code-sub">{cell.section ?? ""}</span>
                </td>
                {COLS.map((c) => {
                  const score = cell.byCategory[c];
                  if (score == null) return <td key={c} className="hm-cell hm-empty">·</td>;
                  const color = RISK_COLOR[classifyRisk(score)];
                  return (
                    <td
                      key={c}
                      className="hm-cell"
                      style={{ backgroundColor: `${color}1f`, color }}
                      title={`${CATEGORY_LABEL[c]}: ${score.toFixed(0)} (${classifyRisk(score)})`}
                    >
                      {score.toFixed(0)}
                    </td>
                  );
                })}
                <td className="num hm-peak" style={{ color: RISK_COLOR[classifyRisk(cell.maxScore)] }}>
                  {cell.maxScore.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="biir-legend">
        <span><i style={{ background: RISK_COLOR.Low }} /> Low (0–30)</span>
        <span><i style={{ background: RISK_COLOR.Medium }} /> Medium (31–70)</span>
        <span><i style={{ background: RISK_COLOR.Critical }} /> Critical (71–100)</span>
      </div>
    </div>
  );
}
