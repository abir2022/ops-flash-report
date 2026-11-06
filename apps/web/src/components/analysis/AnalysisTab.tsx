import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchScorecard } from "../../api/client";
import { num } from "../../lib/format";
import type { ParamKey } from "../../lib/analysis";
import type { ScorecardRow } from "../../types";
import { AnalysisControls, type AnalysisFilters } from "./AnalysisControls";
import { QuadrantMatrix } from "./QuadrantMatrix";
import { HealthScore } from "./HealthScore";
import { Leaderboard } from "./Leaderboard";
import { SbuDrilldown } from "./SbuDrilldown";

export function AnalysisTab({
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

  const [filters, setFilters] = useState<AnalysisFilters>({
    showFreight: false,
    onlyTarget: false,
    minRev: 0,
  });
  const [param, setParam] = useState<ParamKey>("mtd_ach_pct");
  const [selected, setSelected] = useState<number | null>(null);

  const all = data ?? [];
  const totalMtd = all.reduce((s, r) => s + (num(r.mtd_rev) ?? 0), 0);

  const rows = useMemo(() => {
    return all.filter((r) => {
      if (!filters.showFreight && r.is_freight) return false;
      if (filters.onlyTarget && num(r.mtd_ach_pct) === null) return false;
      if ((num(r.mtd_rev) ?? 0) < filters.minRev) return false;
      return true;
    });
  }, [all, filters]);

  const selectedRow: ScorecardRow | null = useMemo(
    () => all.find((r) => r.sbu_id === selected && r.channel === "default") ?? null,
    [all, selected]
  );

  if (isExport) {
    return (
      <>
        <div className="export-block" data-export-block data-export-keep>
          <h2 className="export-section">Strategic Performance Analysis</h2>
          <p className="export-intro">
            How we read the portfolio: each business is scored on four drivers so structural
            strength is separated from short-term noise. <strong>Growth × Achievement</strong>{" "}
            places every SBU by month-over-month growth (x-axis) against target achievement
            (y-axis) into four quadrants — Strong (growing &amp; on target), At risk (growing but
            below target), Stable (on target but slowing), Weak (shrinking &amp; below target). The{" "}
            <strong>SBU Health Score</strong> is a weighted percentile (Achievement 40%, MoM 25%,
            YoY 15%, Contribution 20%) bucketed into Good / Watch / Risk. The{" "}
            <strong>ranking table</strong> orders every business by MTD achievement — higher is
            better; businesses with no target are listed last.
          </p>
        </div>

        <div className="export-block" data-export-block>
          <QuadrantMatrix rows={rows} onSelect={() => {}} />
        </div>

        <div className="export-block" data-export-block data-export-keep>
          <HealthScore rows={rows} onSelect={() => {}} selected={null} />
        </div>

        <Leaderboard
          rows={rows}
          totalMtd={totalMtd}
          param={param}
          onParamChange={() => {}}
          onSelect={() => {}}
          selected={null}
          export
        />
      </>
    );
  }

  return (
    <div className="analysis-tab">
      {!isExport && (
        <AnalysisControls filters={filters} onChange={setFilters} total={rows.length} />
      )}

      <div className="analysis-grid">
        <QuadrantMatrix rows={rows} onSelect={setSelected} />
        <HealthScore rows={rows} onSelect={setSelected} selected={selected} />
      </div>

      <Leaderboard
        rows={rows}
        totalMtd={totalMtd}
        param={param}
        onParamChange={setParam}
        onSelect={setSelected}
        selected={selected}
      />

      {!isExport && selectedRow && (
        <SbuDrilldown
          row={selectedRow}
          totalMtd={totalMtd}
          param={param}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
