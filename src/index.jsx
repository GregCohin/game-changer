// Écran d'accueil et ses widgets — extrait de App.jsx (séparation des fichiers, sans
// changement de comportement). QuickBackupButton reste défini dans App.jsx (utilisé aussi
// par le menu latéral) et est reçu ici en prop plutôt qu'importé, pour éviter toute
// dépendance circulaire entre les deux fichiers.

import { useState, useEffect } from "react";
import { formatDateFr, todayIso } from "../lib/utils.js";

function WeekAgenda({ events, setSection }) {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  const byDate = {};
  events.forEach((ev) => { (byDate[ev.date] || (byDate[ev.date] = [])).push(ev); });
  const hasAny = days.some((d) => byDate[d] && byDate[d].length > 0);

  return (
    <div>
      <div className="panel-heading">Cette semaine</div>
      {!hasAny && <div className="empty-state">Aucun événement dans les 7 prochains jours.</div>}
      <div className="week-agenda">
        {days.map((d) => {
          const dayEvents = byDate[d] || [];
          const dateObj = new Date(d);
          const isToday = d === todayIso();
          return (
            <div key={d} className={`week-agenda-day ${isToday ? "today" : ""}`}>
              <div className="week-agenda-date">{dateObj.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</div>
              {dayEvents.length === 0 ? (
                <div className="week-agenda-empty">—</div>
              ) : (
                dayEvents.map((ev, i) => (
                  <button key={i} className="week-agenda-item" onClick={() => setSection(ev.type === "seance" ? "sessions" : "competitions")}>
                    <i className="dot" style={{ background: EVENT_TYPE_INFO[ev.type].color, width: 7, height: 7, borderRadius: "50%", display: "inline-block", marginRight: 6 }} />
                    {ev.title}
                  </button>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccueilCalendar({ events, setSection, reducedAvailabilityDays }) {
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDate = {};
  events.forEach((ev) => { (byDate[ev.date] || (byDate[ev.date] = [])).push(ev); });

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = viewDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const dateStr = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const selectedEvents = selectedDate ? (byDate[selectedDate] || []) : [];

  return (
    <div>
      <div className="calendar-nav">
        <button className="icon-btn" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Mois précédent">‹</button>
        <span className="calendar-month-label">{monthLabel}</span>
        <button className="icon-btn" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Mois suivant">›</button>
      </div>
      <div className="calendar-legend">
        {Object.entries(EVENT_TYPE_INFO).map(([key, info]) => (
          <span key={key} className="calendar-legend-item"><i className="dot" style={{ background: info.color }} />{info.label}</span>
        ))}
        {reducedAvailabilityDays && reducedAvailabilityDays.size > 0 && (
          <span className="calendar-legend-item"><i className="dot calendar-legend-avail" />Disponibilité réduite</span>
        )}
      </div>
      <div className="calendar-grid">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => <div key={d} className="calendar-dow">{d}</div>)}
        {cells.map((d, i) => {
          if (d == null) return <div key={i} className="calendar-day empty" />;
          const ds = dateStr(d);
          const dayEvents = byDate[ds] || [];
          const isToday = ds === todayIso();
          const reduced = reducedAvailabilityDays && reducedAvailabilityDays.has(ds);
          return (
            <div key={i} className={`calendar-day ${isToday ? "today" : ""} ${selectedDate === ds ? "selected" : ""} ${reduced ? "calendar-day-reduced" : ""}`} onClick={() => setSelectedDate(ds === selectedDate ? null : ds)}>
              <div className="calendar-day-num">{d}</div>
              <div className="calendar-day-dots">
                {dayEvents.map((ev, j) => <span key={j} className="calendar-dot" style={{ background: EVENT_TYPE_INFO[ev.type].color }} />)}
              </div>
            </div>
          );
        })}
      </div>
      {selectedDate && (
        <div className="new-match-card" style={{ marginTop: 16 }}>
          <div className="panel-heading" style={{ marginTop: 0 }}>{formatDateFr(selectedDate)}</div>
          {selectedEvents.length === 0 && <div className="empty-state">Aucun événement ce jour-là.</div>}
          {selectedEvents.map((ev, i) => (
            <div className="scout-obs-row" key={i}>
              <span><i className="dot" style={{ background: EVENT_TYPE_INFO[ev.type].color, marginRight: 8, display: "inline-block", width: 8, height: 8, borderRadius: "50%" }} />{EVENT_TYPE_INFO[ev.type].label} — {ev.title}</span>
              <button className="btn btn-ghost btn-small" onClick={() => setSection(ev.type === "seance" ? "sessions" : "competitions")}>Voir</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ACCUEIL_WIDGET_TYPES = [
  { id: "prochain_match", label: "Prochain match" },
  { id: "dernier_match", label: "Dernier match joué" },
  { id: "prochaine_seance", label: "Prochaine séance" },
  { id: "derniere_seance", label: "Dernière séance" },
  { id: "alertes", label: "Alertes" },
  { id: "dernier_rapport", label: "Dernier rapport de match" },
  { id: "classement", label: "Classement championnat" },
  { id: "causerie", label: "Causerie" },
  { id: "raccourcis", label: "Raccourcis rapides" },
  { id: "meteo", label: "Météo" },
  { id: "sauvegarde", label: "Sauvegarde" },
];
const DEFAULT_WIDGET_LAYOUT = ACCUEIL_WIDGET_TYPES.map((w) => w.id);

function WidgetMeteo() {
  const [weather, setWeather] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [error, setError] = useState(false);
  const [activeDay, setActiveDay] = useState(0); // jour affiché dans le bloc principal (0 = aujourd'hui)
  const [detailMode, setDetailMode] = useState("jour"); // jour | matin_am | horaire

  useEffect(() => {
    if (!navigator.geolocation) { setError(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min&hourly=temperature_2m,weathercode&timezone=auto&forecast_days=7`)
          .then((r) => r.json())
          .then((data) => { setWeather(data.daily); setHourly(data.hourly); })
          .catch(() => setError(true));
      },
      () => setError(true)
    );
  }, []);

  const WEATHER_CODE_LABELS = {
    0: "Ciel dégagé", 1: "Plutôt dégagé", 2: "Partiellement nuageux", 3: "Couvert",
    45: "Brouillard", 48: "Brouillard givrant", 51: "Bruine légère", 53: "Bruine", 55: "Bruine forte",
    61: "Pluie légère", 63: "Pluie", 65: "Pluie forte", 71: "Neige légère", 73: "Neige", 75: "Neige forte",
    80: "Averses légères", 81: "Averses", 82: "Averses violentes", 95: "Orage",
  };
  const WEATHER_CODE_EMOJIS = {
    0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
    45: "🌫️", 48: "🌫️", 51: "🌦️", 53: "🌦️", 55: "🌧️",
    61: "🌦️", 63: "🌧️", 65: "🌧️", 71: "🌨️", 73: "❄️", 75: "❄️",
    80: "🌦️", 81: "🌧️", 82: "⛈️", 95: "⛈️",
  };
  function weatherEmoji(code) { return WEATHER_CODE_EMOJIS[code] || "🌡️"; }

  function dayAbbrev(iso, index) {
    if (index === 0) return "Auj.";
    try { return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", ""); } catch (e) { return "?"; }
  }
  // hourly.time est un tableau plat de 168 heures (24 x 7 jours), heure 0 = minuit du jour 0 —
  // donc l'heure H du jour `dayIndex` est toujours à l'indice dayIndex*24 + H, sans avoir à
  // reparcourir les timestamps un par un.
  function hourIndexFor(dayIndex, hour) { return dayIndex * 24 + hour; }

  return (
    <>
      {error && <div className="gameplan-empty">Localisation indisponible pour la météo.</div>}
      {!error && !weather && <div className="gameplan-empty">Chargement…</div>}
      {weather && (
        <>
          {detailMode === "jour" && (
            <>
              <div className="dashboard-card-main">{weatherEmoji(weather.weathercode[activeDay])} {WEATHER_CODE_LABELS[weather.weathercode[activeDay]] || "—"}</div>
              <div className="dashboard-card-meta">{Math.round(weather.temperature_2m_min[activeDay])}° / {Math.round(weather.temperature_2m_max[activeDay])}°</div>
            </>
          )}
          {detailMode === "matin_am" && hourly && (
            <div className="dashboard-card-meta" style={{ display: "flex", gap: 16 }}>
              <span>Matin : {weatherEmoji(hourly.weathercode[hourIndexFor(activeDay, 9)])} {Math.round(hourly.temperature_2m[hourIndexFor(activeDay, 9)])}°</span>
              <span>Après-midi : {weatherEmoji(hourly.weathercode[hourIndexFor(activeDay, 15)])} {Math.round(hourly.temperature_2m[hourIndexFor(activeDay, 15)])}°</span>
            </div>
          )}
          {detailMode === "horaire" && hourly && (
            <div className="home-actions-row" style={{ flexWrap: "wrap", gap: 4 }}>
              {[8, 10, 12, 14, 16, 18, 20].map((h) => (
                <span key={h} className="dashboard-card-meta" style={{ minWidth: 60 }}>{h}h {weatherEmoji(hourly.weathercode[hourIndexFor(activeDay, h)])} {Math.round(hourly.temperature_2m[hourIndexFor(activeDay, h)])}°</span>
              ))}
            </div>
          )}

          <div className="home-actions-row" style={{ marginTop: 8, gap: 4 }} onMouseLeave={() => setActiveDay(0)}>
            {weather.time.map((iso, i) => (
              <button
                key={iso}
                className={`btn btn-ghost btn-small ${activeDay === i ? "selected" : ""}`}
                style={{ padding: "2px 6px", minWidth: 0, ...(activeDay === i ? { background: "rgba(255,255,255,0.15)", fontWeight: 600 } : {}) }}
                onMouseEnter={() => setActiveDay(i)}
                onClick={(e) => { e.stopPropagation(); setActiveDay(i); }}
              >
                {dayAbbrev(iso, i)} {weatherEmoji(weather.weathercode[i])}
              </button>
            ))}
          </div>
          <div className="home-actions-row" style={{ marginTop: 4, gap: 4 }}>
            <button className={`btn btn-ghost btn-small ${detailMode === "jour" ? "selected" : ""}`} onClick={(e) => { e.stopPropagation(); setDetailMode("jour"); }}>Jour</button>
            <button className={`btn btn-ghost btn-small ${detailMode === "matin_am" ? "selected" : ""}`} onClick={(e) => { e.stopPropagation(); setDetailMode("matin_am"); }}>Matin/Après-midi</button>
            <button className={`btn btn-ghost btn-small ${detailMode === "horaire" ? "selected" : ""}`} onClick={(e) => { e.stopPropagation(); setDetailMode("horaire"); }}>Heure par heure</button>
          </div>
        </>
      )}
    </>
  );
}

function WidgetRaccourcis({ setSection }) {
  function goSeance() {
    try { localStorage.setItem("tf_seance_quick_create", "1"); } catch (e) {}
    setSection("sessions");
  }
  function goCauserie() {
    try { localStorage.setItem("tf_causerie_quick_create", "1"); } catch (e) {}
    setSection("causerie");
  }
  function goHooper() {
    setSection("medical");
  }
  return (
    <div className="home-actions-row" style={{ flexWrap: "wrap" }}>
      <button className="btn btn-ghost btn-small" onClick={(e) => { e.stopPropagation(); goSeance(); }}>+ Séance</button>
      <button className="btn btn-ghost btn-small" onClick={(e) => { e.stopPropagation(); goCauserie(); }}>+ Causerie</button>
      <button className="btn btn-ghost btn-small" onClick={(e) => { e.stopPropagation(); goHooper(); }}>+ Hooper</button>
    </div>
  );
}

function renderAccueilWidget(id, ctx) {
  switch (id) {
    case "prochain_match":
      return {
        title: "Prochain match", onClick: () => ctx.setSection("competitions"),
        body: ctx.upcomingFixture ? (
          <>
            <div className="dashboard-card-main">vs {ctx.upcomingFixture.opponent}</div>
            <div className="dashboard-card-meta">{formatDateFr(ctx.upcomingFixture.date)} · {ctx.upcomingFixture.venue}</div>
            <button className="btn btn-ghost btn-small" style={{ marginTop: 8 }} onClick={(e) => {
              e.stopPropagation();
              try { localStorage.setItem("tf_causerie_seed", JSON.stringify({ opponent: ctx.upcomingFixture.opponent, date: ctx.upcomingFixture.date })); } catch (err) {}
              ctx.setSection("causerie");
            }}>Préparer la causerie</button>
          </>
        ) : <div className="gameplan-empty">Aucun match programmé</div>,
      };
    case "dernier_match":
      return {
        title: "Dernier match joué", onClick: () => ctx.setSection("competitions"),
        body: ctx.lastPlayedFixture ? (
          <>
            <div className="dashboard-card-main">{ctx.lastPlayedFixture.ourScore} - {ctx.lastPlayedFixture.theirScore} vs {ctx.lastPlayedFixture.opponent}</div>
            <div className="dashboard-card-meta">{formatDateFr(ctx.lastPlayedFixture.date)}</div>
          </>
        ) : <div className="gameplan-empty">Aucun résultat enregistré</div>,
      };
    case "prochaine_seance":
      return {
        title: "Prochaine séance", onClick: () => ctx.setSection("sessions"),
        body: (
          <>
            {ctx.upcomingSession ? (
              <>
                <div className="dashboard-card-main">{ctx.upcomingSession.name}</div>
                <div className="dashboard-card-meta">{formatDateFr(ctx.upcomingSession.date)}</div>
              </>
            ) : <div className="gameplan-empty">Aucune séance planifiée</div>}
            {ctx.upcomingEnjeux && <div className="dashboard-card-meta" style={{ marginTop: 6 }}>Enjeu du prochain match : {ctx.upcomingEnjeux}</div>}
          </>
        ),
      };
    case "derniere_seance":
      return {
        title: "Dernière séance", onClick: () => ctx.setSection("sessions"),
        body: ctx.lastSession ? (
          <>
            <div className="dashboard-card-main">{ctx.lastSession.name}{ctx.lastSession.rating && ctx.lastSession.rating.coachScore ? ` — ${ctx.lastSession.rating.coachScore}/10` : ""}</div>
            <div className="dashboard-card-meta">{formatDateFr(ctx.lastSession.date)}</div>
          </>
        ) : <div className="gameplan-empty">Aucune séance passée</div>,
      };
    case "alertes":
      return {
        title: "Alertes", onClick: () => ctx.setSection(ctx.alerts[0] ? ctx.alerts[0].section : "medical"),
        body: (
          <>
            <div className="dashboard-card-main">{ctx.missingHooper.length} joueur{ctx.missingHooper.length > 1 ? "s" : ""} sans Hooper aujourd'hui</div>
            <div className="dashboard-card-meta">{ctx.activeInjuries.length} blessure{ctx.activeInjuries.length > 1 ? "s" : ""} en cours{ctx.activeInjuries.length > 0 ? ` (${ctx.activeInjuries.map((i) => { const p = ctx.roster.find((r) => r.id === i.playerId); return p ? playerFullName(p) : "?"; }).join(", ")})` : ""}</div>
            {ctx.fatigueRisks.length > 0 && <div className="dashboard-card-meta">{ctx.fatigueRisks.length} joueur{ctx.fatigueRisks.length > 1 ? "s" : ""} en zone de vigilance (charge/fatigue)</div>}
            {ctx.alerts.slice(0, 3).map((a, i) => <div key={i} className="dashboard-card-meta">{a.label}</div>)}
            {ctx.alerts.length > 3 && <div className="dashboard-card-meta">+ {ctx.alerts.length - 3} autre(s)</div>}
          </>
        ),
      };
    case "dernier_rapport":
      return {
        title: "Dernier rapport de match", onClick: () => ctx.setSection("reports"),
        body: ctx.lastReport && ctx.signals ? (
          <>
            <div className="dashboard-card-main">{ctx.lastReport.match.name}</div>
            <div className="dashboard-card-meta">
              {ctx.signals.positivesCollective[0] ? `+ ${ctx.signals.positivesCollective[0].text}` : "Pas assez de données pour un signal"}
              {ctx.signals.negativesCollective[0] ? ` · − ${ctx.signals.negativesCollective[0].text}` : ""}
            </div>
          </>
        ) : <div className="gameplan-empty">Aucun match clôturé pour l'instant</div>,
      };
    case "classement":
      return {
        title: "Classement championnat", onClick: () => ctx.setSection("competitions"),
        body: ctx.standings.length > 0 ? (
          <div className="table-scroll">
            <table className="stat-table">
              <thead><tr><th>#</th><th>Équipe</th><th>Pts</th></tr></thead>
              <tbody>{ctx.standings.slice(0, 5).map((t, i) => <tr key={t.id}><td>{i + 1}</td><td>{t.team}</td><td>{t.points}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <div className="gameplan-empty">Classement pas encore renseigné</div>,
      };
    case "causerie":
      return {
        title: "Causerie", onClick: () => ctx.setSection("causerie"),
        body: ctx.nextCauserie ? (
          <>
            <div className="dashboard-card-main">{ctx.nextCauserie.name}</div>
            <div className="dashboard-card-meta">{formatDateFr(ctx.nextCauserie.date)}{ctx.nextCauserie.opponent ? ` · vs ${ctx.nextCauserie.opponent}` : ""}</div>
          </>
        ) : <div className="gameplan-empty">Aucune causerie à préparer</div>,
      };
    case "raccourcis":
      return { title: "Raccourcis rapides", onClick: null, body: <WidgetRaccourcis setSection={ctx.setSection} /> };
    case "meteo":
      return { title: "Météo du jour", onClick: null, body: <WidgetMeteo /> };
    case "sauvegarde":
      return { title: "Sauvegarde", onClick: null, body: <ctx.QuickBackupButton compact /> };
    default:
      return null;
  }
}

export function AccueilScreen({ matches, roster, setSection, QuickBackupButton }) {
  const [comp, setComp] = useState(emptyCompetitionsData());
  const [sessions, setSessions] = useState([]);
  const [clubEvents, setClubEvents] = useState([]);
  const [wellness, setWellness] = useState([]);
  const [rpeLog, setRpeLog] = useState([]);
  const [injuries, setInjuries] = useState([]);
  const [gameplan, setGameplan] = useState(emptyGameplanData());
  const [lastReport, setLastReport] = useState(null);
  const [healthProfiles, setHealthProfiles] = useState({});
  const [devPlans, setDevPlans] = useState({});
  const [causeries, setCauseries] = useState([]);
  const [allFullMatches, setAllFullMatches] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [widgetLayout, setWidgetLayout] = useState({ visible: DEFAULT_WIDGET_LAYOUT, hidden: [] });
  const [customizing, setCustomizing] = useState(false);

  function persistLayout(next) {
    setWidgetLayout(next);
    try { localStorage.setItem("tf_accueil_widgets", JSON.stringify(next)); } catch (e) {}
  }
  function toggleWidget(id) {
    persistLayout(
      widgetLayout.visible.includes(id)
        ? { visible: widgetLayout.visible.filter((x) => x !== id), hidden: [...widgetLayout.hidden, id] }
        : { visible: [...widgetLayout.visible, id], hidden: widgetLayout.hidden.filter((x) => x !== id) }
    );
  }
  function moveWidget(id, dir) {
    const idx = widgetLayout.visible.indexOf(id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= widgetLayout.visible.length) return;
    const next = [...widgetLayout.visible];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    persistLayout({ ...widgetLayout, visible: next });
  }

  useEffect(() => {
    setComp(loadCompetitionsData());
    try {
      const rawLayout = localStorage.getItem("tf_accueil_widgets");
      if (rawLayout) {
        const parsed = JSON.parse(rawLayout);
        const known = new Set(ACCUEIL_WIDGET_TYPES.map((w) => w.id));
        const visible = (parsed.visible || []).filter((id) => known.has(id));
        const accountedFor = new Set([...visible, ...(parsed.hidden || [])]);
        const newlyAdded = ACCUEIL_WIDGET_TYPES.map((w) => w.id).filter((id) => !accountedFor.has(id));
        setWidgetLayout({ visible: [...visible, ...newlyAdded], hidden: (parsed.hidden || []).filter((id) => known.has(id)) });
      }
    } catch (e) {}
    try { setSessions(JSON.parse(localStorage.getItem("tf_sessions") || "[]")); } catch (e) { setSessions([]); }
    try { setClubEvents(JSON.parse(localStorage.getItem("tf_club_events") || "[]")); } catch (e) { setClubEvents([]); }
    try { setWellness(JSON.parse(localStorage.getItem("tf_medical_wellness") || "[]")); } catch (e) { setWellness([]); }
    try { setRpeLog(JSON.parse(localStorage.getItem("tf_medical_rpe") || "[]")); } catch (e) { setRpeLog([]); }
    try { setInjuries(JSON.parse(localStorage.getItem("tf_medical_injuries") || "[]")); } catch (e) { setInjuries([]); }
    try { setHealthProfiles(JSON.parse(localStorage.getItem("tf_medical_health_profiles") || "{}")); } catch (e) { setHealthProfiles({}); }
    try { setDevPlans(JSON.parse(localStorage.getItem("tf_development_plans") || "{}")); } catch (e) { setDevPlans({}); }
    try { setCauseries(JSON.parse(localStorage.getItem("tf_causeries") || "[]")); } catch (e) { setCauseries([]); }
    try {
      const rawGp = localStorage.getItem("tf_gameplan");
      if (rawGp) setGameplan({ ...emptyGameplanData(), ...JSON.parse(rawGp) });
    } catch (e) {}

    const full = matches
      .map((m) => {
        return readMatchFromCache(m.id);
      })
      .filter((m) => m && m.closed)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (full.length > 0) {
      const report = computeMatchReport(full[0]);
      setLastReport({ match: full[0], report });
    }
    try {
      const obsIdx = JSON.parse(localStorage.getItem("tf_obs_matches_index") || "[]");
      const obsFull = obsIdx.map((m) => readObsMatchFromCache(m.id)).filter((m) => m && m.closed);
      setAllFullMatches([...full, ...obsFull]);
    } catch (e) {
      setAllFullMatches(full);
    }
    setLoaded(true);
  }, [matches]);

  if (!loaded) return <div className="stats-screen"><div className="empty-state">Chargement…</div></div>;

  const events = buildAccueilEvents(comp, sessions, clubEvents);
  const allFixtures = comp.competitions.flatMap((c) => c.fixtures);
  const upcomingFixture = allFixtures.filter((f) => !fixtureIsPlayed(f)).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const lastPlayedFixture = allFixtures.filter((f) => fixtureIsPlayed(f)).sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  const todayS = todayIso();
  const upcomingSession = [...sessions].filter((s) => s.date >= todayS).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const lastSession = [...sessions].filter((s) => s.date < todayS).sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  const todayHooperIds = new Set(wellness.filter((w) => w.date === todayS).map((w) => w.playerId));
  const missingHooper = roster.filter((p) => !todayHooperIds.has(p.id));
  const activeInjuries = injuries.filter((i) => i.status === "en cours");
  const fatigueRisks = detectFatigueRisk(roster, wellness, rpeLog, 7);

  const mainChampionnat = comp.competitions.find((c) => c.type === "championnat");
  const standings = (mainChampionnat ? mainChampionnat.standings : []).map((t) => ({ ...t, points: Number(t.wins || 0) * 3 + Number(t.draws || 0), gd: Number(t.goalsFor || 0) - Number(t.goalsAgainst || 0) }))
    .sort((a, b) => b.points - a.points || b.gd - a.gd);

  const hoursSince = (dateStr) => (new Date(todayS) - new Date(dateStr)) / 36e5;

  // Alertes Compétitions : score à renseigner 24h après la date, ou match tagué pas encore recalculé
  const alerts = [];
  comp.competitions.forEach((c) => {
    c.fixtures.forEach((f) => {
      if (!fixtureIsPlayed(f) && hoursSince(f.date) >= 24) {
        alerts.push({ label: `Score à renseigner : ${c.name} vs ${f.opponent} (${formatDateFr(f.date)})`, section: "competitions" });
      }
    });
    const linked = allFullMatches.filter((m) => m.competitionId === c.id);
    const notCounted = linked.filter((m) => !(c.countedMatchIds || []).includes(m.id) && hoursSince(m.date) >= 24);
    if (notCounted.length > 0) {
      alerts.push({ label: `${c.name} : ${notCounted.length} match(s) tagué(s) pas encore recalculé(s)`, section: "competitions" });
    }
  });

  // Alerte Observation : adversaire à venir jamais observé, dans les 7 jours
  if (upcomingFixture) {
    const daysUntil = (new Date(upcomingFixture.date) - new Date(todayS)) / 86400000;
    if (daysUntil >= 0 && daysUntil <= 7) {
      const everObserved = allFullMatches.some((m) =>
        m.source === "observation" ? (m.teamA === upcomingFixture.opponent || m.teamB === upcomingFixture.opponent) : m.opponent === upcomingFixture.opponent
      );
      if (!everObserved) alerts.push({ label: `${upcomingFixture.opponent} n'a jamais été observé — match dans ${Math.ceil(daysUntil)} jour(s)`, section: "observation" });
    }
  }

  // Alerte Suivi médical : certificat médical bientôt expiré (30 jours)
  Object.entries(healthProfiles).forEach(([playerId, profile]) => {
    if (!profile.certificatMedicalDate) return;
    const daysUntil = (new Date(profile.certificatMedicalDate) - new Date(todayS)) / 86400000;
    if (daysUntil >= 0 && daysUntil <= 30) {
      const p = roster.find((r) => r.id === playerId);
      alerts.push({ label: `Certificat médical de ${p ? playerFullName(p) : "un joueur"} expire le ${formatDateFr(profile.certificatMedicalDate)}`, section: "squad" });
    }
  });

  // Alertes Développement : objectif proche du but (≥90%) ou en décrochage (≤ -10%)
  Object.entries(devPlans).forEach(([playerId, objectives]) => {
    const p = roster.find((r) => r.id === playerId);
    (objectives || []).forEach((o) => {
      if (o.status !== "En cours") return;
      const pct = objectiveProgressPct(o);
      if (pct == null) return;
      if (pct >= 90) alerts.push({ label: `${p ? playerFullName(p) : "?"} proche de son objectif "${o.title}" (${Math.round(pct)}%)`, section: "squad" });
      else if (pct <= -10) alerts.push({ label: `${p ? playerFullName(p) : "?"} s'éloigne de son objectif "${o.title}" (${Math.round(pct)}%)`, section: "squad" });
    });
  });

  // Alerte Causerie : bilan d'utilité pas encore renseigné, 24h après le match
  causeries.forEach((c) => {
    if (hoursSince(c.date) >= 24 && !c.usefulnessRating) {
      alerts.push({ label: `Note l'utilité de la préparation "${c.name}"`, section: "causerie" });
    }
    const hoursUntil = -hoursSince(c.date);
    const incomplete = c.sheets.length === 0 && !c.notes.trim();
    if (hoursUntil >= 0 && hoursUntil <= 24 && incomplete) {
      alerts.push({ label: `Finalise ta préparation pour "${c.name}" — match demain`, section: "causerie" });
    }
  });

  // Prochaine causerie à préparer (la plus proche dans le temps, aujourd'hui ou à venir)
  const nextCauserie = [...causeries].filter((c) => c.date >= todayS).sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  // Jours où la disponibilité est réduite (blessure ou suspension en cours), pour le calendrier
  const reducedAvailabilityDays = new Set();
  injuries.filter((i) => i.status === "en cours").forEach((i) => {
    const start = new Date(i.dateDebut);
    const end = new Date(start); end.setDate(start.getDate() + (Number(i.dureeEstimeeJours) || 0));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) reducedAvailabilityDays.add(d.toISOString().slice(0, 10));
  });

  const allStudioRaw = matches.map((m) => readMatchFromCache(m.id)).filter((m) => m);
  const upcomingStudioMatch = upcomingFixture ? allStudioRaw.find((m) => m.opponent === upcomingFixture.opponent && m.date === upcomingFixture.date) : null;
  const upcomingEnjeux = upcomingStudioMatch ? upcomingStudioMatch.enjeux : "";

  let signals = null;
  if (lastReport) signals = computeMatchSignals(lastReport.match, gameplan, roster);

  return (
    <div className="stats-screen">
      <div className="stats-screen-header">
        <div className="eyebrow">Game Changer</div>
        <h1>Accueil</h1>
        <p className="subtitle">Ton calendrier du mois et l'essentiel de chaque onglet, en un coup d'œil.</p>
      </div>

      <WeekAgenda events={events} setSection={setSection} />

      <div className="panel-heading" style={{ marginTop: 28 }}>Calendrier</div>
      <AccueilCalendar events={events} setSection={setSection} reducedAvailabilityDays={reducedAvailabilityDays} />

      <div className="range-filter-header" style={{ marginTop: 28 }}>
        <div className="panel-heading" style={{ marginBottom: 0 }}>À la une</div>
        <button className="btn btn-ghost btn-small no-print" onClick={() => setCustomizing((v) => !v)}>{customizing ? "Terminer" : "Personnaliser"}</button>
      </div>

      {customizing && (
        <div className="new-match-card no-print" style={{ marginBottom: 16 }}>
          <p className="hint" style={{ marginTop: 0 }}>Coche les widgets à afficher, utilise les flèches pour les réordonner.</p>
          {widgetLayout.visible.map((id, i) => {
            const w = ACCUEIL_WIDGET_TYPES.find((x) => x.id === id);
            if (!w) return null;
            return (
              <div key={id} className="scout-obs-row">
                <span><input type="checkbox" checked={true} onChange={() => toggleWidget(id)} style={{ marginRight: 8 }} />{w.label}</span>
                <span>
                  <button className="icon-btn" onClick={() => moveWidget(id, -1)} disabled={i === 0} aria-label="Monter">↑</button>
                  <button className="icon-btn" onClick={() => moveWidget(id, 1)} disabled={i === widgetLayout.visible.length - 1} aria-label="Descendre">↓</button>
                </span>
              </div>
            );
          })}
          {widgetLayout.hidden.map((id) => {
            const w = ACCUEIL_WIDGET_TYPES.find((x) => x.id === id);
            if (!w) return null;
            return (
              <div key={id} className="scout-obs-row" style={{ opacity: 0.6 }}>
                <span><input type="checkbox" checked={false} onChange={() => toggleWidget(id)} style={{ marginRight: 8 }} />{w.label}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="dashboard-cards">
        {widgetLayout.visible.map((id) => {
          const widgetCtx = {
            setSection, upcomingFixture, lastPlayedFixture, upcomingSession, upcomingEnjeux, lastSession,
            alerts, missingHooper, activeInjuries, fatigueRisks, roster, lastReport, signals, standings, nextCauserie,
            QuickBackupButton,
          };
          const w = renderAccueilWidget(id, widgetCtx);
          if (!w) return null;
          return (
            <div className="dashboard-card" key={id} onClick={w.onClick || undefined} style={{ cursor: w.onClick ? "pointer" : "default" }}>
              <div className="dashboard-card-title">{w.title}</div>
              {w.body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
