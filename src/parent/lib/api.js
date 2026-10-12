import { supabase } from "../supabaseClient";
import { todayIso } from "../../lib/utils";

// Toute la logique réseau du portail parent est concentrée ici — les écrans n'appellent que ces
// fonctions, jamais `supabase` directement, pour garder un seul endroit à faire évoluer si le
// schéma change (même principe que getAllReferees/saveReferee côté staff, src/App.jsx:924-965).

// Code Postgres d'une violation de clé primaire/unique : un envoi relancé avec le MÊME identifiant
// (parce que la réponse s'est perdue en route) arrive ici s'il avait déjà abouti — c'est un succès.
const DUPLICATE_KEY = "23505";

// Identifiant du parent connecté, lu dans la session enregistrée sur l'appareil (aucun aller-retour réseau
// de plus). Avant : `(await supabase.auth.getUser()).data.user.id` — hors ligne, getUser() renvoie un
// utilisateur nul AVEC une erreur que le code ignorait, d'où un « Cannot read properties of null » au lieu
// d'un « impossible de joindre le serveur ». La base vérifie de toute façon `parent_id = auth.uid()`.
async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    const missing = new Error("Auth session missing!");
    missing.status = 401;
    throw missing;
  }
  return data.session.user.id;
}

export async function redeemInvitationCode(code) {
  const { data, error } = await supabase.rpc("redeem_invitation_code", { p_code: code });
  if (error) throw error;
  return data?.[0] || null; // { player_id, first_name, last_name }
}

export async function getLinkedPlayers() {
  const { data, error } = await supabase
    .from("parent_player_links")
    .select("player_id, players(id, first_name, last_name, team_id, season_id, position, photo_url)");
  if (error) throw error;
  return (data || [])
    .map((row) => row.players)
    .filter(Boolean)
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "fr"));
}

export async function getPlayerPortalData(playerId, teamId, seasonId) {
  // Objectifs, programmes et blessures sont filtrés par équipe ET saison, pas seulement par joueur :
  // un joueur reconduit d'une saison à l'autre garde le même identifiant, et les lignes de la saison
  // précédente (jamais supprimées de la base) apparaîtraient sinon dans la saison en cours.
  const inScope = (query) => query.eq("team_id", teamId).eq("season_id", seasonId);
  const [goals, programs, injuries, sessions, fixtures, matchStats, faq, events, carpoolOffers, journal] =
    await Promise.all([
      inScope(supabase.from("development_goals").select("*").eq("player_id", playerId)),
      inScope(supabase.from("individual_programs").select("*").eq("player_id", playerId)),
      inScope(supabase.from("injuries").select("*").eq("player_id", playerId)),
      inScope(supabase.from("sessions").select("*")),
      inScope(supabase.from("fixtures").select("*, competitions(name)")),
      supabase
        .from("match_stats")
        .select("*, matches(name, date, closed)")
        .eq("player_id", playerId),
      inScope(supabase.from("club_faq").select("*")),
      supabase.from("club_events").select("*"),
      // Seuls l'identifiant et l'enfant inscrit des passagers sont lus : l'écran n'affiche que des
      // effectifs et « mon enfant est inscrit » — pas besoin de rapatrier le nom des autres enfants ni
      // l'identifiant de leurs parents.
      inScope(supabase.from("carpool_offers").select("*, carpool_passengers(id, player_id)")),
      supabase.from("player_journal_entries").select("*").eq("player_id", playerId).order("date", { ascending: false }),
    ]);

  for (const r of [goals, programs, injuries, sessions, fixtures, matchStats, faq, events, carpoolOffers, journal]) {
    if (r.error) throw r.error;
  }

  return {
    goals: goals.data || [],
    programs: programs.data || [],
    injuries: injuries.data || [],
    sessions: sessions.data || [],
    fixtures: fixtures.data || [],
    matchStats: matchStats.data || [],
    faq: faq.data || [],
    events: events.data || [],
    carpoolOffers: carpoolOffers.data || [],
    journal: journal.data || [],
  };
}

// `id` : identifiant de la note, à conserver par l'appelant tant que l'envoi n'a pas réussi. Un
// nouvel essai (double appui, réseau coupé en plein envoi) réutilise le même et ne crée jamais un doublon.
export async function addJournalEntry(playerId, content, id = crypto.randomUUID()) {
  const userId = await currentUserId();
  const { error } = await supabase.from("player_journal_entries").insert({
    id,
    player_id: playerId,
    parent_id: userId,
    date: todayIso(), // date locale : toISOString() donnerait la veille entre minuit et 1 h/2 h du matin
    content,
  });
  if (error && error.code !== DUPLICATE_KEY) throw error;
}

export async function joinCarpool(offerId, playerId, passengerName) {
  const userId = await currentUserId();
  const { error } = await supabase.from("carpool_passengers").insert({
    offer_id: offerId,
    parent_id: userId,
    player_id: playerId,
    passenger_name: passengerName,
  });
  if (error) throw error;
}

export async function leaveCarpool(passengerRowId) {
  const { error } = await supabase.from("carpool_passengers").delete().eq("id", passengerRowId);
  if (error) throw error;
}

export async function getForumThreads(teamId, seasonId) {
  const { data, error } = await supabase
    .from("forum_threads")
    .select("*")
    .eq("team_id", teamId)
    .eq("season_id", seasonId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getThreadMessages(threadId) {
  const { data, error } = await supabase
    .from("forum_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("at", { ascending: true });
  if (error) throw error;
  return data || [];
}

// `id` : même principe que addJournalEntry.
export async function postForumMessage(threadId, content, authorName, id = crypto.randomUUID()) {
  const userId = await currentUserId();
  const { error } = await supabase.from("forum_messages").insert({
    id,
    thread_id: threadId,
    author_kind: "parent",
    author_name: authorName,
    parent_id: userId,
    content,
  });
  if (error && error.code !== DUPLICATE_KEY) throw error;
}
