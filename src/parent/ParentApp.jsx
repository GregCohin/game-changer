import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { getLinkedPlayers } from "./lib/api";
import { supabase } from "./supabaseClient";
import { LoginScreen } from "./screens/LoginScreen";
import { LinkChildScreen } from "./screens/LinkChildScreen";
import { PortailScreen } from "./screens/PortailScreen";
import { ForumScreen } from "./screens/ForumScreen";

export function ParentApp() {
  const { session, signOut } = useAuth();
  const [players, setPlayers] = useState(null); // null = pas encore chargé
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [tab, setTab] = useState("portail");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (session === undefined || session === null) return;
    // Nom affichable pour que le staff puisse identifier les parents liés (écran "parents liés à
    // ce joueur") sans jamais avoir besoin d'accéder à auth.users, non exposé par l'API publique.
    supabase.from("parent_profiles").upsert({ id: session.user.id, display_name: session.user.email }, { onConflict: "id" });
    getLinkedPlayers()
      .then((list) => {
        setPlayers(list);
        if (list.length > 0) setSelectedPlayerId((prev) => prev || list[0].id);
      })
      .catch(() => setPlayers([]));
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
  if (players === null) {
    return <div style={styles.page}>Chargement…</div>;
  }
  if (players.length === 0) {
    return (
      <div style={styles.page}>
        <LinkChildScreen onLinked={() => setRefreshKey((k) => k + 1)} />
      </div>
    );
  }

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId) || players[0];

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <strong>Game Changer</strong> — Portail parent
        </div>
        <button style={styles.linkAnother} onClick={() => setPlayers([])}>
          + Lier un autre enfant
        </button>
        <button style={styles.signOut} onClick={signOut}>Se déconnecter</button>
      </header>

      {players.length > 1 && (
        <select
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
        <button style={tab === "portail" ? styles.tabActive : styles.tab} onClick={() => setTab("portail")}>Portail</button>
        <button style={tab === "forum" ? styles.tabActive : styles.tab} onClick={() => setTab("forum")}>Forum</button>
      </nav>

      {tab === "portail" && <PortailScreen player={selectedPlayer} />}
      {tab === "forum" && <ForumScreen player={selectedPlayer} />}
    </div>
  );
}

const styles = {
  page: { minHeight: "100%", color: "#EDEFEE", fontFamily: "sans-serif", padding: 16, boxSizing: "border-box" },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  linkAnother: { marginLeft: "auto", background: "none", border: "1px solid #555", color: "#EDEFEE", borderRadius: 6, padding: "6px 10px", cursor: "pointer" },
  signOut: { background: "none", border: "1px solid #555", color: "#EDEFEE", borderRadius: 6, padding: "6px 10px", cursor: "pointer" },
  select: { width: "100%", padding: 8, marginBottom: 12, borderRadius: 6 },
  tabs: { display: "flex", gap: 8, marginBottom: 16 },
  tab: { background: "none", border: "1px solid #555", color: "#aaa", borderRadius: 6, padding: "8px 14px", cursor: "pointer" },
  tabActive: { background: "#8a4fff", border: "1px solid #8a4fff", color: "white", borderRadius: 6, padding: "8px 14px", cursor: "pointer" },
};
