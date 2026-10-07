// Codes d'invitation des parents (audit du 07/10/2026, point 4) : le générateur du staff et la contrainte de
// la base doivent s'accorder. Lancer avec `npm test`. Aucune dépendance : node:test.
//
// Le test lit le motif de la contrainte directement dans la migration plutôt que de le recopier : changer la
// longueur ou l'alphabet d'un seul côté fait échouer ce fichier.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomInvitationCode, INVITATION_CODE_ALPHABET, INVITATION_CODE_LENGTH } from "../src/lib/invitationCode.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(ROOT, "supabase/migrations");
const migration = fs.readdirSync(migrationsDir).find((f) => f.endsWith("_securite_portail.sql"));
const sql = fs.readFileSync(path.join(migrationsDir, migration), "utf8");
const dbPattern = new RegExp(/check \(code ~ '([^']+)'\)/.exec(sql)[1]);

test("un code tiré respecte le motif imposé par la base", () => {
  for (let i = 0; i < 5000; i++) {
    const code = randomInvitationCode();
    assert.equal(code.length, INVITATION_CODE_LENGTH);
    assert.match(code, dbPattern);
  }
});

test("l'alphabet n'a aucun caractère ambigu et 32 symboles (octet & 31 reste uniforme)", () => {
  assert.equal(INVITATION_CODE_ALPHABET.length, 32);
  assert.equal(new Set(INVITATION_CODE_ALPHABET).size, 32);
  assert.doesNotMatch(INVITATION_CODE_ALPHABET, /[01OI]/);
  // la base accepte exactement cet alphabet : les 32 symboles tombent tous dans la classe de caractères du motif
  const alphabetClass = /\[[^\]]+\]/.exec(dbPattern.source)[0];
  assert.match(INVITATION_CODE_ALPHABET, new RegExp(`^${alphabetClass}{32}$`));
  for (const forbidden of "0O1IabcdefghijklmnopqrstuvwxyzÉ-") assert.doesNotMatch(forbidden, new RegExp(alphabetClass));
});

test("la longueur par défaut est dans la fourchette de la base (8 à 16)", () => {
  assert.ok(INVITATION_CODE_LENGTH >= 8 && INVITATION_CODE_LENGTH <= 16);
});

test("les tirages ne se répètent pas et chaque symbole sort à peu près aussi souvent", () => {
  const codes = new Set();
  const counts = Object.fromEntries([...INVITATION_CODE_ALPHABET].map((c) => [c, 0]));
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const code = randomInvitationCode();
    codes.add(code);
    for (const ch of code) counts[ch]++;
  }
  assert.equal(codes.size, N, "aucun doublon sur 20 000 codes de 10 caractères");
  const expected = (N * INVITATION_CODE_LENGTH) / 32; // 6 250 par symbole
  for (const [ch, n] of Object.entries(counts)) {
    assert.ok(Math.abs(n - expected) < expected * 0.1, `${ch} sort ${n} fois (attendu ≈ ${expected})`);
  }
});

test("le générateur utilise la source cryptographique qu'on lui donne, jamais Math.random", () => {
  const realRandom = Math.random;
  Math.random = () => { throw new Error("Math.random ne doit pas servir à tirer un code"); };
  try {
    // octets connus : 0 -> A, 31 -> 9, 32 -> A (32 & 31 = 0), 255 -> 9
    const fixed = { getRandomValues: (a) => { [0, 31, 32, 255, 1, 2, 3, 4, 5, 6].forEach((v, i) => { a[i] = v; }); return a; } };
    assert.equal(randomInvitationCode(10, fixed), "A9A9BCDEFG");
  } finally {
    Math.random = realRandom;
  }
});

test("le client ne contient plus de tirage par Math.random pour un code", () => {
  const portalSync = fs.readFileSync(path.join(ROOT, "src/lib/portalSync.js"), "utf8");
  const start = portalSync.indexOf("export async function generateInvitationCode");
  const body = portalSync.slice(start, portalSync.indexOf("\nexport ", start + 10));
  assert.ok(start > 0);
  assert.doesNotMatch(body, /Math\.random/);
  assert.match(body, /randomInvitationCode\(\)/);
});
