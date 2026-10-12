import { supabase } from "../supabaseClient";

// Suppressions faites par le parent lui-même : un de ses messages, une de ses notes, puis son compte
// (droit à l'effacement). Les règles vivent dans la base (policies de suppression et fonction
// delete_my_account, migration …_securite_portail.sql) : ces fonctions ne font que les appeler.

async function deleteOwnRow(table, id) {
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) throw error;
  // Une policy qui refuse ne lève pas d'erreur : elle touche 0 ligne.
  if (!data || data.length === 0) {
    throw new Error("Suppression impossible : cet élément n'est plus à toi ou a déjà été supprimé.");
  }
}

export const deleteMyForumMessage = (messageId) => deleteOwnRow("forum_messages", messageId);
export const deleteMyJournalEntry = (entryId) => deleteOwnRow("player_journal_entries", entryId);

// eraseContent = true : efface aussi ses messages de forum et ses notes ; false : ils restent, sous
// « Ancien parent », sans plus aucun lien avec le compte. Dans les deux cas : adresse e-mail, lien avec
// l'enfant et inscriptions au covoiturage sont effacés avec le compte.
export async function deleteMyAccount({ eraseContent = true } = {}) {
  const { error } = await supabase.rpc("delete_my_account", { p_erase_content: eraseContent });
  if (error) throw error;
}
