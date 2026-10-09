#!/usr/bin/env python3
"""Derive PI-Desktop platform icon assets from the canonical app tile.

The tracked ``apps/desktop/build/icon_1024.png`` is the brand source of truth:
a light rounded application tile drawn on an opaque black canvas. Windows and
macOS treat every opaque pixel of a packaged icon as part of the artwork, so
the black canvas must become transparent before any platform resource is
derived.

This script removes only the black backdrop *connected to the image border*
(flood fill), so dark artwork inside the tile — the M and Pi glyphs — is never
punched out. The resulting boundary is smoothed into an anti-aliased alpha
ramp.

Outputs (all under apps/desktop/build unless noted):

  icon.png               512px Windows/Linux package + tray icon
  icon.ico               multi-size Windows application icon
  icon.icns              multi-size macOS application icon
  icon.iconset/          macOS iconset PNGs (for reference / iconutil)
  tray-icon-mac.png      transparent macOS menu bar template icon
  ../src/assets/brand/logo-{light,dark}.png   renderer brand mark
  ../../docs/public/app-icon.png              docs site icon

Run: python3 scripts/make-icon.py
"""

from __future__ import annotations

import struct
import zlib
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "apps" / "desktop" / "build"
SOURCE = BUILD / "icon_1024.png"

BRAND = ROOT / "apps" / "desktop" / "src" / "assets" / "brand"
DOCS_ICON = ROOT / "docs" / "public" / "app-icon.png"

BASE = 1024

# Pixels this dark that are reachable from the border are backdrop.
BACKDROP_MAX = 24
# Half-width of the anti-aliasing blur applied to the backdrop boundary.
EDGE_FEATHER = 16
# macOS menu bar template icons are drawn from dark marks only.
TRAY_LUMINANCE_FLOOR = 160
TRAY_LUMINANCE_RANGE = 80

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


# --------------------------------------------------------------- PNG codec

def decode_png(path: Path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a PNG: {path}")
    pos = 8
    idat = bytearray()
    palette = trns = None
    width = height = bitdepth = colortype = None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        tag = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if tag == b"IHDR":
            width, height, bitdepth, colortype, _c, _f, interlace = struct.unpack(
                ">IIBBBBB", chunk
            )
            if interlace:
                raise ValueError("interlaced PNG unsupported")
        elif tag == b"PLTE":
            palette = chunk
        elif tag == b"tRNS":
            trns = chunk
        elif tag == b"IDAT":
            idat += chunk
        elif tag == b"IEND":
            break
    if bitdepth != 8:
        raise ValueError(f"unsupported bit depth {bitdepth}")

    raw = zlib.decompress(bytes(idat))
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colortype]
    stride = width * channels
    bpp = channels
    prev = bytearray(stride)
    rows = []
    i = 0
    for _ in range(height):
        ftype = raw[i]
        i += 1
        line = bytearray(raw[i : i + stride])
        i += stride
        if ftype == 1:
            for k in range(bpp, stride):
                line[k] = (line[k] + line[k - bpp]) & 0xFF
        elif ftype == 2:
            for k in range(stride):
                line[k] = (line[k] + prev[k]) & 0xFF
        elif ftype == 3:
            for k in range(stride):
                a = line[k - bpp] if k >= bpp else 0
                line[k] = (line[k] + ((a + prev[k]) >> 1)) & 0xFF
        elif ftype == 4:
            for k in range(stride):
                a = line[k - bpp] if k >= bpp else 0
                b = prev[k]
                c = prev[k - bpp] if k >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[k] = (line[k] + pr) & 0xFF
        elif ftype != 0:
            raise ValueError(f"bad filter type {ftype}")
        rows.append(line)
        prev = line
    return width, height, colortype, channels, rows, palette, trns


def to_rgba(width, height, colortype, channels, rows, palette, trns):
    out = []
    for y in range(height):
        row = rows[y]
        line = bytearray(width * 4)
        for x in range(width):
            if colortype == 6:
                o = x * 4
                r, g, b, a = row[o], row[o + 1], row[o + 2], row[o + 3]
            elif colortype == 2:
                o = x * 3
                r, g, b = row[o], row[o + 1], row[o + 2]
                a = 255
            elif colortype == 4:
                o = x * 2
                r = g = b = row[o]
                a = row[o + 1]
            elif colortype == 0:
                r = g = b = row[x]
                a = 255
            elif colortype == 3:
                pi = row[x]
                r, g, b = palette[pi * 3 : pi * 3 + 3]
                a = trns[pi] if (trns and pi < len(trns)) else 255
            else:
                raise ValueError(f"unsupported colortype {colortype}")
            o2 = x * 4
            line[o2] = r
            line[o2 + 1] = g
            line[o2 + 2] = b
            line[o2 + 3] = a
        out.append(line)
    return out


def _filter_row(ftype, line, prev, bpp):
    """Apply one PNG row filter; return the filtered bytearray."""
    n = len(line)
    if ftype == 0:
        return bytearray(line)
    out = bytearray(n)
    if ftype == 1:  # Sub
        for i in range(n):
            a = line[i - bpp] if i >= bpp else 0
            out[i] = (line[i] - a) & 0xFF
    elif ftype == 2:  # Up
        for i in range(n):
            out[i] = (line[i] - prev[i]) & 0xFF
    elif ftype == 3:  # Average
        for i in range(n):
            a = line[i - bpp] if i >= bpp else 0
            out[i] = (line[i] - ((a + prev[i]) >> 1)) & 0xFF
    elif ftype == 4:  # Paeth
        for i in range(n):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            p = a + b - c
            pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            out[i] = (line[i] - pr) & 0xFF
    else:
        raise ValueError(f"bad filter type {ftype}")
    return out


def png_bytes(width, height, rgba_rows, adaptive=True):
    """Serialize RGBA rows to a PNG.

    ``adaptive`` picks the cheapest of the five PNG row predictors per row,
    which costs time but trims the files this script commits. Pass False for
    the throwaway intermediates where size does not matter.
    """
    bpp = 4
    raw = bytearray()
    prev = bytearray(width * bpp)
    for line in rgba_rows:
        if not adaptive:
            raw.append(0)
            raw += line
            prev = line
            continue
        best_type = 0
        best_cost = None
        best_data = None
        for ftype in range(5):
            data = _filter_row(ftype, line, prev, bpp)
            cost = 0
            for byte in data:
                cost += byte if byte < 128 else 256 - byte
            if best_cost is None or cost < best_cost:
                best_cost = cost
                best_type = ftype
                best_data = data
        raw.append(best_type)
        raw += best_data
        prev = line
    comp = zlib.compress(bytes(raw), 9)

    def chunk(tag, payload):
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    blob = bytearray(b"\x89PNG\r\n\x1a\n")
    blob += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    blob += chunk(b"IDAT", comp)
    blob += chunk(b"IEND", b"")
    return bytes(blob)


def write_png(path: Path, width, height, rgba_rows, adaptive=True):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png_bytes(width, height, rgba_rows, adaptive))


# ------------------------------------------------------- backdrop removal

def _outer_backdrop_mask(width, height, rgba):
    """Mask the black canvas that is connected to the image border.

    Walking only through near-black pixels keeps interior dark glyphs, which
    cannot be reached from the border without crossing the light tile.
    """
    walkable = bytearray(width * height)
    for y in range(height):
        row = rgba[y]
        base = y * width
        for x in range(width):
            o = x * 4
            if max(row[o], row[o + 1], row[o + 2]) <= BACKDROP_MAX:
                walkable[base + x] = 1

    seen = bytearray(width * height)
    dq = deque()
    for x in range(width):
        for y in (0, height - 1):
            i = y * width + x
            if walkable[i] and not seen[i]:
                seen[i] = 1
                dq.append(i)
    for y in range(height):
        for x in (0, width - 1):
            i = y * width + x
            if walkable[i] and not seen[i]:
                seen[i] = 1
                dq.append(i)

    mask = bytearray(width * height)
    while dq:
        i = dq.popleft()
        mask[i] = 1
        x = i % width
        y = i // width
        if x > 0:
            j = i - 1
            if walkable[j] and not seen[j]:
                seen[j] = 1
                dq.append(j)
        if x < width - 1:
            j = i + 1
            if walkable[j] and not seen[j]:
                seen[j] = 1
                dq.append(j)
        if y > 0:
            j = i - width
            if walkable[j] and not seen[j]:
                seen[j] = 1
                dq.append(j)
        if y < height - 1:
            j = i + width
            if walkable[j] and not seen[j]:
                seen[j] = 1
                dq.append(j)
    return mask


def _blur_mask(mask, width, height, radius):
    """Separable box blur turning the binary mask into an alpha ramp."""
    inv = bytearray(width * height)
    for i in range(width * height):
        inv[i] = 0 if mask[i] else 255

    tmp = bytearray(width * height)
    for y in range(height):
        base = y * width
        for x in range(width):
            lo = x - radius if x - radius > 0 else 0
            hi = x + radius + 1 if x + radius + 1 < width else width
            s = 0
            for k in range(lo, hi):
                s += inv[base + k]
            tmp[base + x] = s // (hi - lo)

    out = bytearray(width * height)
    for x in range(width):
        for y in range(height):
            lo = y - radius if y - radius > 0 else 0
            hi = y + radius + 1 if y + radius + 1 < height else height
            s = 0
            for k in range(lo, hi):
                s += tmp[k * width + x]
            out[y * width + x] = s // (hi - lo)
    return out


def remove_backdrop(width, height, rgba):
    """Return RGBA rows with the border-connected black canvas transparent."""
    mask = _outer_backdrop_mask(width, height, rgba)
    soft = _blur_mask(mask, width, height, EDGE_FEATHER)
    out = []
    for y in range(height):
        line = bytearray(rgba[y])
        base = y * width
        for x in range(width):
            if mask[base + x]:
                line[x * 4 + 3] = 0
            else:
                line[x * 4 + 3] = soft[base + x]
        out.append(line)
    return out


def resize(width, height, rgba_rows, nw, nh):
    """Alpha-weighted box resize: no dark halo from transparent backdrop."""
    out = []
    for y in range(nh):
        y0 = y * height // nh
        y1 = max(y0 + 1, (y + 1) * height // nh)
        line = bytearray(nw * 4)
        for x in range(nw):
            x0 = x * width // nw
            x1 = max(x0 + 1, (x + 1) * width // nw)
            rs = gs = bs = asum = n = 0
            for yy in range(y0, y1):
                row = rgba_rows[yy]
                for xx in range(x0, x1):
                    o = xx * 4
                    a = row[o + 3]
                    rs += row[o] * a
                    gs += row[o + 1] * a
                    bs += row[o + 2] * a
                    asum += a
                    n += 1
            do = x * 4
            if asum == 0:
                line[do : do + 4] = b"\x00\x00\x00\x00"
            else:
                line[do] = rs // asum
                line[do + 1] = gs // asum
                line[do + 2] = bs // asum
                line[do + 3] = asum // n
        out.append(line)
    return out


# ------------------------------------------------------------ containers

def encode_icns(payloads):
    """Assemble a modern ICNS container from (tag, png) entries."""
    toc = b""
    body = b""
    for tag, payload in payloads:
        total = len(payload) + 8
        toc += tag + struct.pack(">I", total)
        body += tag + struct.pack(">I", total) + payload
    toc_block = b"TOC " + struct.pack(">I", len(toc) + 8) + toc
    content = toc_block + body
    return b"icns" + struct.pack(">I", len(content) + 8) + content


def encode_ico(payloads):
    """Assemble an ICO container storing each frame as a PNG."""
    entries = sorted(payloads, key=lambda item: item[0])
    header = struct.pack("<HHH", 0, 1, len(entries))
    directory = b""
    blobs = b""
    offset = 6 + 16 * len(entries)
    for size, payload in entries:
        dim = 0 if size >= 256 else size
        directory += struct.pack(
            "<BBBBHHII", dim, dim, 0, 0, 1, 32, len(payload), offset
        )
        blobs += payload
        offset += len(payload)
    return header + directory + blobs


# ---------------------------------------------------------------- derive

def derive_tray(rgba, width, height):
    """Transparent monochrome tray template: dark marks only."""
    out = [bytearray(width * 4) for _ in range(height)]
    for y in range(height):
        src = rgba[y]
        dst = out[y]
        for x in range(width):
            o = x * 4
            lum = (src[o] * 299 + src[o + 1] * 587 + src[o + 2] * 114) // 1000
            mark = (TRAY_LUMINANCE_FLOOR - lum) * 255 // TRAY_LUMINANCE_RANGE
            mark = max(0, min(255, mark))
            dst[o + 3] = mark * src[o + 3] // 255
    return out


def main():
    if not SOURCE.is_file():
        raise FileNotFoundError(f"canonical logo is missing: {SOURCE}")

    width, height, colortype, channels, rows, palette, trns = decode_png(SOURCE)
    if (width, height) != (BASE, BASE):
        raise ValueError(f"canonical logo must be {BASE}x{BASE}, got {width}x{height}")

    rgba = to_rgba(width, height, colortype, channels, rows, palette, trns)
    master = remove_backdrop(width, height, rgba)

    # Canonical source keeps the transparent backdrop so future runs are
    # idempotent.
    write_png(SOURCE, width, height, master)
    print(f"wrote {SOURCE}")

    ico = BUILD / "icon.ico"
    ico.write_bytes(
        encode_ico(
            [
                (
                    size,
                    png_bytes(
                        size, size, resize(width, height, master, size, size), False
                    ),
                )
                for size in (16, 32, 48, 64, 128, 256)
            ]
        )
    )
    print(f"wrote {ico}")

    package_icon = BUILD / "icon.png"
    write_png(package_icon, 512, 512, resize(width, height, master, 512, 512))
    print(f"wrote {package_icon}")

    icns = BUILD / "icon.icns"
    icns.write_bytes(
        encode_icns(
            [
                (
                    tag,
                    png_bytes(
                        size, size, resize(width, height, master, size, size), False
                    ),
                )
                for tag, size in ICNS_SIZES
            ]
        )
    )
    print(f"wrote {icns}")

    iconset = BUILD / "icon.iconset"
    for size in ICONSET_SIZES:
        write_png(
            iconset / f"icon_{size}x{size}.png",
            size,
            size,
            resize(width, height, master, size, size),
            adaptive=False,
        )
        write_png(
            iconset / f"icon_{size}x{size}@2x.png",
            size * 2,
            size * 2,
            resize(width, height, master, size * 2, size * 2),
            adaptive=False,
        )
    print(f"wrote {iconset}")

    tray = BUILD / "tray-icon-mac.png"
    write_png(tray, width, height, derive_tray(master, width, height))
    print(f"wrote {tray}")

    for path in (BRAND / "logo-light.png", BRAND / "logo-dark.png"):
        write_png(path, width, height, master)
        print(f"wrote {path}")

    write_png(DOCS_ICON, width, height, master)
    print(f"wrote {DOCS_ICON}")


if __name__ == "__main__":
    main()
