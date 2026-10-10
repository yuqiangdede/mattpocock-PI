#!/usr/bin/env python3
"""Derive PI-Desktop platform icon assets from the canonical app tile.

The tracked ``apps/desktop/build/icon_1024.png`` is the brand source of truth:
a modern application tile with transparent squircle corners.

This script derives all platform-specific icon resources:

  icon.png               512px Windows/Linux package + tray icon
  icon.ico               multi-size Windows application icon (16..256)
  icon.icns              multi-size macOS application icon
  icon.iconset/          macOS iconset PNGs (for reference / iconutil)
  tray-icon-mac.png      transparent macOS menu bar template icon
  ../src/assets/brand/logo-{light,dark}.png   renderer brand marks
  ../../docs/public/app-icon.png              docs site icon

Run: python3 scripts/make-icon.py
"""

from __future__ import annotations

import io
import shutil
import struct
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "apps" / "desktop" / "build"
SOURCE = BUILD / "icon_1024.png"

BRAND = ROOT / "apps" / "desktop" / "src" / "assets" / "brand"
DOCS_ICON = ROOT / "docs" / "public" / "app-icon.png"

BASE = 1024

ICNS_SIZES = [
    (b"ic07", 128),
    (b"ic08", 256),
    (b"ic09", 512),
    (b"ic10", 1024),
    (b"ic11", 32),
    (b"ic12", 64),
    (b"ic13", 256),
    (b"ic14", 512),
]

ICONSET_SIZES = [16, 32, 128, 256, 512]


def png_payload(im: Image.Image, size: int) -> bytes:
    """Return PNG bytes for a resized square RGBA image."""
    resized = im.resize((size, size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    resized.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def encode_icns(entries: list[tuple[bytes, bytes]]) -> bytes:
    """Pack PNG chunks into an Apple ICNS container."""
    body = bytearray()
    for tag, payload in entries:
        body += tag + struct.pack(">I", len(payload) + 8) + payload
    return b"icns" + struct.pack(">I", len(body) + 8) + bytes(body)


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"canonical logo is missing: {SOURCE}")

    with Image.open(SOURCE) as source:
        master = source.convert("RGBA")

    if master.size != (BASE, BASE):
        raise ValueError(f"canonical logo must be {BASE}x{BASE}, got {master.size}")

    BUILD.mkdir(parents=True, exist_ok=True)

    # 1. Windows multi-size ICO
    windows_icon = BUILD / "icon.ico"
    master.save(
        windows_icon,
        format="ICO",
        sizes=[
            (16, 16),
            (32, 32),
            (48, 48),
            (64, 64),
            (128, 128),
            (256, 256),
        ],
    )
    print(f"wrote {windows_icon}")

    # 2. Windows / Linux 512px package icon
    package_icon = BUILD / "icon.png"
    master.resize((512, 512), Image.Resampling.LANCZOS).save(
        package_icon, format="PNG", optimize=True
    )
    print(f"wrote {package_icon}")

    # 3. macOS ICNS container (built directly so it works on Windows and macOS)
    icns_entries = [
        (tag, png_payload(master, size)) for tag, size in ICNS_SIZES
    ]
    icns = BUILD / "icon.icns"
    icns.write_bytes(encode_icns(icns_entries))
    print(f"wrote {icns}")

    # 4. macOS iconset directory
    iconset = BUILD / "icon.iconset"
    if iconset.exists():
        shutil.rmtree(iconset)
    iconset.mkdir(parents=True)
    for sz in ICONSET_SIZES:
        master.resize((sz, sz), Image.Resampling.LANCZOS).save(
            iconset / f"icon_{sz}x{sz}.png", format="PNG"
        )
        master.resize((sz * 2, sz * 2), Image.Resampling.LANCZOS).save(
            iconset / f"icon_{sz}x{sz}@2x.png", format="PNG"
        )
    print(f"wrote {iconset}")

    # 5. macOS tray icon (template image)
    tray = BUILD / "tray-icon-mac.png"
    # Derive the monochrome template from the same master, including initials.
    silhouette = master.convert("L").point(lambda value: 255 if value < 128 else 0)
    silhouette = ImageChops.darker(silhouette, master.getchannel("A"))
    template = Image.new("RGBA", master.size, (0, 0, 0, 0))
    template.putalpha(silhouette)
    template.resize((36, 36), Image.Resampling.LANCZOS).save(tray, format="PNG")
    print(f"verified {tray}")

    # 6. Renderer brand marks
    BRAND.mkdir(parents=True, exist_ok=True)
    for path in (BRAND / "logo-light.png", BRAND / "logo-dark.png"):
        master.resize((192, 192), Image.Resampling.LANCZOS).save(path, format="PNG", optimize=True)
        print(f"wrote {path}")

    # 7. Documentation site icon
    DOCS_ICON.parent.mkdir(parents=True, exist_ok=True)
    master.save(DOCS_ICON, format="PNG", optimize=True)
    print(f"wrote {DOCS_ICON}")


if __name__ == "__main__":
    main()
