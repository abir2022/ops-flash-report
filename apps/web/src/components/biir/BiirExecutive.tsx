import type { ExecutiveSummary, Opportunity } from "../../lib/biir";
import { fmt } from "../../lib/format";

const PROFIT_PRIORITIES = [
  "Process optimization",
  "Automation",
  "Waste reduction",
  "Productivity improvement",
  "Energy efficiency",
  "Supply chain optimization",
  "Pricing strategy",
];

export function ExecutivePanel({
  summary,
  opportunities,
}: {
  summary: ExecutiveSummary | null;
  opportunities: Opportunity[];
}) {
  return (
    <>
      <div className="biir-exec">
        <div className="biir-exec-head">
          <span className="biir-exec-kicker">AI Executive Summary</span>
          <span className="ac-hint">
            {summary?.generatedAt ? `Generated ${new Date(summary.generatedAt).toLocaleString()}` : ""}
          </span>
        </div>
        <div className="biir-exec-headline">{summary?.headline ?? "Analyzing…"}</div>
        {summary && (
          <div className="biir-exec-grid">
            <ExecBlock title="What changed" items={summary.whatChanged} accent="var(--accent)" />
            <ExecBlock title="Why it matters" items={summary.whyItMatters} accent="var(--warn)" />
            <ExecBlock title="Who is affected" items={summary.whoAffected} accent="var(--down)" />
            <ExecBlock title="What to do" items={summary.actions} accent="var(--up)" />
          </div>
        )}
      </div>

      <div className="insights-row">
        <div className="insight-box">
          <h3>Opportunities</h3>
          {opportunities.length === 0 ? (
            <div className="no-data">No quantified opportunities this period.</div>
          ) : (
            <ul>
              {opportunities.slice(0, 5).map((o) => (
                <li key={`${o.sbuId}:${o.kind}`} className="pos">
                  <b>{o.code}</b> · {o.kind} — {o.detail} <b>{fmt(o.value)} Cr</b>
                  <div className="biir-owner">{o.owner} · {o.timeline}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="insight-box">
          <h3>Profit Protection Priorities</h3>
          <ol className="biir-priority-list">
            {PROFIT_PRIORITIES.map((p, i) => (
              <li key={p}>
                <span className="biir-priority-num">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

function ExecBlock({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent: string;
}) {
  return (
    <div className="biir-exec-block" style={{ borderLeftColor: accent }}>
      <h4>{title}</h4>
      <ul>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
