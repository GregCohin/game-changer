// Banc d'essai SQL : un vrai Postgres local jetable (PGlite, en mémoire) sur lequel on REJOUE les
// vraies migrations de supabase/migrations/ — jamais de copie du schéma. Les seuls éléments simulés
// sont ceux que Supabase fournit lui-même : le schéma `auth` (auth.users, auth.uid()) et les rôles
// `anon` / `authenticated`.
//
// PGlite n'est PAS une dépendance du dépôt (il pèse plusieurs Mo et ne sert qu'à ces tests). Pour
// lancer la suite, l'installer dans un dossier temporaire HORS du dépôt :
//
//   mkdir /tmp/pglite && cd /tmp/pglite && npm init -y && npm i @electric-sql/pglite
//   cd <dépôt> && PGLITE_DIR=/tmp/pglite npm run test:db
//
// Sans PGLITE_DIR (ni PGlite installé), les tests sont simplement ignorés avec un message.
// Aucune donnée réelle ici : noms, identifiants et dates sont inventés.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");

// Renvoie { PGlite, pgcrypto } ou null si PGlite n'est pas disponible.
export async function loadPglite() {
  const dir = process.env.PGLITE_DIR;
  const base = dir ? path.join(dir, "node_modules/@electric-sql/pglite/dist") : null;
  try {
    const main = await import(base ? pathToFileURL(path.join(base, "index.js")).href : "@electric-sql/pglite");
    const contrib = await import(base ? pathToFileURL(path.join(base, "contrib/pgcrypto.js")).href : "@electric-sql/pglite/contrib/pgcrypto");
    return { PGlite: main.PGlite, pgcrypto: contrib.pgcrypto };
  } catch (e) {
    return null;
  }
}

export const SKIP_MESSAGE = "PGlite introuvable : installe-le hors du dépôt puis lance avec PGLITE_DIR=<dossier> (voir supabase/tests/harness.mjs)";

// `upTo` : n'appliquer que les migrations dont le nom est <= upTo (pour tester l'état avant/après une migration).
export async function createDb({ PGlite, pgcrypto }, { upTo } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $$;
    grant usage on schema public, auth to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (upTo && f > upTo) continue;
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
  }
  return db;
}

// Exécute fn() comme un utilisateur connecté (rôle `authenticated`, sub du JWT = uid), puis redevient superutilisateur.
export async function asUser(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`); }
}

export async function asAnon(db, fn) {
  await db.exec(`set role anon; select set_config('request.jwt.claims', '', false);`);
  try { return await fn(); } finally { await db.exec(`reset role;`); }
}

// Efface toutes les données publiques et les comptes, en gardant schéma, fonctions et policies.
export async function resetData(db) {
  const { rows } = await db.query(`select tablename from pg_tables where schemaname = 'public'`);
  if (rows.length) await db.exec(`truncate ${rows.map((r) => `public."${r.tablename}"`).join(", ")} restart identity cascade; delete from auth.users;`);
}

export async function createUser(db, id, email) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
}

// Résultat d'une opération qui doit échouer : renvoie le message d'erreur (jamais l'objet complet, énorme).
export async function expectError(promise) {
  try { await promise; } catch (e) { return { message: String(e.message), code: e.code, detail: e.detail }; }
  return null;
}
