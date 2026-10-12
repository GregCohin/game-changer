import { supabaseStaff } from "./supabaseClient";

// Modération du portail parent côté staff (audit du 07/10/2026, points 5 et 6) : retirer un message ou un
// sujet du forum partagé, voir et confirmer les nouveaux liens parent <-> enfant. Même principe que
// portalSync.js : les écrans n'appellent que ces fonctions, jamais `supabaseStaff` directement.
//
// Les fonctions de retrait ne lèvent jamais d'erreur : elles renvoient { status }, pour que l'écran puisse
// décider quoi dire au staff sans try/catch (le forum local continue de fonctionner sans portail) :
//   "deleted"     : retiré du portail (count = lignes supprimées) ;
//   "absent"      : rien à retirer, jamais publié ;
//   "signed_out"  : pas de session staff Supabase, le portail n'a pas été touché ;
//   "unavailable" : Supabase n'est pas configuré sur ce déploiement ;
//   "error"       : la base a refusé (message).

async function staffContext() {
  if (!supabaseStaff) return { status: "unavailable" };
  const { data } = await supabaseStaff.auth.getUser();
  if (!data?.user) return { status: "signed_out" };
  return { status: "ok" };
}

async function removeRows(table, id) {
  const ctx = await staffContext();
  if (ctx.status !== "ok") return { status: ctx.status };
  // select() : renvoie les lignes réellement supprimées (une policy qui refuserait ne lève pas d'erreur, elle touche 0 ligne).
  const { data, error } = await supabaseStaff.from(table).delete().eq("id", id).select("id");
  if (error) return { status: "error", message: error.message };
  return data && data.length > 0 ? { status: "deleted", count: data.length } : { status: "absent", count: 0 };
}

// Un message de forum, y compris celui d'un parent (le staff le peut depuis la migration de sécurité).
export function removePortalForumMessage(messageId) {
  return removeRows("forum_messages", messageId);
}

// Un sujet entier : ses messages et ses participants partent avec lui (cascade).
export function removePortalForumThread(threadId) {
  return removeRows("forum_threads", threadId);
}

// ---- Nouveaux liens parent <-> enfant ----

// Liens pas encore vus par le staff (reviewed_at vide), du plus récent au plus ancien. Le nom affiché est
// l'adresse e-mail vérifiée du parent (parent_profiles.display_name, imposé par la base), jamais un texte libre.
export async function listNewParentLinks() {
  const ctx = await staffContext();
  if (ctx.status !== "ok") return [];
  const { data: links, error } = await supabaseStaff
    .from("parent_player_links")
    .select("parent_id, player_id, linked_at, linked_via_code")
    .is("reviewed_at", null)
    .order("linked_at", { ascending: false });
  if (error) throw error;
  if (!links || links.length === 0) return [];

  // Deux requêtes plutôt qu'une jointure : parent_player_links ne référence ni parent_profiles ni players
  // sous la forme qu'attendrait PostgREST pour joindre (voir listPlayerLinks dans portalSync.js).
  const [profiles, players] = await Promise.all([
    supabaseStaff.from("parent_profiles").select("id, display_name").in("id", [...new Set(links.map((l) => l.parent_id))]),
    supabaseStaff.from("players").select("id, first_name, last_name").in("id", [...new Set(links.map((l) => l.player_id))]),
  ]);
  if (profiles.error) throw profiles.error;
  if (players.error) throw players.error;
  const email = Object.fromEntries((profiles.data || []).map((p) => [p.id, p.display_name]));
  const child = Object.fromEntries((players.data || []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));
  return links.map((l) => ({
    parentId: l.parent_id,
    playerId: l.player_id,
    linkedAt: l.linked_at,
    code: l.linked_via_code,
    email: email[l.parent_id] || null,
    playerName: child[l.player_id] || l.player_id,
  }));
}

// « C'est bon, je connais ce parent » : le lien n'apparaît plus dans les alertes.
export async function confirmParentLink(parentId, playerId) {
  const ctx = await staffContext();
  if (ctx.status !== "ok") throw new Error("Connecte-toi d'abord avec ton compte staff.");
  const { data, error } = await supabaseStaff
    .from("parent_player_links")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("parent_id", parentId)
    .eq("player_id", playerId)
    .select("parent_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Lien introuvable (déjà défait ?).");
}
