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

// Shared recharts colors so charts stay legible in dark and light themes.
export function chartTheme(theme: Theme) {
  const dark = theme === "dark";
  return {
    axis: dark ? "#94a3b8" : "#64748b",
    grid: dark ? "#334155" : "#e2e8f0",
    tick: { fill: dark ? "#94a3b8" : "#64748b", fontSize: 11 },
    tickStrong: { fill: dark ? "#cbd5e1" : "#1e293b", fontSize: 11 },
    barLabel: dark ? "#cbd5e1" : "#475569",
    tooltipStyle: {
      background: dark ? "#0f172a" : "#ffffff",
      border: `1px solid ${dark ? "#38bdf8" : "#cbd5e1"}`,
      borderRadius: 8,
    },
    labelStyle: { color: dark ? "#e2e8f0" : "#0f172a" },
    itemStyle: { color: dark ? "#e2e8f0" : "#0f172a" },
  };
}
