"""Export the original PNG artwork as lossless, versioned static PNG cards.

Run from the repository root: python3 scripts/export-cards.py
The source sheets are local-only. A contact sheet is written there for review.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "design-source/cards"
OUTPUT = ROOT / "static-assets/avalon/cards/v2"
EXPORT_SCALE = 2

# Coordinates include the protruding faction emblem and bottom star ornament.
CARDS = [
    ("03-roles.png", "roles/merlin.png", (62, 14, 414, 515)),
    ("03-roles.png", "roles/percival.png", (420, 14, 738, 515)),
    ("03-roles.png", "roles/loyal-servant.png", (743, 14, 1065, 515)),
    ("03-roles.png", "roles/assassin.png", (1070, 14, 1406, 515)),
    ("03-roles.png", "roles/morgana.png", (22, 519, 299, 1032)),
    ("03-roles.png", "roles/mordred.png", (302, 519, 581, 1032)),
    ("03-roles.png", "roles/oberon.png", (583, 519, 855, 1032)),
    ("03-roles.png", "roles/minion.png", (856, 519, 1132, 1032)),
    ("03-roles.png", "back/role-back.png", (1136, 526, 1435, 1032)),
    ("01-actions.png", "actions/mission-success.png", (128, 7, 505, 531)),
    ("01-actions.png", "actions/mission-fail.png", (535, 7, 913, 531)),
    ("01-actions.png", "actions/approve.png", (943, 7, 1320, 531)),
    ("01-actions.png", "actions/reject.png", (128, 528, 505, 1041)),
    ("01-actions.png", "back/action-back.png", (535, 533, 913, 1041)),
    ("02-special.png", "special/lady-of-the-lake.png", (120, 6, 508, 532)),
    ("02-special.png", "special/assassinate.png", (531, 6, 915, 532)),
    ("02-special.png", "special/good-victory.png", (939, 6, 1324, 532)),
    ("02-special.png", "special/evil-victory.png", (120, 528, 508, 1043)),
    ("02-special.png", "special/generic-emblem.png", (939, 528, 1324, 1043)),
]


def save_card(card, destination):
    if destination.suffix.lower() != ".png" or card.mode not in ("RGB", "RGBA"):
        raise ValueError(f"Card must remain RGB/RGBA PNG: {destination} {card.mode}")
    card.save(destination, "PNG", optimize=True, compress_level=9)
    with Image.open(destination) as decoded:
        if decoded.mode != card.mode or decoded.size != card.size or decoded.tobytes() != card.tobytes():
            raise ValueError(f"Lossless round-trip check failed: {destination}")


def comparison(native, enlarged, name):
    """A native crop and B 2x PNG, displayed at their actual pixel dimensions.

    These review-only images are never used as production export sources.
    """
    directory = SOURCE / "export-ab-v2"
    destination = directory / "native" / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    save_card(native, destination)
    sheet = Image.new("RGB", (native.width + enlarged.width + 60, enlarged.height + 70), "#101713")
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 12), "A: native crop PNG (1 image px = 1 sheet px)", fill="#f5f1e8")
    draw.text((native.width + 36, 12), "B: 2x LANCZOS PNG (no sharpening)", fill="#f5f1e8")
    sheet.paste(native, (12, 44))
    sheet.paste(enlarged, (native.width + 36, 44))
    sheet.save(directory / (Path(name).stem + "-ab.png"), "PNG", optimize=True, compress_level=9)


def main():
    previews = []
    rows = []
    sources = []
    for filename in sorted({source for source, _, _ in CARDS}):
        with Image.open(SOURCE / filename) as original:
            info = {"source": filename, "width": original.width, "height": original.height,
                    "mode": original.mode, "format": original.format, "bytes": (SOURCE / filename).stat().st_size,
                    "sha256": hashlib.sha256((SOURCE / filename).read_bytes()).hexdigest()}
            if original.format != "PNG" or original.mode not in ("RGB", "RGBA") or original.size != (1448, 1086):
                raise ValueError(f"Source changed; inspect coordinates before exporting: {info}")
            sources.append(info)
            print("SOURCE " + json.dumps(info))
    for source, name, box in CARDS:
        with Image.open(SOURCE / source) as original:
            if not (0 <= box[0] < box[2] <= original.width and 0 <= box[1] < box[3] <= original.height):
                raise ValueError(f"Crop outside original sheet: {name} {box}")
            native = original.crop(box)
        card = native if EXPORT_SCALE == 1 else native.resize(
            (native.width * EXPORT_SCALE, native.height * EXPORT_SCALE), Image.Resampling.LANCZOS)
        # Original boundaries and proportions stay identical; interpolation invents no detail.
        destination = OUTPUT / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        save_card(card, destination)
        size = destination.stat().st_size
        rows.append({"asset": name, "source": source, "crop": list(box),
                     "source_crop_width": native.width, "source_crop_height": native.height,
                     "export_width": card.width, "export_height": card.height, "bytes": size,
                     "format": "PNG", "mode": card.mode,
                     "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()})
        if name in ("roles/merlin.png", "actions/mission-success.png", "back/role-back.png"):
            comparison(native, card, name)
        preview = card.copy()
        preview.thumbnail((220, 340), Image.Resampling.LANCZOS)
        previews.append((name, preview))
    sheet = Image.new("RGB", (5 * 244, 4 * 388), "#101713")
    draw = ImageDraw.Draw(sheet)
    for index, (name, preview) in enumerate(previews):
        x, y = (index % 5) * 244, (index // 5) * 388
        sheet.paste(preview, (x + (244 - preview.width) // 2, y + 8))
        draw.text((x + 8, y + 354), name, fill="#f5f1e8")
    sheet.save(SOURCE / "export-contact-sheet-v2.png", "PNG", optimize=True, compress_level=9)
    report = {"version": "v2", "scale": EXPORT_SCALE, "resampling": "LANCZOS", "sources": sources,
              "assets": rows, "total_bytes": sum(row["bytes"] for row in rows)}
    (OUTPUT.parents[1] / "card-export-v2.json").write_text(json.dumps(report, indent=2) + "\n")
    fields = ["asset", "source_crop_width", "source_crop_height", "export_width", "export_height", "bytes", "format"]
    print(",".join(fields))
    for row in rows:
        print(",".join(str(row[field]) for field in fields))
    print(f"TOTAL: {report['total_bytes']} bytes")


if __name__ == "__main__":
    main()
