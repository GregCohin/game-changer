// Connexion par e-mail : le code à saisir et le lien de confirmation (portail parent ET écran staff).
//
// Pourquoi ce fichier (audit du 07/10/2026) : le lien magique est à usage unique, et les scanners de
// messagerie (Outlook Safe Links, passerelles de sécurité…) ouvrent chaque lien d'un e-mail AVANT l'utilisateur :
// le jeton est consommé, et le parent voit « lien invalide ou expiré » en cliquant. Deux parades, documentées par
// Supabase (« token consumed by email scanners ») :
//   1. un code à saisir : il n'y a rien à ouvrir, donc rien qu'un scanner puisse consommer ;
//   2. un lien vers NOTRE page (…#confirmation?token_hash=…&type=email) qui ne vérifie le jeton qu'à un APPUI de
//      l'utilisateur sur un bouton : un scanner qui n'exécute pas de JavaScript n'y touche pas, et un scanner qui en
//      exécute ne clique pas.
// Le jeton est dans la partie « # » de l'adresse : elle n'est jamais envoyée au serveur (ni journaux, ni Referer).
//
// Sans dépendance : importé par le bundle parent ET par le bundle staff, et testé sous Node avec un faux client.

export const CONFIRMATION_HASH = "#confirmation";
export const EMAIL_CODE_LENGTH = 6; // longueur par défaut du code Supabase (réglable de 6 à 10 dans le tableau de bord)

// Types de jeton acceptés dans un lien. « magiclink » et « signup » sont d'anciens noms de « email » : Supabase
// range sous « email » aussi bien une connexion qu'une première inscription par code.
const LINK_TYPES = { email: "email", magiclink: "email", signup: "email" };
const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{16,256}$/;

// Ne garde que les chiffres : un code recopié ou collé arrive souvent sous la forme « 123 456 » ou « 123-456 ».
export function normalizeEmailCode(input) {
  return String(input ?? "").replace(/\D/g, "");
}

export function isPlausibleEmailCode(code) {
  return /^\d{6,10}$/.test(code);
}

export function isConfirmationHash(hash) {
  return typeof hash === "string" && (hash === CONFIRMATION_HASH || hash.startsWith(CONFIRMATION_HASH + "?") || hash.startsWith(CONFIRMATION_HASH + "&") || hash.startsWith(CONFIRMATION_HASH + "/"));
}

// Lit un lien de confirmation. Renvoie :
//   null                           si l'adresse n'est pas un lien de confirmation (le reste de l'app s'affiche) ;
//   { ok: true, tokenHash, type }  si le lien est exploitable ;
//   { ok: false, reason }          si c'est un lien de confirmation mais incomplet ou abîmé (« reason » est écrit pour l'utilisateur).
// Les paramètres se lisent après « #confirmation? » (forme des modèles d'e-mail) ; une adresse avec « ?token_hash=… »
// dans la partie recherche est acceptée aussi (liens écrits à la main, ou réécrits par un service de protection).
export function parseConfirmationLink(hash, search = "") {
  if (!isConfirmationHash(hash)) return null;
  const rest = hash.slice(CONFIRMATION_HASH.length).replace(/^[?&/]/, "");
  const params = new URLSearchParams(rest);
  const fromSearch = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const tokenHash = params.get("token_hash") || fromSearch.get("token_hash") || "";
  const rawType = (params.get("type") || fromSearch.get("type") || "email").toLowerCase();
  if (!tokenHash) return { ok: false, reason: "Le lien est incomplet : il ne contient pas le jeton de connexion. Copie-le en entier depuis l'e-mail, ou saisis le code à 6 chiffres." };
  if (!TOKEN_HASH_RE.test(tokenHash)) return { ok: false, reason: "Le lien est abîmé (le jeton de connexion est illisible). Copie-le en entier depuis l'e-mail, ou saisis le code à 6 chiffres." };
  const type = LINK_TYPES[rawType];
  if (!type) return { ok: false, reason: "Ce lien n'est pas un lien de connexion." };
  return { ok: true, tokenHash, type };
}

// Erreur renvoyée par Supabase dans l'adresse quand un ancien lien magique (celui du modèle d'e-mail d'origine, qui
// passe par le serveur Supabase) est périmé ou a déjà été consommé — typiquement par un scanner de messagerie :
//   …/parent.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
// supabase-js l'ignore et laisse l'adresse telle quelle : sans cette lecture, le parent retombait sur l'écran de
// connexion sans aucune explication. Renvoie null s'il n'y a pas d'erreur, sinon { code, message } — de la forme
// des erreurs de supabase-js, donc directement exploitable par classifyError / describeError.
export function parseAuthRedirectError(hash, search = "") {
  const fromHash = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  const fromSearch = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const get = (key) => fromHash.get(key) || fromSearch.get(key) || "";
  if (get("access_token")) return null; // un retour réussi n'a pas d'erreur
  const code = get("error_code");
  const description = get("error_description");
  const error = get("error");
  if (!code && !description && !error) return null;
  return { code, message: description || error || code };
}

// Nombre de secondes à attendre quand le service d'envoi répond « tu ne peux redemander qu'après N secondes »
// (une demande par minute et par adresse) ; null pour tout autre message (par ex. le plafond horaire d'envoi).
export function rateLimitWaitSeconds(err) {
  const m = /after\s+(\d+)\s+seconds?/i.exec(String(err && (err.message ?? err)));
  return m ? Number(m[1]) : null;
}

// Vérifie le code reçu par e-mail et renvoie la session (le client la range lui-même et prévient l'app).
// `client` : un client supabase-js ; `email` : l'adresse à laquelle le code a été envoyé.
export async function verifyEmailCode(client, email, code) {
  const token = normalizeEmailCode(code);
  if (!isPlausibleEmailCode(token)) {
    const err = new Error(`Code incomplet : saisis les ${EMAIL_CODE_LENGTH} chiffres reçus par e-mail.`);
    err.code = "code_format";
    throw err;
  }
  const { data, error } = await client.auth.verifyOtp({ email: String(email || "").trim(), token, type: "email" });
  if (error) throw error;
  if (!data || !data.session) throw new Error("La connexion n'a pas abouti : aucune session reçue.");
  return data.session;
}

// Vérifie le jeton d'un lien de confirmation (à appeler seulement sur un appui de l'utilisateur).
export async function confirmTokenHash(client, tokenHash, type = "email") {
  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) throw error;
  if (!data || !data.session) throw new Error("La connexion n'a pas abouti : aucune session reçue.");
  return data.session;
}
