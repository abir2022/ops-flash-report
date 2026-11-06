import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRomiCampaigns } from "../../api/client";
import { computeEffective, type EffectiveCampaign } from "../../lib/romi";
import { fmt } from "../../lib/format";

const CR = 10_000_000;

function cr(v: number | null): string {
  return v === null ? "—" : fmt(v / CR);
}

function romiStr(v: number | null): string {
  return v === null ? "—" : `${fmt(v, 2)}×`;
}

// Branch-mark status for a single campaign (top-line ROMI vs the SBU mark).
function markStatus(r: EffectiveCampaign): { label: string; cls: string } {
  const hasMark = r.benchmark_top !== null || r.benchmark_bottom !== null;
  if (!hasMark) return { label: "—", cls: "mk-eff-none" };
  const topHit = r.benchmark_top === null || (r.romi_top !== null && r.romi_top >= r.benchmark_top);
  const bottomHit =
    r.benchmark_bottom === null || (r.romi_bottom !== null && r.romi_bottom >= r.benchmark_bottom);
  if (topHit && bottomHit) return { label: "ON TRACK", cls: "mk-eff-good" };
  if (!topHit && !bottomHit) return { label: "BELOW MARK", cls: "mk-eff-risk" };
  return { label: "MIXED", cls: "mk-eff-watch" };
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function round(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return v.toFixed(d);
}

function exportCsv(rows: EffectiveCampaign[]) {
  const header = [
    "SBU Code", "SBU Name", "Campaign", "Category", "Officer", "Officer Enroll",
    "Report Month", "Start", "End",
    "Actual Rev (F)", "Organic Rev (G)", "SPLY Rev (H)", "Baseline Rev",
    "Led Increment (I)", "GP Margin (J)", "Actual Profit (K)", "Base Profit (L)",
    "SPLY Profit (M)", "Led Profit (N)", "Marketing Expense (O)",
    "Officer Expense", "ROMI Top (P)", "ROMI Bottom (R)",
    "Benchmark Top", "Benchmark Bottom", "Extra Fields",
  ];
  const lines = rows.map((r) =>
    [
      csvCell(r.code ?? r.business_unit_id),
      csvCell(r.sbu_name ?? ""),
      csvCell(r.campaign_name),
      csvCell(r.category ?? ""),
      csvCell(r.officer_name ?? ""),
      csvCell(r.officer_enroll ?? ""),
      csvCell(r.report_month ?? ""),
      csvCell(r.start_date ?? ""),
      csvCell(r.end_date ?? ""),
      round(r.actual_rev),
      round(r.organic_rev),
      round(r.sply_rev),
      round(r.baseline_rev),
      round(r.incr_rev),
      round(r.gp_margin, 4),
      round(r.actual_profit),
      round(r.base_profit),
      round(r.sply_profit),
      round(r.incr_profit),
      round(r.marketing_expense),
      round(r.officer_expense_total),
      round(r.romi_top, 4),
      round(r.romi_bottom, 4),
      round(r.benchmark_top, 4),
      round(r.benchmark_bottom, 4),
      csvCell(r.extra_fields ? JSON.stringify(r.extra_fields) : ""),
    ].join(","),
  );
  const csv = [header.map(csvCell).join(","), ...lines].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `romi-responses-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RomiResponsesPanel() {
  const campaigns = useQuery({
    queryKey: ["romi-campaigns"],
    queryFn: fetchRomiCampaigns,
  });

  const effective = useMemo(
    () => (campaigns.data ?? []).map(computeEffective),
    [campaigns.data],
  );

  const loading = campaigns.isLoading;
  const error = campaigns.isError
    ? (campaigns.error as Error)?.message ?? "ROMI data unavailable"
    : null;

  return (
    <section className="admin-card">
      <div className="analysis-head">
        <h3>ROMI Responses</h3>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            className="btn-ghost sm"
            onClick={() => void campaigns.refetch()}
          >
            Reload
          </button>
          <button
            type="button"
            className="btn"
            disabled={effective.length === 0}
            onClick={() => exportCsv(effective)}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p className="no-data" style={{ marginBottom: "0.75rem" }}>
        Every campaign filed by officers, with the complete ROMI calculation (F–N, O, P, R). Money
        columns in the CSV are raw BDT; the engine figures populate after the ETL ROMI refresh runs.
      </p>

      {loading ? (
        <div className="loading-screen">Loading ROMI responses…</div>
      ) : error ? (
        <div className="chart-box no-data">{error}</div>
      ) : effective.length === 0 ? (
        <div className="chart-box no-data">No campaign responses yet.</div>
      ) : (
        <div className="mk-table-wrap">
          <table className="scorecard-table mk-table">
            <thead>
              <tr>
                <th>SBU</th>
                <th>Campaign</th>
                <th>Officer</th>
                <th>Month</th>
                <th>Start–End</th>
                <th className="num">Officer Expense (Cr)</th>
                <th className="num">Led Increment (Cr)</th>
                <th className="num">ROMI Top</th>
                <th className="num">ROMI Bottom</th>
                <th>vs Mark</th>
              </tr>
            </thead>
            <tbody>
              {effective.map((r, i) => {
                const st = markStatus(r);
                return (
                  <tr key={`${r.business_unit_id}-${r.campaign_name}-${i}`}>
                    <td>
                      <span className="code">{r.code ?? r.business_unit_id}</span>
                      <span className="code-sub">{r.sbu_name ?? ""}</span>
                    </td>
                    <td>
                      <div className="code">{r.campaign_name}</div>
                      <div className="code-sub">{r.category ?? ""}</div>
                    </td>
                    <td>
                      <div className="code">{r.officer_name ?? "—"}</div>
                      <div className="code-sub">{r.officer_enroll ?? ""}</div>
                    </td>
                    <td>{r.report_month ?? "—"}</td>
                    <td>
                      {r.start_date ?? "—"} → {r.end_date ?? "—"}
                    </td>
                    <td className="num">{cr(r.officer_expense_total)}</td>
                    <td className="num">{cr(r.incr_rev)}</td>
                    <td className="num">{romiStr(r.romi_top)}</td>
                    <td className="num">{romiStr(r.romi_bottom)}</td>
                    <td>
                      <span className={`mk-eff ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
