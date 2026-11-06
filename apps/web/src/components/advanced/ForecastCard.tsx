import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchSbuHistory, fetchSbuTargets } from "../../api/client";
import {
  forecastFiscal,
  type DailyPoint,
  type MonthlyTarget,
} from "../../lib/advanced";
import { fmt, fmtPct } from "../../lib/format";
import { chartTheme, useTheme } from "../../lib/chartTheme";

const TARGET_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1kf-2lI17nMgHx2bXAvwwx9PWboZ09qFmKP7NCR5hX3A/edit";

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The forecast section is date-picker-independent: it reads 4 prior fiscal
// years of history (plus the current FY to date) and the full FY target plan.
function historyWindow(): { from: string; to: string } {
  const now = new Date();
  const nowMonth = now.getMonth() + 1;
  const nowYear = now.getFullYear();
  const fyStartYear = nowMonth >= 7 ? nowYear : nowYear - 1;
  return {
    from: `${fyStartYear - 4}-07-01`,
    to: iso(now),
  };
}

interface Row {
  label: string;
  actual: number;
  target: number;
  forecast: number;
}

export function ForecastCard({ sbuId, channel }: { sbuId: number; channel: string }) {
  const [showHow, setShowHow] = useState(false);
  const c = chartTheme(useTheme());

  const { from, to } = historyWindow();
  const { data: history } = useQuery({
    queryKey: ["forecast-history", sbuId, channel, from, to],
    queryFn: () => fetchSbuHistory(sbuId, channel, from, to),
  });
  const { data: targets } = useQuery({
    queryKey: ["sbu-targets", sbuId],
    queryFn: () => fetchSbuTargets(sbuId),
  });

  const points: DailyPoint[] = (history ?? []).map((d) => ({ d: d.d, value: d.value }));
  const monthlyTargets: MonthlyTarget[] = (targets ?? []).map((t) => ({
    period_month: t.period_month,
    value: t.mo_target_rev ?? 0,
  }));

  const result = useMemo(
    () => forecastFiscal(points, monthlyTargets),
    [history, targets],
  );

  const rows = useMemo<Row[]>(
    () =>
      result.months.map((m) => ({
        label: m.label,
        actual: m.actual,
        target: m.target,
        forecast: m.forecast,
      })),
    [result],
  );

  const next = result.nextMonth;
  const running = result.running;
  const prevMonth = result.previousMonth;
  const currentMonth = result.currentMonth;
  const achievementPct = result.achievement * 100;
  const calib = result.calibration;

  return (
    <div className="forecast-wrap">
      {(next || running || prevMonth || currentMonth) && (
        <div className="forecast-headline">
          {currentMonth && (
            <div>
              <span className="ac-hint">This month ({currentMonth.label})</span>
              <div className="forecast-big">
                {fmt(currentMonth.forecast)} <small>Cr</small>
              </div>
              <div className="forecast-sub">
                target {fmt(currentMonth.target)} Cr · sales {fmt(currentMonth.actual)} Cr
                {currentMonth.target > 0 && (
                  <span className="forecast-chip">
                    {fmtPct((currentMonth.forecast / currentMonth.target) * 100)}
                  </span>
                )}
              </div>
            </div>
          )}
          {next && (
            <div>
              <span className="ac-hint">Next month ({next.label})</span>
              <div className="forecast-big">
                {fmt(next.forecast)} <small>Cr</small>
              </div>
              <div className="forecast-sub">
                vs target {fmt(next.target)} Cr
                {next.target > 0 && (
                  <span className="forecast-chip">
                    {fmtPct((next.forecast / next.target) * 100)}
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="forecast-side">
            <span className="ac-hint">YTD achievement (completed months)</span>
            <div className="forecast-big">{fmtPct(achievementPct)}</div>
            <div className="forecast-sub">
              {fmt(result.ytdActual)} Cr vs {fmt(result.ytdTarget)} Cr target ·{" "}
              {result.basisMonths} of 12 FY months
            </div>
          </div>
          {prevMonth && (
            <div className="forecast-side">
              <span className="ac-hint">Previous month ({prevMonth.label})</span>
              <div className="forecast-big">
                {fmt(prevMonth.forecast)} <small>Cr</small>
              </div>
              <div className="forecast-sub">
                actual {fmt(prevMonth.actual)} Cr · error{" "}
                {prevMonth.error >= 0 ? "+" : ""}{fmt(prevMonth.error, 1)} Cr
                {prevMonth.errorPct != null && (
                  <span className="forecast-chip">
                    {prevMonth.errorPct >= 0 ? "+" : ""}{fmtPct(prevMonth.errorPct, 1)}
                  </span>
                )}
              </div>
            </div>
          )}
          {running && (
            <div className="forecast-side">
              <span className="ac-hint">{running.label} (running) projection</span>
              <div className="forecast-big">
                {fmt(running.projected)} <small>Cr</small>
              </div>
              <div className="forecast-sub">
                MTD {fmt(running.mtd)} Cr · {fmtPct(running.pacing * 100)} paced
                {running.target > 0 && (
                  <span className="forecast-chip">
                    {fmtPct(running.achievementPct ?? 0)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke={c.axis} tick={c.tick} />
            <YAxis
              stroke={c.axis}
              tick={c.tick}
              label={{ value: "Cr", angle: -90, position: "insideLeft", fill: c.axis, fontSize: 11, offset: 8 }}
            />
            <Tooltip
              contentStyle={c.tooltipStyle}
              labelStyle={c.labelStyle}
              itemStyle={c.itemStyle}
              formatter={(v: number, name: string) => [fmt(v), `${name} (Cr)`]}
            />
            <Bar dataKey="forecast" name="Forecast" fill="#60A5FA" fillOpacity={0.55} radius={[3, 3, 0, 0]}>
              <LabelList dataKey="forecast" position="top" fill={c.barLabel} fontSize={10} formatter={(v: number) => (v ? fmt(v, 0) : "")} />
            </Bar>
            <Bar dataKey="actual" name="Actual" fill="#3B82F6" radius={[3, 3, 0, 0]}>
              <LabelList dataKey="actual" position="top" fill={c.barLabel} fontSize={10} formatter={(v: number) => (v ? fmt(v, 0) : "")} />
            </Bar>
            <Line type="monotone" dataKey="target" name="Target" stroke="#D97706" strokeWidth={2} dot={false} />
            <ReferenceLine y={0} stroke={c.axis} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="forecast-legend">
        <span><i className="lg lg-actual" /> Actual</span>
        <span><i className="lg lg-target" /> Target</span>
        <span><i className="lg lg-forecast" /> Forecast</span>
      </div>

      {calib && (
        <div className="forecast-accuracy">
          <span className="ac-hint">Model accuracy (trailing closed months)</span>
          <span className="forecast-chip">
            MAPE {fmtPct(calib.mape, 1)}
          </span>
          {calib.bias != null && (
            <span className="forecast-chip">
              {calib.bias >= 0 ? "+" : ""}{fmt(calib.bias, 1)} Cr bias
            </span>
          )}
          <span className="ac-hint">
            Calibration · pacing ×{calib.factorPacing.toFixed(2)} · seasonal ×
            {calib.factorSeasonal.toFixed(2)} · samples {calib.samplesPacing}/{calib.samplesSeasonal}
          </span>
        </div>
      )}

      <div className="forecast-help">
        <button className="btn-ghost" onClick={() => setShowHow((s) => !s)}>
          {showHow ? "Hide" : "?"} How is this calculated
        </button>
        {showHow && (
          <div className="forecast-how">
            <p><strong>F(m) = target(m) × A × S(m) × C<sub>s</sub></strong></p>
            <ul>
              <li><strong>target(m)</strong> — the full-year monthly target from the FY26-27 tracker.</li>
              <li>
                <strong>A</strong> — YTD achievement = Σ actual ÷ Σ target over completed FY
                months (Sep is in-progress, so only Jul–Aug count here).
              </li>
              <li>
                <strong>S(m)</strong> — month-of-year seasonal index from the previous{" "}
                {result.seasonalBasisYears} fiscal years. Each year's monthly share of its own
                total is averaged, so 100 = an average month and growth is stripped out.
              </li>
              <li>
                <strong>C<sub>s</sub></strong> — seasonal calibration factor learned from closed
                months (stays ×1.00 until at least 3 months close).
              </li>
            </ul>

            {next && (
              <p><strong>Worked example — next month ({next.label})</strong></p>
            )}
            {next && (
              <ul>
                <li>target = {fmt(next.target, 1)} Cr</li>
                <li>
                  A = {fmt(result.ytdActual, 1)} ÷ {fmt(result.ytdTarget, 1)} ={" "}
                  {(achievementPct / 100).toFixed(4)}
                </li>
                <li>S = {next.seasonalIndex.toFixed(1)} ÷ 100 = {(next.seasonalIndex / 100).toFixed(4)}</li>
                <li>
                  C<sub>s</sub> = {calib.factorSeasonal.toFixed(3)} (only {result.basisMonths} of 12
                  FY months have closed; needs ≥3 to move)
                </li>
                <li>
                  → {fmt(next.target, 1)} × {(achievementPct / 100).toFixed(4)} ×{" "}
                  {(next.seasonalIndex / 100).toFixed(4)} × {calib.factorSeasonal.toFixed(3)} ={" "}
                  <strong>{fmt(next.forecast, 1)} Cr</strong>
                </li>
              </ul>
            )}

            {result.seasonalDetail && next && (
              <>
                <p><strong>How S is computed</strong> — {next.label}'s share of each prior FY:</p>
                <ul>
                  {result.seasonalDetail.shares.map((sh) => (
                    <li key={sh.fyLabel}>
                      {sh.fyLabel}: {fmt(sh.monthValue, 1)} ÷ {fmt(sh.yearTotal, 1)} ={" "}
                      {fmtPct(sh.share * 100, 2)}
                    </li>
                  ))}
                  <li>
                    Average share = {fmtPct(result.seasonalDetail.avgShare * 100, 2)} (
                    {result.seasonalDetail.avgShare.toFixed(4)}) → S ={" "}
                    {result.seasonalDetail.avgShare.toFixed(4)} × 12 × 100 ={" "}
                    {result.seasonalDetail.index.toFixed(1)} → multiplier ={" "}
                    {result.seasonalDetail.index.toFixed(1)} ÷ 100 ={" "}
                    {(result.seasonalDetail.index / 100).toFixed(4)}
                  </li>
                </ul>
              </>
            )}

            {running && (
              <p>
                <strong>Current month ({running.label}):</strong> MTD ÷ pacing × C<sub>p</sub> ={" "}
                {fmt(running.mtd, 1)} ÷ {fmtPct(running.pacing * 100, 1)} ×{" "}
                {calib.factorPacing.toFixed(3)} = <strong>{fmt(running.projected, 1)} Cr</strong>.
              </p>
            )}

            <p className="ac-hint">
              <strong>Continuous learning:</strong> when a month closes, its realised revenue is
              compared to the projection and a per-SBU bias factor is learned for each engine —
              pacing (C<sub>p</sub> = {calib.factorPacing.toFixed(2)}) and seasonal (C
              <sub>s</sub> = {calib.factorSeasonal.toFixed(2)}). Factors are clamped to 0.80–1.25
              and require at least 3 closed samples, so they correct gradually rather than chasing
              one noisy month. Model accuracy: MAPE {fmtPct(calib.mape, 1)}.
            </p>
            <p className="ac-hint">
              Target source:{" "}
              <a href={TARGET_SHEET_URL} target="_blank" rel="noreferrer">
                SBU_Performance_Tracker → Target_Input
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
