import { supabaseStaff } from "./supabaseClient";
import { classifyError } from "./supabaseErrors";
import { fetchAllPages, latestTimestamp, pullLowerBound } from "./portalPull";
import { randomInvitationCode } from "./invitationCode.js";

// Toute la logique réseau du chantier "backend Portail parent" est concentrée ici, sur le même
// principe async-ready que getAllReferees/saveReferee (src/App.jsx:924-965) : les écrans staff
// n'appellent que ces fonctions, jamais `supabaseStaff` directement.
//
// Point de conception important sur la publication : tout est écrit par UNE fonction SQL
// (`publish_snapshot`, supabase/migrations/20261007100000_publish_snapshot_atomique.sql), donc en une
// seule transaction — tout est publié, ou rien ne change (avant, ~20 requêtes séparées laissaient le
// portail à moitié vidé au premier échec). C'est cette fonction qui porte les règles : certaines tables
// miroir ont des enfants COLLABORATIFS (écrits par les parents) via "on delete cascade" — players ->
// player_journal_entries, carpool_offers -> carpool_passengers, forum_threads -> forum_messages — et
// restent donc en upsert seulement ; les autres sont remplacées en bloc.

// Erreur lisible pour le staff (le message de supabase-js, lui, parle de base de données). `kind` est
// conservé sur l'erreur pour les appelants qui voudraient réagir selon la famille.
function friendlyError(error, action = "publish") {
  const kind = classifyError(error);
  const retryAdvice = action === "publish"
    ? "Une publication est toujours complète ou sans effet, jamais à moitié faite : tu peux la relancer sans risque."
    : "Rien n'est perdu : tu peux relancer.";
  let message;
  if (kind === "network") message = "Impossible de joindre le serveur Supabase. Vérifie ta connexion ; si elle est bonne, le projet est peut-être en pause (tableau de bord Supabase → « Restore project »). " + retryAdvice;
  else if (kind === "missing_function") message = "La fonction de publication n'existe pas encore sur le serveur : la migration « publish_snapshot » n'a pas été appliquée (npx supabase db push). Rien n'a été modifié.";
  else if (kind === "auth") message = "Ta session a expiré : reconnecte-toi avec le lien de connexion. Rien n'a été modifié.";
  else if (kind === "forbidden") message = "Refusé : ce compte n'est pas reconnu comme staff (ou sa session a expiré). Rien n'a été modifié.";
  else if (kind === "server") message = "Le serveur a rencontré une erreur" + (error && error.message ? ` (${error.message})` : "") + ". " + retryAdvice;
  else {
    // Message de la fonction SQL (« Publication annulée (rien n'a été modifié), étape « sessions » : … »)
    // ou d'une autre erreur de base : repris tel quel, avec ses détails.
    message = (error && error.message) || String(error);
    if (error && error.details) message += ` — ${error.details}`;
    if (error && error.hint) message += ` (${error.hint})`;
  }
  const e = new Error(message);
  e.kind = kind;
  e.cause = error;
  return e;
}

async function requireStaff() {
  const { data, error } = await supabaseStaff.auth.getUser();
  if (!data || !data.user) {
    // Hors ligne ou serveur injoignable : ce n'est pas « tu n'es pas connecté ».
    if (error && classifyError(error) === "network") throw friendlyError(error, "check");
    throw new Error("Connecte-toi d'abord avec ton compte staff.");
  }
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
  const { data, error } = await supabaseStaff.auth.getUser();
  if (data && data.user) return data.user;
  // Serveur injoignable : la session enregistrée sur cet appareil suffit à afficher l'écran (les
  // actions, elles, diront clairement « impossible de joindre le serveur »), plutôt qu'un formulaire de
  // connexion qui laisserait croire que le compte est perdu.
  if (error && classifyError(error) === "network") {
    const { data: stored } = await supabaseStaff.auth.getSession();
    return (stored && stored.session && stored.session.user) || null;
  }
  return null;
}

export async function signOutStaff() {
  await supabaseStaff.auth.signOut();
}

export function onStaffAuthChange(callback) {
  const { data } = supabaseStaff.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

// ---- Publication ----

/**
 * Publie l'instantané construit par assemblePortalSnapshot (src/lib/portalSnapshot.js) : un seul appel,
 * une seule transaction côté serveur. Lève une erreur au message lisible (réseau, migration absente,
 * session expirée, ou l'étape qui a échoué avec ses détails) ; en cas d'échec, rien n'a changé.
 * @returns {Promise<{ published_at: string, counts: object, skipped: object, individual_threads_without_parent: {id:string,title:string}[] }>}
 */
export async function publishPortalSnapshot(snapshot) {
  await requireStaff();
  const { data, error } = await supabaseStaff.rpc("publish_snapshot", { p_snapshot: snapshot });
  if (error) throw friendlyError(error);
  return data;
}

/**
 * Avant de publier : parmi les conversations « individuelles » qui seraient publiées pour la PREMIÈRE
 * fois, lesquelles ne visent aucun joueur ayant un parent lié ? Leurs participants sont figés à cette
 * première publication : sans parent lié maintenant, personne ne pourra jamais les lire. Le staff doit
 * pouvoir renoncer avant (lier les parents d'abord).
 * @returns {Promise<{ id: string, title: string }[]>}
 */
export async function findUnreachableNewThreads(snapshot) {
  await requireStaff();
  const individual = (snapshot.forum_threads || []).filter((t) => t.type === "individuelle");
  if (individual.length === 0) return [];

  const { data: known, error } = await supabaseStaff.from("forum_threads").select("id").in("id", individual.map((t) => t.id));
  if (error) throw friendlyError(error, "check");
  const knownIds = new Set((known || []).map((r) => r.id));
  const fresh = individual.filter((t) => !knownIds.has(t.id));
  if (fresh.length === 0) return [];

  const playerIds = [...new Set(fresh.flatMap((t) => t.target_player_ids || []))];
  const { data: links, error: linksError } = playerIds.length > 0
    ? await supabaseStaff.from("parent_player_links").select("player_id").in("player_id", playerIds)
    : { data: [], error: null };
  if (linksError) throw friendlyError(linksError, "check");
  const linked = new Set((links || []).map((l) => l.player_id));
  return fresh
    .filter((t) => !(t.target_player_ids || []).some((id) => linked.has(id)))
    .map((t) => ({ id: t.id, title: t.title }));
}

// ---- Récupération des écritures des parents ----

/**
 * @param {string|null} cursor - curseur renvoyé par la récupération précédente (voir portalPull.js) ; null la première fois
 * @returns {Promise<{ journalEntries, carpoolPassengers, forumMessages, cursor }>} `cursor` = plus grand horodatage reçu
 *   (inchangé s'il n'y a rien de nouveau) : à conserver pour la prochaine fois.
 */
export async function pullPortalUpdates(teamId, seasonId, cursor) {
  await requireStaff();
  const since = pullLowerBound(cursor);

  // Tri par horodatage puis identifiant : l'ordre doit être stable d'une page à l'autre.
  const [journal, passengers, messages] = await Promise.all([
    fetchAllPages((from, to) => supabaseStaff
      .from("player_journal_entries")
      .select("*, players!inner(team_id, season_id)")
      .eq("players.team_id", teamId)
      .eq("players.season_id", seasonId)
      .gt("created_at", since)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(from, to)),
    fetchAllPages((from, to) => supabaseStaff
      .from("carpool_passengers")
      .select("*, carpool_offers!inner(team_id, season_id)")
      .eq("carpool_offers.team_id", teamId)
      .eq("carpool_offers.season_id", seasonId)
      .gt("created_at", since)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(from, to)),
    fetchAllPages((from, to) => supabaseStaff
      .from("forum_messages")
      .select("*, forum_threads!inner(team_id, season_id)")
      .eq("forum_threads.team_id", teamId)
      .eq("forum_threads.season_id", seasonId)
      .eq("author_kind", "parent")
      .gt("at", since)
      .order("at", { ascending: true }).order("id", { ascending: true })
      .range(from, to)),
  ]).catch((error) => { throw friendlyError(error, "pull"); });

  let next = cursor || null; // jamais d'avance sans données : une règle d'accès cassée ne « consomme » rien
  next = latestTimestamp(journal, "created_at", next);
  next = latestTimestamp(passengers, "created_at", next);
  next = latestTimestamp(messages, "at", next);

  return {
    journalEntries: journal.map((j) => ({ id: j.id, playerId: j.player_id, date: j.date, content: j.content })),
    carpoolPassengers: passengers.map((p) => ({ id: p.id, offerId: p.offer_id, passengerName: p.passenger_name })),
    // `fromPortal` : ce message vient d'un parent. La publication ne le renverra jamais comme message du staff.
    forumMessages: messages.map((m) => ({
      id: m.id,
      threadId: m.thread_id,
      authorName: m.author_name,
      content: m.content,
      at: new Date(m.at).getTime(),
      attachment: null,
      fromPortal: true,
    })),
    cursor: next,
  };
}

// ---- Codes d'invitation et gestion des liens parent<->enfant ----

// Code de 10 caractères tiré avec le générateur cryptographique du navigateur (lib/invitationCode.js). La base
// impose le format et fixe l'expiration par défaut (14 jours) ; elle refuse un code qui ne respecterait pas le motif.
export async function generateInvitationCode(playerId, teamId, seasonId) {
  await requireStaff();
  const code = randomInvitationCode();
  const { error } = await supabaseStaff
    .from("player_invitation_codes")
    .insert({ code, player_id: playerId, team_id: teamId, season_id: seasonId });
  if (error) throw error;
  return code;
}

export async function listActiveCodesForPlayer(playerId) {
  await requireStaff();
  // Un code expiré n'est plus « actif » : il ne se liste plus (la base le refuse de toute façon).
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const { data, error } = await supabaseStaff
    .from("player_invitation_codes")
    .select("*")
    .eq("player_id", playerId)
    .eq("revoked", false)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
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
  const { data: links, error } = await supabaseStaff
    .from("parent_player_links")
    .select("parent_id, linked_at")
    .eq("player_id", playerId);
  if (error) throw error;
  if (!links || links.length === 0) return [];

  // Deux requêtes plutôt qu'une jointure PostgREST : parent_player_links et parent_profiles
  // référencent chacune auth.users, mais pas l'une l'autre — il n'y a donc aucune relation à
  // joindre (erreur PGRST200). On garde la forme { parent_profiles: { display_name } } attendue
  // par l'écran staff.
  const { data: profiles, error: profilesError } = await supabaseStaff
    .from("parent_profiles")
    .select("id, display_name")
    .in("id", links.map((l) => l.parent_id));
  if (profilesError) throw profilesError;
  const nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.display_name]));
  return links.map((l) => ({ ...l, parent_profiles: { display_name: nameById[l.parent_id] ?? null } }));
}

export async function revokeLink(parentId, playerId) {
  await requireStaff();
  const { error } = await supabaseStaff.from("parent_player_links").delete().eq("parent_id", parentId).eq("player_id", playerId);
  if (error) throw error;
}
