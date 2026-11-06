import {
  CATEGORY_LABEL,
  type ExternalSignal,
  type FactorCategory,
  type SignalSeverity,
} from "../../lib/biir";
import type { Kpi } from "../../types";
import { fmt } from "../../lib/format";

const CATEGORY_ORDER: FactorCategory[] = [
  "fuel",
  "energy",
  "fx",
  "commodity",
  "crisis",
  "supply",
  "market",
];

const SEV_LABEL: Record<SignalSeverity, string> = {
  low: "Low",
  medium: "Medium",
  critical: "Critical",
};

function directionChip(s: ExternalSignal) {
  const cls = s.direction === "up" ? "dir-bad" : s.direction === "down" ? "dir-good" : "dir-flat";
  const arrow = s.direction === "up" ? "▲" : s.direction === "down" ? "▼" : "—";
  return (
    <span className={`biir-chip ${cls}`}>
      {arrow} {s.changePct > 0 ? "+" : ""}
      {s.changePct}%
    </span>
  );
}

function severityBadge(sev: SignalSeverity) {
  return <span className={`biir-sev biir-sev-${sev}`}>{SEV_LABEL[sev]}</span>;
}

export function SignalCards({
  signals,
  fromDb,
}: {
  signals: ExternalSignal[];
  fromDb: boolean;
}) {
  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: signals.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>External Intelligence</h3>
        <span className="ac-hint">
          {fromDb ? "Live signals (biir_signal)" : "Baseline signals — update via biir_signal / market intel"}
        </span>
      </div>
      <div className="biir-signal-groups">
        {groups.map((g) => (
          <div className="biir-signal-group" key={g.cat}>
            <h4>{CATEGORY_LABEL[g.cat]}</h4>
            <div className="biir-signal-grid">
              {g.items.map((s) => (
                <div className="biir-signal-card" key={s.id} title={s.note}>
                  <div className="biir-signal-top">
                    <span className="biir-signal-name">{s.name}</span>
                    {severityBadge(s.severity)}
                  </div>
                  <div className="biir-signal-mid">
                    {s.value > 0 && (
                      <span className="biir-signal-value">
                        {fmt(s.value, 0)}
                        {s.unit && <span className="unit">{s.unit}</span>}
                      </span>
                    )}
                    {directionChip(s)}
                  </div>
                  <div className="biir-signal-note">{s.note}</div>
                  <div className="biir-signal-meta">{s.source}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <div className="no-data">No external signals configured.</div>}
      </div>
    </div>
  );
}

export function InternalOverview({
  kpi,
  criticalCount,
  mediumCount,
  topOpportunity,
}: {
  kpi: Kpi | null | undefined;
  criticalCount: number;
  mediumCount: number;
  topOpportunity: string | null;
}) {
  return (
    <div className="snapshot-box">
      <h3>Internal Business Signals</h3>
      <div className="snapshot-cards">
        <div className="snap-card">
          <div className="label">MTD Revenue</div>
          <div className="val">
            {fmt(kpi?.total_mtd)}
            <span className="unit">Cr</span>
          </div>
          <div className="sub">Portfolio</div>
        </div>
        <div className="snap-card">
          <div className="label">Avg Achievement</div>
          <div className="val">{kpi?.avg_ach_pct != null ? `${fmt(kpi.avg_ach_pct, 1)}%` : "—"}</div>
          <div className="sub">vs MTD target</div>
        </div>
        <div className="snap-card">
          <div className="label">Critical SBUs</div>
          <div className="val" style={{ color: criticalCount > 0 ? "var(--down)" : "var(--up)" }}>
            {criticalCount}
          </div>
          <div className="sub">risk band 71–100</div>
        </div>
        <div className="snap-card">
          <div className="label">Medium SBUs</div>
          <div className="val" style={{ color: mediumCount > 0 ? "var(--warn)" : "var(--muted)" }}>
            {mediumCount}
          </div>
          <div className="sub">risk band 31–70</div>
        </div>
        <div className="snap-card">
          <div className="label">Top Opportunity</div>
          <div className="val" style={{ color: "var(--up)" }}>{topOpportunity ?? "—"}</div>
          <div className="sub">highest upside</div>
        </div>
      </div>
    </div>
  );
}
