#!/usr/bin/env python3
"""Combine les décisions de revue (export de la collection 'traces' de l'artifact "Revue des
maillots") avec l'export "numéros de joueurs" du site (Studio -> rapport de match -> Analyse
avancée -> bouton d'export, handleExportPlayerNumbers() dans App.jsx) pour produire le fichier
--roster attendu par extract.py --roster.

Usage :
  python build_roster.py --review traces_export.json --numbers numeros-joueurs-<matchId>.json \
      --out roster.json

traces_export.json : liste de documents {"id":..., "data": {...}} tels que renvoyés par l'action
  read_db (db_op "list" ou "query") sur la collection "traces" de l'artifact.
numeros-joueurs-*.json : {"A": {"<numero>": {"id": "...", "name": "..."}}, "B": {...}} — export
  déjà existant côté site, un par équipe, numéro de maillot -> identité réelle.
"""
import argparse
import json


def build_roster(review_docs, player_numbers_export):
    """Retourne (roster_map, rapport). roster_map : {"A": {"<suffixe_trace>": "<playerId>"}, "B":
    {...}} — prêt pour --roster (suffixe_trace = ce qui suit "#" dans la clé de trace d'origine,
    cf. build_analytics dans extract.py). rapport signale ce qui n'a pas pu être résolu, pour ne
    pas perdre silencieusement une trace confirmée."""
    roster = {"A": {}, "B": {}}
    unresolved_numbers = []   # numéro assigné mais absent de l'export du site
    skipped_no_team = []      # trace confirmée mais sans équipe connue (rare, cf. export_review_manifest)

    for doc in review_docs:
        d = doc.get("data", doc)  # tolère un export déjà "aplati" (juste les data, sans enveloppe id/data)
        if d.get("ignored"):
            continue
        num = d.get("assignedNumber")
        if not num:
            continue
        original_key = d.get("originalKey") or doc.get("id")
        team = d.get("team")
        if team not in ("A", "B"):
            skipped_no_team.append(original_key)
            continue
        player_info = player_numbers_export.get(team, {}).get(str(num))
        if player_info is None:
            unresolved_numbers.append({"trace": original_key, "team": team, "number": num})
            continue
        trace_suffix = original_key.split("#", 1)[1]
        roster[team][trace_suffix] = player_info["id"]

    return roster, {"unresolved_numbers": unresolved_numbers, "skipped_no_team": skipped_no_team}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--review", required=True, help="Export JSON de la collection 'traces' de l'artifact.")
    parser.add_argument("--numbers", required=True, help="Export 'numéros de joueurs' du site.")
    parser.add_argument("--out", required=True, help="Chemin de sortie du fichier --roster.")
    args = parser.parse_args()

    with open(args.review) as fh:
        review_docs = json.load(fh)
    with open(args.numbers) as fh:
        player_numbers_export = json.load(fh)

    roster, report = build_roster(review_docs, player_numbers_export)

    with open(args.out, "w") as fh:
        json.dump(roster, fh, ensure_ascii=False, indent=2)

    n_resolved = sum(len(v) for v in roster.values())
    print(f"{n_resolved} trace(s) résolue(s) vers un joueur réel -> {args.out}")
    if report["unresolved_numbers"]:
        print(f"ATTENTION — {len(report['unresolved_numbers'])} numéro(s) assigné(s) introuvable(s) "
              f"dans l'export du site (faute de frappe possible, ou joueur pas dans la Composition) :")
        for u in report["unresolved_numbers"]:
            print(f"  {u['trace']} (équipe {u['team']}, numéro {u['number']})")
    if report["skipped_no_team"]:
        print(f"{len(report['skipped_no_team'])} trace(s) confirmée(s) sans équipe connue, ignorée(s).")
