import { fmt } from "../../lib/format";
import type { SpendReconciliationRow } from "../../lib/marketing";

function status(delta: number, topDown: number): { label: string; cls: string } {
  if (topDown <= 0) return { label: "No spend", cls: "mk-eff-none" };
  if (delta < -1e-9) return { label: "Over-submitted", cls: "mk-eff-watch" };
  const share = delta / topDown;
  if (share > 0.25) return { label: "Un-attributed", cls: "mk-eff-risk" };
  if (share > 0.001) return { label: "Partial", cls: "mk-eff-watch" };
  return { label: "Matched", cls: "mk-eff-good" };
}

function deltaCls(delta: number): string {
  if (delta < -1e-9) return "mom-down";
  if (delta > 1e-9) return "mom-up";
  return "mom-neu";
}

export function SpendReconciliation({ rows }: { rows: SpendReconciliationRow[] }) {
  const total = rows.reduce(
    (a, r) => ({ topDown: a.topDown + r.topDown, bottomUp: a.bottomUp + r.bottomUp }),
    { topDown: 0, bottomUp: 0 }
  );
  const totalDelta = total.topDown - total.bottomUp;

  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>Spend reconciliation</h3>
        <span className="ac-hint">
          Campaign-able GL spend vs officer-submitted campaign expense (same-month attribution) — the
          delta is spend with no filed campaign
        </span>
      </div>

      <div className="snapshot-cards mk-summary">
        <div className="snap-card">
          <div className="label">Campaign-able GL spend</div>
          <div className="val">
            {fmt(total.topDown)}
            <span className="unit">Cr</span>
          </div>
          <div className="sub">GL 4210001 · month</div>
        </div>
        <div className="snap-card">
          <div className="label">Submitted expense</div>
          <div className="val">
            {fmt(total.bottomUp)}
            <span className="unit">Cr</span>
          </div>
          <div className="sub">Σ officer campaigns</div>
        </div>
        <div className="snap-card">
          <div className="label">Un-attributed</div>
          <div
            className="val"
            style={{ color: totalDelta > 0 ? "var(--down)" : totalDelta < 0 ? "var(--up)" : undefined }}
          >
            {fmt(totalDelta)}
            <span className="unit">Cr</span>
          </div>
          <div className="sub">spend with no filed campaign</div>
        </div>
      </div>

      <div className="mk-table-wrap">
        <table className="scorecard-table mk-table">
          <thead>
            <tr>
              <th>SBU</th>
              <th className="num">Campaign-able GL (Cr)</th>
              <th className="num">Submitted (Cr)</th>
              <th className="num">Un-attributed (Cr)</th>
              <th className="num">Campaigns</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = status(r.delta, r.topDown);
              return (
                <tr key={r.sbu_id}>
                  <td>
                    <span className="code">{r.code}</span>
                    <span className="code-sub">{r.name ?? r.code}</span>
                  </td>
                  <td className="num">{fmt(r.topDown)}</td>
                  <td className="num">{fmt(r.bottomUp)}</td>
                  <td className={`num ${deltaCls(r.delta)}`}>{fmt(r.delta)}</td>
                  <td className="num">{r.n_campaigns}</td>
                  <td>
                    <span className={`mk-eff ${st.cls}`}>{st.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
