// Config-driven mapping of SBU "nature" -> enabled Advanced Analysis modules.
// The SBU selector lists active SBUs; this decides which widgets render.

export type AdvancedModule = "trend" | "weekday" | "forecast" | "sku";

// Sections where SKU-level (item) analysis is meaningful. Freight/Logistics
// and IT/service SBUs have no physical SKU to analyse, so they only get the
// time-based modules (trend / weekday / forecast).
const SKU_SECTIONS = new Set([
  "Building Material",
  "Building Solution",
  "Food",
  "Packaging",
  "Trading",
]);

export function profileFor(section: string | null): AdvancedModule[] {
  const base: AdvancedModule[] = ["trend", "weekday", "forecast"];
  if (section && SKU_SECTIONS.has(section)) return [...base, "sku"];
  return base;
}

export const MODULE_LABEL: Record<AdvancedModule, string> = {
  trend: "Revenue trend",
  weekday: "Weekday seasonality",
  forecast: "FY forecast vs target",
  sku: "SKU ABC / Pareto",
};
