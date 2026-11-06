// ---------------------------------------------------------------------------
// Excel export — SBU-wise "Branch Mark vs Actual" workbook.
//
// Mirrors the on-screen BranchMarkTable: benchmark (branch mark) top/bottom
// vs actual top/bottom-line ROMI per SBU, with live Excel formulas for the
// gap columns and the status column so the file recalculates on open.
// ---------------------------------------------------------------------------

import { computeEffective, type BenchmarkRow } from "./romi";
import type { RomiCampaignRow } from "../types";

// Lazily loaded so the SheetJS bundle is code-split out of the main chunk
// (matches the repo's existing dynamic-import pattern for the PDF export).
type Xlsx = typeof import("xlsx");

// Matches branchStatus() in RomiAnalysisLayer.tsx (but spells out "NO MARK"
// rather than an em dash for a cleaner sheet).
function statusLabel(r: BenchmarkRow): string {
  const hasMark = r.benchmark_top !== null || r.benchmark_bottom !== null;
  const hasData = r.total_romi_top !== null || r.total_romi_bottom !== null;
  if (!hasMark) return "NO MARK";
  if (!hasData) return "NO DATA";
  const topHit =
    r.benchmark_top === null ||
    (r.total_romi_top !== null && r.total_romi_top >= r.benchmark_top);
  const bottomHit =
    r.benchmark_bottom === null ||
    (r.total_romi_bottom !== null && r.total_romi_bottom >= r.benchmark_bottom);
  return topHit && bottomHit ? "ON TRACK" : "BELOW MARK";
}

// Live formula for the status column. References D (mark top), E (romi top),
// G (mark bottom), H (romi bottom) of the same row.
function statusFormula(row: number): string {
  return [
    `IF(COUNT(D${row},G${row})=0,"NO MARK",`,
    `IF(COUNT(E${row},H${row})=0,"NO DATA",`,
    `IF(AND(IF(D${row}="",TRUE,E${row}>=D${row}),IF(G${row}="",TRUE,H${row}>=G${row})),`,
    `"ON TRACK","BELOW MARK")))`,
  ].join("");
}

const HEADERS = [
  "SBU",
  "SBU Name",
  "Campaigns",
  "Branch Mark Top",
  "ROMI Top (Actual)",
  "Gap Top",
  "Branch Mark Bottom",
  "ROMI Bottom (Actual)",
  "Gap Bottom",
  "Status",
];

const COL_WIDTHS = [
  { wch: 10 }, // A SBU
  { wch: 34 }, // B name
  { wch: 10 }, // C campaigns
  { wch: 16 }, // D mark top
  { wch: 17 }, // E romi top
  { wch: 10 }, // F gap top
  { wch: 19 }, // G mark bottom
  { wch: 19 }, // H romi bottom
  { wch: 12 }, // I gap bottom
  { wch: 12 }, // J status
];

function num(v: number | null): number | null {
  return v === null ? null : Number(v);
}

export async function exportBranchMarkExcel(rows: BenchmarkRow[], reportMonth?: string) {
  const XLSX: Xlsx = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([]);

  // Title + subtitle + header row.
  const title = reportMonth
    ? `Branch Mark vs Actual — ${reportMonth}`
    : "Branch Mark vs Actual";
  XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: "A1" });
  XLSX.utils.sheet_add_aoa(
    ws,
    [["SBU-wise benchmark (branch mark) vs actual ROMI — gap & status are live Excel formulas."]],
    { origin: "A2" },
  );
  XLSX.utils.sheet_add_aoa(ws, [HEADERS], { origin: "A4" });

  const first = 5;
  const n = rows.length;

  rows.forEach((r, i) => {
    const row = first + i;
    const bt = num(r.benchmark_top);
    const bb = num(r.benchmark_bottom);
    const rt = num(r.total_romi_top);
    const rb = num(r.total_romi_bottom);

    // Base values (gaps are placeholders, overwritten with formulas below).
    XLSX.utils.sheet_add_aoa(
      ws,
      [[r.code, r.name ?? "", r.n_campaigns, bt, rt, null, bb, rb, null, statusLabel(r)]],
      { origin: `A${row}` },
    );

    // Gap Top = E - D (only when both sides exist).
    if (bt !== null && rt !== null) {
      ws[`F${row}`] = { t: "n", f: `E${row}-D${row}`, v: rt - bt, z: "0.00" };
    }
    // Gap Bottom = H - G.
    if (bb !== null && rb !== null) {
      ws[`I${row}`] = { t: "n", f: `H${row}-G${row}`, v: rb - bb, z: "0.00" };
    }
    // Status formula (cached value mirrors the formula result).
    ws[`J${row}`] = { t: "s", f: statusFormula(row), v: statusLabel(r) };

    // Number formatting for the ratio columns.
    for (const col of ["D", "E", "G", "H"]) {
      const cell = ws[`${col}${row}`];
      if (cell && cell.t === "n") cell.z = "0.00";
    }
  });

  // ---- summary block -------------------------------------------------------
  const last = first + n - 1;
  const s = last + 2; // first summary row
  const range = `A${first}:A${last}`;
  const statusRange = `J${first}:J${last}`;

  const onTrack = rows.filter((r) => statusLabel(r) === "ON TRACK").length;
  const belowMark = rows.filter((r) => statusLabel(r) === "BELOW MARK").length;
  const noData = rows.filter((r) => statusLabel(r) === "NO DATA").length;

  const summary: Array<[string, string, number]> = [
    ["Summary", "", 0],
    ["SBUs benchmarked", `COUNTA(${range})`, n],
    ["On track", `COUNTIF(${statusRange},"ON TRACK")`, onTrack],
    ["Below mark", `COUNTIF(${statusRange},"BELOW MARK")`, belowMark],
    ["No data", `COUNTIF(${statusRange},"NO DATA")`, noData],
  ];

  summary.forEach(([label, formula, value], k) => {
    const row = s + k;
    XLSX.utils.sheet_add_aoa(ws, [[label]], { origin: `A${row}` });
    if (formula) {
      ws[`B${row}`] = { t: "n", f: formula, v: value };
    }
  });

  // ---- styling -------------------------------------------------------------
  ws["!cols"] = COL_WIDTHS;
  if (ws["A1"]) ws["A1"].s = { font: { bold: true, sz: 14 } };
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]) {
    const cell = ws[`${col}4`];
    if (cell) cell.s = { font: { bold: true } };
  }
  if (ws[`A${s}`]) ws[`A${s}`].s = { font: { bold: true } };

  const safe = reportMonth ? reportMonth.replace(/[^A-Za-z0-9._-]/g, "-") : "all";
  XLSX.utils.book_append_sheet(wb, ws, "Branch Mark vs Actual");
  XLSX.writeFile(wb, `branch-mark-vs-actual-${safe}.xlsx`);
}

// ---------------------------------------------------------------------------
// Excel export — Campaign Ledger ("all campaigns + detail calculations").
//
// Mirrors CampaignLedgerTable in RomiAnalysisLayer.tsx. Every derived column
// (Led Increment, the four profit lines, ROMI Top/Bottom) is a live Excel
// formula so the ROMI math is auditable. An admin-overridden value is exported
// as a literal (no formula) so it never silently recomputes to a different
// number than the report shows.
// ---------------------------------------------------------------------------

const CR = 10_000_000;

const LEDGER_HEADERS = [
  "SBU",
  "Campaign",
  "Category",
  "Month",
  "Start",
  "End",
  "Actual Rev (Cr)",
  "Organic (Cr)",
  "SPLY (Cr)",
  "Marketing-led Revenue (Cr)",
  "GP %",
  "Actual Profit (Cr)",
  "Base Profit (Cr)",
  "SPLY Profit (Cr)",
  "Marketing-led Profit (Cr)",
  "Expense GL (Cr)",
  "Officer Exp (Cr)",
  "ROMI Top (×)",
  "ROMI Bottom (×)",
];

const LEDGER_WIDTHS = [
  { wch: 10 }, // A SBU
  { wch: 34 }, // B campaign
  { wch: 16 }, // C category
  { wch: 10 }, // D month
  { wch: 12 }, // E start
  { wch: 12 }, // F end
  { wch: 14 }, // G actual rev
  { wch: 14 }, // H organic
  { wch: 14 }, // I sply
  { wch: 18 }, // J marketing-led revenue
  { wch: 9 }, // K gp%
  { wch: 15 }, // L actual profit
  { wch: 14 }, // M base profit
  { wch: 14 }, // N sply profit
  { wch: 16 }, // O marketing-led profit
  { wch: 14 }, // P expense GL
  { wch: 13 }, // Q officer exp
  { wch: 12 }, // R romi top
  { wch: 13 }, // S romi bottom
];

const MONEY_COLS = ["G", "H", "I", "J", "L", "M", "N", "O", "P", "Q"];
const HEADER_COLS = "ABCDEFGHIJKLMNOPQRS".split("");
const MONEY_FMT = "#,##0.00";

export async function exportCampaignLedgerExcel(
  rows: RomiCampaignRow[],
  reportMonth?: string,
) {
  const XLSX: Xlsx = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([]);

  const title = reportMonth
    ? `Campaign Ledger — ${reportMonth}`
    : "Campaign Ledger";
  XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: "A1" });
  XLSX.utils.sheet_add_aoa(
    ws,
    [[
      "Campaign-wise breakdown per SBU. Marketing-led Revenue = Actual Rev − organic baseline " +
      "(Organic if > 0, else SPLY). Derived columns are live Excel formulas; admin-overridden " +
      "values are exported as literals so they never recalculate.",
    ]],
    { origin: "A2" },
  );
  XLSX.utils.sheet_add_aoa(ws, [LEDGER_HEADERS], { origin: "A4" });

  // Group campaigns by SBU (stable sort by code), and each SBU's campaigns by
  // start date then name, so every SBU's rows are contiguous with a subtotal.
  const groups = new Map<
    string,
    { code: string; name: string; rows: RomiCampaignRow[] }
  >();
  for (const raw of rows) {
    const code = raw.code ?? String(raw.business_unit_id);
    let g = groups.get(code);
    if (!g) {
      g = { code, name: raw.sbu_name ?? "", rows: [] };
      groups.set(code, g);
    }
    g.rows.push(raw);
  }
  const ordered = Array.from(groups.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  for (const g of ordered) {
    g.rows.sort(
      (a, b) =>
        (a.start_date ?? "").localeCompare(b.start_date ?? "") ||
        (a.campaign_name ?? "").localeCompare(b.campaign_name ?? ""),
    );
  }

  const cr = (v: number) => v / CR;
  let row = 5; // data starts at 5 (title 1, subtitle 2, blank 3, header 4)

  const writeDerived = (r: RomiCampaignRow, e: ReturnType<typeof computeEffective>, at: number) => {
    if (r.incr_rev_ov == null) {
      ws[`J${at}`] = { t: "n", f: `G${at}-IF(H${at}>0,H${at},I${at})`, v: cr(e.incr_rev) };
    }
    if (r.actual_profit_ov == null) {
      ws[`L${at}`] = { t: "n", f: `G${at}*K${at}`, v: cr(e.actual_profit) };
    }
    if (r.base_profit_ov == null) {
      ws[`M${at}`] = { t: "n", f: `H${at}*K${at}`, v: cr(e.base_profit) };
    }
    if (r.sply_profit_ov == null) {
      ws[`N${at}`] = { t: "n", f: `I${at}*K${at}`, v: cr(e.sply_profit) };
    }
    if (r.incr_profit_ov == null) {
      ws[`O${at}`] = { t: "n", f: `J${at}*K${at}`, v: cr(e.incr_profit) };
    }
    if (r.romi_top_ov == null) {
      ws[`R${at}`] = { t: "n", f: `IF(P${at}=0,0,(J${at}-P${at})/P${at})`, v: e.romi_top };
    }
    if (r.romi_bottom_ov == null) {
      ws[`S${at}`] = { t: "n", f: `IF(P${at}=0,0,(O${at}-P${at})/P${at})`, v: e.romi_bottom };
    }
    for (const col of MONEY_COLS) {
      const cell = ws[`${col}${at}`];
      if (cell && cell.t === "n") cell.z = MONEY_FMT;
    }
    {
      const cell = ws[`K${at}`];
      if (cell && cell.t === "n") cell.z = "0.0%";
    }
    for (const col of ["R", "S"]) {
      const cell = ws[`${col}${at}`];
      if (cell && cell.t === "n") cell.z = "0.00";
    }
  };

  for (const g of ordered) {
    const start = row;
    for (const raw of g.rows) {
      const e = computeEffective(raw);
      XLSX.utils.sheet_add_aoa(
        ws,
        [[
          raw.code ?? raw.business_unit_id,
          raw.campaign_name,
          raw.category ?? "",
          raw.report_month ?? "",
          raw.start_date ?? "",
          raw.end_date ?? "",
          cr(e.actual_rev),
          cr(e.organic_rev),
          cr(e.sply_rev),
          cr(e.incr_rev),
          e.gp_margin,
          cr(e.actual_profit),
          cr(e.base_profit),
          cr(e.sply_profit),
          cr(e.incr_profit),
          cr(e.marketing_expense),
          cr(e.officer_expense_total),
          e.romi_top,
          e.romi_bottom,
        ]],
        { origin: `A${row}` },
      );
      writeDerived(raw, e, row);
      row += 1;
    }
    const end = row - 1;

    // ---- SBU subtotal row --------------------------------------------------
    const eff = g.rows.map(computeEffective);
    const sum = (f: (e: ReturnType<typeof computeEffective>) => number) =>
      eff.reduce((a, e) => a + f(e), 0);
    const tRev = sum((e) => e.actual_rev);
    const tOrg = sum((e) => e.organic_rev);
    const tSply = sum((e) => e.sply_rev);
    const tIncr = sum((e) => e.incr_rev);
    const tActualProfit = sum((e) => e.actual_profit);
    const tBaseProfit = sum((e) => e.base_profit);
    const tSplyProfit = sum((e) => e.sply_profit);
    const tIncrProfit = sum((e) => e.incr_profit);
    const tExpense = sum((e) => e.marketing_expense);
    const tOfficer = sum((e) => e.officer_expense_total);
    const wGp = tRev > 0 ? tActualProfit / tRev : 0;
    const rTop = tExpense > 0 ? (tIncr - tExpense) / tExpense : 0;
    const rBottom = tExpense > 0 ? (tIncrProfit - tExpense) / tExpense : 0;

    const moneyVals: Record<string, number> = {
      G: cr(tRev),
      H: cr(tOrg),
      I: cr(tSply),
      J: cr(tIncr),
      L: cr(tActualProfit),
      M: cr(tBaseProfit),
      N: cr(tSplyProfit),
      O: cr(tIncrProfit),
      P: cr(tExpense),
      Q: cr(tOfficer),
    };

    XLSX.utils.sheet_add_aoa(
      ws,
      [[
        g.code,
        `Subtotal — ${g.code}${g.name ? ` ${g.name}` : ""}`,
        "",
        "",
        "",
        "",
        moneyVals.G,
        moneyVals.H,
        moneyVals.I,
        moneyVals.J,
        wGp,
        moneyVals.L,
        moneyVals.M,
        moneyVals.N,
        moneyVals.O,
        moneyVals.P,
        moneyVals.Q,
        rTop,
        rBottom,
      ]],
      { origin: `A${row}` },
    );

    for (const col of MONEY_COLS) {
      ws[`${col}${row}`] = {
        t: "n",
        f: `SUM(${col}${start}:${col}${end})`,
        v: moneyVals[col],
        z: MONEY_FMT,
      };
    }
    ws[`K${row}`] = {
      t: "n",
      f: `IF(SUM(G${start}:G${end})=0,0,SUM(L${start}:L${end})/SUM(G${start}:G${end}))`,
      v: wGp,
      z: "0.0%",
    };
    ws[`R${row}`] = {
      t: "n",
      f: `IF(P${row}=0,0,(J${row}-P${row})/P${row})`,
      v: rTop,
      z: "0.00",
    };
    ws[`S${row}`] = {
      t: "n",
      f: `IF(P${row}=0,0,(O${row}-P${row})/P${row})`,
      v: rBottom,
      z: "0.00",
    };

    for (const col of HEADER_COLS) {
      const cell = ws[`${col}${row}`];
      if (cell) cell.s = { font: { bold: true } };
    }
    row += 1;
  }

  // ---- styling -------------------------------------------------------------
  ws["!cols"] = LEDGER_WIDTHS;
  if (ws["A1"]) ws["A1"].s = { font: { bold: true, sz: 14 } };
  for (const col of HEADER_COLS) {
    const cell = ws[`${col}4`];
    if (cell) cell.s = { font: { bold: true } };
  }

  const safe = reportMonth ? reportMonth.replace(/[^A-Za-z0-9._-]/g, "-") : "all";
  XLSX.utils.book_append_sheet(wb, ws, "Campaign Ledger");
  XLSX.writeFile(wb, `campaign-ledger-${safe}.xlsx`);
}
