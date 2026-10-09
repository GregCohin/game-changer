import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { describeError } from "../lib/errors";
import { ErrorNotice, Field, ui, useAsyncAction } from "../ui";
import { EMAIL_CODE_LENGTH, rateLimitWaitSeconds } from "../../lib/emailLogin.js";

// Délai avant de pouvoir redemander un e-mail : le service d'envoi limite les demandes rapprochées pour une
// même adresse (une par minute) ; au-delà, il répond « trop de demandes » et le parent croirait que ça ne marche pas.
const RESEND_DELAY_SECONDS = 60;

// Deux étapes. 1. L'adresse e-mail. 2. Le code à 6 chiffres reçu par e-mail (ou le lien du même e-mail).
//
// Pourquoi un code en plus du lien (audit du 07/10/2026) : certaines messageries (Outlook, passerelles de sécurité
// d'entreprise…) ouvrent chaque lien avant le destinataire, et un lien de connexion ne sert qu'une fois : le parent
// clique ensuite sur un lien déjà consommé. Un code à recopier, lui, ne peut pas être consommé à sa place.
// La phrase de l'étape 2 reste vraie quel que soit le modèle d'e-mail réglé dans Supabase (voir
// docs/connexion-parent.md) : si l'e-mail ne contient pas encore de code, le lien fonctionne comme avant.
export function LoginScreen() {
  const { signInWithEmail, verifyCode } = useAuth();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState("email"); // "email" | "code"
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [cooldownFor, setCooldownFor] = useState(""); // adresse à laquelle le délai s'applique
  const sender = useAsyncAction();   // envoi de l'e-mail
  const checker = useAsyncAction();  // vérification du code

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

  async function sendEmail() {
    setNotice("");
    let alreadySent = false;
    const ok = await sender.run(async () => {
      try {
        await signInWithEmail(email.trim());
      } catch (err) {
        // « Tu ne peux redemander qu'après N secondes » : un e-mail vient déjà de partir vers cette adresse (page
        // rechargée, deuxième onglet…). Plutôt que de laisser le parent devant un message d'erreur, on le mène
        // à la saisie du code, et le délai restant alimente le compte à rebours.
        const wait = rateLimitWaitSeconds(err);
        if (wait === null) throw err;
        alreadySent = true;
        startCooldown(Math.max(1, wait));
      }
    });
    if (!ok) return;
    if (!alreadySent) startCooldown(RESEND_DELAY_SECONDS);
    else setNotice("Un e-mail vient déjà d'être envoyé à cette adresse : saisis son code ci-dessous.");
    setCode("");
    checker.clearError();
    setStep("code");
  }

  function handleEmailSubmit(e) {
    e.preventDefault();
    sendEmail();
  }

  async function handleCodeSubmit(e) {
    e.preventDefault();
    // En cas de succès, onAuthStateChange remplace cet écran par le portail ; en cas d'échec l'erreur s'affiche
    // sous le champ, avec les mêmes boutons (renvoyer, changer d'adresse) pour s'en sortir.
    await checker.run(() => verifyCode(email.trim(), code));
  }

  function changeAddress() {
    setStep("email");
    setCode("");
    setNotice("");
    sender.clearError();
    checker.clearError();
  }

  if (step === "code") {
    return (
      <div style={styles.card}>
        <h1 style={styles.title}>Vérifie ta boîte mail</h1>
        <p>On a envoyé un e-mail à <strong>{email.trim()}</strong>.</p>
        <p>Saisis ci-dessous le <strong>code à {EMAIL_CODE_LENGTH} chiffres</strong> qu'il contient, ou clique sur le lien de l'e-mail.</p>
        {notice && <p role="status" style={styles.notice}>{notice}</p>}
        <form onSubmit={handleCodeSubmit}>
          <Field id="login-code" label={`Code à ${EMAIL_CODE_LENGTH} chiffres`}>
            <input
              id="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.slice(0, 40))}
              style={{ ...ui.input, letterSpacing: 4, textAlign: "center" }}
            />
          </Field>
          <button type="submit" disabled={checker.busy} style={styles.button}>
            {checker.busy ? "Vérification…" : "Valider le code"}
          </button>
        </form>
        <ErrorNotice error={checker.error} />
        <p>
          Tu ne vois pas l'e-mail ? Regarde dans les <strong>indésirables (spam)</strong> : le premier message d'un nouvel
          expéditeur y atterrit souvent. Si tu l'y trouves, marque-le « non indésirable » pour que les prochains arrivent
          dans ta boîte principale.
        </p>
        <ErrorNotice error={sender.error} />
        <button type="button" style={styles.secondary} disabled={sender.busy || cooldown > 0} onClick={sendEmail}>
          {sender.busy ? "Envoi…" : cooldown > 0 ? `Renvoyer l'e-mail (dans ${cooldown} s)` : "Renvoyer l'e-mail"}
        </button>
        <button type="button" style={styles.secondary} onClick={changeAddress}>
          Changer d'adresse email
        </button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h1 style={styles.title}>Portail joueur/parent</h1>
      <p>Connecte-toi avec ton adresse email pour accéder aux informations de ton enfant.</p>
      <form onSubmit={handleEmailSubmit}>
        <Field id="login-email" label="Ton adresse email">
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder="ton.email@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={ui.input}
          />
        </Field>
        <button type="submit" disabled={sender.busy || waitingOnThisAddress} style={styles.button}>
          {sender.busy ? "Envoi…" : waitingOnThisAddress ? `Recevoir un e-mail (dans ${cooldown} s)` : "Recevoir un e-mail de connexion"}
        </button>
      </form>
      <ErrorNotice error={sender.error} />
    </div>
  );
}

const styles = {
  card: { maxWidth: 400, margin: "40px auto", padding: 24, color: "#EDEFEE", fontFamily: "sans-serif" },
  title: { fontSize: 22, marginBottom: 12 },
  button: { width: "100%", padding: 10, borderRadius: 6, border: "none", background: "#8a4fff", color: "white", cursor: "pointer", marginTop: 4 },
  secondary: { width: "100%", padding: 10, borderRadius: 6, border: "1px solid #555", background: "none", color: "#EDEFEE", cursor: "pointer", marginTop: 10 },
  notice: { border: "1px solid #555", borderRadius: 8, padding: 10, background: "rgba(255,255,255,0.05)" },
};
