// Data contracts matching the Supabase views. Field names must stay in
// sync with supabase/migrations and flash_etl/models.py.

export interface ScorecardRow {
  sbu_id: number;
  code: string;
  name: string | null;
  section: string | null;
  is_freight: boolean;
  channel: string;
  src: string | null;
  daily_rev: number | null;
  dod_rev: number | null;
  mtd_rev: number | null;
  mom_rev: number | null;
  yoy_rev: number | null;
  fy_ytd_rev: number | null;
  cy_ytd_rev: number | null;
  daily_vol: number | null;
  dod_vol: number | null;
  mtd_vol: number | null;
  mom_vol: number | null;
  vol_uom: string | null;
  has_vol: boolean;
  mo_tgt_rev: number | null;
  mtd_tgt_rev: number | null;
  mo_tgt_vol: number | null;
  mtd_tgt_vol: number | null;
  mtd_ach_pct: number | null;
  mom_pct: number | null;
  yoy_pct: number | null;
  proj_rev: number | null;
  momentum: string | null;
  report_date: string;
}

export interface Kpi {
  report_date: string | null;
  total_daily: number;
  total_mtd: number;
  total_fy_ytd: number;
  total_cy_ytd: number;
  active_sbus: number;
  sbus_with_target: number;
  avg_ach_pct: number | null;
}

export interface Reconciliation {
  report_date: string;
  g1all: number | null;
  excl: number | null;
  g2all: number | null;
  g5all: number | null;
  g6all: number | null;
  g4all: number | null;
  rpt_gl1: number | null;
  rpt_frt: number | null;
  rpt_tot: number | null;
  full_tot: number | null;
  gap: number | null;
}

export interface Freshness {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  report_date: string | null;
  dwh_latest_post: string | null;
  dwh_synced_at: string | null;
  error: string | null;
  meta: Record<string, unknown> | null;
}

export interface TrendPoint {
  sbu_id: number;
  d: string;
  channel: string;
  value: number;
}

export interface SbuDim {
  id: number;
  code: string;
  name: string | null;
  section: string | null;
  is_freight: boolean;
}

export interface SbuDailyPoint {
  d: string;
  value: number;
  quantity: number | null;
}

export interface SkuSaleRow {
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  category_name: string | null;
  quantity: number | null;
  uom: string | null;
  value: number;
}

export interface SbuMonthlyTarget {
  sbu_id: number;
  period_month: string; // "YYYY-MM"
  mo_target_rev: number | null;
  mo_target_vol: number | null;
}

export type SortKey =
  | "mtd_rev"
  | "daily_rev"
  | "code"
  | "mtd_ach_pct"
  | "mom_pct"
  | "yoy_pct"
  | "proj_rev";

// External intelligence signal row (public.biir_signal, BIIR tab).
// Field names must stay in sync with supabase/migrations/00010_biir.sql.
export interface BiirSignalRow {
  id: string;
  category: string;
  name: string;
  value: number | null;
  unit: string | null;
  change_pct: number | null;
  direction: string | null;
  severity: string;
  note: string | null;
  source: string | null;
  updated_at: string | null;
}

// Marketing spend row (public.v_marketing_spend, Marketing Analysis tab).
// Field names must stay in sync with supabase/migrations/00011_marketing.sql.
export interface MarketingSpendRow {
  sbu_id: number;
  code: string;
  name: string | null;
  section: string | null;
  report_date: string;
  mtd_spend: number | null;
  mom_spend: number | null;
  yoy_spend: number | null;
  fy_ytd_spend: number | null;
}

// SubGL purpose breakdown (public.v_marketing_spend_detail).
export interface MarketingSpendDetailRow {
  sbu_id: number;
  code: string;
  name: string | null;
  section: string | null;
  report_date: string;
  subgl_code: string;
  subgl_name: string;
  mtd_spend: number | null;
}

// Monthly marketing spend series (public.v_marketing_spend_monthly).
export interface MarketingSpendMonthlyRow {
  sbu_id: number;
  code: string;
  name: string | null;
  period_month: string;
  spend: number | null;
}

// Campaign ledger row (public.v_romi_campaign). The base engine columns and
// the *_ov overrides are both present; the effective value is COALESCE(ov, base)
// computed client-side (lib/romi.ts). Field names stay in sync with
// supabase/migrations/00013 + 00014.
export interface RomiCampaignRow {
  id: number;
  business_unit_id: number;
  sbu_id: number | null;
  code: string | null;
  sbu_name: string | null;
  section: string | null;
  campaign_name: string;
  category: string | null;
  report_month: string | null;
  start_date: string | null;
  end_date: string | null;
  officer_name: string | null;
  officer_enroll: string | null;
  marketing_expense_total: number | null;
  extra_fields: Record<string, unknown> | null;
  // engine-computed base values
  actual_rev: number | null;
  organic_rev: number | null;
  organic_rev_sply: number | null;
  sply_rev: number | null;
  gp_margin: number | null;
  spend_pool_total: number | null;
  n_months: number | null;
  as_of: string | null;
  // admin overrides
  actual_rev_ov: number | null;
  organic_rev_ov: number | null;
  sply_rev_ov: number | null;
  gp_margin_ov: number | null;
  incr_rev_ov: number | null;
  actual_profit_ov: number | null;
  base_profit_ov: number | null;
  sply_profit_ov: number | null;
  incr_profit_ov: number | null;
  romi_top_ov: number | null;
  romi_bottom_ov: number | null;
  // branch-mark benchmark (from romi_sbu)
  benchmark_top: number | null;
  benchmark_bottom: number | null;
  benchmark_note: string | null;
}

// ROMI SBU dimension (public.v_romi_sbu).
export interface RomiSbuRow {
  business_unit_id: number;
  code: string | null;
  name: string | null;
  gp_margin: number | null;
  benchmark_top: number | null;
  benchmark_bottom: number | null;
  benchmark_note: string | null;
  mkt_led_target_min_cr: number | null;
  mkt_led_target_max_cr: number | null;
  is_active: boolean | null;
  sbu_id: number | null;
}

// Survey form definition (public.romi_survey_form).
export interface RomiSurveyField {
  key: string;
  label: string;
  type: string; // "text" | "number" | "select"
  required: boolean;
  options?: string[];
}

export interface RomiSurveyForm {
  id: number;
  title: string;
  description: string | null;
  fields: RomiSurveyField[];
  is_active: boolean;
}

// Employee capability: view (read-only SBU dashboard) / romi (campaign
// entry) / both.
export type EmployeeCapability = "view" | "romi" | "both";

// Employee self profile (employee_profile() RPC). An employee may be
// tagged to one or many SBUs; the parallel arrays are ordered by sbu id.
export interface EmployeeProfile {
  name: string;
  email: string;
  phone: string | null;
  allowed_sbus: number[];
  sbu_codes: string[];
  sbu_names: (string | null)[];
  can_view: boolean;
  can_romi: boolean;
}

// Employee-manageable row (admin_list_employees() RPC).
export interface EmployeeRow {
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  password: string | null;
  allowed_sbus: number[];
  sbu_codes: string[];
  sbu_names: (string | null)[];
  capability: EmployeeCapability;
  can_view: boolean;
  can_romi: boolean;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

// Web-triggered refresh request (public.refresh_requests). Written by the
// admin "Refresh database" button, claimed by the office-PC agent.
export interface RefreshRequestRow {
  id: number;
  status: "pending" | "running" | "success" | "failed";
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  report_date: string | null;
  error: string | null;
}

// Partner feed (demo retail-chain source) rows. Money is raw BDT (Tk),
// not crore. Field names stay in sync with supabase/migrations/00027_partner_feed.
export interface PartnerFeedDailyTotalRow {
  report_date: string;
  amount: number;
}

export interface PartnerFeedOfficePlRow {
  period_month: string;
  office_id: number;
  office_name: string;
  department_name: string;
  quantity: number;
  net_sales: number;
  cost: number;
  profit: number;
  margin: number;
}
