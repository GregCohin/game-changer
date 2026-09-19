import { useEffect, useState } from "react";
import { getForumThreads, getThreadMessages, postForumMessage } from "../lib/api";

// Nom affiché sous les messages d'un parent. Jamais l'email : dans un sujet d'équipe, tous les
// parents lisent les messages des autres. Seul le prénom de l'enfant concerné, comme dans un groupe
// de club classique.
function parentDisplayName(player) {
  const firstName = (player.first_name || "").trim().split(/\s+/)[0];
  return firstName ? `Parent de ${firstName}` : "Parent";
}

export function ForumScreen({ player }) {
  const [threads, setThreads] = useState(null);
  const [openThreadId, setOpenThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getForumThreads(player.team_id, player.season_id)
      .then(setThreads)
      .catch((e) => setError(e.message));
  }, [player.team_id, player.season_id]);

  useEffect(() => {
    if (!openThreadId) return;
    getThreadMessages(openThreadId).then(setMessages).catch((e) => setError(e.message));
  }, [openThreadId]);

  async function handleReply(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    await postForumMessage(openThreadId, reply.trim(), parentDisplayName(player));
    setReply("");
    getThreadMessages(openThreadId).then(setMessages);
  }

  if (error) return <p style={{ color: "#ff6b6b" }}>Erreur : {error}</p>;
  if (!threads) return <p>Chargement…</p>;

  if (openThreadId) {
    const thread = threads.find((t) => t.id === openThreadId);
    return (
      <div>
        <button style={styles.back} onClick={() => setOpenThreadId(null)}>← Retour aux sujets</button>
        <h2 style={styles.h2}>{thread?.title}</h2>
        {messages.map((m) => (
          <div key={m.id} style={styles.card}>
            <strong>{m.author_name}</strong>
            {m.author_kind === "staff" && <span style={styles.badge}>Staff</span>}
            <p>{m.content}</p>
          </div>
        ))}
        <form onSubmit={handleReply}>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Répondre…" style={styles.textarea} />
          <button type="submit" style={styles.button}>Envoyer</button>
        </form>
      </div>
    );
  }

  return (
    <div>
      {threads.length === 0 && <p>Aucun sujet pour l'instant.</p>}
      {threads.map((t) => (
        <div key={t.id} style={styles.threadRow} onClick={() => setOpenThreadId(t.id)}>
          <strong>{t.title}</strong>
          {t.type === "individuelle" && <span style={styles.badge}>Conversation privée</span>}
        </div>
      ))}
    </div>
  );
}

const card = { background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 10, marginBottom: 8 };

const styles = {
  h2: { fontSize: 16, marginBottom: 8, color: "#ccc" },
  card,
  // Ligne de sujet cliquable : 13 px de marge en haut et en bas pour atteindre 44 px de haut même
  // avec un titre sur une seule ligne.
  threadRow: { ...card, padding: "13px 10px", cursor: "pointer" },
  badge: { marginLeft: 8, fontSize: 11, background: "#8a4fff", borderRadius: 4, padding: "2px 6px" },
  back: { background: "none", border: "none", color: "#8a4fff", cursor: "pointer", marginBottom: 12, padding: 0 },
  textarea: { width: "100%", minHeight: 60, padding: 8, borderRadius: 6, border: "1px solid #444", boxSizing: "border-box", marginBottom: 8 },
  button: { padding: "6px 12px", borderRadius: 6, border: "none", background: "#8a4fff", color: "white", cursor: "pointer" },
};
