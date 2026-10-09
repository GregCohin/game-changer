// Code d'invitation d'un parent : tiré côté staff, vérifié par la base (supabase/migrations/…_securite_portail.sql).
// L'alphabet n'a ni 0/O ni 1/I (codes recopiés à la main depuis un message) : 32 symboles. Le format est imposé
// aussi par la contrainte player_invitation_codes_code_format (8 à 16 caractères de cet alphabet) — un code qui
// ne le respecterait pas serait refusé à l'enregistrement. tests/invitationCode.test.mjs vérifie l'accord.
export const INVITATION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITATION_CODE_LENGTH = 10; // 32^10 ≈ 1,1·10^15 combinaisons

export function randomInvitationCode(length = INVITATION_CODE_LENGTH, cryptoSource = globalThis.crypto) {
  // Générateur cryptographique, jamais Math.random. 32 symboles = 5 bits : « octet & 31 » est uniforme
  // (aucun biais de modulo).
  const bytes = new Uint8Array(length);
  cryptoSource.getRandomValues(bytes);
  return Array.from(bytes, (b) => INVITATION_CODE_ALPHABET[b & 31]).join("");
}
