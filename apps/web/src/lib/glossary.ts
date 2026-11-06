export interface GlossaryTerm {
  term: string;
  meaning: string;
}

export const TERMS: GlossaryTerm[] = [
  { term: "SBU", meaning: "Strategic Business Unit — one business line or brand under NexaGroup." },
  { term: "MTD", meaning: "Month-to-date — from the 1st of this month through today." },
  { term: "MoM", meaning: "Month-over-month — this month vs the same point last month." },
  { term: "YoY", meaning: "Year-over-year — vs the same period one year ago." },
  { term: "FY YTD", meaning: "Financial year-to-date — since 1 July (FY 2026-27)." },
  { term: "CY YTD", meaning: "Calendar year-to-date — since 1 January." },
  { term: "DoD", meaning: "Day-over-day — today vs the previous reporting day." },
  { term: "Achievement %", meaning: "Actual vs target — 100% means on target." },
  { term: "Contribution", meaning: "This SBU's share of total month-to-date revenue." },
  { term: "Momentum", meaning: "Short-term trend signal: Strong, Positive, Neutral, Weak, or Negative." },
  { term: "Projected M/E", meaning: "Projected month-end revenue at the current run rate." },
  { term: "Run rate", meaning: "Current daily revenue pace, extrapolated across the month." },
  { term: "Cr / Crore", meaning: "1 Crore = 10 million BDT (Bangladeshi Taka)." },
  { term: "DWH", meaning: "Data warehouse — the internal source system this report is built from." },
];

const map = new Map(TERMS.map((t) => [t.term, t.meaning]));

export function termMeaning(term: string): string | undefined {
  return map.get(term);
}
