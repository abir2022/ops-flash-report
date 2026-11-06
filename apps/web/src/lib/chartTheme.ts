import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

// Theme is applied as a `data-theme` attribute on <html> by ThemeToggle. Read
// it reactively so charts re-render (and stay legible) in both themes.
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "light"
      ? "light"
      : "dark"
  );

  useEffect(() => {
    const el = document.documentElement;
    const sync = () =>
      setTheme(el.getAttribute("data-theme") === "light" ? "light" : "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

// Spec chart palette (DESIGN-SPEC.md) — exactly these hues, in this order.
// Blue + amber system; no violet. Slot 4 is the near-white series ink, used
// only in dark mode (light mode swaps it for the dark ink so series stay legible).
const SERIES_DARK = [
  "#3B82F6", // brand blue
  "#D97706", // amber 600
  "#10B981", // ok green
  "#F8FAFC", // series ink (80% alpha applied by callers when used as fill)
  "#60A5FA", // blue 400
  "#FBBF24", // amber 400
  "#34D399", // emerald 400
  "#94A3B8", // slate 400
];

const SERIES_LIGHT = [
  "#2563EB",
  "#B45309",
  "#047857",
  "#334155",
  "#3B82F6",
  "#D97706",
  "#059669",
  "#64748B",
];

// Shared recharts colors so charts stay legible in dark and light themes.
export function chartTheme(theme: Theme) {
  const dark = theme === "dark";
  return {
    // categorical series colours, in spec order
    series: dark ? SERIES_DARK : SERIES_LIGHT,
    seriesAt: (i: number) => (dark ? SERIES_DARK : SERIES_LIGHT)[i % 8],
    fontFamily: "'Fira Sans', system-ui, sans-serif",
    fontHead: "'Fira Code', ui-monospace, monospace",
    axis: dark ? "#94A3B8" : "#475569",
    // spec gridlines: rgba(148,163,184,.15)
    grid: dark ? "rgba(148,163,184,0.15)" : "rgba(71,85,105,0.16)",
    tick: { fill: dark ? "#94A3B8" : "#475569", fontSize: 11, fontFamily: "'Fira Sans', system-ui, sans-serif" },
    tickStrong: { fill: dark ? "#CBD5E1" : "#1E293B", fontSize: 11, fontFamily: "'Fira Code', ui-monospace, monospace" },
    barLabel: dark ? "#CBD5E1" : "#334155",
    tooltipStyle: {
      background: dark ? "#0B1220" : "#FFFFFF",
      border: `1px solid ${dark ? "#3B82F6" : "#CBD5E1"}`,
      borderRadius: 8,
      fontSize: 13,
      fontFamily: "'Fira Sans', system-ui, sans-serif",
    },
    labelStyle: { color: dark ? "#F8FAFC" : "#0F172A" },
    itemStyle: { color: dark ? "#E2E8F0" : "#1E293B" },
  };
}
