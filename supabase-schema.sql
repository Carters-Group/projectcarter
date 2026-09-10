-- ============================================================================
--  Project Carter - Supabase schema for accounts + saved calculator reports
-- ----------------------------------------------------------------------------
--  Run this once in the Supabase SQL editor (Dashboard - SQL - New query).
--  It is safe to re-run: every statement guards against "already exists".
--
--  What it creates
--    profiles   one row per signed-up user (name, phone, email, plan)
--    reports    saved calculator runs - the input values only, as JSON
--
--  Security
--    Row Level Security is on for both tables. A signed-in user can only
--    ever read or write their own rows. The anon/public API key you paste
--    into pc-auth.js can therefore be committed to the repo - it grants
--    nothing without a valid user session.
--
--  Subscriptions (later)
--    profiles.subscription_status starts at 'free'. Nothing is paywalled
--    today. When you wire Stripe, flip this column (e.g. to 'active') and
--    tighten the pc_can_save() gate / the reports INSERT policy.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text,
  full_name           text,
  phone               text,
  subscription_status text        not null default 'free',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles - read own"   on public.profiles;
drop policy if exists "profiles - insert own" on public.profiles;
drop policy if exists "profiles - update own" on public.profiles;

create policy "profiles - read own"
  on public.profiles for select
  using ( auth.uid() = id );

create policy "profiles - insert own"
  on public.profiles for insert
  with check ( auth.uid() = id );

create policy "profiles - update own"
  on public.profiles for update
  using ( auth.uid() = id )
  with check ( auth.uid() = id );


-- ---------------------------------------------------------------------------
--  reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  calculator  text        not null check (calculator in ('noi', 'roi', 'da', 'grv')),
  title       text        not null default 'Untitled report',
  inputs      jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists reports_user_idx
  on public.reports (user_id, calculator, updated_at desc);

alter table public.reports enable row level security;

drop policy if exists "reports - read own"   on public.reports;
drop policy if exists "reports - insert own" on public.reports;
drop policy if exists "reports - update own" on public.reports;
drop policy if exists "reports - delete own" on public.reports;

create policy "reports - read own"
  on public.reports for select
  using ( auth.uid() = user_id );

create policy "reports - insert own"
  on public.reports for insert
  with check ( auth.uid() = user_id and public.pc_can_save() );

create policy "reports - update own"
  on public.reports for update
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

create policy "reports - delete own"
  on public.reports for delete
  using ( auth.uid() = user_id );


-- ---------------------------------------------------------------------------
--  pc_can_save()  -  the single subscription gate
--  Today: always true (everything is free). Later: return false unless the
--  caller's profile row has an active plan, or cap the free tier by count.
-- ---------------------------------------------------------------------------
create or replace function public.pc_can_save()
returns boolean
language sql
security definer
set search_path = public
as $$
  select true;
  -- Example paywall for later:
  -- select coalesce(
  --   (select subscription_status = 'active' from public.profiles where id = auth.uid()),
  --   false
  -- )
  -- or (select count(*) from public.reports where user_id = auth.uid()) < 3;
$$;


-- ---------------------------------------------------------------------------
--  keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.pc_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.pc_touch_updated_at();

drop trigger if exists reports_touch on public.reports;
create trigger reports_touch
  before update on public.reports
  for each row execute function public.pc_touch_updated_at();


-- ---------------------------------------------------------------------------
--  auto-create a profile row the moment a user signs up
--  Name / phone come through in the magic-link sign-up metadata; this fills
--  the row so the client does not have to race the first insert.
-- ---------------------------------------------------------------------------
create or replace function public.pc_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.pc_handle_new_user();
