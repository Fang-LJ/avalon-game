"""Crop the supplied artwork without repainting it; requires Pillow with WebP/JPEG.

Run from the repository root: python3 scripts/export-cards.py
The source sheets are local-only. A contact sheet is written there for review.
Use --convert-mission-jpeg to re-encode only the two existing mission WebP files.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "design-source/cards"
OUTPUT = ROOT / "miniprogram/assets/cards"

# Coordinates include the protruding faction emblem and bottom star ornament.
CARDS = [
    ("03-roles.png", "roles/merlin.webp", (62, 14, 414, 515)),
    ("03-roles.png", "roles/percival.webp", (420, 14, 738, 515)),
    ("03-roles.png", "roles/loyal-servant.webp", (743, 14, 1065, 515)),
    ("03-roles.png", "roles/assassin.webp", (1070, 14, 1406, 515)),
    ("03-roles.png", "roles/morgana.webp", (22, 519, 299, 1032)),
    ("03-roles.png", "roles/mordred.webp", (302, 519, 581, 1032)),
    ("03-roles.png", "roles/oberon.webp", (583, 519, 855, 1032)),
    ("03-roles.png", "roles/minion.webp", (856, 519, 1132, 1032)),
    ("03-roles.png", "back/role-back.webp", (1136, 526, 1435, 1032)),
    ("01-actions.png", "actions/mission-success.jpg", (128, 7, 505, 531)),
    ("01-actions.png", "actions/mission-fail.jpg", (535, 7, 913, 531)),
    ("01-actions.png", "actions/approve.webp", (943, 7, 1320, 531)),
    ("01-actions.png", "actions/reject.webp", (128, 528, 505, 1041)),
    ("01-actions.png", "back/action-back.webp", (535, 533, 913, 1041)),
    ("02-special.png", "special/lady-of-the-lake.webp", (120, 6, 508, 532)),
    ("02-special.png", "special/assassinate.webp", (531, 6, 915, 532)),
    ("02-special.png", "special/good-victory.webp", (939, 6, 1324, 532)),
    ("02-special.png", "special/evil-victory.webp", (120, 528, 508, 1043)),
    ("02-special.png", "special/generic-emblem.webp", (939, 528, 1324, 1043)),
]


def save_card(card, destination):
    if destination.suffix.lower() in (".jpg", ".jpeg"):
        card.convert("RGB").save(
            destination, "JPEG", quality=88, optimize=True, progressive=True
        )
    else:
        quality = 86 if destination.parent.name == "roles" else 80
        card.save(destination, "WEBP", quality=quality, method=6)


def convert_mission_jpeg():
    """One-time format experiment: preserve decoded pixels and dimensions, no crop/resize."""
    for _, name, _ in CARDS:
        destination = OUTPUT / name
        if destination.suffix != ".jpg":
            continue
        with Image.open(destination.with_suffix(".webp")) as image:
            save_card(image, destination)
            print(f"{name},{image.width},{image.height},{destination.stat().st_size}")


def main():
    previews = []
    rows = []
    for source, name, box in CARDS:
        with Image.open(SOURCE / source) as original:
            if original.size != (1448, 1086):
                raise ValueError(f"Unexpected source dimensions: {source} {original.size}")
            card = original.convert("RGB").crop(box)
        # Preserve each card's original aspect ratio; no letter or frame is trimmed.
        card = card.resize((600, round(card.height * 600 / card.width)), Image.Resampling.LANCZOS)
        destination = OUTPUT / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        save_card(card, destination)
        size = destination.stat().st_size
        rows.append((name, card.width, card.height, size))
        preview = card.copy()
        preview.thumbnail((220, 340), Image.Resampling.LANCZOS)
        previews.append((name, preview))
    sheet = Image.new("RGB", (5 * 244, 4 * 388), "#101713")
    draw = ImageDraw.Draw(sheet)
    for index, (name, preview) in enumerate(previews):
        x, y = (index % 5) * 244, (index // 5) * 388
        sheet.paste(preview, (x + (244 - preview.width) // 2, y + 8))
        draw.text((x + 8, y + 354), name, fill="#f5f1e8")
    sheet.save(SOURCE / "export-contact-sheet.jpg", quality=92)
    print("asset,width,height,bytes")
    for row in rows:
        print(",".join(map(str, row)))
    print(f"TOTAL: {sum(row[3] for row in rows)} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--convert-mission-jpeg", action="store_true")
    args = parser.parse_args()
    if args.convert_mission_jpeg:
        convert_mission_jpeg()
    else:
        main()
