-- 00023_default_survey_form.sql
-- Seed the ROMI survey form with the standard "Input Campaign" questions
-- (mirrors the Automated ROMI officer portal's Input Campaign survey). Idempotent:
-- only inserts when no survey form exists yet, so admin edits are never
-- overwritten by a re-run.

insert into public.romi_survey_form (title, description, fields, is_active)
select
  'Campaign Submission',
  'Standard campaign questions collected from ROMI users (matches the Input Campaign survey).',
  $json$[
    {"key":"campaign_name","label":"Campaign Name","type":"text","required":true},
    {"key":"category","label":"Category","type":"select","required":true,"options":["NXAT","Digital","BTL","Outdoor","Gift & Printing","Research","Trade Incentive Offer","Other"]},
    {"key":"start_date","label":"Start Date","type":"date","required":true},
    {"key":"end_date","label":"End Date","type":"date","required":true},
    {"key":"expense","label":"Campaign Expense (BDT)","type":"number","required":true}
  ]$json$::jsonb,
  true
where not exists (select 1 from public.romi_survey_form);
