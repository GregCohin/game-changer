// Instantané de sécurité : une copie complète de l'état de l'app, prise AUTOMATIQUEMENT juste avant
// une opération qui remplace ou supprime des données (restauration d'une sauvegarde, suppression de
// données orphelines). Elle permet de revenir en arrière en un clic depuis Club → Sauvegarde.
//
// Où : IndexedDB (base `tf_safety_net`), pas localStorage — l'instantané pèse autant que toutes les
// données et localStorage est précisément ce qui manque de place. Un seul emplacement : l'instantané
// suivant remplace le précédent. Deux enregistrements : `last-meta` (petit, lu pour l'affichage) et
// `last-text` (le JSON complet, lu seulement pour télécharger ou revenir en arrière).

import { BackupError } from "./backupCrypto.js";

const DB_NAME = "tf_safety_net";
const STORE = "snapshots";
const META_ID = "last-meta";
const TEXT_ID = "last-text";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new BackupError("IndexedDB n'est pas disponible dans ce navigateur (navigation privée ?).", "no-snapshot")); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("ouverture d'IndexedDB impossible"));
    req.onblocked = () => reject(new Error("IndexedDB est bloquée par un autre onglet de l'application"));
  });
}

function runTx(mode, work) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    let result;
    let tx;
    try {
      tx = db.transaction(STORE, mode);
      result = work(tx.objectStore(STORE));
    } catch (e) { db.close(); reject(e); return; }
    tx.oncomplete = () => { db.close(); resolve(result && "result" in result ? result.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("transaction IndexedDB échouée")); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("transaction IndexedDB annulée")); };
  }));
}

// Enregistre l'instantané (remplace le précédent). `text` : le JSON de sauvegarde complet.
// `reason` : phrase affichée à l'utilisateur, ex. « avant la restauration du 07/10/2026 ».
export async function saveSafetySnapshot(text, { reason = "" } = {}) {
  const at = Date.now();
  await runTx("readwrite", (store) => {
    store.put({ id: TEXT_ID, text });
    store.put({ id: META_ID, at, reason, chars: text.length });
  });
  return { at, reason, chars: text.length };
}

export async function getSafetySnapshotInfo() {
  try {
    const meta = await runTx("readonly", (store) => store.get(META_ID));
    return meta ? { at: meta.at, reason: meta.reason || "", chars: meta.chars || 0 } : null;
  } catch (e) {
    return null;
  }
}

export async function loadSafetySnapshotText() {
  const rec = await runTx("readonly", (store) => store.get(TEXT_ID));
  return rec && typeof rec.text === "string" ? rec.text : null;
}

export async function deleteSafetySnapshot() {
  await runTx("readwrite", (store) => { store.delete(TEXT_ID); store.delete(META_ID); });
}
