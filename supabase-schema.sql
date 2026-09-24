-- ============================================================================
--  Project Carter - Supabase schema for accounts + saved calculator reports
-- ----------------------------------------------------------------------------
--  Run this once in the Supabase SQL editor (Dashboard - SQL - New query).
--  It is safe to re-run: every statement guards against "already exists".
--
--  What it creates
--    profiles    one row per signed-up user (name, phone, email, plan)
--    reports     saved calculator runs - the input values only, as JSON
--    properties  a signed-in user's property register - one row per property
--                (lease details plus land tax / capital gains tax details)
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
  calculator  text        not null check (calculator in ('noi', 'roi', 'da', 'grv', 'pr', 'cl', 'dep')),
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
  check (calculator in ('noi', 'roi', 'da', 'grv', 'pr', 'cl', 'dep'));

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

-- Optional link to one property card inside a saved Portfolio Review
-- report - lets the lease register's "Assign to a property card" action
-- keep a property's name/type in step with that report instead of a
-- frozen one-time copy. `on delete set null` so deleting the PR report
-- later doesn't take the lease-register property down with it, it just
-- unlinks. Matched by name (PR cards have no stable id of their own -
-- see pr-calculator.html's pcCalcSummary()), so renaming a card in the PR
-- report will need re-linking.
alter table public.properties add column if not exists linked_pr_report_id uuid references public.reports (id) on delete set null;
alter table public.properties add column if not exists linked_pr_property_name text;

-- Tax details on the property register: land tax (state + ownership + the
-- unimproved land value off the council rates / land tax notice) and a
-- capital gains estimate (cost base + expected sale). All optional; the
-- account page's "Tax position" card only counts a property once it has
-- the fields it needs. `state` and `ownership_type` are also what the land
-- tax aggregation groups by.
alter table public.properties add column if not exists state text
  check (state in ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'));
alter table public.properties add column if not exists ownership_type text not null default 'individual'
  check (ownership_type in ('individual', 'trust', 'company', 'super'));
alter table public.properties add column if not exists land_value numeric;
alter table public.properties add column if not exists wa_metro boolean not null default false;
alter table public.properties add column if not exists purchase_date date;
alter table public.properties add column if not exists purchase_price numeric;
alter table public.properties add column if not exists acquisition_costs numeric;
alter table public.properties add column if not exists improvements numeric;
alter table public.properties add column if not exists capital_works_claimed numeric;
alter table public.properties add column if not exists is_new_build boolean not null default false;
alter table public.properties add column if not exists planned_sale_date date;
alter table public.properties add column if not exists expected_sale_price numeric;
alter table public.properties add column if not exists value_at_jul_2027 numeric;

-- What it is worth and owes today, and what it costs to hold. The property
-- register is the single source of truth for the portfolio figures (equity,
-- LVR, useable equity, cash flow, cash in hand if sold): blank means "not
-- entered", 0 means none (a 0 loan balance is a property with no loan).
-- expected_sale_price above now means "sale price if sold" and defaults to
-- current_value when blank.
alter table public.properties add column if not exists current_value numeric;
alter table public.properties add column if not exists loan_balance numeric;
alter table public.properties add column if not exists interest_rate numeric;
alter table public.properties add column if not exists annual_running_costs numeric;

-- Portfolio-level tax settings (other taxable income, CPI assumption,
-- selling-cost %, taxable land held outside the register per state). One
-- small JSON blob per user; deliberately NOT in pc-auth.js's PROFILE_COLS so
-- sign-in still works if this migration hasn't been run yet.
alter table public.profiles add column if not exists tax_settings jsonb;

-- Name of the entity that holds a property (for example a company set up for one
-- large purchase). Land tax is worked out per entity, so a separate entity gets
-- its own threshold. Blank = held in the owner's own name.
alter table public.properties add column if not exists holding_entity text;

-- A property that has been sold. It leaves every portfolio figure (value,
-- debt, cash flow, land tax, leases) but stays on the account so its capital
-- gains workings are there for the accountant. The sale itself is the
-- existing planned_sale_date (sale contract date) and expected_sale_price.
alter table public.properties add column if not exists is_sold boolean not null default false;

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

-- Residential leases ask different questions to commercial ones (rent
-- quoted weekly/monthly rather than per annum, often periodic/month-to-month
-- rather than a hard expiry) - these three are residential-specific, added
-- on a table that may already exist (re-run safe).
alter table public.leases add column if not exists is_periodic boolean not null default false;
alter table public.leases add column if not exists rent_amount numeric;
alter table public.leases add column if not exists rent_frequency text check (rent_frequency in ('weekly', 'monthly'));

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




-- ============================================================================
--  PLANS  -  free first property, paid property limit, no recycling the free slot
-- ----------------------------------------------------------------------------
--  Everything below is DORMANT until you switch enforcement on:
--
--      update public.pc_config set value = 'true' where key = 'plans_enforced';
--
--  Until then the site behaves exactly as before (no limits, nothing locked),
--  so this section is safe to run on production ahead of Stripe going live.
--  Run it on the STAGING project first and flip the switch there to test.
--
--  The rules (once enforced)
--    free account   one property, ever. The counter never goes down when a
--                   property is deleted, so delete-and-re-add gains nothing
--                   (an untouched blank card is the one exception, so clicking
--                   "Add a property" by mistake does not burn the slot).
--                   Name, type, state, purchase date, purchase price and buying
--                   costs lock once saved, so the one property cannot be edited
--                   into a different one. Figures that really change (value,
--                   loan, rent, running costs) stay editable.
--    paid account   subscription_status active/trialing. Up to property_limit
--                   properties at once, edit anything. The Stripe webhook (service
--                   role) writes subscription_status and property_limit.
--    a second account by the same person is caught by pc_email_key(): dots and
--    +tags in Gmail addresses collapse to one key, and the claim survives the
--    account being deleted.
-- ============================================================================

create table if not exists public.pc_config (
  key   text primary key,
  value text not null
);
alter table public.pc_config enable row level security;   -- no policies: only the functions below can read it
insert into public.pc_config (key, value) values ('plans_enforced', 'false')
  on conflict (key) do nothing;

alter table public.profiles add column if not exists property_limit    integer not null default 1;
alter table public.profiles add column if not exists properties_created integer not null default 0;

-- Stripe billing: written only by the webhook (service role), see the trigger below
alter table public.profiles add column if not exists stripe_customer_id     text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists plan_period_end        timestamptz;
create index if not exists profiles_stripe_customer_idx on public.profiles (stripe_customer_id);

-- existing accounts: count what they already have so the counter starts true
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

-- past_due counts as paid: a failed renewal keeps working while Stripe retries
-- the card. Once Stripe gives up the subscription is cancelled and the webhook
-- writes 'canceled'.
create or replace function public.pc_is_paid(status text)
returns boolean
language sql immutable
as $$ select coalesce(status, 'free') in ('active', 'trialing', 'past_due'); $$;

-- a paid plan that has ended, on an account holding more than the free
-- property: everything stays visible and can be deleted, nothing can be
-- edited or added until they renew. Down to one property it is a free account.
create or replace function public.pc_is_read_only(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.pc_plans_enforced()
     and coalesce((select subscription_status = 'canceled' from public.profiles where id = uid), false)
     and (select count(*) from public.properties where user_id = uid) > 1;
$$;

-- one address, one free property: collapse the tricks people use for "new" emails
create or replace function public.pc_email_key(e text)
returns text
language plpgsql immutable
as $$
declare
  local_part text;
  dom text;
begin
  e := lower(trim(coalesce(e, '')));
  if position('@' in e) = 0 then return e; end if;
  local_part := split_part(split_part(e, '@', 1), '+', 1);
  dom := split_part(e, '@', 2);
  if dom in ('gmail.com', 'googlemail.com') then
    dom := 'gmail.com';
    local_part := replace(local_part, '.', '');
  end if;
  return local_part || '@' || dom;
end;
$$;

-- who has used their free property. No foreign key on purpose: it must outlive
-- the account. No policies: only the security definer functions touch it.
create table if not exists public.pc_free_claims (
  email_key  text primary key,
  user_id    uuid not null,
  claimed_at timestamptz not null default now()
);
alter table public.pc_free_claims enable row level security;

-- Clients (anon/authenticated) can never write the plan columns themselves.
-- Without this, "profiles - update own" would let anyone set their own
-- subscription_status to 'active' from the browser console. The service role
-- (Stripe webhook) and the SQL editor are not "authenticated"/"anon", so they pass.
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

-- adding a property
create or replace function public.pc_properties_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  prof   record;
  claim  record;
  ekey   text;
  cnt    integer;
begin
  if not public.pc_plans_enforced() then return new; end if;
  if auth.uid() is null then return new; end if;   -- service role / SQL editor

  select subscription_status, property_limit, properties_created, email
    into prof from public.profiles where id = new.user_id;

  if public.pc_is_read_only(new.user_id) then
    raise exception 'pc_read_only: your plan has ended, renew to add or edit properties';
  end if;

  if public.pc_is_paid(prof.subscription_status) then
    select count(*) into cnt from public.properties where user_id = new.user_id;
    if cnt >= coalesce(prof.property_limit, 1) then
      raise exception 'pc_property_limit: your plan covers % properties', coalesce(prof.property_limit, 1);
    end if;
    return new;
  end if;

  if coalesce(prof.properties_created, 0) >= 1 then
    raise exception 'pc_free_used: the free plan covers your first property';
  end if;

  ekey := public.pc_email_key(coalesce(prof.email, (select email from auth.users where id = new.user_id)));
  select * into claim from public.pc_free_claims where email_key = ekey;
  if found and claim.user_id <> new.user_id then
    raise exception 'pc_free_used: the free property for this email address has already been used';
  end if;
  insert into public.pc_free_claims (email_key, user_id) values (ekey, new.user_id)
    on conflict (email_key) do nothing;
  return new;
end;
$$;

drop trigger if exists properties_before_insert_plan on public.properties;
create trigger properties_before_insert_plan
  before insert on public.properties
  for each row execute function public.pc_properties_before_insert();

-- the counter only ever goes up (always on, so it is accurate when you enforce)
create or replace function public.pc_properties_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles set properties_created = properties_created + 1 where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists properties_after_insert_plan on public.properties;
create trigger properties_after_insert_plan
  after insert on public.properties
  for each row execute function public.pc_properties_after_insert();

-- deleting a card that was never filled in gives the slot back; anything real does not
create or replace function public.pc_properties_after_delete()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(nullif(trim(old.name), ''), 'Untitled property') = 'Untitled property'
     and old.purchase_price is null and old.purchase_date is null
     and old.current_value is null and old.loan_balance is null then
    update public.profiles set properties_created = greatest(0, properties_created - 1) where id = old.user_id;
  end if;
  return old;
end;
$$;

drop trigger if exists properties_after_delete_plan on public.properties;
create trigger properties_after_delete_plan
  after delete on public.properties
  for each row execute function public.pc_properties_after_delete();

-- editing: on the free plan the acquisition facts lock once they are set
create or replace function public.pc_properties_before_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  status text;
  named  boolean;
begin
  if not public.pc_plans_enforced() then return new; end if;
  if auth.uid() is null then return new; end if;

  select subscription_status into status from public.profiles where id = new.user_id;
  if public.pc_is_paid(status) then return new; end if;

  if public.pc_is_read_only(new.user_id) then
    raise exception 'pc_read_only: your plan has ended, renew to add or edit properties';
  end if;

  named := coalesce(nullif(trim(old.name), ''), 'Untitled property') <> 'Untitled property';
  if named and new.name is distinct from old.name then
    raise exception 'pc_locked_field: the property name is set once on the free plan';
  end if;
  if named and new.property_type is distinct from old.property_type then
    raise exception 'pc_locked_field: the property type is set once on the free plan';
  end if;
  if old.state is not null and new.state is distinct from old.state then
    raise exception 'pc_locked_field: the state is set once on the free plan';
  end if;
  if old.purchase_date is not null and new.purchase_date is distinct from old.purchase_date then
    raise exception 'pc_locked_field: the purchase date is set once on the free plan';
  end if;
  if old.purchase_price is not null and new.purchase_price is distinct from old.purchase_price then
    raise exception 'pc_locked_field: the purchase price is set once on the free plan';
  end if;
  if old.acquisition_costs is not null and new.acquisition_costs is distinct from old.acquisition_costs then
    raise exception 'pc_locked_field: the buying costs are set once on the free plan';
  end if;
  return new;
end;
$$;

drop trigger if exists properties_before_update_plan on public.properties;
create trigger properties_before_update_plan
  before update on public.properties
  for each row execute function public.pc_properties_before_update();

-- leases follow their property: read-only while a lapsed plan is read-only
-- (deleting stays allowed, as for properties)
create or replace function public.pc_leases_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if public.pc_is_read_only(new.user_id) then
    raise exception 'pc_read_only: your plan has ended, renew to add or edit properties';
  end if;
  return new;
end;
$$;

drop trigger if exists leases_before_write_plan on public.leases;
create trigger leases_before_write_plan
  before insert or update on public.leases
  for each row execute function public.pc_leases_before_write();

-- what the page asks: {enforced, status, paid, limit, created, count}
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
    'count',    (select count(*) from public.properties where user_id = p.id),
    'readonly', public.pc_is_read_only(p.id)
  )
  from public.profiles p where p.id = auth.uid();
$$;

grant execute on function public.pc_plan() to authenticated;
