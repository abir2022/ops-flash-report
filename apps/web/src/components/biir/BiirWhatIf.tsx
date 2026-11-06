import { useMemo, useState } from "react";
import { simulateImpact, type WhatIfScenario, type WhatIfResult } from "../../lib/biir";
import { fmt } from "../../lib/format";
import type { ScorecardRow } from "../../types";

const PRESETS: { id: string; label: string; category: WhatIfScenario["category"]; min: number; max: number }[] = [
  { id: "fuel", label: "Diesel", category: "fuel", min: 0, max: 40 },
  { id: "energy", label: "Electricity", category: "energy", min: 0, max: 40 },
  { id: "fx", label: "USD / BDT", category: "fx", min: 0, max: 30 },
  { id: "coal", label: "Coal", category: "commodity", min: 0, max: 40 },
  { id: "freight", label: "Ocean freight", category: "supply", min: 0, max: 40 },
];

export function WhatIfSimulator({ rows }: { rows: ScorecardRow[] }) {
  const [presetId, setPresetId] = useState("fuel");
  const [delta, setDelta] = useState(15);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];

  const result: WhatIfResult = useMemo(() => {
    const scenario: WhatIfScenario = { id: preset.id, label: preset.label, category: preset.category, deltaPct: delta };
    return simulateImpact(rows, scenario);
  }, [rows, preset, delta]);

  return (
    <div className="chart-box">
      <div className="analysis-head">
        <h3>Predictive Business Simulator</h3>
        <span className="ac-hint">Estimate profit/cost impact of a shock</span>
      </div>

      <div className="biir-whatif-controls">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={p.id === presetId ? "tab active" : "tab"}
            onClick={() => setPresetId(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="biir-whatif-slider">
        <label>
          {preset.label} change
          <input
            type="range"
            min={preset.min}
            max={preset.max}
            step={1}
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value))}
          />
        </label>
        <span className="biir-whatif-delta">+{delta}%</span>
      </div>

      <div className="biir-whatif-result">
        <div className="biir-whatif-big">
          <span className="label">Estimated portfolio cost impact</span>
          <div className="val" style={{ color: "var(--warn)" }}>
            {fmt(result.totalImpact)}
            <span className="unit">Cr</span>
          </div>
          <div className="sub">{result.scenario}</div>
        </div>
        <div className="biir-whatif-impacted">
          <h4>Most exposed SBUs</h4>
          {result.impacted.length === 0 ? (
            <div className="no-data">No material exposure.</div>
          ) : (
            <ul>
              {result.impacted.map((i) => (
                <li key={i.code}>
                  <span className="code">{i.code}</span>
                  <span className="biir-impact-val">{fmt(i.impact)} Cr</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="biir-whatif-reco">
          <h4>Recommended response</h4>
          <p>{result.recommendation}</p>
        </div>
      </div>
    </div>
  );
}
