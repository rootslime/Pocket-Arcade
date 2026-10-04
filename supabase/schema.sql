-- Pocket Arcade: database schema + Row Level Security for Supabase (Postgres).
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is idempotent, so running it again is safe.

-- ---------------------------------------------------------------------------
-- 1. Public-facing profile (display name + avatar only). NO email, NO progress data.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  avatar       text not null default 'initials' check (char_length(avatar) <= 24),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Private progress document (scores, XP, achievements, preferences, unlocks)
-- ---------------------------------------------------------------------------
create table if not exists public.player_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  -- keep documents small: protects the free tier from abuse
  constraint player_data_size check (octet_length(data::text) < 200000)
);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security: every row is only visible/editable by its owner.
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.player_data enable row level security;

drop policy if exists "profiles: owner can read"   on public.profiles;
drop policy if exists "profiles: owner can insert" on public.profiles;
drop policy if exists "profiles: owner can update" on public.profiles;
drop policy if exists "profiles: owner can delete" on public.profiles;
create policy "profiles: owner can read"   on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles: owner can insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles: owner can update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: owner can delete" on public.profiles for delete to authenticated using (auth.uid() = id);

drop policy if exists "player_data: owner can read"   on public.player_data;
drop policy if exists "player_data: owner can insert" on public.player_data;
drop policy if exists "player_data: owner can update" on public.player_data;
drop policy if exists "player_data: owner can delete" on public.player_data;
create policy "player_data: owner can read"   on public.player_data for select to authenticated using (auth.uid() = user_id);
create policy "player_data: owner can insert" on public.player_data for insert to authenticated with check (auth.uid() = user_id);
create policy "player_data: owner can update" on public.player_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "player_data: owner can delete" on public.player_data for delete to authenticated using (auth.uid() = user_id);

-- Anonymous (logged-out) visitors get no access at all.
revoke all on public.profiles    from anon;
revoke all on public.player_data from anon;
grant select, insert, update, delete on public.profiles    to authenticated;
grant select, insert, update, delete on public.player_data to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Create a profile row automatically when someone signs up.
--    The display name comes from the sign-up form (or Google's name) and is sanitised here.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  raw_name text;
begin
  raw_name := coalesce(
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1),
    'Player'
  );
  raw_name := left(regexp_replace(raw_name, '[^A-Za-z0-9 _.-]', '', 'g'), 24);
  if char_length(raw_name) = 0 then raw_name := 'Player'; end if;
  insert into public.profiles (id, display_name) values (new.id, raw_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. Keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists player_data_touch on public.player_data;
create trigger player_data_touch before update on public.player_data for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Future public leaderboards: do NOT make the tables above public. Create a separate table or view
-- that contains only intentionally public columns (display_name, best score) and give it its own policy.
-- ---------------------------------------------------------------------------
