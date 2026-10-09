import { useEffect, useRef, useState } from "react";
import { signInStaff, verifyStaffCode } from "../lib/portalSync.js";
import { EMAIL_CODE_LENGTH, rateLimitWaitSeconds } from "../lib/emailLogin.js";

// Connexion du staff à l'écran Portail parent : même mécanisme que côté parent (src/parent/screens/LoginScreen.jsx),
// avec les classes de l'app staff. Deux étapes : l'adresse e-mail, puis le code à 6 chiffres de l'e-mail (ou son lien :
// il mène à la page de confirmation de portail/StaffConfirmation.jsx). Une fois connecté, onStaffAuthChange
// (PortalBackendScreen) remplace ce bloc.
//
// Pourquoi un code en plus du lien : certaines messageries ouvrent le lien avant son destinataire et le « brûlent »
// (jeton à usage unique) — voir lib/emailLogin.js.

// Une même adresse ne peut redemander un e-mail qu'une fois par minute (limite du service d'envoi).
const RESEND_DELAY_SECONDS = 60;

export function StaffLogin() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState("email"); // "email" | "code"
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [cooldownFor, setCooldownFor] = useState(""); // adresse à laquelle le délai s'applique
  const [message, setMessage] = useState(null); // { tone: "error" | "info", text }
  const locked = useRef(false); // un second appui pendant un envoi est ignoré

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Le délai d'une minute vaut pour UNE adresse : après une faute de frappe, la bonne adresse peut être envoyée tout de suite.
  const normalized = (text) => text.trim().toLowerCase();
  const waitingOnThisAddress = cooldown > 0 && cooldownFor === normalized(email);
  function startCooldown(seconds) {
    setCooldown(seconds);
    setCooldownFor(normalized(email));
  }

  async function run(action) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage(null);
    try { await action(); } finally { locked.current = false; setBusy(false); }
  }

  function sendEmail(e) {
    if (e && e.preventDefault) e.preventDefault();
    return run(async () => {
      try {
        await signInStaff(email.trim());
        startCooldown(RESEND_DELAY_SECONDS);
      } catch (err) {
        // « Tu ne peux redemander qu'après N secondes » : un e-mail vient déjà de partir vers cette adresse.
        const wait = rateLimitWaitSeconds(err.cause || err);
        if (wait === null) { setMessage({ tone: "error", text: err.message }); return; }
        startCooldown(Math.max(1, wait));
        setMessage({ tone: "info", text: "Un e-mail vient déjà d'être envoyé à cette adresse : saisis son code." });
      }
      setCode("");
      setStep("code");
    });
  }

  function submitCode(e) {
    e.preventDefault();
    // Succès : la session change et PortalBackendScreen remplace ce bloc. Échec : le message s'affiche ici.
    return run(async () => {
      try { await verifyStaffCode(email.trim(), code); } catch (err) { setMessage({ tone: "error", text: err.message }); }
    });
  }

  function changeAddress() {
    setStep("email");
    setCode("");
    setMessage(null);
  }

  const notice = message && (
    <div role={message.tone === "error" ? "alert" : "status"} className={`signal-item${message.tone === "error" ? " negative" : ""}`} style={{ marginBottom: 10 }}>
      {message.text}
    </div>
  );

  if (step === "code") {
    return (
      <div>
        <p>E-mail envoyé à <strong>{email.trim()}</strong>. Saisis le <strong>code à {EMAIL_CODE_LENGTH} chiffres</strong> qu'il contient, ou clique sur le lien de l'e-mail. Pas reçu ? Regarde dans les indésirables.</p>
        {notice}
        <form onSubmit={submitCode}>
          <label htmlFor="staff-login-code" className="hint" style={{ display: "block", textAlign: "left", marginBottom: 4 }}>Code à {EMAIL_CODE_LENGTH} chiffres</label>
          <input
            id="staff-login-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, 40))}
            style={{ width: "100%", padding: 10, marginBottom: 10, letterSpacing: 4, textAlign: "center", boxSizing: "border-box" }}
          />
          <button className="btn btn-primary" disabled={busy} type="submit">{busy ? "Vérification…" : "Valider le code"}</button>
        </form>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-small" type="button" disabled={busy || cooldown > 0} onClick={sendEmail}>
            {cooldown > 0 ? `Renvoyer l'e-mail (dans ${cooldown} s)` : "Renvoyer l'e-mail"}
          </button>
          <button className="btn btn-ghost btn-small" type="button" onClick={changeAddress}>Changer d'adresse</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={sendEmail}>
      {notice}
      <input type="email" required placeholder="ton.email@exemple.com" aria-label="Ton adresse e-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 10, boxSizing: "border-box" }} />
      <button className="btn btn-primary" disabled={busy || waitingOnThisAddress} type="submit">
        {busy ? "Envoi…" : waitingOnThisAddress ? `Recevoir un e-mail (dans ${cooldown} s)` : "Recevoir un e-mail de connexion"}
      </button>
    </form>
  );
}
