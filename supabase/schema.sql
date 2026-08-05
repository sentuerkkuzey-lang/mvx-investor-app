-- ============================================================
-- MVX Investor Portal - Datenbankschema mit Row Level Security
-- In Supabase: SQL Editor -> diese Datei komplett einfügen -> Run
-- ============================================================

-- ---------- PROFILES ----------
-- Ein Profil pro Auth-User. Passwörter werden NICHT hier gespeichert,
-- die verwaltet Supabase Auth sicher gehasht.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null default 'investor' check (role in ('owner','investor')),
  shares integer not null default 0 check (shares >= 0),
  first_login boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Hilfsfunktion: prüft ob der aktuell eingeloggte User Owner ist.
-- security definer = läuft mit erhöhten Rechten, damit die Prüfung
-- selbst nicht wieder an RLS scheitert.
create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

drop policy if exists "profiles_select_own_or_owner" on public.profiles;
create policy "profiles_select_own_or_owner"
on public.profiles for select
using (auth.uid() = id or public.is_owner());

-- Investoren dürfen ihre eigene Zeile nur für den Erstlogin-Status
-- aktualisieren (siehe ForcePasswordChange), nicht ihre role/shares.
-- Das übernimmt ausschließlich der Owner (Policy unten).
drop policy if exists "profiles_update_own_first_login" on public.profiles;
create policy "profiles_update_own_first_login"
on public.profiles for update
using (auth.uid() = id)
with check (
  auth.uid() = id
  and role = (select role from public.profiles where id = auth.uid())
  and shares = (select shares from public.profiles where id = auth.uid())
);

drop policy if exists "profiles_owner_manage" on public.profiles;
create policy "profiles_owner_manage"
on public.profiles for all
using (public.is_owner())
with check (public.is_owner());

-- Automatisch ein Profil anlegen, sobald ein neuer Auth-User entsteht
-- (durch die create-investor Edge Function).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, shares, first_login)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'investor'),
    coalesce((new.raw_user_meta_data->>'shares')::int, 0),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Anteile eines Investors erhöhen - atomar, nur durch den Owner.
-- (Direktes "update shares = shares + x" vom Client wäre bei mehreren
-- gleichzeitigen Anfragen nicht race-condition-sicher, diese Funktion
-- läuft dagegen als einzelne atomare Datenbank-Transaktion.)
create or replace function public.owner_add_shares(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Nur der Owner darf Anteile vergeben.';
  end if;

  if p_amount = 0 then
    return;
  end if;

  update public.profiles
  set shares = greatest(0, shares + p_amount)
  where id = p_user_id;

  if not found then
    raise exception 'Investor nicht gefunden.';
  end if;
end;
$$;

grant execute on function public.owner_add_shares(uuid, integer) to authenticated;

-- ============================================================
-- ERSTEN OWNER ANLEGEN (einmalig, manuell):
-- 1. Supabase Dashboard -> Authentication -> Add user -> Create new user
--    (E-Mail + Passwort setzen, "Auto Confirm User" aktivieren)
-- 2. Danach in diesem SQL Editor ausführen (E-Mail anpassen):
--
--    update public.profiles
--    set role = 'owner', first_login = false, full_name = 'MVX Owner'
--    where email = 'owner@deine-domain.de';
-- ============================================================
