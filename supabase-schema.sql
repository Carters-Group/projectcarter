-- ============================================================================
--  Project Carter - Supabase schema for accounts + saved calculator reports
-- ----------------------------------------------------------------------------
--  Run this once in the Supabase SQL editor (Dashboard - SQL - New query).
--  It is safe to re-run: every statement guards against "already exists".
--
--  What it creates
--    profiles    one row per signed-up user (name, phone, email, plan)
--    reports     saved calculator runs - the input values only, as JSON
--    properties  a signed-in user's lease register - one row per property
--    leases      one or more leases per property (WALE tracker)
--    avatars     Storage bucket for profile photos (path {auth.uid()}/...)
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
  occupation          text,
  avatar_url          text,
  subscription_status text        not null default 'free',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Added on a table that already exists (re-run safe).
alter table public.profiles add column if not exists occupation text;
alter table public.profiles add column if not exists avatar_url text;

-- Whether this user has ever set a password (vs. magic-link-only). There is
-- no reliable way to tell this apart from auth.users/identities - both
-- magic-link and password sign-in use the same "email" identity provider -
-- so we track it ourselves: set true at sign-up time (via user_metadata,
-- see pc_handle_new_user below) or the moment an existing visitor sets one
-- from the account page (see pcAuth.setPassword). Drives the "set a
-- password" nudge on account.html for magic-link-only visitors.
alter table public.profiles add column if not exists has_password boolean not null default false;

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
--  pc_can_save()  -  the single subscription gate
--  Today: always true (everything is free). Later: return false unless the
--  caller's profile row has an active plan, or cap the free tier by count.
--  Defined here, before the reports table, because its insert policy below
--  references it.
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
--  reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  calculator  text        not null check (calculator in ('noi', 'roi', 'da', 'grv', 'pr', 'cl')),
  title       text        not null default 'Untitled report',
  inputs      jsonb       not null default '{}'::jsonb,
  summary     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists reports_user_idx
  on public.reports (user_id, calculator, updated_at desc);

-- Widen the allowed calculator list on a table that already exists (re-run safe).
alter table public.reports drop constraint if exists reports_calculator_check;
alter table public.reports
  add constraint reports_calculator_check
  check (calculator in ('noi', 'roi', 'da', 'grv', 'pr', 'cl'));

-- Small labelled snapshot of a report's key computed outputs (e.g. a
-- Portfolio Review's usable equity, a DA's cash equity required), stored
-- alongside its inputs so OTHER calculators can pull a figure across without
-- re-running this calculator's model. Added on a table that already exists.
alter table public.reports add column if not exists summary jsonb not null default '{}'::jsonb;

-- One saved report per user can be flagged as their master portfolio (in
-- practice a Portfolio Review). account.html reads it to build the
-- portfolio-overview card; every other calculator only ever reads a
-- one-time figure out of it (pc-report.js "pull a figure"), it never writes
-- back. The partial unique index enforces "at most one master per user" at
-- the database level; the client unsets the old master before setting a new
-- one (see pcAuth.setMasterReport).
alter table public.reports add column if not exists is_master boolean not null default false;

create unique index if not exists reports_one_master_per_user
  on public.reports (user_id) where is_master;

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
--  properties + leases  -  the lease register / WALE tracker on account.html
--  Standalone from `reports` - not tied to any Portfolio Review card, so a
--  visitor can track leases even without a saved PR report.
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  name           text        not null default 'Untitled property',
  property_type  text        not null default 'residential' check (property_type in ('residential', 'commercial')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists properties_user_idx
  on public.properties (user_id, name);

alter table public.properties enable row level security;

drop policy if exists "properties - read own"   on public.properties;
drop policy if exists "properties - insert own" on public.properties;
drop policy if exists "properties - update own" on public.properties;
drop policy if exists "properties - delete own" on public.properties;

create policy "properties - read own"
  on public.properties for select
  using ( auth.uid() = user_id );

create policy "properties - insert own"
  on public.properties for insert
  with check ( auth.uid() = user_id );

create policy "properties - update own"
  on public.properties for update
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

create policy "properties - delete own"
  on public.properties for delete
  using ( auth.uid() = user_id );


-- user_id is denormalized here (rather than joining through properties) so
-- RLS stays a flat auth.uid() = user_id check, same shape as every other
-- table. The client always sets it to the owning property's user_id.
create table if not exists public.leases (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid        not null references public.properties (id) on delete cascade,
  user_id               uuid        not null references auth.users (id) on delete cascade,
  tenant_name           text,
  lease_start           date,
  lease_expiry          date,
  term_label            text,
  in_occupation_since   date,
  next_review_date      date,
  review_frequency      text,
  option_count          integer,
  option_length_years   numeric,
  option_exercise_by    date,
  annual_rent           numeric,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists leases_property_idx
  on public.leases (property_id, lease_expiry);

alter table public.leases enable row level security;

drop policy if exists "leases - read own"   on public.leases;
drop policy if exists "leases - insert own" on public.leases;
drop policy if exists "leases - update own" on public.leases;
drop policy if exists "leases - delete own" on public.leases;

create policy "leases - read own"
  on public.leases for select
  using ( auth.uid() = user_id );

create policy "leases - insert own"
  on public.leases for insert
  with check ( auth.uid() = user_id );

create policy "leases - update own"
  on public.leases for update
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

create policy "leases - delete own"
  on public.leases for delete
  using ( auth.uid() = user_id );


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

drop trigger if exists properties_touch on public.properties;
create trigger properties_touch
  before update on public.properties
  for each row execute function public.pc_touch_updated_at();

drop trigger if exists leases_touch on public.leases;
create trigger leases_touch
  before update on public.leases
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
  insert into public.profiles (id, email, full_name, phone, has_password)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    coalesce((new.raw_user_meta_data ->> 'has_password')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.pc_handle_new_user();


-- ---------------------------------------------------------------------------
--  avatars  -  profile photos in Supabase Storage
-- ---------------------------------------------------------------------------
--  Path: {auth.uid()}/avatar-{unix}.{jpg|png|webp}
--  The bucket is public so the URL stored on profiles.avatar_url works as
--  an <img src>. RLS still limits list / upload / overwrite / delete to the
--  caller's own folder. No service-role key is involved.
--
--  If this insert is blocked in the SQL editor, create the bucket in
--  Dashboard - Storage - New bucket:
--    name: avatars
--    public: yes
--    file size limit: 2 MB
--    allowed MIME types: image/jpeg, image/png, image/webp
--  then re-run this file so the policies apply.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

drop policy if exists "avatars - read own"   on storage.objects;
drop policy if exists "avatars - insert own" on storage.objects;
drop policy if exists "avatars - update own" on storage.objects;
drop policy if exists "avatars - delete own" on storage.objects;

create policy "avatars - read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "avatars - insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "avatars - update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "avatars - delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );


