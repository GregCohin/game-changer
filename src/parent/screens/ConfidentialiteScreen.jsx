import { useState } from "react";
import { useAuth } from "../AuthContext";
import { deleteMyAccount } from "../lib/privacyApi";
import { ErrorNotice, Field, ui, useAsyncAction } from "../ui";

// À RENSEIGNER PAR LE CLUB avant d'inviter les familles. Ne rien inventer : le nom exact du responsable,
// une adresse de contact réellement lue, une durée de conservation réellement décidée. Tant qu'un champ est
// vide, la page affiche « à compléter par le club » (en orange) à sa place.
const CLUB = {
  responsable: "", // ex. nom de l'association qui gère le portail
  editeur: "", // éditeur du site et directeur de la publication (mentions légales)
  contact: "", // adresse e-mail ou postale où exercer ses droits
  conservation: "", // durée de conservation décidée par le club
};

const TODO = <em style={{ color: "#f0b429" }}>à compléter par le club</em>;
const value = (v) => (v && v.trim() ? v.trim() : TODO);

// Texte descriptif du fonctionnement ACTUEL du portail (ce que la base et l'écran font vraiment). Si le
// fonctionnement change (covoiturage, durées…), mettre ce texte à jour dans la foulée.
export function ConfidentialiteScreen({ onBack }) {
  const { session, signOut } = useAuth();
  const [eraseContent, setEraseContent] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [deleted, setDeleted] = useState(false);
  const { run, busy, error } = useAsyncAction();

  async function doDelete() {
    const ok = await run(() => deleteMyAccount({ eraseContent }));
    if (!ok) return;
    setDeleted(true);
    // Le compte n'existe plus : on referme aussi la session de ce navigateur. Un échec ici (réseau, session
    // déjà invalide) ne change rien au fait que le compte est supprimé.
    try { await signOut(); } catch (e) { /* sans importance */ }
  }

  function handleDelete(e) {
    e.preventDefault();
    if (confirmText.trim().toUpperCase() !== "SUPPRIMER") return;
    doDelete();
  }

  if (deleted) {
    return (
      <div style={styles.page}>
        <h1 style={styles.h1}>Compte supprimé</h1>
        <p>
          Ton compte et les données qui y étaient liées ont été supprimés. Tu peux fermer cette page.
          {!eraseContent && " Tes messages et tes notes sont conservés sans plus aucun lien avec toi."}
        </p>
        <p style={styles.muted}>
          Les informations du club sur ton enfant (fiche, objectifs, statistiques) ne dépendent pas de ton compte :
          pour les consulter, les corriger ou les faire effacer, contacte le club.
        </p>
        <button style={styles.back} onClick={onBack}>Retour à l'accueil</button>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <button style={styles.back} onClick={onBack}>← Retour</button>
      <h1 style={styles.h1}>Confidentialité et suppression du compte</h1>

      <section style={styles.section}>
        <h2 style={styles.h2}>À quoi sert ce portail</h2>
        <p>
          Ce portail permet aux familles du club de suivre le jeune joueur lié à leur compte (objectifs, séances,
          matchs, retour au jeu après une blessure, covoiturage, informations du club) et d'échanger avec le staff
          et les autres familles dans le forum. Les données concernent des mineurs : seuls les responsables liés à
          l'enfant par le club y ont accès.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Les données qui te concernent</h2>
        <ul style={styles.list}>
          <li>
            <strong>Ton adresse e-mail.</strong> Elle sert uniquement à te connecter (un lien de connexion t'est envoyé,
            il n'y a pas de mot de passe). Les autres familles ne la voient jamais ; le staff la voit pour savoir quel
            parent est lié à quel enfant.
          </li>
          <li>
            <strong>Ce que tu écris.</strong> Tes messages du forum (signés « Parent de » suivi du prénom de ton enfant),
            tes notes du carnet de bord et tes inscriptions au covoiturage.
          </li>
          <li>
            <strong>Les informations du club sur ton enfant.</strong> Prénom, nom, poste, objectifs de développement,
            séances de l'équipe, statistiques de match et statut de retour au jeu après une blessure. Jamais le
            diagnostic ni le dossier médical.
          </li>
        </ul>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Qui voit quoi</h2>
        <ul style={styles.list}>
          <li>Le staff du club voit tout ce qui est publié sur le portail et tout ce que les parents y écrivent.</li>
          <li>
            Les autres familles de la même équipe voient les messages des sujets de l'équipe et les inscriptions au
            covoiturage, avec le nom de l'enfant inscrit. Elles ne voient ni ton adresse e-mail, ni les objectifs,
            le statut ou le carnet de bord de ton enfant.
          </li>
          <li>Tes notes du carnet de bord sont visibles du staff et des autres parents liés au même enfant.</li>
          <li>Une conversation privée n'est visible que de ses participants.</li>
        </ul>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Où sont les données</h2>
        <p>
          Les données sont enregistrées chez Supabase (base de données hébergée dans la région de Paris). Le site est
          hébergé par Vercel et les e-mails de connexion sont envoyés par Resend. Le portail ne contient ni publicité
          ni outil de mesure d'audience et ne dépose aucun cookie : ton navigateur conserve seulement ta session de
          connexion, jusqu'à ce que tu te déconnectes.
        </p>
        <p>Durée de conservation fixée par le club : {value(CLUB.conservation)}.</p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Tes droits</h2>
        <ul style={styles.list}>
          <li>Tu peux supprimer à tout moment un de tes messages ou une de tes notes : bouton « Supprimer » sous chacun.</li>
          <li>
            Tu peux supprimer ton compte avec le bouton ci-dessous. Cela efface ton adresse e-mail, ton lien avec ton
            enfant et tes inscriptions au covoiturage — et, si tu le demandes, tes messages et tes notes.
          </li>
          <li>
            Pour accéder aux informations du club sur ton enfant, les faire corriger ou effacer, ou pour toute question
            sur tes données : contacte le club ({value(CLUB.contact)}). Tu peux aussi saisir la CNIL (cnil.fr).
          </li>
        </ul>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Responsable et mentions légales</h2>
        <p>Responsable du traitement : {value(CLUB.responsable)}.</p>
        <p>Éditeur du site et directeur de la publication : {value(CLUB.editeur)}.</p>
        <p>Hébergement du site : Vercel Inc. (coordonnées {TODO}). Base de données : Supabase, région de Paris.</p>
      </section>

      {session && (
        <section style={styles.danger}>
          <h2 style={styles.h2}>Supprimer mon compte</h2>
          <p>
            Cette action est définitive. Ton adresse e-mail, ton lien avec ton enfant et tes inscriptions au covoiturage
            seront effacés, et tu seras déconnecté.
          </p>
          <form onSubmit={handleDelete}>
            <label style={styles.checkbox}>
              <input type="checkbox" checked={eraseContent} onChange={(e) => setEraseContent(e.target.checked)} />
              <span>
                Supprimer aussi mes messages du forum et mes notes du carnet de bord (recommandé). Sinon ils restent,
                sous « Ancien parent », sans plus aucun lien avec moi.
              </span>
            </label>
            <Field id="confirm-delete" label="Pour confirmer, écris SUPPRIMER">
              <input
                id="confirm-delete"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                style={ui.input}
              />
            </Field>
            <ErrorNotice error={error} onRetry={confirmText.trim().toUpperCase() === "SUPPRIMER" ? doDelete : undefined} />
            <button
              type="submit"
              disabled={busy || confirmText.trim().toUpperCase() !== "SUPPRIMER"}
              style={styles.dangerButton}
            >
              {busy ? "Suppression…" : "Supprimer définitivement mon compte"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth: 640, margin: "0 auto", padding: 16, color: "#EDEFEE", fontFamily: "sans-serif", lineHeight: 1.5, boxSizing: "border-box" },
  h1: { fontSize: 22, margin: "12px 0 16px" },
  h2: ui.h2,
  section: ui.section,
  list: { paddingLeft: 20, margin: 0 },
  muted: { color: "#aab3ae", fontSize: 14 },
  back: { background: "none", border: "none", color: "#b794ff", cursor: "pointer", padding: 0, fontSize: 16 },
  danger: { border: "1px solid #7a2e2e", borderRadius: 8, padding: 16, marginTop: 8, marginBottom: 24 },
  checkbox: { display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, minHeight: 44 },
  dangerButton: { width: "100%", padding: 10, borderRadius: 6, border: "none", background: "#b8382f", color: "white", cursor: "pointer" },
};
