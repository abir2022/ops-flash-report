-- Schema migrations ledger: records which numbered migrations have been
-- applied to the live DB. The apply script (scripts/apply_migrations.py)
-- consults this table so the repo and the live DB cannot silently drift.
--
-- Backfilled with every migration already applied before this ledger existed.

create table if not exists public.schema_migrations (
  version integer primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

alter table public.schema_migrations enable row level security;

insert into public.schema_migrations (version, name)
select v, n
from (values
  (1, '00001_init'),
  (2, '00002_rls'),
  (3, '00003_views_by_date'),
  (4, '00004_sbu_section'),
  (5, '00005_advanced_analysis'),
  (6, '00006_forecast'),
  (7, '00007_forecast_history'),
  (8, '00008_guest_access'),
  (9, '00009_guest_management'),
  (10, '00010_biir'),
  (11, '00011_marketing'),
  (12, '00012_marketing_detail'),
  (13, '00013_romi_integration'),
  (14, '00014_officer_role'),
  (15, '00015_fix_officer_create'),
  (16, '00016_survey_link'),
  (17, '00017_officer_multi_sbu'),
  (18, '00018_refresh_button'),
  (19, '00019_campaignable_spend'),
  (20, '00020_credential_recovery'),
  (21, '00021_employee_model'),
  (22, '00022_survey_form_editor'),
  (23, '00023_default_survey_form')
) as t(v, n)
on conflict (version) do nothing;
