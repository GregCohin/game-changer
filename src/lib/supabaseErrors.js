// Classe une erreur renvoyée par supabase-js (PostgREST, Auth, ou un `fetch` qui échoue) en quelques
// familles, pour que chaque écran dise la bonne chose au lieu de traiter tout échec pareil.
//
// Pourquoi ce fichier existe (audit du 07/10/2026) : l'app parent transformait TOUTE erreur de
// chargement en « aucun enfant lié » (donc écran du code d'invitation) — un parent dont le serveur est
// en pause ou dont la connexion tombe aurait cru que son compte n'était pas lié. Sans dépendance : il
// est importé par l'app staff ET par l'app parent (bundle indépendant d'App.jsx).
//
// Familles : "network" (le serveur ne répond pas), "auth" (session absente ou expirée), "forbidden"
// (droits refusés), "rate_limit" (trop de demandes), "missing_function" (migration pas appliquée),
// "server" (erreur 5xx), "unknown" (le reste : erreur de donnée, contrainte, etc.).

// (Pas de « timeout » ici : « canceling statement due to statement timeout » est une erreur du serveur
// Postgres — il a répondu —, pas une absence de réseau.)
const NETWORK_RE = /failed to fetch|load failed|networkerror|network request failed|fetch failed|err_name_not_resolved|err_internet_disconnected|err_network_changed|the internet connection appears to be offline|econnrefused|enotfound/i;

export function classifyError(err) {
  if (!err) return "unknown";
  const message = String(err.message ?? err);
  const code = String(err.code ?? "");
  const status = Number(err.status ?? err.statusCode ?? 0);

  // Un `fetch` qui ne joint pas le serveur (hôte introuvable, hors ligne, projet en pause) rejette avec
  // une TypeError ; supabase-js la range dans `message` (« TypeError: Failed to fetch »). Les erreurs
  // d'Auth réessayables (AuthRetryableFetchError) ont le même sens.
  if (NETWORK_RE.test(message) || err.name === "AuthRetryableFetchError" || err.name === "AbortError") return "network";

  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || code === "over_sms_send_rate_limit" || status === 429 || /rate limit|too many requests/i.test(message)) return "rate_limit";
  if (code === "PGRST202" || (code === "42883" && /function/i.test(message)) || /could not find the function/i.test(message)) return "missing_function";
  if (code === "PGRST301" || code === "PGRST302" || code === "PGRST303" || status === 401 || /jwt (expired|invalid)|invalid jwt|invalid refresh token|refresh token not found|not authenticated|auth session missing/i.test(message)) return "auth";
  if (code === "42501" || status === 403 || /row-level security|permission denied/i.test(message)) return "forbidden";
  if (status >= 500) return "server";
  return "unknown";
}
