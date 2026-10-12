// Premiers tests automatiques du projet : les dates (heure d'été / d'hiver, minuit).
// Lancer avec `npm test` (fixe TZ=Europe/Paris ; les cas sensibles au fuseau règlent aussi
// process.env.TZ eux-mêmes). Aucune dépendance : node:test, fourni avec Node.
//
// Ces tests rejouent les défauts trouvés à l'audit du 07/10/2026 :
//  - todayIso() renvoyait la veille entre minuit et 1 h/2 h du matin (date UTC) ;
//  - un événement hebdomadaire créé en hiver tombait un jour plus tôt après le passage à l'heure
//    d'été (28/03/2027) ; addDays(+15) donnait le 03/04 au lieu du 04/04 ;
//  - les fenêtres glissantes (ACWR, charge hebdomadaire, jours restants d'une blessure, règle des
//    3 cartons jaunes) se décalaient d'un jour autour d'un changement d'heure.
// Les fonctions de lib/utils.js sont importées pour de vrai ; celles qui vivent encore dans
// src/App.jsx sont extraites du fichier source tel quel (pas recopiées) puis exécutées.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.TZ = "Europe/Paris";

const utils = await import("../src/lib/utils.js");
const { todayIso, dateIsoLocal, addDaysIso, addMonthsIso, diffDaysIso, occurrenceDatesIso } = utils;

// ---- Outils de test ----------------------------------------------------------------------------

// Exécute fn() avec « maintenant » figé à l'instant donné (ISO avec Z).
function withNow(instantIso, fn) {
  const RealDate = Date;
  const fixed = new RealDate(instantIso).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
    static now() { return fixed; }
  };
  try { return fn(); } finally { globalThis.Date = RealDate; }
}

function withTimeZone(tz, fn) {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally { process.env.TZ = before; }
}

// Jour de la semaine d'une date AAAA-MM-JJ (0 = dimanche, 3 = mercredi), indépendant du fuseau.
const weekday = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();

// Extrait des fonctions de premier niveau de src/App.jsx et les évalue avec les helpers de dates.
function loadAppFunctions(names) {
  const src = fs.readFileSync(path.join(ROOT, "src/App.jsx"), "utf8");
  const texts = names.map((name) => {
    const start = src.indexOf(`\nfunction ${name}(`);
    assert.ok(start >= 0, `fonction ${name} introuvable dans src/App.jsx (renommée ou déplacée ?)`);
    const open = src.indexOf("{", src.indexOf(")", start));
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(start + 1, i + 1);
    }
    assert.fail(`accolade fermante de ${name} introuvable`);
  });
  return new Function(
    "deps",
    `const { todayIso, addDaysIso, addMonthsIso, diffDaysIso, occurrenceDatesIso } = deps;\n${texts.join("\n")}\nreturn { ${names.join(", ")} };`,
  )(utils);
}

const app = loadAppFunctions([
  "buildEventOccurrenceDates", "detectYellowCardSuspensions", "daysRemaining",
  "dailyAverageLoad", "computeACWR", "computeWeeklyCollectiveLoad",
]);

// ---- todayIso / dateIsoLocal -------------------------------------------------------------------

test("todayIso : la date locale, jamais la veille après minuit (Paris)", () => {
  const cas = [
    ["2026-07-14T22:30:00Z", "2026-07-15"], // 00:30 en été (UTC+2)
    ["2026-12-14T23:30:00Z", "2026-12-15"], // 00:30 en hiver (UTC+1)
    ["2026-12-15T22:59:00Z", "2026-12-15"], // 23:59 en hiver
    ["2027-03-27T23:30:00Z", "2027-03-28"], // 00:30 le jour du passage à l'heure d'été
    ["2027-03-28T00:30:00Z", "2027-03-28"], // 01:30, juste avant le saut 02:00 -> 03:00
    ["2026-10-25T00:30:00Z", "2026-10-25"], // 02:30 le jour du passage à l'heure d'hiver
  ];
  for (const [instant, attendu] of cas) {
    assert.equal(withNow(instant, () => todayIso()), attendu, `à ${instant}`);
  }
});

test("dateIsoLocal : un horodatage de 00:30 locale reste le même jour ; une date invalide donne ''", () => {
  assert.equal(dateIsoLocal(new Date("2026-12-14T23:30:00Z")), "2026-12-15");
  assert.equal(dateIsoLocal(new Date("2026-12-14T23:30:00Z").getTime()), "2026-12-15");
  assert.equal(dateIsoLocal(new Date("n'importe quoi")), "");
  assert.equal(withNow("2026-12-14T23:30:00Z", () => dateIsoLocal()), "2026-12-15"); // sans argument = maintenant
});

// ---- addDaysIso / addMonthsIso / diffDaysIso ---------------------------------------------------

test("addDaysIso : traverse les changements d'heure sans glisser d'un jour", () => {
  assert.equal(addDaysIso("2027-03-20", 15), "2027-04-04"); // l'ancien addDays donnait 2027-04-03
  assert.equal(addDaysIso("2027-03-27", 1), "2027-03-28");
  assert.equal(addDaysIso("2027-03-28", 1), "2027-03-29");
  assert.equal(addDaysIso("2026-10-24", 1), "2026-10-25");
  assert.equal(addDaysIso("2026-10-25", 1), "2026-10-26");
  assert.equal(addDaysIso("2026-10-28", -6), "2026-10-22"); // l'ancien code donnait 2026-10-21
  assert.equal(addDaysIso("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysIso("2028-02-28", 1), "2028-02-29");
  assert.equal(addDaysIso("2027-02-28", 1), "2027-03-01");
  assert.equal(addDaysIso("2027-03-20", 0), "2027-03-20");
});

test("addDaysIso : un jour de plus, 400 fois de suite, sans trou ni doublon (deux changements d'heure inclus)", () => {
  let day = "2026-09-01";
  for (let i = 0; i < 400; i++) {
    const next = addDaysIso(day, 1);
    assert.equal(diffDaysIso(next, day), 1, `${day} -> ${next}`);
    day = next;
  }
  assert.equal(day, "2027-10-06");
});

test("addDaysIso / addMonthsIso / diffDaysIso : entrée invalide -> '' ou NaN, jamais d'exception", () => {
  for (const mauvais of ["", undefined, null, "pas une date", "2027-3-20"]) {
    assert.equal(addDaysIso(mauvais, 3), "");
    assert.equal(addMonthsIso(mauvais, 3), "");
    assert.ok(Number.isNaN(diffDaysIso(mauvais, "2027-01-01")));
  }
  assert.equal(addDaysIso("2027-03-20", "abc"), "2027-03-20");
});

test("décalages absurdes (saisie fautive) : '' plutôt qu'une exception ou une date en vrac", () => {
  assert.equal(addDaysIso("2027-01-01", 1e12), "");
  assert.equal(addDaysIso("2027-01-01", -1e12), "");
  assert.equal(addDaysIso("9999-12-31", 1), ""); // l'an 10000 n'est pas une date AAAA-MM-JJ
  assert.equal(addMonthsIso("2027-01-01", 1e9), "");
  assert.equal(addMonthsIso("2027-01-01", -1e9), "");
  assert.deepEqual(occurrenceDatesIso("9999-12-17", "9999-12-31", "weekly"), ["9999-12-17", "9999-12-24", "9999-12-31"]);
  assert.deepEqual(occurrenceDatesIso("9999-12-25", "9999-12-31", "weekly"), ["9999-12-25"]);
});

test("addMonthsIso : le jour absent du mois d'arrivée devient le dernier jour du mois", () => {
  assert.equal(addMonthsIso("2027-01-31", 1), "2027-02-28");
  assert.equal(addMonthsIso("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonthsIso("2027-01-31", 2), "2027-03-31");
  assert.equal(addMonthsIso("2026-11-30", 3), "2027-02-28");
  assert.equal(addMonthsIso("2027-01-15", 3), "2027-04-15");
  assert.equal(addMonthsIso("2027-03-31", -1), "2027-02-28");
  assert.equal(addMonthsIso("2027-01-15", -12), "2026-01-15");
  assert.equal(addMonthsIso("2027-01-15", 12), "2028-01-15");
});

test("diffDaysIso : jours entiers, même à cheval sur un changement d'heure", () => {
  assert.equal(diffDaysIso("2026-10-30", "2026-10-25"), 5);
  assert.equal(diffDaysIso("2027-04-04", "2027-03-20"), 15);
  assert.equal(diffDaysIso("2027-03-20", "2027-04-04"), -15);
  assert.equal(diffDaysIso("2027-05-01", "2027-05-01"), 0);
});

// ---- Événements récurrents ---------------------------------------------------------------------

test("événement hebdomadaire créé en hiver : reste un mercredi après le 28/03/2027", () => {
  const dates = occurrenceDatesIso("2027-01-13", "2027-06-30", "weekly");
  assert.equal(dates.length, 25);
  assert.ok(dates.every((d) => weekday(d) === 3), `jours de semaine : ${[...new Set(dates.map(weekday))]}`);
  assert.ok(dates.includes("2027-03-31") && dates.includes("2027-04-07"));
  assert.equal(dates.at(-1), "2027-06-30");
});

test("événement hebdomadaire créé en automne : reste un mercredi toute la saison", () => {
  const dates = occurrenceDatesIso("2026-09-16", "2027-06-30", "weekly");
  assert.equal(dates.length, 42);
  assert.ok(dates.every((d) => weekday(d) === 3));
});

test("récurrence mensuelle : pas de dérive vers le 3 du mois quand le 31 n'existe pas", () => {
  assert.deepEqual(
    occurrenceDatesIso("2027-01-31", "2027-06-30", "monthly"),
    ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30"],
  );
  assert.deepEqual(occurrenceDatesIso("2027-01-15", "2027-03-15", "monthly"), ["2027-01-15", "2027-02-15", "2027-03-15"]);
});

test("récurrence : garde-fou à 104 occurrences, dates invalides -> la date de départ seule", () => {
  assert.equal(occurrenceDatesIso("2027-01-13", "2040-01-01", "weekly").length, 104);
  assert.deepEqual(occurrenceDatesIso("2027-01-13", "2026-01-01", "weekly"), ["2027-01-13"]); // fin avant début
  assert.deepEqual(occurrenceDatesIso("2027-01-13", "", "weekly"), ["2027-01-13"]);
  assert.deepEqual(occurrenceDatesIso("2027-01-13", "2027-01-13", "weekly"), ["2027-01-13"]);
});

test("buildEventOccurrenceDates (App.jsx) : sans récurrence = une seule date ; avec = les mercredis jusqu'à fin juin", () => {
  assert.deepEqual(app.buildEventOccurrenceDates({ date: "2027-01-13", recurrence: { enabled: false } }), ["2027-01-13"]);
  assert.deepEqual(app.buildEventOccurrenceDates({ date: "2027-01-13" }), ["2027-01-13"]);
  const dates = app.buildEventOccurrenceDates({ date: "2027-01-13", recurrence: { enabled: true, frequency: "weekly", until: "2027-06-30" } });
  assert.equal(dates.length, 25);
  assert.ok(dates.every((d) => weekday(d) === 3));
});

// ---- Règles métier d'App.jsx qui comptent des jours --------------------------------------------

test("règle des 3 cartons jaunes : la date du 3e carton à J+3 mois pile compte, la suspension démarre J+15 sans décalage", () => {
  // 15/01 + 3 mois = 15/04 : le 3e carton ce jour-là est dans la fenêtre (l'ancien code le sortait).
  const t = app.detectYellowCardSuspensions(["2027-01-15", "2027-02-20", "2027-04-15"]);
  assert.equal(t.length, 1);
  assert.equal(t[0].thirdCardDate, "2027-04-15");
  assert.equal(t[0].suspensionStart, "2027-04-30");
  // Un jour trop tard : hors fenêtre, pas de suspension.
  assert.deepEqual(app.detectYellowCardSuspensions(["2027-01-15", "2027-02-20", "2027-04-16"]), []);
  // J+15 à cheval sur le passage à l'heure d'été : 20/03 + 15 jours = 04/04 (l'ancien code : 03/04).
  const u = app.detectYellowCardSuspensions(["2027-03-01", "2027-03-10", "2027-03-20"]);
  assert.equal(u[0].suspensionStart, "2027-04-04");
});

test("jours restants d'une blessure : un nombre entier exact, même à cheval sur le passage à l'heure d'hiver", () => {
  const blessure = { dateDebut: "2026-10-20", dureeEstimeeJours: 14 }; // fin estimée : 03/11/2026
  assert.equal(withNow("2026-10-20T10:00:00Z", () => app.daysRemaining(blessure)), 14);
  assert.equal(withNow("2026-10-25T12:00:00Z", () => app.daysRemaining(blessure)), 9); // l'ancien code affichait 10
  assert.equal(withNow("2026-11-03T12:00:00Z", () => app.daysRemaining(blessure)), 0);
  assert.equal(withNow("2026-11-05T12:00:00Z", () => app.daysRemaining(blessure)), -2);
  assert.ok(Number.isNaN(app.daysRemaining({ dureeEstimeeJours: 14 })));
});

test("charge moyenne (ACWR) : le bord de la fenêtre glissante ne se décale pas autour d'un changement d'heure", () => {
  const log = [
    { playerId: "p1", date: "2026-10-21", rpe: 8 }, // exactement 7 jours avant : exclu (fenêtre ]cutoff, asOf])
    { playerId: "p1", date: "2026-10-22", rpe: 4 },
    { playerId: "p1", date: "2026-10-28", rpe: 6 },
    { playerId: "p2", date: "2026-10-28", rpe: 9 },
  ];
  // l'ancien code incluait le 21/10 (moyenne 6) quand l'heure d'été -> d'hiver tombait dans la fenêtre
  assert.equal(app.dailyAverageLoad("p1", log, "2026-10-28", 7), 5);
  assert.equal(app.dailyAverageLoad("nobody", log, "2026-10-28", 7), null);
  assert.equal(app.computeACWR("nobody", log, "2026-10-28"), null);
});

test("charge collective hebdomadaire : aucune journée perdue, libellés de semaine exacts autour d'un changement d'heure", () => {
  const log = [
    { playerId: "p2", date: "2027-03-26", rpe: 4 },
    { playerId: "p1", date: "2027-03-27", rpe: 6 }, // premier jour de la semaine la plus récente (l'ancien code le perdait)
    { playerId: "p1", date: "2027-04-02", rpe: 8 },
  ];
  const [ancienne, recente] = app.computeWeeklyCollectiveLoad(log, "2027-04-02", 2);
  assert.deepEqual([ancienne.weekStart, ancienne.weekEnd], ["2027-03-20", "2027-03-26"]);
  assert.deepEqual([recente.weekStart, recente.weekEnd], ["2027-03-27", "2027-04-02"]);
  assert.equal(ancienne.totalLoad, 4);
  assert.equal(recente.totalLoad, 14);
  assert.equal(recente.playersInvolved, 1);

  // Dernier jour d'été -> hiver : l'ancien code annonçait « 2026-10-21 » au lieu de « 2026-10-22 ».
  const [semaine] = app.computeWeeklyCollectiveLoad([], "2026-10-28", 1);
  assert.deepEqual([semaine.weekStart, semaine.weekEnd], ["2026-10-22", "2026-10-28"]);
});

// ---- Indépendance vis-à-vis du fuseau ----------------------------------------------------------

test("les helpers de dates donnent les mêmes résultats dans tous les fuseaux (Paris, UTC, New York, Tokyo, Auckland, Lord Howe)", () => {
  const fuseaux = { "Europe/Paris": -60, UTC: 0, "America/New_York": 300, "Asia/Tokyo": -540, "Pacific/Auckland": -780, "Australia/Lord_Howe": -660 };
  for (const [tz, decalageJanvier] of Object.entries(fuseaux)) {
    withTimeZone(tz, () => {
      // le changement de fuseau a bien eu lieu (sinon ce test ne prouverait rien)
      assert.equal(new Date("2026-01-15T12:00:00Z").getTimezoneOffset(), decalageJanvier, tz);
      assert.equal(addDaysIso("2027-03-20", 15), "2027-04-04", tz);
      assert.equal(addDaysIso("2026-10-28", -6), "2026-10-22", tz);
      assert.equal(addMonthsIso("2027-01-31", 1), "2027-02-28", tz);
      assert.equal(diffDaysIso("2027-04-04", "2027-03-20"), 15, tz);
      assert.deepEqual(occurrenceDatesIso("2027-01-13", "2027-06-30", "weekly").map(weekday), Array(25).fill(3), tz);
    });
  }
});

test("todayIso suit l'horloge locale de chaque fuseau (même instant, jour différent selon l'endroit)", () => {
  const instant = "2026-12-14T23:30:00Z";
  const attendu = { "Europe/Paris": "2026-12-15", UTC: "2026-12-14", "America/New_York": "2026-12-14", "Asia/Tokyo": "2026-12-15" };
  for (const [tz, jour] of Object.entries(attendu)) {
    withTimeZone(tz, () => assert.equal(withNow(instant, () => todayIso()), jour, tz));
  }
});

// ---- Garde-fou : le piège ne doit pas revenir --------------------------------------------------

test("aucun `toISOString().slice(0, 10)` dans src/ en dehors de lib/utils.js (utiliser todayIso / dateIsoLocal / addDaysIso)", () => {
  const interdit = /toISOString\(\)\s*\.\s*(?:slice|substring)\(\s*0\s*,\s*10\s*\)|toISOString\(\)\s*\.\s*split\(\s*["']T["']\s*\)\s*\[\s*0\s*\]/;
  const fichiers = [];
  (function parcourir(dir) {
    for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
      const chemin = path.join(dir, entree.name);
      if (entree.isDirectory()) parcourir(chemin);
      else if (/\.(js|jsx)$/.test(entree.name)) fichiers.push(chemin);
    }
  })(path.join(ROOT, "src"));
  const fautifs = [];
  for (const f of fichiers) {
    if (path.relative(ROOT, f) === path.join("src", "lib", "utils.js")) continue;
    fs.readFileSync(f, "utf8").split("\n").forEach((ligne, i) => {
      if (interdit.test(ligne)) fautifs.push(`${path.relative(ROOT, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(
    fautifs, [],
    "Date UTC au lieu de la date locale (la veille après minuit, un jour de décalage après un changement d'heure) — " +
      "utilise todayIso(), dateIsoLocal(date) ou addDaysIso(iso, n) de src/lib/utils.js : " + fautifs.join(", "),
  );
});
