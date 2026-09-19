"""Assemble la page de revue : modèle HTML + cartes (images en base64) + noms des joueurs du site.

Usage : python -m panorama.build_review  ->  output/panorama/review/revue_panoramique.html
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T
from panorama.config import load_numbers

def roster():
    """Numéro -> nom, lus dans l'export « numéros de maillot » du site (variable NUMBERS_EXPORT) ; sans export : « Joueur n »."""
    numbers = load_numbers()
    return {n: " ".join(v["name"].split()) for n, v in numbers.items()} if numbers else {str(n): f"Joueur {n}" for n in range(1, 15)}

if __name__ == "__main__":
    cards = json.load(open(T.OUT / "cards.json"))
    html = (Path(__file__).parent / "review_template.html").read_text()
    html = html.replace("__ROSTER__", json.dumps(roster(), ensure_ascii=False)).replace("__CARDS__", json.dumps(cards, ensure_ascii=False))
    out = T.OUT / "review" / "revue_panoramique.html"
    out.write_text(html)
    print(f"{len(cards)} cartes -> {out} ({out.stat().st_size / 1e6:.1f} Mo)")
