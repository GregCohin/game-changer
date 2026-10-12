// Chiffrement optionnel des sauvegardes (WebCrypto, rien d'autre : aucune dépendance).
//
// Pourquoi : la sauvegarde complète contient des fiches santé et des blessures de MINEURS, des
// contacts d'urgence, la discipline, la protection de l'enfance… en JSON lisible. Un fichier laissé
// dans « Téléchargements » ou envoyé par mail expose tout cela. Avec une phrase secrète, le fichier
// n'est lisible que par qui la connaît.
//
// Construction : phrase secrète → clé AES-256 par PBKDF2-SHA-256 (600 000 itérations, valeur
// recommandée par l'OWASP en 2023, sel aléatoire de 16 octets) → chiffrement AES-GCM (nonce de 12
// octets, authentifié : une phrase fausse ou un fichier abîmé est détecté, jamais lu de travers).
// Les paramètres de l'en-tête (format, version, itérations) sont liés au chiffré comme « données
// additionnelles » : modifier l'en-tête invalide le fichier.
//
// ATTENTION produit : il n'existe aucun moyen de récupérer une sauvegarde chiffrée si la phrase est
// perdue — ni pour l'auteur de l'app, ni pour le club. C'est dit à l'écran, avant l'export.

export const BACKUP_APP = "game-changer";
export const ENCRYPTED_FORMAT = "game-changer-backup-encrypted";
export const ENCRYPTED_VERSION = 2;
export const PBKDF2_ITERATIONS = 600000;
export const MAX_PBKDF2_ITERATIONS = 5000000; // un fichier forgé ne doit pas pouvoir figer le navigateur
export const MIN_PASSPHRASE_LENGTH = 8;

// Erreur lisible par l'utilisateur (message en français). `code` : "wrong-passphrase", "unsupported",
// "invalid", "too-new", "no-room"… pour que l'interface puisse réagir sans lire le message.
export class BackupError extends Error {
  constructor(message, code = "invalid") {
    super(message);
    this.name = "BackupError";
    this.code = code;
  }
}

// Une phrase saisie sur un clavier Mac (é en deux caractères) et sur un PC (é en un) doit donner la
// même clé : normalisation NFC avant dérivation.
export function normalizePassphrase(passphrase) {
  return String(passphrase == null ? "" : passphrase).normalize("NFC");
}

export function isEncryptedEnvelope(value) {
  return !!value && typeof value === "object" && value.format === ENCRYPTED_FORMAT;
}

function getSubtle() {
  const subtle = typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) {
    throw new BackupError("Ce navigateur ne permet pas le chiffrement (il faut une page en HTTPS ou localhost, sur un navigateur récent).", "unsupported");
  }
  return subtle;
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(binary);
}
export function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const additionalData = (iterations) => new TextEncoder().encode(`${ENCRYPTED_FORMAT}|${ENCRYPTED_VERSION}|${iterations}`);

async function deriveKey(passphrase, salt, iterations, usage) {
  const subtle = getSubtle();
  const material = await subtle.importKey("raw", new TextEncoder().encode(normalizePassphrase(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, [usage]);
}

// Texte en clair → enveloppe JSON { app, format, version, kdf, cipher, data } (le chiffré en base64).
export async function encryptBackupText(plainText, passphrase, { iterations = PBKDF2_ITERATIONS } = {}) {
  if (normalizePassphrase(passphrase).length < MIN_PASSPHRASE_LENGTH) {
    throw new BackupError(`La phrase secrète doit faire au moins ${MIN_PASSPHRASE_LENGTH} caractères.`, "weak-passphrase");
  }
  const subtle = getSubtle();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations, "encrypt");
  const encrypted = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: additionalData(iterations) }, key, new TextEncoder().encode(plainText));
  return {
    app: BACKUP_APP,
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTED_VERSION,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: bytesToBase64(salt) },
    cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
    data: bytesToBase64(new Uint8Array(encrypted)),
  };
}

// Enveloppe → texte en clair. Lève BackupError("wrong-passphrase") si la phrase est fausse OU si le
// fichier a été modifié : AES-GCM ne permet pas de distinguer les deux, et c'est voulu.
export async function decryptBackupEnvelope(envelope, passphrase) {
  if (!isEncryptedEnvelope(envelope)) throw new BackupError("Ce fichier n'est pas une sauvegarde chiffrée Game Changer.", "invalid");
  if (Number(envelope.version) > ENCRYPTED_VERSION) {
    throw new BackupError("Cette sauvegarde chiffrée vient d'une version plus récente de Game Changer : recharge la page pour mettre l'application à jour, puis réessaie.", "too-new");
  }
  const kdf = envelope.kdf || {};
  const cipher = envelope.cipher || {};
  const iterations = Number(kdf.iterations);
  if (kdf.name !== "PBKDF2" || kdf.hash !== "SHA-256" || cipher.name !== "AES-GCM" || !(iterations >= 1) || iterations > MAX_PBKDF2_ITERATIONS
      || typeof kdf.salt !== "string" || typeof cipher.iv !== "string" || typeof envelope.data !== "string") {
    throw new BackupError("L'en-tête de cette sauvegarde chiffrée est incomplet ou abîmé : le fichier n'a probablement pas été téléchargé en entier.", "invalid");
  }
  const subtle = getSubtle();
  let plain;
  try {
    const key = await deriveKey(passphrase, base64ToBytes(kdf.salt), iterations, "decrypt");
    plain = await subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(cipher.iv), additionalData: additionalData(iterations) }, key, base64ToBytes(envelope.data));
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError("Phrase secrète incorrecte, ou fichier abîmé. Rien n'a été modifié.", "wrong-passphrase");
  }
  return new TextDecoder().decode(plain);
}
