-- Minimal plan setup for Stripe billing. Enforcement stays OFF (pc_config plans_enforced = false).
-- Safe to run more than once.

create table if not exists public.pc_config (
  key   text primary key,
  value text not null
);
alter table public.pc_config enable row level security;   -- no policies: only the functions below can read it
insert into public.pc_config (key, value) values ('plans_enforced', 'false')
  on conflict (key) do nothing;

alter table public.pc_config enable row level security;

alter table public.profiles add column if not exists property_limit     integer not null default 1;
alter table public.profiles add column if not exists properties_created integer not null default 0;

update public.profiles p
   set properties_created = greatest(p.properties_created, s.n)
  from (select user_id, count(*)::int as n from public.properties group by user_id) s
 where s.user_id = p.id;

create or replace function public.pc_plans_enforced()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select value = 'true' from public.pc_config where key = 'plans_enforced'), false);
$$;

create or replace function public.pc_is_paid(status text)
returns boolean
language sql immutable
as $$ select coalesce(status, 'free') in ('active', 'trialing'); $$;

create or replace function public.pc_protect_plan_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.subscription_status := 'free';
      new.property_limit := 1;
      new.properties_created := 0;
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
      new.plan_period_end := null;
    else
      new.subscription_status := old.subscription_status;
      new.property_limit := old.property_limit;
      new.properties_created := old.properties_created;
      /* a browser must never be able to point its account at someone else's Stripe customer */
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
      new.plan_period_end := old.plan_period_end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_plan on public.profiles;
create trigger profiles_protect_plan
  before insert or update on public.profiles
  for each row execute function public.pc_protect_plan_columns();

create or replace function public.pc_plan()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'enforced', public.pc_plans_enforced(),
    'status',   coalesce(p.subscription_status, 'free'),
    'paid',     public.pc_is_paid(p.subscription_status),
    'limit',    case when public.pc_is_paid(p.subscription_status) then p.property_limit else 1 end,
    'created',  p.properties_created,
    'count',    (select count(*) from public.properties where user_id = p.id)
  )
  from public.profiles p where p.id = auth.uid();
$$;

grant execute on function public.pc_plan() to authenticated;
