import { useEffect, useMemo, useRef, useState } from "react";
import {
  PORTAL_URL_KEY, INVITATION_LOG_KEY, WAVE_STEPS,
  checkPortalUrl, defaultPortalUrl, composeInvitation, mailtoLink, whatsappLink,
  newInvitationId, parseInvitationLog, recordInvitation, invitationBudget,
} from "../lib/invitationMessage.js";

// Écran Portail parent (staff) : préparer le message d'invitation d'une famille, et suivre combien d'e-mails de
// connexion on s'apprête à provoquer.
//
// Rien n'est envoyé automatiquement : le staff copie le texte, ou l'ouvre dans sa messagerie ou dans WhatsApp, et
// c'est lui qui appuie sur « Envoyer ». Le message ne contient pas le nom de l'enfant ni l'adresse du parent, et
// les liens mailto: / wa.me n'en contiennent pas non plus (logique pure et testée : lib/invitationMessage.js).
//
// Le compteur compte des invitations PRÉPARÉES depuis ce navigateur, pas des e-mails réellement envoyés : le total
// exact est dans le tableau de bord de Resend. Il prévient avant le plafond d'envoi (100 e-mails par jour sur l'offre
// gratuite, 30 par heure réglés dans Supabase) au lieu de laisser des parents sans e-mail de connexion.

const CHANGED_EVENT = "tf-invitations-changed"; // le compteur se met à jour quand le panneau note une invitation

const readEvents = () => { try { return parseInvitationLog(localStorage.getItem(INVITATION_LOG_KEY)); } catch (e) { return []; } };
const readClubName = () => { try { return String(JSON.parse(localStorage.getItem("tf_club_info") || "{}").name || ""); } catch (e) { return ""; } };
const readStoredPortalUrl = () => { try { return localStorage.getItem(PORTAL_URL_KEY) || ""; } catch (e) { return ""; } };

async function copyText(text, textarea) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* repli ci-dessous */ }
  try {
    if (textarea) { textarea.focus(); textarea.select(); return document.execCommand("copy"); }
  } catch (e) { /* copie impossible : le staff copiera à la main */ }
  return false;
}

// Compteur d'invitations + conseil « par vagues ». N'affiche le détail qu'une fois une invitation préparée.
export function InvitationBudgetNotice() {
  const [events, setEvents] = useState(readEvents);
  useEffect(() => {
    const refresh = () => setEvents(readEvents());
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CHANGED_EVENT, refresh);
  }, []);

  const budget = invitationBudget(events, Date.now());
  const tone = budget.level === "stop" ? "var(--crimson)" : budget.level === "warn" ? "#D9A441" : "var(--line)";
  return (
    <div style={{ marginBottom: 12 }}>
      {budget.lastDay > 0 && (
        <div className="signal-item" role="status" style={{ borderLeftColor: tone, marginBottom: 8 }}>
          <div>{budget.headline}</div>
          <div className="hint" style={{ textAlign: "left", margin: "4px 0 0" }}>{budget.estimate}</div>
          {budget.advice && <div style={{ marginTop: 6, fontWeight: 600 }}>{budget.level === "stop" ? "⛔ " : "⚠ "}{budget.advice}</div>}
          <div className="hint" style={{ textAlign: "left", margin: "6px 0 0" }}>
            Ce compteur ne voit que les invitations préparées depuis ce navigateur. Le total réel des e-mails envoyés est dans Resend (Emails).
          </div>
        </div>
      )}
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13 }}>Inviter par vagues (conseil)</summary>
        <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13 }}>
          {WAVE_STEPS.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </details>
    </div>
  );
}

// Panneau « Préparer l'invitation » pour un code d'invitation. `expiresAt` : date d'expiration du code (facultative).
export function InvitationMessage({ code, expiresAt = null, onClose }) {
  const [invitationId] = useState(() => newInvitationId()); // plusieurs actions sur ce message = une seule invitation
  const [portalInput, setPortalInput] = useState(() => readStoredPortalUrl() || defaultPortalUrl(window.location.origin));
  const [edited, setEdited] = useState(null); // texte modifié à la main ; null = texte proposé
  const [feedback, setFeedback] = useState("");
  const textareaRef = useRef(null);
  const clubName = useMemo(readClubName, []);

  const checked = checkPortalUrl(portalInput);
  const composed = checked.ok ? composeInvitation({ clubName, portalUrl: checked.url, code, expiresAt }) : null;
  const body = edited !== null ? edited : (composed ? composed.body : "");
  const subject = composed ? composed.subject : "";
  const ready = checked.ok && body.trim() !== "";

  function savePortalUrl() {
    if (!checked.ok) return;
    try { localStorage.setItem(PORTAL_URL_KEY, checked.url); } catch (e) { /* le prochain message redemandera l'adresse */ }
  }

  // Avertit avant d'ajouter une invitation quand le plafond estimé est déjà atteint (sans redemander pour un message déjà compté).
  function allowed() {
    const events = readEvents();
    if (events.some((e) => e.id === invitationId)) return true;
    const budget = invitationBudget(events, Date.now());
    return budget.level !== "stop" || confirm(`${budget.advice}\n\nPréparer cette invitation quand même ?`);
  }

  function note(channel) {
    savePortalUrl();
    recordInvitation(localStorage, { id: invitationId, channel });
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
  }

  async function handleCopy() {
    setFeedback(""); // un message d'une action précédente ne doit pas survivre à une action refusée
    if (!allowed()) return;
    const ok = await copyText(body, textareaRef.current);
    // L'invitation est comptée même si la copie automatique est impossible : le staff est invité à copier à la main.
    note("copy");
    setFeedback(ok ? "Message copié. Colle-le dans ta messagerie ou dans WhatsApp." : "Copie impossible ici : sélectionne le texte et copie-le à la main.");
  }

  const onLinkClick = (channel) => (e) => {
    setFeedback("");
    if (!allowed()) { e.preventDefault(); return; }
    note(channel);
    setFeedback(channel === "email" ? "Ta messagerie s'ouvre avec le message : choisis le destinataire, relis, puis envoie." : "WhatsApp s'ouvre avec le message : choisis le contact, relis, puis envoie.");
  };

  const linkStyle = { textDecoration: "none" };

  return (
    <div className="scouting-card" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div className="scouting-name">Préparer l'invitation</div>
        <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>Fermer</button>
      </div>
      <div className="scouting-meta">
        Code {code}. Rien n'est envoyé automatiquement : tu copies le message, ou tu l'ouvres dans ta messagerie ou dans WhatsApp, puis c'est toi qui l'envoies.
        Envoie-le à la famille concernée, pas dans un groupe : le code donne accès à la fiche de l'enfant.
      </div>

      <label htmlFor="invitation-portal-url" className="hint" style={{ textAlign: "left", margin: 0 }}>Adresse du portail (celle que les familles ouvriront)</label>
      <input
        id="invitation-portal-url"
        type="text"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Ex. : https://football-analysis-ten.vercel.app"
        value={portalInput}
        onChange={(e) => { setPortalInput(e.target.value); setEdited(null); }}
        onBlur={savePortalUrl}
        style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
      />
      {!checked.ok && <div className="signal-item negative" role="alert">{checked.problem}</div>}

      <label htmlFor="invitation-body" className="hint" style={{ textAlign: "left", margin: 0 }}>Message (tu peux le modifier avant de l'envoyer)</label>
      <textarea
        id="invitation-body"
        ref={textareaRef}
        rows={14}
        value={body}
        disabled={!checked.ok}
        onChange={(e) => setEdited(e.target.value)}
        style={{ width: "100%", padding: 8, boxSizing: "border-box", fontFamily: "inherit" }}
      />
      {edited !== null && (
        <div>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEdited(null)}>Rétablir le texte proposé</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary btn-small" disabled={!ready} onClick={handleCopy}>Copier le message</button>
        {ready ? (
          <>
            <a className="btn btn-ghost btn-small" style={linkStyle} href={mailtoLink({ subject, body })} onClick={onLinkClick("email")}>Ouvrir dans ma messagerie</a>
            <a className="btn btn-ghost btn-small" style={linkStyle} href={whatsappLink({ body })} target="_blank" rel="noopener noreferrer" onClick={onLinkClick("whatsapp")}>Envoyer par WhatsApp</a>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost btn-small" disabled>Ouvrir dans ma messagerie</button>
            <button type="button" className="btn btn-ghost btn-small" disabled>Envoyer par WhatsApp</button>
          </>
        )}
      </div>
      {feedback && <div className="hint" role="status" style={{ textAlign: "left", margin: 0 }}>{feedback}</div>}
    </div>
  );
}
