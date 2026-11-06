import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  monthlySeries,
  paretoConcentration,
  paretoConcentrationVol,
  skuAbc,
  skuAbcVol,
  skuBcg,
  skuByCategory,
  skuUnitPrice,
  weekdayIndex,
  type BcgMatrix,
  type BcgQuadrant,
  type BcgRow,
  type DailyPoint,
  type SkuAbcRow,
  type SkuCategoryRow,
  type SkuItem,
  type SkuItemVol,
} from "../../lib/advanced";
import { fmt, fmtPct } from "../../lib/format";
import { chartTheme, useTheme } from "../../lib/chartTheme";
import { BdDivisionMap } from "./BdDivisionMap";

function Empty({ note }: { note: string }) {
  return <div className="no-data">{note}</div>;
}

// ---------------------------------------------------------------------------
// Revenue trend — chronological monthly totals.
// ---------------------------------------------------------------------------
export function TrendCard({ points }: { points: DailyPoint[] }) {
  const c = chartTheme(useTheme());
  const series = monthlySeries(points);
  if (series.length === 0) return <Empty note="No revenue data in this range." />;
  return (
    <div className="chart-canvas">
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={series} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" stroke={c.axis} tick={c.tick} minTickGap={18} />
          <YAxis
            stroke={c.axis}
            tick={c.tick}
            label={{ value: "Cr", angle: -90, position: "insideLeft", fill: c.axis, fontSize: 11, offset: 8 }}
          />
          <Tooltip
            contentStyle={c.tooltipStyle}
            labelStyle={c.labelStyle}
            itemStyle={c.itemStyle}
            formatter={(v: number) => [fmt(v), "Cr"]}
          />
          <Bar dataKey="value" fill="#38bdf8" radius={[3, 3, 0, 0]}>
            <LabelList dataKey="value" position="top" fill={c.barLabel} fontSize={10} formatter={(v: number) => fmt(v, 0)} />
          </Bar>
          <Line type="monotone" dataKey="value" stroke="#fbbf24" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekday seasonality — indexed so 100 = an average day.
// ---------------------------------------------------------------------------
export function WeekdayCard({ points }: { points: DailyPoint[] }) {
  const c = chartTheme(useTheme());
  const rows = weekdayIndex(points);
  const data = rows.map((r) => ({ ...r, fill: r.index >= 100 ? "#4ade80" : "#f87171" }));
  return (
    <div className="chart-canvas">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" stroke={c.axis} tick={c.tick} />
          <YAxis stroke={c.axis} tick={c.tick} />
          <ReferenceLine y={100} stroke={c.axis} strokeDasharray="4 4" />
          <Tooltip
            contentStyle={c.tooltipStyle}
            labelStyle={c.labelStyle}
            itemStyle={c.itemStyle}
            formatter={(v: number) => [v.toFixed(0), "Index"]}
          />
          <Bar dataKey="index" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.dow} fill={d.fill} />
            ))}
            <LabelList dataKey="index" position="top" fill={c.barLabel} fontSize={10} formatter={(v: number) => (v ? v.toFixed(0) : "")} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="ac-hint">100 = an average day. Bars above the line over-perform.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SKU ABC / Pareto — concentration table + cumulative curve.
// ---------------------------------------------------------------------------
const CLS_COLOR: Record<string, string> = { A: "#4ade80", B: "#fbbf24", C: "#f87171" };

const BCG_COLOR: Record<BcgQuadrant, string> = {
  Star: "#4ade80",
  "Question Mark": "#fbbf24",
  "Cash Cow": "#38bdf8",
  Dog: "#f87171",
};

function BcgPanel({ matrix }: { matrix: BcgMatrix }) {
  const c = chartTheme(useTheme());
  if (matrix.rows.length === 0) return <Empty note="No SKU revenue in this range." />;
  if (matrix.rows.length < 2) {
    return <Empty note="The Growth-Share Matrix needs at least 2 SKUs with revenue." />;
  }

  const rawMin = Math.min(...matrix.rows.map((r) => r.relativeShare));
  const xMin = rawMin >= 1 ? 0.1 : Math.max(0.001, rawMin);
  const data = matrix.rows.map((r) => ({
    ...r,
    x: r.relativeShare,
    y: r.growthPlot,
    color: BCG_COLOR[r.quadrant],
  }));

  return (
    <div className="bcg-panel">
      <div className="bcg-head">
        <span className="bcg-title">BCG Growth-Share Matrix</span>
        {!matrix.hasPriorData && <span className="ac-hint">no prior period — growth shown as flat</span>}
      </div>
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 12, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="Relative share"
              domain={[xMin, 1]}
              scale="log"
              reversed
              stroke={c.axis}
              tick={c.tick}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              label={{ value: "← Relative share (leader)", position: "insideBottom", fill: c.axis, fontSize: 11, offset: 2 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Growth %"
              domain={[-100, 100]}
              stroke={c.axis}
              tick={c.tick}
              tickFormatter={(v: number) => `${v}%`}
              label={{ value: "Growth %", angle: -90, position: "insideLeft", fill: c.axis, fontSize: 11, offset: 8 }}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const p = payload[0].payload as BcgRow;
                return (
                  <div className="bcg-tooltip">
                    <div className="bcg-tooltip-name">{p.name}</div>
                    <div>Value: {fmt(p.value)}</div>
                    <div>Share: {fmtPct(p.share)}</div>
                    <div>Rel. share: {p.relativeShare.toFixed(3)}×</div>
                    <div>Growth: {p.growth === null ? "New" : `${fmt(p.growth, 1)}%`}</div>
                    <div style={{ color: BCG_COLOR[p.quadrant], fontWeight: 700 }}>{p.quadrant}</div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke={c.axis} strokeDasharray="4 4" />
            <ReferenceLine x={matrix.shareThreshold} stroke={c.axis} strokeDasharray="4 4" />
            <Scatter data={data}>
              {data.map((d) => (
                <Cell key={d.item_id} fill={d.color} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="bcg-legend">
        <span><i style={{ background: BCG_COLOR.Star }} /> Star · high growth, high share</span>
        <span><i style={{ background: BCG_COLOR["Question Mark"] }} /> Question Mark · high growth, low share</span>
        <span><i style={{ background: BCG_COLOR["Cash Cow"] }} /> Cash Cow · low growth, high share</span>
        <span><i style={{ background: BCG_COLOR.Dog }} /> Dog · low growth, low share</span>
      </div>
      <p className="ac-hint">Dot size is uniform; hover for exact figures. Growth compares this range to the preceding equal-length range.</p>
    </div>
  );
}

export function SkuAbcCard({ items, prior }: { items: SkuItem[]; prior: Map<number, number> }) {
  const c = chartTheme(useTheme());
  const [metric, setMetric] = useState<"revenue" | "volume">("revenue");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const abc = skuAbc(items);
  const p = paretoConcentration(items);
  const bcg = skuBcg(items, prior);
  const categories = skuByCategory(items);

  const volItems: SkuItemVol[] = items
    .filter((x) => (x.quantity ?? 0) > 0)
    .map((x) => ({ item_id: x.item_id, name: x.name, quantity: x.quantity ?? 0 }));
  const hasVol = volItems.length > 0;
  const abcVol = hasVol ? skuAbcVol(volItems) : null;
  const pVol = hasVol ? paretoConcentrationVol(volItems) : null;

  if (abc.length === 0) return <Empty note="No SKU data in this range." />;

  const activeAbc = metric === "revenue" ? abc : abcVol ?? abc;
  const statP = metric === "revenue" ? p : pVol ?? p;

  const itemById = new Map(items.map((x) => [x.item_id, x]));
  const bcgById = new Map(bcg.rows.map((r) => [r.item_id, r]));

  const classCount = { A: 0, B: 0, C: 0 };
  for (const r of activeAbc) classCount[r.cls] += 1;

  const q = search.trim().toLowerCase();
  const filtered = activeAbc.filter(
    (r) => !q || r.name.toLowerCase().includes(q) || String(r.item_id).includes(q),
  );
  const visible = showAll ? filtered : filtered.slice(0, 20);
  const curve = activeAbc.map((r) => ({ rank: r.rank, cumulativeShare: r.cumulativeShare }));

  const activeDetail = (selectedId ?? hoveredId) != null
    ? activeAbc.find((r) => r.item_id === (selectedId ?? hoveredId)) ?? null
    : null;

  return (
    <div className="abc-wrap">
      <div className="abc-stats">
        <span><strong>{statP.n}</strong> SKUs</span>
        <span>Top 5 = <strong>{fmtPct(statP.top5Share)}</strong></span>
        <span>Top 10 = <strong>{fmtPct(statP.top10Share)}</strong></span>
        <span>HHI <strong>{fmt(statP.hhi, 0)}</strong></span>
        <span>A <strong>{classCount.A}</strong> · B {classCount.B} · C {classCount.C}</span>
        <span className="abc-metric-toggle">
          <button
            className={metric === "revenue" ? "btn-ghost active" : "btn-ghost"}
            onClick={() => setMetric("revenue")}
          >
            Rank by revenue
          </button>
          <button
            className={metric === "volume" ? "btn-ghost active" : "btn-ghost"}
            onClick={() => setMetric("volume")}
            disabled={!hasVol}
          >
            Rank by volume
          </button>
        </span>
      </div>

      <div className="abc-search">
        <input
          type="search"
          placeholder="Search SKU by name or id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {metric === "volume" && <span className="ac-hint">Ranked and classified by quantity.</span>}
        <span className="ac-hint">Hover a row to preview · click to pin.</span>
      </div>

      <div className="abc-cols">
        <table className="abc-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th className="num">Revenue (Cr)</th>
              <th className="num">Qty</th>
              <th className="num">Share</th>
              <th className="num">Growth</th>
              <th>Class</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const it = itemById.get(r.item_id);
              const b = bcgById.get(r.item_id);
              const growth = b?.growth;
              const sel = selectedId === r.item_id;
              return (
                <tr
                  key={r.item_id}
                  className={sel ? "abc-selected" : ""}
                  onClick={() => setSelectedId(sel ? null : r.item_id)}
                  onMouseEnter={() => setHoveredId(r.item_id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <td className="num">{r.rank}</td>
                  <td className="abc-name" title={r.name}>{r.name}</td>
                  <td className="num">{fmt(it?.value ?? 0)}</td>
                  <td className="num">{it && (it.quantity ?? 0) > 0 ? fmt(it.quantity) : "—"}</td>
                  <td className="num">{fmtPct(r.share)}</td>
                  <td className="num">{growth === undefined ? "—" : growth === null ? "New" : `${fmt(growth, 0)}%`}</td>
                  <td><span className="abc-badge" style={{ color: CLS_COLOR[r.cls], borderColor: CLS_COLOR[r.cls] }}>{r.cls}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="abc-side">
          {activeDetail ? (
            <SkuDetailPanel
              row={activeDetail}
              item={itemById.get(activeDetail.item_id) ?? null}
              bcg={bcgById.get(activeDetail.item_id) ?? null}
            />
          ) : (
            <BcgPanel matrix={bcg} />
          )}
        </div>
      </div>

      {!showAll && filtered.length > 20 && (
        <button className="btn-ghost abc-showall" onClick={() => setShowAll(true)}>
          Show all {filtered.length} SKUs
        </button>
      )}

      <div className="chart-canvas abc-curve">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={curve} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
            <XAxis dataKey="rank" stroke={c.axis} tick={c.tick} label={{ value: "SKU rank", position: "insideBottomRight", fill: c.axis, fontSize: 11, offset: -2 }} />
            <YAxis stroke={c.axis} tick={c.tick} domain={[0, 100]} />
            <Tooltip
              contentStyle={c.tooltipStyle}
              labelStyle={c.labelStyle}
              itemStyle={c.itemStyle}
              formatter={(v: number) => [`${v.toFixed(1)}%`, "Cumulative"]}
            />
            <ReferenceLine y={80} stroke="#4ade80" strokeDasharray="4 4" />
            <ReferenceLine y={95} stroke="#fbbf24" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="cumulativeShare" stroke="#38bdf8" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {activeDetail && (
        <div className="abc-bcg-below">
          <BcgPanel matrix={bcg} />
        </div>
      )}

      <DemarcationPanel categories={categories} />
    </div>
  );
}

// Per-SKU performance detail, shown when a row is clicked.
function SkuDetailPanel({
  row,
  item,
  bcg,
}: {
  row: SkuAbcRow;
  item: SkuItem | null;
  bcg: BcgRow | null;
}) {
  const unit = item ? skuUnitPrice(item) : null;
  return (
    <div className="sku-detail">
      <div className="analysis-head">
        <h3>SKU detail</h3>
        <span className="abc-badge" style={{ color: CLS_COLOR[row.cls], borderColor: CLS_COLOR[row.cls] }}>{row.cls}</span>
      </div>
      <div className="sku-detail-grid">
        <div><label>Name</label><span title={row.name}>{row.name}</span></div>
        <div><label>Category</label><span>{item?.category || "—"}</span></div>
        <div><label>UOM</label><span>{item?.uom || "—"}</span></div>
        <div><label>Revenue</label><span>{fmt(item?.value ?? 0)} Cr</span></div>
        <div><label>Quantity</label><span>{item && (item.quantity ?? 0) > 0 ? fmt(item.quantity) : "—"}</span></div>
        <div><label>Avg price</label><span>{unit === null ? "—" : `≈ ${fmt(unit)} BDT/unit`}</span></div>
        <div><label>Rank</label><span>#{row.rank}</span></div>
        <div><label>Share</label><span>{fmtPct(row.share)}</span></div>
        <div><label>Growth</label><span>{bcg === null || bcg.growth === undefined ? "—" : bcg.growth === null ? "New" : `${fmt(bcg.growth, 1)}%`}</span></div>
        <div><label>Quadrant</label><span>{bcg?.quadrant ?? "—"}</span></div>
      </div>
      <p className="ac-hint">Avg price = revenue ÷ quantity in the SBU's dominant UOM (BDT per unit).</p>
    </div>
  );
}

// Geographic demarcation — Bangladesh division map (borrowed from the Customer
// Understanding survey). The map is ready for district-level sales; the SKU
// feed (ERP general ledger) has no location, so it renders neutral until a
// district-level sales source is wired in. The category table below shows the
// grouping dimension that IS available today.
function DemarcationPanel({ categories }: { categories: SkuCategoryRow[] }) {
  return (
    <div className="district-wrap">
      <div className="analysis-head">
        <h3>Geographic demarcation</h3>
        <span className="ac-hint">Bangladesh divisions — lights up once district-level sales are in the ERP feed.</span>
      </div>
      <BdDivisionMap values={{}} formatValue={(v) => `${fmt(v)} Cr`} />
      <p className="ac-hint">
        The SKU feed has no customer or location, so “which district a SKU sells more” needs a district-level
        sales source. Until then the map stays neutral and the category view below carries the demarcation.
      </p>

      {categories.length > 0 && (
        <>
          <div className="analysis-head" style={{ marginTop: "1rem" }}>
            <h3>Category demarcation</h3>
            <span className="ac-hint">SKUs grouped by product category (from the ERP item master).</span>
          </div>
          <table className="abc-table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">SKUs</th>
                <th className="num">Revenue (Cr)</th>
                <th className="num">Qty</th>
                <th className="num">Share</th>
                <th className="num">Top 5</th>
                <th className="num">HHI</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((d) => (
                <tr key={d.category}>
                  <td>{d.category}</td>
                  <td className="num">{d.n}</td>
                  <td className="num">{fmt(d.revenue)}</td>
                  <td className="num">{fmt(d.quantity)}</td>
                  <td className="num">{fmtPct(d.share)}</td>
                  <td className="num">{fmtPct(d.top5Share)}</td>
                  <td className="num">{fmt(d.hhi, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
