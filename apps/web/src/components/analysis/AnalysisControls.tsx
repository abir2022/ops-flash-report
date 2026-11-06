export interface AnalysisFilters {
  showFreight: boolean;
  onlyTarget: boolean;
  minRev: number;
}

export function AnalysisControls({
  filters,
  onChange,
  total,
}: {
  filters: AnalysisFilters;
  onChange: (f: AnalysisFilters) => void;
  total: number;
}) {
  return (
    <div className="analysis-controls">
      <label className="ac-toggle">
        <input
          type="checkbox"
          checked={filters.showFreight}
          onChange={(e) => onChange({ ...filters, showFreight: e.target.checked })}
        />
        Include freight & logistics SBUs
      </label>
      <label className="ac-toggle">
        <input
          type="checkbox"
          checked={filters.onlyTarget}
          onChange={(e) => onChange({ ...filters, onlyTarget: e.target.checked })}
        />
        Only SBUs with a target
      </label>
      <label className="ac-min">
        <span>Min monthly revenue (Cr)</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={filters.minRev}
          onChange={(e) => onChange({ ...filters, minRev: Number(e.target.value) || 0 })}
        />
      </label>
      <span className="ac-count">{total} SBUs in scope</span>
    </div>
  );
}
