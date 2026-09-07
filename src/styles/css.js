// Feuille de style de l'application — extraite de App.jsx (séparation des fichiers, sans
// changement de comportement).

export const CSS = `
  :root {
    --bg: #F5F0FA;
    --surface: #FFFFFF;
    --sidebar-bg: #EBE1F5;
    --line: #E3D5EF;
    --ink: #2B2235;
    --ink-muted: #8D7E9C;
    --gold: #B06A87;
    --gold-ink: #FFFFFF;
    --crimson: #B8382F;
  }
  html, body { background: var(--bg); }
  .app-root { background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; min-height: 100vh; }
  .app-root * { box-sizing: border-box; }
  .app-root button { font-family: inherit; cursor: pointer; }
  .app-root input, .app-root select { font-family: inherit; }
  .app-root button:focus-visible, .app-root input:focus-visible, .app-root select:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .app-root * { transition: none !important; animation: none !important; } }

  .menu-toggle-btn { position: fixed; top: 14px; left: 14px; z-index: 50; background: var(--surface); border: 1px solid var(--line); color: var(--ink); width: 38px; height: 38px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  .menu-toggle-btn:hover { border-color: var(--gold); }
  .sidebar-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 40; }
  .sidebar-drawer { position: fixed; top: 0; left: 0; bottom: 0; width: 230px; background: var(--sidebar-bg); border-right: 1px solid var(--line); z-index: 45; display: flex; flex-direction: column; padding: 14px 0; overflow-y: auto; }
  .sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 0 14px 14px; margin-bottom: 6px; border-bottom: 1px solid var(--line); }
  .sidebar-brand { font-size: 11px; font-weight: 700; color: var(--gold); text-transform: uppercase; letter-spacing: 0.05em; }
  .sidebar-search { display: flex; align-items: center; gap: 8px; margin: 10px 14px 12px; padding: 8px 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; color: var(--ink-muted); }
  .team-season-selector { display: flex; flex-direction: column; gap: 6px; margin: 0 14px 12px; }
  .team-season-selector select { width: 100%; background: var(--bg); border: 1px solid var(--gold); color: var(--gold); border-radius: 8px; padding: 7px 10px; font-size: 12px; font-weight: 600; }
  .sidebar-backup-btn { display: flex; align-items: center; justify-content: center; gap: 6px; width: calc(100% - 28px); margin: 0 14px 12px; background: var(--surface); border: 1px solid var(--line); color: var(--ink-muted); border-radius: 8px; padding: 8px 10px; font-size: 12px; cursor: pointer; }
  .sidebar-backup-btn:hover { border-color: var(--gold); color: var(--gold); }
  .sidebar-search input { flex: 1; background: transparent; border: none; color: var(--ink); font-size: 13px; outline: none; }
  .sidebar-search-results { display: flex; flex-direction: column; overflow-y: auto; }
  .sidebar-search-result { display: flex; align-items: baseline; gap: 8px; padding: 10px 14px; background: transparent; border: none; border-bottom: 1px solid var(--line); color: var(--ink); text-align: left; cursor: pointer; font-size: 13px; }
  .sidebar-search-result:hover { background: var(--surface); }
  .sidebar-search-result-type { font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--gold); font-weight: 700; flex-shrink: 0; }
  .sidebar-search-result-label { font-weight: 600; }
  .sidebar-search-result-meta { color: var(--ink-muted); font-size: 11px; margin-left: auto; }
  .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px; color: var(--ink-muted); font-size: 13px; background: transparent; border: none; width: 100%; text-align: left; }
  .sidebar-item:hover { background: var(--surface); color: var(--ink); }
  .sidebar-item.active { background: var(--gold); color: var(--gold-ink); font-weight: 700; }
  .stats-screen { padding: 24px 24px 48px; max-width: 1000px; margin: 0 auto; }
  .stats-screen-header { margin-bottom: 20px; }
  .player-select { width: 100%; max-width: 420px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 8px 10px; font-size: 12px; margin-bottom: 8px; }
  .score-input { width: 38px; background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 5px; padding: 5px; font-size: 12px; text-align: center; }
  .fixture-opponent-input { width: 100%; min-width: 120px; background: transparent; border: 1px solid transparent; color: var(--ink); border-radius: 5px; padding: 5px; font-size: 13px; }
  .fixture-opponent-input:hover, .fixture-opponent-input:focus { background: var(--bg); border-color: var(--line); }
  .club-name-field { display: block; max-width: 320px; margin-bottom: 18px; }
  .club-name-field input { display: block; margin-top: 4px; }
  .round-my-match { background: rgba(176,106,135,0.12); }
  .standings-arrow-up { color: #2E8B57; font-weight: 700; }
  .standings-arrow-down { color: var(--crimson); font-weight: 700; }
  .standings-arrow-same { color: var(--ink-muted); }
  .heatmap-grid { display: flex; flex-direction: column; gap: 4px; max-width: 480px; }
  .heatmap-row { display: flex; gap: 4px; }
  .heatmap-cell { flex: 1; aspect-ratio: 3/2; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid var(--line); }
  .heatmap-cell-count { font-size: 22px; font-weight: 800; color: var(--ink); }
  .heatmap-cell-label { font-size: 9px; color: var(--ink-muted); text-align: center; padding: 0 4px; }
  .live-tagging-indicator { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-muted); }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--crimson); animation: live-pulse 1.4s ease-in-out infinite; }
  @keyframes live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
  .round-my-match td:first-child, .round-my-match td:last-child { font-weight: 700; }
  .bar-cell-wrap { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 4px 0; }
  .bar-cell-track { height: 42px; width: 22px; display: flex; align-items: flex-end; background: rgba(255,255,255,0.03); border-radius: 3px; overflow: hidden; }
  .bar-cell-fill { width: 100%; border-radius: 2px 2px 0 0; min-height: 2px; opacity: 0.85; }
  .bar-cell-num { font-size: 10px; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
  .multi-select-list { display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 8px; margin-bottom: 12px; }
  .multi-select-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; font-size: 12px; color: var(--ink); border-radius: 5px; }
  .multi-select-item:hover { background: var(--bg); }
  .comparison-summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .comparison-summary-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
  .comparison-summary-card h4 { margin: 0 0 6px; font-size: 12px; font-weight: 700; }
  .comparison-summary-card div { font-size: 11px; color: var(--ink-muted); margin-bottom: 2px; }
  .highlights-row { margin-bottom: 20px; }
  .form-calendar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px; }
  .form-calendar-cell { width: 34px; height: 34px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #17231B; cursor: default; }
  .dominant-axis-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 20px; }
  .dominant-axis-chip { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 5px 12px; font-size: 11px; color: var(--ink-muted); }
  .player-avg-summary { display: flex; gap: 18px; flex-wrap: wrap; font-size: 12px; color: var(--ink-muted); margin-bottom: 10px; }
  .player-avg-summary strong { color: var(--ink); }
  .signals-box { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; }
  .signals-box-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); font-weight: 700; margin-bottom: 2px; }
  .signal-item { font-size: 12px; padding: 6px 10px; border-radius: 6px; background: var(--bg); border-left: 3px solid var(--ink-muted); }
  .signal-item.positive { border-left-color: var(--gold); color: var(--ink); }
  .signal-item.negative { border-left-color: var(--crimson); color: var(--ink); }
  .signal-scope { font-weight: 700; }
  .signal-date { display: block; font-size: 10px; color: var(--ink-muted); margin-top: 2px; font-style: italic; }
  .signals-box-full { margin-bottom: 0; }
  .range-preset-btn.active-preset { background: var(--gold); color: var(--gold-ink); border-color: var(--gold); }
  .radar-note { font-size: 11px; color: var(--ink-muted); line-height: 1.5; margin-top: 8px; max-width: 560px; }
  .radar-range-control { margin-bottom: 10px; }
  .radar-range-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); font-weight: 700; margin-bottom: 5px; }
  .radar-match-list { max-height: 160px; margin-top: 6px; margin-bottom: 0; }
  .radar-compare-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink); margin: 4px 0 10px; cursor: pointer; }
  .placeholder-screen { max-width: 560px; margin: 80px auto; padding: 0 24px; text-align: center; }
  .placeholder-screen h1 { font-size: 26px; font-weight: 800; margin: 0 0 10px; }
  .placeholder-badge { display: inline-block; margin-top: 16px; background: var(--surface); border: 1px solid var(--line); color: var(--ink-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; padding: 6px 14px; border-radius: 20px; }
  .closed-badge { border-color: var(--gold); color: var(--gold); }
  .closed-badge-inline { font-size: 10px; font-weight: 700; color: var(--gold); background: rgba(176,106,135,0.14); padding: 2px 7px; border-radius: 10px; margin-left: 6px; vertical-align: middle; }

  .home { padding: 32px 28px 40px; max-width: 720px; margin: 0 auto; }
  .home-header { margin-bottom: 24px; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: 11px; color: var(--gold); font-weight: 700; margin-bottom: 6px; }
  .home-header h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.01em; margin: 0 0 8px; }
  .subtitle { color: var(--ink-muted); font-size: 14px; margin: 0; max-width: 46ch; }

  .btn { border: none; border-radius: 6px; padding: 10px 16px; font-size: 14px; font-weight: 600; transition: transform 0.1s ease, opacity 0.15s ease; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .btn:active { transform: scale(0.98); }
  .btn-primary { background: var(--gold); color: var(--gold-ink); }
  .btn-primary:hover { opacity: 0.9; }
  .btn-ghost { background: transparent; color: var(--ink-muted); border: 1px solid var(--line); }
  .btn-ghost:hover { color: var(--ink); border-color: var(--ink-muted); }
  .btn-large { padding: 14px 22px; font-size: 15px; }
  .home-actions-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 24px; }
  .btn-small { padding: 6px 12px; font-size: 12px; }

  .new-match-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 20px; margin-top: 16px; display: flex; flex-direction: column; gap: 14px; }
  .new-match-card label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--ink-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .new-match-card input { background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 9px 10px; font-size: 14px; font-weight: 400; text-transform: none; letter-spacing: normal; }
  .new-match-card textarea { background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 9px 10px; font-size: 14px; font-weight: 400; text-transform: none; letter-spacing: normal; font-family: inherit; resize: vertical; }
  .gameplan-identity-banner { background: var(--surface); border: 1px solid var(--gold); border-radius: 10px; padding: 16px 20px; font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 20px; }
  .gameplan-view-field { margin-bottom: 14px; }
  .gameplan-view-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); font-weight: 700; margin-bottom: 3px; }
  .gameplan-view-value { font-size: 13px; color: var(--ink); line-height: 1.5; white-space: pre-wrap; }
  .gameplan-empty { color: var(--ink-muted); font-style: italic; }
  .qcm-field { margin-bottom: 4px; }
  .qcm-label { font-size: 12px; color: var(--ink-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
  .qcm-options { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .qcm-option { background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 20px; padding: 8px 14px; font-size: 12px; font-weight: 500; text-align: left; }
  .qcm-option:hover { border-color: var(--gold); }
  .qcm-option.selected { background: var(--gold); border-color: var(--gold); color: var(--gold-ink); font-weight: 700; }
  .qcm-note-input { width: 100%; background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 7px 10px; font-size: 12px; }
  .gameplan-choice-tag { display: inline-block; background: rgba(176,106,135,0.14); color: var(--gold); border-radius: 14px; padding: 4px 12px; font-size: 12px; font-weight: 700; }
  .gameplan-view-note { font-size: 12px; color: var(--ink-muted); margin-top: 4px; font-style: italic; }

  .match-report { max-width: 780px; }
  .match-report-header { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 14px; }
  .match-report-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); font-weight: 700; margin-bottom: 10px; }
  .match-report-score { display: flex; align-items: center; justify-content: center; gap: 20px; }
  .match-report-score .us { color: var(--gold); font-weight: 700; font-size: 14px; }
  .match-report-score .opp { color: var(--crimson); font-weight: 700; font-size: 14px; }
  .match-report-score .score-num { font-size: 32px; font-weight: 800; color: var(--ink); }
  .match-report-meta { font-size: 11px; color: var(--ink-muted); margin-top: 10px; }
  .match-report-synthese { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; font-size: 13px; line-height: 1.7; color: var(--ink); margin-bottom: 6px; }
  .match-report-keystat { background: rgba(176,106,135,0.12); border: 1px solid var(--gold); border-radius: 10px; padding: 10px 16px; font-size: 13px; font-weight: 600; color: var(--gold); margin-bottom: 10px; }

  .compare-bars { display: flex; flex-direction: column; gap: 10px; }
  .compare-bar-row { display: flex; align-items: center; gap: 12px; }
  .compare-bar-val { font-size: 13px; font-weight: 800; width: 52px; flex-shrink: 0; }
  .compare-bar-val.us { color: var(--gold); text-align: right; }
  .compare-bar-val.opp { color: var(--crimson); text-align: left; }
  .compare-bar-mid { flex: 1; min-width: 0; }
  .compare-bar-label { font-size: 10px; color: var(--ink-muted); text-align: center; margin-bottom: 3px; }
  .compare-bar-track { height: 6px; background: var(--crimson); border-radius: 3px; overflow: hidden; opacity: 0.85; }
  .compare-bar-fill { height: 100%; background: var(--gold); }

  .signals-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .signals-col-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; margin-bottom: 8px; }
  .signals-col-title.positive { color: var(--gold); }
  .signals-col-title.negative { color: var(--crimson); }

  .reports-match-list { display: flex; flex-direction: column; gap: 6px; }
  .reports-match-item { display: flex; align-items: center; gap: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; text-align: left; }
  .reports-match-item:hover { border-color: var(--gold); }
  .reports-match-item.active { border-color: var(--gold); background: rgba(176,106,135,0.08); }
  .reports-match-name { flex: 1; font-size: 13px; font-weight: 600; }
  .reports-match-score { font-size: 13px; font-weight: 800; color: var(--gold); }
  .reports-match-date { font-size: 11px; color: var(--ink-muted); width: 90px; text-align: right; }

  .scout-obs-list { display: flex; flex-direction: column; gap: 4px; }
  .scout-obs-row { display: flex; align-items: center; justify-content: space-between; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; font-size: 12px; }
  .scout-obs-add { display: flex; gap: 8px; flex-wrap: wrap; }
  .scout-obs-add select { background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 7px 10px; font-size: 12px; }
  .club-chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .club-chip { display: flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 5px 6px 5px 12px; font-size: 12px; color: var(--ink); }

  .scouting-list { display: flex; flex-direction: column; gap: 10px; }
  .scouting-card { display: flex; gap: 16px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
  .scouting-grade { width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; flex-shrink: 0; background: var(--bg); border: 2px solid var(--line); }
  .scouting-grade.grade-a { border-color: #2E8B57; color: #2E8B57; }
  .scouting-grade.grade-b { border-color: var(--gold); color: var(--gold); }
  .scouting-grade.grade-c { border-color: #A6721E; color: #A6721E; }
  .scouting-grade.grade-d { border-color: #A65A20; color: #A65A20; }
  .scouting-grade.grade-f { border-color: var(--crimson); color: var(--crimson); }
  .scouting-info { flex: 1; min-width: 0; }
  .scouting-name { font-weight: 700; font-size: 14px; }
  .scouting-club { font-weight: 400; color: var(--ink-muted); font-size: 12px; margin-left: 6px; }
  .scouting-meta { font-size: 11px; color: var(--ink-muted); margin-top: 3px; }

  .clip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
  .clip-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; cursor: pointer; position: relative; }
  .clip-card:hover { border-color: var(--gold); }
  .clip-card video { width: 100%; aspect-ratio: 16/9; background: #000; display: block; object-fit: cover; pointer-events: none; }
  .clip-card-info { padding: 10px 12px; }
  .clip-card-title { font-weight: 700; font-size: 13px; }
  .clip-card-meta { font-size: 11px; color: var(--ink-muted); margin-top: 2px; }
  .clip-annotated-badge { position: absolute; top: 8px; right: 8px; background: var(--gold); color: var(--gold-ink); font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 10px; }
  .clip-download-btn { position: absolute; bottom: 68px; right: 8px; background: rgba(13,21,18,0.85); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
  .clip-download-btn:hover { border-color: var(--gold); color: var(--gold); }

  .calendar-nav { display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 10px; }
  .calendar-month-label { font-size: 15px; font-weight: 700; text-transform: capitalize; min-width: 160px; text-align: center; }
  .calendar-legend { display: flex; gap: 16px; justify-content: center; margin-bottom: 14px; flex-wrap: wrap; }
  .calendar-legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ink-muted); }
  .calendar-legend-item .dot, .calendar-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .calendar-dow { text-align: center; font-size: 10px; color: var(--ink-muted); text-transform: uppercase; padding-bottom: 4px; }
  .calendar-day { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; min-height: 56px; padding: 6px; cursor: pointer; }
  .calendar-day.empty { background: transparent; border: none; cursor: default; }
  .calendar-day:hover:not(.empty) { border-color: var(--gold); }
  .calendar-day.today { border-color: var(--gold); border-width: 2px; }
  .calendar-day.selected { background: rgba(176,106,135,0.12); }
  .calendar-day-reduced { border-bottom: 3px solid var(--crimson); }
  .calendar-legend-avail { background: var(--crimson); }
  .calendar-day-num { font-size: 11px; color: var(--ink-muted); }
  .calendar-day-dots { display: flex; gap: 3px; flex-wrap: wrap; margin-top: 4px; }

  .week-agenda { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
  .week-agenda-day { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 8px; min-height: 70px; }
  .week-agenda-day.today { border-color: var(--gold); }
  .week-agenda-date { font-size: 10px; text-transform: capitalize; color: var(--gold); font-weight: 700; margin-bottom: 6px; }
  .week-agenda-empty { font-size: 11px; color: var(--ink-muted); }
  .week-agenda-item { display: block; width: 100%; text-align: left; background: transparent; border: none; color: var(--ink); font-size: 11px; padding: 3px 0; cursor: pointer; }
  .week-agenda-item:hover { color: var(--gold); }
  .causerie-notes-textarea { width: 100%; min-height: 420px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; color: var(--ink); padding: 18px; font-size: 15px; line-height: 1.6; resize: vertical; }
  .causerie-notes-textarea:focus { border-color: var(--gold); outline: none; }
  .print-annotation-zone { border: 1px dashed var(--line); border-radius: 8px; min-height: 70px; margin-top: 6px; }
  .print-annotation-zone.small { min-height: 40px; }
  .causerie-print-page { margin-bottom: 24px; }
  @media print {
    .causerie-print-page { page-break-after: always; }
    .causerie-print-page:last-child { page-break-after: auto; }
  }

  @media print {
    .no-print, .menu-toggle-btn, .sidebar-drawer, .sidebar-backdrop, .tabs, .club-chip-row + .hint { display: none !important; }
    body, .app-shell, .stats-screen { background: #ffffff !important; color: #111111 !important; }
    .match-report, .match-report * { color: #111111 !important; }
    .match-report-header, .scouting-card, .new-match-card { border-color: #cccccc !important; }
    a[href]::after { content: none !important; }
  }

  .dashboard-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
  .leaderboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
  .dashboard-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; cursor: pointer; }
  .dashboard-card:hover { border-color: var(--gold); }
  .dashboard-card-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--gold); font-weight: 700; margin-bottom: 8px; }
  .dashboard-card-main { font-size: 14px; font-weight: 700; }
  .dashboard-card-meta { font-size: 11px; color: var(--ink-muted); margin-top: 3px; }

  .clip-editor-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 20px; background: var(--surface); border-bottom: 1px solid var(--line); }
  .clip-color-picker { width: 34px; height: 30px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); padding: 2px; cursor: pointer; }
  .clip-editor-video-wrap { position: relative; max-width: 900px; margin: 20px auto; background: #000; }
  .clip-editor-video-wrap video { width: 100%; display: block; }
  .clip-editor-video-wrap canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: crosshair; }
  .clip-text-popup { position: absolute; display: flex; gap: 6px; background: var(--surface); border: 1px solid var(--gold); border-radius: 6px; padding: 6px; z-index: 5; transform: translate(-4px, -4px); }
  .player-picker-popup { flex-direction: column; max-height: 220px; overflow-y: auto; min-width: 170px; }
  .player-picker-item { display: flex; align-items: center; gap: 8px; background: transparent; border: none; border-bottom: 1px solid var(--line); color: var(--ink); text-align: left; padding: 6px 4px; cursor: pointer; font-size: 12px; }
  .player-picker-item:hover { color: var(--gold); }
  .player-picker-item img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .player-picker-noimg { width: 24px; height: 24px; border-radius: 50%; background: var(--bg); border: 1px solid var(--gold); color: var(--gold); font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .clip-text-popup input { background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 4px; padding: 5px 8px; font-size: 12px; width: 140px; }
  .pad-toolbar { border-radius: 8px; margin-bottom: 12px; }
  .pad-wrap { position: relative; width: 100%; max-width: 640px; aspect-ratio: 3/2; margin: 0 auto; }
  .pad-pitch-svg { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 6px; }
  .pad-wrap canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; }
  .pad-curve-toggle { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--ink); padding: 0 8px; }
  .new-match-card select { background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 9px 10px; font-size: 14px; font-weight: 400; text-transform: none; letter-spacing: normal; }
  .form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }

  .roster-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  .roster-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: flex; gap: 14px; align-items: flex-start; }
  .exercise-thumbnail-wrap { position: relative; width: 128px; height: 85px; border-radius: 6px; overflow: hidden; flex-shrink: 0; }
  .exercise-thumbnail-wrap svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  .exercise-thumbnail-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  .exercise-thumbnail-wrap-large { position: relative; width: 100%; aspect-ratio: 3 / 2; border-radius: 8px; overflow: hidden; }
  .exercise-thumbnail-wrap-large svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  .exercise-thumbnail-wrap-large canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  .clip-themes-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 12px; }
  .clip-theme-chip { display: inline-flex; align-items: center; gap: 6px; background: rgba(176,106,135,0.15); border: 1px solid var(--gold); color: var(--gold); border-radius: 20px; padding: 4px 10px; font-size: 11px; }
  .clip-theme-chip button { background: none; border: none; color: var(--gold); cursor: pointer; font-size: 10px; padding: 0; }
  .clip-themes-row input { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 5px 12px; font-size: 11px; color: var(--ink); width: 200px; }
  .clip-compare-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
  .clip-compare-slot { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px; }
  .clip-compare-slot video { width: 100%; border-radius: 6px; }
  .clip-select-badge { position: absolute; top: 8px; left: 8px; width: 22px; height: 22px; border-radius: 50%; background: var(--gold); color: var(--gold-ink); font-weight: 800; font-size: 12px; display: flex; align-items: center; justify-content: center; border: 2px solid var(--bg); }
  .roster-card-photo { width: 52px; height: 52px; border-radius: 8px; overflow: hidden; background: var(--bg); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--ink-muted); }
  .roster-card-photo img { width: 100%; height: 100%; object-fit: cover; }
  .roster-card-prefnum { font-size: 11px; color: var(--gold); font-weight: 700; margin-left: 6px; }
  .roster-photo-row { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .roster-photo-preview { width: 64px; height: 64px; border-radius: 8px; overflow: hidden; background: var(--bg); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; color: var(--ink-muted); flex-shrink: 0; }
  .roster-photo-preview img { width: 100%; height: 100%; object-fit: cover; }
  .roster-photo-btn { cursor: pointer; }
  .roster-form-section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--gold); font-weight: 700; margin-top: 8px; padding-top: 14px; border-top: 1px solid var(--line); }
  .roster-physical-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
  .test-history-block { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .test-history-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); font-weight: 700; margin-bottom: 6px; }
  .test-history-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; max-height: 120px; overflow-y: auto; }
  .test-history-row { display: flex; align-items: center; gap: 8px; font-size: 12px; background: var(--surface); border-radius: 5px; padding: 5px 8px; }
  .test-history-date { color: var(--ink-muted); flex-shrink: 0; }
  .test-history-value { flex: 1; font-weight: 700; color: var(--gold); }
  .test-history-add { display: flex; gap: 6px; }
  .test-history-add input[type="date"] { flex: 1; background: var(--surface); border: 1px solid var(--line); color: var(--ink); border-radius: 5px; padding: 6px 8px; font-size: 12px; min-width: 0; }
  .test-history-add input[type="number"] { width: 70px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); border-radius: 5px; padding: 6px 8px; font-size: 12px; }
  .roster-card-physical { font-size: 11px; color: var(--ink); margin-top: 6px; line-height: 1.5; }
  .roster-card-testdate { color: var(--ink-muted); font-style: italic; }
  .roster-card-number { width: 40px; height: 40px; border-radius: 8px; background: var(--bg); border: 1px solid var(--gold); color: var(--gold); font-weight: 800; font-size: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .roster-card-info { flex: 1; min-width: 0; }
  .roster-card-name { font-weight: 700; font-size: 14px; }
  .roster-card-position { font-size: 11px; color: var(--gold); font-weight: 600; margin-top: 2px; }
  .roster-card-meta { font-size: 11px; color: var(--ink-muted); margin-top: 3px; }
  .roster-card-usage { font-size: 10px; color: var(--ink-muted); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
  .roster-card-actions { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
  .assignment-editor { margin-top: 4px; }
  .assignment-empty-note { font-size: 12px; color: var(--ink-muted); margin-top: 4px; }
  .assignment-list { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; margin-top: 6px; }
  .assignment-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; }
  .assignment-name { font-size: 13px; color: var(--ink); }
  .assignment-position { font-size: 11px; color: var(--ink-muted); font-weight: 400; }
  .assignment-number-input { width: 48px; background: var(--surface); border: 1px solid var(--line); color: var(--gold); font-weight: 800; text-align: center; border-radius: 6px; padding: 6px; font-size: 13px; }
  .assignment-starter-toggle { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--ink-muted); white-space: nowrap; }

  .match-list { margin-top: 24px; display: flex; flex-direction: column; gap: 10px; }
  .empty-state { color: var(--ink-muted); font-size: 13px; padding: 24px; text-align: center; border: 1px dashed var(--line); border-radius: 8px; }
  .match-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: border-color 0.15s ease; }
  .match-card:hover { border-color: var(--gold); }
  .match-card-name { font-weight: 700; font-size: 14px; }
  .match-card-meta { color: var(--ink-muted); font-size: 12px; margin-top: 2px; }
  .match-card-side { display: flex; align-items: center; gap: 12px; }
  .tag-count { font-size: 11px; color: var(--ink-muted); font-variant-numeric: tabular-nums; }

  .icon-btn { background: transparent; border: 1px solid var(--line); color: var(--ink-muted); border-radius: 6px; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
  .icon-btn:hover { color: var(--ink); border-color: var(--ink-muted); }

  .tagging { display: flex; flex-direction: column; min-height: 100vh; }
  .topbar { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
  .topbar-title { flex: 1; }
  .topbar-name { font-weight: 700; font-size: 14px; }
  .topbar-meta { font-size: 11px; color: var(--ink-muted); }
  .save-indicator { font-size: 11px; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
  .save-indicator.error { color: var(--crimson); }

  .tagging-grid { display: none; }
  .top-row {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 18px;
    padding: 18px 18px 0;
  }
  @media (max-width: 1000px) {
    .top-row { grid-template-columns: 1fr; }
  }
  .below-row {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px 18px 32px;
  }
  .video-section { min-width: 0; }
  .selectors-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .selectors-header { display: flex; flex-direction: column; gap: 10px; }
  .event-categories-stack { display: flex; flex-direction: column; gap: 8px; }
  .compile-progress-float { margin: 10px 18px 0; background: var(--surface); border: 1px solid var(--gold); border-radius: 8px; padding: 8px 12px; }
  .panel-heading { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); font-weight: 700; margin-bottom: 8px; }
  .journal-section { max-width: 640px; }

  .video-placeholder { position: relative; background: var(--surface); border: 1px dashed var(--line); border-radius: 10px; padding: 48px 20px; text-align: center; color: var(--ink-muted); display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .resume-hint { font-size: 12px; color: var(--gold); margin-top: -8px; }
  .video-wrap { position: relative; background: black; border-radius: 10px; overflow: hidden; }
  .video-wrap video { width: 100%; display: block; max-height: 46vh; }
  .video-status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; color: var(--ink-muted); font-size: 13px; line-height: 1.5; background: rgba(13,21,18,0.88); }
  .video-status.error { color: var(--crimson); }

  .video-controls { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
  .btn-play { width: 40px; height: 40px; border-radius: 50%; padding: 0; }
  .time-code { font-variant-numeric: tabular-nums; font-size: 13px; color: var(--ink-muted); margin-left: auto; }
  .video-controls select { background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font-size: 12px; }

  .pulse-track { position: relative; height: 34px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; margin-top: 12px; cursor: pointer; overflow: hidden; }
  .pulse-band { position: absolute; top: 0; bottom: 0; opacity: 0.28; }
  .pulse-band.us { background: var(--gold); }
  .pulse-band.opp { background: var(--crimson); }
  .pulse-band.neutral { background: var(--ink-muted); }
  .pulse-progress { position: absolute; top: 0; left: 0; bottom: 0; background: rgba(176,106,135,0.12); border-right: 1px solid var(--gold); }
  .pulse-tick { position: absolute; top: 6px; width: 3px; height: 22px; border-radius: 2px; transform: translateX(-50%); }
  .pulse-tick.us.pos { background: var(--gold); }
  .pulse-tick.us.neg { background: var(--gold); opacity: 0.4; }
  .pulse-tick.opp.pos { background: var(--crimson); }
  .pulse-tick.opp.neg { background: var(--crimson); opacity: 0.4; }
  .pulse-playhead { position: absolute; top: -2px; width: 2px; height: 38px; background: var(--ink); transform: translateX(-50%); pointer-events: none; }

  .tabs { display: flex; gap: 4px; margin-top: 18px; border-bottom: 1px solid var(--line); }
  .tab { background: transparent; border: none; color: var(--ink-muted); padding: 8px 4px; margin-right: 18px; font-size: 13px; font-weight: 600; border-bottom: 2px solid transparent; }
  .tab.active { color: var(--ink); border-bottom-color: var(--gold); }

  .journal { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
  .journal-row { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; }
  .journal-row.flash { border-color: var(--gold); }
  .journal-time { background: transparent; border: none; color: var(--ink); font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 700; width: 44px; text-align: left; }
  .team-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .team-dot.us { background: var(--gold); }
  .team-dot.opp { background: var(--crimson); }
  .journal-label { flex: 1; font-size: 13px; }
  .journal-label.neg { color: var(--ink-muted); }
  .player-input { width: 44px; background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 4px; padding: 4px 6px; font-size: 12px; text-align: center; }
  .journal-zone-select { background: var(--bg); border: 1px solid var(--line); color: var(--ink-muted); border-radius: 4px; padding: 4px 4px; font-size: 10px; max-width: 74px; }
  .journal-player-name { font-size: 11px; color: var(--gold); max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .player-picker-btn { display: flex; flex-direction: column; align-items: center; gap: 1px; }
  .player-picker-name { font-size: 8px; font-weight: 400; color: var(--ink-muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .composition-panel { max-height: 70vh; overflow-y: auto; max-width: 420px; }

  .stats-panel { margin-top: 14px; }
  .possession-summary { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
  .possession-bar { display: flex; height: 14px; border-radius: 4px; overflow: hidden; margin: 8px 0 10px; background: var(--bg); }
  .possession-seg.us { background: var(--gold); }
  .possession-seg.opp { background: var(--crimson); }
  .possession-seg.neutral { background: var(--ink-muted); }
  .possession-legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: var(--ink-muted); }
  .possession-legend .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; }
  .possession-legend .dot.us { background: var(--gold); }
  .possession-legend .dot.opp { background: var(--crimson); }
  .possession-legend .dot.neutral { background: var(--ink-muted); }
  .player-stats { margin-top: 18px; }
  .player-stat-row { display: flex; align-items: center; gap: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; margin-bottom: 6px; font-size: 12px; }
  .player-stat-num { font-weight: 800; color: var(--gold); width: 40px; }
  .player-stat-count { flex: 1; color: var(--ink); }
  .player-stat-pos { color: var(--ink-muted); }
  .ratio-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 18px; }
  .ratio-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
  .ratio-label { font-size: 11px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
  .ratio-values { display: flex; align-items: baseline; gap: 8px; font-variant-numeric: tabular-nums; }
  .ratio-us { color: var(--gold); font-size: 20px; font-weight: 800; }
  .ratio-opp { color: var(--crimson); font-size: 20px; font-weight: 800; }
  .ratio-sep { color: var(--ink-muted); font-size: 11px; }
  .chart-wrap { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 6px; }

  .side-col { display: flex; flex-direction: column; gap: 14px; }
  .team-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .team-btn { padding: 12px 8px; border-radius: 8px; font-weight: 800; font-size: 13px; letter-spacing: 0.03em; border: 1px solid var(--line); background: var(--surface); color: var(--ink-muted); }
  .team-btn.us.active { background: var(--gold); color: var(--gold-ink); border-color: var(--gold); }
  .team-btn.opp.active { background: var(--crimson); color: #FFFFFF; border-color: var(--crimson); }
  .hint { font-size: 11px; color: var(--ink-muted); text-align: center; }

  .player-picker { background: var(--surface); border: 1px solid var(--gold); border-radius: 8px; padding: 10px; animation: pop-in 0.15s ease; }
  .player-picker.opp { border-color: var(--crimson); }
  .player-picker-label { font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 8px; }
  .pitch-picker { margin-bottom: 12px; }
  .pitch-picker-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); font-weight: 700; margin-bottom: 6px; }
  .pitch-field { position: relative; width: 100%; max-width: 190px; aspect-ratio: 68 / 100; margin: 0 auto; background: #1F7A3D; border: 2px solid rgba(255,255,255,0.85); border-radius: 4px; overflow: hidden; }
  .pitch-markings { position: absolute; inset: 0; pointer-events: none; }
  .pitch-goal { position: absolute; left: 50%; transform: translateX(-50%); width: 42%; height: 9%; border: 2px solid rgba(255,255,255,0.55); }
  .pitch-goal.top { top: -2px; border-top: none; }
  .pitch-goal.bottom { bottom: -2px; border-bottom: none; }
  .pitch-circle { position: absolute; top: 50%; left: 50%; width: 28%; aspect-ratio: 1; border: 2px solid rgba(255,255,255,0.55); border-radius: 50%; transform: translate(-50%, -50%); }
  .pitch-halfline { position: absolute; top: 50%; left: 0; right: 0; height: 2px; background: rgba(255,255,255,0.55); }
  .pitch-cells { position: relative; display: flex; flex-direction: column; height: 100%; }
  .pitch-row { flex: 1; display: flex; }
  .pitch-cell { flex: 1; background: transparent; border: 1px dashed rgba(255,255,255,0.3); }
  .pitch-cell:hover { background: rgba(176,106,135,0.3); }
  .pitch-cell.selected { background: rgba(176,106,135,0.6); border-color: var(--gold); border-style: solid; }
  .direction-picker { margin-bottom: 12px; }
  .direction-options { display: flex; gap: 6px; }
  .direction-option { flex: 1; background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 8px 4px; font-size: 11px; font-weight: 600; }
  .direction-option:hover { border-color: var(--gold); }
  .direction-option.selected { background: var(--gold); border-color: var(--gold); color: var(--gold-ink); font-weight: 700; }
  .player-picker-team { color: var(--gold); }
  .player-picker.opp .player-picker-team { color: var(--crimson); }
  .player-picker-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
  .player-picker-btn { background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 8px 0; font-size: 12px; font-weight: 700; }
  .player-picker-btn:hover { border-color: var(--gold); }
  .player-picker.opp .player-picker-btn:hover { border-color: var(--crimson); }
  .player-picker-skip { display: block; width: 100%; text-align: center; background: transparent; border: none; color: var(--ink-muted); font-size: 11px; margin-top: 8px; padding: 4px; }
  .player-picker-skip:hover { color: var(--ink); }
  @keyframes pop-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

  .possession-block { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .possession-block .event-category-label { margin: 0 0 8px; }
  .possession-toggle { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .poss-btn { padding: 8px 4px; border-radius: 6px; font-weight: 700; font-size: 11px; letter-spacing: 0.02em; border: 1px solid var(--line); background: var(--bg); color: var(--ink-muted); }
  .poss-btn.us.active { background: var(--gold); color: var(--gold-ink); border-color: var(--gold); }
  .poss-btn.opp.active { background: var(--crimson); color: #FFFFFF; border-color: var(--crimson); }
  .poss-btn.neutral.active { background: var(--ink-muted); color: var(--bg); border-color: var(--ink-muted); }
  .poss-btn.disabled { opacity: 0.4; cursor: not-allowed; }
  .possession-readout { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; font-size: 11px; font-variant-numeric: tabular-nums; }
  .possession-readout .us { color: var(--gold); }
  .possession-readout .opp { color: var(--crimson); }
  .possession-readout .neutral { color: var(--ink-muted); }

  .event-category-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); font-weight: 700; margin: 6px 0 5px; }
  .event-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .event-btn { position: relative; text-align: left; background: var(--surface); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 6px 6px 6px 20px; font-size: 10px; line-height: 1.25; font-weight: 500; transition: border-color 0.12s ease; }
  .event-btn.pos:hover { border-color: var(--gold); }
  .event-btn.neg:hover { border-color: var(--crimson); }
  .event-btn.disabled { opacity: 0.4; cursor: not-allowed; }
  .event-hotkey { position: absolute; left: 5px; top: 50%; transform: translateY(-50%); font-size: 9px; color: var(--ink-muted); font-weight: 800; }

  .compile-progress { background: var(--surface); border: 1px solid var(--gold); border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
  .compile-progress-label { font-size: 11px; color: var(--ink); margin-bottom: 6px; }
  .compile-progress-bar { height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden; }
  .compile-progress-bar > div { height: 100%; background: var(--gold); transition: width 0.2s ease; }

  .table-scroll { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }

  .range-filter-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .range-filter-actions { display: flex; gap: 6px; }
  .range-preset-btn { background: var(--surface); border: 1px solid var(--line); color: var(--ink-muted); border-radius: 6px; padding: 4px 10px; font-size: 10px; font-weight: 600; }
  .range-preset-btn:hover { border-color: var(--gold); color: var(--ink); }
  .range-filter-values { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--gold); font-weight: 700; margin-bottom: 8px; }
  .dual-range { position: relative; height: 24px; }
  .dual-range-fill { position: absolute; top: 10px; height: 4px; background: var(--gold); border-radius: 2px; }
  .dual-range input[type="range"] { position: absolute; top: 0; left: 0; width: 100%; margin: 0; background: transparent; -webkit-appearance: none; pointer-events: none; }
  .dual-range input[type="range"]::-webkit-slider-runnable-track { height: 4px; background: var(--line); border-radius: 2px; }
  .dual-range input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; width: 16px; height: 16px; border-radius: 50%; background: var(--gold); border: 2px solid var(--bg); cursor: pointer; margin-top: -6px; }
  .dual-range input[type="range"]::-moz-range-track { height: 4px; background: var(--line); border-radius: 2px; }
  .dual-range input[type="range"]::-moz-range-thumb { pointer-events: auto; width: 14px; height: 14px; border-radius: 50%; background: var(--gold); border: 2px solid var(--bg); cursor: pointer; }
  .stat-table { border-collapse: collapse; width: 100%; font-size: 12px; white-space: nowrap; }
  .stat-table th, .stat-table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--line); }
  .stat-table thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); font-weight: 700; position: sticky; top: 0; background: var(--surface); }
  .stat-table th.col-us { color: var(--gold); }
  .stat-table th.col-opp { color: var(--crimson); }
  .stat-table tbody tr:last-child td { border-bottom: none; }
  .stat-table tbody tr:hover { background: rgba(176,106,135,0.05); }
  .stat-cell { display: inline-flex; align-items: center; gap: 6px; }
  .stat-cell-count { font-variant-numeric: tabular-nums; font-weight: 700; }
  .stat-cell-empty { color: var(--ink-muted); }
  .compile-icon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; background: transparent; border: 1px solid var(--line); color: var(--ink-muted); }
  .compile-icon:hover { border-color: var(--gold); color: var(--ink); }
  .compile-icon.ready { border-color: var(--gold); color: var(--gold); }
  .compile-icon:disabled { opacity: 0.35; cursor: not-allowed; }
  .compile-icon.spinning { font-size: 13px; border-style: dashed; }

  .rating-content { max-width: 1100px; margin: 0 auto; padding: 24px 18px 40px; }
  .rating-explainer { font-size: 12px; color: var(--ink-muted); line-height: 1.6; margin: 0 0 20px; max-width: 720px; }
  .rating-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
  @media (max-width: 900px) { .rating-columns { grid-template-columns: 1fr; } }
  .rating-column-title { font-size: 15px; font-weight: 800; margin: 0 0 12px; }
  .rating-column-title.us { color: var(--gold); }
  .rating-column-title.opp { color: var(--crimson); }
  .rating-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin-bottom: 12px; }
  .team-rating-card.us { border-color: var(--gold); }
  .team-rating-card.opp { border-color: var(--crimson); }
  .rating-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .rating-card-title { font-weight: 700; font-size: 13px; flex: 1; }
  .rating-card-sub { font-weight: 400; color: var(--ink-muted); font-size: 11px; }
  .rating-values-row { display: flex; gap: 16px; margin-bottom: 10px; }
  .rating-value-block { display: flex; flex-direction: column; gap: 4px; }
  .rating-value-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); font-weight: 700; }
  .rating-value-suggestion { font-size: 16px; font-weight: 800; color: var(--ink-muted); }
  .rating-values-row input[type="number"] { width: 60px; background: var(--bg); border: 1px solid var(--line); color: var(--gold); font-weight: 800; font-size: 16px; text-align: center; border-radius: 6px; padding: 5px; }
  .rating-values-row input[type="number"]:disabled { opacity: 0.3; cursor: not-allowed; }
  .rating-comment { width: 100%; min-height: 56px; background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 8px 10px; font-size: 12px; font-family: inherit; resize: vertical; }
  .rating-comment-inline { width: 100%; background: var(--bg); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 6px 10px; font-size: 12px; font-family: inherit; }
  .player-rating-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
  .add-player-row { display: flex; gap: 8px; }
  .add-player-row input { width: 90px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); border-radius: 6px; padding: 6px 10px; font-size: 12px; }
`;
