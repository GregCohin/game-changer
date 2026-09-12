import { useEffect, useState } from "react";
import { getPlayerPortalData, addJournalEntry, joinCarpool, leaveCarpool } from "../lib/api";

export function PortailScreen({ player }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [journalText, setJournalText] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setData(null);
    getPlayerPortalData(player.id, player.team_id, player.season_id)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [player.id, refreshKey]);

  if (error) return <p style={{ color: "#ff6b6b" }}>Erreur : {error}</p>;
  if (!data) return <p>Chargement…</p>;

  async function handleAddJournal(e) {
    e.preventDefault();
    if (!journalText.trim()) return;
    await addJournalEntry(player.id, journalText.trim());
    setJournalText("");
    setRefreshKey((k) => k + 1);
  }

  async function handleJoinCarpool(offerId) {
    await joinCarpool(offerId, player.id, `${player.first_name} ${player.last_name}`);
    setRefreshKey((k) => k + 1);
  }

  async function handleLeaveCarpool(passengerRowId) {
    await leaveCarpool(passengerRowId);
    setRefreshKey((k) => k + 1);
  }

  const activeInjury = data.injuries.find((i) => i.status === "en cours");

  return (
    <div>
      <section style={styles.section}>
        <h2 style={styles.h2}>Statut</h2>
        {activeInjury ? (
          <p>Blessure en cours — étape : {activeInjury.rtp_stage || "arrêt complet"}</p>
        ) : (
          <p>Aucune blessure en cours.</p>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Objectifs de développement</h2>
        {data.goals.length === 0 && <p>Aucun objectif renseigné.</p>}
        {data.goals.map((g) => (
          <div key={g.id} style={styles.card}>{g.label} — {g.status || "en cours"}</div>
        ))}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Séances à venir</h2>
        {data.sessions.length === 0 && <p>Aucune séance programmée.</p>}
        {data.sessions.map((s) => (
          <div key={s.id} style={styles.card}>{s.date} — {s.label}</div>
        ))}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Derniers matchs</h2>
        {data.matchStats.length === 0 && <p>Aucun match clôturé pour l'instant.</p>}
        {data.matchStats.map((m) => (
          <div key={m.id} style={styles.card}>
            {m.matches?.name || "Match"} ({m.matches?.date}) — {m.buts} but(s), {m.passes_decisives} passe(s) décisive(s)
          </div>
        ))}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Carnet de bord</h2>
        <form onSubmit={handleAddJournal} style={{ marginBottom: 12 }}>
          <textarea
            value={journalText}
            onChange={(e) => setJournalText(e.target.value)}
            placeholder="Ajouter une note…"
            style={styles.textarea}
          />
          <button type="submit" style={styles.button}>Ajouter</button>
        </form>
        {data.journal.map((j) => (
          <div key={j.id} style={styles.card}>{j.date} — {j.content}</div>
        ))}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Covoiturage</h2>
        {data.carpoolOffers.length === 0 && <p>Aucune offre de covoiturage pour l'instant.</p>}
        {data.carpoolOffers.map((offer) => {
          const passengers = offer.carpool_passengers || [];
          const mine = passengers.find((p) => p.player_id === player.id);
          const full = passengers.length >= offer.seats_total;
          return (
            <div key={offer.id} style={styles.card}>
              <div>{offer.event_label} — {offer.date} — conducteur : {offer.driver_name}</div>
              <div>{passengers.length}/{offer.seats_total} places prises</div>
              {mine ? (
                <button style={styles.button} onClick={() => handleLeaveCarpool(mine.id)}>Quitter</button>
              ) : (
                <button style={styles.button} disabled={full} onClick={() => handleJoinCarpool(offer.id)}>
                  {full ? "Complet" : "Rejoindre"}
                </button>
              )}
            </div>
          );
        })}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>FAQ</h2>
        {data.faq.map((f) => (
          <div key={f.id} style={styles.card}>
            <strong>{f.question}</strong>
            <p>{f.answer}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

const styles = {
  section: { marginBottom: 24 },
  h2: { fontSize: 16, marginBottom: 8, color: "#ccc" },
  card: { background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 10, marginBottom: 8 },
  textarea: { width: "100%", minHeight: 60, padding: 8, borderRadius: 6, border: "1px solid #444", boxSizing: "border-box", marginBottom: 8 },
  button: { padding: "6px 12px", borderRadius: 6, border: "none", background: "#8a4fff", color: "white", cursor: "pointer" },
};
