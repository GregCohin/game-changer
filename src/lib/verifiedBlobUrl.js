// Télécharge un fichier distant ET vérifie son empreinte avant de le laisser s'exécuter.
//
// Pourquoi : le moteur vidéo (ffmpeg-core : un script et ~32 Mo de WebAssembly) est téléchargé à la
// demande depuis un CDN public (unpkg) et s'exécute DANS notre page, avec accès à tout le localStorage
// (données des joueurs, session Supabase du staff). La version est épinglée dans l'adresse, mais seule
// l'empreinte garantit le contenu : si le CDN était compromis ou usurpé, un fichier modifié s'exécuterait
// ici. C'est le principe de l'attribut `integrity` d'une balise <script> (« Subresource Integrity »),
// que l'on ne peut pas utiliser tel quel puisque ces fichiers passent par fetch puis une URL blob:.
//
// Aucune dépendance, utilisable sous Node (tests) comme dans le navigateur. Une empreinte se calcule
// ainsi : `echo sha384-$(openssl dgst -sha384 -binary fichier | openssl base64 -A)`.

const ALGORITHM = "SHA-384";
const PREFIX = "sha384-";

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// Empreinte « sha384-<base64> » d'un ArrayBuffer (ou d'une vue typée).
export async function integrityOf(buffer, subtle = globalThis.crypto && globalThis.crypto.subtle) {
  if (!subtle) {
    throw new Error("Vérification impossible : la page n'est pas servie en HTTPS (API de chiffrement du navigateur absente), le fichier n'est pas exécuté.");
  }
  return PREFIX + toBase64(new Uint8Array(await subtle.digest(ALGORITHM, buffer)));
}

// Télécharge `url` et ne rend les octets que s'ils correspondent exactement à `expectedIntegrity`.
// `fetchImpl` et `subtle` ne servent qu'aux tests.
export async function fetchVerified(url, expectedIntegrity, { fetchImpl = globalThis.fetch && globalThis.fetch.bind(globalThis), subtle } = {}) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Téléchargement impossible (HTTP ${response.status}) : ${url}`);
  const buffer = await response.arrayBuffer();
  const actual = await integrityOf(buffer, subtle);
  if (actual !== expectedIntegrity) {
    throw new Error(`Le fichier téléchargé ne correspond pas à l'empreinte attendue : il n'est pas exécuté, par sécurité (${url}).`);
  }
  return buffer;
}

// Comme `toBlobURL` de @ffmpeg/util, mais vérifié : renvoie une URL blob: du fichier si, et seulement si,
// son empreinte est la bonne.
export async function toVerifiedBlobURL(url, mimeType, expectedIntegrity, options) {
  const buffer = await fetchVerified(url, expectedIntegrity, options);
  return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
}
