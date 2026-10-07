// Jauge de stockage : combien de place les données occupent dans localStorage, où elles se
// trouvent (équipe × saison), combien il en reste. Toute l'app staff vit dans le localStorage d'un
// seul navigateur (≈ 5 Mo selon la norme, jusqu'à 10 Mo sur Chrome et Firefox) : la banque
// d'exercices de départ (≈ 2,4 millions de caractères) est recopiée dans chaque équipe et chaque
// saison, deux copies suffisent à saturer. Sans cette mesure, le premier signe est une écriture
// qui échoue.
//
// Unités : tout est compté en « caractères » (unités UTF-16, clé + valeur), la mesure que les
// navigateurs appliquent à leur quota ; 1 caractère ≈ 2 octets. La place restante est MESURÉE (sonde
// ci-dessous) plutôt que déduite d'un quota supposé : le quota réel dépend du navigateur.

import { rawStorage, UNSCOPED_STORAGE_KEYS, DEFAULT_TEAM_ID, DEFAULT_SEASON_ID } from "./storage.js";

export const BYTES_PER_CHAR = 2;

// 1,5 Mo, 850 Ko, 2,3 Go — virgule décimale française.
export function formatBytes(bytes) {
  const b = Math.max(0, Number(bytes) || 0);
  const fmt = (n) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toString().replace(".", ",");
  if (b < 1024) return `${Math.round(b)} o`;
  if (b < 1024 * 1024) return `${fmt(b / 1024)} Ko`;
  if (b < 1024 * 1024 * 1024) return `${fmt(b / (1024 * 1024))} Mo`;
  return `${fmt(b / (1024 * 1024 * 1024))} Go`;
}
export const formatChars = (chars) => formatBytes((Number(chars) || 0) * BYTES_PER_CHAR);

// Toutes les clés de localStorage avec leur poids en caractères (clé + valeur).
export function listStorageEntries(storage) {
  const ls = storage || window.localStorage;
  const entries = [];
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (key == null) continue;
    let value = null;
    try { value = rawStorage.getItem.call(ls, key); } catch (e) { /* illisible : compté pour sa clé seule */ }
    entries.push({ key, chars: key.length + (value ? value.length : 0) });
  }
  return entries;
}

// Où range-t-on une clé brute ?
//  - club : donnée de club (non cloisonnée), commune à toutes les équipes ;
//  - scoped : donnée d'une équipe pour une saison — `orphan` si l'équipe ou la saison n'existe plus
//    dans les listes (supprimée : ses données restent stockées mais plus aucun sélecteur ne les montre) ;
//  - other : tout ce qui n'est pas une clé `tf_` de l'app.
// Le suffixe de cloisonnement est « __équipe__saison » ; les identifiants (UUID, `id_<nombre>_<hasard>`,
// `default-team`) ne contiennent jamais deux tirets bas d'affilée.
export function classifyStorageKey(rawKey, teamIds, seasonIds) {
  if (typeof rawKey !== "string" || !rawKey.startsWith("tf_")) return { kind: "other", baseKey: rawKey };
  if (UNSCOPED_STORAGE_KEYS.has(rawKey)) return { kind: "club", baseKey: rawKey };
  const parts = rawKey.split("__");
  if (parts.length === 1) {
    return { kind: "scoped", baseKey: rawKey, teamId: DEFAULT_TEAM_ID, seasonId: DEFAULT_SEASON_ID, orphan: !teamIds.has(DEFAULT_TEAM_ID) || !seasonIds.has(DEFAULT_SEASON_ID) };
  }
  if (parts.length === 3 && parts[1] && parts[2]) {
    const [baseKey, teamId, seasonId] = parts;
    return { kind: "scoped", baseKey, teamId, seasonId, orphan: !teamIds.has(teamId) || !seasonIds.has(seasonId) };
  }
  return { kind: "other", baseKey: rawKey };
}

// Regroupe les entrées par équipe × saison. teams : [{id, name}], seasons : [{id, label}].
export function summarizeStorage(entries, teams, seasons) {
  const teamIds = new Set((teams || []).map((t) => t.id));
  const seasonIds = new Set((seasons || []).map((s) => s.id));
  const teamName = (id) => { const t = (teams || []).find((x) => x.id === id); return t ? t.name : "équipe supprimée"; };
  const seasonLabel = (id) => { const s = (seasons || []).find((x) => x.id === id); return s ? s.label : "saison supprimée"; };

  const summary = { totalChars: 0, clubChars: 0, otherChars: 0, orphanChars: 0, scopes: [], biggest: [], exercises: { copies: 0, chars: 0 } };
  const scopeMap = new Map();

  for (const { key, chars } of entries) {
    summary.totalChars += chars;
    const c = classifyStorageKey(key, teamIds, seasonIds);
    if (c.kind === "club") { summary.clubChars += chars; continue; }
    if (c.kind === "other") { summary.otherChars += chars; continue; }
    const scopeKey = `${c.teamId}::${c.seasonId}`;
    let scope = scopeMap.get(scopeKey);
    if (!scope) {
      scope = { teamId: c.teamId, seasonId: c.seasonId, teamName: teamName(c.teamId), seasonLabel: seasonLabel(c.seasonId), orphan: c.orphan, chars: 0, keyCount: 0, keys: [] };
      scopeMap.set(scopeKey, scope);
    }
    scope.chars += chars;
    scope.keyCount += 1;
    scope.keys.push({ rawKey: key, baseKey: c.baseKey, chars });
    if (c.orphan) summary.orphanChars += chars;
    if (c.baseKey === "tf_exercices") { summary.exercises.copies += 1; summary.exercises.chars += chars; }
  }

  summary.scopes = [...scopeMap.values()].sort((a, b) => b.chars - a.chars);
  summary.scopes.forEach((s) => s.keys.sort((a, b) => b.chars - a.chars));
  summary.biggest = entries
    .map(({ key, chars }) => ({ rawKey: key, chars, ...classifyStorageKey(key, teamIds, seasonIds) }))
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 6);
  return summary;
}

// --- Place restante : mesurée, pas supposée ------------------------------------------------------
// Le quota exact varie (norme ≈ 5 Mo ; Chrome/Firefox jusqu'à 10 Mo ; Safari ≈ 5 Mo) et se compte
// différemment d'un navigateur à l'autre : la seule mesure fiable est d'écrire une clé temporaire de
// plus en plus grande jusqu'à l'échec, puis de la retirer. On écrit un caractère hors Latin-1 (« … »),
// que Chrome stocke sur 2 octets : le résultat est donc la place restante pour des données du même
// type que les nôtres (du JSON avec accents et guillemets typographiques) — mesure prudente.
// La sonde passe par rawStorage : elle ne déclenche pas l'alerte de quota de l'app, et elle est
// synchrone (aucune autre écriture de l'app ne peut s'intercaler). Une sonde interrompue laisserait
// une clé de plus de 100 Ko : elle est retirée au début de chaque mesure et dans un `finally`.
const PROBE_KEY = "__tf_probe__";
const PROBE_UNIT = "…";

export function measureFreeChars({ maxChars = 24 * 1024 * 1024, precisionChars = 2048, storage } = {}) {
  const ls = storage || window.localStorage;
  const tryWrite = (n) => {
    try { rawStorage.setItem.call(ls, PROBE_KEY, PROBE_UNIT.repeat(n)); return true; } catch (e) { return false; }
  };
  try {
    try { rawStorage.removeItem.call(ls, PROBE_KEY); } catch (e) { /* rien à retirer */ }
    let lo = 0;
    let hi = 1 << 16;
    while (hi <= maxChars && tryWrite(hi)) { lo = hi; hi *= 2; }
    if (hi > maxChars) return { freeChars: lo, capped: true };
    while (hi - lo > precisionChars) {
      const mid = Math.floor((lo + hi) / 2);
      if (tryWrite(mid)) lo = mid; else hi = mid;
    }
    return { freeChars: lo, capped: false };
  } catch (e) {
    return { freeChars: 0, capped: false, error: e };
  } finally {
    try { rawStorage.removeItem.call(ls, PROBE_KEY); } catch (e) { /* idem */ }
  }
}

// La place suffit-elle pour ajouter `neededChars` caractères ? Marge de sécurité : la mesure a une
// précision de 2 048 caractères et le navigateur compte aussi les clés.
export function checkRoomForChars(neededChars, opts = {}) {
  const needed = Math.max(0, Math.ceil(Number(neededChars) || 0));
  const { freeChars, capped, error } = measureFreeChars(opts);
  const margin = 8192;
  return { ok: !error && (capped || freeChars >= needed + margin), freeChars, neededChars: needed, measured: !error };
}

// --- Le reste du stockage du navigateur (IndexedDB : matchs, clips) et sa durabilité ---------------
export async function estimateOrigin() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      return { supported: true, usage: e.usage || 0, quota: e.quota || 0 };
    }
  } catch (e) { /* non disponible */ }
  return { supported: false, usage: 0, quota: 0 };
}

export const isFirefoxBrowser = () => typeof navigator !== "undefined" && /Firefox\//.test(navigator.userAgent || "");
export const isSafariBrowser = () => typeof navigator !== "undefined" && /Safari\//.test(navigator.userAgent || "") && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR)\//.test(navigator.userAgent || "");
// Page ajoutée à l'écran d'accueil et lancée comme une appli : Safari n'y applique pas son
// effacement après 7 jours sans visite.
export function isStandaloneDisplay() {
  try { return !!(window.navigator.standalone || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)); } catch (e) { return false; }
}

export async function getPersistenceState() {
  try {
    if (navigator.storage && navigator.storage.persisted) return { supported: true, persisted: await navigator.storage.persisted() };
  } catch (e) { /* non disponible */ }
  return { supported: false, persisted: false };
}

// Demande au navigateur de ne pas effacer les données du site quand l'appareil manque de place.
// Chrome et Safari décident seuls, sans rien afficher ; Firefox affiche une demande de permission :
// elle n'est faite qu'à l'initiative de l'utilisateur (`interactive`), jamais au chargement de la page.
export async function requestPersistence({ interactive = false } = {}) {
  const state = await getPersistenceState();
  if (!state.supported || state.persisted) return { ...state, asked: false };
  if (!interactive && isFirefoxBrowser()) return { ...state, asked: false, needsClick: true };
  try {
    const granted = await navigator.storage.persist();
    return { supported: true, persisted: !!granted, asked: true };
  } catch (e) {
    return { supported: true, persisted: false, asked: true };
  }
}
