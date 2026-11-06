-- 00029_campaign_expense_actual.sql
-- Campaign expenses are ACTUALS (already incurred), not planned. An officer
-- reports the cumulative spend from campaign start through the reporting month,
-- and the reporting month is the previous (last closed) month — not the
-- campaign's end date. This updates the employee submit RPC and the form.

create or replace function public.employee_submit_campaign(
  _sbu_id integer,
  _campaign_name text,
  _category text,
  _start_date date,
  _end_date date,
  _marketing_expense_total double precision,
  _extra_fields jsonb default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_bu bigint;
  v_id bigint;
begin
  if not public.auth_is_employee() then
    raise exception 'forbidden';
  end if;
  if not public.auth_can_romi() then
    raise exception 'This account cannot submit campaigns.';
  end if;

  select * into v_employee from public.employees e where e.user_id = auth.uid();
  if not found then
    raise exception 'Employee profile not found.';
  end if;

  if not (_sbu_id = any(v_employee.allowed_sbus)) then
    raise exception 'This SBU is not assigned to you.';
  end if;
  if coalesce(btrim(_campaign_name), '') = '' then
    raise exception 'Campaign name is required.';
  end if;
  if _start_date is null or _end_date is null or _end_date < _start_date then
    raise exception 'Invalid campaign dates.';
  end if;
  if coalesce(_marketing_expense_total, 0) <= 0 then
    raise exception 'Marketing expense must be greater than zero.';
  end if;

  select m.business_unit_id into v_bu
  from public.sbu_romi_map m
  where m.sbu_id = _sbu_id;
  if v_bu is null then
    raise exception 'This SBU is not mapped to a ROMI business unit yet.';
  end if;

  insert into public.romi_campaign (
    business_unit_id, campaign_name, category, report_month,
    start_date, end_date, officer_name, officer_enroll,
    marketing_expense_total, extra_fields
  ) values (
    v_bu, btrim(_campaign_name), btrim(coalesce(_category, 'Other')),
    to_char((now() at time zone 'Asia/Dhaka')::date - interval '1 month', 'YYYY-MM'),
    _start_date, _end_date, v_employee.name, v_employee.email,
    _marketing_expense_total, _extra_fields
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Relabel the expense field and clarify the actuals / cumulative rule.
update public.romi_survey_form
set fields = (
    select jsonb_agg(x.elem order by x.ord)
    from (
        select
            case
                when e.elem ->> 'key' = 'expense'
                then e.elem || '{"label": "Actual Expense to Date (BDT)"}'::jsonb
                else e.elem
            end as elem,
            e.ord
        from jsonb_array_elements(fields) with ordinality as e(elem, ord)
    ) x
),
description = 'Standard campaign questions collected from ROMI users. Expenses are actuals already incurred: for a multi-month campaign enter the cumulative spend from campaign start through the reporting (previous) month; for a single-month campaign enter only the cost of that month.'
where title = 'Campaign Submission';
