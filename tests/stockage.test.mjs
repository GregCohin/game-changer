// Tests du stockage local et de la sauvegarde (audit du 07/10/2026, points 8 et 9) :
//  - une écriture qui échoue (quota) ne doit jamais passer pour réussie, ni laisser un état à moitié écrit ;
//  - la restauration d'une sauvegarde : fichier contrôlé (version), listes d'équipes/saisons fusionnées,
//    retour arrière complet au premier échec, aucune écriture hors des clés `tf_*` ;
//  - le chiffrement optionnel (AES-GCM) ; la jauge de stockage ; le rappel de sauvegarde.
// Lancer avec `npm test`. Aucune dépendance : node:test. Le navigateur est simulé (un faux localStorage
// avec quota réglable) AVANT d'importer les modules, qui patchent Storage.prototype à l'import.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.TZ = "Europe/Paris";

// ---- Faux navigateur ---------------------------------------------------------------------------
function quotaError() {
  const e = new Error("quota");
  e.name = "QuotaExceededError";
  e.code = 22;
  return e;
}
class FakeStorage {
  constructor() { this._m = new Map(); this.quota = Infinity; this.failKeys = new Set(); }
  get length() { return this._m.size; }
  key(i) { return [...this._m.keys()][i] ?? null; }
  getItem(k) { k = String(k); return this._m.has(k) ? this._m.get(k) : null; }
  setItem(k, v) {
    k = String(k); v = String(v);
    if (this.failKeys.has(k)) throw quotaError();
    let used = 0;
    for (const [kk, vv] of this._m) if (kk !== k) used += kk.length + vv.length;
    if (used + k.length + v.length > this.quota) throw quotaError();
    this._m.set(k, v);
  }
  removeItem(k) { this._m.delete(String(k)); }
}
const ls = new FakeStorage();
const alerts = [];
const events = [];
globalThis.window = globalThis;
globalThis.Storage = FakeStorage;
globalThis.localStorage = ls;
globalThis.alert = (m) => { alerts.push(String(m)); };
globalThis.dispatchEvent = (e) => { events.push(e.type); return true; };

const storage = await import("../src/lib/storage.js");
const gauge = await import("../src/lib/storageGauge.js");
const crypto = await import("../src/lib/backupCrypto.js");
const backup = await import("../src/lib/fullBackup.js");
const utils = await import("../src/lib/utils.js");

const raw = (k) => (ls._m.has(k) ? ls._m.get(k) : null);
const state = () => new Map(ls._m);
function reset({ quota = Infinity } = {}) {
  ls._m.clear();
  ls.quota = quota;
  ls.failKeys.clear();
  alerts.length = 0;
  events.length = 0;
  delete globalThis.__tfQuotaWarned;
  delete globalThis.__tfQuotaErrors;
}
const sameState = (before) => {
  assert.deepEqual([...ls._m.entries()].sort(), [...before.entries()].sort(), "le stockage doit être identique à l'état d'avant");
};
const json = (v) => JSON.stringify(v);

// Un navigateur avec deux équipes, deux saisons, des données dans plusieurs scopes et une équipe supprimée.
function seedBrowser() {
  ls._m.set("tf_teams", json([{ id: "default-team", name: "U15 A" }, { id: "t2", name: "U13" }]));
  ls._m.set("tf_seasons", json([{ id: "default-season", label: "2026-2027" }, { id: "s2", label: "2027-2028" }]));
  ls._m.set("tf_active_team", "default-team");
  ls._m.set("tf_active_season", "default-season");
  ls._m.set("tf_club_staff", json([{ id: "c1", name: "Coach" }]));
  ls._m.set("tf_roster", json([{ id: "p1" }]));
  ls._m.set("tf_roster__t2__s2", json([{ id: "p2" }]));
  ls._m.set("tf_exercices__t2__s2", json([{ id: "e1", name: "Rondo" }]));
  ls._m.set("tf_roster__gone__s2", json([{ id: "p3" }])); // équipe supprimée : données orphelines
  ls._m.set("tf_last_backup", json({ at: 1 }));
  ls._m.set("autre_appli", "x");
}

// ---- storage.js : écritures vérifiées --------------------------------------------------------
test("isQuotaError reconnaît les noms et codes d'erreur de quota des navigateurs", () => {
  assert.ok(storage.isQuotaError({ name: "QuotaExceededError" }));
  assert.ok(storage.isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" }));
  assert.ok(storage.isQuotaError({ code: 22 }));
  assert.ok(storage.isQuotaError({ code: 1014 }));
  assert.ok(!storage.isQuotaError({ name: "SecurityError", code: 18 }));
  assert.ok(!storage.isQuotaError(null));
});

test("writeScopedKeyFor : true si écrit (clé cloisonnée), false si le quota est atteint — jamais d'exception", () => {
  reset({ quota: 100 });
  assert.equal(storage.writeScopedKeyFor("tf_roster", "t2", "s2", "[1]", { silent: true }), true);
  assert.equal(raw("tf_roster__t2__s2"), "[1]");
  assert.equal(storage.writeScopedKeyFor("tf_roster", "default-team", "default-season", "[2]", { silent: true }), true);
  assert.equal(raw("tf_roster"), "[2]", "équipe et saison par défaut : pas de suffixe");
  assert.equal(storage.writeScopedKeyFor("tf_gros", "t2", "s2", "x".repeat(500), { silent: true }), false);
  assert.equal(raw("tf_gros__t2__s2"), null);
});

test("un échec de quota est signalé : évènement à chaque fois, alerte une seule fois par session (sauf silent)", () => {
  reset({ quota: 20 });
  storage.writeScopedKeyFor("tf_a", "t", "s", "x".repeat(100)); // non silencieux
  storage.writeScopedKeyFor("tf_b", "t", "s", "x".repeat(100));
  assert.equal(alerts.length, 1, "une seule alerte par session");
  assert.match(alerts[0], /PAS été enregistrée/);
  assert.equal(events.filter((t) => t === "tf-storage-full").length, 2, "mais un évènement par échec (bandeau)");
  assert.equal(globalThis.__tfQuotaErrors, 2);

  reset({ quota: 20 });
  storage.writeScopedKeyFor("tf_a", "t", "s", "x".repeat(100), { silent: true });
  assert.equal(alerts.length, 0, "silent : l'appelant affiche son propre message");
  assert.equal(events.length, 1, "le bandeau est prévenu quand même");
});

test("le wrapper localStorage.setItem garde son comportement : clé cloisonnée, erreur relancée, alerte de quota", () => {
  reset({ quota: 200 });
  ls.setItem("tf_active_team", "t2");
  ls.setItem("tf_active_season", "s2");
  ls.setItem("tf_roster", "[1]");
  assert.equal(raw("tf_roster__t2__s2"), "[1]", "clé cloisonnée par équipe + saison");
  assert.equal(raw("tf_roster"), null);
  ls.setItem("tf_last_backup", "x");
  assert.equal(raw("tf_last_backup"), "x", "tf_last_backup n'est jamais cloisonnée");
  assert.throws(() => ls.setItem("tf_gros", "x".repeat(500)), (e) => storage.isQuotaError(e));
  assert.equal(alerts.length, 1);
});

test("writeRawKeysAtomic : au premier échec, tout est remis comme avant (clé grossie, clé rétrécie, clé ajoutée)", () => {
  reset({ quota: 200 });
  ls._m.set("A", "a".repeat(100));
  ls._m.set("B", "b".repeat(10));
  const before = state();
  const result = storage.writeRawKeysAtomic([
    { rawKey: "A", value: "a".repeat(20) },   // rétrécit
    { rawKey: "B", value: "b".repeat(150) },  // grossit
    { rawKey: "C", value: "c".repeat(60) },   // dépasse le quota
  ], { silent: true });
  assert.equal(result.ok, false);
  assert.equal(result.failedKey, "C");
  assert.equal(result.rolledBack, true, "le retour arrière ne doit pas buter sur le quota (ordre : ce qui libère d'abord)");
  sameState(before);
});

test("writeRawKeysAtomic : succès = toutes les clés écrites", () => {
  reset({ quota: 1000 });
  const result = storage.writeRawKeysAtomic([{ rawKey: "A", value: "1" }, { rawKey: "B", value: "2" }]);
  assert.deepEqual(result, { ok: true, written: 2 });
  assert.equal(raw("B"), "2");
});

test("writeScopedKeysAtomic (transfert de joueur) : l'échec de la copie cible ne touche pas l'équipe source", () => {
  reset({ quota: 120 });
  ls._m.set("tf_roster__src__s", json([{ id: "p1" }, { id: "p2" }]));
  const before = state();
  const result = storage.writeScopedKeysAtomic([
    { baseKey: "tf_roster", teamId: "dst", seasonId: "s", value: json([{ id: "p1" }]) },
    { baseKey: "tf_medical_injuries", teamId: "dst", seasonId: "s", value: "x".repeat(500) }, // échoue
    { baseKey: "tf_roster", teamId: "src", seasonId: "s", value: json([{ id: "p2" }]) },     // retrait de la source : jamais atteint
  ], { silent: true });
  assert.equal(result.ok, false);
  sameState(before);
});

// ---- Constantes partagées ----------------------------------------------------------------------
test("les clés propres au navigateur ne sont jamais cloisonnées ni exportées", () => {
  for (const k of backup.DEVICE_LOCAL_KEYS) assert.ok(storage.UNSCOPED_STORAGE_KEYS.has(k), `${k} doit être non cloisonnée`);
  assert.ok(backup.DEVICE_LOCAL_KEYS.has("tf_last_backup"));
});

test("les noms de bases IndexedDB de lib/fullBackup.js n'ont pas dérivé de ceux d'App.jsx", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/App.jsx"), "utf8");
  assert.match(src, /const MATCHES_STORE = "matches";/);
  assert.match(src, /const OBS_STORE = "obs_matches";/);
  assert.equal(backup.MATCHES_STORE, "matches");
  assert.equal(backup.OBS_STORE, "obs_matches");
  const start = src.indexOf("function matchesDbNameFor(");
  const open = src.indexOf("{", src.indexOf(")", start));
  let depth = 0, end = open;
  for (let i = open; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) { end = i + 1; break; } }
  const appFn = new Function("DEFAULT_TEAM_ID", "DEFAULT_SEASON_ID", `${src.slice(start, end)}\nreturn matchesDbNameFor;`)(storage.DEFAULT_TEAM_ID, storage.DEFAULT_SEASON_ID);
  for (const [t, s] of [["default-team", "default-season"], ["default-team", "s2"], ["t2", "default-season"], ["t2", "s2"]]) {
    assert.equal(backup.matchesDbNameFor(t, s), appFn(t, s), `nom de base pour ${t} / ${s}`);
  }
});

// ---- storageGauge.js ---------------------------------------------------------------------------
test("formatBytes : virgule décimale française, unités o / Ko / Mo / Go", () => {
  assert.equal(gauge.formatBytes(0), "0 o");
  assert.equal(gauge.formatBytes(850), "850 o");
  assert.equal(gauge.formatBytes(1536), "1,5 Ko");
  assert.equal(gauge.formatBytes(4.6 * 1024 * 1024), "4,6 Mo");
  assert.equal(gauge.formatBytes(250 * 1024 * 1024), "250 Mo");
  assert.equal(gauge.formatChars(1048576), "2 Mo", "1 caractère ≈ 2 octets");
});

test("classifyStorageKey / summarizeStorage : club, équipe×saison, données orphelines, autres", () => {
  reset();
  seedBrowser();
  const teams = JSON.parse(raw("tf_teams"));
  const seasons = JSON.parse(raw("tf_seasons"));
  const teamIds = new Set(teams.map((t) => t.id));
  const seasonIds = new Set(seasons.map((s) => s.id));
  assert.deepEqual(gauge.classifyStorageKey("tf_club_staff", teamIds, seasonIds), { kind: "club", baseKey: "tf_club_staff" });
  assert.deepEqual(gauge.classifyStorageKey("tf_roster", teamIds, seasonIds), { kind: "scoped", baseKey: "tf_roster", teamId: "default-team", seasonId: "default-season", orphan: false });
  assert.deepEqual(gauge.classifyStorageKey("tf_roster__t2__s2", teamIds, seasonIds), { kind: "scoped", baseKey: "tf_roster", teamId: "t2", seasonId: "s2", orphan: false });
  assert.equal(gauge.classifyStorageKey("tf_roster__gone__s2", teamIds, seasonIds).orphan, true);
  assert.equal(gauge.classifyStorageKey("tf_roster__t2__gone", teamIds, seasonIds).orphan, true, "saison supprimée");
  assert.equal(gauge.classifyStorageKey("autre_appli", teamIds, seasonIds).kind, "other");
  // identifiants réels : UUID et id_<nombre>_<hasard> (un seul tiret bas, jamais deux d'affilée)
  assert.equal(gauge.classifyStorageKey("tf_roster__id_1700000000_abc__4f1c2e3a-0b1c-4d5e-9f6a-7b8c9d0e1f2a", new Set(["id_1700000000_abc"]), new Set(["4f1c2e3a-0b1c-4d5e-9f6a-7b8c9d0e1f2a"])).orphan, false);

  const summary = gauge.summarizeStorage(gauge.listStorageEntries(ls), teams, seasons);
  assert.equal(summary.scopes.length, 3);
  const orphan = summary.scopes.find((s) => s.orphan);
  assert.equal(orphan.teamId, "gone");
  assert.equal(summary.orphanChars, orphan.chars);
  assert.equal(summary.exercises.copies, 1);
  assert.equal(summary.otherChars, "autre_appli".length + 1);
  assert.equal(summary.totalChars, gauge.listStorageEntries(ls).reduce((n, e) => n + e.chars, 0));
});

test("measureFreeChars : mesure la place restante à la précision près, et retire sa clé temporaire", () => {
  reset({ quota: 300000 });
  ls._m.set("tf_donnees", "x".repeat(100000));
  const { freeChars, capped } = gauge.measureFreeChars({ storage: ls });
  const expected = 300000 - ("tf_donnees".length + 100000) - "__tf_probe__".length;
  assert.equal(capped, false);
  assert.ok(Math.abs(freeChars - expected) <= 2048, `mesuré ${freeChars}, attendu ≈ ${expected}`);
  assert.equal(raw("__tf_probe__"), null, "la sonde ne laisse rien derrière elle");
  assert.equal(alerts.length, 0, "la sonde ne déclenche pas l'alerte de quota de l'app");
  assert.equal(events.length, 0);
});

test("measureFreeChars : plafonne quand la place est très grande ; checkRoomForChars compare avec une marge", () => {
  reset();
  assert.equal(gauge.measureFreeChars({ storage: ls, maxChars: 1 << 18 }).capped, true);
  reset({ quota: 400000 });
  assert.equal(gauge.checkRoomForChars(100000, { storage: ls }).ok, true);
  const tight = gauge.checkRoomForChars(399000, { storage: ls });
  assert.equal(tight.ok, false);
  assert.ok(tight.freeChars > 399000 && tight.neededChars === 399000, "la place brute suffirait, c'est la marge de sécurité qui refuse");
});

// ---- backupCrypto.js ---------------------------------------------------------------------------
const FAST = { iterations: 1000 };
test("chiffrement : aller-retour exact (accents, guillemets, emoji), enveloppe bien formée", async () => {
  const text = json({ nom: "Zoé « l'œil » ⚽", n: 12 });
  const env = await crypto.encryptBackupText(text, "phrase secrète 2026", FAST);
  assert.equal(env.format, crypto.ENCRYPTED_FORMAT);
  assert.equal(env.version, crypto.ENCRYPTED_VERSION);
  assert.equal(env.kdf.iterations, 1000);
  assert.ok(crypto.isEncryptedEnvelope(env));
  assert.ok(!env.data.includes("Zoé"), "le contenu ne doit pas apparaître en clair");
  assert.equal(await crypto.decryptBackupEnvelope(env, "phrase secrète 2026"), text);
});

test("chiffrement : deux chiffrements du même texte diffèrent (sel et nonce aléatoires)", async () => {
  const a = await crypto.encryptBackupText("x", "motdepasse1", FAST);
  const b = await crypto.encryptBackupText("x", "motdepasse1", FAST);
  assert.notEqual(a.data, b.data);
  assert.notEqual(a.kdf.salt, b.kdf.salt);
});

test("chiffrement : mauvaise phrase, données modifiées, en-tête modifié → wrong-passphrase, jamais de texte lu de travers", async () => {
  const env = await crypto.encryptBackupText("secret", "bonne phrase", FAST);
  await assert.rejects(() => crypto.decryptBackupEnvelope(env, "mauvaise phrase"), (e) => e instanceof crypto.BackupError && e.code === "wrong-passphrase");
  const flipped = { ...env, data: env.data.slice(0, 10) + (env.data[10] === "A" ? "B" : "A") + env.data.slice(11) };
  await assert.rejects(() => crypto.decryptBackupEnvelope(flipped, "bonne phrase"), (e) => e.code === "wrong-passphrase");
  const tamperedHeader = { ...env, kdf: { ...env.kdf, iterations: 1001 } };
  await assert.rejects(() => crypto.decryptBackupEnvelope(tamperedHeader, "bonne phrase"), (e) => e.code === "wrong-passphrase");
});

test("chiffrement : la phrase est normalisée (é composé / décomposé = même clé) ; phrase trop courte refusée", async () => {
  const env = await crypto.encryptBackupText("x", "é-é-é-é-é-é", FAST);
  const decomposed = "é-é-é-é-é-é";
  assert.equal(await crypto.decryptBackupEnvelope(env, decomposed), "x");
  await assert.rejects(() => crypto.encryptBackupText("x", "court", FAST), (e) => e.code === "weak-passphrase");
});

test("chiffrement : enveloppe d'une version plus récente ou en-tête abusif refusés avant tout calcul", async () => {
  const env = await crypto.encryptBackupText("x", "motdepasse1", FAST);
  await assert.rejects(() => crypto.decryptBackupEnvelope({ ...env, version: 99 }, "motdepasse1"), (e) => e.code === "too-new");
  await assert.rejects(() => crypto.decryptBackupEnvelope({ ...env, kdf: { ...env.kdf, iterations: 1e12 } }, "motdepasse1"), (e) => e.code === "invalid");
  await assert.rejects(() => crypto.decryptBackupEnvelope({ ...env, data: undefined }, "motdepasse1"), (e) => e.code === "invalid");
  await assert.rejects(() => crypto.decryptBackupEnvelope({ hello: 1 }, "motdepasse1"), (e) => e.code === "invalid");
});

test("chiffrement : valeurs par défaut (600 000 itérations) — aller-retour complet", async () => {
  const env = await crypto.encryptBackupText("défaut", "phrase par défaut");
  assert.equal(env.kdf.iterations, 600000);
  assert.equal(await crypto.decryptBackupEnvelope(env, "phrase par défaut"), "défaut");
});

// ---- fullBackup.js : lecture et contrôle -------------------------------------------------------
const goodBackup = (over = {}) => ({ app: "game-changer", version: 2, exportedAt: "2026-10-07T10:00:00.000Z", teams: [{ id: "default-team", name: "U15 A" }], seasons: [{ id: "default-season", label: "2026-2027" }], clubData: {}, teamData: {}, ...over });

test("validateBackup : accepte v1 (sans champ app) et v2, refuse une version plus récente ou un format inconnu", () => {
  const v1 = { exportedAt: "2026-09-01T00:00:00Z", version: 1, teams: [{ id: "a", name: "A" }], seasons: [], clubData: {}, teamData: {} };
  assert.equal(backup.validateBackup(v1).version, 1);
  const noVersion = { teams: [{ id: "a" }], teamData: {} };
  assert.equal(backup.validateBackup(noVersion).version, 1, "pas de version = format 1");
  assert.equal(backup.validateBackup(goodBackup()).version, 2);
  assert.throws(() => backup.validateBackup(goodBackup({ version: 3 })), (e) => e.code === "too-new" && /plus récente/.test(e.message));
  assert.throws(() => backup.validateBackup(goodBackup({ version: "2" })), (e) => e instanceof crypto.BackupError);
  assert.throws(() => backup.validateBackup(goodBackup({ version: 0 })), (e) => e instanceof crypto.BackupError);
  assert.throws(() => backup.validateBackup(goodBackup({ app: "autre-chose" })), (e) => e instanceof crypto.BackupError);
  assert.throws(() => backup.validateBackup(goodBackup({ teamData: undefined })), (e) => e instanceof crypto.BackupError);
  assert.throws(() => backup.validateBackup(goodBackup({ teams: [{ name: "sans id" }] })), (e) => e instanceof crypto.BackupError);
  assert.throws(() => backup.validateBackup(goodBackup({ clubData: [] })), (e) => e instanceof crypto.BackupError);
  assert.throws(() => backup.validateBackup([1, 2]), (e) => e instanceof crypto.BackupError);
  assert.throws(() => backup.validateBackup(null), (e) => e instanceof crypto.BackupError);
});

test("parseBackupText : JSON tronqué refusé ; fichier chiffré détecté ; clair validé", async () => {
  assert.throws(() => backup.parseBackupText('{"teams": [{"id": "a"'), (e) => e instanceof crypto.BackupError && /Rien n'a été modifié/.test(e.message));
  const plain = backup.parseBackupText(json(goodBackup()));
  assert.equal(plain.encrypted, false);
  const env = await crypto.encryptBackupText(json(goodBackup()), "motdepasse1", FAST);
  const enc = backup.parseBackupText(json(env));
  assert.equal(enc.encrypted, true);
  const opened = await backup.openEncryptedBackup(enc.envelope, "motdepasse1");
  assert.equal(opened.version, 2);
  await assert.rejects(() => backup.openEncryptedBackup(enc.envelope, "pas la bonne"), (e) => e.code === "wrong-passphrase");
});

// ---- fullBackup.js : inventaire, plan, restauration ----------------------------------------------
const noMatches = async () => ({ matches: [], obs: [] });
const adapters = () => {
  const calls = { writeMatches: [], snapshots: [] };
  return {
    calls,
    readMatches: noMatches,
    writeMatches: async (teamId, seasonId, matches, obs, opts) => { calls.writeMatches.push({ teamId, seasonId, matches, obs, opts }); },
    saveSnapshot: async (text, meta) => { calls.snapshots.push({ text, meta }); return { at: 1, reason: meta.reason, chars: text.length }; },
  };
};

test("inventoryLocalStorage : clés de club, clés par équipe×saison, orphelines gardées telles quelles, clés du navigateur exclues", () => {
  reset();
  seedBrowser();
  const teams = JSON.parse(raw("tf_teams")), seasons = JSON.parse(raw("tf_seasons"));
  const { clubData, teamData } = backup.inventoryLocalStorage(teams, seasons);
  assert.ok("tf_teams" in clubData && "tf_club_staff" in clubData && "tf_active_team" in clubData);
  assert.ok(!("tf_last_backup" in clubData), "tf_last_backup n'est pas exportée");
  assert.ok(!JSON.stringify({ clubData, teamData }).includes("autre_appli"), "les clés étrangères à l'app ne sont pas exportées");
  assert.equal(teamData["default-team::default-season"].tf_roster, json([{ id: "p1" }]));
  assert.equal(teamData["t2::s2"].tf_roster, json([{ id: "p2" }]));
  assert.equal(teamData["t2::s2"].tf_exercices, json([{ id: "e1", name: "Rondo" }]));
  assert.equal(teamData["default-team::default-season"]["tf_roster__gone__s2"], json([{ id: "p3" }]), "orpheline : clé complète dans le groupe par défaut");
});

test("export puis restauration dans un navigateur vide : toutes les clés de l'app reviennent à l'identique", async () => {
  reset();
  seedBrowser();
  const { backup: b } = await backup.buildFullBackup({ readMatches: noMatches });
  assert.equal(b.version, backup.BACKUP_VERSION);
  assert.equal(b.app, "game-changer");
  const expected = new Map([...state()].filter(([k]) => k.startsWith("tf_") && k !== "tf_last_backup"));
  reset();
  const a = adapters();
  const report = await backup.restoreFullBackup(backup.validateBackup(JSON.parse(JSON.stringify(b))), { adapters: a });
  assert.equal(report.ok, true);
  assert.equal(a.calls.snapshots.length, 0, "navigateur vide : rien à protéger, pas d'instantané");
  assert.deepEqual([...state()].sort(), [...expected].sort());
});

test("planRestore (fusion) : équipes et saisons FUSIONNÉES par identifiant, la sauvegarde l'emporte sur un même identifiant", () => {
  reset();
  seedBrowser(); // équipes : default-team « U15 A », t2 « U13 » ; saisons : default-season, s2
  const b = backup.validateBackup(goodBackup({
    teams: [{ id: "default-team", name: "U15 A (renommée)" }, { id: "t9", name: "U17" }],
    seasons: [{ id: "default-season", label: "2026-2027" }, { id: "s9", label: "2025-2026" }],
  }));
  const plan = backup.planRestore(b);
  assert.deepEqual(plan.teams.map((t) => t.id), ["default-team", "t2", "t9"], "t2 (créée depuis la sauvegarde) est conservée, t9 ajoutée");
  assert.equal(plan.teams[0].name, "U15 A (renommée)");
  assert.deepEqual(plan.seasons.map((s) => s.id), ["default-season", "s2", "s9"]);
  assert.deepEqual(plan.addedTeams.map((t) => t.id), ["t9"]);
  assert.deepEqual(plan.addedSeasons.map((s) => s.id), ["s9"]);
});

test("planRestore : clés du navigateur et clés étrangères jamais écrites ; équipe active jamais écrasée ; identiques ignorées", () => {
  reset();
  seedBrowser();
  const b = backup.validateBackup(goodBackup({
    clubData: {
      tf_active_team: "t2", tf_active_season: "s2", // ne doivent pas écraser le choix déjà fait ici
      tf_last_backup: json({ at: 5 }),               // clé du navigateur
      "sb-projet-auth-token": "{\"jeton\":1}",       // session de connexion : jamais touchée
      tf_club_staff: json([{ id: "c1", name: "Coach" }]), // identique à ce qui existe
      tf_club_events: json([{ id: "ev" }]),          // nouvelle
      tf_bad: 12,                                    // valeur illisible
    },
  }));
  const plan = backup.planRestore(b);
  const keys = plan.writes.map((w) => w.rawKey);
  assert.ok(!keys.includes("tf_active_team") && !keys.includes("tf_active_season"));
  assert.ok(!keys.includes("tf_last_backup"));
  assert.ok(!keys.includes("sb-projet-auth-token"));
  assert.ok(!keys.includes("tf_club_staff"), "contenu identique : rien à écrire");
  assert.ok(keys.includes("tf_club_events"));
  assert.ok(plan.unchanged >= 1);
  assert.deepEqual(plan.skipped.map((s) => s.key).sort(), ["sb-projet-auth-token", "tf_bad"]);
  const deltas = plan.writes.map((w) => w.deltaChars);
  assert.deepEqual(deltas, [...deltas].sort((x, y) => x - y), "les écritures qui rétrécissent passent d'abord");
});

test("restoreFullBackup (fusion) : une équipe créée après la sauvegarde reste dans les sélecteurs, avec ses données", async () => {
  reset();
  seedBrowser();
  const { backup: oldBackup } = await backup.buildFullBackup({ readMatches: noMatches });
  // Après la sauvegarde : une nouvelle équipe et ses données.
  const teams = JSON.parse(raw("tf_teams")); teams.push({ id: "t3", name: "U11" });
  ls._m.set("tf_teams", json(teams));
  ls._m.set("tf_roster__t3__s2", json([{ id: "p9" }]));
  ls._m.set("tf_roster", json([{ id: "p1" }, { id: "p-recent" }])); // modifié après la sauvegarde : sera remplacé
  const a = adapters();
  const report = await backup.restoreFullBackup(backup.validateBackup(JSON.parse(JSON.stringify(oldBackup))), { adapters: a });
  assert.equal(report.ok, true);
  assert.deepEqual(JSON.parse(raw("tf_teams")).map((t) => t.id), ["default-team", "t2", "t3"]);
  assert.equal(raw("tf_roster__t3__s2"), json([{ id: "p9" }]), "données de l'équipe créée depuis : intactes");
  assert.equal(raw("tf_roster"), json([{ id: "p1" }]), "la rubrique présente dans la sauvegarde est remplacée");
  assert.equal(a.calls.snapshots.length, 1, "navigateur avec données : instantané automatique avant d'écrire");
  assert.match(a.calls.snapshots[0].meta.reason, /restauration/);
  const snap = backup.validateBackup(JSON.parse(a.calls.snapshots[0].text));
  assert.ok(snap.teams.some((t) => t.id === "t3"), "l'instantané contient l'état d'AVANT (équipe t3 comprise)");
  assert.equal(snap.teamData["default-team::default-season"].tf_roster, json([{ id: "p1" }, { id: "p-recent" }]));
  assert.equal(raw("tf_last_backup"), json({ at: 1 }), "la date de dernière sauvegarde n'est pas touchée par une restauration");
});

test("restoreFullBackup : échec d'écriture en cours de route → tout est remis comme avant, erreur explicite", async () => {
  reset();
  seedBrowser();
  const { backup: b } = await backup.buildFullBackup({ readMatches: noMatches });
  const target = backup.validateBackup(JSON.parse(JSON.stringify({
    ...b,
    clubData: { ...b.clubData, tf_club_staff: json([{ id: "c1", name: "Autre" }]), tf_club_events: json([{ id: "ev" }]) },
    teamData: { ...b.teamData, "t2::s2": { ...b.teamData["t2::s2"], tf_roster: json([{ id: "ecrase" }]), tf_gameplan: json({ x: 1 }) } },
  })));
  const before = state();
  ls.failKeys.add("tf_roster__t2__s2"); // une écriture au milieu du lot est refusée
  const a = adapters();
  await assert.rejects(() => backup.restoreFullBackup(target, { adapters: a }), (e) => {
    assert.ok(e instanceof crypto.BackupError);
    assert.equal(e.code, "write-failed");
    assert.match(e.message, /tf_roster__t2__s2/);
    assert.match(e.message, /rien n'a été modifié/i);
    assert.deepEqual(e.rollbackFailed, []);
    return true;
  });
  sameState(before);
  assert.equal(a.calls.writeMatches.length, 0, "les matchs ne sont pas touchés après un échec");
});

test("restoreFullBackup : pas assez de place → refusé AVANT d'écrire quoi que ce soit", async () => {
  reset();
  seedBrowser();
  const { backup: b } = await backup.buildFullBackup({ readMatches: noMatches });
  const big = backup.validateBackup(JSON.parse(JSON.stringify({ ...b, clubData: { ...b.clubData, tf_club_events: "x".repeat(300000) } })));
  let used = 0; for (const [k, v] of ls._m) used += k.length + v.length;
  ls.quota = used + 50000; // il manque ≈ 250 000 caractères
  const before = state();
  await assert.rejects(() => backup.restoreFullBackup(big, { adapters: adapters() }), (e) => e.code === "no-room" && /Pas assez de place/.test(e.message));
  sameState(before);
  assert.equal(alerts.length, 0, "pas d'alerte générique : le message précis est celui de l'erreur");
});

test("restoreFullBackup : un instantané impossible bloque l'opération (rien n'est modifié)", async () => {
  reset();
  seedBrowser();
  const { backup: b } = await backup.buildFullBackup({ readMatches: noMatches });
  const before = state();
  const a = adapters();
  a.saveSnapshot = async () => { throw new Error("IndexedDB indisponible"); };
  await assert.rejects(() => backup.restoreFullBackup(backup.validateBackup(JSON.parse(JSON.stringify(b))), { adapters: a }), (e) => e.code === "no-snapshot");
  sameState(before);
});

test("restoreFullBackup : les matchs (IndexedDB) sont remis scope par scope ; un échec est listé sans défaire le reste", async () => {
  reset();
  const b = backup.validateBackup(goodBackup({
    teams: [{ id: "default-team", name: "A" }, { id: "t2", name: "B" }],
    seasons: [{ id: "default-season", label: "S" }],
    teamData: {
      "default-team::default-season": { tf_roster: "[]", _studioMatches: [{ id: "m1" }], _obsMatches: [{ id: "o1" }] },
      "t2::default-season": { tf_roster: "[]", _studioMatches: [{ id: "m2" }], _obsMatches: [] },
    },
  }));
  const a = adapters();
  a.writeMatches = async (teamId, seasonId, matches, obs, opts) => {
    if (teamId === "t2") throw new Error("base verrouillée");
    a.calls.writeMatches.push({ teamId, seasonId, matches, obs, opts });
  };
  const report = await backup.restoreFullBackup(b, { adapters: a });
  assert.equal(report.ok, true);
  assert.equal(report.matchScopesRestored, 1);
  assert.deepEqual(report.matchFailures.map((f) => f.teamId), ["t2"]);
  assert.equal(raw("tf_roster__t2__default-season"), "[]", "le reste est bien restauré");
  assert.deepEqual(a.calls.writeMatches[0].matches, [{ id: "m1" }]);
  assert.equal(a.calls.writeMatches[0].opts.replace, false, "en fusion, les matchs existants ne sont pas vidés");
});

test("retour à l'instantané (mode replace) : état exact d'avant, clés ajoutées retirées, listes d'équipes telles quelles", async () => {
  reset();
  seedBrowser();
  const { backup: before } = await backup.buildFullBackup({ readMatches: noMatches });
  const beforeState = new Map([...state()].filter(([k]) => k.startsWith("tf_") && k !== "tf_last_backup"));
  // une restauration ajoute une équipe, des clés, en remplace d'autres
  const other = backup.validateBackup(goodBackup({
    teams: [{ id: "t9", name: "Nouvelle" }],
    clubData: { tf_club_events: json([{ id: "ev" }]), tf_club_staff: json([]) },
    teamData: { "t9::default-season": { tf_roster: json([{ id: "z" }]) } },
  }));
  const a = adapters();
  await backup.restoreFullBackup(other, { adapters: a });
  assert.ok(raw("tf_roster__t9__default-season"), "la restauration a bien ajouté des données");
  // retour en arrière : l'instantané pris par la restauration est celui d'avant
  const savedText = a.calls.snapshots[0].text;
  const a2 = adapters();
  const report = await backup.revertToSafetySnapshot({ adapters: { ...a2, loadSnapshotText: async () => savedText } });
  assert.equal(report.mode, "replace");
  assert.deepEqual([...state()].filter(([k]) => k.startsWith("tf_") && k !== "tf_last_backup").sort(), [...beforeState].sort());
  assert.equal(a2.calls.snapshots.length, 1, "l'état « après » devient à son tour l'instantané (retour en avant possible)");
  assert.ok(a2.calls.writeMatches.every((c) => c.opts.replace === true), "les matchs sont remis à l'état exact, magasins vidés d'abord");
  assert.ok(before.teams.length === 2);
});

// ---- fullBackup.js : export, rappel, purge --------------------------------------------------------
function fakeDownloads() {
  const files = [];
  globalThis.document = { createElement: () => { const a = { click() { files.push({ name: a.download, href: a.href }); } }; return a; }, body: { appendChild() {}, removeChild() {} } };
  const blobs = [];
  const realCreate = URL.createObjectURL, realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => { blobs.push(blob); return `blob:fake-${blobs.length}`; };
  URL.revokeObjectURL = () => {};
  return { files, blobs, restore() { URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke; delete globalThis.document; } };
}

test("exportFullBackupFile : fichier JSON lisible, date de dernière sauvegarde enregistrée, avertissement si des matchs sont illisibles", async () => {
  reset();
  seedBrowser();
  const dl = fakeDownloads();
  try {
    const r = await backup.exportFullBackupFile({ readMatches: noMatches });
    assert.equal(r.encrypted, false);
    assert.deepEqual(r.warnings, []);
    assert.match(dl.files[0].name, /^game-changer-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
    const parsed = backup.parseBackupText(await dl.blobs[0].text());
    assert.equal(parsed.encrypted, false);
    assert.equal(parsed.backup.teams.length, 2);
    const last = backup.getLastBackup();
    assert.ok(last && Math.abs(last.at - Date.now()) < 5000 && last.encrypted === false);
    assert.equal(backup.backupAgeDays(last), 0);

    const bad = await backup.exportFullBackupFile({ readMatches: async () => ({ matches: [], obs: [], error: "délai dépassé" }) });
    assert.equal(bad.warnings.length, 4, "2 équipes × 2 saisons : chacune signalée, la sauvegarde n'est pas annoncée complète");
  } finally { dl.restore(); }
});

test("exportFullBackupFile chiffré : le fichier ne contient aucune donnée en clair et se rouvre avec la phrase", async () => {
  reset();
  seedBrowser();
  ls._m.set("tf_medical_health_profiles", json({ p1: { allergies: "arachides", contactUrgence: "Contact Fictif 0000000000" } }));
  const dl = fakeDownloads();
  try {
    const r = await backup.exportFullBackupFile({ readMatches: noMatches, passphrase: "ma phrase secrète" });
    assert.equal(r.encrypted, true);
    assert.match(dl.files[0].name, /-chiffree\.json$/);
    const text = await dl.blobs[0].text();
    assert.ok(!text.includes("arachides") && !text.includes("Contact Fictif") && !text.includes("tf_roster"), "rien de lisible dans le fichier");
    const parsed = backup.parseBackupText(text);
    assert.equal(parsed.encrypted, true);
    const opened = await backup.openEncryptedBackup(parsed.envelope, "ma phrase secrète");
    assert.ok(opened.teamData["default-team::default-season"].tf_medical_health_profiles.includes("arachides"));
    assert.equal(backup.getLastBackup().encrypted, true);
  } finally { dl.restore(); }
});

test("rappel de sauvegarde : rien sur un navigateur sans données ; 14 jours ; jamais sauvegardé ; report de 3 jours", () => {
  const at = (iso, h = 12) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, h, 0).getTime(); };
  const today = "2026-10-07";
  reset();
  assert.equal(backup.getBackupReminder(today).show, false, "pas de joueur, de match ni de séance : rien à perdre");
  ls._m.set("tf_roster", json([{ id: "p1" }]));
  assert.deepEqual(backup.getBackupReminder(today), { show: true, reason: "never" });
  ls._m.set("tf_last_backup", json({ at: at("2026-10-07") }));
  assert.equal(backup.getBackupReminder(today).show, false);
  ls._m.set("tf_last_backup", json({ at: at("2026-09-23") })); // 14 jours : pas encore
  assert.equal(backup.getBackupReminder(today).show, false);
  ls._m.set("tf_last_backup", json({ at: at("2026-09-22") })); // 15 jours
  const old = backup.getBackupReminder(today);
  assert.equal(old.show, true);
  assert.equal(old.reason, "old");
  assert.equal(old.days, 15);
  ls._m.set("tf_backup_snooze_until", "2026-10-10");
  assert.equal(backup.getBackupReminder("2026-10-09").show, false, "reporté");
  assert.equal(backup.getBackupReminder("2026-10-10").show, true, "le report est terminé");
  // les données dans une autre équipe/saison comptent aussi
  reset();
  ls._m.set("tf_matches_index__t2__s2", json([{ id: "m" }]));
  assert.equal(backup.getBackupReminder(today).show, true);
});

test("l'âge d'une sauvegarde se compte en jours calendaires locaux (23 h 50 hier = hier, pas aujourd'hui)", () => {
  const yesterdayLate = new Date(2026, 9, 6, 23, 50).getTime();
  assert.equal(backup.backupAgeDays({ at: yesterdayLate }, "2026-10-07"), 1);
  assert.equal(backup.describeBackupAge({ at: yesterdayLate }, "2026-10-07"), "hier (06/10/2026)");
  assert.equal(backup.describeBackupAge({ at: new Date(2026, 9, 7, 8, 0).getTime() }, "2026-10-07"), "aujourd'hui (07/10/2026)");
  assert.equal(backup.describeBackupAge({ at: new Date(2026, 9, 2, 8, 0).getTime() }, "2026-10-07"), "il y a 5 jours (02/10/2026)");
});

test("purgeOrphanScope : supprime les clés d'une équipe supprimée seulement, après un instantané ; refuse un scope encore actif", async () => {
  reset();
  seedBrowser();
  ls._m.set("tf_exercices__gone__s2", "x".repeat(1000));
  const a = adapters();
  await assert.rejects(() => backup.purgeOrphanScope("t2", "s2", { adapters: a }), (e) => e.code === "invalid" && /orphelines/.test(e.message));
  await assert.rejects(() => backup.purgeOrphanScope("default-team", "default-season", { adapters: a }), (e) => e.code === "invalid");
  assert.equal(a.calls.snapshots.length, 0);
  const r = await backup.purgeOrphanScope("gone", "s2", { adapters: a });
  assert.equal(r.removed, 2);
  assert.ok(r.freedChars > 1000);
  assert.equal(raw("tf_roster__gone__s2"), null);
  assert.equal(raw("tf_exercices__gone__s2"), null);
  assert.equal(raw("tf_roster__t2__s2"), json([{ id: "p2" }]), "les scopes existants ne sont pas touchés");
  assert.equal(raw("tf_club_staff"), json([{ id: "c1", name: "Coach" }]));
  assert.equal(a.calls.snapshots.length, 1);
  assert.ok(a.calls.snapshots[0].text.includes("tf_roster__gone__s2"), "l'instantané contient ce qui va être supprimé : l'opération est annulable");
});

test("mergeById : l'ordre local est conservé, les nouveautés viennent après", () => {
  assert.deepEqual(backup.mergeById([{ id: "a", v: 1 }, { id: "b", v: 1 }], [{ id: "c", v: 2 }, { id: "a", v: 2 }]), [{ id: "a", v: 2 }, { id: "b", v: 1 }, { id: "c", v: 2 }]);
});
