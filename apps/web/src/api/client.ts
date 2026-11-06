import { supabase } from "../lib/supabase";
import type {
  BiirSignalRow,
  Freshness,
  Kpi,
  PartnerFeedDailyTotalRow,
  PartnerFeedOfficePlRow,
  MarketingSpendDetailRow,
  MarketingSpendMonthlyRow,
  MarketingSpendRow,
  EmployeeCapability,
  EmployeeProfile,
  EmployeeRow,
  Reconciliation,
  RefreshRequestRow,
  RomiCampaignRow,
  RomiSbuRow,
  RomiSurveyForm,
  SbuDailyPoint,
  SbuDim,
  SbuMonthlyTarget,
  ScorecardRow,
  SkuSaleRow,
  TrendPoint,
} from "../types";

// PostgREST puts the useful text in `message` for raised exceptions, but for
// constraint violations (e.g. 409 unique_violation) the human-readable text
// often lands in `details`/`hint`. Surface whichever is present so the UI
// never falls back to a generic "failed" message.
export function rpcMessage(error: {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}): string {
  const msg = error?.message ?? "";
  if (error?.details) return `${msg} ${error.details}`.trim();
  if (error?.hint) return `${msg} ${error.hint}`.trim();
  return msg || "Request failed";
}

export async function fetchScorecard(reportDate: string): Promise<ScorecardRow[]> {
  const { data, error } = await supabase
    .from("v_scorecard")
    .select("*")
    .eq("report_date", reportDate);
  if (error) throw error;
  return (data ?? []) as ScorecardRow[];
}

export async function fetchKpi(reportDate: string): Promise<Kpi | null> {
  const { data, error } = await supabase
    .from("v_kpi")
    .select("*")
    .eq("report_date", reportDate)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Kpi | null;
}

export async function fetchReconciliation(reportDate: string): Promise<Reconciliation | null> {
  const { data, error } = await supabase
    .from("v_reconciliation")
    .select("*")
    .eq("report_date", reportDate)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Reconciliation | null;
}

export async function fetchReportDates(): Promise<string[]> {
  const { data, error } = await supabase.from("v_report_dates").select("report_date");
  if (error) throw error;
  return (data ?? []).map((r: { report_date: string }) => r.report_date);
}

export async function fetchFreshness(): Promise<Freshness | null> {
  const { data, error } = await supabase.from("v_freshness").select("*").single();
  if (error) throw error;
  return (data ?? null) as Freshness | null;
}

export async function fetchTrend(sbuId: number, channel = "default"): Promise<TrendPoint[]> {
  const { data, error } = await supabase
    .from("daily_trend")
    .select("sbu_id,d,channel,value")
    .eq("sbu_id", sbuId)
    .eq("channel", channel)
    .order("d");
  if (error) throw error;
  return (data ?? []) as TrendPoint[];
}

export interface PortfolioDaily {
  day: string;
  total: number;
}

export async function fetchPortfolioTrend(): Promise<PortfolioDaily[]> {
  const { data, error } = await supabase.from("v_portfolio_trend").select("*");
  if (error) throw error;
  return (data ?? []) as PortfolioDaily[];
}

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export async function fetchSbus(): Promise<SbuDim[]> {
  const { data, error } = await supabase.from("v_sbu").select("*");
  if (error) throw error;
  return (data ?? []) as SbuDim[];
}

export async function fetchSbuDaily(
  sbuId: number,
  channel: string,
  from: string,
  to: string
): Promise<SbuDailyPoint[]> {
  const { data, error } = await supabase.rpc("get_sbu_daily", {
    _sbu: sbuId,
    _channel: channel,
    _from: from,
    _to: to,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    d: String(r.d),
    value: n(r.value) ?? 0,
    quantity: n(r.quantity),
  }));
}

export async function fetchSbuHistory(
  sbuId: number,
  channel: string,
  from: string,
  to: string
): Promise<SbuDailyPoint[]> {
  // PostgREST caps a single response at 1000 rows; the 4-FY history is ~1.5k
  // daily rows per SBU, so page through it with the function's limit/offset.
  const PAGE = 1000;
  const out: SbuDailyPoint[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.rpc("get_sbu_history", {
      _sbu: sbuId,
      _channel: channel,
      _from: from,
      _to: to,
      _limit: PAGE,
      _offset: offset,
    });
    if (error) throw error;
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      d: String(r.d),
      value: n(r.value) ?? 0,
      quantity: null,
    }));
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function fetchSkuSales(
  sbuId: number,
  channel: string,
  from: string,
  to: string
): Promise<SkuSaleRow[]> {
  const { data, error } = await supabase.rpc("get_sku_sales", {
    _sbu: sbuId,
    _channel: channel,
    _from: from,
    _to: to,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    item_id: Number(r.item_id),
    item_code: (r.item_code as string | null) ?? null,
    item_name: (r.item_name as string | null) ?? null,
    category_name: (r.category_name as string | null) ?? null,
    quantity: n(r.quantity),
    uom: (r.uom as string | null) ?? null,
    value: n(r.value) ?? 0,
  }));
}

export async function fetchSbuTargets(sbuId: number): Promise<SbuMonthlyTarget[]> {
  const { data, error } = await supabase
    .from("v_sbu_monthly_targets")
    .select("sbu_id,period_month,mo_target_rev,mo_target_vol")
    .eq("sbu_id", sbuId)
    .order("period_month");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    sbu_id: Number(r.sbu_id),
    // PostgREST serializes the `date` column as "YYYY-MM-DD"; keep only "YYYY-MM".
    period_month: String(r.period_month).slice(0, 7),
    mo_target_rev: n(r.mo_target_rev),
    mo_target_vol: n(r.mo_target_vol),
  }));
}

// External intelligence signals for the Business Impact Intelligence Radar
// (BIIR). The table may not exist yet (migration 00010 pending); callers must
// catch the error and fall back to the built-in baseline catalogue.
export async function fetchBiirSignals(): Promise<BiirSignalRow[]> {
  const { data, error } = await supabase
    .from("biir_signal")
    .select("*")
    .eq("active", true)
    .order("category")
    .order("id");
  if (error) throw error;
  return (data ?? []) as BiirSignalRow[];
}

// Marketing spend actuals for the Marketing Analysis tab (admin-only). The
// table may be empty until the ETL backfills it; callers must handle no rows.
export async function fetchMarketingSpend(reportDate: string): Promise<MarketingSpendRow[]> {
  const { data, error } = await supabase
    .from("v_marketing_spend")
    .select("*")
    .eq("report_date", reportDate)
    .order("sbu_id");
  if (error) throw error;
  return (data ?? []) as MarketingSpendRow[];
}

// Campaign-able marketing spend (GL 4210001 less non-campaign SubGL) — the
// Marketing Led Overview's spend baseline. Same shape as v_marketing_spend.
export async function fetchMarketingSpendCampaignable(
  reportDate: string,
): Promise<MarketingSpendRow[]> {
  const { data, error } = await supabase
    .from("v_marketing_spend_campaignable")
    .select("*")
    .eq("report_date", reportDate)
    .order("sbu_id");
  if (error) throw error;
  return (data ?? []) as MarketingSpendRow[];
}

// SubGL purpose breakdown of marketing spend (admin-only).
export async function fetchMarketingSpendDetail(
  reportDate: string,
): Promise<MarketingSpendDetailRow[]> {
  const { data, error } = await supabase
    .from("v_marketing_spend_detail")
    .select("*")
    .eq("report_date", reportDate)
    .order("sbu_id")
    .order("mtd_spend", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MarketingSpendDetailRow[];
}

// Trailing monthly marketing spend series (admin-only).
export async function fetchMarketingSpendMonthly(): Promise<MarketingSpendMonthlyRow[]> {
  const { data, error } = await supabase
    .from("v_marketing_spend_monthly")
    .select("*")
    .order("sbu_id")
    .order("period_month");
  if (error) throw error;
  return (data ?? []) as MarketingSpendMonthlyRow[];
}

// Trailing monthly campaign-able marketing spend series (admin-only).
export async function fetchMarketingSpendMonthlyCampaignable(): Promise<MarketingSpendMonthlyRow[]> {
  const { data, error } = await supabase
    .from("v_marketing_spend_monthly_campaignable")
    .select("*")
    .order("sbu_id")
    .order("period_month");
  if (error) throw error;
  return (data ?? []) as MarketingSpendMonthlyRow[];
}

// Campaign ledger for the ROMI Analysis layer (admin-only). The view is
// security-invoker, so RLS on romi_campaign applies.
export async function fetchRomiCampaigns(): Promise<RomiCampaignRow[]> {
  const { data, error } = await supabase
    .from("v_romi_campaign")
    .select("*")
    .order("report_month", { ascending: false })
    .order("id");
  if (error) throw error;
  return (data ?? []) as RomiCampaignRow[];
}

// ROMI SBU dimension (branch-mark benchmarks). Admin-only.
export async function fetchRomiSbus(): Promise<RomiSbuRow[]> {
  const { data, error } = await supabase.from("v_romi_sbu").select("*");
  if (error) throw error;
  return (data ?? []) as RomiSbuRow[];
}

// Active survey form definition (the optional admin-added fields). Readable by
// admin (to edit) and officer (to render the form); RLS governs.
export async function fetchRomiSurveyForm(): Promise<RomiSurveyForm | null> {
  const { data, error } = await supabase
    .from("romi_survey_form")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: Number(data.id),
    title: String(data.title),
    description: (data.description as string | null) ?? null,
    fields: Array.isArray(data.fields) ? (data.fields as RomiSurveyForm["fields"]) : [],
    is_active: Boolean(data.is_active),
  };
}

// Admin-only: save the ROMI survey form definition (title / description /
// JSONB field list / active flag). Creates a new active form and deactivates
// any previously active one.
export async function adminSaveSurveyForm(input: {
  title: string;
  description: string;
  fields: RomiSurveyForm["fields"];
  is_active: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc("admin_save_survey_form", {
    _title: input.title,
    _description: input.description,
    _fields: input.fields,
    _is_active: input.is_active,
  });
  if (error) throw new Error(rpcMessage(error));
}

// Employee self-profile (name / SBUs / capabilities mapped from the account).
export async function fetchEmployeeProfile(): Promise<EmployeeProfile | null> {
  const { data, error } = await supabase.rpc("employee_profile");
  if (error) throw new Error(rpcMessage(error));
  const row = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!row) return null;
  return {
    name: String(row.name),
    email: String(row.email),
    phone: (row.phone as string | null) ?? null,
    allowed_sbus: Array.isArray(row.allowed_sbus) ? (row.allowed_sbus as number[]) : [],
    sbu_codes: Array.isArray(row.sbu_codes) ? (row.sbu_codes as string[]) : [],
    sbu_names: Array.isArray(row.sbu_names) ? (row.sbu_names as (string | null)[]) : [],
    can_view: Boolean(row.can_view),
    can_romi: Boolean(row.can_romi),
  };
}

// Employee submits a campaign for one of their responsible SBUs.
export async function employeeSubmitCampaign(input: {
  sbu_id: number;
  campaign_name: string;
  category: string;
  start_date: string;
  end_date: string;
  marketing_expense_total: number;
  extra_fields?: Record<string, unknown>;
}): Promise<number> {
  const { data, error } = await supabase.rpc("employee_submit_campaign", {
    _sbu_id: input.sbu_id,
    _campaign_name: input.campaign_name,
    _category: input.category,
    _start_date: input.start_date,
    _end_date: input.end_date,
    _marketing_expense_total: input.marketing_expense_total,
    _extra_fields: input.extra_fields ?? null,
  });
  if (error) throw new Error(rpcMessage(error));
  return Number(data);
}

// Employee's own campaign submissions (across all their SBUs).
export interface EmployeeCampaign {
  id: number;
  sbu_id: number | null;
  sbu_code: string | null;
  sbu_name: string | null;
  campaign_name: string;
  category: string | null;
  report_month: string | null;
  start_date: string | null;
  end_date: string | null;
  marketing_expense_total: number | null;
  created_at: string | null;
}

export async function employeeListCampaigns(): Promise<EmployeeCampaign[]> {
  const { data, error } = await supabase.rpc("employee_list_campaigns");
  if (error) throw new Error(rpcMessage(error));
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    sbu_id: r.sbu_id === null || r.sbu_id === undefined ? null : Number(r.sbu_id),
    sbu_code: (r.sbu_code as string | null) ?? null,
    sbu_name: (r.sbu_name as string | null) ?? null,
    campaign_name: String(r.campaign_name),
    category: (r.category as string | null) ?? null,
    report_month: (r.report_month as string | null) ?? null,
    start_date: (r.start_date as string | null) ?? null,
    end_date: (r.end_date as string | null) ?? null,
    marketing_expense_total:
      typeof r.marketing_expense_total === "number" ? r.marketing_expense_total : null,
    created_at: (r.created_at as string | null) ?? null,
  }));
}

// Admin employee lifecycle.
export interface CreateEmployeeInput {
  name: string;
  email: string;
  phone: string;
  allowed_sbus: number[];
  capability: EmployeeCapability;
  password: string;
  expires_at?: string | null;
}

export async function adminListEmployees(): Promise<EmployeeRow[]> {
  const { data, error } = await supabase.rpc("admin_list_employees");
  if (error) throw new Error(rpcMessage(error));
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    user_id: String(r.user_id),
    name: String(r.name),
    email: String(r.email),
    phone: (r.phone as string | null) ?? null,
    password: (r.password as string | null) ?? null,
    allowed_sbus: Array.isArray(r.allowed_sbus) ? (r.allowed_sbus as number[]) : [],
    sbu_codes: Array.isArray(r.sbu_codes) ? (r.sbu_codes as string[]) : [],
    sbu_names: Array.isArray(r.sbu_names) ? (r.sbu_names as (string | null)[]) : [],
    capability: (r.capability as EmployeeCapability) ?? "view",
    can_view: Boolean(r.can_view),
    can_romi: Boolean(r.can_romi),
    is_active: Boolean(r.is_active),
    expires_at: (r.expires_at as string | null) ?? null,
    created_at: String(r.created_at),
  }));
}

export async function adminCreateEmployee(input: CreateEmployeeInput): Promise<void> {
  const { error } = await supabase.rpc("admin_create_employee", {
    _name: input.name,
    _email: input.email,
    _phone: input.phone,
    _allowed_sbus: input.allowed_sbus,
    _capability: input.capability,
    _password: input.password,
    _expires_at: input.expires_at ?? null,
  });
  if (error) throw new Error(rpcMessage(error));
}

export async function adminRevokeEmployee(userId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_revoke_employee", { _user_id: userId });
  if (error) throw new Error(rpcMessage(error));
}

export async function adminReactivateEmployee(userId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_reactivate_employee", { _user_id: userId });
  if (error) throw new Error(rpcMessage(error));
}

export async function adminUpdateEmployee(
  userId: string,
  capability: EmployeeCapability,
): Promise<void> {
  const { error } = await supabase.rpc("admin_update_employee", {
    _user_id: userId,
    _capability: capability,
  });
  if (error) throw new Error(rpcMessage(error));
}

export async function adminResetEmployeePassword(
  userId: string,
): Promise<{ email: string; password: string }> {
  const { data, error } = await supabase.rpc("admin_reset_employee_password", {
    _user_id: userId,
  });
  if (error) throw new Error(rpcMessage(error));
  const row = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!row) throw new Error("Reset returned no row.");
  return { email: String(row.email), password: String(row.password) };
}

export async function adminDeleteEmployee(userId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_delete_employee", { _user_id: userId });
  if (error) throw new Error(rpcMessage(error));
}

function mapRefreshRow(r: Record<string, unknown>): RefreshRequestRow {
  return {
    id: Number(r.id),
    status: (r.status as RefreshRequestRow["status"]) ?? "pending",
    requested_at: String(r.requested_at),
    started_at: (r.started_at as string | null) ?? null,
    finished_at: (r.finished_at as string | null) ?? null,
    report_date: (r.report_date as string | null) ?? null,
    error: (r.error as string | null) ?? null,
  };
}

// Admin-only: enqueue a DWH refresh for the office-PC agent to run.
export async function requestRefresh(): Promise<RefreshRequestRow> {
  const { data, error } = await supabase.rpc("admin_request_refresh");
  if (error) throw new Error(rpcMessage(error));
  const row = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!row) throw new Error("Refresh request returned no row.");
  return mapRefreshRow(row);
}

// Admin-only: latest refresh request (for the button's live status).
export async function fetchRefreshStatus(): Promise<RefreshRequestRow | null> {
  const { data, error } = await supabase.rpc("admin_get_refresh_status");
  if (error) throw new Error(rpcMessage(error));
  const row = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!row) return null;
  return mapRefreshRow(row);
}

// Partner feed (demo retail) daily sales + office P&L (admin-only).
export async function fetchPartnerFeedDailyTotal(): Promise<PartnerFeedDailyTotalRow[]> {
  const { data, error } = await supabase
    .from("partner_feed_daily_total")
    .select("report_date,amount")
    .order("report_date");
  if (error) throw error;
  return (data ?? []) as PartnerFeedDailyTotalRow[];
}

export async function fetchPartnerFeedOfficePl(): Promise<PartnerFeedOfficePlRow[]> {
  const { data, error } = await supabase
    .from("partner_feed_office_pl")
    .select("*")
    .order("period_month", { ascending: false })
    .order("net_sales", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PartnerFeedOfficePlRow[];
}
