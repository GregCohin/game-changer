import { useEffect, useRef, useState } from "react";
import { getForumThreads, getThreadMessages, postForumMessage } from "../lib/api";
import { describeError } from "../lib/errors";
import { ErrorNotice, Field, ui, useAsyncAction } from "../ui";

// Nom affiché sous les messages d'un parent. Jamais l'email : dans un sujet d'équipe, tous les
// parents lisent les messages des autres. Seul le prénom de l'enfant concerné, comme dans un groupe
// de club classique.
function parentDisplayName(player) {
  const firstName = (player.first_name || "").trim().split(/\s+/)[0];
  return firstName ? `Parent de ${firstName}` : "Parent";
}

export function ForumScreen({ player }) {
  const [threads, setThreads] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openThreadId, setOpenThreadId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    getForumThreads(player.team_id, player.season_id)
      .then((list) => { if (!cancelled) setThreads(list); })
      .catch((e) => { if (!cancelled) setLoadError(describeError(e)); });
    return () => { cancelled = true; };
  }, [player.team_id, player.season_id, reloadKey]);

  if (loadError) return <ErrorNotice error={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!threads) return <p>Chargement…</p>;

  const openThread = openThreadId && threads.find((t) => t.id === openThreadId);
  if (openThread) {
    return <ThreadView thread={openThread} player={player} onBack={() => setOpenThreadId(null)} />;
  }

  return (
    <div>
      {threads.length === 0 && <p style={ui.empty}>Aucun sujet pour l'instant.</p>}
      {threads.map((t) => (
        // Un vrai bouton (et non une div cliquable) : atteignable au clavier et annoncé par les lecteurs d'écran.
        <button key={t.id} type="button" style={styles.threadRow} onClick={() => setOpenThreadId(t.id)}>
          <strong>{t.title}</strong>
          {t.type === "individuelle" && <span style={styles.badge}>Conversation privée</span>}
        </button>
      ))}
    </div>
  );
}

function ThreadView({ thread, player, onBack }) {
  const [messages, setMessages] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [reply, setReply] = useState("");
  const draftId = useRef(null); // identifiant du message en cours d'envoi, conservé tant qu'il n'est pas parti
  const { run, busy, error } = useAsyncAction();

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    getThreadMessages(thread.id)
      .then((list) => { if (!cancelled) setMessages(list); })
      .catch((e) => { if (!cancelled) setLoadError(describeError(e)); });
    return () => { cancelled = true; };
  }, [thread.id, reloadKey]);

  async function handleReply(e) {
    e.preventDefault();
    const content = reply.trim();
    if (!content) return;
    // Même identifiant à chaque nouvel essai d'un même texte : si la première tentative est bien arrivée
    // mais que la réponse s'est perdue, le renvoi ne crée pas un deuxième message.
    const id = draftId.current || (draftId.current = crypto.randomUUID());
    const ok = await run(() => postForumMessage(thread.id, content, parentDisplayName(player), id));
    if (ok) {
      draftId.current = null;
      setReply("");
      setReloadKey((k) => k + 1);
    }
  }

  return (
    <div>
      <button type="button" style={styles.back} onClick={onBack}>← Retour aux sujets</button>
      <h2 style={ui.h2}>{thread.title}</h2>
      {loadError && <ErrorNotice error={loadError} onRetry={() => setReloadKey((k) => k + 1)} />}
      {!loadError && !messages && <p>Chargement…</p>}
      {messages && messages.length === 0 && <p style={ui.empty}>Aucun message pour l'instant.</p>}
      {(messages || []).map((m) => (
        <div key={m.id} style={ui.card}>
          <strong>{m.author_name}</strong>
          {m.author_kind === "staff" && <span style={styles.badge}>Staff</span>}
          <p>{m.content}</p>
        </div>
      ))}
      <form onSubmit={handleReply}>
        <Field id="forum-reply" label="Ta réponse">
          <textarea
            id="forum-reply"
            value={reply}
            onChange={(e) => { setReply(e.target.value); draftId.current = null; }}
            style={ui.textarea}
          />
        </Field>
        <ErrorNotice error={error} />
        <button type="submit" style={ui.button} disabled={busy}>{busy ? "Envoi…" : "Envoyer"}</button>
      </form>
    </div>
  );
}

const styles = {
  // Ligne de sujet cliquable : 44 px de haut minimum (règle globale de parent.html), pleine largeur.
  threadRow: { ...ui.card, display: "block", width: "100%", textAlign: "left", border: "none", color: "inherit", fontFamily: "inherit", padding: "13px 10px", cursor: "pointer" },
  badge: { marginLeft: 8, fontSize: 11, background: "#8a4fff", borderRadius: 4, padding: "2px 6px" },
  back: { background: "none", border: "none", color: "#b794ff", cursor: "pointer", marginBottom: 12, padding: 0 },
};
