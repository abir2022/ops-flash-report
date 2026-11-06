import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FACTORS,
  GROUP,
  HEAT,
  NET_COST,
  SBU_PLANS,
  VERDICT_COLOR,
  dominantFactor,
  exposureClass,
  type FactorKey,
  type SbuPlan,
  type Verdict,
} from "../../lib/factorAnalysis";
import { fmt } from "../../lib/format";
import { chartTheme, useTheme } from "../../lib/chartTheme";

// ---------------------------------------------------------------------------
// Factor Cost Radar — the four big factors, at-risk vs recoverable.
// ---------------------------------------------------------------------------
const FACTOR_ORDER: { key: FactorKey; label: string }[] = [
  { key: "fx", label: "FX" },
  { key: "oil", label: "Oil & energy" },
  { key: "rate", label: "Interest" },
  { key: "duty", label: "Import duty" },
];

function factorChartData() {
  return FACTOR_ORDER.map(({ key, label }) => {
    const f = FACTORS.find((x) => x.key === key)!;
    return {
      label,
      down: f.down,
      mit: Math.max(0, f.mit),
      upside: f.mit < 0 ? Math.abs(f.mit) : 0,
    };
  });
}

function verdictBadge(v: Verdict) {
  const color = VERDICT_COLOR[v];
  return (
    <span className="biir-verdict" style={{ color, borderColor: color }}>
      {v}
    </span>
  );
}

export function FactorCostRadar() {
  const c = chartTheme(useTheme());
  const data = factorChartData();
  return (
    <div className="chart-box advanced-full">
      <div className="analysis-head">
        <h3>Factor Cost Radar — the four big factors</h3>
        <span className="ac-hint">FY26-27 forward cost pressure (Cr)</span>
      </div>

      <div className="snapshot-cards">
        <div className="snap-card">
          <div className="label">Total at risk</div>
          <div className="val" style={{ color: "var(--down)" }}>{fmt(GROUP.atRisk)}<span className="unit">Cr</span></div>
          <div className="sub">if nothing changes</div>
        </div>
        <div className="snap-card">
          <div className="label">Recoverable</div>
          <div className="val" style={{ color: "var(--up)" }}>{fmt(GROUP.recoverable)}<span className="unit">Cr</span></div>
          <div className="sub">through action</div>
        </div>
        <div className="snap-card">
          <div className="label">Net cost remains</div>
          <div className="val" style={{ color: "var(--warn)" }}>{fmt(NET_COST)}<span className="unit">Cr</span></div>
          <div className="sub">after action</div>
        </div>
        <div className="snap-card">
          <div className="label">Duty upside</div>
          <div className="val" style={{ color: "var(--up)" }}>95<span className="unit">Cr</span></div>
          <div className="sub">only factor that can become a gain</div>
        </div>
      </div>

      <div className="biir-factor-grid">
        <div className="chart-canvas">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke={c.axis} tick={c.tick} />
              <YAxis stroke={c.axis} tick={c.tick} tickFormatter={(v: number) => `${v}`} />
              <Tooltip
                contentStyle={c.tooltipStyle}
                labelStyle={c.labelStyle}
                itemStyle={c.itemStyle}
                formatter={(v: number) => [`${fmt(v, 0)} Cr`]}
              />
              <Bar dataKey="down" name="Cost if nothing" fill="#DC2626" radius={[3, 3, 0, 0]}>
                <LabelList dataKey="down" position="top" fill={c.barLabel} fontSize={10} formatter={(v: number) => fmt(v, 0)} />
              </Bar>
              <Bar dataKey="mit" name="Cost after action" fill="#F59E0B" radius={[3, 3, 0, 0]}>
                <LabelList dataKey="mit" position="top" fill={c.barLabel} fontSize={10} formatter={(v: number) => (v ? fmt(v, 0) : "")} />
              </Bar>
              <Bar dataKey="upside" name="Duty upside" fill="#10B981" radius={[3, 3, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.label} fill={d.upside > 0 ? "#10B981" : "transparent"} />
                ))}
                <LabelList dataKey="upside" position="top" fill="#34D399" fontSize={10} formatter={(v: number) => (v ? `+${fmt(v, 0)}` : "")} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="ac-hint">Red = cost if nothing changes · amber = cost after action · green = the import-duty gain. Import duty is the only factor that can turn into a gain.</p>
        </div>

        <div className="biir-factor-table-wrap">
          <table className="biir-factor-table">
            <thead>
              <tr>
                <th>Factor</th>
                <th className="num">If nothing</th>
                <th className="num">After action</th>
                <th className="num">Recoverable</th>
              </tr>
            </thead>
            <tbody>
              {FACTORS.map((f) => (
                <tr key={f.key}>
                  <td>
                    <div className="biir-factor-name">{f.name}</div>
                    <div className="biir-factor-driver">{f.driver}</div>
                  </td>
                  <td className="num" style={{ color: "var(--down)" }}>{fmt(f.down, 0)} Cr</td>
                  <td className="num" style={{ color: f.mit < 0 ? "var(--up)" : "var(--warn)" }}>
                    {f.mit < 0 ? `+${fmt(Math.abs(f.mit), 0)} Cr` : `${fmt(f.mit, 0)} Cr`}
                  </td>
                  <td className="num" style={{ color: "var(--up)" }}>{fmt(f.sav, 0)} Cr</td>
                </tr>
              ))}
              <tr className="biir-factor-total">
                <td>Total</td>
                <td className="num">{fmt(GROUP.atRisk, 0)} Cr</td>
                <td className="num">{fmt(NET_COST, 0)} Cr</td>
                <td className="num">{fmt(GROUP.recoverable, 0)} Cr</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SBU Strategic Action Plans — per-SBU situation → root cause → strategy →
// actions → outcome → KPI.
// ---------------------------------------------------------------------------
function healthColor(h: SbuPlan["health"]): string {
  return h === "Strong" ? "var(--up)" : h === "Fair" ? "var(--warn)" : "var(--down)";
}
function headwindColor(h: SbuPlan["headwind"]): string {
  return h === "Low" ? "var(--up)" : h === "Medium" ? "var(--warn)" : "var(--down)";
}

export function SbuActionPlans() {
  const [selected, setSelected] = useState<string>(SBU_PLANS[0]?.code ?? "");
  const plan = useMemo(() => SBU_PLANS.find((p) => p.code === selected) ?? SBU_PLANS[0], [selected]);

  const sorted = useMemo(
    () => [...SBU_PLANS].sort((a, b) => b.atRisk - a.atRisk),
    [],
  );

  if (!plan) return <div className="no-data">No SBU action plans loaded.</div>;

  const exposure = HEAT[plan.code] ?? { fx: 0, oil: 0, rate: 0, duty: 0 };

  return (
    <div className="chart-box advanced-full">
      <div className="analysis-head">
        <h3>SBU Strategic Action Plans</h3>
        <span className="ac-hint">15 SBUs · situation → root cause → strategy → actions</span>
      </div>

      <div className="biir-sbu-pills">
        {sorted.map((p) => (
          <button
            key={p.code}
            className={`biir-sbu-pill${p.code === selected ? " active" : ""}`}
            style={{ borderLeftColor: p.color }}
            aria-pressed={p.code === selected}
            onClick={() => setSelected(p.code)}
          >
            <span className="code">{p.code}</span>
            <span className="biir-sbu-rev">{fmt(p.rev, 0)} Cr</span>
          </button>
        ))}
      </div>

      <div className="biir-plan-card">
        <div className="biir-plan-head">
          <div>
            <h4 style={{ color: plan.color }}>{plan.name}</h4>
            <div className="biir-plan-ind">{plan.industry}</div>
          </div>
          <div className="biir-plan-badges">
            <span className="badge" style={{ color: healthColor(plan.health), borderColor: healthColor(plan.health) }}>
              Internal: {plan.health}
            </span>
            <span className="badge" style={{ color: headwindColor(plan.headwind), borderColor: headwindColor(plan.headwind) }}>
              External: {plan.headwind}
            </span>
            {verdictBadge(plan.verdict)}
          </div>
        </div>

        <div className="snapshot-cards">
          <div className="snap-card">
            <div className="label">FY26 Revenue</div>
            <div className="val">{fmt(plan.rev)}<span className="unit">Cr</span></div>
            <div className="sub">full-year actual</div>
          </div>
          <div className="snap-card">
            <div className="label">FY26 Net Profit</div>
            <div className="val" style={{ color: plan.np >= 0 ? "var(--up)" : "var(--down)" }}>{fmt(plan.np)}<span className="unit">Cr</span></div>
            <div className="sub">{plan.np >= 0 ? "profitable" : "loss"}</div>
          </div>
          <div className="snap-card">
            <div className="label">At risk</div>
            <div className="val" style={{ color: "var(--down)" }}>{fmt(plan.atRisk)}<span className="unit">Cr</span></div>
            <div className="sub">recoverable {fmt(plan.recoverable)} Cr</div>
          </div>
        </div>

        <div className="biir-plan-kv">
          <div className="biir-kv-row"><span className="biir-kv-label">Situation</span><span>{plan.situation}</span></div>
          <div className="biir-kv-row"><span className="biir-kv-label">Root cause</span><span>{plan.rootCause}</span></div>
          <div className="biir-kv-row"><span className="biir-kv-label">Strategy</span><span>{plan.strategy}</span></div>
        </div>

        <div className="biir-plan-exposure">
          <h5>Factor exposure (0–100)</h5>
          <div className="biir-exposure-strip">
            {(Object.keys(exposure) as FactorKey[]).map((k) => {
              const score = exposure[k];
              const cls = exposureClass(score);
              const color = cls === "low" ? "var(--up)" : cls === "med" ? "var(--warn)" : "var(--down)";
              const label = FACTORS.find((f) => f.key === k)?.short ?? k;
              return (
                <div className="biir-exposure-item" key={k}>
                  <span className="biir-exposure-label">{label}</span>
                  <div className="biir-exposure-bar"><span style={{ width: `${score}%`, background: color }} /></div>
                  <span className="biir-exposure-score" style={{ color }}>{score}</span>
                </div>
              );
            })}
            <div className="biir-exposure-driver">
              Biggest driver: <b>{FACTORS.find((f) => f.key === dominantFactor(plan.code))?.name}</b>
            </div>
          </div>
        </div>

        <div className="biir-actions">
          <h5>Actions</h5>
          <ol className="biir-action-list">
            {plan.actions.map((a, i) => (
              <li key={i} className={a.none ? "biir-action-none" : ""}>
                <span className="biir-action-num">{i + 1}</span>
                <div className="biir-action-body">
                  <div className="biir-action-title">
                    {a.a}
                    <span className={`biir-action-impact${a.none ? " dim" : ""}`}>{a.impact}</span>
                  </div>
                  <div className="biir-action-detail">{a.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="biir-plan-outcome">
          <div className="biir-outcome-note"><b>Expected outcome:</b> {plan.outcome}</div>
          <div className="biir-outcome-note"><b>Track this (KPI):</b> {plan.kpi}</div>
        </div>
      </div>
    </div>
  );
}
