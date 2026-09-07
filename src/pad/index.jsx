// Assistant coach terrain (Vestiaire → Assistant) et fiches d'aide (Ressources → Aide) —
// extrait de App.jsx (séparation des fichiers, sans changement de comportement).

import { useState, useEffect } from "react";
import { Download } from "lucide-react";
import { formatDateFr, computeAge, newId, playerFullName, todayIso } from "../lib/utils.js";

const ASSISTANT_ROLES = [
  { key: "coach", label: "Coach" },
  { key: "video", label: "Analyste vidéo" },
  { key: "recruteur", label: "Recruteur" },
  { key: "medecin", label: "Médecin" },
  { key: "physique", label: "Préparateur physique" },
  { key: "mental", label: "Préparateur mental" },
];
// Le moteur de réponse reste commun (les mêmes données peuvent intéresser plusieurs rôles) — seules
// les suggestions mises en avant changent, pour que chacun voie d'abord ce qui le concerne.
const ASSISTANT_SUGGESTIONS_BY_ROLE = {
  coach: ["Résumé du jour", "Cette semaine ?", "Quel est le prochain match ?", "Combien de joueurs dans l'effectif ?", "Quel est mon classement ?", "Quel est mon bilan de saison ?", "Qui a des cartons cette saison ?"],
  video: ["Qui sont mes meilleurs buteurs ?", "Quel est mon bilan de saison ?", "Qui a des cartons cette saison ?"],
  recruteur: ["Quels joueurs sont en intérêt fort ?", "Quel est le profil recherché pour un défenseur central ?", "Quels postes sont prioritaires à renforcer ?"],
  medecin: ["Qui est blessé actuellement ?", "Qui est en zone de fatigue ?", "Des certificats médicaux à renouveler ?"],
  physique: ["Qui progresse le plus en ce moment ?", "Qui est en zone de fatigue ?"],
  mental: ["Où en sont les objectifs de développement ?"],
};
const ASSISTANT_SUGGESTIONS = [
  "Résumé du jour",
  "Cette semaine ?",
  "Qui est blessé actuellement ?",
  "Quel est le prochain match ?",
  "Qui progresse le plus en ce moment ?",
  "Qui sont mes meilleurs buteurs ?",
  "Combien de joueurs dans l'effectif ?",
  "Quel est mon classement ?",
  "Qui est en zone de fatigue ?",
  "Quels joueurs sont en intérêt fort ?",
  "Quel est mon bilan de saison ?",
  "Où en sont les objectifs de développement ?",
  "Qui a des cartons cette saison ?",
  "Des certificats médicaux à renouveler ?",
];

function findMentionedPlayer(question, roster) {
  const q = question.toLowerCase();
  let best = null, bestLen = 0;
  roster.forEach((p) => {
    const last = (p.lastName || "").toLowerCase().trim();
    const first = (p.firstName || "").toLowerCase().trim();
    if (last.length > 2 && q.includes(last) && last.length > bestLen) { best = p; bestLen = last.length; }
    if (first.length > 2 && q.includes(first) && first.length > bestLen) { best = p; bestLen = first.length; }
  });
  return best;
}

function findMentionedPlayers(question, roster) {
  const q = question.toLowerCase();
  const found = [];
  roster.forEach((p) => {
    const last = (p.lastName || "").toLowerCase().trim();
    const first = (p.firstName || "").toLowerCase().trim();
    if ((last.length > 2 && q.includes(last)) || (first.length > 2 && q.includes(first))) {
      if (!found.some((x) => x.id === p.id)) found.push(p);
    }
  });
  return found;
}

function answerPlayerProfile(player, ctx) {
  const parts = [];
  const activeInjury = ctx.injuries.find((i) => i.playerId === player.id && i.status === "en cours");
  parts.push(activeInjury ? `blessé actuellement (${activeInjury.type})` : "pas de blessure en cours");

  if (ctx.fatigueRisks.some((f) => f.player.id === player.id)) parts.push("en zone de vigilance charge/fatigue");

  const objectives = ctx.devPlans[player.id] || [];
  const activeObj = objectives.filter((o) => o.status === "En cours");
  const atteints = objectives.filter((o) => o.status === "Atteint").length;
  if (objectives.length > 0) parts.push(`${activeObj.length} objectif(s) en cours, ${atteints} atteint(s)`);

  const stat = ctx.leagueStats.find((s) => s.id === player.id);
  if (stat && stat.counts) {
    const buts = stat.counts.but || 0, passes = stat.counts.passe_decisive || 0;
    if (buts > 0 || passes > 0) parts.push(`${buts} but(s) et ${passes} passe(s) décisive(s) cette saison`);
    const jaunes = stat.counts.carton_jaune || 0, rouges = stat.counts.carton_rouge || 0;
    if (jaunes > 0 || rouges > 0) parts.push(`${jaunes} carton(s) jaune(s) et ${rouges} rouge(s)`);
  }

  const hp = ctx.healthProfiles[player.id];
  if (hp && hp.certificatMedicalDate) {
    const daysUntil = (new Date(hp.certificatMedicalDate) - new Date(todayIso())) / 86400000;
    if (daysUntil >= 0 && daysUntil <= 30) parts.push(`certificat médical à renouveler le ${formatDateFr(hp.certificatMedicalDate)}`);
  }

  return `${playerFullName(player)} : ${parts.join(", ")}.`;
}

function answerPlayerComparison(playerA, playerB, ctx) {
  const statA = ctx.leagueStats.find((s) => s.id === playerA.id);
  const statB = ctx.leagueStats.find((s) => s.id === playerB.id);
  const formA = computeRecentFormScore(playerA.id, ctx.allFullMatches, 3);
  const formB = computeRecentFormScore(playerB.id, ctx.allFullMatches, 3);
  const injA = ctx.injuries.some((i) => i.playerId === playerA.id && i.status === "en cours");
  const injB = ctx.injuries.some((i) => i.playerId === playerB.id && i.status === "en cours");

  const line = (label, a, b) => `${label} — ${playerFullName(playerA)} : ${a}, ${playerFullName(playerB)} : ${b}`;
  const parts = [
    line("Buts", (statA && statA.counts.but) || 0, (statB && statB.counts.but) || 0),
    line("Passes décisives", (statA && statA.counts.passe_decisive) || 0, (statB && statB.counts.passe_decisive) || 0),
    line("Indice de forme récent", formA != null ? `${formA}/100` : "n.d.", formB != null ? `${formB}/100` : "n.d."),
    line("Blessé actuellement", injA ? "oui" : "non", injB ? "oui" : "non"),
  ];
  return parts.join(" · ");
}

function answerFormTrend(ctx, direction) {
  const scored = ctx.roster.map((p) => ({ player: p, form: computeRecentFormScore(p.id, ctx.allFullMatches, 3) })).filter((s) => s.form != null);
  if (scored.length === 0) return "Pas assez de matchs tagués récemment pour évaluer une tendance.";
  scored.sort((a, b) => (direction === "up" ? b.form - a.form : a.form - b.form));
  const top = scored.slice(0, 3);
  const label = direction === "up" ? "Meilleur indice de forme récent" : "Indice de forme récent le plus bas";
  return `${label} : ${top.map((s) => `${playerFullName(s.player)} (${s.form}/100)`).join(", ")}.`;
}

function answerDemographics(ctx) {
  const ages = ctx.roster.map((p) => computeAge(p.birthDate)).filter((a) => a != null);
  const avgAge = ages.length > 0 ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : null;
  const byPosition = {};
  ctx.roster.forEach((p) => { byPosition[p.position] = (byPosition[p.position] || 0) + 1; });
  const posText = Object.entries(byPosition).map(([pos, n]) => `${n} ${pos.toLowerCase()}${n > 1 ? "s" : ""}`).join(", ");
  return `Effectif : ${ctx.roster.length} joueur${ctx.roster.length > 1 ? "s" : ""}${avgAge != null ? `, âge moyen ${avgAge} ans` : ""}. Répartition : ${posText || "non renseignée"}.`;
}

function findLibraryLinkFor(theme, libraryEntries) {
  const match = libraryEntries.find((e) => e.theme && e.theme.toLowerCase().includes(theme.toLowerCase()));
  return match ? ` À ce sujet, tu as "${match.title}" dans ta Bibliothèque.` : "";
}

function answerWeeklyDigest(ctx) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const todayS = todayIso();

  const weekMatches = ctx.allFullMatches.filter((m) => m.date >= cutoffStr && m.date <= todayS);
  const weekSessions = ctx.sessions.filter((s) => s.date >= cutoffStr && s.date <= todayS);
  const newInjuries = ctx.injuries.filter((i) => i.dateDebut >= cutoffStr && i.dateDebut <= todayS);
  const weekCauseries = ctx.causeries.filter((c) => c.date >= cutoffStr && c.date <= todayS);

  const parts = [];
  parts.push(`${weekMatches.length} match(s) joué(s)`);
  parts.push(`${weekSessions.length} séance(s)`);
  if (newInjuries.length > 0) parts.push(`${newInjuries.length} nouvelle(s) blessure(s)`);
  if (weekCauseries.length > 0) parts.push(`${weekCauseries.length} causerie(s) préparée(s)`);
  return `Cette semaine (7 derniers jours) : ${parts.join(", ")}.`;
}

function findMentionedPosition(question) {
  const q = question.toLowerCase();
  return PROFILE_POSITIONS.find((pos) => q.includes(pos.toLowerCase())) || null;
}

function answerAssistantQuestion(question, ctx) {
  const q = question.toLowerCase();

  if (/profil recherch|on cherche.*poste|on veut.*poste/.test(q)) {
    const position = findMentionedPosition(question);
    if (!position) return "Précise le poste (ex. \"profil recherché pour un défenseur central\") — les postes possibles sont : " + PROFILE_POSITIONS.join(", ") + ".";
    if (position === "Gardien") return "Le profil recherché (Projet de jeu) ne couvre pas les gardiens avec les mêmes axes que le reste — regarde la Vue recruteur pour le détail.";
    const profile = ctx.gameplan.postProfiles[position] || { passes: 5, technique: 5, finition: 5, defense: 5, discipline: 5 };
    const relevantPaths = RECRUITER_RELEVANT_QUESTIONS[position] || [];
    const relevantAnswers = relevantPaths.map((p) => getGameplanValues(ctx.gameplan, p)).flat().filter(Boolean);
    return `Profil recherché — ${position} : passes ${profile.passes}/10, technique ${profile.technique}/10, finition ${profile.finition}/10, défense ${profile.defense}/10, discipline ${profile.discipline}/10.` +
      (relevantAnswers.length > 0 ? ` Côté Projet de jeu : ${relevantAnswers.join(", ")}.` : "");
  }

  if (/poste.*prioritaire|poste.*renforcer|manque.*joueur.*poste|besoin.*recrutement/.test(q)) {
    const counts = {};
    PROFILE_POSITIONS.forEach((pos) => { counts[pos] = 0; });
    ctx.roster.forEach((p) => { const pos = precisePositionToProfile(p.positionPrecise || p.position); if (counts[pos] != null) counts[pos]++; });
    const thin = PROFILE_POSITIONS.filter((pos) => counts[pos] <= 1).sort((a, b) => counts[a] - counts[b]);
    if (thin.length === 0) return "Aucun poste particulièrement dégarni dans l'effectif actuel (au moins 2 joueurs partout).";
    return `Postes les plus dégarnis dans l'effectif : ${thin.map((pos) => `${pos} (${counts[pos]})`).join(", ")}.`;
  }

  if (/résumé|que dois-je savoir|point du jour|briefing/.test(q)) {
    const parts = [];
    const activeInjuries = ctx.injuries.filter((i) => i.status === "en cours");
    if (activeInjuries.length > 0) parts.push(`${activeInjuries.length} blessure(s) en cours`);
    if (ctx.fatigueRisks.length > 0) parts.push(`${ctx.fatigueRisks.length} joueur(s) en zone de vigilance`);
    if (ctx.upcomingFixture) parts.push(`prochain match vs ${ctx.upcomingFixture.opponent} le ${formatDateFr(ctx.upcomingFixture.date)}`);
    if (ctx.upcomingSession) parts.push(`prochaine séance "${ctx.upcomingSession.name}" le ${formatDateFr(ctx.upcomingSession.date)}`);
    if (ctx.discipline.suspendedPlayers.length > 0) parts.push(`suspension déclenchée pour ${ctx.discipline.suspendedPlayers.map((p) => playerFullName(p)).join(", ")}`);
    if (parts.length === 0) return "Rien de particulier à signaler aujourd'hui.";
    return `Résumé du jour : ${parts.join(" · ")}.`;
  }

  const mentionedPlayers = findMentionedPlayers(question, ctx.roster);
  if (mentionedPlayers.length >= 2 && /compar/.test(q)) return answerPlayerComparison(mentionedPlayers[0], mentionedPlayers[1], ctx);
  if (mentionedPlayers.length >= 1) return answerPlayerProfile(mentionedPlayers[0], ctx);

  if (/progresse|amélior|meilleure forme/.test(q)) return answerFormTrend(ctx, "up");
  if (/régresse|baisse.*forme|décline|moins bonne forme/.test(q)) return answerFormTrend(ctx, "down");

  if (/âge moyen|combien de joueurs|effectif compte|taille.*effectif/.test(q)) return answerDemographics(ctx);

  if (/cette semaine|semaine dernière|derniers jours/.test(q)) return answerWeeklyDigest(ctx);

  if (/bless|soucis physique|indisponib/.test(q)) {
    const active = ctx.injuries.filter((i) => i.status === "en cours");
    if (active.length === 0) return "Aucun joueur blessé actuellement, à priori.";
    return `${active.length} joueur${active.length > 1 ? "s" : ""} blessé${active.length > 1 ? "s" : ""} : ${active.map((i) => { const p = ctx.roster.find((r) => r.id === i.playerId); return p ? `${playerFullName(p)} (${i.type})` : "?"; }).join(", ")}.` + findLibraryLinkFor("sciences du sport", ctx.libraryEntries);
  }

  if (/prochain(e)? match|prochaine rencontre|prochain adversaire/.test(q)) {
    if (!ctx.upcomingFixture) return "Aucun prochain match programmé dans Compétitions, à priori.";
    return `Prochain match : vs ${ctx.upcomingFixture.opponent}, le ${formatDateFr(ctx.upcomingFixture.date)}${ctx.upcomingFixture.venue ? ` (${ctx.upcomingFixture.venue})` : ""}.`;
  }

  if (/prochaine séance|prochain entraînement/.test(q)) {
    if (!ctx.upcomingSession) return "Aucune séance programmée dans Séance, à priori.";
    return `Prochaine séance : "${ctx.upcomingSession.name}" le ${formatDateFr(ctx.upcomingSession.date)}.`;
  }

  if (/buteur|meilleur.*but|qui marque/.test(q)) {
    if (ctx.leagueStats.length === 0) return "Pas encore assez de matchs tagués pour établir un classement de buteurs.";
    const sorted = [...ctx.leagueStats].filter((s) => s.counts.but > 0).sort((a, b) => b.counts.but - a.counts.but).slice(0, 5);
    if (sorted.length === 0) return "Aucun but tagué pour l'instant.";
    return `Meilleurs buteurs : ${sorted.map((s) => `${s.name} (${s.counts.but})`).join(", ")}.`;
  }

  if (/passeur|passe décisive/.test(q)) {
    const sorted = [...ctx.leagueStats].filter((s) => s.counts.passe_decisive > 0).sort((a, b) => b.counts.passe_decisive - a.counts.passe_decisive).slice(0, 5);
    if (sorted.length === 0) return "Aucune passe décisive taguée pour l'instant.";
    return `Meilleurs passeurs : ${sorted.map((s) => `${s.name} (${s.counts.passe_decisive})`).join(", ")}.`;
  }

  if (/alerte/.test(q)) {
    if (ctx.alerts.length === 0) return "Rien à signaler dans les alertes du jour.";
    return `${ctx.alerts.length} alerte${ctx.alerts.length > 1 ? "s" : ""} : ${ctx.alerts.slice(0, 5).map((a) => a.label).join(" · ")}${ctx.alerts.length > 5 ? "…" : ""}`;
  }

  if (/classement|position/.test(q)) {
    if (ctx.standings.length === 0) return "Pas encore de classement renseigné dans Compétitions.";
    const top5 = ctx.standings.slice(0, 5).map((t, i) => `${i + 1}. ${t.team} (${t.points} pts)`).join(" · ");
    return `Classement (5 premiers) : ${top5}`;
  }

  if (/fatigue|vigilance|charge.*élevée|surmenage/.test(q)) {
    if (ctx.fatigueRisks.length === 0) return "Aucun joueur en zone de vigilance charge/fatigue actuellement.";
    return `En zone de vigilance : ${ctx.fatigueRisks.map((f) => playerFullName(f.player)).join(", ")}.` + findLibraryLinkFor("sciences du sport", ctx.libraryEntries);
  }

  if (/intérêt fort|scouting/.test(q)) {
    const strong = ctx.scouted.filter((p) => p.interestLevel === "Fort");
    if (strong.length === 0) return "Aucun joueur marqué \"Intérêt fort\" dans Scouting pour l'instant.";
    return `${strong.length} joueur${strong.length > 1 ? "s" : ""} en intérêt fort : ${strong.map((p) => `${p.name || "?"} (${p.club || "?"})`).join(", ")}.`;
  }

  if (/carton|discipline|suspension/.test(q)) {
    const d = ctx.discipline;
    let text = `${d.totalYellow} carton${d.totalYellow > 1 ? "s" : ""} jaune${d.totalYellow > 1 ? "s" : ""} et ${d.totalRed} rouge${d.totalRed > 1 ? "s" : ""} cette saison.`;
    if (d.suspendedPlayers.length > 0) text += ` Suspension déclenchée (3 jaunes en 3 mois) pour : ${d.suspendedPlayers.map((p) => playerFullName(p)).join(", ")}.`;
    return text;
  }

  if (/objectif|développement/.test(q)) {
    let total = 0, atteints = 0, procheDuBut = [];
    Object.entries(ctx.devPlans).forEach(([playerId, objectives]) => {
      const p = ctx.roster.find((r) => r.id === playerId);
      (objectives || []).forEach((o) => {
        total++;
        if (o.status === "Atteint") atteints++;
        const pct = objectiveProgressPct(o);
        if (pct != null && pct >= 90 && o.status === "En cours" && p) procheDuBut.push(`${playerFullName(p)} ("${o.title}")`);
      });
    });
    if (total === 0) return "Aucun objectif de développement renseigné pour l'instant.";
    let text = `${atteints}/${total} objectif${total > 1 ? "s" : ""} atteint${atteints > 1 ? "s" : ""}.`;
    if (procheDuBut.length > 0) text += ` Proches du but : ${procheDuBut.join(", ")}.`;
    return text;
  }

  if (/certificat|licence|autorisation/.test(q)) {
    const soon = [];
    Object.entries(ctx.healthProfiles).forEach(([playerId, profile]) => {
      if (!profile.certificatMedicalDate) return;
      const daysUntil = (new Date(profile.certificatMedicalDate) - new Date(todayIso())) / 86400000;
      if (daysUntil >= 0 && daysUntil <= 30) {
        const p = ctx.roster.find((r) => r.id === playerId);
        if (p) soon.push(`${playerFullName(p)} (${formatDateFr(profile.certificatMedicalDate)})`);
      }
    });
    if (soon.length === 0) return "Aucun certificat médical n'expire dans les 30 prochains jours, à priori.";
    return `Certificats médicaux à renouveler bientôt : ${soon.join(", ")}.`;
  }

  if (/bilan|résultat|victoire|défaite/.test(q)) {
    const r = ctx.seasonRecord;
    if (r.played === 0) return "Aucun match clôturé pour l'instant.";
    return `Bilan : ${r.played} match${r.played > 1 ? "s" : ""} joué${r.played > 1 ? "s" : ""}, ${r.wins}V ${r.draws}N ${r.losses}D, ${r.goalsFor} buts marqués pour ${r.goalsAgainst} encaissés.`;
  }

  if (/réathlétisation|programme.*blessure|rééducation/.test(q)) {
    const active = ctx.injuries.filter((i) => i.status === "en cours" && (i.programPhases || []).length > 0);
    if (active.length === 0) return "Aucun programme de réathlétisation en cours pour l'instant.";
    return active.map((i) => {
      const p = ctx.roster.find((r) => r.id === i.playerId);
      const done = i.programPhases.filter((ph) => ph.completed).length;
      return `${p ? playerFullName(p) : "?"} : ${done}/${i.programPhases.length} phases validées`;
    }).join(" · ");
  }

  if (/staff|éducateur/.test(q)) {
    if (ctx.staff.length === 0) return "Aucun membre du staff enregistré dans Club pour l'instant.";
    return `${ctx.staff.length} membre${ctx.staff.length > 1 ? "s" : ""} du staff : ${ctx.staff.map((s) => `${s.firstName} ${s.lastName} (${staffRoles(s).join(", ")})`).join(", ")}.`;
  }

  if (/bibliothèque|livre|référence/.test(q)) {
    if (ctx.libraryEntries.length === 0) return "Aucune référence enregistrée dans la Bibliothèque pour l'instant.";
    const toRead = ctx.libraryEntries.filter((e) => e.status === "À consulter");
    return `${ctx.libraryEntries.length} référence${ctx.libraryEntries.length > 1 ? "s" : ""} au total, dont ${toRead.length} à consulter.`;
  }

  if (/exercice (pour|sur|de|contre)/.test(q)) {
    const m = q.match(/exercice (?:pour|sur|de|contre) (.+?)(?:\?|$)/);
    const searchPhrase = m ? m[1].trim() : "";
    if (!searchPhrase) return "Précise le thème recherché (ex. \"exercice pour le pressing\", \"exercice sur la finition\").";
    const searchTerm = normalizeNameForMatch(searchPhrase);
    const matches = ctx.exercises.filter((ex) => normalizeNameForMatch(`${ex.name} ${ex.objectif} ${ex.theme || ""}`).includes(searchTerm)).slice(0, 6);
    if (matches.length === 0) return `Aucun exercice trouvé pour "${searchPhrase}" dans ta bibliothèque — essaie un autre mot-clé, ou regarde Vestiaire → Séance → Bibliothèque d'exercices.`;
    return `Exercice${matches.length > 1 ? "s" : ""} trouvé${matches.length > 1 ? "s" : ""} : ${matches.map((ex) => ex.name).join(", ")}.`;
  }

  if (/système|philosophie|identité de jeu|comment on presse|comment on construit|comment on défend|bloc défensif/.test(q)) {
    const g = ctx.gameplan;
    const parts = [];
    if (g.system) parts.push(`système ${g.system}`);
    if (g.identity) parts.push(`identité : ${g.identity}`);
    if (/presse|pressing/.test(q) && g.defensive.pressing) parts.push(`pressing : ${g.defensive.pressing}`);
    if (/construit|construction/.test(q) && g.offensive.construction) parts.push(`construction : ${g.offensive.construction}`);
    if (/défend|bloc/.test(q) && g.defensive.organisation) parts.push(`organisation défensive : ${g.defensive.organisation}`);
    if (parts.length === 0) return "Rien de renseigné dans le Projet de jeu sur ce point pour l'instant — complète-le dans Vestiaire → Projet de jeu.";
    return parts.join(" · ") + ".";
  }

  if (/programme de la semaine|séances prévues|planning de la semaine|prochaines séances/.test(q)) {
    const todayS = todayIso();
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const upcoming = ctx.sessions.filter((s) => s.date >= todayS && s.date <= in7.toISOString().slice(0, 10)).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (upcoming.length === 0) return "Aucune séance programmée dans les 7 prochains jours, à priori.";
    return `Séances à venir cette semaine : ${upcoming.map((s) => `${s.name} (${formatDateFr(s.date)})`).join(", ")}.`;
  }

  if (/dernière causerie|causerie précédente/.test(q)) {
    if (ctx.causeries.length === 0) return "Aucune causerie préparée pour l'instant.";
    const last = [...ctx.causeries].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return `Dernière causerie : "${last.name}" le ${formatDateFr(last.date)}${last.usefulnessRating ? ` — utilité notée ${last.usefulnessRating}/5` : " — pas encore notée"}.`;
  }

  if (/charge.*gardien|gardien.*charge|plongeon|séances.*gardien/.test(q)) {
    if (ctx.goalkeeperLoad.length === 0) return "Aucune charge gardien enregistrée pour l'instant — Vestiaire → Suivi médical → Gardien.";
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
    const recent = ctx.goalkeeperLoad.filter((l) => l.date >= cutoff.toISOString().slice(0, 10));
    const totalPlongeons = recent.reduce((s, l) => s + (Number(l.plongeons) || 0), 0);
    const totalSauts = recent.reduce((s, l) => s + (Number(l.sauts) || 0), 0);
    return `Charge gardien (7 derniers jours) : ${totalPlongeons} plongeon${totalPlongeons > 1 ? "s" : ""}, ${totalSauts} saut${totalSauts > 1 ? "s" : ""} au total.`;
  }

  if (/entente|club de licence|groupement/.test(q)) {
    const withClub = ctx.roster.filter((p) => p.licenceClub && p.licenceClub.trim());
    if (withClub.length === 0) return "Aucun joueur avec un club de licence différent renseigné pour l'instant.";
    return `${withClub.length} joueur${withClub.length > 1 ? "s" : ""} en entente : ${withClub.map((p) => `${playerFullName(p)} (${p.licenceClub})`).join(", ")}.`;
  }

  if (/déjà joué contre|contre qui|historique.*adversaire|face à/.test(q)) {
    const opponentMatch = ctx.allFullMatches.map((m) => m.opponent).filter(Boolean).find((opp) => q.includes(opp.toLowerCase()));
    if (!opponentMatch) return "Cite le nom de l'adversaire pour que je retrouve l'historique (ex. \"déjà joué contre Nice\").";
    const games = ctx.allFullMatches.filter((m) => m.opponent === opponentMatch);
    let w = 0, d = 0, l = 0;
    games.forEach((m) => {
      const gf = m.tags.filter((t) => t.eventKey === "but" && t.team === "us").length;
      const ga = m.tags.filter((t) => t.eventKey === "but" && t.team === "opp").length;
      if (gf > ga) w++; else if (gf < ga) l++; else d++;
    });
    return `${games.length} match(s) contre ${opponentMatch} : ${w}V ${d}N ${l}D.`;
  }

  return "Je ne sais pas encore répondre à ce type de question — j'ai reconnu ni un joueur de ton effectif, ni un sujet précis (blessures, prochain match, séance, buteurs, passeurs, alertes, classement, fatigue, scouting, discipline, objectifs, certificats, bilan, staff, bibliothèque, exercices, système de jeu, programme de la semaine, causerie, charge gardien, entente, historique face à un adversaire). Essaie de citer un nom de joueur, une des suggestions ci-dessous, ou reformule.";
}

const GENERIC_JOURNAL_PROMPTS = [
  "Qu'as-tu appris cette semaine en tant que coach ?",
  "Quel est ton plus grand défi actuel avec cette équipe ?",
  "Y a-t-il une décision récente que tu remets en question ?",
  "Qu'est-ce qui te rend fier de ton travail en ce moment ?",
];

function generateJournalPrompts(recentMatches, causeries) {
  const prompts = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  recentMatches.filter((m) => m.date >= cutoffStr && m.date <= todayIso()).forEach((m) => {
    prompts.push(`Qu'est-ce que tu retiens du match contre ${m.opponent || "cet adversaire"} (${formatDateFr(m.date)}) ?`);
  });

  causeries.filter((c) => c.date >= cutoffStr && c.date <= todayIso() && !c.usefulnessRating).forEach((c) => {
    prompts.push(`Comment s'est passée ta préparation pour "${c.name}" ?`);
  });

  const generic = [...GENERIC_JOURNAL_PROMPTS].sort(() => Math.random() - 0.5).slice(0, 2);
  return [...prompts, ...generic].slice(0, 4);
}

function emptyJournalEntry(prefillTitle) {
  return { id: newId(), title: prefillTitle || "", date: todayIso(), content: "" };
}

function TeamReportView({ ctx, onBack }) {
  const activeInjuries = ctx.injuries.filter((i) => i.status === "en cours");
  const topScorers = [...ctx.leagueStats].filter((s) => s.counts.but > 0).sort((a, b) => b.counts.but - a.counts.but).slice(0, 5);
  const activeObjectives = Object.values(ctx.devPlans).flat().filter((o) => o.status === "En cours").length;
  const totalObjectives = Object.values(ctx.devPlans).flat().length;

  return (
    <div>
      <div className="range-filter-header no-print">
        <button className="btn btn-ghost btn-small" onClick={onBack}>‹ Retour</button>
        <button className="btn btn-ghost btn-small" onClick={() => window.print()}><Download size={13} /> Exporter en PDF</button>
      </div>
      <div className="causerie-print-page">
        <div className="stats-screen-header">
          <div className="eyebrow">Point d'équipe</div>
          <h1>Généré le {formatDateFr(todayIso())}</h1>
        </div>

        <div className="panel-heading">Bilan de saison</div>
        <p>{ctx.seasonRecord.played} match(s) joué(s) — {ctx.seasonRecord.wins}V {ctx.seasonRecord.draws}N {ctx.seasonRecord.losses}D, {ctx.seasonRecord.goalsFor} buts marqués pour {ctx.seasonRecord.goalsAgainst} encaissés.</p>

        <div className="panel-heading">Effectif</div>
        <p>{answerDemographics(ctx)}</p>

        <div className="panel-heading">Suivi médical</div>
        <p>{activeInjuries.length === 0 ? "Aucune blessure en cours." : `${activeInjuries.length} blessure(s) en cours : ${activeInjuries.map((i) => { const p = ctx.roster.find((r) => r.id === i.playerId); return p ? `${playerFullName(p)} (${i.type})` : "?"; }).join(", ")}.`}</p>
        <p>{ctx.fatigueRisks.length === 0 ? "Aucun joueur en zone de vigilance charge/fatigue." : `En vigilance : ${ctx.fatigueRisks.map((f) => playerFullName(f.player)).join(", ")}.`}</p>

        <div className="panel-heading">Discipline</div>
        <p>{ctx.discipline.totalYellow} carton(s) jaune(s), {ctx.discipline.totalRed} rouge(s) cette saison.{ctx.discipline.suspendedPlayers.length > 0 ? ` Suspension déclenchée pour ${ctx.discipline.suspendedPlayers.map((p) => playerFullName(p)).join(", ")}.` : ""}</p>

        <div className="panel-heading">Meilleurs buteurs</div>
        <p>{topScorers.length === 0 ? "Aucun but tagué pour l'instant." : topScorers.map((s) => `${s.name} (${s.counts.but})`).join(", ")}</p>

        <div className="panel-heading">Développement individuel</div>
        <p>{totalObjectives === 0 ? "Aucun objectif renseigné." : `${activeObjectives}/${totalObjectives} objectif(s) en cours.`}</p>

        <div className="panel-heading">Échéances à venir</div>
        <p>{ctx.upcomingFixture ? `Prochain match : vs ${ctx.upcomingFixture.opponent} le ${formatDateFr(ctx.upcomingFixture.date)}.` : "Aucun prochain match programmé."}</p>
        <p>{ctx.upcomingSession ? `Prochaine séance : "${ctx.upcomingSession.name}" le ${formatDateFr(ctx.upcomingSession.date)}.` : "Aucune séance programmée."}</p>
      </div>
    </div>
  );
}

export function AssistantScreen({ roster, matches }) {
  const [assistantSubTab, setAssistantSubTab] = useState("discussion");
  const [assistantRole, setAssistantRole] = useState("coach");
  const [showTeamReport, setShowTeamReport] = useState(false);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [ctx, setCtx] = useState(null);
  const [journalEntries, setJournalEntries] = useState([]);
  const [journalForm, setJournalForm] = useState(null);
  const [recentMatches, setRecentMatches] = useState([]);
  const [causeries, setCauseries] = useState([]);

  useEffect(() => {
    try { setHistory(JSON.parse(window.localStorage.getItem("tf_assistant_history") || "[]")); } catch (e) {}
    try { setJournalEntries(JSON.parse(window.localStorage.getItem("tf_journal_entries") || "[]")); } catch (e) {}
    let loadedCauseries = [];
    try { loadedCauseries = JSON.parse(localStorage.getItem("tf_causeries") || "[]"); } catch (e) {}
    setCauseries(loadedCauseries);
    let injuries = [], scouted = [];
    try { injuries = JSON.parse(localStorage.getItem("tf_medical_injuries") || "[]"); } catch (e) {}
    try { scouted = JSON.parse(localStorage.getItem("tf_scouting") || "[]"); } catch (e) {}
    const comp = loadCompetitionsData();
    const allFixtures = comp.competitions.flatMap((c) => c.fixtures);
    const upcomingFixture = allFixtures.filter((f) => !fixtureIsPlayed(f)).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    let sessions = [];
    try { sessions = JSON.parse(localStorage.getItem("tf_sessions") || "[]"); } catch (e) {}
    const todayS = todayIso();
    const upcomingSession = [...sessions].filter((s) => s.date >= todayS).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const full = matches.map((m) => readMatchFromCache(m.id)).filter((m) => m && m.closed);
    setRecentMatches(full);
    const leagueStats = computeLeaguePlayerStats(full, roster, []);
    let wellness = [], rpeLog = [];
    try { wellness = JSON.parse(localStorage.getItem("tf_medical_wellness") || "[]"); } catch (e) {}
    try { rpeLog = JSON.parse(localStorage.getItem("tf_medical_rpe") || "[]"); } catch (e) {}
    const fatigueRisks = detectFatigueRisk(roster, wellness, rpeLog, 7);
    const mainChampionnat = comp.competitions.find((c) => c.type === "championnat");
    const standings = (mainChampionnat ? mainChampionnat.standings : []).map((t) => ({ ...t, points: Number(t.wins || 0) * 3 + Number(t.draws || 0) })).sort((a, b) => b.points - a.points);
    const alerts = []; // version simplifiée : les alertes complètes vivent dans Accueil, ici on reste sur les données de base

    let devPlans = {}, healthProfiles = {}, staff = [], libraryEntries = [], gameplan = emptyGameplanData(), exercises = [], goalkeeperLoad = [];
    try { devPlans = JSON.parse(localStorage.getItem("tf_development_plans") || "{}"); } catch (e) {}
    try { healthProfiles = JSON.parse(localStorage.getItem("tf_medical_health_profiles") || "{}"); } catch (e) {}
    try { staff = JSON.parse(window.localStorage.getItem("tf_club_staff") || "[]"); } catch (e) {}
    try { libraryEntries = JSON.parse(window.localStorage.getItem("tf_bibliotheque") || "[]"); } catch (e) {}
    try { gameplan = { ...emptyGameplanData(), ...JSON.parse(window.localStorage.getItem("tf_gameplan") || "{}") }; } catch (e) {}
    try { exercises = JSON.parse(localStorage.getItem("tf_exercices") || "[]"); } catch (e) {}
    try { goalkeeperLoad = JSON.parse(localStorage.getItem("tf_goalkeeper_load") || "[]"); } catch (e) {}

    let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
    full.forEach((m) => {
      const gf = m.tags.filter((t) => t.eventKey === "but" && t.team === "us").length;
      const ga = m.tags.filter((t) => t.eventKey === "but" && t.team === "opp").length;
      goalsFor += gf; goalsAgainst += ga;
      if (gf > ga) wins++; else if (gf < ga) losses++; else draws++;
    });
    const seasonRecord = { played: full.length, wins, draws, losses, goalsFor, goalsAgainst };

    const yellowByPlayer = gatherRosterCardDates(full, "carton_jaune");
    const redByPlayer = gatherRosterCardDates(full, "carton_rouge");
    let totalYellow = 0, totalRed = 0, suspendedPlayers = [];
    roster.forEach((p) => {
      const yellows = yellowByPlayer[p.id] || [];
      totalYellow += yellows.length;
      totalRed += (redByPlayer[p.id] || []).length;
      if (detectYellowCardSuspensions(yellows).length > 0) suspendedPlayers.push(p);
    });
    const discipline = { totalYellow, totalRed, suspendedPlayers };

    setCtx({ roster, injuries, scouted, upcomingFixture, upcomingSession, leagueStats, fatigueRisks, standings, alerts, devPlans, healthProfiles, staff, libraryEntries, seasonRecord, discipline, allFullMatches: full, sessions, causeries: loadedCauseries, gameplan, exercises, goalkeeperLoad });
  }, [roster, matches]);

  function persistHistory(next) {
    setHistory(next);
    try { window.localStorage.setItem("tf_assistant_history", JSON.stringify(next)); } catch (e) {}
  }
  function ask(question) {
    if (!question.trim() || !ctx) return;
    const answer = answerAssistantQuestion(question, ctx);
    persistHistory([...history, { id: newId(), question: question.trim(), answer, at: Date.now() }]);
    setInput("");
  }
  function clearHistory() {
    if (!confirm("Effacer tout l'historique de conversation ?")) return;
    persistHistory([]);
  }

  function persistJournal(next) {
    setJournalEntries(next);
    try { window.localStorage.setItem("tf_journal_entries", JSON.stringify(next)); } catch (e) { alert("La sauvegarde a échoué."); }
  }
  function openJournalPrompt(promptText) {
    setJournalForm(emptyJournalEntry(promptText));
    setAssistantSubTab("journal");
  }
  function saveJournalEntry() {
    if (!journalForm.content.trim()) { alert("Écris quelque chose avant d'enregistrer."); return; }
    persistJournal([journalForm, ...journalEntries]);
    setJournalForm(null);
  }
  function removeJournalEntry(id) {
    if (!confirm("Supprimer cette entrée du journal ?")) return;
    persistJournal(journalEntries.filter((e) => e.id !== id));
  }
  function addToJournalFromDiscussion(h) {
    setJournalForm(emptyJournalEntry(h.question));
    setJournalForm((f) => ({ ...f, content: `Contexte (assistant) : ${h.answer}\n\n` }));
    setAssistantSubTab("journal");
  }

  const journalPrompts = generateJournalPrompts(recentMatches, causeries);

  if (showTeamReport && ctx) {
    return <TeamReportView ctx={ctx} onBack={() => setShowTeamReport(false)} />;
  }

  return (
    <div className="stats-screen">
      <div className="stats-screen-header">
        <div className="eyebrow">Vestiaire</div>
        <h1>Coach adjoint</h1>
        <p className="subtitle">Pose une question sur ton équipe active, cite un nom de joueur pour sa fiche complète, ou tiens ton journal de bord — les réponses viennent de tes données déjà enregistrées dans l'app, pas d'un modèle de langage. Une base à brancher sur une vraie IA plus tard.</p>
      </div>

      <div className="radar-range-label">Adapter les suggestions à ton rôle</div>
      <div className="qcm-options" style={{ marginBottom: 14 }}>
        {ASSISTANT_ROLES.map((r) => (
          <button key={r.key} className={`qcm-option ${assistantRole === r.key ? "selected" : ""}`} onClick={() => setAssistantRole(r.key)}>{r.label}</button>
        ))}
      </div>

      <div className="tabs">
        <button className={`tab ${assistantSubTab === "discussion" ? "active" : ""}`} onClick={() => setAssistantSubTab("discussion")}>Discussion</button>
        <button className={`tab ${assistantSubTab === "journal" ? "active" : ""}`} onClick={() => setAssistantSubTab("journal")}>Journal de bord</button>
      </div>

      {assistantSubTab === "discussion" && (
        <>
      {ctx && (
        <button className="btn btn-ghost btn-small" onClick={() => setShowTeamReport(true)} style={{ marginBottom: 14 }}>📋 Générer un point d'équipe complet (PDF)</button>
      )}
      <div className="new-match-card" style={{ marginBottom: 16 }}>
        <label>Ta question
          <input
            type="text" placeholder="ex. Qui est blessé actuellement ?" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ask(input); }}
          />
        </label>
        <div className="form-actions">
          {history.length > 0 && <button className="btn btn-ghost" onClick={clearHistory}>Effacer la conversation</button>}
          <button className="btn btn-primary" onClick={() => ask(input)}>Demander</button>
        </div>
      </div>

      <div className="home-actions-row" style={{ flexWrap: "wrap", marginBottom: 20 }}>
        {(ASSISTANT_SUGGESTIONS_BY_ROLE[assistantRole] || ASSISTANT_SUGGESTIONS).map((s) => (
          <button key={s} className="btn btn-ghost btn-small" onClick={() => ask(s)}>{s}</button>
        ))}
      </div>

      {history.length === 0 && <div className="empty-state">Pose ta première question, ou choisis une suggestion ci-dessus.</div>}

      <div className="scouting-list">
        {[...history].reverse().map((h) => (
          <div key={h.id} className="new-match-card" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{h.question}</div>
            <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>{h.answer}</div>
            <button className="btn btn-ghost btn-small" onClick={() => addToJournalFromDiscussion(h)}>+ Ajouter au journal</button>
          </div>
        ))}
      </div>
      </>
      )}

      {assistantSubTab === "journal" && (
        <>
          <p className="radar-note">Ton espace personnel et libre — ce que tu retiens, ce qui t'interroge, ce qui ne rentre dans aucune case structurée de l'app. Les suggestions ci-dessous s'adaptent à ce qui vient de se passer (match récent, causerie sans bilan).</p>

          <div className="panel-heading">Pistes de réflexion</div>
          <div className="home-actions-row" style={{ flexWrap: "wrap", marginBottom: 20 }}>
            {journalPrompts.map((p, i) => (
              <button key={i} className="btn btn-ghost btn-small" onClick={() => openJournalPrompt(p)}>{p}</button>
            ))}
          </div>

          {!journalForm && <button className="btn btn-primary btn-large" onClick={() => setJournalForm(emptyJournalEntry())} style={{ marginBottom: 16 }}>+ Nouvelle entrée</button>}

          {journalForm && (
            <div className="new-match-card">
              <label>Titre (optionnel)<input type="text" value={journalForm.title} onChange={(e) => setJournalForm((f) => ({ ...f, title: e.target.value }))} autoFocus /></label>
              <label>Date<input type="date" value={journalForm.date} onChange={(e) => setJournalForm((f) => ({ ...f, date: e.target.value }))} /></label>
              <label>Contenu<textarea rows={6} value={journalForm.content} onChange={(e) => setJournalForm((f) => ({ ...f, content: e.target.value }))} /></label>
              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => setJournalForm(null)}>Annuler</button>
                <button className="btn btn-primary" onClick={saveJournalEntry}>Enregistrer</button>
              </div>
            </div>
          )}

          <div className="panel-heading" style={{ marginTop: 20 }}>Entrées précédentes</div>
          {journalEntries.length === 0 && <div className="empty-state">Aucune entrée pour l'instant. Utilise le bouton ci-dessus pour en ajouter une.</div>}
          <div className="scouting-list">
            {journalEntries.map((e) => (
              <div className="new-match-card" key={e.id} style={{ marginBottom: 10 }}>
                <div className="range-filter-header" style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 700 }}>{e.title || formatDateFr(e.date)}</div>
                  <button className="icon-btn" onClick={() => removeJournalEntry(e.id)} aria-label="Supprimer"><X size={14} /></button>
                </div>
                <div className="hint" style={{ marginTop: 0, marginBottom: 4 }}>{formatDateFr(e.date)}</div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{e.content}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Base de connaissance pour "Aide sur le site" — questions sur l'usage de l'app elle-même, pas sur
// les données de l'équipe. Même mécanique de reconnaissance par mots-clés que le Coach adjoint,
// mais un domaine totalement différent : comment faire quelque chose dans le site, pas quoi faire
// avec son équipe.
const HELP_TOPICS = [
  { keywords: ["créer un exercice", "ajouter un exercice", "nouvel exercice"], question: "Comment créer un exercice ?", answer: "Vestiaire → Séance → onglet \"Création d'exercices\" → \"+ Créer un exercice\". Renseigne nom, catégorie, thème (optionnel, avec des suggestions), objectif, durée, et dessine le schéma sur le terrain." },
  { keywords: ["thème", "regrouper les exercices", "classer les exercices"], question: "À quoi sert le thème sur un exercice ?", answer: "Le thème range un exercice à l'intérieur de sa catégorie (ex. dans Athlétique : Récupération, Vitesse, Endurance...). Ça sert à regrouper la banque d'exercices plutôt que d'avoir une liste plate. C'est un champ libre — tu peux reprendre une suggestion ou en taper un nouveau." },
  { keywords: ["construire une séance", "créer une séance", "programmer une séance"], question: "Comment construire une séance ?", answer: "Vestiaire → Séance → \"Création de séance\". Choisis une date, ajoute des exercices depuis la bibliothèque (filtrés par domaine puis regroupés par thème), organise-les par phase (Échauffement / Corps de séance / Retour au calme)." },
  { keywords: ["microcycle", "semaine type"], question: "Qu'est-ce que le microcycle ?", answer: "Vestiaire → Séance → \"Microcycle\". Deux vues : \"Semaine\" cale les jours d'entraînement sur ton prochain match (J-4 à J0), \"Saison\" te donne la programmation annuelle par grands blocs (macrocycles/mésocycles) avec une frise et le détail de chaque période." },
  { keywords: ["programme individuel", "exercice pour un joueur", "programme d'exercices"], question: "Comment donner un programme d'exercices à un joueur précis ?", answer: "Vestiaire → Effectifs → sélectionne le joueur → onglet Développement → choisis un thème (Physique/Technique/Mental/Tactique) → section \"Programme d'exercices\" en bas, pioche dans la bibliothèque et précise une fréquence." },
  { keywords: ["studio", "observation", "différence studio"], question: "Quelle est la différence entre Studio et Observation ?", answer: "Studio tague TES matchs, lié à ton effectif (les numéros se rattachent à tes joueurs). Observation tague n'importe quel match entre deux autres équipes — utile pour préparer un adversaire, sans lien avec ton effectif." },
  { keywords: ["deux passages", "second passage", "passage tactique", "passage objectif"], question: "Comment fonctionnent les deux passages de tag ?", answer: "Dans Studio et Observation, un bascule en haut du tagging propose \"Passage 1 — objectif\" (passes, tacles, tirs...) et \"Passage 2 — tactique\" (déclenchements de pressing, hauteur de bloc, sorties de balle conformes au plan...). Les deux sont indépendants — retague le même match sous les deux passages si besoin." },
  { keywords: ["projet de jeu", "réponses multiples", "plusieurs réponses"], question: "Comment cocher plusieurs réponses dans Projet de jeu ?", answer: "Chaque question accepte désormais plusieurs réponses — clique pour cocher, reclique pour décocher, comme une sélection multiple classique. Les exercices liés à l'une de ces réponses restent trouvables." },
  { keywords: ["vue recruteur", "profil recherché"], question: "À quoi sert la Vue recruteur ?", answer: "Projet de jeu → \"Vue recruteur\". Choisis un poste : tu obtiens le profil chiffré recherché et un résumé des réponses du Projet de jeu pertinentes pour ce poste précis, pensé pour être montré sans faire lire tout le document." },
  { keywords: ["staff", "membre du staff", "fonction du staff"], question: "Comment gérer le staff du club ?", answer: "Administratif → Club → Pôle sportif → Suivi joueurs multi-équipes → onglet Staff. Répertoire par fonction (Coaching/Performance/Médical/Analyse vidéo/Direction), avec une alerte si un diplôme expire ou est déjà expiré sous 60 jours." },
  { keywords: ["événement club", "créer un événement", "récurrent"], question: "Comment créer un événement club ?", answer: "Administratif → Club, onglet Club → Événements. Choisis un type (stage, réunion, portes ouvertes...), une date, une heure si besoin, et coche \"Se répète\" pour un événement récurrent (hebdomadaire ou mensuel, jusqu'à une date de fin)." },
  { keywords: ["vidéothèque", "assigner un clip", "statut clip"], question: "Comment assigner un clip à quelqu'un dans la Vidéothèque ?", answer: "Analyse & Vidéo → Vidéothèque, dans la bibliothèque partagée du club : chaque clip a un menu d'assignation (à quel membre du staff) et un statut (À tagger / En cours / Prêt à diffuser). Deux filtres en haut permettent de voir uniquement ce qui revient à quelqu'un." },
  { keywords: ["bibliothèque", "livres", "articles", "podcast"], question: "Comment fonctionne la Bibliothèque ?", answer: "Ressources → Bibliothèque. Classée en onglets par type (Livres/Articles/Podcast/Films/Autres), avec un filtre par thème à l'intérieur de chaque onglet." },
  { keywords: ["sauvegarde", "exporter mes données", "backup"], question: "Comment sauvegarder mes données ?", answer: "Une sauvegarde complète existe (cherche \"Sauvegarde\" dans le menu) — elle couvre tout ce qui est stocké dans le navigateur, équipe par équipe et saison par saison." },
  { keywords: ["plusieurs équipes", "changer d'équipe", "saison"], question: "Comment gérer plusieurs équipes ou saisons ?", answer: "Les données (exercices, séances, matchs...) sont automatiquement séparées par équipe et par saison actives. Certaines données restent communes à tout le club (staff, ressources partagées, bibliothèque, vidéothèque club) plutôt que dupliquées par équipe." },
  { keywords: ["exporter mes exercices", "exporter tes exercices", "importer des exercices", "importer un exercice", "exercices json"], question: "Comment exporter mes exercices ?", answer: "Vestiaire → Séance → \"Création d'exercices\" : les boutons \"Exporter mes exercices (JSON)\" et \"Importer un/des exercice(s) JSON\" permettent de sauvegarder ou transférer ta banque en dehors de l'app." },
  { keywords: ["scouting", "joueur repéré", "intérêt fort"], question: "Comment fonctionne le Scouting ?", answer: "Analyse & Vidéo → Scouting. Fiche par joueur repéré avec un niveau d'intérêt — \"Partager au club\" rend le joueur visible aux autres catégories via le scouting mutualisé (Administratif → Club)." },
  { keywords: ["causerie", "présentation"], question: "Comment préparer une causerie ?", answer: "Vestiaire → Causerie. Construit une présentation liée à un match (à venir ou déjà joué), projetable en plein écran pour le vestiaire." },
  { keywords: ["organisé le club", "quatre pôles", "où trouver un rôle", "pôle administratif", "pôle sportif"], question: "Comment est organisé le Club depuis la refonte ?", answer: "Administratif → Club regroupe tout en quatre zones : Club (infos générales, cotisations, calendrier...), Pôle administratif (bureau, trésorerie, secrétariat, matériel...), Pôle sportif (direction sportive, formation, arbitrage...), et Développement & image (communication, marketing, sécurité, protection de l'enfance, RGPD). Chaque rôle du club a sa place dans l'un de ces quatre onglets." },
  { keywords: ["fonctionne le code", "section verrouillée", "code d'accès"], question: "Comment fonctionne le code sur les sections sensibles ?", answer: "Suivi médical, Trésorier, Sécurité & éthique et Protection de l'enfance sont protégés par un code, à définir dans Administratif → Club → Sauvegarde. Ce n'est pas un vrai chiffrement — juste un frein pour éviter qu'on tombe dessus par erreur, pas une protection contre quelqu'un de déterminé." },
  { keywords: ["démarrer l'année suivante", "reconduire l'effectif", "copier l'effectif"], question: "Comment démarrer l'année suivante avec l'effectif existant ?", answer: "Administratif → Club → onglet Sauvegarde propose, à la création d'une nouvelle période, de reconduire l'effectif, le Projet de jeu, les exercices et les cycles d'entraînement vers cette nouvelle période. Les matchs, séances, blessures et suivis médicaux restent sur la période d'origine — rien n'est dupliqué pour ceux-là." },
  { keywords: ["protection de l'enfance", "sécurité des mineurs", "protection enfant"], question: "Où gérer la protection de l'enfance au club ?", answer: "Administratif → Club → Développement & image → Protection de l'enfance (sous code). Le registre y est volontairement minimal — une catégorie générale, sans détails ni noms — pour rester un outil de suivi de statut, pas un dossier complet à conserver ailleurs." },
  { keywords: ["rgpd", "données personnelles", "cnil", "violation de données"], question: "Comment gérer le RGPD au club ?", answer: "Administratif → Club → Développement & image → RGPD. Trois volets : le registre des traitements (ce que le club fait des données), les demandes de droits reçues, et le registre des violations — à signaler à la CNIL sous 72 heures pour les cas les plus graves." },
  { keywords: ["corriger une fiche", "modifier une entrée existante", "éditer une fiche"], question: "Comment corriger une fiche déjà créée ?", answer: "Le bouton \"Modifier\" à côté de chaque fiche rouvre le formulaire pré-rempli, sur la quasi-totalité des écrans de l'app — plus besoin de supprimer puis recréer pour corriger une erreur de saisie." },
  { keywords: ["matériel réparti", "inventaire par lieu", "stock par local"], question: "Comment suivre le matériel réparti sur plusieurs lieux ?", answer: "Administratif → Club → Pôle administratif → Responsable matériel. Les mouvements et la maintenance se filtrent par type de matériel, tous lieux confondus par défaut, avec un sélecteur de lieu qui apparaît dès qu'un même type existe à plusieurs endroits." },
  { keywords: ["fiche kiné", "pdf ostéo", "fiche de liaison", "imprimer podologie"], question: "Comment exporter une fiche kiné, ostéo ou podo ?", answer: "Chaque sous-onglet de Vestiaire → Suivi médical → Paramédical a un bouton \"Exporter en PDF\" qui imprime la vue actuellement affichée. La fiche de liaison ostéopathie est pensée spécifiquement pour être partagée avec le médecin ou le kiné." },
  { keywords: ["forum et le portail", "forum interne", "portail des familles"], question: "Où sont le forum et le portail joueur/parent ?", answer: "Groupe Communication dans le menu principal, à part du reste — le Forum sert aux échanges internes au staff, le Portail joueur/parent est un résumé imprimable pensé pour être montré à un joueur ou sa famille." },
  { keywords: ["filière jeunes", "centre de formation"], question: "Où est passée la filière jeunes ?", answer: "Administratif → Club → Pôle sportif → Suivi formation, 3ᵉ onglet. Elle s'appuie sur l'effectif agrégé de toutes tes équipes, sans besoin de le ressaisir." },
  { keywords: ["plusieurs catégories à la fois", "surclassement", "prêté à une autre équipe"], question: "Comment suivre un joueur présent dans plusieurs catégories à la fois ?", answer: "Administratif → Club → Pôle sportif → Suivi joueurs multi-équipes. Parcours, renfort, surclassement, pyramide des équipes, tout regroupé pour les joueurs qui bougent entre catégories." },
  { keywords: ["vote au sein du bureau", "consultation interne", "sondage bureau"], question: "Comment lancer un vote au sein du bureau ?", answer: "Administratif → Club → Pôle administratif → Gouvernance & bureau → Consultation & vote. Attention : modifier le texte d'une question après coup efface les votes déjà enregistrés et relance le vote à zéro pour tout le monde." },
  { keywords: ["partager un exercice", "banque commune d'exercices"], question: "Comment partager un exercice avec tout le club ?", answer: "Administratif → Club → Pôle sportif → Ressources partagées, onglet Exercices. \"Copier vers mon équipe\" duplique ensuite un exercice du club vers la banque de l'équipe active." },
  { keywords: ["rôles du bureau", "responsable licences", "responsable technique"], question: "Où trouver les rôles du bureau (licences, matériel, technique...) ?", answer: "Administratif → Club → Pôle administratif regroupe Gouvernance, Finances, Secrétariat, Responsable licences, Responsable matériel et Logistique événements. Le Pôle sportif regroupe Direction sportive, Responsable technique et Arbitrage." },
];

function answerHelpQuestion(question) {
  const q = question.toLowerCase();
  const match = HELP_TOPICS.find((t) => t.keywords.some((k) => q.includes(k)));
  if (match) return match.answer;
  return "Je n'ai pas de réponse toute faite pour cette question précise — regarde la liste de sujets ci-dessous, ou explore le menu directement.";
}

export function HelpAssistantScreen() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);

  function ask(question) {
    if (!question.trim()) return;
    const answer = answerHelpQuestion(question);
    setHistory((prev) => [...prev, { id: newId(), question: question.trim(), answer }]);
    setInput("");
  }

  return (
    <div className="stats-screen">
      <div className="stats-screen-header">
        <div className="eyebrow">Ressources</div>
        <h1>Aide sur le site</h1>
        <p className="subtitle">Pose une question sur le fonctionnement de l'app elle-même — pas sur ton équipe, mais sur comment faire quelque chose ici. Réponses toutes faites par mots-clés, pas un modèle de langage.</p>
      </div>

      <div className="new-match-card" style={{ marginBottom: 16 }}>
        <label>Ta question
          <input
            type="text" placeholder="ex. Comment créer un exercice ?" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ask(input); }}
          />
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={() => ask(input)}>Demander</button>
        </div>
      </div>

      <div className="home-actions-row" style={{ flexWrap: "wrap", marginBottom: 20 }}>
        {HELP_TOPICS.map((t) => (
          <button key={t.question} className="btn btn-ghost btn-small" onClick={() => ask(t.question)}>{t.question}</button>
        ))}
      </div>

      {history.length === 0 && <div className="empty-state">Pose ta première question, ou choisis un sujet ci-dessus.</div>}

      <div className="scouting-list">
        {[...history].reverse().map((h) => (
          <div key={h.id} className="new-match-card" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{h.question}</div>
            <div className="hint" style={{ marginTop: 0 }}>{h.answer}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
