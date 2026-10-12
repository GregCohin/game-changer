// Bandeau de rappel de sauvegarde, en tête de l'Accueil. Affiché si le navigateur contient de vraies
// données (joueurs, matchs, séances) et que la dernière sauvegarde complète date de plus de
// 14 jours — ou n'existe pas. « Plus tard » le masque 3 jours. La date vient de `tf_last_backup`
// (clé non cloisonnée, jamais exportée : voir lib/fullBackup.js).

import React from "react";
import { exportFullBackupFile, getBackupReminder, snoozeBackupReminder, REMINDER_AFTER_DAYS } from "./fullBackup.js";
import { formatDateFr, dateIsoLocal } from "./utils.js";

const box = { background: "var(--surface, #FFFFFF)", border: "1px solid var(--crimson, #B8382F)", borderLeft: "5px solid var(--crimson, #B8382F)", borderRadius: 8, padding: "12px 16px", margin: "0 0 20px", color: "var(--ink, #2B2235)" };
const boxOk = { ...box, border: "1px solid #2F6B3A", borderLeft: "5px solid #2F6B3A" };

export default function BackupReminderBanner() {
  const [reminder, setReminder] = React.useState(() => getBackupReminder());
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null); // { message, warn }
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => { setDone(null); setReminder(getBackupReminder()); }, 6000);
    return () => clearTimeout(t);
  }, [done]);

  async function backupNow() {
    setBusy(true);
    setError("");
    try {
      const r = await exportFullBackupFile();
      const incomplete = r.warnings && r.warnings.length > 0;
      setDone({
        warn: incomplete,
        message: incomplete
          ? `Sauvegarde téléchargée (${r.filename}), mais INCOMPLÈTE : les matchs de ${r.warnings.length} équipe(s)/saison(s) n'ont pas pu être lus. Réessaie, ou utilise Administratif → Club → Sauvegarde.`
          : `Sauvegarde téléchargée (${r.filename}). Garde ce fichier hors de cet ordinateur (clé USB, cloud privé).`,
      });
    } catch (e) {
      setError(`La sauvegarde a échoué : ${(e && e.message) || e}`);
    }
    setBusy(false);
  }
  function later() {
    snoozeBackupReminder();
    setReminder(getBackupReminder());
  }

  if (done) {
    return <div role="status" style={done.warn ? box : boxOk}><strong>{done.warn ? "Sauvegarde incomplète." : "C'est fait."}</strong> {done.message}</div>;
  }
  if (!reminder.show) return null;

  const headline = reminder.reason === "never"
    ? "Aucune sauvegarde de tes données n'est enregistrée sur cet appareil."
    : `Ta dernière sauvegarde date de ${reminder.days} jours (${formatDateFr(dateIsoLocal(reminder.last.at))}).`;

  return (
    <div role="alert" style={box} className="no-print">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{headline}</div>
      <p style={{ margin: "0 0 10px", fontSize: "0.93em" }}>
        Tout ce que tu as saisi vit uniquement dans ce navigateur : un cache vidé, un changement d'ordinateur ou Safari qui efface les données d'un site peu visité, et tout disparaît. Le rappel revient au-delà de {REMINDER_AFTER_DAYS} jours sans sauvegarde.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button className="btn btn-primary btn-small" onClick={backupNow} disabled={busy}>{busy ? "Préparation…" : "Sauvegarder maintenant"}</button>
        <button className="btn btn-ghost btn-small" onClick={later} disabled={busy}>Plus tard (3 jours)</button>
      </div>
      {error && <p style={{ color: "var(--crimson, #B8382F)", margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
