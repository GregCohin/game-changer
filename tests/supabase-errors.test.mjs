// Classement des erreurs de supabase-js (src/lib/supabaseErrors.js) et messages affichés au parent
// (src/parent/lib/errors.js). Le cas qui compte (audit du 07/10/2026) : un serveur injoignable ou en pause
// ne doit jamais être pris pour « aucun enfant lié ».

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyError } from "../src/lib/supabaseErrors.js";
import { describeError } from "../src/parent/lib/errors.js";

describe("classifyError", () => {
  test("le serveur ne répond pas : « network » (Chrome, Safari, Firefox, Node, erreur d'Auth réessayable)", () => {
    for (const message of [
      "TypeError: Failed to fetch",            // PostgREST (supabase-js) sous Chrome/Edge
      "Failed to fetch",
      "Load failed",                            // Safari / iOS
      "NetworkError when attempting to fetch resource.", // Firefox
      "TypeError: fetch failed",                // Node
      "net::ERR_NAME_NOT_RESOLVED",             // projet en pause : nom d'hôte introuvable
      "net::ERR_INTERNET_DISCONNECTED",
      "The Internet connection appears to be offline.",
      "getaddrinfo ENOTFOUND dajsfquzknvutugjkrye.supabase.co",
    ]) assert.equal(classifyError({ message, details: "", hint: "", code: "" }), "network", message);
    assert.equal(classifyError({ name: "AuthRetryableFetchError", message: "x", status: 0 }), "network");
  });

  test("session expirée ou absente : « auth »", () => {
    assert.equal(classifyError({ code: "PGRST301", message: "JWT expired" }), "auth");
    assert.equal(classifyError({ message: "JWT expired", code: "PGRST303" }), "auth");
    assert.equal(classifyError({ message: "Invalid Refresh Token: Refresh Token Not Found", status: 400 }), "auth");
    assert.equal(classifyError({ message: "Auth session missing!" }), "auth");
    assert.equal(classifyError({ status: 401, message: "x" }), "auth");
  });

  test("droits refusés : « forbidden »", () => {
    assert.equal(classifyError({ code: "42501", message: "Publication réservée au staff" }), "forbidden");
    assert.equal(classifyError({ code: "42501", message: 'new row violates row-level security policy for table "forum_messages"' }), "forbidden");
    assert.equal(classifyError({ message: "permission denied for function publish_snapshot" }), "forbidden");
    assert.equal(classifyError({ status: 403, message: "x" }), "forbidden");
  });

  test("trop de demandes : « rate_limit »", () => {
    assert.equal(classifyError({ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" }), "rate_limit");
    assert.equal(classifyError({ status: 429, message: "x" }), "rate_limit");
    assert.equal(classifyError({ message: "For security purposes, you can only request this after 52 seconds." , status: 429 }), "rate_limit");
  });

  test("code ou lien de connexion refusé : « otp » — et NON « forbidden », bien que Supabase réponde 403", () => {
    // Les trois causes (périmé, déjà ouvert par un scanner de messagerie, faux code) ont la même réponse du serveur.
    assert.equal(classifyError({ status: 403, code: "otp_expired", message: "Email link is invalid or has expired" }), "otp");
    assert.equal(classifyError({ status: 403, code: "otp_expired", message: "Token has expired or is invalid" }), "otp");
    assert.equal(classifyError({ status: 403, message: "Email link is invalid or has expired" }), "otp", "ancien serveur : sans error_code");
    assert.equal(classifyError({ status: 403, message: "Token has expired or is invalid" }), "otp");
    assert.equal(classifyError({ status: 401, message: "Token has expired or is invalid" }), "otp");
    // …sans avaler les vraies erreurs de session ni de droits.
    assert.equal(classifyError({ status: 403, message: "x" }), "forbidden");
    assert.equal(classifyError({ message: "JWT expired" }), "auth");
    assert.equal(classifyError({ message: "Invalid Refresh Token: Refresh Token Not Found", status: 400 }), "auth");
  });

  test("code saisi incomplet (jamais envoyé au serveur) : « code_format »", () => {
    assert.equal(classifyError(Object.assign(new Error("Code incomplet"), { code: "code_format" })), "code_format");
  });

  test("fonction absente (migration pas appliquée) : « missing_function »", () => {
    assert.equal(classifyError({ code: "PGRST202", message: "Could not find the function public.publish_snapshot(p_snapshot) in the schema cache" }), "missing_function");
    assert.equal(classifyError({ code: "42883", message: "function publish_snapshot(jsonb) does not exist" }), "missing_function");
  });

  test("erreur du serveur : « server » ; le reste (contrainte, donnée) : « unknown »", () => {
    assert.equal(classifyError({ status: 500, message: "x" }), "server");
    assert.equal(classifyError({ status: 503, message: "x" }), "server");
    assert.equal(classifyError({ code: "23505", message: "duplicate key value violates unique constraint" }), "unknown");
    assert.equal(classifyError({ code: "P0001", message: "Code invalide ou expiré" }), "unknown");
    assert.equal(classifyError({ code: "57014", message: "canceling statement due to statement timeout" }), "unknown", "le serveur a répondu : ce n'est pas le réseau");
    assert.equal(classifyError(null), "unknown");
    assert.equal(classifyError("texte"), "unknown");
  });
});

describe("describeError (messages du parent)", () => {
  test("serveur injoignable : message clair, rien de technique", () => {
    const e = describeError(new TypeError("Failed to fetch"));
    assert.equal(e.kind, "network");
    assert.equal(e.title, "Impossible de joindre le serveur");
    assert.equal(e.detail, "");
    assert.match(e.text, /connexion/);
  });

  test("session expirée : invite à se reconnecter", () => {
    const e = describeError({ code: "PGRST301", message: "JWT expired" });
    assert.equal(e.kind, "auth");
    assert.match(e.text, /Reconnecte-toi/);
  });

  test("erreur inconnue : message générique + détail technique tronqué à recopier pour le staff", () => {
    const e = describeError({ code: "XX000", message: "x".repeat(1000) });
    assert.equal(e.kind, "unknown");
    assert.equal(e.detail.length, 300);
    assert.match(e.text, /préviens le staff/);
  });

  test("code ou lien refusé : dit que le code est périmé/déjà utilisé et propose l'issue qui marche (un nouveau code)", () => {
    const e = describeError({ status: 403, code: "otp_expired", message: "Email link is invalid or has expired" });
    assert.equal(e.kind, "otp");
    assert.equal(e.title, "Ce code ou ce lien n'est plus valable");
    assert.match(e.text, /expiré ou .* déjà été utilisé/);
    assert.match(e.text, /messageries ouvrent les liens/, "explique pourquoi un lien neuf peut déjà être consommé");
    assert.match(e.text, /nouveau code/);
    assert.match(e.text, /dernier e-mail/);
    assert.equal(e.detail, "", "rien de technique à recopier");
  });

  test("code incomplet : message court", () => {
    const e = describeError(Object.assign(new Error("Code incomplet : saisis les 6 chiffres reçus par e-mail."), { code: "code_format" }));
    assert.equal(e.kind, "code_format");
    assert.match(e.text, /6 chiffres/);
  });

  test("« trop de demandes » : trois situations, trois messages", () => {
    // 1. Un e-mail vient d'être envoyé à cette adresse (une demande par minute) : on dit de saisir son code.
    const wait = describeError({ status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 52 seconds." });
    assert.equal(wait.kind, "rate_limit");
    assert.equal(wait.title, "Un e-mail vient déjà de t'être envoyé");
    assert.match(wait.text, /52 secondes/);
    assert.match(wait.text, /saisis le code reçu/);
    assert.match(describeError({ status: 429, message: "you can only request this after 1 second." }).text, /dans 1 seconde\./);
    // 2. Plafond horaire d'e-mails du portail : pas la faute du parent, inutile de redemander dans la minute.
    const hourly = describeError({ status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" });
    assert.equal(hourly.title, "Beaucoup de connexions en ce moment");
    assert.match(hourly.text, /dans une heure/);
    // 3. Autre plafond : message générique d'avant.
    assert.equal(describeError({ status: 429, message: "x" }).title, "Trop de demandes");
  });

  test("aucun message ne laisse passer une clé technique ou l'anglais du serveur", () => {
    for (const err of [new TypeError("Failed to fetch"), { status: 429, message: "email rate limit exceeded" }, { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" }, { status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 52 seconds." }, { status: 403, code: "otp_expired", message: "Token has expired or is invalid" }, { status: 403, message: "permission denied" }, { status: 500, message: "boom" }]) {
      const e = describeError(err);
      assert.doesNotMatch(`${e.title} ${e.text}`, /fetch|rate limit|permission|boom|JWT/i);
    }
  });
});
