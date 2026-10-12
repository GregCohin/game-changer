// Message d'invitation d'une famille et compteur d'invitations (src/lib/invitationMessage.js).
// Ce qui compte : rien ne part tout seul ; le texte et les liens construits ne contiennent ni prénom d'enfant ni
// adresse de parent ; une adresse de portail inutilisable chez les familles (localhost…) est refusée ; le compteur
// prévient avant le plafond d'e-mails de connexion au lieu de laisser des parents sans e-mail.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PORTAL_PAGE, INVITATION_LOG_KEY, EMAIL_LIMITS, EMAILS_PER_INVITATION, WAVE_STEPS,
  checkPortalUrl, defaultPortalUrl, formatLongDateFr, composeInvitation, mailtoLink, whatsappLink,
  newInvitationId, parseInvitationLog, recordInvitation, invitationBudget,
} from "../src/lib/invitationMessage.js";
import { randomInvitationCode } from "../src/lib/invitationCode.js";

const NOW = new Date("2026-10-08T10:00:00+02:00");
const PORTAL = "https://football-analysis-ten.vercel.app/parent.html";

describe("adresse du portail", () => {
  test("une adresse sans chemin désigne l'app du staff : on la complète par la page du portail", () => {
    assert.deepEqual(checkPortalUrl("https://football-analysis-ten.vercel.app"), { ok: true, url: PORTAL, problem: "" });
    assert.equal(checkPortalUrl("football-analysis-ten.vercel.app").url, PORTAL, "https:// ajouté");
    assert.equal(checkPortalUrl("  https://football-analysis-ten.vercel.app/  ").url, PORTAL);
    assert.equal(PORTAL_PAGE, "/parent.html");
  });

  test("un chemin choisi par le staff est conservé ; fragment et paramètres sont retirés", () => {
    assert.equal(checkPortalUrl("https://game-changer.fr/parent").url, "https://game-changer.fr/parent");
    assert.equal(checkPortalUrl("https://game-changer.fr/parent.html?x=1#confirmation?token_hash=secret").url, "https://game-changer.fr/parent.html");
  });

  test("adresses qui ne s'ouvriraient pas chez les familles : refusées avec une explication", () => {
    for (const bad of ["http://localhost:5173", "localhost:5173/parent.html", "http://127.0.0.1:5173", "https://192.168.1.20", "https://10.0.0.5/parent.html", "https://172.20.1.1", "https://monpc.local", "https://[::1]:5173", "https://intranet"]) {
      const r = checkPortalUrl(bad);
      assert.equal(r.ok, false, bad);
      assert.equal(r.url, "");
      assert.match(r.problem, /familles|adresse/i, bad);
    }
  });

  test("adresses invalides ou dangereuses : refusées", () => {
    for (const bad of ["", "   ", "javascript:alert(1)", "ftp://exemple.fr/parent.html", "mailto:x@y.fr", "https://user:pass@exemple.fr/", "https://", "pas une adresse", "http://exemple.fr/parent.html"]) {
      assert.equal(checkPortalUrl(bad).ok, false, JSON.stringify(bad));
    }
    assert.match(checkPortalUrl("http://exemple.fr/parent.html").problem, /https/);
    assert.equal(checkPortalUrl(null).ok, false);
    assert.equal(checkPortalUrl(undefined).ok, false);
  });

  test("defaultPortalUrl : l'adresse de la page courante si elle est publique, sinon rien", () => {
    assert.equal(defaultPortalUrl("https://football-analysis-ten.vercel.app"), PORTAL);
    assert.equal(defaultPortalUrl("http://localhost:5173"), "");
    assert.equal(defaultPortalUrl(""), "");
  });
});

describe("texte du message", () => {
  const code = randomInvitationCode();

  test("contient l'adresse, le code, le rappel des indésirables et la consigne de ne pas diffuser", () => {
    const { subject, body } = composeInvitation({ clubName: "AS Exemple", portalUrl: PORTAL, code, now: NOW });
    assert.ok(body.includes(PORTAL));
    assert.ok(body.includes(code));
    assert.match(body, /indésirables \(spam\)/);
    assert.match(body, /non indésirable/);
    assert.match(body, /code à 6 chiffres/);
    assert.match(body, /Ne le diffuse pas, notamment dans un groupe/);
    assert.match(body, /Le club AS Exemple/);
    assert.equal(subject, "Ton accès au portail du club AS Exemple");
  });

  test("sans nom de club : texte neutre, pas de « undefined » ni de double espace", () => {
    const { subject, body } = composeInvitation({ portalUrl: PORTAL, code, now: NOW });
    assert.equal(subject, "Ton accès au portail du club");
    assert.match(body, /Le club ouvre un portail/);
    assert.doesNotMatch(body + subject, /undefined|null|NaN|  /);
  });

  test("le code figure UNE seule fois ; aucune adresse e-mail dans le texte", () => {
    // composeInvitation ne reçoit ni prénom d'enfant ni adresse de parent (voir ses paramètres) : il n'a rien à en fuiter.
    const { body } = composeInvitation({ clubName: "AS Exemple", portalUrl: PORTAL, code, now: NOW });
    assert.equal(body.split(code).length - 1, 1);
    assert.doesNotMatch(body, /@/);
  });

  test("date d'expiration : écrite en toutes lettres, omise si absente, illisible ou déjà passée", () => {
    const withDate = composeInvitation({ portalUrl: PORTAL, code, expiresAt: "2026-10-21T10:00:00+02:00", now: NOW }).body;
    assert.match(withDate, /valable jusqu'au 21 octobre 2026/);
    assert.match(composeInvitation({ portalUrl: PORTAL, code, expiresAt: "2026-11-01T12:00:00+01:00", now: NOW }).body, /jusqu'au 1er novembre 2026/);
    for (const expiresAt of [null, undefined, "", "pas une date", "2026-10-01T10:00:00+02:00"]) {
      const body = composeInvitation({ portalUrl: PORTAL, code, expiresAt, now: NOW }).body;
      assert.doesNotMatch(body, /valable jusqu'au/, String(expiresAt));
      assert.match(body, /Ce code est réservé à ta famille\./);
    }
  });

  test("formatLongDateFr", () => {
    assert.equal(formatLongDateFr("2026-12-25T12:00:00Z"), "25 décembre 2026");
    assert.equal(formatLongDateFr("2027-02-01T12:00:00Z"), "1er février 2027");
    assert.equal(formatLongDateFr(""), "");
    assert.equal(formatLongDateFr("nimporte quoi"), "");
  });

  test("signature facultative, ajoutée en fin de message", () => {
    const body = composeInvitation({ portalUrl: PORTAL, code, signature: "  Gregory, coach U13  ", now: NOW }).body;
    assert.ok(body.endsWith("\n\nGregory, coach U13"));
    assert.ok(!composeInvitation({ portalUrl: PORTAL, code, signature: "   ", now: NOW }).body.endsWith("\n"));
  });

  test("adresse ou code manquant : exception explicite plutôt qu'un message à moitié vide", () => {
    assert.throws(() => composeInvitation({ code }), /Adresse du portail/);
    assert.throws(() => composeInvitation({ portalUrl: PORTAL }), /Code d'invitation/);
  });
});

describe("liens mailto: et WhatsApp", () => {
  const msg = composeInvitation({ clubName: "AS Exemple", portalUrl: PORTAL, code: "ABCD2345EF", now: NOW });

  test("mailto: sans destinataire, objet et corps encodés, retours à la ligne CRLF", () => {
    const link = mailtoLink(msg);
    assert.ok(link.startsWith("mailto:?subject="), "aucune adresse de destinataire dans le lien");
    const params = new URLSearchParams(link.slice("mailto:?".length));
    assert.equal(params.get("subject"), msg.subject);
    assert.equal(params.get("body"), msg.body.replace(/\n/g, "\r\n"));
    assert.doesNotMatch(link, /\+/, "les espaces sont %20 : un « + » serait affiché tel quel dans la messagerie");
    assert.ok(link.length < 1900, `lien trop long pour certains clients de messagerie : ${link.length}`);
  });

  test("WhatsApp : lien wa.me sans numéro, texte encodé tel quel", () => {
    const link = whatsappLink(msg);
    assert.ok(link.startsWith("https://wa.me/?text="));
    assert.equal(decodeURIComponent(link.slice("https://wa.me/?text=".length)), msg.body);
    assert.doesNotMatch(link, /wa\.me\/\d/, "pas de numéro de téléphone");
  });

  test("le code ne passe que dans le texte du message, pas ailleurs dans le lien", () => {
    const link = whatsappLink(msg);
    assert.equal(link.split("ABCD2345EF").length - 1, 1);
  });
});

describe("journal et compteur", () => {
  function fakeStorage(initial = {}, { failOnSet = false } = {}) {
    const m = new Map(Object.entries(initial));
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { if (failOnSet) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" }); m.set(k, String(v)); },
      _m: m,
    };
  }
  const T0 = Date.parse("2026-10-08T10:00:00Z");

  test("newInvitationId : 16 caractères hexadécimaux, différents à chaque appel", () => {
    const a = newInvitationId(), b = newInvitationId();
    assert.match(a, /^[0-9a-f]{16}$/);
    assert.notEqual(a, b);
  });

  test("clés : le journal est propre à l'appareil, l'adresse est commune au club (déclarées dans lib/storage.js et lib/fullBackup.js)", () => {
    assert.equal(INVITATION_LOG_KEY, "tf_portal_invitations_log");
  });

  test("recordInvitation : écrit un événement par action ; plusieurs actions sur le même message = une seule invitation", () => {
    const st = fakeStorage();
    recordInvitation(st, { id: "aaaa", channel: "copy" }, T0);
    recordInvitation(st, { id: "aaaa", channel: "whatsapp" }, T0 + 5000);
    const { events, ok } = recordInvitation(st, { id: "bbbb", channel: "email" }, T0 + 9000);
    assert.equal(ok, true);
    assert.equal(events.length, 3);
    assert.equal(invitationBudget(events, T0 + 10000).lastDay, 2);
    assert.deepEqual(JSON.parse(st._m.get(INVITATION_LOG_KEY)).map((e) => e.channel), ["copy", "whatsapp", "email"]);
  });

  test("le journal ne garde que l'identifiant, l'heure et le canal : aucune donnée personnelle", () => {
    const st = fakeStorage();
    recordInvitation(st, { id: "aaaa", channel: "copy", code: "ABCD2345EF", playerName: "Léo Martin", email: "p@x.fr" }, T0);
    const stored = JSON.parse(st._m.get(INVITATION_LOG_KEY));
    assert.deepEqual(Object.keys(stored[0]).sort(), ["at", "channel", "id"]);
    assert.doesNotMatch(st._m.get(INVITATION_LOG_KEY), /ABCD2345EF|Léo|Martin|@/);
  });

  test("écriture refusée (stockage plein) : ok = false, aucune exception, l'événement reste compté pour cette session", () => {
    const st = fakeStorage({}, { failOnSet: true });
    const r = recordInvitation(st, { id: "aaaa", channel: "copy" }, T0);
    assert.equal(r.ok, false);
    assert.equal(r.events.length, 1);
  });

  test("parseInvitationLog : tolère un texte abîmé, des entrées malformées, et oublie ce qui a plus de 48 h", () => {
    assert.deepEqual(parseInvitationLog(null, T0), []);
    assert.deepEqual(parseInvitationLog("{pas du json", T0), []);
    assert.deepEqual(parseInvitationLog('{"a":1}', T0), []);
    const raw = JSON.stringify([
      { at: T0 - 49 * 3600e3, id: "vieux", channel: "copy" },
      { at: T0 - 3600e3, id: "ok", channel: "bizarre" },
      { at: "hier", id: "mauvaise date", channel: "copy" },
      { at: T0, channel: "copy" },
      null,
      { at: T0 - 60e3, id: "ok2", channel: "whatsapp" },
    ]);
    assert.deepEqual(parseInvitationLog(raw, T0).map((e) => [e.id, e.channel]), [["ok", "copy"], ["ok2", "whatsapp"]]);
  });

  test("le journal est plafonné (500 entrées) : un navigateur qui sert pendant des mois ne le fait pas grossir", () => {
    const st = fakeStorage();
    for (let i = 0; i < 520; i++) recordInvitation(st, { id: "id" + i, channel: "copy" }, T0 + i);
    assert.equal(JSON.parse(st._m.get(INVITATION_LOG_KEY)).length, 500);
  });

  const events = (n, at) => Array.from({ length: n }, (_, i) => ({ at, id: `e${at}-${i}`, channel: "copy" }));

  test("compteur : rien à dire tant qu'aucune invitation n'a été préparée", () => {
    const b = invitationBudget([], T0);
    assert.equal(b.level, "ok");
    assert.equal(b.headline, "");
    assert.equal(b.estimate, "");
    assert.equal(b.advice, "");
  });

  test("compteur : fenêtres glissantes — une heure, vingt-quatre heures", () => {
    const evts = [...events(3, T0 - 30 * 60e3), ...events(4, T0 - 5 * 3600e3), ...events(5, T0 - 25 * 3600e3)];
    const b = invitationBudget(evts, T0);
    assert.equal(b.lastHour, 3);
    assert.equal(b.lastDay, 7);
    assert.equal(b.emailsHour, 3 * EMAILS_PER_INVITATION);
    assert.equal(b.emailsDay, 7 * EMAILS_PER_INVITATION);
    assert.match(b.headline, /7 invitations préparées/);
    assert.match(b.headline, /dont 3 dans la dernière heure/);
    assert.match(b.estimate, /Estimation/);
  });

  test("seuils : ok sous 70 %, avertissement à 70 %, limite à 100 % — par heure (plafond Supabase) et par jour (plafond Resend)", () => {
    assert.equal(EMAIL_LIMITS.perHour, 30);
    assert.equal(EMAIL_LIMITS.perDay, 100);
    // Par jour : 2 e-mails par famille, 100 par jour → limite à 50 invitations, avertissement dès 35 (70 e-mails).
    const day = (n) => invitationBudget(events(n, T0 - 3 * 3600e3), T0);
    assert.equal(day(34).level, "ok");
    assert.equal(day(35).level, "warn");
    assert.equal(day(49).level, "warn");
    assert.equal(day(50).level, "stop");
    // Par heure : 30 par heure → limite à 15 invitations, avertissement dès 11 (22 e-mails ≥ 21).
    const hour = (n) => invitationBudget(events(n, T0 - 60e3), T0);
    assert.equal(hour(10).level, "ok");
    assert.equal(hour(11).level, "warn");
    assert.equal(hour(14).level, "warn");
    assert.equal(hour(15).level, "stop");
  });

  test("conseil adapté au plafond en cause (heure ou jour) et au niveau (avertissement ou limite)", () => {
    const warnHour = invitationBudget(events(11, T0 - 60e3), T0);
    assert.equal(warnHour.limitingWindow, "hour");
    assert.match(warnHour.advice, /plafond horaire.*30 e-mails par heure/);
    const stopHour = invitationBudget(events(15, T0 - 60e3), T0);
    assert.match(stopHour.advice, /Plafond horaire atteint/);
    const warnDay = invitationBudget(events(35, T0 - 3 * 3600e3), T0);
    assert.equal(warnDay.limitingWindow, "day");
    assert.match(warnDay.advice, /plafond quotidien.*100 e-mails par jour/);
    assert.match(warnDay.advice, /Resend/);
    const stopDay = invitationBudget(events(50, T0 - 3 * 3600e3), T0);
    assert.match(stopDay.advice, /Plafond quotidien atteint/);
    assert.match(stopDay.advice, /demain/);
  });

  test("« par vagues » : trois étapes, la première borne le nombre de familles", () => {
    assert.equal(WAVE_STEPS.length, 3);
    assert.match(WAVE_STEPS[0], /dizaine/);
  });
});
