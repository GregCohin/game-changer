import { useEffect, useState } from "react";
import { listNewParentLinks, confirmParentLink } from "../lib/portalModeration.js";
import { revokeLink, revokeInvitationCode } from "../lib/portalSync.js";

// Alerte « nouveaux parents liés » de l'écran Portail parent (audit du 07/10/2026, point 4). Un parent
// qui saisit un code est lié tout de suite à l'enfant : le staff voit ici qui, avec quel code et quand, puis
// confirme (« C'est bon ») ou défait le lien. Rien ne s'affiche tant qu'aucun lien n'attend de vérification.
// L'adresse e-mail affichée est celle que le parent a vérifiée en cliquant sur son lien magique.
export function NouveauxLiensParents() {
  const [links, setLinks] = useState(null); // null = chargement
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  async function refresh() {
    try {
      setLinks(await listNewParentLinks());
      setError("");
    } catch (e) {
      setLinks([]);
      setError(e.message);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function handleConfirm(l) {
    setBusyKey(l.parentId + l.playerId);
    try { await confirmParentLink(l.parentId, l.playerId); } catch (e) { alert("Échec : " + e.message); }
    await refresh();
    setBusyKey("");
  }

  async function handleUnlink(l) {
    const who = l.email || "ce parent";
    if (!confirm(`Délier ${who} de ${l.playerName} ? Il ne verra plus aucune donnée de cet enfant.`)) return;
    setBusyKey(l.parentId + l.playerId);
    try {
      await revokeLink(l.parentId, l.playerId);
      // Délier ne suffit pas si le code a circulé : tant qu'il reste valable, quelqu'un d'autre peut l'utiliser.
      if (l.code && confirm(`Révoquer aussi le code ${l.code} ? Si tu penses qu'il a été transmis à quelqu'un d'autre, c'est le seul moyen d'empêcher qu'on l'utilise de nouveau.`)) {
        await revokeInvitationCode(l.code);
      }
    } catch (e) {
      alert("Échec : " + e.message);
    }
    await refresh();
    setBusyKey("");
  }

  if (error) return <p className="hint" style={{ textAlign: "left", marginBottom: 12 }}>Impossible de vérifier les nouveaux liens parent : {error}</p>;
  if (!links || links.length === 0) return null;

  return (
    <div className="scouting-card" style={{ flexDirection: "column", alignItems: "stretch", borderColor: "var(--crimson)", marginBottom: 20 }} role="alert">
      <div className="scouting-name">
        {links.length === 1 ? "1 nouveau parent lié à vérifier" : `${links.length} nouveaux parents liés à vérifier`}
      </div>
      <div className="scouting-meta" style={{ marginBottom: 6 }}>
        Un parent qui saisit un code est lié tout de suite à l'enfant. Vérifie que tu le reconnais : si ce n'est pas le cas, défais le lien et révoque le code.
      </div>
      {links.map((l) => {
        const busy = busyKey === l.parentId + l.playerId;
        return (
          <div key={l.parentId + l.playerId} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <div className="scouting-info">
              <div className="scouting-name">{l.email || l.parentId.slice(0, 8)}</div>
              <div className="scouting-meta">
                lié à {l.playerName} · {new Date(l.linkedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {l.code ? ` · code ${l.code}` : ""}
              </div>
            </div>
            <button className="btn btn-primary btn-small" disabled={busy} onClick={() => handleConfirm(l)}>C'est bon</button>
            <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => handleUnlink(l)}>Délier</button>
          </div>
        );
      })}
    </div>
  );
}
