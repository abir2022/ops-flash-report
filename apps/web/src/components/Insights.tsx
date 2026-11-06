import { useQuery } from "@tanstack/react-query";
import { fetchScorecard } from "../api/client";
import { fmt, fmtPct, num } from "../lib/format";
import type { ScorecardRow } from "../types";

// SBUs with a persistent gap vs the user's portal (override candidates).
const OVERRIDE_CODES = new Set(["NXBL", "NXOR"]);

function codeLabel(r: ScorecardRow) {
  return (
    <>
      {r.code}
      {r.channel !== "default" && <span className="channel">{r.channel}</span>}
    </>
  );
}

export function Insights({ reportDate }: { reportDate: string }) {
  const scorecard = useQuery({
    queryKey: ["scorecard", reportDate],
    queryFn: () => fetchScorecard(reportDate),
  });

  const rows = scorecard.data ?? [];

  const active = rows.filter((r) => (num(r.mtd_rev) ?? 0) > 0);
  const top3 = [...active].sort((a, b) => (num(b.mtd_rev) ?? 0) - (num(a.mtd_rev) ?? 0)).slice(0, 3);
  const bottom3 = active
    .filter((r) => num(r.mtd_ach_pct) !== null)
    .sort((a, b) => (num(a.mtd_ach_pct) ?? 0) - (num(b.mtd_ach_pct) ?? 0))
    .slice(0, 3);

  const risk = active.filter((r) => r.momentum === "Negative" || r.momentum === "Weak");
  const override = rows.filter((r) => OVERRIDE_CODES.has(r.code));
  const dormant = rows.filter(
    (r) => (num(r.mtd_rev) ?? 0) === 0 && (num(r.mtd_vol) ?? 0) === 0 && !r.is_freight
  );

  return (
    <>
      <div className="insights-row">
        <div className="insight-box">
          <h3>SBU Highlights</h3>
          <ul>
                {top3.map((r, i) => (
              <li
                key={`${r.sbu_id}:${r.channel}`}
                className="pos"
                data-tip={`MTD ${fmt(r.mtd_rev)} Cr · rank #${i + 1} by MTD revenue`}
              >
                <span className="li-sign" aria-hidden="true">▲</span>
                {codeLabel(r)}: MTD <b>{fmt(r.mtd_rev)} Cr</b> — leader (#{i + 1})
              </li>
            ))}
            {bottom3.length > 0 && (
              <>
                <li className="dim">Largest achievement gaps:</li>
                {bottom3.map((r) => (
                    <li
                      key={`${r.sbu_id}:${r.channel}`}
                      className="neg"
                      data-tip={`Achievement ${fmtPct(r.mtd_ach_pct)} of MTD target · MTD ${fmt(
                        r.mtd_rev
                      )} Cr`}
                    >
                      <span className="li-sign" aria-hidden="true">▼</span>
                      {codeLabel(r)}: {fmt(r.mtd_ach_pct, 1)}% of target
                    </li>
                ))}
              </>
            )}
          </ul>
        </div>

        <div className="insight-box">
          <h3>Risk Flags</h3>
          <ul>
            {risk.length > 0 ? (
              risk.map((r) => (
                <li
                  key={`${r.sbu_id}:${r.channel}`}
                  className="neg"
                  data-tip={`Momentum ${r.momentum} · MoM ${fmtPct(r.mom_pct)} · MTD ${fmt(
                    r.mtd_rev
                  )} Cr`}
                >
                  <span className="li-sign" aria-hidden="true">▼</span>
                  {codeLabel(r)}: {r.momentum} MoM — MTD {fmt(r.mtd_rev)} Cr
                </li>
              ))
            ) : (
              <li className="pos">No SBUs in Negative/Weak momentum.</li>
            )}
            {override.map((r) => (
              <li
                key={`${r.sbu_id}:${r.channel}`}
                className="neg"
                data-tip="Known reconciliation gap vs portal — verify manually"
              >
                {codeLabel(r)}: verify against portal (known gap)
              </li>
            ))}
            {dormant.length > 0 && (
              <li
                className="dim"
                data-tip="Zero revenue and zero volume this month (non-freight)"
              >
                Zero-revenue: {dormant.map((r) => r.code).join(", ")}
              </li>
            )}
          </ul>
        </div>
      </div>
    </>
  );
}
