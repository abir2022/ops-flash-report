// ---------------------------------------------------------------------------
// Factor Cost & SBU Action Plans — analytical data for the BIIR tab.
//
// Ported from the manager's "SBU Factor Analysis & Action Plans" reference
// (plain-language factor analysis). Figures are FY25-26 actuals with FY26-27
// forward sensitivities, calibrated analytical judgements (NOT raw DWH rows).
// Money in BDT Crore (Cr). This is a self-contained analytical dataset that
// augments the live scorecard-driven signals in the BIIR engine.
// ---------------------------------------------------------------------------

export type FactorKey = "fx" | "oil" | "rate" | "duty";

export interface FactorInfo {
  key: FactorKey;
  name: string;
  short: string;
  down: number; // cost if nothing done (Cr)
  mit: number; // cost after action (Cr); negative = a gain/upside
  sav: number; // recoverable (Cr)
  driver: string; // the live external signal text
}

export const FACTORS: FactorInfo[] = [
  { key: "fx", name: "Foreign exchange (Taka)", short: "FX", down: 244, mit: 122, sav: 122, driver: "Weaker Taka — USD/BDT +4%" },
  { key: "oil", name: "Oil & energy prices", short: "Oil & energy", down: 90, mit: 43, sav: 47, driver: "Diesel +17.4% & electricity +10%" },
  { key: "rate", name: "Interest & bank charges", short: "Interest", down: 49, mit: 10, sav: 39, driver: "Interest & bank charges" },
  { key: "duty", name: "Import duty", short: "Import duty", down: 40, mit: -32, sav: 71, driver: "Import duty" },
];

export const GROUP = { rev: 3091, atRisk: 423, recoverable: 279 };
export const NET_COST = GROUP.atRisk - GROUP.recoverable; // 144 Cr

// Per-SBU factor exposure (0–100), keyed by SBU code.
export type ExposureMap = Record<FactorKey, number>;
export const HEAT: Record<string, ExposureMap> = {
  NXES: { fx: 70, oil: 45, rate: 75, duty: 50 },
  NXCM: { fx: 40, oil: 80, rate: 45, duty: 90 },
  NXST: { fx: 60, oil: 75, rate: 50, duty: 85 },
  NXAF: { fx: 75, oil: 50, rate: 55, duty: 55 },
  NXAL: { fx: 70, oil: 55, rate: 70, duty: 45 },
  NXRM: { fx: 30, oil: 70, rate: 40, duty: 30 },
  Lubex: { fx: 55, oil: 90, rate: 35, duty: 40 },
  NXLE: { fx: 55, oil: 50, rate: 35, duty: 35 },
  ALCL: { fx: 50, oil: 45, rate: 30, duty: 30 },
  NXAI: { fx: 55, oil: 80, rate: 30, duty: 35 },
  ACEL: { fx: 55, oil: 30, rate: 25, duty: 40 },
  AASL: { fx: 60, oil: 95, rate: 40, duty: 30 },
  NXMP: { fx: 45, oil: 30, rate: 35, duty: 25 },
  NXNJ: { fx: 15, oil: 10, rate: 15, duty: 10 },
  NXBO: { fx: 15, oil: 10, rate: 15, duty: 10 },
};

export type Verdict = "Grow" | "Protect" | "Fix" | "Review";
export type Health = "Strong" | "Fair" | "Weak";
export type Headwind = "Low" | "Medium" | "High";

export interface SbuAction {
  a: string;
  impact: string;
  d: string;
  none?: boolean;
}

export interface SbuPlan {
  code: string;
  name: string;
  industry: string;
  color: string;
  rev: number; // FY26 revenue Cr
  np: number; // FY26 net profit Cr (negative = loss)
  health: Health;
  headwind: Headwind;
  verdict: Verdict;
  situation: string;
  rootCause: string;
  strategy: string;
  actions: SbuAction[];
  outcome: string;
  kpi: string;
  atRisk: number;
  recoverable: number;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  Grow: "Grow",
  Protect: "Protect",
  Fix: "Fix",
  Review: "Review",
};

export const VERDICT_COLOR: Record<Verdict, string> = {
  Grow: "#10B981",
  Protect: "#3B82F6",
  Fix: "#F59E0B",
  Review: "#DC2626",
};

export const HEALTH_LABEL: Record<Health, string> = { Strong: "Strong", Fair: "Fair", Weak: "Weak" };
export const HEADWIND_LABEL: Record<Headwind, string> = { Low: "Low", Medium: "Medium", High: "High" };

// At-risk / recoverable per SBU (Cr) — merged onto each plan.
const RISK: Record<string, [number, number]> = {
  NXES: [118.0, 64.3], NXCM: [113.3, 82.0], NXST: [81.0, 62.3], NXAF: [47.7, 36.3], NXAL: [38.0, 20.0],
  NXRM: [13.3, 7.7], Lubex: [5.3, 3.0], NXLE: [4.3, 2.7], ALCL: [1.0, 0.7], NXAI: [0.3, 0.2], ACEL: [0.3, 0.2],
  AASL: [0.2, 0.1], NXMP: [0.1, 0.1], NXNJ: [0.0, 0.0], NXBO: [0.3, 0.2],
};

const RAW_PLANS: Omit<SbuPlan, "atRisk" | "recoverable">[] = [
  {
    code: "NXES", name: "NexaGroup Essentials", industry: "FMCG / Staples", color: "#3B82F6", rev: 1105, np: -60,
    health: "Fair", headwind: "Medium", verdict: "Fix",
    situation: "Our biggest business (1,105 Cr revenue) but it is losing money (−60 Cr).",
    rootCause: "Imported raw materials, a very large 69 Cr borrowing (finance) bill, and a packaging-tax risk are squeezing the margin.",
    strategy: "Fix profitability first — bring costs down before chasing more volume.",
    actions: [
      { a: "Restructure / refinance the 69 Cr borrowing cost (target −25%)", impact: "~17 Cr/yr", d: "The 69 Cr finance bill is the single biggest fixed cost in the P&L. Moving from expensive short-term working-capital loans to lower-cost, longer-tenor facilities cuts the interest line by roughly a quarter — about 17 Cr a year — without touching the core business." },
      { a: "Lock the Taka cost of half our imports so currency swings are capped", impact: "~43 Cr/yr", d: "Essentials imports a large basket of raw material, so every 1-taka move against the USD changes landed cost. Forward-covering and USD-linked supplier contracts on roughly half the import book removes ~43 Cr of FX swing — the largest single lever in the recovery plan." },
      { a: "Drop low-margin products and price to cover cost", impact: "margin protection", d: "Several SKUs are sold below full landed cost. Removing the worst contributors and re-pricing the rest to at least break-even protects margin without needing new volume — a pure mix-and-price fix." },
      { a: "Delay big packaging orders until the tax rules are clear", impact: "avoids tax shock", none: true, d: "A pending change to packaging (VAT/tax) rules could retroactively hit stock we have already ordered. Holding large packaging buys until the rules are published avoids absorbing a surprise tax cost." },
    ],
    outcome: "Recover ~64 Cr of the ~118 Cr at risk.",
    kpi: "Net profit turns positive by FY27; borrowing cost below 4% of revenue.",
  },
  {
    code: "NXCM", name: "NexaGroup Cement", industry: "Cement", color: "#D97706", rev: 756, np: 62,
    health: "Strong", headwind: "Low", verdict: "Protect",
    situation: "Strong and profitable (62 Cr) but margin is eroding (−3.3 pp) from clinker duty and energy cost.",
    rootCause: "The 25% value-based clinker import duty plus coal/power cost are the two biggest cost leaks.",
    strategy: "Protect the business — defend margin and capture the duty reversal before competitors do.",
    actions: [
      { a: "Push the clinker duty reversal (25% → ৳500/ton flat) through the Finance Act", impact: "~71 Cr group-wide", d: "Clinker currently carries a 25% value-based import duty — the biggest single policy-driven cost leak. Converting it to a flat ৳500/ton removes ~71 Cr of cost group-wide and is the highest-value lobbying item in the whole portfolio." },
      { a: "Sign coal term contracts + add alternative fuel", impact: "locks energy cost", d: "Coal (up 12% to 95 USD/MT) and power are the dominant kiln costs. Long-term coal contracts plus a higher alternative-fuel mix (tyre chips, RDF) lock energy cost per ton instead of buying at spot." },
      { a: "Improve kiln energy efficiency per ton", impact: "~3-5% energy saving", d: "Process-level improvements — better preheater recovery, kiln automation, clinker quality — typically cut thermal and power use by 3–5% per ton, a saving that repeats every year." },
      { a: "Advance-buy clinker / slag when prices dip", impact: "timing gain", d: "Clinker and slag are imported in bulk and their prices swing with freight and energy. Buying forward when prices dip captures the timing spread and lowers average landed cost." },
    ],
    outcome: "Recover ~82 Cr of the ~113 Cr at risk.",
    kpi: "Hold net-profit margin; clinker landed cost per ton falling.",
  },
  {
    code: "NXST", name: "NexaGroup Steel", industry: "Steel", color: "#10B981", rev: 483, np: 70,
    health: "Strong", headwind: "Medium", verdict: "Protect",
    situation: "Profitable (70 Cr) but margin is under heavy pressure (−9.2 pp ramp) from energy and scrap cost.",
    rootCause: "Imported scrap (the largest input), furnace energy, and the Taka all feed into one cost channel.",
    strategy: "Protect profitability — cut scrap and energy cost per ton produced.",
    actions: [
      { a: "Push the scrap duty cut (৳1,500 → ৳500/ton)", impact: "biggest lever", d: "Imported scrap is the largest single input and carries ৳1,500/ton duty. Cutting it to ৳500/ton is the biggest cost lever available and directly improves melt cost per ton." },
      { a: "Buy on usable yield, not on the raw import price", impact: "better melt economics", d: "Scrap grades differ in how much finished steel they actually yield. Buying on real melt yield rather than headline price lowers the true cost per ton of billet produced." },
      { a: "Reduce furnace power cost", impact: "energy saving", d: "Electric arc furnace power is a major cost and the tariff is rising. Load scheduling, power-factor correction and off-peak melting cut the energy bill per ton." },
      { a: "Lock the Taka cost of scrap imports", impact: "caps FX", d: "Scrap is priced in USD and the Taka is under pressure. Forward-covering the import book removes currency volatility from the largest cost line." },
    ],
    outcome: "Recover ~62 Cr of the ~81 Cr at risk.",
    kpi: "Melt yield up; energy cost per ton down.",
  },
  {
    code: "NXAF", name: "NexaGroup Feed", industry: "Animal Feed / Agro", color: "#60A5FA", rev: 313, np: -11,
    health: "Fair", headwind: "Medium", verdict: "Fix",
    situation: "313 Cr revenue but a 11 Cr loss — feed margin is squeezed by input cost.",
    rootCause: "~70% of cost is imported soybean meal / maize, so the Taka and world grain prices dominate.",
    strategy: "Fix the input-cost line — buy smarter and lock the tax relief.",
    actions: [
      { a: "Follow through on the feed tax relief (already approved in principle)", impact: "tax saving", d: "The feed business has tax relief approved in principle but not yet reflected in the books. Closing this converts a committed-but-unclaimed benefit into real margin — the fastest win available." },
      { a: "Advance-buy soybean meal / maize in the harvest window", impact: "price timing", d: "Roughly 70% of feed cost is imported soybean meal and maize. Buying in bulk during the local/world harvest window, when prices are seasonally lowest, lowers average input cost." },
      { a: "Run least-cost feed formulation", impact: "formulation margin", d: "Feed nutrition can be met from multiple ingredient combinations. A least-cost formulation engine picks the cheapest mix that hits the nutrient spec, adding margin without changing the product." },
      { a: "Time import orders to the world price cycle", impact: "FX/price timing", d: "World grain and meal prices move in clear cycles. Timing purchase orders to the low points of those cycles — rather than buying hand-to-mouth — reduces landed cost per kg." },
    ],
    outcome: "Recover ~36 Cr of the ~48 Cr at risk.",
    kpi: "Gross margin % and input cost per kg.",
  },
  {
    code: "NXAL", name: "NexaGroup Commodities", industry: "Commodity Trading", color: "#FBBF24", rev: 196, np: -43,
    health: "Weak", headwind: "High", verdict: "Fix",
    situation: "196 Cr revenue but a 43 Cr loss — cost of goods is higher than revenue.",
    rootCause: "Thin trading margin is below the borrowing cost, and the rice-mill (NXHM) business is bleeding (−22 Cr).",
    strategy: "Fix the structure — stop the bleeding business and cut borrowing cost.",
    actions: [
      { a: "Restructure or exit the NXHM rice-mill loss", impact: "removes ~22 Cr loss", d: "The NXHM rice-mill business is losing ~22 Cr and sits inside a trading operation with too-thin margins. Restructuring it — or exiting it entirely — removes a structural loss that overwhelms every other improvement." },
      { a: "Renegotiate borrowing / working-capital terms", impact: "lower interest", d: "Trading margin is currently below the borrowing cost, so the business loses money just by holding inventory. Cheaper working-capital lines and better credit terms close that gap." },
      { a: "Stagger orders and buy seasonally (wheat / lentils / peas)", impact: "price timing", d: "Commodity prices are seasonal. Staggering purchases across the crop cycle instead of one lump order smooths the average cost and avoids buying the top of the market." },
      { a: "Pass through costs where price controls allow", impact: "margin recovery", d: "Some commodity lines allow cost pass-through under existing rules. Recovering input-cost increases in the selling price restores margin where regulation permits." },
    ],
    outcome: "Recover ~20 Cr and remove a structural loss.",
    kpi: "Trading margin above borrowing cost; NXHM loss closed.",
  },
  {
    code: "NXRM", name: "NexaGroup ReadyMix", industry: "Ready-mix Concrete", color: "#34D399", rev: 124, np: 0,
    health: "Fair", headwind: "Medium", verdict: "Protect",
    situation: "Solid business (124 Cr) with a thin operating margin.",
    rootCause: "Transit-mixer fuel cost, builder credit overdues, and a weak public-construction market.",
    strategy: "Protect cash flow — cut fuel cost and tighten credit while shifting to private projects.",
    actions: [
      { a: "Optimize fleet routes and fuel usage", impact: "fuel saving", d: "Transit-mixer diesel is the biggest variable cost and diesel is up 17.4%. Route planning, load batching and driver telemetry cut fuel per cubic meter delivered." },
      { a: "Tighten builder credit terms and collect overdues", impact: "working capital", d: "Ready-mix is credit-heavy and overdue receivables tie up cash. Shortening credit terms and chasing overdues releases working capital and cuts the cost of funding those receivables." },
      { a: "Link cement input pricing to NXCM", impact: "cost linkage", d: "Ready-mix buys cement — a huge input — from the group. Pricing that input on a long-term cost-linked basis to NXCM removes a hidden margin leak between two group businesses." },
      { a: "Shift sales toward private / real-estate projects", impact: "demand mix", d: "Public-construction demand is weak. Moving the mix toward private and real-estate projects, which pay better and order more consistently, improves both volume and margin." },
    ],
    outcome: "Recover ~8 Cr of the ~13 Cr at risk.",
    kpi: "Fuel cost per cubic meter; overdue receivables.",
  },
  {
    code: "Lubex", name: "Lubex (Lube Oil & Bitumen)", industry: "Lubricants / Bitumen", color: "#3B82F6", rev: 41, np: 2,
    health: "Weak", headwind: "High", verdict: "Protect",
    situation: "Small but profitable (2 Cr) — yet directly exposed to the oil price.",
    rootCause: "Base oil is crude-linked, so every oil spike hits the cost of the core product.",
    strategy: "Protect the business by locking oil cost and hedging — keep it, but shield the margin.",
    actions: [
      { a: "Sign base-oil term contracts with suppliers", impact: "locks input cost", d: "Base oil is crude-linked, so the product cost rises every time oil spikes. Term contracts fix the input price for a period, shielding the core product margin." },
      { a: "Optimize the lubricant blend", impact: "blend margin", d: "Lubricant performance can be met from cheaper base-oil and additive combinations. Reformulating to the cheapest compliant blend lifts margin per litre." },
      { a: "Lock the Taka cost of base-oil imports", impact: "caps FX", d: "Base oil is imported in USD and the Taka is under pressure. Forward-covering the import bill removes currency volatility from the cost line." },
      { a: "Forward-contract bitumen supply", impact: "price stability", d: "Bitumen (up 7%) moves with crude and seasonal demand. Forward supply contracts lock the price and stop margin erosion in the bitumen line." },
    ],
    outcome: "Recover ~3 Cr of the ~5 Cr at risk.",
    kpi: "Base-oil cost per liter vs market; blend margin.",
  },
  {
    code: "NXLE", name: "NexaGroup Light Eng (Enovar)", industry: "Light Engineering", color: "#D97706", rev: 46, np: -1,
    health: "Fair", headwind: "Medium", verdict: "Protect",
    situation: "46 Cr revenue, roughly at break-even.",
    rootCause: "Imported copper / aluminium / components plus energy cost.",
    strategy: "Protect the ramp-up — localize inputs and improve energy efficiency.",
    actions: [
      { a: "Localize components where volume allows", impact: "less import/FX", d: "Copper, aluminium and components are imported in USD. Localizing the highest-volume parts removes both the FX exposure and the duty on those inputs." },
      { a: "Improve energy efficiency in production", impact: "cost down", d: "Light-engineering production is energy-intensive and the tariff is rising. Better load management and equipment upgrades cut energy cost per unit." },
      { a: "Lock the Taka cost of component imports", impact: "caps FX", d: "Until localization ramps, forward-covering the component import book removes currency volatility from the cost base." },
      { a: "Expand channel coverage to lift volume", impact: "revenue", d: "The business is at break-even partly because fixed cost is spread over too little volume. Wider distribution lifts volume and absorbs fixed overhead." },
    ],
    outcome: "Recover ~3 Cr of the ~4 Cr at risk.",
    kpi: "Component localization %; energy cost per unit.",
  },
  {
    code: "ALCL", name: "NEXAGROUP Pharmacy / PartnerFeed", industry: "Healthcare / Pharmacy", color: "#10B981", rev: 11, np: 0,
    health: "Fair", headwind: "Medium", verdict: "Protect",
    situation: "Early-stage ramp-up (11 Cr).",
    rootCause: "Imported medicines, cold-chain energy, and network-expansion cost.",
    strategy: "Protect the rollout — grow the network while keeping cost per store in check.",
    actions: [
      { a: "Bulk-procure medicines", impact: "lower unit cost", d: "Medicines are largely imported and bought at list price. Centralized bulk procurement across the network earns volume discounts and lowers unit cost." },
      { a: "Improve cold-chain energy efficiency", impact: "energy saving", d: "Cold-chain storage runs 24/7 and power is costly. Better insulation, temperature zoning and equipment efficiency cut the energy bill per store." },
      { a: "Densify the store network selectively", impact: "volume", d: "Adding stores where demand is proven — not everywhere at once — lifts volume and spreads fixed cost, while avoiding high-cost low-demand locations." },
      { a: "Grow private-label share for margin", impact: "margin", d: "Private-label products carry a materially higher margin than branded ones. Shifting shelf share toward own-label lifts the blended margin." },
    ],
    outcome: "Recover ~1 Cr of the ~1 Cr at risk.",
    kpi: "Store-level economics; private-label share.",
  },
  {
    code: "NXAI", name: "NEXAGROUP Automobile (Tyre)", industry: "Automotive / Tyre", color: "#60A5FA", rev: 5, np: 0,
    health: "Weak", headwind: "High", verdict: "Review",
    situation: "Very small (5 Cr), just breaking even in a ramp-up.",
    rootCause: "Oil-based inputs (natural rubber, carbon black) are imported, and the plant is under-utilized.",
    strategy: "Review the business case — fix unit cost or reconsider scale/exit.",
    actions: [
      { a: "Advance-buy rubber on price dips", impact: "input timing", d: "Natural rubber and carbon black are imported and oil-linked. Buying forward when rubber prices dip lowers the average raw-material cost per tyre." },
      { a: "Improve curing energy efficiency", impact: "energy saving", d: "Tyre curing is energy-hungry and the plant is under-utilized. Better curing press scheduling and energy recovery cut the energy cost per tyre." },
      { a: "Lock vehicle-maker (OEM) contract pricing", impact: "volume stability", d: "OEM supply contracts give stable, predictable volume that fills the under-utilized plant and absorbs fixed cost." },
      { a: "Reassess whether to scale or divest within 2 quarters", impact: "capital decision", none: true, d: "At 5 Cr revenue with a 0 Cr profit, the strategic question is whether the ramp-up will reach scale. A 2-quarter review decides between investing more or exiting." },
    ],
    outcome: "Recover ~0 Cr; bigger question is strategic (scale vs exit).",
    kpi: "Cost per tire; capacity utilization.",
  },
  {
    code: "ACEL", name: "ORCA (Consumer Electronics)", industry: "Electronics", color: "#FBBF24", rev: 2, np: 0,
    health: "Weak", headwind: "High", verdict: "Review",
    situation: "Very small (2 Cr) ramp-up, at break-even.",
    rootCause: "Imported components and a packaging-tax risk, plus weak discretionary demand.",
    strategy: "Review the model — localize and cut costs, or reassess scale.",
    actions: [
      { a: "Localize components where feasible", impact: "less FX", d: "Components are imported in USD. Localizing the feasible share removes both FX exposure and import duty from the product cost." },
      { a: "Lock the Taka cost of component imports", impact: "caps FX", d: "Until localization ramps, forward-covering the component import book removes currency volatility from the cost base." },
      { a: "Control after-sales / warranty cost", impact: "cost down", d: "After-sales and warranty costs erode thin consumer-electronics margins. Better quality control upstream and tighter warranty terms cut that leakage." },
      { a: "Reassess scale and channel mix", impact: "capital decision", none: true, d: "At 2 Cr revenue and break-even, the current scale may not justify the cost base. A channel-mix review decides the right size or exit." },
    ],
    outcome: "Recover ~0 Cr; revisit strategic scale.",
    kpi: "Component localization %; warranty cost.",
  },
  {
    code: "AASL", name: "NEXAGROUP Air", industry: "Aviation", color: "#94A3B8", rev: 1, np: -5,
    health: "Weak", headwind: "High", verdict: "Review",
    situation: "Deeply loss-making (−5 Cr) on tiny revenue (1 Cr).",
    rootCause: "Jet fuel is ~30% of revenue and is crude-linked; the fleet is in US dollars.",
    strategy: "Review urgently — cut the cash burn or exit; fuel is outside our control.",
    actions: [
      { a: "Hedge jet fuel", impact: "caps fuel cost", d: "Jet fuel is ~30% of revenue and is crude-linked, so every oil spike burns cash. Fuel hedging caps the single biggest cost line and stops the bleed." },
      { a: "Improve fleet utilization / load factor", impact: "revenue per flight", d: "Empty seats and under-used aircraft waste fixed cost. Raising load factor through pricing and scheduling lifts revenue per flight without new cost." },
      { a: "Rationalize unprofitable routes", impact: "cuts losses", d: "Some routes lose money on every flight. Cutting or consolidating the worst routes removes recurring losses directly." },
      { a: "Decide: restructure or divest if fuel stays high", impact: "capital decision", none: true, d: "On 1 Cr revenue with a 5 Cr loss, fuel cost is outside our control. If fuel stays high, the only real option is restructuring or divestment." },
    ],
    outcome: "Minimal recovery; this is a strategic review, not a cost fix.",
    kpi: "Load factor; fuel cost % of revenue.",
  },
  {
    code: "NXMP", name: "Mediplex", industry: "Healthcare / Hospital", color: "#94A3B8", rev: 0, np: 0,
    health: "Fair", headwind: "Medium", verdict: "Protect",
    situation: "Early ramp-up (0 Cr).",
    rootCause: "High fixed cost and imported equipment while bed occupancy builds up.",
    strategy: "Protect the ramp-up — drive occupancy and control cost per bed.",
    actions: [
      { a: "Raise bed occupancy", impact: "revenue", d: "High fixed cost only pays off when beds are full. Driving occupancy — through referrals and partnerships — lifts revenue without adding fixed cost." },
      { a: "Lease equipment instead of buying", impact: "cash / FX", d: "Imported equipment is expensive and USD-priced. Leasing converts a large up-front cash/FX outlay into a steady operating cost, protecting cash during the ramp." },
      { a: "Sign corporate / payor tie-ups", impact: "patient volume", d: "Corporate and insurance-payor agreements bring steady patient volume, which fills beds and improves the revenue mix." },
      { a: "Control cost per bed", impact: "margin", d: "As the hospital scales, cost per bed can drift up. Benchmarking and controlling per-bed cost protects margin at every occupancy level." },
    ],
    outcome: "Recover ~0 Cr near term; mainly protects future scale.",
    kpi: "Bed occupancy %; cost per bed.",
  },
  {
    code: "NXNJ", name: "NextJobs", industry: "HR-tech / SaaS", color: "#94A3B8", rev: 0.2, np: -1,
    health: "Strong", headwind: "Low", verdict: "Grow",
    situation: "Tiny revenue (0 Cr) but no import or energy exposure — it is a pure software play.",
    rootCause: "Slow revenue build against fixed product cost (burn rate).",
    strategy: "Grow — convert the platform into recurring revenue and enterprise contracts.",
    actions: [
      { a: "Shift to recurring subscription revenue", impact: "predictable revenue", d: "One-off project fees are lumpy. Moving to monthly/quarterly subscriptions makes revenue predictable and fundable." },
      { a: "Upsell enterprise / corporate clients", impact: "larger contracts", d: "Enterprise clients bring larger, longer contracts than individual users, giving a bigger revenue step per win." },
      { a: "Keep product cost discipline", impact: "lower burn", d: "The burn rate is the main risk while revenue builds. Holding product-development cost steady extends the runway." },
      { a: "Partner with group companies for captive demand", impact: "quick wins", d: "The NexaGroup itself needs HR-tech. Selling into group companies gives fast, low-cost revenue and reference customers." },
    ],
    outcome: "Recover ~0 Cr; value is in future growth, not cost.",
    kpi: "Monthly recurring revenue; customer acquisition cost.",
  },
  {
    code: "NXBO", name: "NXBO", industry: "Enterprise Software / SaaS", color: "#34D399", rev: 8, np: -1,
    health: "Strong", headwind: "Low", verdict: "Grow",
    situation: "Software business (8 Cr) with its own product and the group as captive customer.",
    rootCause: "Implementation cost is high per client, so the software unit economics are weak today.",
    strategy: "Grow — improve unit economics and roll out across the group first.",
    actions: [
      { a: "Improve revenue vs cost-to-win-a-customer", impact: "unit economics", d: "Implementation cost per client is currently too high relative to what each client pays. Improving the revenue-to-acquisition-cost ratio fixes the core unit economics." },
      { a: "Roll out across all group companies (captive)", impact: "revenue base", d: "The group is a guaranteed customer. Rolling out across all group companies first builds a stable revenue base and proof points." },
      { a: "Shift to self-serve onboarding", impact: "lower cost to serve", d: "Self-serve onboarding removes manual setup cost, so each new client costs less to bring on and support." },
      { a: "Streamline implementation cost", impact: "margin", d: "Standardizing implementation templates and reducing custom work cuts the cost of each deployment, lifting margin." },
    ],
    outcome: "Recover ~0 Cr; value is in scale and margin, not cost cutting.",
    kpi: "Revenue vs customer cost; recurring-revenue share.",
  },
];

export const SBU_PLANS: SbuPlan[] = RAW_PLANS.map((p) => {
  const r = RISK[p.code] ?? [0.0, 0.0];
  return { ...p, atRisk: r[0], recoverable: r[1] };
});

// Dominant factor for an SBU = the factor with the highest exposure score.
export function dominantFactor(code: string): FactorKey {
  const e = HEAT[code];
  if (!e) return "fx";
  return (Object.keys(e) as FactorKey[]).reduce((a, b) => (e[b] > e[a] ? b : a));
}

export function exposureClass(score: number): "low" | "med" | "high" {
  if (score <= 30) return "low";
  if (score <= 60) return "med";
  return "high";
}
