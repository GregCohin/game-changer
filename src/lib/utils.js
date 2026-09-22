// Petits utilitaires génériques (date, heure, âge, identifiants) — extrait de App.jsx (séparation
// des fichiers, sans changement de comportement). Aucune dépendance, réutilisable partout.

export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function formatDateFr(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function computeAge(birthDateIso) {
  if (!birthDateIso) return null;
  const birth = new Date(birthDateIso);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Un joueur ou un membre du staff peut avoir un surnom, affiché à la place du nom partout sur le
// site si `displayNickname` est coché sur sa fiche (Effectif / Club → Staff). Le nom complet reste
// toujours la valeur stockée (utilisé pour le tri, l'export, le rapprochement de données externes
// via normalizeNameForMatch) — seul l'affichage change.
export function playerFullName(p) {
  if (p.displayNickname && p.nickname && p.nickname.trim()) return p.nickname.trim();
  if (p.firstName || p.lastName) return `${p.firstName || ""} ${p.lastName || ""}`.trim();
  return p.name || "Sans nom";
}

export function staffFullName(s) {
  if (s.displayNickname && s.nickname && s.nickname.trim()) return s.nickname.trim();
  return `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Sans nom";
}
