// Écran Administratif → Club → Sauvegarde : exporter (clair ou chiffré), restaurer avec aperçu et
// instantané automatique, jauge de stockage. `BackupCenter` est monté par `BackupScreen` (App.jsx),
// qui garde le reste de l'écran (verrou par code, nettoyage des données orphelines).
//
// Toute la logique vit dans lib/fullBackup.js, lib/storageGauge.js et lib/backupCrypto.js (testées
// sous Node) ; ce fichier ne contient que l'interface.

import React from "react";
import {
  exportFullBackupFile, getLastBackup, describeBackupAge, hasUserData,
  parseBackupText, openEncryptedBackup, planRestore, describeBackup, restoreFullBackup, revertToSafetySnapshot,
  getSafetySnapshotInfo, loadSafetySnapshotText, downloadTextFile, purgeOrphanScope, BackupError,
} from "./fullBackup.js";
import { MIN_PASSPHRASE_LENGTH } from "./backupCrypto.js";
import {
  listStorageEntries, summarizeStorage, measureFreeChars, checkRoomForChars, estimateOrigin, getPersistenceState, requestPersistence,
  formatBytes, formatChars, BYTES_PER_CHAR, isSafariBrowser, isStandaloneDisplay,
} from "./storageGauge.js";
import { readRawKey } from "./storage.js";
import { formatDateFr, dateIsoLocal } from "./utils.js";

const OK = "#2F6B3A";
const WARN = "#C9821A";
const BAD = "#B8382F";
const left = { textAlign: "left", marginTop: 0 };
const checkLabel = { display: "block", fontWeight: 400, textTransform: "none", letterSpacing: "normal", fontSize: 14, color: "var(--ink)" };

const pad2 = (n) => String(n).padStart(2, "0");
function formatDateTimeFr(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return `${formatDateFr(dateIsoLocal(d))} à ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
const parseList = (raw) => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

// ===================================================================================================
// Exporter
// ===================================================================================================
function BackupExportPanel({ onChanged }) {
  const [encrypt, setEncrypt] = React.useState(false);
  const [phrase, setPhrase] = React.useState("");
  const [phrase2, setPhrase2] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [result, setResult] = React.useState(null); // { ok, message }
  const last = getLastBackup();

  const phraseOk = !encrypt || (phrase.normalize("NFC").length >= MIN_PASSPHRASE_LENGTH && phrase === phrase2);
  const phraseHint = !encrypt ? "" : phrase.length < MIN_PASSPHRASE_LENGTH ? `Au moins ${MIN_PASSPHRASE_LENGTH} caractères (une phrase de quelques mots convient très bien).` : phrase !== phrase2 ? "Les deux saisies ne sont pas identiques." : "";

  async function handleExport() {
    setBusy(true);
    setResult(null);
    setProgress({ done: 0, total: 1 });
    try {
      const r = await exportFullBackupFile({ passphrase: encrypt ? phrase : undefined, onProgress: (done, total) => setProgress({ done, total }) });
      const incomplete = r.warnings && r.warnings.length > 0;
      setResult({
        ok: !incomplete,
        message: incomplete
          ? `Fichier téléchargé (${r.filename}) mais INCOMPLET : les matchs tagués de ${plural(r.warnings.length, "équipe/saison", "équipes/saisons")} n'ont pas pu être lus (${r.warnings.slice(0, 3).map((w) => `${w.teamName} — ${w.seasonLabel} : ${w.error}`).join(" ; ")}). Réessaie avant de t'y fier.`
          : `Fichier téléchargé : ${r.filename} (${formatBytes(r.chars)}${r.encrypted ? ", chiffré" : ""}). Garde-le hors de cet ordinateur.`,
      });
      if (encrypt) { setPhrase(""); setPhrase2(""); }
    } catch (e) {
      setResult({ ok: false, message: "L'export a échoué : " + ((e && e.message) || e) });
    }
    setBusy(false);
    setProgress(null);
    if (onChanged) onChanged();
  }

  return (
    <div className="new-match-card">
      <div className="panel-heading" style={{ marginTop: 0 }}>Exporter</div>
      <p className="hint" style={left}>
        {last
          ? <>Dernière sauvegarde téléchargée depuis ce navigateur : <strong>{formatDateTimeFr(last.at)}</strong> — {describeBackupAge(last)}{last.encrypted ? ", chiffrée" : ""}.</>
          : "Aucune sauvegarde n'est enregistrée sur cet appareil (les sauvegardes faites avant l'ajout de ce suivi ne sont pas comptées)."}
      </p>
      <label style={checkLabel}>
        <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} style={{ marginRight: 8 }} />
        Chiffrer le fichier avec une phrase secrète
      </label>
      <p className="hint" style={left}>
        {encrypt
          ? "Le fichier ne pourra s'ouvrir qu'avec cette phrase. S'il est perdu ou volé, rien n'est lisible sans elle."
          : "Sans chiffrement, le fichier est du texte lisible par n'importe qui : il contient les fiches santé et les blessures de mineurs, les contacts d'urgence, la discipline… Garde-le dans un endroit privé, ou chiffre-le."}
      </p>
      {encrypt && (
        <>
          <label>Phrase secrète<input type="password" autoComplete="new-password" value={phrase} onChange={(e) => setPhrase(e.target.value)} /></label>
          <label>Phrase secrète (encore une fois)<input type="password" autoComplete="new-password" value={phrase2} onChange={(e) => setPhrase2(e.target.value)} /></label>
          {phraseHint && <p className="hint" style={{ ...left, color: BAD }}>{phraseHint}</p>}
          <p className="hint" style={{ ...left, color: BAD }}><strong>Si tu perds cette phrase, la sauvegarde ne pourra plus jamais être ouverte</strong> — personne ne peut la récupérer, ni le club ni l'auteur de l'application. Note-la ailleurs, dans un endroit sûr.</p>
        </>
      )}
      <div>
        <button className="btn btn-primary" onClick={handleExport} disabled={busy || !phraseOk}>
          {busy ? `Préparation… ${progress ? `${progress.done}/${progress.total}` : ""}` : encrypt ? "Télécharger une sauvegarde chiffrée" : "Télécharger une sauvegarde complète"}
        </button>
      </div>
      {result && <p className="hint" style={{ ...left, color: result.ok ? OK : BAD }}>{result.message}</p>}
    </div>
  );
}

// ===================================================================================================
// Restaurer
// ===================================================================================================
function BackupRestorePanel({ onChanged }) {
  const fileInputRef = React.useRef(null);
  const [step, setStep] = React.useState("idle"); // idle | reading | passphrase | preview | restoring | done | error
  const [fileName, setFileName] = React.useState("");
  const [envelope, setEnvelope] = React.useState(null);
  const [wasEncrypted, setWasEncrypted] = React.useState(false);
  const [phrase, setPhrase] = React.useState("");
  const [backup, setBackup] = React.useState(null);
  const [plan, setPlan] = React.useState(null);
  const [room, setRoom] = React.useState(null);
  const [progress, setProgress] = React.useState(null);
  const [report, setReport] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setStep("idle"); setFileName(""); setEnvelope(null); setWasEncrypted(false); setPhrase(""); setBackup(null);
    setPlan(null); setRoom(null); setProgress(null); setReport(null); setMessage(""); setBusy(false);
  }
  function fail(e) {
    setMessage((e && e.message) || String(e));
    setStep("error");
    setBusy(false);
  }
  function showPreview(parsedBackup) {
    const p = planRestore(parsedBackup, { mode: "merge" });
    setBackup(parsedBackup);
    setPlan(p);
    setRoom(p.deltaChars > 0 ? checkRoomForChars(p.deltaChars) : { ok: true, freeChars: null, neededChars: 0 });
    setStep("preview");
  }

  async function handleFile(file) {
    setFileName(file.name);
    setStep("reading");
    setMessage("");
    try {
      const text = await file.text();
      const parsed = parseBackupText(text);
      if (parsed.encrypted) {
        setEnvelope(parsed.envelope);
        setWasEncrypted(true);
        setStep("passphrase");
        return;
      }
      setWasEncrypted(false);
      showPreview(parsed.backup);
    } catch (e) { fail(e); }
  }

  async function handleDecrypt() {
    setBusy(true);
    setMessage("");
    try {
      const b = await openEncryptedBackup(envelope, phrase);
      setPhrase("");
      setBusy(false);
      showPreview(b);
    } catch (e) {
      setBusy(false);
      if (e instanceof BackupError && e.code === "wrong-passphrase") { setMessage(e.message); return; }
      fail(e);
    }
  }

  async function handleRestore() {
    setStep("restoring");
    setProgress({ done: 0, total: 1 });
    try {
      const r = await restoreFullBackup(backup, {
        mode: "merge",
        snapshotReason: `avant la restauration de la sauvegarde « ${fileName} »`,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setReport(r);
      setStep("done");
      if (onChanged) onChanged();
      const clean = r.skipped.length === 0 && r.matchFailures.length === 0 && !(r.snapshot && r.snapshot.warnings && r.snapshot.warnings.length);
      if (clean) setTimeout(() => window.location.reload(), 2500);
    } catch (e) { fail(e); }
  }

  const fileInput = (
    <input ref={fileInputRef} type="file" accept="application/json,.json" style={{ display: "none" }}
      onChange={(e) => { if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ""; }} />
  );

  return (
    <div className="new-match-card" style={{ marginTop: 16 }}>
      <div className="panel-heading" style={{ marginTop: 0 }}>Restaurer</div>

      {(step === "idle" || step === "error") && (
        <>
          <p className="hint" style={left}>À utiliser sur un navigateur neuf (nouvel ordinateur, cache vidé) ou pour revenir à un état antérieur. Tu verras un aperçu de ce qui sera changé avant toute écriture, et un instantané de l'état actuel est pris automatiquement.</p>
          {step === "error" && <p className="hint" style={{ ...left, color: BAD }}>{message}</p>}
          <div><button className="btn btn-ghost" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Choisir un fichier de sauvegarde</button></div>
        </>
      )}

      {step === "reading" && <p className="hint" style={left}>Lecture de « {fileName} »…</p>}

      {step === "passphrase" && (
        <>
          <p className="hint" style={left}>« {fileName} » est une sauvegarde chiffrée. Saisis la phrase secrète choisie lors de l'export.</p>
          <label>Phrase secrète<input type="password" autoComplete="off" value={phrase} onChange={(e) => setPhrase(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && phrase && !busy) handleDecrypt(); }} /></label>
          {message && <p className="hint" style={{ ...left, color: BAD }}>{message}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={handleDecrypt} disabled={busy || !phrase}>{busy ? "Déchiffrement…" : "Déchiffrer"}</button>
            <button className="btn btn-ghost" onClick={reset} disabled={busy}>Annuler</button>
          </div>
        </>
      )}

      {step === "preview" && backup && plan && (() => {
        const d = describeBackup(backup);
        const noRoom = room && !room.ok;
        return (
          <>
            <p className="hint" style={left}>
              <strong>« {fileName} »</strong> — sauvegarde {d.exportedAt ? <>du <strong>{formatDateTimeFr(d.exportedAt)}</strong></> : "sans date"}{wasEncrypted ? " (chiffrée)" : ""}, format {d.version}.
            </p>
            <p className="hint" style={left}>
              Contenu : {plural(d.teamCount, "équipe", "équipes")}, {plural(d.seasonCount, "saison", "saisons")}, {plural(d.keyCount, "rubrique", "rubriques")}, {plural(d.matchCount, "match tagué", "matchs tagués")}.
            </p>
            {plan.newCount + plan.changedCount === 0 ? (
              <p className="hint" style={left}>Rien ne changerait : toutes les rubriques de ce fichier sont déjà identiques à celles de ce navigateur ({plural(plan.unchanged, "rubrique", "rubriques")}).</p>
            ) : (
              <p className="hint" style={left}>
                Ce que ça change dans ce navigateur : <strong>{plural(plan.newCount, "rubrique nouvelle", "rubriques nouvelles")}</strong>, <strong>{plural(plan.changedCount, "rubrique remplacée", "rubriques remplacées")}</strong> (le contenu de la sauvegarde prend la place de celui d'ici : ce qui a été modifié ici depuis la date de la sauvegarde est remplacé), {plural(plan.unchanged, "identique", "identiques")} (laissées telles quelles).
              </p>
            )}
            {plan.addedTeams.length > 0 && <p className="hint" style={left}>Équipes ajoutées à ce navigateur : {plan.addedTeams.map((t) => t.name || t.id).join(", ")}.</p>}
            {plan.addedSeasons.length > 0 && <p className="hint" style={left}>Saisons ajoutées à ce navigateur : {plan.addedSeasons.map((s) => s.label || s.id).join(", ")}.</p>}
            <p className="hint" style={left}>Les équipes et saisons qui existent ici mais pas dans la sauvegarde sont conservées, ainsi que leurs données.</p>
            {plan.skipped.length > 0 && <p className="hint" style={{ ...left, color: WARN }}>{plural(plan.skipped.length, "élément sera ignoré", "éléments seront ignorés")} (illisibles ou étrangers à l'application) : {plan.skipped.slice(0, 4).map((s) => `${s.key} (${s.reason})`).join(" ; ")}{plan.skipped.length > 4 ? "…" : ""}.</p>}
            {room && room.neededChars > 0 && (
              <p className="hint" style={{ ...left, color: noRoom ? BAD : OK }}>
                {noRoom
                  ? `Pas assez de place : il faut environ ${formatChars(room.neededChars)} de plus, il en reste environ ${formatChars(room.freeChars)}. Libère de la place (jauge plus bas) avant de restaurer.`
                  : `Place suffisante : environ ${formatChars(room.neededChars)} de plus nécessaires, ${formatChars(room.freeChars)} disponibles.`}
              </p>
            )}
            <p className="hint" style={left}>{hasUserData() ? "Un instantané automatique de l'état actuel sera enregistré avant l'écriture : tu pourras revenir en arrière (voir « Instantané automatique »)." : "Ce navigateur ne contient encore aucune donnée à protéger."}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={handleRestore} disabled={noRoom}>Restaurer cette sauvegarde</button>
              <button className="btn btn-ghost" onClick={reset}>Annuler</button>
            </div>
          </>
        );
      })()}

      {step === "restoring" && <p className="hint" style={left}>Restauration en cours… {progress ? `${progress.done}/${progress.total}` : ""} — ne ferme pas la page.</p>}

      {step === "done" && report && (
        <>
          <p className="hint" style={{ ...left, color: OK }}><strong>Sauvegarde restaurée.</strong> {plural(report.written, "rubrique écrite", "rubriques écrites")}{report.unchanged ? `, ${report.unchanged} déjà identiques` : ""}{report.matchCount ? `, ${plural(report.matchCount, "match tagué", "matchs tagués")} remis` : ""}.</p>
          {report.addedTeams.length + report.addedSeasons.length > 0 && <p className="hint" style={left}>Ajoutées : {[...report.addedTeams.map((t) => t.name || t.id), ...report.addedSeasons.map((s) => s.label || s.id)].join(", ")}.</p>}
          {report.skipped.length > 0 && <p className="hint" style={{ ...left, color: WARN }}>{plural(report.skipped.length, "élément ignoré", "éléments ignorés")} : {report.skipped.slice(0, 4).map((s) => `${s.key} (${s.reason})`).join(" ; ")}.</p>}
          {report.matchFailures.length > 0 && <p className="hint" style={{ ...left, color: BAD }}>Les matchs tagués de {plural(report.matchFailures.length, "équipe/saison", "équipes/saisons")} n'ont PAS pu être restaurés ({report.matchFailures.slice(0, 2).map((m) => m.error).join(" ; ")}). Le reste est bien restauré.</p>}
          {report.snapshot && report.snapshot.warnings && report.snapshot.warnings.length > 0 && <p className="hint" style={{ ...left, color: WARN }}>L'instantané automatique est incomplet : les matchs de {plural(report.snapshot.warnings.length, "équipe/saison", "équipes/saisons")} n'ont pas pu y être copiés.</p>}
          <p className="hint" style={left}>L'application va se recharger pour afficher les données restaurées.</p>
          <div><button className="btn btn-primary" onClick={() => window.location.reload()}>Recharger maintenant</button></div>
        </>
      )}
      {fileInput}
    </div>
  );
}

// ===================================================================================================
// Instantané automatique : revenir en arrière
// ===================================================================================================
function SafetyNetPanel({ version, onChanged }) {
  const [info, setInfo] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState(null); // { ok, text }

  React.useEffect(() => {
    let alive = true;
    getSafetySnapshotInfo().then((i) => { if (alive) { setInfo(i); setLoaded(true); } });
    return () => { alive = false; };
  }, [version]);

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const text = await loadSafetySnapshotText();
      if (!text) throw new Error("instantané introuvable");
      downloadTextFile(text, `game-changer-instantane-${dateIsoLocal(info.at)}.json`);
      setMessage({ ok: true, text: "Instantané téléchargé : c'est un fichier de sauvegarde ordinaire, restaurable comme les autres." });
    } catch (e) { setMessage({ ok: false, text: "Le téléchargement a échoué : " + ((e && e.message) || e) }); }
    setBusy(false);
  }
  async function revert() {
    if (!confirm(`Revenir à l'état de ce navigateur du ${formatDateTimeFr(info.at)} (${info.reason}) ?\n\nL'état actuel est d'abord enregistré à son tour : tu pourras revenir en avant. La page se rechargera.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await revertToSafetySnapshot();
      setMessage({ ok: r.matchFailures.length === 0, text: r.matchFailures.length ? "Retour effectué, mais les matchs tagués de certaines équipes n'ont pas pu être remis." : "Retour effectué. Rechargement…" });
      if (onChanged) onChanged();
      if (r.matchFailures.length === 0) setTimeout(() => window.location.reload(), 1500);
    } catch (e) { setMessage({ ok: false, text: "Le retour a échoué : " + ((e && e.message) || e) }); }
    setBusy(false);
  }

  if (!loaded || !info) return null;
  return (
    <div className="new-match-card" style={{ marginTop: 16 }}>
      <div className="panel-heading" style={{ marginTop: 0 }}>Instantané automatique</div>
      <p className="hint" style={left}>
        Avant une restauration ou une suppression de données, l'application garde une copie de l'état du moment, dans ce navigateur. Copie actuelle : <strong>{formatDateTimeFr(info.at)}</strong>, {info.reason || "prise avant une opération"} ({formatBytes(info.chars)}). Elle est remplacée à la prochaine opération.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-small" onClick={revert} disabled={busy}>Revenir à cet état</button>
        <button className="btn btn-ghost btn-small" onClick={download} disabled={busy}>Télécharger cet instantané</button>
      </div>
      {message && <p className="hint" style={{ ...left, color: message.ok ? OK : BAD }}>{message.text}</p>}
    </div>
  );
}

// ===================================================================================================
// Place disponible
// ===================================================================================================
function Meter({ fraction }) {
  const pct = Math.max(0, Math.min(1, fraction));
  const color = pct > 0.9 ? BAD : pct > 0.7 ? WARN : OK;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} style={{ height: 12, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ width: `${pct * 100}%`, height: "100%", background: color, transition: "width 0.3s ease" }} />
    </div>
  );
}

function StorageGaugePanel({ version, onChanged }) {
  const [gauge, setGauge] = React.useState(null); // { summary, free }
  const [origin, setOrigin] = React.useState(null);
  const [persist, setPersist] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      // La mesure de la place restante écrit puis efface une clé temporaire : synchrone, quelques
      // dizaines de ms. Lancée après le premier affichage pour ne pas retarder l'écran.
      const teams = parseList(readRawKey("tf_teams"));
      const seasons = parseList(readRawKey("tf_seasons"));
      const summary = summarizeStorage(listStorageEntries(), teams, seasons);
      const free = measureFreeChars();
      if (alive) setGauge({ summary, free });
    }, 30);
    estimateOrigin().then((o) => { if (alive) setOrigin(o); });
    getPersistenceState().then((p) => { if (alive) setPersist(p); });
    return () => { alive = false; clearTimeout(t); };
  }, [version, tick]);

  async function askPersistence() {
    const r = await requestPersistence({ interactive: true });
    setPersist({ supported: r.supported, persisted: r.persisted });
    setMessage(r.persisted ? { ok: true, text: "Protection activée : le navigateur ne devrait plus effacer les données de ce site de lui-même." } : { ok: false, text: "Le navigateur n'a pas accordé la protection (il décide selon l'usage du site ; Firefox demande une confirmation). Les sauvegardes restent ton vrai filet." });
  }

  async function purge(scope) {
    const label = `${scope.teamName} — ${scope.seasonLabel}`;
    if (!confirm(`Supprimer définitivement les données de « ${label} » ?\n\n${plural(scope.keyCount, "rubrique", "rubriques")}, environ ${formatChars(scope.chars)} (effectif, séances, exercices, suivi…) seront effacées de ce navigateur. Cette équipe ou cette saison n'existe plus dans les listes : ces données ne sont plus visibles nulle part.\n\nUn instantané automatique est pris avant (voir « Instantané automatique »). Les matchs tagués et les clips vidéo ne sont pas touchés.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await purgeOrphanScope(scope.teamId, scope.seasonId);
      setMessage({ ok: true, text: `${plural(r.removed, "rubrique supprimée", "rubriques supprimées")} : ${formatChars(r.freedChars)} libérés.` });
      if (onChanged) onChanged();
      setTick((n) => n + 1);
    } catch (e) { setMessage({ ok: false, text: "La suppression a échoué : " + ((e && e.message) || e) }); }
    setBusy(false);
  }

  const s = gauge && gauge.summary;
  const free = gauge && gauge.free;
  const usedChars = s ? s.totalChars : 0;
  const capacity = free && !free.error ? usedChars + free.freeChars : 0;
  const fraction = capacity > 0 && !free.capped ? usedChars / capacity : 0;
  const orphanScopes = s ? s.scopes.filter((x) => x.orphan) : [];
  const lowRoom = free && !free.capped && !free.error && (free.freeChars * BYTES_PER_CHAR < 1024 * 1024 || fraction > 0.9);

  return (
    <div className="new-match-card" style={{ marginTop: 16 }}>
      <div className="panel-heading" style={{ marginTop: 0 }}>Place disponible dans ce navigateur</div>
      <p className="hint" style={left}>Toutes tes données (hors matchs tagués et clips) vivent dans le stockage local du navigateur, limité à quelques Mo. Quand il est plein, les enregistrements échouent. Cette jauge mesure ce qui est utilisé et ce qu'il reste.</p>

      {!gauge && <p className="hint" style={left}>Mesure en cours…</p>}

      {gauge && free && free.error && <p className="hint" style={{ ...left, color: BAD }}>La place restante n'a pas pu être mesurée (stockage local inaccessible ou désactivé).</p>}

      {gauge && free && !free.error && (
        <>
          <Meter fraction={free.capped ? 0.02 : fraction} />
          <p className="hint" style={{ ...left, color: lowRoom ? BAD : "var(--ink)" }}>
            {free.capped
              ? <><strong>{formatChars(usedChars)}</strong> utilisés, et plus de {formatChars(free.freeChars)} encore libres.</>
              : <><strong>{formatChars(usedChars)}</strong> utilisés sur environ <strong>{formatChars(capacity)}</strong> ({Math.round(fraction * 100)} %) — il reste environ <strong>{formatChars(free.freeChars)}</strong>.</>}
            {lowRoom && " Le stockage est presque plein : une nouvelle équipe, une reconduction de saison ou l'import de la banque d'exercices peuvent échouer."}
          </p>
        </>
      )}

      {s && s.exercises.copies >= 2 && (
        <p className="hint" style={left}>La banque d'exercices est enregistrée <strong>{s.exercises.copies} fois</strong> (une copie par équipe et par saison) : {formatChars(s.exercises.chars)} au total. C'est ce qui remplit le plus vite le stockage.</p>
      )}

      {s && (
        <div className="scouting-list">
          {/* Lignes qui passent à la ligne sur téléphone : titre / taille / bouton ne se chevauchent jamais. */}
          <div className="scouting-card" style={{ flexWrap: "wrap" }}>
            <div className="scouting-info" style={{ flex: "1 1 170px" }}>
              <div className="scouting-name">Données du club</div>
              <div className="scouting-club" style={{ marginLeft: 0 }}>communes à toutes les équipes</div>
            </div>
            <div style={{ whiteSpace: "nowrap" }}>{formatChars(s.clubChars)}</div>
          </div>
          {s.scopes.map((scope) => (
            <div className="scouting-card" key={`${scope.teamId}::${scope.seasonId}`} style={{ flexWrap: "wrap", ...(scope.orphan ? { borderColor: WARN } : {}) }}>
              <div className="scouting-info" style={{ flex: "1 1 170px" }}>
                <div className="scouting-name">{scope.teamName} — {scope.seasonLabel}</div>
                {scope.orphan && <div className="scouting-club" style={{ marginLeft: 0, color: WARN }}>équipe ou saison supprimée</div>}
                <div className="scouting-club" style={{ marginLeft: 0 }}>{plural(scope.keyCount, "rubrique", "rubriques")}{scope.keys[0] ? ` · la plus lourde : ${scope.keys[0].baseKey} (${formatChars(scope.keys[0].chars)})` : ""}</div>
              </div>
              <div style={{ whiteSpace: "nowrap" }}>{formatChars(scope.chars)}</div>
              {scope.orphan && <button className="btn btn-ghost btn-small" onClick={() => purge(scope)} disabled={busy}>Supprimer</button>}
            </div>
          ))}
          {s.otherChars > 0 && (
            <div className="scouting-card" style={{ flexWrap: "wrap" }}>
              <div className="scouting-info" style={{ flex: "1 1 170px" }}>
                <div className="scouting-name">Autres données du site</div>
                <div className="scouting-club" style={{ marginLeft: 0 }}>hors application</div>
              </div>
              <div style={{ whiteSpace: "nowrap" }}>{formatChars(s.otherChars)}</div>
            </div>
          )}
        </div>
      )}
      {orphanScopes.length > 0 && s && (
        <p className="hint" style={{ ...left, color: WARN }}>
          {formatChars(s.orphanChars)} sont occupés par des données d'équipes ou de saisons supprimées : supprimer une équipe ou une saison de la liste ne libère pas la place, les données restent stockées sans être visibles. « Supprimer » les efface pour de bon (après un instantané automatique).
        </p>
      )}

      {origin && origin.supported && (
        <p className="hint" style={left}>Ensemble du site dans ce navigateur, matchs tagués et clips compris : environ {formatBytes(origin.usage)} (estimation du navigateur, sur {formatBytes(origin.quota)} possibles). Matchs et clips sont stockés à part, sans la limite de quelques Mo.</p>
      )}

      {persist && persist.supported && (
        <p className="hint" style={left}>
          Protection contre l'effacement automatique : <strong style={{ color: persist.persisted ? OK : WARN }}>{persist.persisted ? "activée" : "non accordée"}</strong>.
          {!persist.persisted && " Sans elle, le navigateur peut effacer les données du site quand l'appareil manque de place."}
          {!persist.persisted && <> <button className="btn btn-ghost btn-small" onClick={askPersistence} style={{ marginLeft: 6 }}>Demander la protection</button></>}
        </p>
      )}
      {isSafariBrowser() && !isStandaloneDisplay() && (
        <p className="hint" style={{ ...left, color: WARN }}>Safari efface les données d'un site (stockage local et matchs) après 7 jours sans visite, sauf si le site est ajouté à l'écran d'accueil. Si tu utilises Safari, sauvegarde régulièrement.</p>
      )}

      {message && <p className="hint" style={{ ...left, color: message.ok ? OK : BAD }}>{message.text}</p>}
      <div><button className="btn btn-ghost btn-small" onClick={() => setTick((n) => n + 1)} disabled={busy}>Mesurer à nouveau</button></div>
    </div>
  );
}

// ===================================================================================================
export default function BackupCenter() {
  const [version, setVersion] = React.useState(0);
  const bump = React.useCallback(() => setVersion((v) => v + 1), []);
  return (
    <>
      <BackupExportPanel onChanged={bump} />
      <BackupRestorePanel onChanged={bump} />
      <SafetyNetPanel version={version} onChanged={bump} />
      <StorageGaugePanel version={version} onChanged={bump} />
    </>
  );
}
