// Sauvegarde complète : export (clair ou chiffré), contrôle du fichier, restauration sûre,
// instantané automatique, rappel. Extrait de App.jsx pour deux raisons : le bouton « Télécharger une
// sauvegarde » de l'écran d'erreur (lib/ErrorBoundary.jsx) doit fonctionner MÊME quand l'app a
// planté, donc ne peut pas dépendre de l'arbre React ; et le code est testable sous Node.
//
// Rappel d'architecture : tout le site staff vit dans le localStorage d'UN navigateur (clés `tf_*`,
// cloisonnées par équipe × saison via lib/storage.js) et, pour les matchs, dans IndexedDB. Cette
// sauvegarde est le seul filet. Elle ne couvre pas les clips vidéo compilés (trop volumineux).
//
// Dates : toujours todayIso()/dateIsoLocal()/diffDaysIso() de lib/utils.js (jamais la date UTC
// tronquée : voir la leçon sur les dates dans CLAUDE.md).

import {
  DEFAULT_TEAM_ID, DEFAULT_SEASON_ID, UNSCOPED_STORAGE_KEYS,
  scopeSuffixFor, readRawKey, writeRawKey, removeRawKey, listRawKeys, rollbackRawWrites,
} from "./storage.js";
import { todayIso, dateIsoLocal, diffDaysIso, addDaysIso, formatDateFr } from "./utils.js";
import { checkRoomForChars, formatChars } from "./storageGauge.js";
import {
  BackupError, BACKUP_APP, isEncryptedEnvelope, encryptBackupText, decryptBackupEnvelope,
} from "./backupCrypto.js";
import { saveSafetySnapshot, loadSafetySnapshotText, getSafetySnapshotInfo } from "./safetyNet.js";

export { BackupError };

// Format du fichier. 1 : première version (sans champ `app`). 2 : ajoute `app`, et le fichier peut
// être une enveloppe chiffrée (voir backupCrypto.js). La structure interne (teams, seasons,
// clubData, teamData) n'a pas changé : une sauvegarde v1 se restaure telle quelle.
export const BACKUP_VERSION = 2;
export const REMINDER_AFTER_DAYS = 14;
export const SNOOZE_DAYS = 3;

// Clés qui décrivent CE navigateur et non les données du club : ni exportées, ni restaurées
// (restaurer une vieille sauvegarde ne doit pas faire reculer la « date de dernière sauvegarde »).
export const DEVICE_LOCAL_KEYS = new Set(["tf_last_backup", "tf_backup_snooze_until", "tf_portal_invitations_log"]);
// État de l'interface : exporté (un navigateur neuf retrouve la même équipe active) mais, à la
// restauration, jamais appliqué par-dessus un choix déjà fait dans ce navigateur.
const UI_STATE_KEYS = new Set(["tf_active_team", "tf_active_season", "tf_category_filter"]);

// Copies des noms de base IndexedDB de src/App.jsx (matchesDbNameFor, MATCHES_STORE, OBS_STORE).
// tests/stockage.test.mjs vérifie qu'elles n'ont pas dérivé.
export const MATCHES_STORE = "matches";
export const OBS_STORE = "obs_matches";
export function matchesDbNameFor(teamId, seasonId) {
  const suffix = (teamId === DEFAULT_TEAM_ID && seasonId === DEFAULT_SEASON_ID) ? "" : `__${teamId}__${seasonId}`;
  return suffix ? "tf_matches_db" + suffix : "tf_matches_db";
}

const parseList = (raw) => {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []; } catch (e) { return []; }
};

// --- Lecture / écriture des matchs (IndexedDB) -----------------------------------------------------
// Les deux fonctions ferment la base après usage (l'ancienne version ne le faisait pas : une
// connexion restée ouverte bloquerait une suppression de base) et lisent avec un délai maximum :
// un export ne doit pas rester bloqué sur une base verrouillée. En cas d'échec de lecture, l'erreur
// est RENVOYÉE (champ `error`) pour que l'appelant prévienne que la sauvegarde est incomplète — l'ancienne
// version renvoyait silencieusement « aucun match ».
export function readAllMatchesFromDb(teamId, seasonId, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    timer = setTimeout(() => finish({ matches: [], obs: [], error: "délai dépassé" }), timeoutMs);
    if (typeof indexedDB === "undefined") { finish({ matches: [], obs: [], error: "IndexedDB indisponible" }); return; }
    try {
      const req = indexedDB.open(matchesDbNameFor(teamId, seasonId), 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(MATCHES_STORE)) db.createObjectStore(MATCHES_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(OBS_STORE)) db.createObjectStore(OBS_STORE, { keyPath: "id" });
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction([MATCHES_STORE, OBS_STORE], "readonly");
          let matches = null, obs = null, error = null;
          const done = () => { if (matches != null && obs != null) { db.close(); finish({ matches, obs, error }); } };
          const mReq = tx.objectStore(MATCHES_STORE).getAll();
          mReq.onsuccess = () => { matches = mReq.result || []; done(); };
          mReq.onerror = () => { matches = []; error = "lecture des matchs Studio impossible"; done(); };
          const oReq = tx.objectStore(OBS_STORE).getAll();
          oReq.onsuccess = () => { obs = oReq.result || []; done(); };
          oReq.onerror = () => { obs = []; error = "lecture des matchs Observation impossible"; done(); };
        } catch (e) { db.close(); finish({ matches: [], obs: [], error: String(e && e.message || e) }); }
      };
      req.onerror = () => finish({ matches: [], obs: [], error: String((req.error && req.error.message) || "ouverture impossible") });
    } catch (e) { finish({ matches: [], obs: [], error: String(e && e.message || e) }); }
  });
}

// `replace` : vide d'abord les deux magasins (retour à l'état exact d'un instantané). Sans, les
// matchs sont ajoutés ou remplacés par identifiant et ceux qui ne figurent pas dans la sauvegarde
// restent en place.
export function restoreMatchesToDb(teamId, seasonId, matches, obs, { replace = false } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB indisponible")); return; }
    const req = indexedDB.open(matchesDbNameFor(teamId, seasonId), 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MATCHES_STORE)) db.createObjectStore(MATCHES_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(OBS_STORE)) db.createObjectStore(OBS_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction([MATCHES_STORE, OBS_STORE], "readwrite");
        const ms = tx.objectStore(MATCHES_STORE);
        const os = tx.objectStore(OBS_STORE);
        if (replace) { ms.clear(); os.clear(); }
        (matches || []).forEach((m) => ms.put(m));
        (obs || []).forEach((m) => os.put(m));
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error("transaction annulée")); };
      } catch (e) { db.close(); reject(e); }
    };
    req.onerror = () => reject(req.error);
  });
}

// --- Inventaire du localStorage ----------------------------------------------------------------------
// { clubData, teamData } : les clés non cloisonnées d'un côté, les clés cloisonnées rangées par
// « équipe::saison » (clé de base, sans suffixe) de l'autre. Les clés d'une équipe ou d'une saison
// supprimée ne correspondent à aucun couple de la liste : elles sont rangées avec leur clé complète
// dans le groupe par défaut, et reviennent telles quelles à la restauration.
export function inventoryLocalStorage(teams, seasons, keys = listRawKeys()) {
  const tfKeys = keys.filter((k) => k && k.startsWith("tf_") && !DEVICE_LOCAL_KEYS.has(k));
  const clubData = {};
  const teamData = {};
  const ensureScope = (scopeKey) => (teamData[scopeKey] || (teamData[scopeKey] = {}));

  tfKeys.forEach((key) => {
    const value = readRawKey(key);
    if (UNSCOPED_STORAGE_KEYS.has(key)) { clubData[key] = value; return; }
    let matchedScope = null, matchedBaseKey = null;
    teams.forEach((team) => {
      seasons.forEach((season) => {
        if (team.id === DEFAULT_TEAM_ID && season.id === DEFAULT_SEASON_ID) return;
        const suffix = `__${team.id}__${season.id}`;
        if (key.endsWith(suffix)) { matchedScope = `${team.id}::${season.id}`; matchedBaseKey = key.slice(0, key.length - suffix.length); }
      });
    });
    if (matchedScope) ensureScope(matchedScope)[matchedBaseKey] = value;
    else ensureScope(`${DEFAULT_TEAM_ID}::${DEFAULT_SEASON_ID}`)[key] = value;
  });
  return { clubData, teamData };
}

// --- Export -------------------------------------------------------------------------------------------
// Construit l'objet de sauvegarde (sans le télécharger). `warnings` : un élément par équipe×saison dont
// les matchs n'ont pas pu être lus — la sauvegarde est alors INCOMPLÈTE et l'appelant doit le dire.
export async function buildFullBackup({ onProgress, readMatches = readAllMatchesFromDb } = {}) {
  let teams = parseList(readRawKey("tf_teams"));
  let seasons = parseList(readRawKey("tf_seasons"));
  if (teams.length === 0) teams = [{ id: DEFAULT_TEAM_ID, name: "Équipe" }];
  if (seasons.length === 0) seasons = [{ id: DEFAULT_SEASON_ID, label: "Saison" }];

  const { clubData, teamData } = inventoryLocalStorage(teams, seasons);
  const warnings = [];
  let done = 0;
  const total = teams.length * seasons.length;
  for (const team of teams) {
    for (const season of seasons) {
      const scopeKey = `${team.id}::${season.id}`;
      const { matches, obs, error } = await readMatches(team.id, season.id);
      if (error) warnings.push({ teamId: team.id, seasonId: season.id, teamName: team.name, seasonLabel: season.label, error });
      if (matches.length > 0 || obs.length > 0) {
        if (!teamData[scopeKey]) teamData[scopeKey] = {};
        teamData[scopeKey]._studioMatches = matches;
        teamData[scopeKey]._obsMatches = obs;
      }
      done++;
      if (onProgress) onProgress(done, total);
    }
  }
  const backup = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), teams, seasons, clubData, teamData };
  return { backup, warnings };
}

// Objet de sauvegarde → texte du fichier (chiffré si une phrase secrète est donnée).
export async function serializeBackup(backup, { passphrase } = {}) {
  const plain = JSON.stringify(backup);
  if (!passphrase) return { text: plain, encrypted: false, filename: `game-changer-sauvegarde-${todayIso()}.json` };
  const envelope = await encryptBackupText(plain, passphrase);
  return { text: JSON.stringify(envelope), encrypted: true, filename: `game-changer-sauvegarde-${todayIso()}-chiffree.json` };
}

export function downloadTextFile(text, filename, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Date de la dernière sauvegarde téléchargée depuis ce navigateur. Écrite APRÈS le téléchargement
// (on ne sait pas si le fichier a été gardé, seulement qu'il a été demandé), et sans alerte de
// quota : un stockage plein ne doit pas transformer une sauvegarde réussie en erreur.
export function recordLastBackup({ chars, encrypted }) {
  return writeRawKey("tf_last_backup", JSON.stringify({ at: Date.now(), chars, encrypted: !!encrypted }), { silent: true });
}
export function getLastBackup() {
  try {
    const v = JSON.parse(readRawKey("tf_last_backup") || "null");
    return v && Number.isFinite(v.at) ? v : null;
  } catch (e) { return null; }
}
// Âge en jours calendaires (date locale), pas en tranches de 24 h : « il y a 1 jour » = hier.
export function backupAgeDays(last, today = todayIso()) {
  return last ? diffDaysIso(today, dateIsoLocal(last.at)) : NaN;
}
// « aujourd'hui », « hier », « il y a 5 jours (02/10/2026) » — texte affiché à côté du bouton.
export function describeBackupAge(last, today = todayIso()) {
  const days = backupAgeDays(last, today);
  if (!Number.isFinite(days)) return "date inconnue";
  const date = formatDateFr(dateIsoLocal(last.at));
  if (days <= 0) return `aujourd'hui (${date})`;
  if (days === 1) return `hier (${date})`;
  return `il y a ${days} jours (${date})`;
}

// Télécharge la sauvegarde complète. Renvoie { filename, chars, encrypted, warnings }.
export async function exportFullBackupFile({ onProgress, passphrase, readMatches } = {}) {
  const { backup, warnings } = await buildFullBackup({ onProgress, readMatches });
  const { text, encrypted, filename } = await serializeBackup(backup, { passphrase });
  downloadTextFile(text, filename);
  recordLastBackup({ chars: text.length, encrypted });
  return { filename, chars: text.length, encrypted, warnings };
}

// --- Rappel de sauvegarde ---------------------------------------------------------------------------
// Y a-t-il de vraies données à perdre ? (au moins un joueur, un match ou une séance, dans n'importe
// quel scope). Évite de harceler un navigateur neuf.
export function hasUserData(keys = listRawKeys()) {
  return keys.some((k) => {
    if (!k.startsWith("tf_roster") && !k.startsWith("tf_matches_index") && !k.startsWith("tf_sessions")) return false;
    const base = k.split("__")[0];
    if (base !== "tf_roster" && base !== "tf_matches_index" && base !== "tf_sessions") return false;
    return parseList(readRawKey(k)).length > 0;
  });
}

export function getBackupReminder(today = todayIso()) {
  if (!hasUserData()) return { show: false };
  const snooze = readRawKey("tf_backup_snooze_until");
  if (snooze && snooze > today) return { show: false, snoozed: true };
  const last = getLastBackup();
  if (!last) return { show: true, reason: "never" };
  const days = backupAgeDays(last, today);
  if (Number.isFinite(days) && days > REMINDER_AFTER_DAYS) return { show: true, reason: "old", days, last };
  return { show: false, days, last };
}
export function snoozeBackupReminder(days = SNOOZE_DAYS) {
  return writeRawKey("tf_backup_snooze_until", addDaysIso(todayIso(), days), { silent: true });
}

// --- Lecture et contrôle d'un fichier ------------------------------------------------------------------
export function validateBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new BackupError("Ce fichier n'est pas une sauvegarde Game Changer.", "invalid");
  if (data.app !== undefined && data.app !== BACKUP_APP) throw new BackupError("Ce fichier n'est pas une sauvegarde Game Changer.", "invalid");
  const version = data.version === undefined ? 1 : data.version;
  if (!Number.isInteger(version) || version < 1) throw new BackupError("Le numéro de version de cette sauvegarde est illisible : le fichier est abîmé ou n'a pas été créé par Game Changer.", "invalid");
  if (version > BACKUP_VERSION) {
    throw new BackupError(`Cette sauvegarde a été créée par une version plus récente de Game Changer (format ${version} ; cette version comprend jusqu'au format ${BACKUP_VERSION}). Recharge la page pour mettre l'application à jour, puis réessaie. Rien n'a été modifié.`, "too-new");
  }
  if (!Array.isArray(data.teams) || !data.teamData || typeof data.teamData !== "object" || Array.isArray(data.teamData)) {
    throw new BackupError("Format de sauvegarde non reconnu : la liste des équipes ou les données sont absentes. Rien n'a été modifié.", "invalid");
  }
  const seasons = data.seasons === undefined ? [] : data.seasons;
  const badId = (list) => !Array.isArray(list) || list.some((x) => !x || typeof x !== "object" || typeof x.id !== "string" || !x.id);
  if (badId(data.teams) || badId(seasons)) throw new BackupError("Format de sauvegarde non reconnu : une équipe ou une saison n'a pas d'identifiant. Rien n'a été modifié.", "invalid");
  if (data.clubData !== undefined && (typeof data.clubData !== "object" || data.clubData === null || Array.isArray(data.clubData))) {
    throw new BackupError("Format de sauvegarde non reconnu : les données du club sont illisibles. Rien n'a été modifié.", "invalid");
  }
  return { ...data, version, seasons, clubData: data.clubData || {} };
}

// Texte d'un fichier → { encrypted: false, backup } ou { encrypted: true, envelope } (il faudra alors la phrase).
export function parseBackupText(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) {
    throw new BackupError("Ce fichier n'est pas une sauvegarde Game Changer lisible (JSON invalide ou incomplet : le téléchargement s'est peut-être interrompu). Rien n'a été modifié.", "invalid");
  }
  if (isEncryptedEnvelope(data)) return { encrypted: true, envelope: data };
  return { encrypted: false, backup: validateBackup(data) };
}

export async function openEncryptedBackup(envelope, passphrase) {
  const inner = await decryptBackupEnvelope(envelope, passphrase);
  const parsed = parseBackupText(inner);
  if (parsed.encrypted) throw new BackupError("Fichier non reconnu (sauvegarde chiffrée dans une sauvegarde chiffrée).", "invalid");
  return parsed.backup;
}

// --- Plan de restauration -------------------------------------------------------------------------------
// Ce qu'une restauration ferait, SANS rien écrire (sert à l'aperçu avant confirmation, au contrôle de
// place et à l'exécution). Règles :
//  - mode « merge » (restauration d'un fichier) : chaque rubrique présente dans la sauvegarde remplace
//    celle du navigateur ; les rubriques absentes de la sauvegarde ne bougent pas ; les listes
//    d'équipes et de saisons sont FUSIONNÉES par identifiant (une équipe ou une saison créée depuis la
//    sauvegarde reste dans les sélecteurs ; pour un même identifiant, la sauvegarde l'emporte, comme
//    pour le reste de ses données) ; l'équipe/saison active et le filtre de catégorie ne sont jamais
//    écrasés ;
//  - mode « replace » (retour à un instantané) : état exact de l'instantané — listes telles quelles,
//    et suppression des clés `tf_*` ajoutées depuis.
//  - seules les clés `tf_*` sont écrites : un fichier forgé ou abîmé ne peut pas toucher autre chose
//    (session de connexion au portail, par exemple).
export function mergeById(current, incoming) {
  const result = current.map((item) => {
    const replacement = incoming.find((x) => x.id === item.id);
    return replacement || item;
  });
  incoming.forEach((x) => { if (!current.some((c) => c.id === x.id)) result.push(x); });
  return result;
}

export function planRestore(backup, { mode = "merge" } = {}) {
  const replace = mode === "replace";
  const currentTeams = parseList(readRawKey("tf_teams"));
  const currentSeasons = parseList(readRawKey("tf_seasons"));
  const teams = replace ? backup.teams : mergeById(currentTeams, backup.teams);
  const seasons = replace ? backup.seasons : mergeById(currentSeasons, backup.seasons);
  const addedTeams = backup.teams.filter((t) => !currentTeams.some((c) => c.id === t.id));
  const addedSeasons = backup.seasons.filter((s) => !currentSeasons.some((c) => c.id === s.id));

  const candidates = [
    { rawKey: "tf_teams", value: JSON.stringify(teams) },
    { rawKey: "tf_seasons", value: JSON.stringify(seasons) },
  ];
  const skipped = [];
  const matchScopes = [];

  const consider = (rawKey, value, label) => {
    if (typeof rawKey !== "string" || !rawKey.startsWith("tf_")) { skipped.push({ key: String(rawKey), reason: "n'est pas une clé de l'application" }); return; }
    if (DEVICE_LOCAL_KEYS.has(rawKey)) return;
    if (typeof value !== "string") { skipped.push({ key: label || rawKey, reason: "valeur illisible" }); return; }
    candidates.push({ rawKey, value });
  };

  Object.entries(backup.clubData).forEach(([key, value]) => {
    if (key === "tf_teams" || key === "tf_seasons") return;
    if (!replace && UI_STATE_KEYS.has(key) && readRawKey(key) != null) return;
    consider(key, value);
  });
  Object.entries(backup.teamData).forEach(([scopeKey, data]) => {
    const parts = String(scopeKey).split("::");
    if (parts.length !== 2 || !parts[0] || !parts[1] || !data || typeof data !== "object") { skipped.push({ key: String(scopeKey), reason: "équipe/saison illisible" }); return; }
    const [teamId, seasonId] = parts;
    const suffix = scopeSuffixFor(teamId, seasonId);
    Object.entries(data).forEach(([baseKey, value]) => {
      if (baseKey === "_studioMatches" || baseKey === "_obsMatches") return;
      consider(baseKey + suffix, value, baseKey);
    });
    if (Array.isArray(data._studioMatches) || Array.isArray(data._obsMatches)) {
      matchScopes.push({ teamId, seasonId, matches: data._studioMatches || [], obs: data._obsMatches || [] });
    }
  });

  // Doublons éventuels (une même clé citée deux fois) : la dernière gagne.
  const byKey = new Map();
  candidates.forEach((c) => byKey.set(c.rawKey, c));
  const all = [...byKey.values()];

  let unchanged = 0;
  const writes = [];
  all.forEach((c) => {
    const current = readRawKey(c.rawKey);
    if (current === c.value) { unchanged += 1; return; }
    writes.push({ ...c, isNew: current === null, deltaChars: (c.rawKey.length + c.value.length) - (current === null ? 0 : c.rawKey.length + current.length) });
  });
  // Les clés qui rétrécissent d'abord : la place nécessaire ne dépasse alors jamais le maximum entre
  // l'état de départ et l'état final (pas de pic intermédiaire qui ferait échouer l'écriture).
  writes.sort((a, b) => a.deltaChars - b.deltaChars);

  let removes = [];
  if (replace) {
    const keep = new Set(all.map((c) => c.rawKey));
    removes = listRawKeys().filter((k) => k.startsWith("tf_") && !DEVICE_LOCAL_KEYS.has(k) && !keep.has(k));
  }
  const removedChars = removes.reduce((n, k) => n + k.length + (readRawKey(k) || "").length, 0);

  // Retour exact : les matchs sont remis à l'état de l'instantané dans TOUS les couples équipe×saison
  // connus (ceux de l'instantané et ceux d'aujourd'hui), y compris ceux où il n'y avait aucun match.
  let scopesForMatches = matchScopes;
  if (replace) {
    const have = new Set(matchScopes.map((m) => `${m.teamId}::${m.seasonId}`));
    const extra = [];
    new Map([...currentTeams, ...backup.teams].map((t) => [t.id, t])).forEach((team) => {
      new Map([...currentSeasons, ...backup.seasons].map((s) => [s.id, s])).forEach((season) => {
        if (!have.has(`${team.id}::${season.id}`)) extra.push({ teamId: team.id, seasonId: season.id, matches: [], obs: [] });
      });
    });
    scopesForMatches = [...matchScopes, ...extra];
  }

  return {
    mode, teams, seasons, addedTeams, addedSeasons,
    writes, unchanged, skipped, removes, removedChars,
    newCount: writes.filter((w) => w.isNew).length,
    changedCount: writes.filter((w) => !w.isNew).length,
    deltaChars: writes.reduce((n, w) => n + w.deltaChars, 0),
    writtenChars: writes.reduce((n, w) => n + w.rawKey.length + w.value.length, 0),
    matchScopes: scopesForMatches,
    matchCount: matchScopes.reduce((n, m) => n + m.matches.length + m.obs.length, 0),
  };
}

// Résumé affichable d'un fichier (aperçu avant restauration).
export function describeBackup(backup) {
  const scopeKeys = Object.keys(backup.teamData);
  const keyCount = Object.keys(backup.clubData).length + scopeKeys.reduce((n, k) => n + Object.keys(backup.teamData[k] || {}).filter((b) => b !== "_studioMatches" && b !== "_obsMatches").length, 0);
  const matchCount = scopeKeys.reduce((n, k) => { const d = backup.teamData[k] || {}; return n + (d._studioMatches || []).length + (d._obsMatches || []).length; }, 0);
  return { version: backup.version, exportedAt: backup.exportedAt || null, teamCount: backup.teams.length, seasonCount: backup.seasons.length, scopeCount: scopeKeys.length, keyCount, matchCount };
}

// --- Instantané de sécurité ---------------------------------------------------------------------------------
// Copie complète de l'état actuel dans IndexedDB (voir safetyNet.js). Lève BackupError("no-snapshot")
// si elle est impossible : l'appelant n'a alors encore RIEN modifié.
export async function takeSafetySnapshot(reason, { readMatches, save = saveSafetySnapshot } = {}) {
  try {
    const { backup, warnings } = await buildFullBackup({ readMatches });
    const info = await save(JSON.stringify(backup), { reason });
    return { ...info, warnings };
  } catch (e) {
    throw new BackupError(`Impossible d'enregistrer l'instantané de sécurité de l'état actuel (${(e && e.message) || e}). Rien n'a été modifié. Télécharge d'abord une sauvegarde de l'état actuel, puis relance l'opération.`, "no-snapshot");
  }
}

// --- Restauration -----------------------------------------------------------------------------------------------
// Dans l'ordre : (1) instantané de l'état actuel (sauf navigateur sans données) ; (2) contrôle de
// place AVANT d'écrire ; (3) écritures, avec retour arrière complet au premier échec ; (4) relecture
// de chaque clé écrite ; (5) en mode « replace », suppression des clés en trop ; (6) matchs (IndexedDB).
// Succès = tout ce qui précède a réussi ; sinon BackupError et le navigateur est remis comme il était.
// Les matchs sont traités en dernier : leur échec ne défait pas le reste, il est listé dans
// `matchFailures` pour que l'écran le dise.
export async function restoreFullBackup(backup, { mode = "merge", onProgress, snapshot = true, snapshotReason, adapters = {} } = {}) {
  const writeMatches = adapters.writeMatches || restoreMatchesToDb;
  const plan = planRestore(backup, { mode });

  let snapshotInfo = null;
  if (snapshot && hasUserData()) {
    snapshotInfo = await takeSafetySnapshot(snapshotReason || "avant une restauration", { readMatches: adapters.readMatches, save: adapters.saveSnapshot });
  }

  if (plan.deltaChars > 0) {
    const room = checkRoomForChars(plan.deltaChars);
    if (!room.ok) {
      throw new BackupError(`Pas assez de place dans ce navigateur : cette restauration demande environ ${formatChars(plan.deltaChars)} de plus et il en reste environ ${formatChars(room.freeChars)}. Rien n'a été modifié. Libère de la place (jauge de cet écran), ou restaure dans un autre navigateur.`, "no-room");
    }
  }

  const done = [];
  const total = plan.writes.length + plan.removes.length + plan.matchScopes.length;
  let step = 0;
  const tick = () => { step += 1; if (onProgress) onProgress(step, total || 1); };
  const failWithRollback = (message, code, failedKey) => {
    const stuck = rollbackRawWrites(done);
    const tail = stuck.length === 0
      ? " Tout a été remis comme avant : rien n'a été modifié."
      : ` ATTENTION : ${stuck.length} rubrique(s) n'ont pas pu être remises comme avant. Utilise « Revenir à l'état précédent » (instantané automatique) ou une sauvegarde récente.`;
    const err = new BackupError(message + tail, code);
    err.failedKey = failedKey;
    err.rollbackFailed = stuck;
    return err;
  };

  for (const w of plan.writes) {
    const prev = readRawKey(w.rawKey);
    if (!writeRawKey(w.rawKey, w.value, { silent: true })) {
      throw failWithRollback(`Le navigateur a refusé l'écriture de « ${w.rawKey} » (stockage plein ou bloqué).`, "write-failed", w.rawKey);
    }
    done.push({ rawKey: w.rawKey, prev, newLen: w.value.length });
    tick();
  }
  for (const w of plan.writes) {
    if (readRawKey(w.rawKey) !== w.value) {
      throw failWithRollback(`La relecture de « ${w.rawKey} » ne correspond pas à ce qui devait être écrit.`, "verify-failed", w.rawKey);
    }
  }

  let removed = 0;
  plan.removes.forEach((k) => { if (removeRawKey(k)) removed += 1; tick(); });

  const matchFailures = [];
  let matchScopesRestored = 0;
  for (const scope of plan.matchScopes) {
    try {
      await writeMatches(scope.teamId, scope.seasonId, scope.matches, scope.obs, { replace: mode === "replace" });
      matchScopesRestored += 1;
    } catch (e) {
      matchFailures.push({ teamId: scope.teamId, seasonId: scope.seasonId, error: String((e && e.message) || e) });
    }
    tick();
  }

  return {
    ok: true, mode,
    written: plan.writes.length, unchanged: plan.unchanged, removed,
    addedTeams: plan.addedTeams, addedSeasons: plan.addedSeasons,
    skipped: plan.skipped, matchCount: plan.matchCount, matchScopesRestored, matchFailures,
    snapshot: snapshotInfo,
  };
}

// Retour à l'instantané automatique (état exact d'avant la dernière opération). L'état actuel devient
// à son tour l'instantané : on peut donc revenir « en avant » aussi.
export async function revertToSafetySnapshot({ onProgress, adapters = {} } = {}) {
  const text = await (adapters.loadSnapshotText || loadSafetySnapshotText)();
  if (!text) throw new BackupError("Aucun instantané de sécurité n'est disponible dans ce navigateur.", "no-snapshot");
  const parsed = parseBackupText(text);
  if (parsed.encrypted) throw new BackupError("L'instantané est illisible.", "invalid");
  return restoreFullBackup(parsed.backup, { mode: "replace", onProgress, snapshotReason: "avant le retour à l'état précédent", adapters });
}

export { getSafetySnapshotInfo, loadSafetySnapshotText };

// --- Suppression des données orphelines -------------------------------------------------------------------------
// Supprimer une équipe ou une saison de la liste ne supprime pas ses données : elles restent dans
// localStorage, sans plus aucun sélecteur pour les montrer, et occupent de la place pour rien. Cette
// fonction les supprime pour de bon — uniquement pour un couple dont l'équipe OU la saison n'existe
// plus —, après un instantané de sécurité (annulable depuis l'écran). Seul localStorage est concerné :
// les matchs tagués (IndexedDB) et les clips de la Vidéothèque ne sont pas touchés.
export async function purgeOrphanScope(teamId, seasonId, { adapters } = {}) {
  const suffix = scopeSuffixFor(teamId, seasonId);
  if (!suffix) throw new BackupError("L'équipe et la saison par défaut ne se suppriment pas.", "invalid");
  const teamIds = new Set(parseList(readRawKey("tf_teams")).map((t) => t.id));
  const seasonIds = new Set(parseList(readRawKey("tf_seasons")).map((s) => s.id));
  if (teamIds.has(teamId) && seasonIds.has(seasonId)) {
    throw new BackupError("Cette équipe et cette saison existent toujours dans les listes : leurs données ne sont pas orphelines.", "invalid");
  }
  const keys = listRawKeys().filter((k) => {
    if (!k.startsWith("tf_") || UNSCOPED_STORAGE_KEYS.has(k)) return false;
    const parts = k.split("__");
    return parts.length === 3 && parts[1] === teamId && parts[2] === seasonId;
  });
  if (keys.length === 0) return { removed: 0, freedChars: 0, snapshot: null };

  const snapshot = await takeSafetySnapshot("avant la suppression de données orphelines", { readMatches: adapters && adapters.readMatches, save: adapters && adapters.saveSnapshot });
  let freedChars = 0;
  let removed = 0;
  keys.forEach((k) => {
    const len = k.length + (readRawKey(k) || "").length;
    if (removeRawKey(k)) { removed += 1; freedChars += len; }
  });
  return { removed, freedChars, snapshot };
}
