import { supabase } from "../supabaseClient";

// Toute la logique réseau du portail parent est concentrée ici — les écrans n'appellent que ces
// fonctions, jamais `supabase` directement, pour garder un seul endroit à faire évoluer si le
// schéma change (même principe que getAllReferees/saveReferee côté staff, src/App.jsx:924-965).

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
  return (data || []).map((row) => row.players).filter(Boolean);
}

export async function getPlayerPortalData(playerId, teamId, seasonId) {
  const [goals, programs, injuries, sessions, matchStats, faq, events, carpoolOffers, journal] =
    await Promise.all([
      supabase.from("development_goals").select("*").eq("player_id", playerId),
      supabase.from("individual_programs").select("*").eq("player_id", playerId),
      supabase.from("injuries").select("*").eq("player_id", playerId),
      supabase.from("sessions").select("*").eq("team_id", teamId).eq("season_id", seasonId),
      supabase
        .from("match_stats")
        .select("*, matches(name, date, closed)")
        .eq("player_id", playerId),
      supabase.from("club_faq").select("*").eq("team_id", teamId).eq("season_id", seasonId),
      supabase.from("club_events").select("*"),
      supabase.from("carpool_offers").select("*, carpool_passengers(*)").eq("team_id", teamId).eq("season_id", seasonId),
      supabase.from("player_journal_entries").select("*").eq("player_id", playerId).order("date", { ascending: false }),
    ]);

  for (const r of [goals, programs, injuries, sessions, matchStats, faq, events, carpoolOffers, journal]) {
    if (r.error) throw r.error;
  }

  return {
    goals: goals.data || [],
    programs: programs.data || [],
    injuries: injuries.data || [],
    sessions: sessions.data || [],
    matchStats: matchStats.data || [],
    faq: faq.data || [],
    events: events.data || [],
    carpoolOffers: carpoolOffers.data || [],
    journal: journal.data || [],
  };
}

export async function addJournalEntry(playerId, content) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("player_journal_entries").insert({
    id: crypto.randomUUID(),
    player_id: playerId,
    parent_id: userData.user.id,
    date: new Date().toISOString().slice(0, 10),
    content,
  });
  if (error) throw error;
}

export async function joinCarpool(offerId, playerId, passengerName) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("carpool_passengers").insert({
    offer_id: offerId,
    parent_id: userData.user.id,
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

export async function postForumMessage(threadId, content, authorName) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("forum_messages").insert({
    id: crypto.randomUUID(),
    thread_id: threadId,
    author_kind: "parent",
    author_name: authorName,
    parent_id: userData.user.id,
    content,
  });
  if (error) throw error;
}
