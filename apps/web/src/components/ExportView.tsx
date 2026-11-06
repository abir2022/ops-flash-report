import { ExportModeContext } from "../lib/exportMode";
import { DaySummary } from "./DaySummary";
import { KpiCards } from "./KpiCards";
import { PortfolioTrend } from "./PortfolioTrend";
import { MtdChart } from "./MtdChart";
import { MomentumChart } from "./MomentumChart";
import { Insights } from "./Insights";
import { ReconciliationCard } from "./ReconciliationCard";
import { TargetProgress } from "./TargetProgress";
import { Scorecard } from "./Scorecard";
import { AnalysisTab } from "./analysis/AnalysisTab";
import { AdvancedAnalysisTab } from "./advanced/AdvancedAnalysisTab";
import { MarketingTab } from "./marketing/MarketingTab";
import { BiirTab } from "./biir/BiirTab";

export interface EmployeeExportSbu {
  sbu_id: number;
  code: string;
}

export type ExportSection = "flash" | "analysis" | "marketing" | "advanced" | "biir";

export const EXPORT_SECTIONS: { id: ExportSection; label: string }[] = [
  { id: "flash", label: "Flash Report" },
  { id: "analysis", label: "Analysis" },
  { id: "marketing", label: "Marketing" },
  { id: "advanced", label: "Advanced Analysis" },
  { id: "biir", label: "Business Impact Radar" },
];

interface ExportViewProps {
  reportDate: string;
  scope: "admin" | "employee";
  sections?: ExportSection[];
  employeeSbus?: EmployeeExportSbu[];
}

export function ExportView({ reportDate, scope, sections, employeeSbus = [] }: ExportViewProps) {
  if (scope === "employee") {
    return (
      <ExportModeContext.Provider value={true}>
        <div className="export-root">
          {employeeSbus.map((s) => (
            <div key={s.sbu_id} data-export-block data-export-keep>
              <h2 className="export-section">Advanced Analysis — SBU {s.code}</h2>
              <AdvancedAnalysisTab
                export
                exportSbu={{ sbu_id: s.sbu_id, channel: "default" }}
                reportDate={reportDate}
              />
            </div>
          ))}
          <div data-export-block data-export-keep>
            <h2 className="export-section">Business Impact Radar (BIIR)</h2>
            <BiirTab reportDate={reportDate} />
          </div>
        </div>
      </ExportModeContext.Provider>
    );
  }

  const selected =
    sections && sections.length > 0 ? sections : EXPORT_SECTIONS.map((s) => s.id);
  const show = (s: ExportSection) => selected.includes(s);

  return (
    <ExportModeContext.Provider value={true}>
      <div className="export-root">
        {show("flash") && (
          <>
            <div data-export-block>
              <h2 className="export-section">Executive Summary</h2>
              <DaySummary reportDate={reportDate} />
              <div className="export-gap" />
              <KpiCards reportDate={reportDate} />
            </div>

            <div data-export-block>
              <h2 className="export-section">Daily Revenue Trend</h2>
              <PortfolioTrend reportDate={reportDate} />
            </div>

            <div data-export-block data-export-keep>
              <h2 className="export-section">MTD Revenue &amp; Momentum</h2>
              <div className="charts-row">
                <MtdChart reportDate={reportDate} />
                <MomentumChart reportDate={reportDate} />
              </div>
            </div>

            <div className="export-stack" data-export-block data-export-keep>
              <h2 className="export-section">SBU Highlights &amp; Risk Flags</h2>
              <Insights reportDate={reportDate} />
            </div>

            <div data-export-block data-export-keep>
              <h2 className="export-section">Revenue Reconciliation — MTD</h2>
              <ReconciliationCard reportDate={reportDate} export />
            </div>

            <div data-export-block data-export-keep>
              <TargetProgress reportDate={reportDate} />
            </div>

            <Scorecard reportDate={reportDate} export />
          </>
        )}

        {show("analysis") && <AnalysisTab reportDate={reportDate} export />}

        {show("marketing") && <MarketingTab reportDate={reportDate} export />}

        {show("advanced") && (
          <div data-export-block data-export-keep>
            <h2 className="export-section">Advanced Analysis — SBU Snapshot</h2>
            <AdvancedAnalysisTab
              export
              exportSbu={{ sbu_id: 58, channel: "default" }}
              reportDate={reportDate}
            />
          </div>
        )}

        {show("biir") && (
          <div data-export-block data-export-keep>
            <h2 className="export-section">Business Impact Radar (BIIR)</h2>
            <BiirTab reportDate={reportDate} />
          </div>
        )}
      </div>
    </ExportModeContext.Provider>
  );
}
