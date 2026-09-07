// Bibliothèque de ressources (livres, articles, podcasts, films) — extrait de App.jsx
// (séparation des fichiers, sans changement de comportement).

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { newId, todayIso } from "../lib/utils.js";

const LIBRARY_TYPES = ["Livre", "Article", "Podcast", "Films", "Formation", "Autre"];
const LIBRARY_STATUSES = ["À consulter", "En cours", "Terminé", "Référence permanente"];
const LIBRARY_THEME_SUGGESTIONS = ["Tactique", "Technique individuelle", "Sciences du sport", "Pédagogie / formation du jeune", "Préparation physique", "Psychologie du sport", "Gardien de but", "Analyse vidéo", "Management / leadership"];

function emptyLibraryEntry() {
  return { id: newId(), title: "", type: "Livre", theme: "", author: "", notes: "", status: "À consulter", favorite: false, dateAdded: todayIso() };
}

const LIBRARY_TABS = [
  { id: "Livre", label: "Livres", match: (t) => t === "Livre" },
  { id: "Article", label: "Articles", match: (t) => t === "Article" },
  { id: "Podcast", label: "Podcast", match: (t) => t === "Podcast" },
  { id: "Films", label: "Films", match: (t) => t === "Films" },
  { id: "autres", label: "Autres", match: (t) => !["Livre", "Article", "Podcast", "Films"].includes(t) },
];

// Rend une liste plafonnée avec un bouton "Afficher plus" — pour une bibliothèque qui ne se vide
// jamais et peut grossir sur plusieurs années sans qu'un simple filtre suffise.
function PaginatedGrid({ items, pageSize = 24, renderItem }) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  useEffect(() => { setVisibleCount(pageSize); }, [items.length, pageSize]);
  const visible = items.slice(0, visibleCount);
  const remaining = items.length - visible.length;
  return (
    <>
      <div className="roster-grid">{visible.map(renderItem)}</div>
      {remaining > 0 && (
        <button className="btn btn-ghost btn-small" onClick={() => setVisibleCount((v) => v + pageSize)} style={{ marginTop: 10 }}>
          Afficher {Math.min(remaining, pageSize)} de plus ({remaining} restant{remaining !== 1 ? "s" : ""})
        </button>
      )}
    </>
  );
}

export function BibliothequeScreen() {
  const [entries, setEntries] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyLibraryEntry());
  const [themeFilter, setThemeFilter] = useState("");
  const [libraryTab, setLibraryTab] = useState("Livre");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { setEntries(JSON.parse(window.localStorage.getItem("tf_bibliotheque") || "[]")); } catch (e) {}
    setLoaded(true);
  }, []);

  function persist(next) {
    setEntries(next);
    try { window.localStorage.setItem("tf_bibliotheque", JSON.stringify(next)); } catch (e) { alert("La sauvegarde a échoué."); }
  }
  function switchTab(id) { setLibraryTab(id); setThemeFilter(""); }
  function openNew() { setForm({ ...emptyLibraryEntry(), type: libraryTab === "autres" ? "Autre" : libraryTab }); setEditingId(null); setShowForm(true); }
  function openEdit(entry) { setForm(entry); setEditingId(entry.id); setShowForm(true); }
  function save() {
    if (!form.title.trim()) { alert("Donne un titre à cette référence."); return; }
    if (editingId) persist(entries.map((e) => (e.id === editingId ? form : e)));
    else persist([...entries, form]);
    setShowForm(false);
  }
  function remove(id) {
    if (!confirm("Supprimer cette référence de la bibliothèque ?")) return;
    persist(entries.filter((e) => e.id !== id));
  }
  function toggleFavorite(entry) {
    persist(entries.map((e) => (e.id === entry.id ? { ...e, favorite: !e.favorite } : e)));
  }

  if (!loaded) return <div className="stats-screen"><div className="empty-state">Chargement…</div></div>;

  const activeTabDef = LIBRARY_TABS.find((t) => t.id === libraryTab) || LIBRARY_TABS[0];
  const tabEntries = entries.filter((e) => activeTabDef.match(e.type));
  const allThemes = [...new Set(tabEntries.map((e) => e.theme).filter(Boolean))].sort();
  const filtered = themeFilter ? tabEntries.filter((e) => e.theme === themeFilter) : tabEntries;
  const grouped = {};
  filtered.forEach((e) => { (grouped[e.theme || "Sans thème"] || (grouped[e.theme || "Sans thème"] = [])).push(e); });

  return (
    <div className="stats-screen">
      <div className="stats-screen-header">
        <div className="eyebrow">Ressources</div>
        <h1>Bibliothèque</h1>
        <p className="subtitle">Tes références football — livres, articles, vidéos, formations — classées par thème, à ton rythme.</p>
      </div>

      <div className="tabs">
        {LIBRARY_TABS.map((t) => (
          <button key={t.id} className={`tab ${libraryTab === t.id ? "active" : ""}`} onClick={() => switchTab(t.id)}>
            {t.label} <span className="scouting-club">({entries.filter((e) => t.match(e.type)).length})</span>
          </button>
        ))}
      </div>

      {!showForm && (
        <div className="home-actions-row" style={{ marginBottom: 16 }}>
          <button className="btn btn-primary btn-large" onClick={openNew}>+ Ajouter une référence</button>
        </div>
      )}

      {showForm && (
        <div className="new-match-card">
          <label>Titre<input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} autoFocus /></label>
          <div className="roster-physical-grid">
            <label>Type
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {LIBRARY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>Auteur / source<input type="text" value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} /></label>
          </div>
          <label>Thème
            <input type="text" list="library-theme-datalist" placeholder="ex. Tactique" value={form.theme} onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))} />
          </label>
          <datalist id="library-theme-datalist">{LIBRARY_THEME_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
          <label>Statut
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {LIBRARY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Notes / résumé personnel<textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={save}>Enregistrer</button>
          </div>
        </div>
      )}

      {tabEntries.length > 0 && (
        <label style={{ display: "inline-block", margin: "16px 0" }}>
          Filtrer par thème
          <select value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)}>
            <option value="">Tous les thèmes</option>
            {allThemes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      )}

      {tabEntries.length === 0 && <div className="empty-state">Aucune référence dans « {activeTabDef.label} » pour l'instant.</div>}

      {Object.keys(grouped).sort().map((theme) => (
        <div key={theme} style={{ marginBottom: 22 }}>
          <div className="panel-heading">{theme} <span className="scouting-club">({grouped[theme].length})</span></div>
          <PaginatedGrid
            items={grouped[theme]}
            renderItem={(e) => (
              <div className="roster-card" key={e.id} onClick={() => openEdit(e)} style={{ cursor: "pointer" }}>
                <div className="roster-card-info">
                  <div className="roster-card-name">{e.favorite ? "★ " : ""}{e.title}</div>
                  <div className="roster-card-position">{e.type}{e.author ? ` · ${e.author}` : ""}</div>
                  <div className="roster-card-usage">{e.status}</div>
                </div>
                <div className="roster-card-actions">
                  <button className="icon-btn" onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e); }} aria-label="Marquer comme favori">{e.favorite ? "★" : "☆"}</button>
                  <button className="icon-btn" onClick={(ev) => { ev.stopPropagation(); remove(e.id); }} aria-label="Supprimer"><X size={14} /></button>
                </div>
              </div>
            )}
          />
        </div>
      ))}
    </div>
  );
}

