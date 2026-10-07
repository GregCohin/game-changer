import { useEffect, useRef, useState } from "react";
import { getPlayerPortalData, addJournalEntry, joinCarpool, leaveCarpool } from "../lib/api";
import { formatDateFr, todayIso } from "../../lib/utils";
import { describeError } from "../lib/errors";
import {
  formatDateRange, formatDayFr, formatTimeRange, groupPrograms, recentMatchStats, sortJournal,
  upcomingCarpoolOffers, upcomingEvents, upcomingFixtures, upcomingSessions,
} from "../lib/portalView";
import { ErrorNotice, Field, ui, useAsyncAction } from "../ui";

// Libellés du retour au jeu : mêmes que RTP_STAGES dans src/App.jsx, recopiés ici parce que l'app
// parent n'importe jamais App.jsx (35 000 lignes) pour rester légère. Une étape inconnue n'est
// jamais affichée telle quelle au parent (voir le statut plus bas).
const RTP_STAGE_LABELS = {
  arret_complet: "Arrêt complet",
  reathletisation: "Réathlétisation individuelle (hors groupe)",
  reprise_partielle: "Reprise partielle avec le groupe",
  reprise_complete: "Reprise complète, disponible",
};

// « a — b — c » sans tiret orphelin quand une partie est absente (séance sans nom, offre sans date).
const dash = (...parts) => parts.filter(Boolean).join(" — ");

// Au-delà de `initial` éléments, le reste se déplie à la demande : sur un téléphone, une saison entière
// de séances ou de matchs ferait défiler la page pendant une minute.
function ShowMore({ items, initial, render }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, initial);
  return (
    <>
      {shown.map(render)}
      {items.length > initial && (
        <button type="button" style={ui.linkButton} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Voir moins" : items.length - initial === 1 ? "Voir le suivant" : `Voir les ${items.length - initial} suivants`}
        </button>
      )}
    </>
  );
}

function Section({ title, children }) {
  return (
    <section style={ui.section}>
      <h2 style={ui.h2}>{title}</h2>
      {children}
    </section>
  );
}

export function PortailScreen({ player }) {
  const [loaded, setLoaded] = useState(null); // { playerId, data }
  const [loadError, setLoadError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false; // une réponse tardive d'un autre enfant ne doit pas écraser celui qu'on regarde
    setLoadError(null);
    getPlayerPortalData(player.id, player.team_id, player.season_id)
      .then((data) => { if (!cancelled) setLoaded({ playerId: player.id, data }); })
      .catch((e) => { if (!cancelled) setLoadError(describeError(e)); });
    return () => { cancelled = true; };
  }, [player.id, player.team_id, player.season_id, refreshKey]);

  if (loadError) return <ErrorNotice error={loadError} onRetry={refresh} />;
  // Les données déjà affichées restent à l'écran pendant un rechargement (après un envoi, par exemple) :
  // pas de « Chargement… » qui ferait remonter la page. On ne les masque que pour un autre enfant.
  if (!loaded || loaded.playerId !== player.id) return <p>Chargement…</p>;

  const { data } = loaded;
  const today = todayIso();

  const activeInjury = data.injuries.find((i) => i.status === "en cours");
  const rtpLabel = activeInjury ? RTP_STAGE_LABELS[activeInjury.rtp_stage || "arret_complet"] : null;

  const fixtures = upcomingFixtures(data.fixtures, today);
  const sessions = upcomingSessions(data.sessions, today);
  const events = upcomingEvents(data.events, today, player.team_id);
  const programGroups = groupPrograms(data.programs);
  const matches = recentMatchStats(data.matchStats);

  return (
    <div>
      <Section title="Statut">
        {activeInjury ? <p>{dash("Blessure en cours", rtpLabel)}</p> : <p>Aucune blessure en cours.</p>}
      </Section>

      <Section title="Prochains matchs">
        {fixtures.length === 0 && <p style={ui.empty}>Aucun match programmé pour l'instant.</p>}
        <ShowMore items={fixtures} initial={5} render={(f) => (
          <div key={f.id} style={ui.card}>
            <strong>{f.opponent ? `vs ${f.opponent}` : "Match"}</strong>
            <div>{dash(formatDayFr(f.date), f.location)}</div>
            {f.competitions?.name && <div style={ui.meta}>{f.competitions.name}</div>}
          </div>
        )} />
      </Section>

      <Section title="Séances à venir">
        {sessions.length === 0 && <p style={ui.empty}>Aucune séance programmée.</p>}
        <ShowMore items={sessions} initial={5} render={(s) => (
          <div key={s.id} style={ui.card}>{dash(formatDayFr(s.date), formatTimeRange(s.start_time, s.end_time), s.label)}</div>
        )} />
      </Section>

      <Section title="Événements du club">
        {events.length === 0 && <p style={ui.empty}>Aucun événement à venir.</p>}
        <ShowMore items={events} initial={5} render={(e) => (
          <div key={e.id} style={ui.card}>
            <strong>{e.title}</strong>
            <div>{dash(formatDateRange(e.date, e.end_date), formatTimeRange(e.start_time, e.end_time), e.location)}</div>
          </div>
        )} />
      </Section>

      <Section title="Objectifs de développement">
        {data.goals.length === 0 && <p style={ui.empty}>Aucun objectif renseigné.</p>}
        {data.goals.map((g) => (
          <div key={g.id} style={ui.card}>{g.label} — {g.status || "en cours"}</div>
        ))}
      </Section>

      <Section title="Programme individuel">
        {programGroups.length === 0 && <p style={ui.empty}>Aucun programme individuel pour l'instant.</p>}
        {programGroups.map((group) => (
          <div key={group.theme}>
            <h3 style={{ fontSize: 14, margin: "8px 0 6px", color: "#b9c2bd" }}>{group.label}</h3>
            {group.items.map((item) => (
              <div key={item.id} style={ui.card}>
                <strong>{item.name}</strong>
                {item.frequency && <div>{item.frequency}</div>}
                {item.objectiveTitle && <div style={ui.meta}>Pour l'objectif : {item.objectiveTitle}</div>}
              </div>
            ))}
          </div>
        ))}
      </Section>

      <Section title="Derniers matchs">
        {matches.length === 0 && <p style={ui.empty}>Aucun match clôturé pour l'instant.</p>}
        <ShowMore items={matches} initial={5} render={(m) => (
          <div key={m.id} style={ui.card}>
            {m.matches?.name || "Match"} ({formatDateFr(m.matches?.date)}) — {m.buts} but(s), {m.passes_decisives} passe(s) décisive(s)
          </div>
        )} />
      </Section>

      <JournalSection player={player} entries={sortJournal(data.journal)} onChanged={refresh} />
      <CarpoolSection player={player} offers={upcomingCarpoolOffers(data.carpoolOffers, today)} onChanged={refresh} />

      <Section title="FAQ">
        {data.faq.length === 0 && <p style={ui.empty}>Aucune question pour l'instant.</p>}
        {data.faq.map((f) => (
          <div key={f.id} style={ui.card}>
            <strong>{f.question}</strong>
            <p>{f.answer}</p>
          </div>
        ))}
      </Section>
    </div>
  );
}

function JournalSection({ player, entries, onChanged }) {
  const [text, setText] = useState("");
  const draftId = useRef(null); // identifiant de la note en cours d'envoi, conservé tant qu'elle n'est pas partie
  const { run, busy, error } = useAsyncAction();

  async function handleSubmit(e) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    const id = draftId.current || (draftId.current = crypto.randomUUID());
    const ok = await run(() => addJournalEntry(player.id, content, id));
    if (ok) {
      draftId.current = null;
      setText("");
      onChanged();
    }
  }

  return (
    <Section title="Carnet de bord">
      <form onSubmit={handleSubmit} style={{ marginBottom: 12 }}>
        <Field id="journal-note" label="Ajouter une note">
          <textarea
            id="journal-note"
            value={text}
            onChange={(e) => { setText(e.target.value); draftId.current = null; }}
            style={ui.textarea}
          />
        </Field>
        <button type="submit" style={ui.button} disabled={busy}>{busy ? "Envoi…" : "Ajouter"}</button>
      </form>
      <ErrorNotice error={error} />
      {entries.map((j) => (
        <div key={j.id} style={ui.card}>{dash(formatDateFr(j.date), j.content)}</div>
      ))}
    </Section>
  );
}

// Erreurs de covoiturage que le parent doit comprendre : la base refuse une offre complète (trigger)
// ou un enfant déjà inscrit (contrainte d'unicité).
function explainCarpoolError(err) {
  if (err && err.code === "23505") return { kind: "conflict", title: "Déjà inscrit", text: "Cet enfant est déjà inscrit à ce covoiturage.", detail: "" };
  if (err && /complète/i.test(err.message || "")) return { kind: "conflict", title: "Offre complète", text: "Désolé, cette offre de covoiturage vient d'être complète.", detail: "" };
  return describeError(err);
}

function CarpoolSection({ player, offers, onChanged }) {
  const { run, busy, error } = useAsyncAction();
  const childName = `${player.first_name} ${player.last_name}`.trim();

  // Quel que soit le résultat, on recharge : le parent voit l'état réel des places, pas celui qu'il croyait.
  async function join(offerId) {
    await run(() => joinCarpool(offerId, player.id, childName), explainCarpoolError);
    onChanged();
  }
  async function leave(passengerRowId) {
    await run(() => leaveCarpool(passengerRowId));
    onChanged();
  }

  return (
    <Section title="Covoiturage">
      <ErrorNotice error={error} />
      {offers.length === 0 && <p style={ui.empty}>Aucune offre de covoiturage pour l'instant.</p>}
      {offers.map((offer) => {
        const passengers = offer.carpool_passengers || [];
        const mine = passengers.find((p) => p.player_id === player.id);
        const full = passengers.length >= offer.seats_total;
        return (
          <div key={offer.id} style={ui.card}>
            <div>{dash(offer.event_label, formatDayFr(offer.date), `conducteur : ${offer.driver_name}`)}</div>
            <div>{passengers.length}/{offer.seats_total} places prises</div>
            {mine ? (
              <button type="button" style={ui.cardButton} disabled={busy} onClick={() => leave(mine.id)}>Quitter</button>
            ) : (
              <button type="button" style={ui.cardButton} disabled={busy || full} onClick={() => join(offer.id)}>
                {full ? "Complet" : "Rejoindre"}
              </button>
            )}
          </div>
        );
      })}
    </Section>
  );
}
