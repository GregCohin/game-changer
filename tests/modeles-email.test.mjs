// Modèles d'e-mail de connexion à coller dans Supabase (docs/modeles-email/*.html).
// Ce qui les rend fragiles, et que ces tests surveillent :
//  - un accent corrompu au copier-coller (voir CLAUDE.md, « piège du presse-papiers ») → fichiers en ASCII pur, accents en entités ;
//  - une variable mal orthographiée ({{ .Tokenhash }}) : Supabase la rend « <no value> » dans l'e-mail, sans erreur ;
//  - un lien qui ne correspondrait plus à ce que l'application sait lire (src/lib/emailLogin.js) ;
//  - le lien ordinaire de Supabase ({{ .ConfirmationURL }}), que les scanners de messagerie consomment avant le parent.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseConfirmationLink } from "../src/lib/emailLogin.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "docs/modeles-email");
const NAMES = ["magic-link.html", "confirm-signup.html"];

const VARIABLES = new Set(["{{ .Token }}", "{{ .TokenHash }}", "{{ .RedirectTo }}", "{{ .Email }}"]);
const ENTITIES = { amp: "&", nbsp: " ", rsquo: "’", eacute: "é", agrave: "à", icirc: "î" };
const HASH = "3f0d8c1b2a4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0";
const REDIRECT = "https://football-analysis-ten.vercel.app/parent.html";

const decodeEntities = (s) => s.replace(/&([a-z]+);/gi, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));
const render = (html) => html
  .replaceAll("{{ .Token }}", "123456")
  .replaceAll("{{ .TokenHash }}", HASH)
  .replaceAll("{{ .RedirectTo }}", REDIRECT)
  .replaceAll("{{ .Email }}", "parent@example.com");
const hrefs = (html) => [...html.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);

for (const name of NAMES) {
  describe(`modèle ${name}`, () => {
    const bytes = fs.readFileSync(path.join(DIR, name));
    const html = bytes.toString("utf8");

    test("ASCII pur : aucun octet au-dessus de 127, aucune marque d'ordre des octets (accents en entités HTML)", () => {
      assert.ok(bytes.every((b) => b < 128), "un caractère non ASCII a été trouvé (accent collé tel quel ?)");
      assert.ok(!html.startsWith("﻿"));
    });

    test("entités HTML : toutes connues (une faute de frappe comme &eacue; s'afficherait telle quelle)", () => {
      const used = [...html.matchAll(/&([a-z]+);/gi)].map((m) => m[1]);
      assert.ok(used.length > 0);
      for (const entity of used) assert.ok(entity in ENTITIES, `entité inconnue : &${entity};`);
      assert.ok(!/&(?![a-z]+;)/i.test(html), "un « & » nu : il doit s'écrire &amp; dans le HTML");
    });

    test("variables Supabase : seulement Token, TokenHash, RedirectTo et Email, écrites exactement ainsi", () => {
      const found = html.match(/\{\{[^}]*\}\}/g) || [];
      assert.ok(found.length >= 4);
      for (const v of found) assert.ok(VARIABLES.has(v), `variable inattendue : ${v}`);
      assert.equal(html.split("{{").length, html.split("}}").length, "accolades déséquilibrées");
      assert.equal((html.match(/\{\{ \.Token \}\}/g) || []).length, 1, "le code doit figurer une seule fois");
    });

    test("le code est affiché en grand ; pas d'image, de script, de suivi ni de lien ordinaire de Supabase", () => {
      assert.match(html, /font-size:32px[^"]*">\{\{ \.Token \}\}<\/p>/);
      assert.doesNotMatch(html, /<img|<script|<iframe|<form|<link|<style|ConfirmationURL|http:\/\//i);
    });

    test("un seul lien : vers la page de confirmation de l'application, avec le jeton en « # » (jamais envoyé au serveur)", () => {
      const links = hrefs(html);
      assert.equal(links.length, 1);
      assert.equal(links[0], "{{ .RedirectTo }}#confirmation?token_hash={{ .TokenHash }}&amp;type=email");
    });

    test("de bout en bout : le lien rendu est compris par l'application (parseConfirmationLink), avec le type « email »", () => {
      const link = hrefs(render(html)).map(decodeEntities)[0];
      const url = new URL(link);
      assert.equal(url.origin + url.pathname, REDIRECT);
      assert.equal(url.search, "", "le jeton n'est pas dans la partie « ? » (envoyée au serveur)");
      assert.deepEqual(parseConfirmationLink(url.hash, url.search), { ok: true, tokenHash: HASH, type: "email" });
    });

    test("balises équilibrées", () => {
      for (const tag of ["html", "head", "body", "div", "p", "a"]) {
        const opened = (html.match(new RegExp(`<${tag}(\\s|>)`, "g")) || []).length;
        const closed = (html.match(new RegExp(`</${tag}>`, "g")) || []).length;
        assert.equal(opened, closed, `<${tag}> : ${opened} ouvertes, ${closed} fermées`);
      }
    });

    test("texte rendu : la consigne, le rappel des indésirables et l'adresse du destinataire", () => {
      const text = decodeEntities(render(html)).replace(/<[^>]+>/g, " ");
      assert.match(text, /123456/);
      assert.match(text, /Saisis-le sur la page de connexion/);
      assert.match(text, /en un clic/);
      assert.match(text, /indésirables \(spam\)/);
      assert.match(text, /parent@example\.com/);
      assert.match(text, /Tu n’as rien demandé/);
      assert.doesNotMatch(text, /no value|undefined|\{\{|\}\}/);
    });
  });
}

describe("les deux modèles", () => {
  test("même lien et même code : ils ne diffèrent que par l'accueil (inscription ou connexion)", () => {
    const [a, b] = NAMES.map((n) => fs.readFileSync(path.join(DIR, n), "utf8"));
    assert.deepEqual(hrefs(a), hrefs(b));
    assert.notEqual(a, b);
    assert.match(a, /Voici ton code de connexion au portail/);
    assert.match(b, /Bienvenue/);
  });
});
