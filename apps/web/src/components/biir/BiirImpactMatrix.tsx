import { CATEGORY_LABEL, RISK_COLOR, classifyRisk, type ImpactRow } from "../../lib/biir";
import { fmt, fmtPct } from "../../lib/format";

export function ImpactMatrix({ impacts, limit = 12 }: { impacts: ImpactRow[]; limit?: number }) {
  const rows = impacts.slice(0, limit);
  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>SBU Impact Mapping</h3>
        <span className="ac-hint">Factor → SBU → impact → action</span>
      </div>
      {rows.length === 0 ? (
        <div className="no-data">No external factor impacts to map.</div>
      ) : (
        <div className="biir-table-wrap">
          <table className="biir-table">
            <thead>
              <tr>
                <th>SBU</th>
                <th>Factor</th>
                <th className="num">Prob.</th>
                <th className="num">Exposure</th>
                <th className="num">Fin. impact</th>
                <th className="num">Risk</th>
                <th>Recommended action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const color = RISK_COLOR[classifyRisk(r.riskScore)];
                return (
                  <tr key={`${r.sbuId}:${r.category}`}>
                    <td>
                      <span className="code">{r.code}</span>
                      <span className="code-sub">{r.section ?? ""}</span>
                    </td>
                    <td>
                      <span>{r.signalName}</span>
                      <span className="biir-cat">{CATEGORY_LABEL[r.category]}</span>
                    </td>
                    <td className="num">{fmtPct(r.probability * 100, 0)}</td>
                    <td className="num">{fmtPct(r.exposure * 100, 0)}</td>
                    <td className="num">{fmt(r.financialImpact)} Cr</td>
                    <td className="num">
                      <span className="biir-risk" style={{ color, borderColor: color }}>
                        {r.riskScore.toFixed(0)}
                      </span>
                    </td>
                    <td>
                      <div className="biir-action">{r.action}</div>
                      <div className="biir-owner">
                        {r.owner} · <span className="biir-timeline">{r.timeline}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
