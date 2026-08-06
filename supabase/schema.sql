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

-- ============================================================
-- ABSTIMMUNGEN (Polls)
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  description text,
  created_by uuid not null references public.profiles(id),
  status text not null default 'open' check (status in ('open','closed')),
  urgency text not null default 'normal' check (urgency in ('normal','urgent','emergency')),
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.polls add column if not exists urgency text not null default 'normal';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'polls_urgency_check'
  ) then
    alter table public.polls add constraint polls_urgency_check
      check (urgency in ('normal','urgent','emergency'));
  end if;
end $$;

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  position integer not null default 0
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_id)
);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.votes enable row level security;

-- Jeder eingeloggte User darf Abstimmungen und Optionen lesen.
-- Anlegen/Ändern/Löschen läuft ausschließlich über die Funktionen
-- unten (security definer), es gibt bewusst keine insert/update/delete
-- Policy, damit niemand am Client vorbei direkt schreiben kann.
drop policy if exists "polls_select_all" on public.polls;
create policy "polls_select_all"
on public.polls for select
using (auth.uid() is not null);

drop policy if exists "poll_options_select_all" on public.poll_options;
create policy "poll_options_select_all"
on public.poll_options for select
using (auth.uid() is not null);

-- Bei den einzelnen Stimmen sieht jeder nur seine eigene Zeile (um zu
-- wissen, was er selbst gewählt hat), der Owner sieht alle. Die
-- aggregierten Ergebnisse (wer wie oft) laufen über die Funktion
-- poll_option_results, nicht über direktes Lesen dieser Tabelle.
drop policy if exists "votes_select_own_or_owner" on public.votes;
create policy "votes_select_own_or_owner"
on public.votes for select
using (auth.uid() = voter_id or public.is_owner());

-- Neue Abstimmung erstellen (nur Owner), inkl. Optionen, atomar.
create or replace function public.create_poll(
  p_question text,
  p_description text,
  p_options text[],
  p_closes_at timestamptz default null,
  p_urgency text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll_id uuid;
  v_option text;
  v_position integer := 0;
begin
  if not public.is_owner() then
    raise exception 'Nur der Owner darf Abstimmungen erstellen.';
  end if;

  if p_question is null or length(trim(p_question)) = 0 then
    raise exception 'Frage darf nicht leer sein.';
  end if;

  if array_length(p_options, 1) is null or array_length(p_options, 1) < 2 then
    raise exception 'Mindestens 2 Optionen erforderlich.';
  end if;

  if p_urgency not in ('normal', 'urgent', 'emergency') then
    raise exception 'Ungültige Dringlichkeit.';
  end if;

  insert into public.polls (question, description, created_by, closes_at, urgency)
  values (
    trim(p_question),
    nullif(trim(coalesce(p_description, '')), ''),
    auth.uid(),
    p_closes_at,
    p_urgency
  )
  returning id into v_poll_id;

  foreach v_option in array p_options loop
    if length(trim(v_option)) > 0 then
      insert into public.poll_options (poll_id, label, position)
      values (v_poll_id, trim(v_option), v_position);
      v_position := v_position + 1;
    end if;
  end loop;

  return v_poll_id;
end;
$$;

grant execute on function public.create_poll(text, text, text[], timestamptz, text) to authenticated;

-- Abstimmung schließen (nur Owner) - danach kann niemand mehr abstimmen.
create or replace function public.close_poll(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Nur der Owner darf Abstimmungen schließen.';
  end if;

  update public.polls set status = 'closed' where id = p_poll_id;
end;
$$;

grant execute on function public.close_poll(uuid) to authenticated;

-- Stimme abgeben bzw. ändern, solange die Abstimmung offen ist.
create or replace function public.cast_vote(p_poll_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.polls where id = p_poll_id;

  if v_status is null then
    raise exception 'Abstimmung nicht gefunden.';
  end if;

  if v_status <> 'open' then
    raise exception 'Diese Abstimmung ist bereits geschlossen.';
  end if;

  if not exists (
    select 1 from public.poll_options where id = p_option_id and poll_id = p_poll_id
  ) then
    raise exception 'Ungültige Option.';
  end if;

  insert into public.votes (poll_id, option_id, voter_id)
  values (p_poll_id, p_option_id, auth.uid())
  on conflict (poll_id, voter_id)
  do update set option_id = excluded.option_id, created_at = now();
end;
$$;

grant execute on function public.cast_vote(uuid, uuid) to authenticated;

-- Aggregierte Ergebnisse pro Option (keine einzelnen Wähler sichtbar).
create or replace function public.poll_option_results(p_poll_id uuid)
returns table(option_id uuid, label text, "position" integer, vote_count bigint)
language sql
security definer
set search_path = public
as $$
  select o.id, o.label, o.position, count(v.id)
  from public.poll_options o
  left join public.votes v on v.option_id = o.id
  where o.poll_id = p_poll_id
  group by o.id, o.label, o.position
  order by o.position;
$$;

grant execute on function public.poll_option_results(uuid) to authenticated;
-- ============================================================

-- ============================================================
-- PUSH-BENACHRICHTIGUNGEN
-- ============================================================

-- Ein Gerät/Browser-Abo pro Zeile. Jede Person verwaltet nur ihre
-- eigenen Abos direkt (kein Umweg über eine Funktion nötig, RLS
-- reicht hier aus). Das Versenden selbst läuft über die Edge Function
-- send-poll-notification mit dem service_role Key (sieht alle Zeilen).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own_rows" on public.push_subscriptions;
create policy "push_subscriptions_own_rows"
on public.push_subscriptions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
-- ============================================================

-- ============================================================
-- AKTIVITÄTSPROTOKOLL
-- ============================================================

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  action text not null,
  target_label text,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;

drop policy if exists "activity_log_owner_select" on public.activity_log;
create policy "activity_log_owner_select"
on public.activity_log for select
using (public.is_owner());

-- Einträge landen ausschließlich über diese Funktion in der Tabelle
-- (kein direktes Insert von außen), damit niemand sich selbst
-- gefälschte Log-Einträge erzeugen kann.
create or replace function public.log_activity(p_action text, p_target_label text, p_details jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_owner() then
    raise exception 'Nur der Owner kann Aktivitäten protokollieren.';
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();

  insert into public.activity_log (actor_id, actor_name, action, target_label, details)
  values (auth.uid(), coalesce(v_name, 'Owner'), p_action, p_target_label, p_details);
end;
$$;

grant execute on function public.log_activity(text, text, jsonb) to authenticated;

-- owner_add_shares protokolliert jetzt automatisch mit.
create or replace function public.owner_add_shares(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_owner() then
    raise exception 'Nur der Owner darf Anteile vergeben.';
  end if;

  if p_amount = 0 then
    return;
  end if;

  update public.profiles
  set shares = greatest(0, shares + p_amount)
  where id = p_user_id
  returning full_name into v_name;

  if v_name is null then
    raise exception 'Investor nicht gefunden.';
  end if;

  perform public.log_activity(
    case when p_amount > 0 then 'shares_added' else 'shares_removed' end,
    v_name,
    jsonb_build_object('amount', p_amount, 'user_id', p_user_id)
  );
end;
$$;

grant execute on function public.owner_add_shares(uuid, integer) to authenticated;

-- Anteile für mehrere Investoren gleichzeitig anpassen (Bulk-Aktion).
create or replace function public.owner_bulk_add_shares(p_user_ids uuid[], p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count integer := 0;
begin
  if not public.is_owner() then
    raise exception 'Nur der Owner darf Anteile vergeben.';
  end if;

  if p_amount = 0 or array_length(p_user_ids, 1) is null then
    return;
  end if;

  foreach v_user_id in array p_user_ids loop
    update public.profiles
    set shares = greatest(0, shares + p_amount)
    where id = v_user_id;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  perform public.log_activity(
    'shares_bulk_added',
    v_count || ' Investoren',
    jsonb_build_object('amount', p_amount, 'user_ids', p_user_ids, 'count', v_count)
  );
end;
$$;

grant execute on function public.owner_bulk_add_shares(uuid[], integer) to authenticated;

-- create_poll protokolliert jetzt automatisch mit.
create or replace function public.create_poll(
  p_question text,
  p_description text,
  p_options text[],
  p_closes_at timestamptz default null,
  p_urgency text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll_id uuid;
  v_option text;
  v_position integer := 0;
begin
  if not public.is_owner() then
    raise exception 'Nur der Owner darf Abstimmungen erstellen.';
  end if;

  if p_question is null or length(trim(p_question)) = 0 then
    raise exception 'Frage darf nicht leer sein.';
  end if;

  if array_length(p_options, 1) is null or array_length(p_options, 1) < 2 then
    raise exception 'Mindestens 2 Optionen erforderlich.';
  end if;

  if p_urgency not in ('normal', 'urgent', 'emergency') then
    raise exception 'Ungültige Dringlichkeit.';
  end if;

  insert into public.polls (question, description, created_by, closes_at, urgency)
  values (
    trim(p_question),
    nullif(trim(coalesce(p_description, '')), ''),
    auth.uid(),
    p_closes_at,
    p_urgency
  )
  returning id into v_poll_id;

  foreach v_option in array p_options loop
    if length(trim(v_option)) > 0 then
      insert into public.poll_options (poll_id, label, position)
      values (v_poll_id, trim(v_option), v_position);
      v_position := v_position + 1;
    end if;
  end loop;

  perform public.log_activity('poll_created', trim(p_question), jsonb_build_object('poll_id', v_poll_id, 'urgency', p_urgency));

  return v_poll_id;
end;
$$;

grant execute on function public.create_poll(text, text, text[], timestamptz, text) to authenticated;

-- close_poll protokolliert jetzt automatisch mit.
create or replace function public.close_poll(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question text;
begin
  if not public.is_owner() then
    raise exception 'Nur der Owner darf Abstimmungen schließen.';
  end if;

  update public.polls set status = 'closed' where id = p_poll_id
  returning question into v_question;

  perform public.log_activity('poll_closed', coalesce(v_question, p_poll_id::text), jsonb_build_object('poll_id', p_poll_id));
end;
$$;

grant execute on function public.close_poll(uuid) to authenticated;
-- ============================================================

-- ============================================================
-- NEWS / UPDATES
-- ============================================================

create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  pinned boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.news_posts enable row level security;

drop policy if exists "news_select_all" on public.news_posts;
create policy "news_select_all"
on public.news_posts for select
using (auth.uid() is not null);

drop policy if exists "news_owner_manage" on public.news_posts;
create policy "news_owner_manage"
on public.news_posts for all
using (public.is_owner())
with check (public.is_owner());

-- Erstellen läuft über diese Funktion, damit gleichzeitig ein
-- Aktivitäts-Log-Eintrag entsteht.
create or replace function public.create_news_post(p_title text, p_content text, p_pinned boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_owner() then
    raise exception 'Nur der Owner darf Neuigkeiten veröffentlichen.';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Titel darf nicht leer sein.';
  end if;

  insert into public.news_posts (title, content, pinned, created_by)
  values (trim(p_title), coalesce(p_content, ''), p_pinned, auth.uid())
  returning id into v_id;

  perform public.log_activity('news_posted', trim(p_title), jsonb_build_object('news_id', v_id));

  return v_id;
end;
$$;

grant execute on function public.create_news_post(text, text, boolean) to authenticated;

create or replace function public.delete_news_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if not public.is_owner() then
    raise exception 'Nur der Owner darf Neuigkeiten löschen.';
  end if;

  delete from public.news_posts where id = p_id returning title into v_title;
  perform public.log_activity('news_deleted', coalesce(v_title, p_id::text), jsonb_build_object('news_id', p_id));
end;
$$;

grant execute on function public.delete_news_post(uuid) to authenticated;
-- ============================================================

-- ============================================================
-- DOKUMENTE
-- ============================================================

-- Hinweis: Der Storage-Bucket 'documents' muss einmalig manuell
-- angelegt werden: Supabase Dashboard -> Storage -> New bucket ->
-- Name "documents", Public: AUS. Die Policies unten regeln dann,
-- wer lesen/schreiben darf.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  storage_path text not null,
  file_name text not null,
  file_size bigint,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;

drop policy if exists "documents_select_all" on public.documents;
create policy "documents_select_all"
on public.documents for select
using (auth.uid() is not null);

drop policy if exists "documents_owner_insert" on public.documents;
create policy "documents_owner_insert"
on public.documents for insert
with check (public.is_owner());

drop policy if exists "documents_owner_delete" on public.documents;
create policy "documents_owner_delete"
on public.documents for delete
using (public.is_owner());

create or replace function public.log_document_upload(p_title text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_activity('document_uploaded', p_title, jsonb_build_object('document_id', p_id));
end;
$$;

grant execute on function public.log_document_upload(text, uuid) to authenticated;

create or replace function public.log_document_delete(p_title text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_activity('document_deleted', p_title, jsonb_build_object('document_id', p_id));
end;
$$;

grant execute on function public.log_document_delete(text, uuid) to authenticated;

-- Storage-Policies für den Bucket 'documents': jeder eingeloggte
-- Nutzer darf lesen (Downloads über signierte URLs), nur der Owner
-- darf hochladen/löschen.
drop policy if exists "documents_storage_select" on storage.objects;
create policy "documents_storage_select"
on storage.objects for select
using (bucket_id = 'documents' and auth.uid() is not null);

drop policy if exists "documents_storage_owner_write" on storage.objects;
create policy "documents_storage_owner_write"
on storage.objects for insert
with check (bucket_id = 'documents' and public.is_owner());

drop policy if exists "documents_storage_owner_delete" on storage.objects;
create policy "documents_storage_owner_delete"
on storage.objects for delete
using (bucket_id = 'documents' and public.is_owner());
-- ============================================================
