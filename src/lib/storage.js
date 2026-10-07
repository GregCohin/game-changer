// Scope multi-équipes / multi-saisons — extrait de App.jsx (séparation des fichiers, sans
// changement de comportement). Contient l'IIFE qui patche Storage.prototype : DOIT être importé
// AVANT tout autre code qui utilise localStorage, ce qui est garanti par l'ordre d'évaluation des
// modules ES (les imports s'exécutent entièrement avant le code du fichier qui importe).

export const DEFAULT_TEAM_ID = "default-team";
export const DEFAULT_SEASON_ID = "default-season";
export const UNSCOPED_STORAGE_KEYS = new Set([
  "tf_teams", "tf_seasons", "tf_club_info", "tf_active_team", "tf_active_season", "tf_category_filter",
  // Données de club — partagées entre toutes les équipes et saisons, jamais cloisonnées.
  "tf_club_staff", "tf_club_sporting_project", "tf_club_identity", "tf_club_pedagogy",
  "tf_club_passerelles", "tf_club_exercise_library", "tf_club_scouting", "tf_club_facilities",
  "tf_club_equipment", "tf_club_meetings", "tf_club_events", "tf_club_certifications", "tf_club_label_objectives", "tf_club_loan_pool", "tf_club_trainings",
  "tf_club_categories", "tf_club_locations", "tf_club_training_project", "tf_bibliotheque", "tf_assistant_history", "tf_journal_entries",
  "tf_club_vehicles",
  "tf_club_talent_watchlist",
  // État propre à CE navigateur, pas une donnée du club : date de la dernière sauvegarde complète et
  // report du rappel. Jamais cloisonnés (le rappel vaut pour tout le navigateur) et jamais exportés
  // ni restaurés (voir DEVICE_LOCAL_KEYS dans lib/fullBackup.js).
  "tf_last_backup", "tf_backup_snooze_until",
]);

export function getActiveTeamId() {
  try { return window.localStorage.getItem("tf_active_team") || DEFAULT_TEAM_ID; } catch (e) { return DEFAULT_TEAM_ID; }
}
export function getActiveSeasonId() {
  try { return window.localStorage.getItem("tf_active_season") || DEFAULT_SEASON_ID; } catch (e) { return DEFAULT_SEASON_ID; }
}
export function getScopeSuffix() {
  const t = getActiveTeamId(), s = getActiveSeasonId();
  if (t === DEFAULT_TEAM_ID && s === DEFAULT_SEASON_ID) return "";
  return `__${t}__${s}`;
}
export function scopedStorageKey(key) {
  if (typeof key !== "string" || !key.startsWith("tf_") || UNSCOPED_STORAGE_KEYS.has(key)) return key;
  return key + getScopeSuffix();
}

// Accès direct au stockage, SANS repasser par le wrapper ci-dessous — indispensable pour
// lire/écrire les données d'une équipe précise sans changer le contexte actif (vue Club).
export const rawStorage = {
  getItem: Storage.prototype.getItem,
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem,
};
export function scopeSuffixFor(teamId, seasonId) {
  return (teamId === DEFAULT_TEAM_ID && seasonId === DEFAULT_SEASON_ID) ? "" : `__${teamId}__${seasonId}`;
}
export function readScopedKeyFor(baseKey, teamId, seasonId) {
  try { return rawStorage.getItem.call(window.localStorage, baseKey + scopeSuffixFor(teamId, seasonId)); } catch (e) { return null; }
}

// --- Écritures vérifiées -------------------------------------------------------------------------
// Le quota de localStorage (≈ 5 Mo selon la norme, jusqu'à 10 Mo sur Chrome/Firefox) se remplit
// vite : la banque d'exercices de départ pèse à elle seule ≈ 2,4 millions de caractères par équipe et
// par saison. Une écriture qui échoue ne doit JAMAIS passer pour réussie : toutes les écritures
// ci-dessous renvoient true/false, signalent le quota à l'utilisateur et laissent l'appelant
// annoncer la vérité (jamais « reconduits » ou « restaurée avec succès » sur un échec).

// Le nom de l'erreur de quota varie selon le navigateur (code 22 = Chrome/Safari, 1014 = Firefox ancien).
export function isQuotaError(e) {
  return !!e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014);
}

export const QUOTA_MESSAGE = "Le stockage de ce navigateur est plein : cette modification n'a PAS été enregistrée. Télécharge une sauvegarde (Administratif → Club → Sauvegarde), puis libère de la place — la jauge de cet écran montre ce qui prend le plus de place — ou utilise un autre navigateur.";

// Signale un échec d'écriture par manque de place : compteur global, évènement `tf-storage-full`
// (écouté par le bandeau de lib/StorageWarning.jsx, visible sur tous les écrans) et, une seule fois
// par session, une alerte bloquante. `silent` : l'appelant affiche lui-même un message précis juste
// après (pas d'alerte générique en plus) ; le compteur et le bandeau, eux, restent actifs.
export function reportQuotaExceeded(rawKey, { silent = false } = {}) {
  try {
    window.__tfQuotaErrors = (window.__tfQuotaErrors || 0) + 1;
    window.__tfQuotaLastKey = rawKey;
    window.dispatchEvent(new CustomEvent("tf-storage-full", { detail: { key: rawKey, count: window.__tfQuotaErrors } }));
  } catch (e) { /* un évènement raté ne doit jamais masquer l'erreur d'origine */ }
  if (!silent && !window.__tfQuotaWarned) {
    window.__tfQuotaWarned = true;
    alert(QUOTA_MESSAGE);
  }
}

// Écrit une clé BRUTE (déjà suffixée si besoin), sans repasser par le wrapper. true si écrite.
export function writeRawKey(rawKey, value, opts = {}) {
  try {
    rawStorage.setItem.call(window.localStorage, rawKey, value);
    return true;
  } catch (e) {
    if (isQuotaError(e)) reportQuotaExceeded(rawKey, opts);
    return false;
  }
}
export function readRawKey(rawKey) {
  try { return rawStorage.getItem.call(window.localStorage, rawKey); } catch (e) { return null; }
}
export function removeRawKey(rawKey) {
  try { rawStorage.removeItem.call(window.localStorage, rawKey); return true; } catch (e) { return false; }
}
export function listRawKeys() {
  const keys = [];
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k != null) keys.push(k); }
  } catch (e) { /* stockage inaccessible */ }
  return keys;
}

export function writeScopedKeyFor(baseKey, teamId, seasonId, value, opts) {
  return writeRawKey(baseKey + scopeSuffixFor(teamId, seasonId), value, opts);
}

// Remet les anciennes valeurs après un échec. Ordre : d'abord ce qui libère le plus de place (clé
// qui avait grossi, clé ajoutée), ensuite ce qui en demande (clé qui avait rétréci) — sinon le retour
// arrière pourrait lui-même buter sur le quota. Renvoie les clés qu'il n'a PAS pu remettre.
export function rollbackRawWrites(done) {
  const failed = [];
  const order = [...done].sort((a, b) => (a.prev === null ? 0 : a.prev.length - a.newLen) - (b.prev === null ? 0 : b.prev.length - b.newLen));
  for (const { rawKey, prev } of order) {
    const ok = prev === null ? removeRawKey(rawKey) : writeRawKey(rawKey, prev, { silent: true });
    if (!ok) failed.push(rawKey);
  }
  return failed;
}

// Écrit plusieurs clés brutes : tout ou rien. Au premier échec, les clés déjà écrites sont remises
// comme avant. entries : [{ rawKey, value }]. Résultat : { ok, written } ou
// { ok: false, failedKey, rolledBack, rollbackFailed }.
export function writeRawKeysAtomic(entries, opts = {}) {
  const done = [];
  for (const { rawKey, value } of entries) {
    const prev = readRawKey(rawKey);
    if (!writeRawKey(rawKey, value, opts)) {
      const rollbackFailed = rollbackRawWrites(done);
      return { ok: false, failedKey: rawKey, rolledBack: rollbackFailed.length === 0, rollbackFailed };
    }
    done.push({ rawKey, prev, newLen: value.length });
  }
  return { ok: true, written: done.length };
}

// Idem avec des clés cloisonnées : entries : [{ baseKey, teamId, seasonId, value }].
export function writeScopedKeysAtomic(entries, opts) {
  return writeRawKeysAtomic(entries.map((e) => ({ rawKey: e.baseKey + scopeSuffixFor(e.teamId, e.seasonId), value: e.value })), opts);
}

// Storage.prototype est partagé par localStorage ET sessionStorage (même interface DOM) : sans le
// garde `this === window.localStorage` ci-dessous, ce patch scoperait aussi sessionStorage si le
// code venait un jour à l'utiliser (aujourd'hui aucun usage de sessionStorage dans l'app).
(function installStorageScoping() {
  if (window.__tfScopingInstalled) return;
  window.__tfScopingInstalled = true;
  Storage.prototype.getItem = function (key) {
    if (this !== window.localStorage) return rawStorage.getItem.call(this, key);
    return rawStorage.getItem.call(this, scopedStorageKey(key));
  };
  Storage.prototype.setItem = function (key, value) {
    if (this !== window.localStorage) return rawStorage.setItem.call(this, key, value);
    try {
      return rawStorage.setItem.call(this, scopedStorageKey(key), value);
    } catch (e) {
      // Quota localStorage dépassé : partout ailleurs dans l'app, l'échec de setItem est avalé
      // silencieusement (try/catch vide, ≈ 570 endroits) — sans ce signal, une sauvegarde pourrait
      // échouer sans que l'utilisateur s'en aperçoive. Alerte unique par session + bandeau permanent
      // (reportQuotaExceeded), puis l'erreur est relancée pour les appelants qui la traitent.
      if (isQuotaError(e)) reportQuotaExceeded(scopedStorageKey(key));
      throw e;
    }
  };
  Storage.prototype.removeItem = function (key) {
    if (this !== window.localStorage) return rawStorage.removeItem.call(this, key);
    return rawStorage.removeItem.call(this, scopedStorageKey(key));
  };
})();
