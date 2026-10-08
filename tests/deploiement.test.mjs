// Garde-fous du déploiement : ces fichiers ne sont lus par aucun écran, une faute de frappe y passerait
// inaperçue jusqu'à la mise en ligne. On vérifie leur contenu : vercel.json (adresse /parent, en-têtes de
// sécurité, politique CSP, cache des fichiers hachés), les deux workflows GitHub, les deux pages HTML.
//
// Quand la politique CSP passera du mode « rapport seul » au mode bloquant (clé
// `Content-Security-Policy` au lieu de `Content-Security-Policy-Report-Only`), mettre à jour
// CSP_HEADER ci-dessous : le test servira alors de garde-fou à la version bloquante.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (fichier) => fs.readFileSync(path.join(ROOT, fichier), "utf8");

const CSP_HEADER = "Content-Security-Policy-Report-Only";
const SUPABASE_HOST = "dajsfquzknvutugjkrye.supabase.co"; // projet de production (voir CLAUDE.md) : à changer si le projet change

const config = JSON.parse(lire("vercel.json"));
const enTetes = (source) => {
  const regle = config.headers.find((h) => h.source === source);
  assert.ok(regle, `aucune règle d'en-têtes pour ${source}`);
  return Object.fromEntries(regle.headers.map((h) => [h.key, h.value]));
};
const directives = (csp) => Object.fromEntries(csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const [nom, ...valeurs] = d.split(/\s+/); return [nom, valeurs]; }));

test("vercel.json : /parent (avec ou sans barre finale) sert parent.html, sans rediriger /parent.html", () => {
  const reecritures = Object.fromEntries(config.rewrites.map((r) => [r.source, r.destination]));
  assert.equal(reecritures["/parent"], "/parent.html");
  assert.equal(reecritures["/parent/"], "/parent.html");
  // une réécriture, pas une redirection : le lien magique revient sur /parent.html avec son jeton dans l'adresse
  assert.equal(config.redirects, undefined);
  assert.ok(!config.cleanUrls, "cleanUrls redirigerait /parent.html vers /parent en pleine connexion");
});

test("vercel.json : en-têtes de sécurité sur toutes les pages", () => {
  const h = enTetes("/(.*)");
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["X-Frame-Options"], "DENY");
  assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(h["X-Robots-Tag"], /noindex/);
  // la météo a besoin de la position ; rien n'utilise la caméra ni le micro
  assert.match(h["Permissions-Policy"], /geolocation=\(self\)/);
  assert.match(h["Permissions-Policy"], /camera=\(\)/);
  assert.match(h["Permissions-Policy"], /microphone=\(\)/);
});

test("vercel.json : la politique CSP couvre ce que l'application utilise, sans eval ni script en ligne", () => {
  const h = enTetes("/(.*)");
  assert.ok(h[CSP_HEADER], `${CSP_HEADER} absent`);
  const d = directives(h[CSP_HEADER]);
  assert.deepEqual(d["default-src"], ["'self'"]);
  // scripts : ceux du site + le moteur vidéo (WebAssembly compilé depuis une URL blob:), jamais d'eval ni de script en ligne
  assert.ok(d["script-src"].includes("'self'") && d["script-src"].includes("'wasm-unsafe-eval'") && d["script-src"].includes("blob:"));
  assert.ok(!d["script-src"].includes("'unsafe-eval'") && !d["script-src"].includes("'unsafe-inline'"));
  // réseau : Supabase (projet précis, pas tous les *.supabase.co), météo, CDN du moteur vidéo
  for (const origine of [`https://${SUPABASE_HOST}`, "https://api.open-meteo.com", "https://unpkg.com"]) {
    assert.ok(d["connect-src"].includes(origine), `connect-src doit autoriser ${origine}`);
  }
  assert.ok(!d["connect-src"].some((v) => v === "*" || v.startsWith("https://*")), "pas de joker réseau");
  // photos et logos enregistrés en data:, vidéos et textures 3D en blob:, moteur vidéo dans un worker blob:
  assert.ok(d["img-src"].includes("data:") && d["img-src"].includes("blob:"));
  assert.ok(d["media-src"].includes("blob:"));
  assert.ok(d["worker-src"].includes("blob:"));
  assert.deepEqual(d["object-src"], ["'none'"]);
  assert.deepEqual(d["base-uri"], ["'self'"]);
  assert.deepEqual(d["frame-ancestors"], ["'none'"]);
});

test("vercel.json : fichiers hachés mis en cache un an (leur nom change à chaque build), pages jamais", () => {
  assert.equal(enTetes("/assets/(.*)")["Cache-Control"], "public, max-age=31536000, immutable");
  assert.ok(!enTetes("/(.*)")["Cache-Control"], "un Cache-Control global figerait aussi les pages HTML");
});

test("CI : build, tests JavaScript et tests SQL sur chaque PR et chaque push sur main", () => {
  const ci = lire(".github/workflows/ci.yml");
  assert.match(ci, /^on:\s*\n\s+pull_request:\s*\n\s+push:\s*\n\s+branches: \[main\]/m);
  for (const commande of ["npm ci", "npm run build", "npm test", "npm run test:db"]) assert.ok(ci.includes(commande), `la CI doit lancer « ${commande} »`);
  assert.match(ci, /@electric-sql\/pglite@\d+\.\d+\.\d+/, "version de PGlite figée");
  // sans ce contrôle, des tests SQL ignorés (PGlite introuvable) feraient un faux vert
  assert.match(ci, /Vérifier que PGlite se charge/);
  assert.match(ci, /permissions:\s*\n\s+contents: read/, "droits minimaux du jeton");
  assert.ok(!/secrets\./.test(ci), "la CI n'a besoin d'aucun secret");
});

test("keep-alive Supabase : URL et clé lues dans les variables du dépôt, jamais écrites dans le fichier", () => {
  const f = lire(".github/workflows/keepalive-supabase.yml");
  // les commentaires de tête peuvent CITER le format d'une clé ; seul le code compte pour « rien en dur »
  const code = f.split("\n").filter((ligne) => !ligne.trim().startsWith("#")).join("\n");
  assert.match(f, /cron: "[^"]+"/);
  assert.match(f, /workflow_dispatch:/, "lançable à la main pour l'essayer");
  assert.ok(f.includes("vars.SUPABASE_URL") && f.includes("vars.SUPABASE_ANON_KEY"));
  assert.ok(!/secrets\./.test(code));
  assert.doesNotMatch(code, /https:\/\/[a-z0-9]{10,}\.supabase\.co/, "pas d'adresse de projet en dur");
  assert.doesNotMatch(code, /sb_publishable_[A-Za-z0-9_-]{10,}|sb_secret_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{20,}/, "aucune clé en dur");
  // un projet muet doit faire ÉCHOUER l'exécution (c'est l'alerte), pas passer en vert
  assert.match(f, /exit 1/);
});

test("pages HTML : non référencées, titre, description et icône", () => {
  for (const [fichier, titre] of [["index.html", /<title>Game Changer<\/title>/], ["parent.html", /<title>Game Changer — Portail parent<\/title>/]]) {
    const html = lire(fichier);
    assert.match(html, titre, `${fichier} : titre`);
    assert.match(html, /<meta name="description" content="[^"]{20,}"/, `${fichier} : description`);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/, `${fichier} : noindex`);
    assert.match(html, /<link rel="icon" href="\/favicon\.svg"/, `${fichier} : icône SVG`);
    assert.match(html, /<link rel="icon" href="\/favicon-32\.png"/, `${fichier} : icône PNG (Safari)`);
  }
  assert.match(lire("public/robots.txt"), /User-agent: \*\s*\nDisallow: \//);
  for (const icone of ["public/favicon.svg", "public/favicon-32.png"]) assert.ok(fs.existsSync(path.join(ROOT, icone)), `${icone} manquant`);
  // vraie image PNG (signature), pas un fichier vide
  assert.deepEqual([...fs.readFileSync(path.join(ROOT, "public/favicon-32.png")).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
