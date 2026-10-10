"""Export supplied artwork as versioned static JPEG cards; requires Pillow.

Run from the repository root: python3 scripts/export-cards.py
The source sheets are local-only. A contact sheet is written there for review.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "design-source/cards"
OUTPUT = ROOT / "static-assets/avalon/cards/v1"
JPEG_QUALITY = 92

# Coordinates include the protruding faction emblem and bottom star ornament.
CARDS = [
    ("03-roles.png", "roles/merlin.jpg", (62, 14, 414, 515)),
    ("03-roles.png", "roles/percival.jpg", (420, 14, 738, 515)),
    ("03-roles.png", "roles/loyal-servant.jpg", (743, 14, 1065, 515)),
    ("03-roles.png", "roles/assassin.jpg", (1070, 14, 1406, 515)),
    ("03-roles.png", "roles/morgana.jpg", (22, 519, 299, 1032)),
    ("03-roles.png", "roles/mordred.jpg", (302, 519, 581, 1032)),
    ("03-roles.png", "roles/oberon.jpg", (583, 519, 855, 1032)),
    ("03-roles.png", "roles/minion.jpg", (856, 519, 1132, 1032)),
    ("03-roles.png", "back/role-back.jpg", (1136, 526, 1435, 1032)),
    ("01-actions.png", "actions/mission-success.jpg", (128, 7, 505, 531)),
    ("01-actions.png", "actions/mission-fail.jpg", (535, 7, 913, 531)),
    ("01-actions.png", "actions/approve.jpg", (943, 7, 1320, 531)),
    ("01-actions.png", "actions/reject.jpg", (128, 528, 505, 1041)),
    ("01-actions.png", "back/action-back.jpg", (535, 533, 913, 1041)),
    ("02-special.png", "special/lady-of-the-lake.jpg", (120, 6, 508, 532)),
    ("02-special.png", "special/assassinate.jpg", (531, 6, 915, 532)),
    ("02-special.png", "special/good-victory.jpg", (939, 6, 1324, 532)),
    ("02-special.png", "special/evil-victory.jpg", (120, 528, 508, 1043)),
    ("02-special.png", "special/generic-emblem.jpg", (939, 528, 1324, 1043)),
]


def save_card(card, destination):
    if destination.suffix.lower() not in (".jpg", ".jpeg"):
        raise ValueError(f"Card output must be JPEG: {destination}")
    rgb = card.convert("RGB")
    rgb.save(destination, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return JPEG_QUALITY


def main():
    previews = []
    rows = []
    for source, name, box in CARDS:
        with Image.open(SOURCE / source) as original:
            if original.size != (1448, 1086):
                raise ValueError(f"Unexpected source dimensions: {source} {original.size}")
            card = original.convert("RGB").crop(box)
        # Preserve each card's original aspect ratio; no letter or frame is trimmed.
        # Keep native crop pixels: upscaling cannot restore detail from the source sheet.
        destination = OUTPUT / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        quality = save_card(card, destination)
        size = destination.stat().st_size
        rows.append((name, card.width, card.height, size, quality))
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
    print("asset,width,height,bytes,quality")
    for row in rows:
        print(",".join(map(str, row)))
    print(f"TOTAL: {sum(row[3] for row in rows)} bytes")


if __name__ == "__main__":
    main()
