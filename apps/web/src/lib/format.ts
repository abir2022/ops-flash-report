// Number/formatting helpers. Defensively coerce PostgREST numeric values
// (which may arrive as strings) so the UI never renders NaN.

export function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

export function fmt(
  v: number | string | null | undefined,
  decimals = 2
): string {
  const n = num(v);
  if (n === null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function fmtPct(v: number | string | null | undefined, decimals = 1): string {
  const n = num(v);
  if (n === null) return "—";
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })}%`;
}

export type Momentum = "Strong +" | "Positive" | "Neutral" | "Weak" | "Negative" | "N/A";

export type Verdict = "good" | "watch" | "risk" | "neutral";

export interface VerdictResult {
  cls: Verdict;
  label: string;
}

// Plain-language verdict for an achievement percentage. "On target", "Close",
// "Behind" — with a sign so color-blind viewers still get the signal.
export function achVerdict(pct: number | string | null | undefined): VerdictResult {
  const n = num(pct);
  if (n === null) return { cls: "neutral", label: "No target set" };
  if (n >= 100) return { cls: "good", label: "On target" };
  if (n >= 85) return { cls: "watch", label: "Close" };
  return { cls: "risk", label: "Behind" };
}

// Plain-language verdict for month-over-month momentum.
export function momVerdict(pct: number | string | null | undefined): VerdictResult {
  const n = num(pct);
  if (n === null) return { cls: "neutral", label: "Flat" };
  if (n > 0) return { cls: "good", label: "Up" };
  if (n < 0) return { cls: "risk", label: "Down" };
  return { cls: "neutral", label: "Flat" };
}

export function momentumCls(momentum: string | null | undefined): string {
  switch (momentum) {
    case "Strong +":
    case "Positive":
      return "mom-up";
    case "Neutral":
      return "mom-neu";
    case "Weak":
    case "Negative":
      return "mom-down";
    default:
      return "mom-neu";
  }
}
