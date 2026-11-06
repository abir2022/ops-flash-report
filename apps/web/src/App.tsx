import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./lib/supabase";
import { fetchEmployeeProfile, fetchReportDates } from "./api/client";
import { FreshnessBadge } from "./components/FreshnessBadge";
import { Glossary } from "./components/Glossary";
import { DateSelector } from "./components/DateSelector";
import { KpiCards } from "./components/KpiCards";
import { DaySummary } from "./components/DaySummary";
import { PortfolioTrend } from "./components/PortfolioTrend";
import { MtdChart } from "./components/MtdChart";
import { MomentumChart } from "./components/MomentumChart";
import { Insights } from "./components/Insights";
import { ReconciliationCard } from "./components/ReconciliationCard";
import { Scorecard } from "./components/Scorecard";
import { TargetProgress } from "./components/TargetProgress";
import { Login } from "./components/Login";
import { AnalysisTab } from "./components/analysis/AnalysisTab";
import { AdvancedAnalysisTab } from "./components/advanced/AdvancedAnalysisTab";
import { BiirTab } from "./components/biir/BiirTab";
import { MarketingTab } from "./components/marketing/MarketingTab";
import { PartnerFeedTab } from "./components/partner/PartnerFeedTab";
import { EmployeeCampaignTab } from "./components/employee/EmployeeCampaignTab";
import { AdminPanel } from "./components/AdminPanel";
import { SurveyFormEditor } from "./components/admin/SurveyFormEditor";
import { ExportView, type EmployeeExportSbu, type ExportSection } from "./components/ExportView";
import { ExportDialog } from "./components/ExportDialog";
import { ThemeToggle } from "./components/ThemeToggle";
import { ArrowLeftIcon } from "./components/Icons";
import { UserMenu, type UserMenuItem, type UserRoleTone } from "./components/UserMenu";
import { resolveRole, signOutAll, type Role } from "./lib/auth";
import type { EmployeeProfile } from "./types";

type Tab =
  | "flash"
  | "analysis"
  | "marketing"
  | "partner_feed"
  | "advanced"
  | "biir"
  | "admin"
  | "survey"
  | "campaign";

type ExportScope = "admin" | "employee";

const FLASH_SECTIONS: { id: string; label: string }[] = [
  { id: "flash-summary", label: "Summary" },
  { id: "flash-kpis", label: "KPIs" },
  { id: "flash-trend", label: "Trend" },
  { id: "flash-charts", label: "MTD · Momentum" },
  { id: "flash-insights", label: "Insights" },
  { id: "flash-recon", label: "Reconciliation" },
  { id: "flash-targets", label: "Targets" },
  { id: "flash-scorecard", label: "Scorecard" },
];

function SectionNav() {
  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <nav className="section-nav" aria-label="Flash report sections">
      {FLASH_SECTIONS.map((s) => (
        <button key={s.id} type="button" onClick={() => jump(s.id)}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [email, setEmail] = useState("");
  const [tab, setTab] = useState<Tab>("flash");
  const [reportDate, setReportDate] = useState("");
  const [exportScope, setExportScope] = useState<ExportScope | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportSections, setExportSections] = useState<ExportSection[]>([]);

  const { data: dates } = useQuery({
    queryKey: ["report-dates"],
    queryFn: fetchReportDates,
    enabled: session === true,
  });
  const days = useMemo(() => dates ?? [], [dates]);
  const latest = days[0] ?? "";
  const date = reportDate || latest;

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      try {
        const r = await resolveRole();
        if (cancelled) return;
        setRole(r);
        if (r === "employee") {
          const p = await fetchEmployeeProfile();
          if (cancelled) return;
          setEmployee(p);
          setTab(p && p.can_view ? "advanced" : "campaign");
        } else {
          setTab("flash");
        }
      } catch {
        if (cancelled) return;
        setRole(null);
        setEmployee(null);
        void supabase.auth.signOut();
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        setSession(false);
        setRole(null);
        setEmployee(null);
        return;
      }
      setSession(true);
      setEmail(data.session.user.email ?? "");
      await loadRole();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!s) {
        setSession(false);
        setRole(null);
        setEmployee(null);
        setEmail("");
        setTab("flash");
        return;
      }
      setSession(true);
      setEmail(s.user.email ?? "");
      if (event === "SIGNED_IN") loadRole();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleExport = async (scope: ExportScope, sections?: ExportSection[]) => {
    if (exportScope) return;
    setExportScope(scope);
    setExportSections(sections ?? []);
    await new Promise((r) => setTimeout(r, 900));
    try {
      const { exportToPdf } = await import("./lib/exportPdf");
      if (scope === "admin") {
        await exportToPdf(
          `NexaGroup — Daily SBU Sales Flash Report · ${date}`,
          `ops-flash-${date}.pdf`
        );
      } else {
        await exportToPdf(
          `NexaGroup — SBU Snapshot · ${date}`,
          `ops-snapshot-${date}.pdf`
        );
      }
    } finally {
      setExportScope(null);
    }
  };

  if (session === null) {
    return <div className="loading-screen">Loading…</div>;
  }

  if (!session) {
    return <Login onSignedIn={() => setSession(true)} />;
  }

  if (role === null || (role === "employee" && employee === null)) {
    return <div className="loading-screen">Loading your access…</div>;
  }

  if (role === "employee") {
    return (
      <EmployeeView
        employee={employee as EmployeeProfile}
        email={email}
        date={date}
        days={days}
        tab={tab}
        setTab={setTab}
        setReportDate={setReportDate}
        exportScope={exportScope}
        onExport={() => handleExport("employee")}
        onSignOut={() => signOutAll()}
      />
    );
  }

  if (!date) {
    return <div className="loading-screen">Loading report dates…</div>;
  }

  const backToFlash = () => setTab("flash");

  return (
    <div className="app">
      <header>
        <div className="header-row">
          <div>
            <h1>NexaGroup — Daily SBU Sales Flash Report</h1>
            <p className="meta">
              Source: DWH GL 3010001–3010006 (Revenue sub-schedule, net of returns)
              · FY 2026-27 · 1 Crore (Cr) = 10 million BDT
            </p>
          </div>
          <div className="header-actions">
            <span className="chip chip-demo" title="Portfolio demo — every figure is synthetic">
              Synthetic demo data
            </span>
            <Glossary />
            <ThemeToggle />
            <FreshnessBadge />
            <UserMenu
              email={email}
              roleLabel="Admin"
              roleTone="admin"
              sbuCodes={[]}
              items={[
                { id: "admin", label: "Admin", onClick: () => setTab("admin") },
                { id: "survey", label: "ROMI Survey form", onClick: () => setTab("survey") },
                { id: "export", label: "Export PDF", onClick: () => setExportDialogOpen(true) },
                { id: "signout", label: "Sign out", onClick: () => signOutAll(), danger: true },
              ]}
            />
          </div>
        </div>
      </header>

      {tab === "admin" ? (
        <>
          <div className="section-back">
            <button className="btn-ghost" onClick={backToFlash}>
              <span className="btn-label">
                <ArrowLeftIcon size={16} />
                Back to report
              </span>
            </button>
          </div>
          <AdminPanel />
        </>
      ) : tab === "survey" ? (
        <SurveyFormEditor onDone={backToFlash} />
      ) : (
        <>
          <div className="control-bar">
            <DateSelector days={days} value={date} onChange={setReportDate} />
          </div>

          <nav className="tabs">
            <button
              className={tab === "flash" ? "tab active" : "tab"}
              onClick={() => setTab("flash")}
            >
              Flash Report
            </button>
            <button
              className={tab === "analysis" ? "tab active" : "tab"}
              onClick={() => setTab("analysis")}
            >
              Analysis
            </button>
            <button
              className={tab === "marketing" ? "tab active" : "tab"}
              onClick={() => setTab("marketing")}
            >
              Marketing
            </button>
            <button
              className={tab === "partner_feed" ? "tab active" : "tab"}
              onClick={() => setTab("partner_feed")}
            >
              Partner Feed
            </button>
            <button
              className={tab === "advanced" ? "tab active" : "tab"}
              onClick={() => setTab("advanced")}
            >
              Advanced Analysis
            </button>
            <button
              className={tab === "biir" ? "tab active" : "tab"}
              onClick={() => setTab("biir")}
            >
              Business Impact Radar
            </button>
          </nav>

          <div className="tab-panel animate-fade" key={tab}>
            {tab === "flash" ? (
              <>
                <SectionNav />
                <main>
                  <div className="flash-section" id="flash-summary">
                    <DaySummary reportDate={date} />
                  </div>
                  <div className="flash-section" id="flash-kpis">
                    <KpiCards reportDate={date} />
                  </div>
                  <div className="flash-section" id="flash-trend">
                    <PortfolioTrend reportDate={date} />
                  </div>
                  <div className="flash-section charts-row" id="flash-charts">
                    <MtdChart reportDate={date} />
                    <MomentumChart reportDate={date} />
                  </div>
                  <div className="flash-section" id="flash-insights">
                    <Insights reportDate={date} />
                  </div>
                  <div className="flash-section" id="flash-recon">
                    <ReconciliationCard reportDate={date} />
                  </div>
                  <div className="flash-section" id="flash-targets">
                    <TargetProgress reportDate={date} />
                  </div>
                  <div className="flash-section" id="flash-scorecard">
                    <Scorecard reportDate={date} />
                  </div>
                </main>
              </>
            ) : tab === "analysis" ? (
              <AnalysisTab reportDate={date} />
            ) : tab === "marketing" ? (
              <MarketingTab reportDate={date} />
            ) : tab === "partner_feed" ? (
              <PartnerFeedTab reportDate={date} />
            ) : tab === "biir" ? (
              <BiirTab reportDate={date} />
            ) : (
              <AdvancedAnalysisTab reportDate={date} />
            )}
          </div>
        </>
      )}

      <footer>
        <span>
          Methodology: <a href="#flash-recon">GL 3010001–3010006 revenue reconciliation</a> ·
          Ops Flash Report Engine v2 · Supabase Postgres · Cloudflare Pages
        </span>
        <span className="footer-credit">Built by Abir · synthetic portfolio demo</span>
      </footer>

      <ExportDialog
        open={exportDialogOpen}
        onExport={(sections) => {
          setExportDialogOpen(false);
          void handleExport("admin", sections);
        }}
        onClose={() => setExportDialogOpen(false)}
      />

      {exportScope && (
        <ExportView reportDate={date} scope={exportScope} sections={exportSections} />
      )}
    </div>
  );
}

function EmployeeView({
  employee,
  email,
  date,
  days,
  tab,
  setTab,
  setReportDate,
  exportScope,
  onExport,
  onSignOut,
}: {
  employee: EmployeeProfile;
  email: string;
  date: string;
  days: string[];
  tab: Tab;
  setTab: (t: Tab) => void;
  setReportDate: (d: string) => void;
  exportScope: ExportScope | null;
  onExport: () => void;
  onSignOut: () => void;
}) {
  const canView = employee.can_view;
  const canRomi = employee.can_romi;

  const roleLabel = canView && canRomi ? "View + ROMI" : canRomi ? "ROMI" : "View";
  const roleTone: UserRoleTone =
    canView && canRomi ? "both" : canRomi ? "romi" : "view";

  const items: UserMenuItem[] = [];
  if (canRomi) {
    items.push({ id: "survey", label: "ROMI Survey form", onClick: () => setTab("campaign") });
  }
  if (canView) {
    items.push({ id: "export", label: "Export", onClick: onExport });
  }
  items.push({ id: "signout", label: "Sign out", onClick: onSignOut, danger: true });

  if (!canView && !canRomi) {
    return (
      <div className="app">
        <header>
          <div className="header-row">
            <div>
              <h1>NexaGroup</h1>
              <p className="meta">No access assigned to this account.</p>
            </div>
            <div className="header-actions">
              <ThemeToggle />
              <UserMenu
                email={email}
                name={employee.name}
                roleLabel="No access"
                roleTone="view"
                sbuCodes={[]}
                items={items}
              />
            </div>
          </div>
        </header>
      </div>
    );
  }

  const employeeExportSbus: EmployeeExportSbu[] = employee.allowed_sbus.map((id, i) => ({
    sbu_id: id,
    code: employee.sbu_codes[i] ?? String(id),
  }));

  return (
    <div className="app">
      <header>
        <div className="header-row">
          <div>
            <h1>NexaGroup</h1>
            <p className="meta">
              {employee.name} · {roleLabel}
            </p>
          </div>
          <div className="header-actions">
            <span className="chip chip-demo" title="Portfolio demo — every figure is synthetic">
              Synthetic demo data
            </span>
            <ThemeToggle />
            <UserMenu
              email={email}
              name={employee.name}
              roleLabel={roleLabel}
              roleTone={roleTone}
              sbuCodes={employee.sbu_codes}
              items={items}
            />
          </div>
        </div>
      </header>

      {tab === "campaign" && canRomi ? (
        <>
          {canView && (
            <div className="section-back">
              <button className="btn-ghost" onClick={() => setTab("advanced")}>
                <span className="btn-label">
                  <ArrowLeftIcon size={16} />
                  Back to dashboard
                </span>
              </button>
            </div>
          )}
          <EmployeeCampaignTab />
        </>
      ) : canView ? (
        <>
          <div className="control-bar">
            <DateSelector days={days} value={date} onChange={setReportDate} />
          </div>

          <nav className="tabs">
            <button
              className={tab === "advanced" ? "tab active" : "tab"}
              onClick={() => setTab("advanced")}
            >
              Advanced Analysis
            </button>
            <button
              className={tab === "biir" ? "tab active" : "tab"}
              onClick={() => setTab("biir")}
            >
              Business Impact Radar
            </button>
          </nav>

          <div className="tab-panel animate-fade" key={tab}>
            {tab === "biir" ? (
              <BiirTab reportDate={date} />
            ) : (
              <AdvancedAnalysisTab reportDate={date} />
            )}
          </div>
        </>
      ) : null}

      <footer>
        <span>
          Methodology: revenue net of returns, GL 3010001–3010006 sub-schedule ·
          Ops Flash Report Engine v2 · Supabase Postgres
        </span>
        <span className="footer-credit">Built by Abir · synthetic portfolio demo</span>
      </footer>

      {exportScope === "employee" && (
        <ExportView reportDate={date} scope="employee" employeeSbus={employeeExportSbus} />
      )}
    </div>
  );
}
