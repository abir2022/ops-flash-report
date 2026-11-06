import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSbuHistory, fetchSbuTargets } from "../api/client";
import {
  forecastFiscal,
  type DailyPoint,
  type ForecastResult,
  type MonthlyTarget,
} from "../lib/advanced";

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The forecast is date-picker-independent: 4 prior fiscal years of history
// (plus the current FY to date) and the full FY target plan.
function historyWindow(): { from: string; to: string } {
  const now = new Date();
  const nowMonth = now.getMonth() + 1;
  const nowYear = now.getFullYear();
  const fyStartYear = nowMonth >= 7 ? nowYear : nowYear - 1;
  return { from: `${fyStartYear - 4}-07-01`, to: iso(now) };
}

// Shared forecast hook. Query keys match the ForecastCard's inline queries, so
// React Query serves both from the same cache (no double network cost).
export function useForecast(sbuId: number, channel: string): ForecastResult | null {
  const { from, to } = historyWindow();
  const { data: history } = useQuery({
    queryKey: ["forecast-history", sbuId, channel, from, to],
    queryFn: () => fetchSbuHistory(sbuId, channel, from, to),
  });
  const { data: targets } = useQuery({
    queryKey: ["sbu-targets", sbuId],
    queryFn: () => fetchSbuTargets(sbuId),
  });

  return useMemo<ForecastResult | null>(() => {
    if (!history || !targets) return null;
    const points: DailyPoint[] = history.map((d) => ({ d: d.d, value: d.value }));
    const monthlyTargets: MonthlyTarget[] = targets.map((t) => ({
      period_month: t.period_month,
      value: t.mo_target_rev ?? 0,
    }));
    return forecastFiscal(points, monthlyTargets);
  }, [history, targets]);
}
