// Tests de « Récupérer les nouveautés » (src/lib/portalPull.js) : pagination, curseur, fusion sans doublon.
//
// Défauts de l'audit du 07/10/2026 (point 3) rejoués ici :
//  - le curseur était l'horloge du navigateur relevée APRÈS la requête : une ligne créée entre les deux, ou
//    avec une horloge en avance, était perdue pour toujours ;
//  - PostgREST plafonne chaque réponse à 1000 lignes ; sans pagination, tout le reste était perdu alors que
//    le curseur avançait quand même.
// Le test d'ensemble simule un « serveur » (table triée, borne `gt`, plafond de lignes) et vérifie qu'aucune
// ligne n'est jamais perdue, quelles que soient les pannes simulées.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  fetchAllPages, latestTimestamp, pullLowerBound, mergePulledUpdates,
  PULL_OVERLAP_MS, PULL_PAGE_SIZE,
} from "../src/lib/portalPull.js";

// Un « serveur » : lignes { id, created_at } ; fetchPage(since) renvoie une fonction (from, to) → { data, error }
// qui applique `created_at > since`, le tri (created_at, id), la fenêtre demandée et un plafond de lignes.
function fakeServer(rows, { cap = 1000 } = {}) {
  const calls = [];
  const query = (since) => async (from, to) => {
    calls.push([from, to]);
    const visible = rows
      .filter((r) => Date.parse(r.created_at) > Date.parse(since))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
    return { data: visible.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { query, calls };
}

const T = (offsetMs) => new Date(Date.UTC(2026, 9, 7, 12, 0, 0) + offsetMs).toISOString();

describe("fetchAllPages", () => {
  test("lit toutes les pages jusqu'à une page vide", async () => {
    const rows = Array.from({ length: 1203 }, (_, i) => ({ id: `r${String(i).padStart(5, "0")}`, created_at: T(i * 1000) }));
    const { query, calls } = fakeServer(rows, { cap: 5000 });
    const got = await fetchAllPages(query("1970-01-01T00:00:00Z"));
    assert.equal(got.length, 1203);
    assert.deepEqual(calls.map(([f]) => f), [0, 500, 1000, 1203], "avance du nombre de lignes reçues, s'arrête à la page vide");
  });

  test("un plafond du serveur plus bas que la taille de page ne fait rien sauter", async () => {
    const rows = Array.from({ length: 450 }, (_, i) => ({ id: `r${String(i).padStart(4, "0")}`, created_at: T(i * 1000) }));
    const { query } = fakeServer(rows, { cap: 100 });
    const got = await fetchAllPages(query("1970-01-01T00:00:00Z"), PULL_PAGE_SIZE);
    assert.equal(got.length, 450);
    assert.equal(new Set(got.map((r) => r.id)).size, 450);
  });

  test("plus de 1000 lignes d'un coup (plafond PostgREST) : toutes sont récupérées", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `r${String(i).padStart(5, "0")}`, created_at: T(i * 1000) }));
    const { query } = fakeServer(rows, { cap: 1000 });
    assert.equal((await fetchAllPages(query("1970-01-01T00:00:00Z"))).length, 2500);
  });

  test("aucune ligne : renvoie une liste vide", async () => {
    assert.deepEqual(await fetchAllPages(async () => ({ data: [], error: null })), []);
    assert.deepEqual(await fetchAllPages(async () => ({ data: null, error: null })), []);
  });

  test("une erreur du serveur est relancée telle quelle", async () => {
    const boom = { message: "boom", code: "XX000" };
    await assert.rejects(fetchAllPages(async () => ({ data: null, error: boom })), (e) => e === boom);
  });

  test("garde-fou : un serveur qui renvoie toujours des lignes ne fait pas boucler sans fin", async () => {
    let n = 0;
    await assert.rejects(fetchAllPages(async () => ({ data: [{ id: `x${n++}` }], error: null }), 10, 5), /Trop de lignes/);
    assert.equal(n, 5);
  });
});

describe("latestTimestamp et pullLowerBound", () => {
  test("garde la chaîne brute du serveur, microsecondes comprises", () => {
    const rows = [{ created_at: "2026-10-07T12:00:00.123456+00:00" }, { created_at: "2026-10-07T12:00:05.654321+00:00" }, { created_at: "2026-10-07T11:59:59.000001+00:00" }];
    assert.equal(latestTimestamp(rows, "created_at"), "2026-10-07T12:00:05.654321+00:00");
  });

  test("sans ligne plus récente, renvoie le curseur précédent (il n'avance jamais à vide)", () => {
    assert.equal(latestTimestamp([], "at", "2026-10-07T12:00:00.000Z"), "2026-10-07T12:00:00.000Z");
    assert.equal(latestTimestamp([{ at: "2026-10-01T00:00:00Z" }], "at", "2026-10-07T12:00:00.000Z"), "2026-10-07T12:00:00.000Z");
    assert.equal(latestTimestamp([], "at"), null);
  });

  test("ignore les valeurs absentes ou illisibles", () => {
    assert.equal(latestTimestamp([{ at: null }, { at: "n'importe quoi" }, { at: 42 }, null], "at"), null);
    assert.equal(latestTimestamp([{ at: "2026-10-07T12:00:00Z" }], "at", "pas une date"), "2026-10-07T12:00:00Z");
  });

  test("la borne basse recule le curseur du recouvrement ; sans curseur, l'origine des temps", () => {
    assert.equal(pullLowerBound(null), "1970-01-01T00:00:00.000Z");
    assert.equal(pullLowerBound("illisible"), "1970-01-01T00:00:00.000Z");
    assert.equal(pullLowerBound("2026-10-07T12:10:00.000Z"), new Date(Date.UTC(2026, 9, 7, 12, 10, 0) - PULL_OVERLAP_MS).toISOString());
    assert.equal(pullLowerBound("1970-01-01T00:01:00.000Z"), "1970-01-01T00:00:00.000Z", "jamais avant l'origine");
  });
});

// Simule plusieurs récupérations successives contre un serveur qui reçoit des lignes entre-temps.
async function pullOnce(server, cursor) {
  const rows = await fetchAllPages(server.query(pullLowerBound(cursor)));
  return { rows, cursor: latestTimestamp(rows, "created_at", cursor) };
}

describe("aucune ligne n'est jamais perdue", () => {
  test("récupérations successives avec des lignes qui arrivent entre deux", async () => {
    const all = [];
    const seen = new Map();
    const add = (id, at) => all.push({ id, created_at: T(at) });
    const server = { query: (since) => fakeServer(all).query(since) };
    let cursor = null;
    const pull = async () => { const r = await pullOnce(server, cursor); cursor = r.cursor; r.rows.forEach((x) => seen.set(x.id, x)); };

    add("a", 1000); add("b", 2000);
    await pull();
    add("c", 3000);
    await pull();
    await pull(); // rien de nouveau : le curseur ne bouge pas
    assert.equal(cursor, T(3000));
    add("d", 4000);
    await pull();
    assert.deepEqual([...seen.keys()].sort(), ["a", "b", "c", "d"]);
  });

  test("une ligne créée AVANT la dernière vue mais validée APRÈS (ordre de validation) est rattrapée", async () => {
    const all = [{ id: "tard", created_at: T(2000) }];
    const server = { query: (since) => fakeServer(all).query(since) };
    const first = await pullOnce(server, null);
    assert.equal(first.cursor, T(2000));
    // « avant » a reçu son horodatage (T(1000)) avant « tard », mais n'est devenue visible qu'après la première récupération.
    all.push({ id: "avant", created_at: T(1000) });
    const second = await pullOnce(server, first.cursor);
    assert.deepEqual(second.rows.map((r) => r.id).sort(), ["avant", "tard"], "le recouvrement relit la fenêtre récente");
    const merged = mergePulledUpdates({ journal: first.rows }, { journalEntries: second.rows });
    assert.equal(merged.added.journal, 1, "seule « avant » est une vraie nouveauté");
  });

  test("beaucoup de lignes d'un coup : le curseur est le dernier horodatage lu, pas l'horloge du navigateur", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `r${String(i).padStart(5, "0")}`, created_at: T(i * 1000) }));
    const server = fakeServer(rows, { cap: 1000 });
    const { rows: got, cursor } = await pullOnce(server, null);
    assert.equal(got.length, 2500);
    assert.equal(cursor, T(2499 * 1000));
    // Une horloge de navigateur en avance de plusieurs jours n'entre pour rien là-dedans : on ne la lit jamais.
    rows.push({ id: "nouvelle", created_at: T(2500 * 1000) });
    assert.deepEqual((await pullOnce(server, cursor)).rows.map((r) => r.id).filter((id) => id === "nouvelle"), ["nouvelle"]);
  });
});

describe("mergePulledUpdates", () => {
  const local = () => ({
    journal: [{ id: "j1", playerId: "p1", date: "2026-10-01", content: "déjà là" }],
    carpoolOffers: [{ id: "o1", driverName: "Marc", passengers: ["Léo Test"] }],
    forumMessages: [{ id: "m1", threadId: "t", content: "déjà là" }],
  });

  test("n'ajoute que les nouveautés et les compte exactement", () => {
    const pulled = {
      journalEntries: [{ id: "j1", content: "dup" }, { id: "j2", playerId: "p1", date: "2026-10-02", content: "nouveau" }],
      carpoolPassengers: [{ offerId: "o1", passengerName: "Léo Test" }, { offerId: "o1", passengerName: "Max Exemple" }, { offerId: "inconnue", passengerName: "Fantôme" }],
      forumMessages: [{ id: "m1", content: "dup" }, { id: "m2", content: "nouveau" }, { id: "m2", content: "dup dans le lot" }],
    };
    const merged = mergePulledUpdates(local(), pulled);
    assert.deepEqual(merged.added, { journal: 1, passengers: 1, messages: 1 });
    assert.deepEqual(merged.journal.map((j) => j.id), ["j1", "j2"]);
    assert.deepEqual(merged.carpoolOffers[0].passengers, ["Léo Test", "Max Exemple"]);
    assert.deepEqual(merged.forumMessages.map((m) => m.id), ["m1", "m2"]);
  });

  test("relire deux fois la même chose ne change rien (idempotent)", () => {
    const pulled = { journalEntries: [{ id: "j2" }], carpoolPassengers: [{ offerId: "o1", passengerName: "Max Exemple" }], forumMessages: [{ id: "m2" }] };
    const once = mergePulledUpdates(local(), pulled);
    const twice = mergePulledUpdates({ journal: once.journal, carpoolOffers: once.carpoolOffers, forumMessages: once.forumMessages }, pulled);
    assert.deepEqual(twice.added, { journal: 0, passengers: 0, messages: 0 });
    assert.deepEqual(twice.journal, once.journal);
  });

  test("ne modifie pas les données reçues en argument", () => {
    const input = local();
    const before = JSON.stringify(input);
    mergePulledUpdates(input, { journalEntries: [{ id: "j9" }], carpoolPassengers: [{ offerId: "o1", passengerName: "Nouveau" }], forumMessages: [{ id: "m9" }] });
    assert.equal(JSON.stringify(input), before);
  });

  test("tolère des données locales vides ou une offre sans liste de passagers", () => {
    const merged = mergePulledUpdates({ carpoolOffers: [{ id: "o1" }] }, { carpoolPassengers: [{ offerId: "o1", passengerName: "Eva" }] });
    assert.deepEqual(merged.carpoolOffers[0].passengers, ["Eva"]);
    assert.deepEqual(mergePulledUpdates({}, {}).added, { journal: 0, passengers: 0, messages: 0 });
  });
});
