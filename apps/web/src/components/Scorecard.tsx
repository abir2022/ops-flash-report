import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchScorecard } from "../api/client";
import { SbuTrendChart } from "./SbuTrendChart";
import { fmt, fmtPct, momentumCls, num } from "../lib/format";
import type { ScorecardRow, SortKey } from "../types";
import { ChevronDownIcon, ChevronRightIcon } from "./Icons";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "mtd_rev", label: "MTD Revenue (default)" },
  { key: "daily_rev", label: "Daily Revenue" },
  { key: "code", label: "SBU A–Z" },
  { key: "mtd_ach_pct", label: "Ach% High–Low" },
  { key: "mom_pct", label: "MoM% High–Low" },
  { key: "yoy_pct", label: "YoY% High–Low" },
  { key: "proj_rev", label: "Projected M/E" },
];

const FULL_COLS = 14;
const SIMPLE_COLS = 7;

function arrow(v: number | null): string {
  if (v === null) return "";
  return v > 0 ? "▲ " : v < 0 ? "▼ " : "";
}

function prefersSimple(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

export function Scorecard({
  reportDate,
  export: isExport = false,
}: {
  reportDate: string;
  export?: boolean;
}) {
  const { data } = useQuery({
    queryKey: ["scorecard", reportDate],
    queryFn: () => fetchScorecard(reportDate),
  });
  const [sortKey, setSortKey] = useState<SortKey>("mtd_rev");
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [simpleState, setSimple] = useState(() => prefersSimple());
  const [groupedState, setGrouped] = useState(false);

  const simple = isExport ? false : simpleState;
  const grouped = isExport ? true : groupedState;

  const cols = simple ? SIMPLE_COLS : FULL_COLS;

  const rows = useMemo(() => {
    let r = data ?? [];
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      r = r.filter(
        (x) => x.code.toLowerCase().includes(q) || (x.name ?? "").toLowerCase().includes(q)
      );
    }
    const sorted = [...r];
    const cmp = (a: ScorecardRow, b: ScorecardRow) => {
      if (sortKey === "code") return a.code.localeCompare(b.code);
      return (num(b[sortKey]) ?? 0) - (num(a[sortKey]) ?? 0);
    };
    if (grouped) {
      sorted.sort((a, b) => {
        const sa = a.section ?? "";
        const sb = b.section ?? "";
        if (sa !== sb) return sa.localeCompare(sb);
        return cmp(a, b);
      });
    } else {
      sorted.sort(cmp);
    }
    return sorted;
  }, [data, sortKey, filter, grouped]);

  const top3 = new Set(
    (data ?? [])
      .filter((r) => (num(r.mtd_rev) ?? 0) > 0)
      .sort((a, b) => (num(b.mtd_rev) ?? 0) - (num(a.mtd_rev) ?? 0))
      .slice(0, 3)
      .map((r) => r.sbu_id)
  );

  return (
    <div {...(isExport ? { "data-export-table": "" } : {})}>
      {!isExport && (
      <div className="scorecard-controls">
        <label htmlFor="sort">Sort by</label>
        <select
          id="sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter SBUs…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="scorecard-toggle">
          <input
            type="checkbox"
            checked={simple}
            onChange={(e) => setSimple(e.target.checked)}
          />
          Simple view
        </label>
        <label className="scorecard-toggle">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(e) => setGrouped(e.target.checked)}
          />
          Group by section
        </label>
        <button className="btn" onClick={() => exportCsv(data ?? [])}>
          Export CSV
        </button>
      </div>
      )}

      <div className="scorecard-wrap">
        <table className="scorecard-table">
          {isExport && (
            <caption className="export-caption">SBU-wise Business Scorecard</caption>
          )}
          <thead {...(isExport ? { "data-export-head": "" } : {})}>
            <tr>
              <th className="col-sbu">SBU</th>
              <th className="col-section">Section</th>
              <th className="num col-num">Daily</th>
              {!simple && <th className="num col-num">DoD%</th>}
              <th className="num col-num">MTD</th>
              {!simple && <th className="num col-num">MTD Tgt</th>}
              <th className="num col-num">Ach%</th>
              {!simple && <th className="num col-num">MoM%</th>}
              {!simple && <th className="num col-num">YoY%</th>}
              {!simple && <th className="num col-num">FY YTD</th>}
              {!simple && <th className="num col-num">CY YTD</th>}
              {!simple && <th className="num col-num">Proj M/E</th>}
              <th className="col-signal">Signal</th>
              <th className="col-spacer" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const key = `${r.sbu_id}:${r.channel}`;
              const isOpen = expanded === key;
              const dodPct =
                num(r.dod_rev) && num(r.dod_rev) !== 0
                  ? ((num(r.daily_rev) ?? 0) / (num(r.dod_rev) ?? 1) - 1) * 100
                  : null;
              const showBand =
                grouped && (i === 0 || (rows[i - 1].section ?? "") !== (r.section ?? ""));
              return (
                <Fragment key={key}>
                  {showBand && (
                    <tr className="section-band">
                      <td colSpan={cols}>{r.section ?? "—"}</td>
                    </tr>
                  )}
                  <FragmentRow
                    row={r}
                    simple={simple}
                    isTop={top3.has(r.sbu_id)}
                    isOpen={isOpen}
                    dodPct={dodPct}
                    to={reportDate}
                    cols={cols}
                    export={isExport}
                    onToggle={() => setExpanded(isOpen ? null : key)}
                  />
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({
  row,
  simple,
  isTop,
  isOpen,
  dodPct,
  to,
  cols,
  export: isExport = false,
  onToggle,
}: {
  row: ScorecardRow;
  simple: boolean;
  isTop: boolean;
  isOpen: boolean;
  dodPct: number | null;
  to: string;
  cols: number;
  export?: boolean;
  onToggle: () => void;
}) {
  const ach = num(row.mtd_ach_pct);
  const achCls = ach !== null && ach >= 100 ? "mom-up" : ach !== null && ach < 50 ? "mom-down" : "";
  const mom = num(row.mom_pct);
  const dodCls = dodPct !== null && dodPct >= 0 ? "mom-up" : dodPct !== null ? "mom-down" : "";

  return (
    <>
      <tr
        className={`scorecard-row${isTop ? " top-performer" : ""}`}
        tabIndex={isExport ? undefined : 0}
        aria-expanded={isExport ? undefined : isOpen}
        onClick={isExport ? undefined : onToggle}
        onKeyDown={
          isExport
            ? undefined
            : (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle();
                }
              }
        }
        title={isExport ? undefined : isOpen ? "Hide trend" : "Show trend"}
      >
        <td className="sbu-name-cell">
          <div className="sbu-name-row">
            {!isExport && (
              <span className="chevron" aria-hidden="true">
                {isOpen ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
              </span>
            )}
            <span className="sbu-name-main">
              <span className="code">{row.name ?? row.code}</span>
              {row.name && <span className="code-sub">{row.code}</span>}
            </span>
            {row.channel !== "default" && <span className="channel">{row.channel}</span>}
          </div>
        </td>
        <td className="section-cell">{row.section ?? "—"}</td>
        <td className="num">{fmt(row.daily_rev)}</td>
        {!simple && (
          <td className={`num ${dodCls}`}>
            {arrow(dodPct)}
            {fmtPct(dodPct)}
          </td>
        )}
        <td className="num">{fmt(row.mtd_rev)}</td>
        {!simple && <td className="num">{fmt(row.mtd_tgt_rev)}</td>}
        <td className={`num ${achCls}`}>{fmtPct(ach)}</td>
        {!simple && (
          <td className={`num ${mom !== null && mom > 0 ? "mom-up" : mom !== null ? "mom-down" : ""}`}>
            {arrow(mom)}
            {fmtPct(mom)}
          </td>
        )}
        {!simple && <td className="num">{fmtPct(num(row.yoy_pct))}</td>}
        {!simple && <td className="num">{fmt(row.fy_ytd_rev)}</td>}
        {!simple && <td className="num">{fmt(row.cy_ytd_rev)}</td>}
        {!simple && <td className="num">{fmt(row.proj_rev)}</td>}
        <td className={momentumCls(row.momentum)}>{row.momentum ?? "N/A"}</td>
        <td />
      </tr>
      {isOpen && (
        <tr className="chart-row open">
          <td colSpan={cols}>
            <div className="trend-head">
              <span className="code">{row.code}</span>
              {row.name && <span className="trend-name">{row.name}</span>}
              {row.section && <span className="trend-section">{row.section}</span>}
            </div>
            <SbuTrendChart sbuId={row.sbu_id} channel={row.channel} to={to} />
          </td>
        </tr>
      )}
    </>
  );
}

function exportCsv(rows: ScorecardRow[]) {
  const header = [
    "SBU", "Section", "Channel", "DailyRev", "DoD%", "MTDRev", "MTDTgt", "Ach%",
    "MoM%", "YoY%", "FY_YTD", "CY_YTD", "ProjME", "Signal",
  ];
  const lines = rows.map((r) =>
    [
      r.code, r.section ?? "", r.channel, num(r.daily_rev), dodPct(r), num(r.mtd_rev),
      num(r.mtd_tgt_rev), num(r.mtd_ach_pct), num(r.mom_pct), num(r.yoy_pct),
      num(r.fy_ytd_rev), num(r.cy_ytd_rev), num(r.proj_rev), r.momentum,
    ]
      .map((v) => (v === null ? "" : String(v)))
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ops-flash-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function dodPct(r: ScorecardRow): number | null {
  const dod = num(r.dod_rev);
  if (!dod) return null;
  return ((num(r.daily_rev) ?? 0) / dod - 1) * 100;
}
