// Bandeau permanent « stockage plein », monté une fois pour toute l'app dans src/main.jsx.
//
// Pourquoi : ≈ 570 endroits de l'app écrivent dans localStorage dans un try/catch vide. Quand le
// quota est atteint, ces écritures échouent en silence — l'utilisateur croit avoir enregistré. Le
// wrapper de lib/storage.js signale chaque échec de quota par l'évènement `tf-storage-full` ; ce
// bandeau l'affiche, sur tous les écrans, jusqu'à ce que l'utilisateur le ferme (il revient à
// l'échec suivant). L'alerte bloquante, elle, n'apparaît qu'une fois par session.
//
// Styles en ligne : monté hors de `.app-root`, donc sans la feuille de style de l'app.

import React from "react";

const bar = {
  position: "fixed", top: 0, left: 0, right: 0, zIndex: 100000, background: "#B8382F", color: "#FFFFFF",
  padding: "10px 14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontSize: 14, lineHeight: 1.4,
  display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
};
const btn = { background: "#FFFFFF", color: "#B8382F", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 14, cursor: "pointer" };

export default function StorageWarning({ rescue }) {
  const [count, setCount] = React.useState(() => (typeof window !== "undefined" && window.__tfQuotaErrors) || 0);
  const [dismissedAt, setDismissedAt] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    const onFull = (e) => setCount((e && e.detail && e.detail.count) || ((window.__tfQuotaErrors) || 0));
    window.addEventListener("tf-storage-full", onFull);
    return () => window.removeEventListener("tf-storage-full", onFull);
  }, []);

  if (count === 0 || count === dismissedAt) return null;

  async function download() {
    setBusy(true);
    setNote("");
    try {
      const r = await rescue();
      setNote(r && r.warnings && r.warnings.length > 0 ? "Sauvegarde téléchargée, mais incomplète (matchs illisibles)." : "Sauvegarde téléchargée.");
    } catch (e) {
      setNote(`La sauvegarde a échoué : ${(e && e.message) || e}`);
    }
    setBusy(false);
  }

  return (
    <div role="alert" style={bar}>
      <span style={{ flex: "1 1 320px" }}>
        <strong>Le stockage de ce navigateur est plein.</strong> {count > 1 ? `${count} enregistrements ont échoué` : "Un enregistrement a échoué"} depuis l'ouverture de la page : ce que tu viens de saisir n'est peut-être pas sauvegardé.
        {" "}Libère de la place (Administratif → Club → Sauvegarde → « Place disponible »).
        {note && <em> {note}</em>}
      </span>
      {rescue && <button style={btn} onClick={download} disabled={busy}>{busy ? "Préparation…" : "Télécharger une sauvegarde"}</button>}
      <button style={btn} onClick={() => setDismissedAt(count)}>Masquer</button>
    </div>
  );
}
