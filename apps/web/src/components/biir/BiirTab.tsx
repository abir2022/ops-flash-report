import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBiirSignals, fetchKpi, fetchScorecard } from "../../api/client";
import {
  buildImpactMap,
  computeSbuRisks,
  defaultSignals,
  detectOpportunities,
  generateExecutiveSummary,
  mapSignals,
  type ExternalSignal,
} from "../../lib/biir";
import { InternalOverview, SignalCards } from "./BiirSignals";
import { RiskHeatmap } from "./BiirHeatmap";
import { ImpactMatrix } from "./BiirImpactMatrix";
import { ExecutivePanel } from "./BiirExecutive";
import { WhatIfSimulator } from "./BiirWhatIf";
import { FactorCostRadar, SbuActionPlans } from "./BiirFactorPlans";

export function BiirTab({ reportDate }: { reportDate: string }) {
  const scorecard = useQuery({
    queryKey: ["scorecard", reportDate],
    queryFn: () => fetchScorecard(reportDate),
  });
  const kpi = useQuery({
    queryKey: ["kpi", reportDate],
    queryFn: () => fetchKpi(reportDate),
  });
  const signals = useQuery({
    queryKey: ["biir-signals"],
    queryFn: async (): Promise<{ signals: ExternalSignal[]; fromDb: boolean }> => {
      try {
        const rows = await fetchBiirSignals();
        if (rows.length > 0) return { signals: mapSignals(rows), fromDb: true };
        return { signals: defaultSignals(), fromDb: false };
      } catch {
        return { signals: defaultSignals(), fromDb: false };
      }
    },
    staleTime: 60_000,
  });

  const rows = scorecard.data ?? [];
  const sigs = signals.data?.signals ?? defaultSignals();
  const fromDb = signals.data?.fromDb ?? false;
  const k = kpi.data;

  const risks = useMemo(() => computeSbuRisks(rows), [rows]);
  const impacts = useMemo(() => buildImpactMap(rows, sigs), [rows, sigs]);
  const opportunities = useMemo(() => detectOpportunities(rows), [rows]);
  const summary = useMemo(
    () => generateExecutiveSummary(risks, impacts, opportunities, k ?? null),
    [risks, impacts, opportunities, k],
  );

  const critical = risks.filter((r) => r.riskClass === "Critical").length;
  const medium = risks.filter((r) => r.riskClass === "Medium").length;
  const topOpp = opportunities[0]?.code ?? null;

  const loading = scorecard.isLoading || signals.isLoading;

  return (
    <div className="biir-tab">
      <div className="biir-hero">
        <div>
          <h2>Business Impact Intelligence Radar (BIIR)</h2>
          <p className="biir-hero-sub">
            AI-powered early warning system for business risks, opportunities and performance impact
          </p>
        </div>
        <div className="biir-hero-meta">
          <span className="badge badge-ok">Internal data: live (T-1)</span>
          <span className="badge badge-stall">External signals: {fromDb ? "live" : "baseline"}</span>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="loading-screen">Loading intelligence…</div>
      ) : (
        <>
          <ExecutivePanel summary={summary} opportunities={opportunities} />

          <InternalOverview
            kpi={k}
            criticalCount={critical}
            mediumCount={medium}
            topOpportunity={topOpp}
          />

          <SignalCards signals={sigs} fromDb={fromDb} />

          <div className="charts-row">
            <RiskHeatmap impacts={impacts} />
          </div>

          <ImpactMatrix impacts={impacts} />

          <FactorCostRadar />

          <SbuActionPlans />

          <WhatIfSimulator rows={rows} />
        </>
      )}
    </div>
  );
}
