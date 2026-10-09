import { useAuth } from "../AuthContext";
import { deleteMyForumMessage, deleteMyJournalEntry } from "../lib/privacyApi";
import { ErrorNotice, useAsyncAction } from "../ui";

// Bouton « Supprimer » d'un message du forum ou d'une note du carnet de bord : visible seulement sur ce
// qui a été écrit par le compte connecté (ownerId = parent_id de la ligne). La base refuse de toute façon
// la suppression de ce qui n'est pas à soi : cette condition n'est là que pour ne pas proposer un bouton
// inutile. Un échec (réseau, session expirée) s'affiche sous le bouton, avec « Réessayer ».
const KINDS = {
  message: { label: "ce message", remove: deleteMyForumMessage },
  note: { label: "cette note", remove: deleteMyJournalEntry },
};

export function DeleteOwnButton({ kind, id, ownerId, onDeleted }) {
  const { session } = useAuth();
  const { run, busy, error } = useAsyncAction();
  const spec = KINDS[kind];
  if (!spec || !session || !ownerId || ownerId !== session.user.id) return null;

  async function doDelete() {
    const ok = await run(() => spec.remove(id));
    if (ok && onDeleted) onDeleted();
  }

  return (
    <div>
      <button
        type="button"
        style={styles.button}
        disabled={busy}
        onClick={() => { if (window.confirm(`Supprimer ${spec.label} ? Cette action est définitive.`)) doDelete(); }}
      >
        {busy ? "Suppression…" : "Supprimer"}
      </button>
      <ErrorNotice error={error} onRetry={doDelete} />
    </div>
  );
}

const styles = {
  button: { fontSize: 14, background: "none", border: "1px solid #555", color: "#ccc", borderRadius: 6, padding: "6px 10px", cursor: "pointer", marginTop: 8 },
};
