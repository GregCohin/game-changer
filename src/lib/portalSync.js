import { supabaseStaff } from "./supabaseClient";

// Toute la logique réseau du chantier "backend Portail parent" est concentrée ici, sur le même
// principe async-ready que getAllReferees/saveReferee (src/App.jsx:924-965) : les écrans staff
// n'appellent que ces fonctions, jamais `supabaseStaff` directement.
//
// Point de conception important sur publishPortalSnapshot : certaines tables miroir ont des
// enfants COLLABORATIFS (écrits par les parents) via une contrainte "on delete cascade" —
// players -> player_journal_entries, carpool_offers -> carpool_passengers, forum_threads ->
// forum_messages/forum_thread_participants. Un delete-then-insert naïf sur ces tables miroir
// effacerait le travail des parents à chaque republication. Ces quatre tables sont donc upsert
// SEULEMENT (jamais de delete) ; les autres tables miroir, sans enfant collaboratif, peuvent être
// remplacées en bloc sans risque.

async function requireStaff() {
  const { data } = await supabaseStaff.auth.getUser();
  if (!data.user) throw new Error("Connecte-toi d'abord avec ton compte staff.");
  return data.user;
}

// ---- Authentification staff (même mécanisme que côté parent : lien magique) ----

export async function signInStaff(email) {
  const { error } = await supabaseStaff.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function getStaffUser() {
  const { data } = await supabaseStaff.auth.getUser();
  return data.user || null;
}

export async function signOutStaff() {
  await supabaseStaff.auth.signOut();
}

export function onStaffAuthChange(callback) {
  const { data } = supabaseStaff.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

// ---- Publication ----

async function replaceScoped(table, teamId, seasonId, rows) {
  const { error: delErr } = await supabaseStaff.from(table).delete().eq("team_id", teamId).eq("season_id", seasonId);
  if (delErr) throw delErr;
  if (rows.length > 0) {
    const { error } = await supabaseStaff.from(table).insert(rows);
    if (error) throw error;
  }
}

async function replaceUnscoped(table, rows) {
  const { data: existing, error: selErr } = await supabaseStaff.from(table).select("id");
  if (selErr) throw selErr;
  if ((existing || []).length > 0) {
    const { error: delErr } = await supabaseStaff.from(table).delete().in("id", existing.map((r) => r.id));
    if (delErr) throw delErr;
  }
  if (rows.length > 0) {
    const { error } = await supabaseStaff.from(table).insert(rows);
    if (error) throw error;
  }
}

async function upsertOnly(table, rows, onConflict = "id") {
  if (rows.length === 0) return;
  const { error } = await supabaseStaff.from(table).upsert(rows, { onConflict });
  if (error) throw error;
}

/**
 * @param {object} snapshot - déjà mappé aux noms de colonnes Postgres par l'appelant (PortalBackendScreen,
 * qui a accès aux formes internes de l'app staff). Voir chaque champ ci-dessous pour la forme attendue.
 */
export async function publishPortalSnapshot(snapshot) {
  await requireStaff();
  const { teamId, seasonId } = snapshot;

  // players et matches d'abord : development_goals/individual_programs/injuries/match_stats
  // référencent player_id par clé étrangère, matches est référencé par match_stats — les insérer
  // après provoquerait une violation de contrainte sur une base vide ou partiellement republiée.
  await upsertOnly("players", snapshot.players);
  await upsertOnly("matches", snapshot.matches);

  // Tables sans enfant collaboratif : remplacement en bloc sûr.
  await replaceScoped("development_goals", teamId, seasonId, snapshot.developmentGoals);
  await replaceScoped("individual_programs", teamId, seasonId, snapshot.individualPrograms);
  await replaceScoped("injuries", teamId, seasonId, snapshot.injuries);
  await replaceScoped("sessions", teamId, seasonId, snapshot.sessions);
  await replaceScoped("club_faq", teamId, seasonId, snapshot.faq);
  await replaceScoped("competitions", teamId, seasonId, snapshot.competitions);
  await replaceScoped("fixtures", teamId, seasonId, snapshot.fixtures); // après competitions (cascade)
  await replaceUnscoped("club_events", snapshot.clubEvents);

  // Tables avec enfant collaboratif : upsert uniquement, jamais de delete.
  await upsertOnly("match_stats", snapshot.matchStats, "match_id,player_id");
  await upsertOnly("carpool_offers", snapshot.carpoolOffers);

  const threadRows = snapshot.forumThreads.map(({ targetPlayerIds, ...t }) => t);
  const { data: existingThreads, error: threadSelErr } = await supabaseStaff
    .from("forum_threads")
    .select("id")
    .eq("team_id", teamId)
    .eq("season_id", seasonId);
  if (threadSelErr) throw threadSelErr;
  const existingIds = new Set((existingThreads || []).map((t) => t.id));
  await upsertOnly("forum_threads", threadRows);

  // Snapshot FIGÉ des participants, uniquement pour les threads "individuelle" nouvellement
  // publiés — jamais réévalué pour un thread déjà existant, sinon un parent lié après coup
  // remonterait dans l'historique de conversations privées créées avant sa liaison.
  const newIndividuelleThreads = snapshot.forumThreads.filter(
    (t) => t.type === "individuelle" && !existingIds.has(t.id) && t.targetPlayerIds?.length
  );
  for (const thread of newIndividuelleThreads) {
    const { data: links, error: linksErr } = await supabaseStaff
      .from("parent_player_links")
      .select("parent_id")
      .in("player_id", thread.targetPlayerIds);
    if (linksErr) throw linksErr;
    const parentIds = [...new Set((links || []).map((l) => l.parent_id))];
    if (parentIds.length > 0) {
      await upsertOnly(
        "forum_thread_participants",
        parentIds.map((parent_id) => ({ thread_id: thread.id, parent_id })),
        "thread_id,parent_id"
      );
    }
  }

  return { publishedAt: new Date().toISOString() };
}

// ---- Récupération des écritures des parents ----

export async function pullPortalUpdates(teamId, seasonId, sinceIso) {
  await requireStaff();

  const [journal, passengers, messages] = await Promise.all([
    supabaseStaff
      .from("player_journal_entries")
      .select("*, players!inner(team_id, season_id)")
      .eq("players.team_id", teamId)
      .eq("players.season_id", seasonId)
      .gt("created_at", sinceIso || "1970-01-01"),
    supabaseStaff
      .from("carpool_passengers")
      .select("*, carpool_offers!inner(team_id, season_id)")
      .eq("carpool_offers.team_id", teamId)
      .eq("carpool_offers.season_id", seasonId)
      .gt("created_at", sinceIso || "1970-01-01"),
    supabaseStaff
      .from("forum_messages")
      .select("*, forum_threads!inner(team_id, season_id)")
      .eq("forum_threads.team_id", teamId)
      .eq("forum_threads.season_id", seasonId)
      .eq("author_kind", "parent")
      .gt("at", sinceIso || "1970-01-01"),
  ]);
  for (const r of [journal, passengers, messages]) if (r.error) throw r.error;

  return {
    journalEntries: (journal.data || []).map((j) => ({ id: j.id, playerId: j.player_id, date: j.date, content: j.content })),
    carpoolPassengers: (passengers.data || []).map((p) => ({ offerId: p.offer_id, passengerName: p.passenger_name })),
    forumMessages: (messages.data || []).map((m) => ({
      id: m.id,
      threadId: m.thread_id,
      authorName: m.author_name,
      content: m.content,
      at: new Date(m.at).getTime(),
      attachment: null,
    })),
    pulledAt: new Date().toISOString(),
  };
}

// ---- Codes d'invitation et gestion des liens parent<->enfant ----

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans caractères ambigus (0/O, 1/I)

export async function generateInvitationCode(playerId, teamId, seasonId) {
  await requireStaff();
  const code = Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  const { error } = await supabaseStaff
    .from("player_invitation_codes")
    .insert({ code, player_id: playerId, team_id: teamId, season_id: seasonId });
  if (error) throw error;
  return code;
}

export async function listActiveCodesForPlayer(playerId) {
  await requireStaff();
  const { data, error } = await supabaseStaff
    .from("player_invitation_codes")
    .select("*")
    .eq("player_id", playerId)
    .eq("revoked", false);
  if (error) throw error;
  return data || [];
}

export async function revokeInvitationCode(code) {
  await requireStaff();
  const { error } = await supabaseStaff.from("player_invitation_codes").update({ revoked: true }).eq("code", code);
  if (error) throw error;
}

export async function listPlayerLinks(playerId) {
  await requireStaff();
  const { data, error } = await supabaseStaff
    .from("parent_player_links")
    .select("parent_id, linked_at, parent_profiles(display_name)")
    .eq("player_id", playerId);
  if (error) throw error;
  return data || [];
}

export async function revokeLink(parentId, playerId) {
  await requireStaff();
  const { error } = await supabaseStaff.from("parent_player_links").delete().eq("parent_id", parentId).eq("player_id", playerId);
  if (error) throw error;
}
