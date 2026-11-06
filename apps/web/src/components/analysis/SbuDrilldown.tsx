import { fmt, fmtPct, momentumCls } from "../../lib/format";
import {
  contributionPct,
  parameter,
  QUADRANT_RECO,
  QUADRANT_LABEL,
  quadrantOf,
  type ParamKey,
} from "../../lib/analysis";
import type { ScorecardRow } from "../../types";
import { XIcon } from "../Icons";

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="drill-metric">
      <span className="drill-label">{label}</span>
      <span className="drill-value">{value}</span>
      {sub && <span className="drill-sub">{sub}</span>}
    </div>
  );
}

export function SbuDrilldown({
  row,
  totalMtd,
  param,
  onClose,
}: {
  row: ScorecardRow;
  totalMtd: number;
  param: ParamKey;
  onClose: () => void;
}) {
  const q = quadrantOf(row);
  const p = parameter(param);
  const pVal = p.accessor(row, totalMtd);
  const contrib = contributionPct(row, totalMtd);
  const mom = momentumCls(row.momentum);

  return (
    <div className="chart-box drilldown animate-rise">
      <div className="analysis-head">
        <h3>
          {row.code} — {row.name ?? "SBU"} drill-down
        </h3>
        <button className="close-btn" onClick={onClose} aria-label="Close drill-down">
          <XIcon size={14} />
        </button>
      </div>

      {q && (
        <div className={`drill-verdict verdict-${q.replace(" ", "-").toLowerCase()}`}>
          <span className="verdict-quad">{QUADRANT_LABEL[q]}</span>
          <span className="verdict-text">{QUADRANT_RECO[q]}</span>
        </div>
      )}

      <div className="drill-grid">
        <Metric label="Daily Revenue" value={fmt(row.daily_rev)} sub="Cr" />
        <Metric label="MTD Revenue" value={fmt(row.mtd_rev)} sub="Cr" />
        <Metric label="FY YTD Revenue" value={fmt(row.fy_ytd_rev)} sub="Cr" />
        <Metric label="CY YTD Revenue" value={fmt(row.cy_ytd_rev)} sub="Cr" />
        <Metric label="MoM Growth" value={fmtPct(row.mom_pct)} />
        <Metric label="YoY Growth" value={fmtPct(row.yoy_pct)} />
        <Metric
          label="Target Achievement"
          value={fmtPct(row.mtd_ach_pct)}
          sub={row.mtd_tgt_rev != null ? `target ${fmt(row.mtd_tgt_rev)} Cr` : "no target set"}
        />
        <Metric label="Projected M/E" value={fmt(row.proj_rev)} sub="Cr" />
        <Metric label="Contribution" value={contrib == null ? "—" : fmtPct(contrib)} sub="of MTD" />
        <Metric
          label={`MTD Volume`}
          value={row.has_vol && row.mtd_vol != null ? fmt(row.mtd_vol) : "—"}
          sub={row.has_vol ? row.vol_uom ?? "" : ""}
        />
        <Metric label="Momentum" value={row.momentum ?? "—"} sub="" />
        <Metric
          label={p.label}
          value={pVal == null ? "—" : p.pct ? fmtPct(pVal) : `${fmt(pVal)} ${p.unit}`}
          sub="selected parameter"
        />
      </div>

      {row.momentum && (
        <div className="drill-momentum">
          Momentum signal: <span className={mom}>{row.momentum}</span>
        </div>
      )}
    </div>
  );
}
