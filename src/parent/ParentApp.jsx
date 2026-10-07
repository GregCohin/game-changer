import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { getLinkedPlayers } from "./lib/api";
import { describeError } from "./lib/errors";
import { supabase } from "./supabaseClient";
import { LoginScreen } from "./screens/LoginScreen";
import { LinkChildScreen } from "./screens/LinkChildScreen";
import { PortailScreen } from "./screens/PortailScreen";
import { ForumScreen } from "./screens/ForumScreen";
import { ErrorNotice, ui } from "./ui";

export function ParentApp() {
  const { session, signOut } = useAuth();
  const [players, setPlayers] = useState(null); // null = pas encore chargé
  const [loadError, setLoadError] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [tab, setTab] = useState("portail");
  const [linking, setLinking] = useState(false); // le parent ajoute un enfant de plus
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (session === undefined) return undefined;
    if (session === null) {
      // Déconnexion : rien de l'enfant précédent ne doit rester à l'écran pour le prochain parent
      // (tablette familiale partagée).
      setPlayers(null);
      setSelectedPlayerId(null);
      setLoadError(null);
      setLinking(false);
      return undefined;
    }
    let cancelled = false;
    setLoadError(null);
    // Nom affichable pour que le staff puisse identifier les parents liés (écran "parents liés à
    // ce joueur") sans jamais avoir besoin d'accéder à auth.users, non exposé par l'API publique.
    // Le .then() est indispensable : un builder supabase-js n'envoie sa requête qu'à l'await/then.
    supabase
      .from("parent_profiles")
      .upsert({ id: session.user.id, display_name: session.user.email }, { onConflict: "id" })
      .then(({ error }) => { if (error) console.error("Profil parent non enregistré", error); });
    getLinkedPlayers()
      .then((list) => {
        if (cancelled) return;
        setPlayers(list);
        if (list.length > 0) setSelectedPlayerId((prev) => prev || list[0].id);
      })
      // Une erreur de chargement n'est PAS « aucun enfant lié » : avant, tout échec (serveur injoignable,
      // session expirée…) renvoyait le parent sur l'écran du code d'invitation.
      .catch((e) => { if (!cancelled) setLoadError(describeError(e)); });
    return () => { cancelled = true; };
  }, [session, refreshKey]);

  if (session === undefined) {
    return <div style={styles.page}>Chargement…</div>;
  }
  if (session === null) {
    return (
      <div style={styles.page}>
        <LoginScreen />
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={styles.page}>
        <ErrorNotice error={loadError} onRetry={() => setRefreshKey((k) => k + 1)} />
        <button type="button" style={ui.linkButton} onClick={signOut}>Se déconnecter</button>
      </div>
    );
  }
  if (players === null) {
    return <div style={styles.page}>Chargement…</div>;
  }
  if (players.length === 0 || linking) {
    return (
      <div style={styles.page}>
        <LinkChildScreen
          onLinked={() => { setLinking(false); setRefreshKey((k) => k + 1); }}
          onCancel={players.length > 0 ? () => setLinking(false) : undefined}
          onSignOut={signOut}
        />
      </div>
    );
  }

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId) || players[0];

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.title}>
          <strong>Game Changer</strong> — Portail parent
        </div>
        <div style={styles.actions}>
          <button type="button" style={styles.headerButton} onClick={() => setLinking(true)}>
            + Lier un autre enfant
          </button>
          <button type="button" style={styles.headerButton} onClick={signOut}>Se déconnecter</button>
        </div>
      </header>

      {players.length > 1 && (
        <select
          aria-label="Enfant"
          value={selectedPlayer.id}
          onChange={(e) => setSelectedPlayerId(e.target.value)}
          style={styles.select}
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
          ))}
        </select>
      )}

      <nav style={styles.tabs}>
        <button type="button" style={tab === "portail" ? styles.tabActive : styles.tab} onClick={() => setTab("portail")}>Portail</button>
        <button type="button" style={tab === "forum" ? styles.tabActive : styles.tab} onClick={() => setTab("forum")}>Forum</button>
      </nav>

      {tab === "portail" && <PortailScreen player={selectedPlayer} />}
      {tab === "forum" && <ForumScreen player={selectedPlayer} />}
    </div>
  );
}

const styles = {
  page: { minHeight: "100%", color: "#EDEFEE", fontFamily: "sans-serif", padding: 16, boxSizing: "border-box" },
  // Titre puis boutons : sur écran large ils tiennent sur une ligne (titre à gauche, boutons à droite) ;
  // sur téléphone les boutons passent sous le titre, côte à côte s'ils tiennent (d'où 14 px : la règle
  // des 16 px ne vise que les champs de saisie) et sinon empilés en pleine largeur (flex: 1 1 auto),
  // au lieu de se répartir de travers.
  header: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 12px", marginBottom: 16 },
  title: { flex: "1 1 auto" },
  actions: { display: "flex", flexWrap: "wrap", gap: 8 },
  headerButton: { flex: "1 1 auto", fontSize: 14, background: "none", border: "1px solid #555", color: "#EDEFEE", borderRadius: 6, padding: "6px 10px", cursor: "pointer" },
  select: { width: "100%", padding: 8, marginBottom: 12, borderRadius: 6 },
  tabs: { display: "flex", gap: 8, marginBottom: 16 },
  tab: { background: "none", border: "1px solid #555", color: "#aaa", borderRadius: 6, padding: "8px 14px", cursor: "pointer" },
  tabActive: { background: "#8a4fff", border: "1px solid #8a4fff", color: "white", borderRadius: 6, padding: "8px 14px", cursor: "pointer" },
};
