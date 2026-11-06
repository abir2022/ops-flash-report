-- ============================================================
-- Ops Flash Report — 00025_employee_update.sql
-- Let the admin change an existing employee's access type
-- (capability): view / romi / both. Mirrors admin_create_employee's
-- 3-way capability -> can_view / can_romi mapping.
-- ============================================================

create or replace function public.admin_update_employee(
  _user_id uuid,
  _capability text
)
returns table (
  user_id uuid, name text, email text, can_view boolean, can_romi boolean
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_view boolean;
  v_romi boolean;
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;

  if not exists (select 1 from public.employees e where e.user_id = _user_id) then
    raise exception 'Employee not found.';
  end if;

  _capability := lower(btrim(coalesce(_capability, '')));
  if _capability not in ('view', 'romi', 'both') then
    raise exception 'Capability must be view, romi or both.';
  end if;

  v_view := _capability in ('view', 'both');
  v_romi := _capability in ('romi', 'both');

  update public.employees e
     set can_view = v_view,
         can_romi = v_romi
   where e.user_id = _user_id;

  return query
    select e.user_id, e.name, e.email, e.can_view, e.can_romi
    from public.employees e
    where e.user_id = _user_id;
end;
$$;
