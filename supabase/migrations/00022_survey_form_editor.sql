-- 00022_survey_form_editor.sql
-- Admin management for the ROMI survey form definition (public.romi_survey_form).
-- Adds an admin read + save pair so the survey questions (title / description /
-- JSONB field list / active flag) can be edited from the web UI. Idempotent.

-- Read the single active survey form (or the most recent if none is active).
create or replace function public.admin_get_survey_form()
returns table (
  id          bigint,
  title       text,
  description text,
  fields      jsonb,
  is_active   boolean
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
    select f.id, f.title, f.description, f.fields, f.is_active
    from public.romi_survey_form f
    order by f.is_active desc, f.created_at desc
    limit 1;
end;
$$;

-- Save a new survey form definition. When the form is active, any previously
-- active definition is deactivated (single-active-form model, history kept).
create or replace function public.admin_save_survey_form(
  _title       text,
  _description text,
  _fields      jsonb,
  _is_active   boolean default true
)
returns bigint
language plpgsql volatile security definer
set search_path = public
as $$
declare
  _new_id bigint;
begin
  if not public.auth_is_admin() then
    raise exception 'Admin access required';
  end if;

  if _title is null or trim(_title) = '' then
    raise exception 'Survey title is required';
  end if;

  if _fields is null or jsonb_typeof(_fields) <> 'array' then
    raise exception 'Survey fields must be an array';
  end if;

  if _is_active then
    update public.romi_survey_form
       set is_active = false
     where is_active = true;
  end if;

  insert into public.romi_survey_form (title, description, fields, is_active)
  values (_title, nullif(trim(_description), ''), _fields, _is_active)
  returning id into _new_id;

  return _new_id;
end;
$$;
