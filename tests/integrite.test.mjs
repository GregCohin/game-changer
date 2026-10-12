// Intégrité du moteur vidéo téléchargé depuis unpkg (src/lib/verifiedBlobUrl.js + src/videoCompiler.js).
//
// Le moteur (ffmpeg-core, ~32 Mo de WebAssembly) s'exécute dans la page, avec accès au localStorage :
// un fichier modifié par le CDN ne doit JAMAIS être exécuté. Ces tests vérifient le mécanisme avec de
// faux téléchargements (aucun accès réseau), et que videoCompiler.js l'utilise bien.
//
// Test facultatif avec le réseau (à lancer en changeant de version du moteur) :
//   VERIFY_FFMPEG_CORE=1 npm test
// il télécharge les deux vrais fichiers et vérifie que les empreintes écrites dans videoCompiler.js
// sont les bonnes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolveObjectURL } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { integrityOf, fetchVerified, toVerifiedBlobURL } from "../src/lib/verifiedBlobUrl.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compilerSource = fs.readFileSync(path.join(ROOT, "src/videoCompiler.js"), "utf8");

const sha384 = (bytes) => "sha384-" + createHash("sha384").update(bytes).digest("base64");
const octets = (texte) => new TextEncoder().encode(texte);
// Faux fetch : répond avec ces octets (ou ce statut).
const faussesReponses = (bytes, { ok = true, status = 200 } = {}) => async () => ({
  ok, status, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

test("integrityOf : même empreinte SHA-384 que Node, y compris sur un gros fichier", async () => {
  const petit = octets("ffmpeg-core.js");
  assert.equal(await integrityOf(petit), sha384(petit));
  const gros = new Uint8Array(5 * 1024 * 1024).map((_, i) => (i * 31) % 251); // plusieurs blocs de 32 Ko
  assert.equal(await integrityOf(gros), sha384(gros));
  assert.match(await integrityOf(petit), /^sha384-[A-Za-z0-9+/]{64}$/);
});

test("fetchVerified : rend les octets quand l'empreinte est la bonne", async () => {
  const contenu = octets("console.log('moteur');");
  const rendu = await fetchVerified("https://exemple.test/core.js", sha384(contenu), { fetchImpl: faussesReponses(contenu) });
  assert.deepEqual(new Uint8Array(rendu), contenu);
});

test("fetchVerified : un seul octet modifié par le CDN -> refusé, rien n'est rendu", async () => {
  const vrai = octets("console.log('moteur');");
  const falsifie = octets("console.log('moteur');").slice();
  falsifie[3] ^= 1;
  await assert.rejects(
    fetchVerified("https://exemple.test/core.js", sha384(vrai), { fetchImpl: faussesReponses(falsifie) }),
    /empreinte attendue.*pas exécuté/s,
  );
  await assert.rejects(
    fetchVerified("https://exemple.test/core.js", sha384(vrai), { fetchImpl: faussesReponses(octets("")) }),
    /empreinte attendue/,
  );
});

test("fetchVerified : réponse en erreur ou empreinte attendue absente/erronée -> refusé", async () => {
  const contenu = octets("x");
  await assert.rejects(fetchVerified("https://exemple.test/a.js", sha384(contenu), { fetchImpl: faussesReponses(contenu, { ok: false, status: 404 }) }), /HTTP 404/);
  await assert.rejects(fetchVerified("https://exemple.test/a.js", undefined, { fetchImpl: faussesReponses(contenu) }), /empreinte attendue/);
  await assert.rejects(fetchVerified("https://exemple.test/a.js", "sha384-pasLaBonne", { fetchImpl: faussesReponses(contenu) }), /empreinte attendue/);
});

test("fetchVerified : sans l'API de chiffrement (page en http), refuse au lieu d'exécuter sans contrôle", async () => {
  const contenu = octets("x");
  // `subtle` explicitement absent : on simule globalThis.crypto.subtle indisponible
  const crypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
  try {
    await assert.rejects(fetchVerified("https://exemple.test/a.js", sha384(contenu), { fetchImpl: faussesReponses(contenu) }), /HTTPS/);
  } finally {
    Object.defineProperty(globalThis, "crypto", crypto);
  }
});

test("toVerifiedBlobURL : une URL blob: du fichier vérifié, avec son type MIME", async () => {
  const contenu = octets("(module)");
  const url = await toVerifiedBlobURL("https://exemple.test/core.wasm", "application/wasm", sha384(contenu), { fetchImpl: faussesReponses(contenu) });
  try {
    assert.match(url, /^blob:/);
    const blob = resolveObjectURL(url);
    assert.equal(blob.type, "application/wasm");
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), contenu);
  } finally {
    URL.revokeObjectURL(url);
  }
  await assert.rejects(
    toVerifiedBlobURL("https://exemple.test/core.wasm", "application/wasm", sha384(octets("autre")), { fetchImpl: faussesReponses(contenu) }),
    /empreinte attendue/,
  );
});

test("videoCompiler.js charge le moteur avec vérification d'empreinte, version épinglée, et n'utilise plus toBlobURL", () => {
  assert.match(compilerSource, /FFMPEG_CORE_BASE_URL = "https:\/\/unpkg\.com\/@ffmpeg\/core@\d+\.\d+\.\d+\/dist\/esm"/, "version du moteur épinglée dans l'adresse");
  assert.match(compilerSource, /FFMPEG_CORE_JS_INTEGRITY = "sha384-[A-Za-z0-9+/]{64}"/);
  assert.match(compilerSource, /FFMPEG_CORE_WASM_INTEGRITY = "sha384-[A-Za-z0-9+/]{64}"/);
  assert.equal((compilerSource.match(/toVerifiedBlobURL\(/g) || []).length, 2, "le script ET le WebAssembly passent par la vérification");
  assert.doesNotMatch(compilerSource, /from "@ffmpeg\/util"/, "plus de chargement sans contrôle");
  assert.doesNotMatch(compilerSource, /[^d]toBlobURL\(/);
  // un échec ne doit pas figer la promesse rejetée (sinon plus aucun essai possible avant rechargement)
  assert.match(compilerSource, /ffmpegLoadingPromise = null/);
});

test("empreintes de videoCompiler.js = vrais fichiers d'unpkg (facultatif : VERIFY_FFMPEG_CORE=1, télécharge ~32 Mo)", {
  skip: process.env.VERIFY_FFMPEG_CORE ? false : "facultatif : lancer avec VERIFY_FFMPEG_CORE=1 npm test",
  timeout: 300000,
}, async () => {
  const lire = (nom) => compilerSource.match(new RegExp(`${nom} = "([^"]+)"`))[1];
  const base = lire("FFMPEG_CORE_BASE_URL");
  await fetchVerified(`${base}/ffmpeg-core.js`, lire("FFMPEG_CORE_JS_INTEGRITY"));
  await fetchVerified(`${base}/ffmpeg-core.wasm`, lire("FFMPEG_CORE_WASM_INTEGRITY"));
});
