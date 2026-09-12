-- Schéma initial du backend "Portail joueur/parent + Forum" (voir plan de migration).
-- Deux catégories de tables : miroir en lecture (remplacées en bloc par publishPortalSnapshot,
-- src/lib/portalSync.js) et collaboratives (upsert par id uniquement, jamais de delete en bloc,
-- car elles portent des écritures faites par les parents).

create extension if not exists pgcrypto;

-- ============ Identité joueur (miroir en lecture) ============

create table players (
  id uuid primary key,
  team_id text not null,
  season_id text not null,
  first_name text not null,
  last_name text not null,
  position text,
  photo_url text,
  updated_at timestamptz not null default now()
);
create index players_team_season_idx on players (team_id, season_id);

create table development_goals (
  id uuid primary key,
  player_id uuid not null references players(id) on delete cascade,
  team_id text not null,
  season_id text not null,
  label text not null,
  status text,
  updated_at timestamptz not null default now()
);

create table individual_programs (
  id uuid primary key,
  player_id uuid not null references players(id) on delete cascade,
  team_id text not null,
  season_id text not null,
  title text not null,
  content jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Vue restreinte : statut RTP seulement, jamais le diagnostic/champs cliniques.
create table injuries (
  id uuid primary key,
  player_id uuid not null references players(id) on delete cascade,
  team_id text not null,
  season_id text not null,
  status text not null,
  rtp_stage text,
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key,
  team_id text not null,
  season_id text not null,
  date date not null,
  label text,
  updated_at timestamptz not null default now()
);

create table matches (
  id uuid primary key,
  team_id text not null,
  season_id text not null,
  name text,
  date date not null,
  closed boolean not null default true
);

-- Agrégats par joueur/match (via computePlayerMatchStats côté staff), jamais les tags bruts.
create table match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  buts int not null default 0,
  passes_decisives int not null default 0,
  highlights jsonb not null default '[]',
  unique (match_id, player_id)
);

create table competitions (
  id uuid primary key,
  team_id text not null,
  season_id text not null,
  name text not null
);

create table fixtures (
  id uuid primary key,
  competition_id uuid references competitions(id) on delete cascade,
  team_id text not null,
  season_id text not null,
  date date not null,
  opponent text,
  location text
);

create table club_faq (
  id uuid primary key,
  team_id text not null,
  season_id text not null,
  question text not null,
  answer text not null
);

-- Club-wide, non scopée équipe/saison (comme tf_club_events côté localStorage).
create table club_events (
  id uuid primary key,
  title text not null,
  date date not null,
  location text
);

create table carpool_offers (
  id uuid primary key,
  team_id text not null,
  season_id text not null,
  driver_name text not null,
  event_label text,
  date date,
  seats_total int not null default 0
);

-- ============ Identité parent et liaison ============

create table parent_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table player_invitation_codes (
  code text primary key,
  player_id uuid not null references players(id) on delete cascade,
  team_id text not null,
  season_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses int not null default 5,
  use_count int not null default 0,
  revoked boolean not null default false
);

-- Many-to-many : plusieurs parents indépendants peuvent être liés au même enfant.
create table parent_player_links (
  parent_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (parent_id, player_id)
);

-- ============ Tables collaboratives (écrites aussi par les parents) ============

create table carpool_passengers (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references carpool_offers(id) on delete cascade,
  parent_id uuid not null references auth.users(id),
  player_id uuid references players(id),
  passenger_name text not null,
  created_at timestamptz not null default now()
);

create table player_journal_entries (
  id uuid primary key,
  player_id uuid not null references players(id) on delete cascade,
  parent_id uuid references auth.users(id),
  date date not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- ============ Forum ============

create table forum_threads (
  id uuid primary key,
  team_id text not null,
  season_id text not null,
  title text not null,
  type text not null check (type in ('general','event','individuelle')),
  linked_event_title text,
  linked_event_date date,
  created_at timestamptz not null default now()
);

-- Snapshot FIGÉ au moment de la création/publication du thread — jamais recalculé depuis
-- parent_player_links. C'est ce qui garantit qu'un parent lié après coup ne voit pas les
-- anciennes conversations privées (comportement validé explicitement avec Gregory).
create table forum_thread_participants (
  thread_id uuid not null references forum_threads(id) on delete cascade,
  parent_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (thread_id, parent_id)
);

create table forum_messages (
  id uuid primary key,
  thread_id uuid not null references forum_threads(id) on delete cascade,
  author_kind text not null check (author_kind in ('staff','parent')),
  author_name text not null,
  parent_id uuid references auth.users(id),
  content text not null,
  at timestamptz not null default now()
);

-- ============ Row Level Security ============

alter table players enable row level security;
create policy players_select_own_children on players for select
  using (id in (select player_id from parent_player_links where parent_id = auth.uid()));

alter table development_goals enable row level security;
create policy development_goals_select_own_children on development_goals for select
  using (player_id in (select player_id from parent_player_links where parent_id = auth.uid()));

alter table individual_programs enable row level security;
create policy individual_programs_select_own_children on individual_programs for select
  using (player_id in (select player_id from parent_player_links where parent_id = auth.uid()));

alter table injuries enable row level security;
create policy injuries_select_own_children on injuries for select
  using (player_id in (select player_id from parent_player_links where parent_id = auth.uid()));

alter table match_stats enable row level security;
create policy match_stats_select_own_children on match_stats for select
  using (player_id in (select player_id from parent_player_links where parent_id = auth.uid()));

alter table matches enable row level security;
create policy matches_select_by_team_season on matches for select
  using (exists (
    select 1 from players p join parent_player_links l on l.player_id = p.id
    where l.parent_id = auth.uid() and p.team_id = matches.team_id and p.season_id = matches.season_id
  ));

alter table sessions enable row level security;
create policy sessions_select_by_team_season on sessions for select
  using (exists (
    select 1 from players p join parent_player_links l on l.player_id = p.id
    where l.parent_id = auth.uid() and p.team_id = sessions.team_id and p.season_id = sessions.season_id
  ));

alter table competitions enable row level security;
create policy competitions_select_by_team_season on competitions for select
  using (exists (
    select 1 from players p join parent_player_links l on l.player_id = p.id
    where l.parent_id = auth.uid() and p.team_id = competitions.team_id and p.season_id = competitions.season_id
  ));

alter table fixtures enable row level security;
create policy fixtures_select_by_team_season on fixtures for select
  using (exists (
    select 1 from players p join parent_player_links l on l.player_id = p.id
    where l.parent_id = auth.uid() and p.team_id = fixtures.team_id and p.season_id = fixtures.season_id
  ));

alter table club_faq enable row level security;
create policy club_faq_select_by_team_season on club_faq for select
  using (exists (
    select 1 from players p join parent_player_links l on l.player_id = p.id
    where l.parent_id = auth.uid() and p.team_id = club_faq.team_id and p.season_id = club_faq.season_id
  ));

alter table club_events enable row level security;
create policy club_events_select_any_linked_parent on club_events for select
  using (exists (select 1 from parent_player_links where parent_id = auth.uid()));

alter table carpool_offers enable row level security;
create policy carpool_offers_select_by_team_season on carpool_offers for select
  using (exists (
    select 1 from players p join parent_player_links l on l.player_id = p.id
    where l.parent_id = auth.uid() and p.team_id = carpool_offers.team_id and p.season_id = carpool_offers.season_id
  ));

alter table carpool_passengers enable row level security;
create policy carpool_passengers_select on carpool_passengers for select
  using (exists (
    select 1 from carpool_offers o
    join players p on p.team_id = o.team_id and p.season_id = o.season_id
    join parent_player_links l on l.player_id = p.id and l.parent_id = auth.uid()
    where o.id = carpool_passengers.offer_id
  ));
create policy carpool_passengers_insert_own on carpool_passengers for insert
  with check (parent_id = auth.uid());
create policy carpool_passengers_delete_own on carpool_passengers for delete
  using (parent_id = auth.uid());

alter table player_journal_entries enable row level security;
create policy player_journal_select_own_children on player_journal_entries for select
  using (player_id in (select player_id from parent_player_links where parent_id = auth.uid()));
create policy player_journal_insert_own on player_journal_entries for insert
  with check (parent_id = auth.uid() and player_id in (select player_id from parent_player_links where parent_id = auth.uid()));

alter table forum_threads enable row level security;
create policy forum_general_event_visible on forum_threads for select
  using (
    type in ('general','event')
    and exists (
      select 1 from players p join parent_player_links l on l.player_id = p.id
      where l.parent_id = auth.uid() and p.team_id = forum_threads.team_id and p.season_id = forum_threads.season_id
    )
  );
create policy forum_individuelle_visible on forum_threads for select
  using (
    type = 'individuelle'
    and exists (select 1 from forum_thread_participants fp where fp.thread_id = forum_threads.id and fp.parent_id = auth.uid())
  );

alter table forum_messages enable row level security;
create policy forum_messages_select on forum_messages for select
  using (exists (select 1 from forum_threads t where t.id = forum_messages.thread_id));
create policy forum_messages_insert_own on forum_messages for insert
  with check (
    author_kind = 'parent' and parent_id = auth.uid()
    and exists (select 1 from forum_threads t where t.id = thread_id)
  );

alter table forum_thread_participants enable row level security;
create policy forum_participants_select_own on forum_thread_participants for select
  using (parent_id = auth.uid());
-- Pas de policy insert côté client : peuplée uniquement par portalSync (service role) côté staff.

alter table parent_profiles enable row level security;
create policy parent_profiles_select_own on parent_profiles for select using (id = auth.uid());
create policy parent_profiles_upsert_own on parent_profiles for insert with check (id = auth.uid());
create policy parent_profiles_update_own on parent_profiles for update using (id = auth.uid());

alter table parent_player_links enable row level security;
create policy parent_player_links_select_own on parent_player_links for select
  using (parent_id = auth.uid());
-- Pas de policy insert directe : passe uniquement par le RPC ci-dessous (sinon un uuid deviné
-- suffirait à se lier à n'importe quel joueur).

-- ============ Fonction de liaison par code d'invitation ============

create or replace function redeem_invitation_code(p_code text)
returns table (player_id uuid, first_name text, last_name text)
language plpgsql security definer as $$
declare v_row player_invitation_codes;
begin
  select * into v_row from player_invitation_codes
    where code = p_code
      and not revoked
      and (expires_at is null or expires_at > now())
      and use_count < max_uses
    for update;

  if v_row is null then
    raise exception 'Code invalide ou expiré';
  end if;

  insert into parent_player_links (parent_id, player_id)
    values (auth.uid(), v_row.player_id)
    on conflict do nothing;

  update player_invitation_codes set use_count = use_count + 1 where code = p_code;

  return query select p.id, p.first_name, p.last_name from players p where p.id = v_row.player_id;
end;
$$;
