import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSbuDaily, fetchSbus, fetchSkuSales } from "../../api/client";
import type { DailyPoint, SkuItem } from "../../lib/advanced";
import type { SbuDim } from "../../types";
import { MODULE_LABEL, profileFor, type AdvancedModule } from "./analysisConfig";
import { SkuAbcCard, TrendCard, WeekdayCard } from "./AdvancedCards";
import { ForecastCard } from "./ForecastCard";
import { DecisionPointsCard } from "./DecisionPointsCard";

interface Sel {
  sbu_id: number;
  channel: string;
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 12);
  return { from: iso(from), to: iso(to) };
}

function offsetMonths(n: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - n);
  return { from: iso(from), to: iso(to) };
}

function priorRange(r: { from: string; to: string }): { from: string; to: string } {
  const f = new Date(`${r.from}T00:00:00`);
  const t = new Date(`${r.to}T00:00:00`);
  const spanDays = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const priorTo = new Date(f);
  priorTo.setDate(priorTo.getDate() - 1);
  const priorFrom = new Date(priorTo);
  priorFrom.setDate(priorFrom.getDate() - spanDays + 1);
  return { from: iso(priorFrom), to: iso(priorTo) };
}

const PRESETS: { label: string; months: number }[] = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
  { label: "24M", months: 24 },
];

function buildOptions(sbus: SbuDim[]): { key: string; label: string; sel: Sel }[] {
  return (sbus ?? []).map((s) => ({
    key: String(s.id),
    label: s.name ?? s.code,
    sel: { sbu_id: s.id, channel: "default" },
  }));
}

export function AdvancedAnalysisTab({
  export: isExport = false,
  exportSbu = { sbu_id: 58, channel: "default" },
  reportDate = "",
}: {
  export?: boolean;
  exportSbu?: Sel;
  reportDate?: string;
}) {
  const { data: sbus } = useQuery({ queryKey: ["sbus"], queryFn: fetchSbus });
  const [range, setRange] = useState(defaultRange);
  const [selected, setSelected] = useState<Sel>(() =>
    isExport ? exportSbu : { sbu_id: 58, channel: "default" }
  );

  const options = useMemo(() => buildOptions(sbus ?? []), [sbus]);
  const active = isExport ? exportSbu : selected;

  // Guests are RLS-scoped to a subset of SBUs; the hardcoded default (NXCM)
  // may not be among them. If the current selection is not in the allowed
  // list, snap to the first available SBU so the tab is never blank.
  useEffect(() => {
    if (isExport || options.length === 0) return;
    if (!options.some((o) => o.sel.sbu_id === selected.sbu_id)) {
      setSelected(options[0].sel);
    }
  }, [isExport, options, selected.sbu_id]);

  const { data: daily } = useQuery({
    queryKey: ["sbu-daily", active.sbu_id, active.channel, range.from, range.to],
    queryFn: () => fetchSbuDaily(active.sbu_id, active.channel, range.from, range.to),
  });
  const { data: skus } = useQuery({
    queryKey: ["sku-sales", active.sbu_id, active.channel, range.from, range.to],
    queryFn: () => fetchSkuSales(active.sbu_id, active.channel, range.from, range.to),
  });
  const { data: priorSkus } = useQuery({
    queryKey: ["sku-sales-prior", active.sbu_id, active.channel, range.from, range.to],
    queryFn: () => {
      const pr = priorRange(range);
      return fetchSkuSales(active.sbu_id, active.channel, pr.from, pr.to);
    },
  });

  const points: DailyPoint[] = (daily ?? []).map((d) => ({ d: d.d, value: d.value }));
  const items: SkuItem[] = (skus ?? []).map((s) => ({
    item_id: s.item_id,
    name: s.item_name ?? s.item_code ?? String(s.item_id),
    value: s.value || 0,
    quantity: s.quantity ?? 0,
    uom: s.uom,
    category: s.category_name,
  }));
  const priorMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of priorSkus ?? []) m.set(s.item_id, s.value || 0);
    return m;
  }, [priorSkus]);

  const sbuDim = (sbus ?? []).find((s) => s.id === active.sbu_id);
  const modules: AdvancedModule[] = isExport
    ? ["trend", "weekday", "forecast", "sku"]
    : profileFor(sbuDim?.section ?? null);

  const onOption = (key: string) => {
    const o = options.find((x) => x.key === key);
    if (o) setSelected(o.sel);
  };

  const title = sbuDim?.name ?? `SBU ${active.sbu_id}`;

  return (
    <div className="advanced-tab">
      {!isExport && (
        <div className="advanced-controls">
          <label>
            Business
            <select
              value={String(active.sbu_id)}
              onChange={(e) => onOption(e.target.value)}
            >
              {options.length === 0 && <option value="">Loading…</option>}
              {options.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>

          <div className="advanced-range">
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
            <span>→</span>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
            {PRESETS.map((p) => (
              <button key={p.label} className="btn-ghost" onClick={() => setRange(offsetMonths(p.months))}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="advanced-grid">
        {modules.includes("trend") && (
          <div className="chart-box">
            <div className="analysis-head">
              <h3>{MODULE_LABEL.trend}</h3>
              <span className="ac-hint">{title}</span>
            </div>
            <TrendCard points={points} />
          </div>
        )}

        {modules.includes("weekday") && (
          <div className="chart-box">
            <div className="analysis-head">
              <h3>{MODULE_LABEL.weekday}</h3>
            </div>
            <WeekdayCard points={points} />
          </div>
        )}
      </div>

      {modules.includes("forecast") && (
        <div className="chart-box advanced-full">
          <div className="analysis-head">
            <h3>{MODULE_LABEL.forecast}</h3>
            <span className="ac-hint">{title}</span>
          </div>
          <ForecastCard sbuId={active.sbu_id} channel={active.channel} />
        </div>
      )}

      {modules.includes("sku") && (
        <div className="chart-box advanced-full">
          <div className="analysis-head">
            <h3>{MODULE_LABEL.sku}</h3>
            <span className="ac-hint">{title}</span>
          </div>
          <SkuAbcCard items={items} prior={priorMap} />
        </div>
      )}

      {reportDate && (
        <div className="chart-box advanced-full">
          <DecisionPointsCard
            sbuId={active.sbu_id}
            channel={active.channel}
            reportDate={reportDate}
            items={items}
            prior={priorMap}
          />
        </div>
      )}
    </div>
  );
}
