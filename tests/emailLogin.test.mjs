// Connexion par e-mail : code à saisir et lien de confirmation (src/lib/emailLogin.js).
// Le cas qui compte : un scanner de messagerie qui ouvre le lien AVANT le parent le consomme (jeton à usage unique).
// Le lien d'un e-mail doit donc mener à une page qui ne vérifie rien tant que la personne n'appuie pas sur un bouton,
// et le code à 6 chiffres doit rester une voie de secours qu'aucun scanner ne peut utiliser.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIRMATION_HASH, normalizeEmailCode, isPlausibleEmailCode, isConfirmationHash, parseConfirmationLink,
  parseAuthRedirectError, rateLimitWaitSeconds, verifyEmailCode, confirmTokenHash,
} from "../src/lib/emailLogin.js";
import { classifyError } from "../src/lib/supabaseErrors.js";
import { describeError } from "../src/parent/lib/errors.js";

// Faux client supabase-js : enregistre les appels à verifyOtp et renvoie ce qu'on lui demande.
function fakeClient(result) {
  const calls = [];
  return {
    calls,
    auth: { verifyOtp: async (params) => { calls.push(params); return typeof result === "function" ? result(params) : result; } },
  };
}
const SESSION = { access_token: "a", refresh_token: "r", user: { id: "u1", email: "parent@example.com" } };
const HASH_56 = "3f0d8c1b2a4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0"; // forme d'un token_hash Supabase (SHA-224 en hexadécimal)

describe("code à saisir", () => {
  test("normalizeEmailCode : ne garde que les chiffres (espaces, tirets, retours à la ligne d'un copier-coller)", () => {
    assert.equal(normalizeEmailCode("123456"), "123456");
    assert.equal(normalizeEmailCode(" 123 456 "), "123456");
    assert.equal(normalizeEmailCode("123-456"), "123456");
    assert.equal(normalizeEmailCode("123\n456 "), "123456");
    assert.equal(normalizeEmailCode("٣٤٥"), "", "chiffres arabes : pas des chiffres pour Supabase");
    assert.equal(normalizeEmailCode(null), "");
    assert.equal(normalizeEmailCode(undefined), "");
  });

  test("isPlausibleEmailCode : 6 à 10 chiffres (longueur réglable côté Supabase)", () => {
    assert.equal(isPlausibleEmailCode("123456"), true);
    assert.equal(isPlausibleEmailCode("1234567890"), true);
    assert.equal(isPlausibleEmailCode("12345"), false);
    assert.equal(isPlausibleEmailCode("12345678901"), false);
    assert.equal(isPlausibleEmailCode("12345a"), false);
    assert.equal(isPlausibleEmailCode(""), false);
  });
});

describe("lien de confirmation", () => {
  test("isConfirmationHash : reconnaît #confirmation et lui seul (jamais le retour d'un ancien lien, ni la page de confidentialité)", () => {
    assert.equal(CONFIRMATION_HASH, "#confirmation");
    assert.equal(isConfirmationHash("#confirmation"), true);
    assert.equal(isConfirmationHash("#confirmation?token_hash=x&type=email"), true);
    assert.equal(isConfirmationHash("#confirmation/?token_hash=x"), true);
    assert.equal(isConfirmationHash("#confidentialite"), false);
    assert.equal(isConfirmationHash("#access_token=abc&type=magiclink"), false, "ancien lien magique : géré par supabase-js, pas par cette page");
    assert.equal(isConfirmationHash("#confirmations"), false);
    assert.equal(isConfirmationHash(""), false);
    assert.equal(isConfirmationHash(null), false);
  });

  test("parseConfirmationLink : adresse non concernée → null (le reste de l'app s'affiche)", () => {
    assert.equal(parseConfirmationLink("", ""), null);
    assert.equal(parseConfirmationLink("#confidentialite", ""), null);
    assert.equal(parseConfirmationLink("#access_token=abc", ""), null);
  });

  test("parseConfirmationLink : la forme exacte des modèles d'e-mail est comprise", () => {
    assert.deepEqual(parseConfirmationLink(`#confirmation?token_hash=${HASH_56}&type=email`), { ok: true, tokenHash: HASH_56, type: "email" });
  });

  test("parseConfirmationLink : « magiclink » et « signup » (anciens noms) sont vérifiés comme « email », qui couvre les deux jetons", () => {
    // Supabase : le type « email » cherche le jeton d'inscription ET le jeton de connexion ; « magiclink » seulement le second,
    // donc un nouveau parent (jeton d'inscription) ne passerait pas avec un lien portant type=magiclink.
    assert.equal(parseConfirmationLink(`#confirmation?token_hash=${HASH_56}&type=magiclink`).type, "email");
    assert.equal(parseConfirmationLink(`#confirmation?token_hash=${HASH_56}&type=signup`).type, "email");
    assert.equal(parseConfirmationLink(`#confirmation?token_hash=${HASH_56}`).type, "email", "type absent : « email »");
    assert.equal(parseConfirmationLink(`#confirmation?token_hash=${HASH_56}&type=EMAIL`).type, "email");
  });

  test("parseConfirmationLink : un jeton « pkce_… » (flux PKCE) passe, un jeton illisible non", () => {
    assert.equal(parseConfirmationLink("#confirmation?token_hash=pkce_8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d&type=email").ok, true);
    for (const bad of ["court", "has space in it and more than sixteen", "<script>alert(1)</script>", "a".repeat(300)]) {
      const r = parseConfirmationLink(`#confirmation?token_hash=${encodeURIComponent(bad)}&type=email`);
      assert.equal(r.ok, false, bad);
      assert.match(r.reason, /lien|code/i);
    }
  });

  test("parseConfirmationLink : lien incomplet ou d'un autre type → message pour l'utilisateur, jamais d'exception", () => {
    const empty = parseConfirmationLink("#confirmation");
    assert.equal(empty.ok, false);
    assert.match(empty.reason, /incomplet/);
    assert.match(empty.reason, /code à 6 chiffres/, "propose la voie de secours");
    const other = parseConfirmationLink(`#confirmation?token_hash=${HASH_56}&type=recovery`);
    assert.equal(other.ok, false, "un lien de réinitialisation de mot de passe n'est pas une connexion");
    assert.equal(parseConfirmationLink(`#confirmation?token_hash=${HASH_56}&type=invite`).ok, false);
    assert.equal(parseConfirmationLink(`#confirmation?token_hash=${HASH_56}&type=email_change`).ok, false);
  });

  test("parseConfirmationLink : lit aussi la partie « recherche » (lien réécrit par un service de protection)", () => {
    assert.equal(parseConfirmationLink("#confirmation", `?token_hash=${HASH_56}&type=email`).ok, true);
  });
});

describe("erreur de retour d'un ancien lien magique", () => {
  test("lien périmé ou déjà consommé par un scanner : l'erreur d'adresse est lue (avant, l'app l'ignorait en silence)", () => {
    const err = parseAuthRedirectError("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    assert.deepEqual(err, { code: "otp_expired", message: "Email link is invalid or has expired" });
    assert.equal(classifyError(err), "otp", "exploitable tel quel par classifyError / describeError");
    assert.equal(describeError(err).title, "Ce code ou ce lien n'est plus valable");
  });

  test("ancien serveur sans error_code : le message suffit pour reconnaître un lien périmé", () => {
    const err = parseAuthRedirectError("#error=access_denied&error_description=Email+link+is+invalid+or+has+expired");
    assert.equal(err.code, "");
    assert.equal(classifyError(err), "otp");
  });

  test("erreur dans la partie « recherche » (flux PKCE) : lue aussi", () => {
    assert.equal(parseAuthRedirectError("", "?error=access_denied&error_code=otp_expired&error_description=x").code, "otp_expired");
  });

  test("rien à signaler → null : retour réussi, lien de confirmation, page de confidentialité, adresse vide", () => {
    assert.equal(parseAuthRedirectError("#access_token=abc&refresh_token=def&type=magiclink"), null);
    assert.equal(parseAuthRedirectError(`#confirmation?token_hash=${HASH_56}&type=email`), null);
    assert.equal(parseAuthRedirectError("#confidentialite"), null);
    assert.equal(parseAuthRedirectError(""), null);
    assert.equal(parseAuthRedirectError(undefined), null);
    assert.equal(parseAuthRedirectError("#access_token=abc&error=bizarre"), null, "un retour qui porte un jeton n'est pas un échec");
  });

  test("une erreur d'un autre genre est lue sans être prise pour un lien périmé", () => {
    const err = parseAuthRedirectError("#error=server_error&error_code=unexpected_failure&error_description=Database+error");
    assert.equal(err.code, "unexpected_failure");
    assert.notEqual(classifyError(err), "otp");
  });
});

describe("vérification (faux client)", () => {
  test("verifyEmailCode : envoie l'adresse sans espaces, le code en chiffres seuls et le type « email » ; renvoie la session", async () => {
    const client = fakeClient({ data: { session: SESSION }, error: null });
    const session = await verifyEmailCode(client, "  parent@example.com ", "123 456");
    assert.equal(session, SESSION);
    assert.deepEqual(client.calls, [{ email: "parent@example.com", token: "123456", type: "email" }]);
  });

  test("verifyEmailCode : un code incomplet est refusé AVANT tout appel réseau (famille « code_format »)", async () => {
    const client = fakeClient({ data: { session: SESSION }, error: null });
    for (const bad of ["", "123", "12345", "abcdef"]) {
      await assert.rejects(() => verifyEmailCode(client, "p@example.com", bad), (e) => e.code === "code_format" && /6 chiffres/.test(e.message));
    }
    assert.equal(client.calls.length, 0);
  });

  test("verifyEmailCode : l'erreur du serveur est relancée telle quelle (le classement se fait plus haut)", async () => {
    const serverError = Object.assign(new Error("Token has expired or is invalid"), { status: 403, code: "otp_expired" });
    const client = fakeClient({ data: { session: null, user: null }, error: serverError });
    await assert.rejects(() => verifyEmailCode(client, "p@example.com", "123456"), (e) => e === serverError);
  });

  test("verifyEmailCode : une réponse sans session n'est jamais prise pour une réussite", async () => {
    const client = fakeClient({ data: { session: null, user: null }, error: null });
    await assert.rejects(() => verifyEmailCode(client, "p@example.com", "123456"), /aucune session/);
    const client2 = fakeClient({ data: null, error: null });
    await assert.rejects(() => verifyEmailCode(client2, "p@example.com", "123456"), /aucune session/);
  });

  test("confirmTokenHash : envoie le jeton et le type, sans adresse e-mail", async () => {
    const client = fakeClient({ data: { session: SESSION }, error: null });
    assert.equal(await confirmTokenHash(client, HASH_56, "email"), SESSION);
    assert.deepEqual(client.calls, [{ token_hash: HASH_56, type: "email" }]);
  });

  test("confirmTokenHash : jeton déjà consommé (scanner) → l'erreur « otp_expired » remonte", async () => {
    const consumed = Object.assign(new Error("Email link is invalid or has expired"), { status: 403, code: "otp_expired" });
    const client = fakeClient({ data: { session: null, user: null }, error: consumed });
    await assert.rejects(() => confirmTokenHash(client, HASH_56, "email"), (e) => e === consumed);
  });
});

describe("rateLimitWaitSeconds", () => {
  test("lit le délai de la réponse « tu ne peux redemander qu'après N secondes »", () => {
    assert.equal(rateLimitWaitSeconds({ message: "For security purposes, you can only request this after 52 seconds." }), 52);
    assert.equal(rateLimitWaitSeconds(new Error("For security purposes, you can only request this after 1 second.")), 1);
    assert.equal(rateLimitWaitSeconds("you can only request this after 9 seconds"), 9);
  });
  test("autres messages (plafond horaire, erreur quelconque, rien) → null", () => {
    assert.equal(rateLimitWaitSeconds({ message: "email rate limit exceeded" }), null);
    assert.equal(rateLimitWaitSeconds({ message: "Request rate limit reached" }), null);
    assert.equal(rateLimitWaitSeconds(null), null);
    assert.equal(rateLimitWaitSeconds(undefined), null);
  });
});
