// Filet de sécurité d'affichage. Sans lui, une erreur levée pendant le rendu d'un composant (une fiche
// blessure sans `programPhases` suffisait) démonte toute l'application : page blanche, aucune issue.
//
// Deux usages :
//  - racine de l'app (src/main.jsx pour le staff, src/parent/main.jsx pour le portail parent) ;
//  - autour de la zone de contenu de l'app staff (App.jsx) : le menu reste utilisable, on peut
//    quitter l'écran en erreur sans recharger.
//
// Ce fichier est partagé par les DEUX bundles (staff et parent) : il ne doit rien importer d'autre
// que React — le bundle parent doit rester minuscule. Le bouton « Télécharger une sauvegarde »
// reçoit sa fonction par la prop `rescue` (staff seulement) ; elle ne dépend pas de l'arbre React,
// donc fonctionne même quand l'app a planté.
//
// Styles en ligne volontairement : l'écran d'erreur doit rester lisible même quand la feuille de
// style de l'app (injectée par App.jsx) n'est pas montée.

import React from "react";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const styles = {
  card: { background: "#FFFFFF", color: "#2B2235", border: "1px solid #E3D5EF", borderRadius: 12, padding: 24, maxWidth: 560, margin: "32px auto", fontFamily: FONT, lineHeight: 1.45, textAlign: "left" },
  title: { margin: "0 0 8px", fontSize: 20 },
  text: { margin: "0 0 12px" },
  row: { display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0 4px" },
  primary: { background: "#B06A87", color: "#FFFFFF", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 15, cursor: "pointer", fontFamily: FONT },
  secondary: { background: "#FFFFFF", color: "#2B2235", border: "1px solid #B06A87", borderRadius: 8, padding: "10px 16px", fontSize: 15, cursor: "pointer", fontFamily: FONT },
  ok: { color: "#2F6B3A", margin: "8px 0 0" },
  warn: { color: "#B8382F", margin: "8px 0 0" },
  details: { marginTop: 16, fontSize: 13 },
  pre: { whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#F5F0FA", padding: 10, borderRadius: 8, maxHeight: 220, overflow: "auto", fontSize: 12 },
};

function describeError(error, componentStack) {
  const message = error && error.message ? error.message : String(error);
  const stack = error && error.stack ? String(error.stack).split("\n").slice(0, 6).join("\n") : "";
  return [message, stack, componentStack ? `Composants :${String(componentStack).split("\n").slice(0, 8).join("\n")}` : ""].filter(Boolean).join("\n\n");
}

function ErrorFallback({ error, componentStack, scope, rescue, onReset }) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null); // { ok, message }
  const [copied, setCopied] = React.useState(false);
  const details = describeError(error, componentStack);

  async function runRescue() {
    setBusy(true);
    setResult(null);
    try {
      const r = await rescue();
      const incomplete = r && r.warnings && r.warnings.length > 0;
      setResult({
        ok: !incomplete,
        message: incomplete
          ? `Sauvegarde téléchargée (${r.filename}), mais INCOMPLÈTE : les matchs de ${r.warnings.length} équipe(s)/saison(s) n'ont pas pu être lus.`
          : `Sauvegarde téléchargée${r && r.filename ? ` (${r.filename})` : ""}. Garde-la précieusement.`,
      });
    } catch (e) {
      setResult({ ok: false, message: `La sauvegarde a échoué : ${(e && e.message) || e}` });
    }
    setBusy(false);
  }

  function copyDetails() {
    try { navigator.clipboard.writeText(details).then(() => setCopied(true), () => {}); } catch (e) { /* presse-papiers indisponible */ }
  }

  return (
    <div role="alert" style={styles.card}>
      <h2 style={styles.title}>{scope === "section" ? "Cet écran a rencontré une erreur" : "Une erreur est survenue"}</h2>
      {rescue ? (
        <p style={styles.text}>Tes données sont toujours dans ce navigateur : l'erreur ne concerne que l'affichage. Par précaution, télécharge une sauvegarde avant de recharger.</p>
      ) : (
        <p style={styles.text}>L'affichage a été interrompu. Recharge la page ; si l'erreur revient, préviens le club en copiant les détails ci-dessous.</p>
      )}
      <div style={styles.row}>
        <button style={styles.primary} onClick={() => window.location.reload()}>Recharger la page</button>
        {rescue && <button style={styles.secondary} onClick={runRescue} disabled={busy}>{busy ? "Préparation…" : "Télécharger une sauvegarde"}</button>}
        {onReset && <button style={styles.secondary} onClick={onReset}>Retour à l'accueil</button>}
      </div>
      {result && <p style={result.ok ? styles.ok : styles.warn}>{result.message}</p>}
      <details style={styles.details}>
        <summary style={{ cursor: "pointer" }}>Détails techniques</summary>
        <pre style={styles.pre}>{details}</pre>
        <button style={styles.secondary} onClick={copyDetails}>{copied ? "Copié" : "Copier les détails"}</button>
      </details>
    </div>
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, componentStack: "" };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ componentStack: (info && info.componentStack) || "" });
    try { console.error("[ErrorBoundary]", error, info && info.componentStack); } catch (e) { /* console indisponible */ }
  }
  componentDidUpdate(prevProps) {
    // Changer d'écran (resetKey) efface l'erreur : la zone de contenu se remonte, le menu n'a jamais bougé.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null, componentStack: "" });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorFallback error={this.state.error} componentStack={this.state.componentStack} scope={this.props.scope || "app"} rescue={this.props.rescue} onReset={this.props.onReset} />;
  }
}
