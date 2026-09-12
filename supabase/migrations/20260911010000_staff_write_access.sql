-- La migration initiale n'accordait que des policies SELECT (côté parent). Sans policy INSERT/
-- UPDATE/DELETE, personne — pas même le staff via l'anon key — ne peut écrire. On donne au staff
-- une identité via le même système d'auth (lien magique) plutôt que d'introduire un Edge Function
-- ou d'exposer la clé service_role côté client : plus simple, réutilise ce qui existe déjà.

create table staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table staff_profiles enable row level security;
create policy staff_profiles_select_own on staff_profiles for select using (id = auth.uid());

create or replace function is_staff()
returns boolean language sql stable as $$
  select exists (select 1 from staff_profiles where id = auth.uid());
$$;

-- Écritures staff sur les tables miroir (delete-then-insert géré côté portalSync.js).
create policy players_staff_write on players for all using (is_staff()) with check (is_staff());
create policy development_goals_staff_write on development_goals for all using (is_staff()) with check (is_staff());
create policy individual_programs_staff_write on individual_programs for all using (is_staff()) with check (is_staff());
create policy injuries_staff_write on injuries for all using (is_staff()) with check (is_staff());
create policy sessions_staff_write on sessions for all using (is_staff()) with check (is_staff());
create policy matches_staff_write on matches for all using (is_staff()) with check (is_staff());
create policy match_stats_staff_write on match_stats for all using (is_staff()) with check (is_staff());
create policy competitions_staff_write on competitions for all using (is_staff()) with check (is_staff());
create policy fixtures_staff_write on fixtures for all using (is_staff()) with check (is_staff());
create policy club_faq_staff_write on club_faq for all using (is_staff()) with check (is_staff());
create policy club_events_staff_write on club_events for all using (is_staff()) with check (is_staff());
create policy carpool_offers_staff_write on carpool_offers for all using (is_staff()) with check (is_staff());
create policy forum_threads_staff_write on forum_threads for all using (is_staff()) with check (is_staff());

-- forum_thread_participants et player_invitation_codes : pas de policy insert pour un parent
-- (déjà le cas), mais le staff doit pouvoir les gérer.
create policy forum_participants_staff_write on forum_thread_participants for all using (is_staff()) with check (is_staff());

alter table player_invitation_codes enable row level security;
create policy invitation_codes_staff_manage on player_invitation_codes for all using (is_staff()) with check (is_staff());
-- Lecture par le RPC redeem_invitation_code (security definer, contourne RLS) : pas de policy select
-- pour un parent, il ne doit jamais lister les codes directement.

-- Le staff doit aussi pouvoir voir/gérer les liens parent<->joueur (pour l'écran "parents liés à ce
-- joueur" + "délier"), en plus de sa propre visibilité déjà couverte par parent_player_links_select_own.
create policy parent_player_links_staff_manage on parent_player_links for all using (is_staff()) with check (is_staff());
