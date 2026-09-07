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
  "tf_club_equipment", "tf_club_meetings", "tf_club_events", "tf_club_certifications", "tf_club_loan_pool", "tf_club_trainings",
  "tf_club_categories", "tf_club_locations", "tf_club_training_project", "tf_bibliotheque", "tf_assistant_history", "tf_journal_entries",
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
export function writeScopedKeyFor(baseKey, teamId, seasonId, value) {
  try { rawStorage.setItem.call(window.localStorage, baseKey + scopeSuffixFor(teamId, seasonId), value); return true; } catch (e) { return false; }
}

(function installStorageScoping() {
  if (window.__tfScopingInstalled) return;
  window.__tfScopingInstalled = true;
  Storage.prototype.getItem = function (key) { return rawStorage.getItem.call(this, scopedStorageKey(key)); };
  Storage.prototype.setItem = function (key, value) { return rawStorage.setItem.call(this, scopedStorageKey(key), value); };
  Storage.prototype.removeItem = function (key) { return rawStorage.removeItem.call(this, scopedStorageKey(key)); };
})();
