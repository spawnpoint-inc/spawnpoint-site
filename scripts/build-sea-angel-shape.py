#!/usr/bin/env python3
"""Trace the approved still into small deformable contours. Build-time ffmpeg only.

Run: python3 scripts/build-sea-angel-shape.py
The browser uses shape.js, never the image decoder or a video.
"""
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "brand/sea-angel"
SIZE = 320
raw = subprocess.check_output([
    "ffmpeg", "-v", "error", "-i", str(DEST / "still.webp"),
    "-vf", f"scale={SIZE}:{SIZE}", "-f", "rawvideo", "-pix_fmt", "gray", "-",
])
body = { (x, y) for y in range(SIZE) for x in range(SIZE) if raw[y * SIZE + x] > 50 }
light = { (x, y) for x, y in body if raw[y * SIZE + x] > 200 }
# The photographic source has broad white panels. In tiles they become detail.
while len(light) / len(body) > 0.27:
    light = {(x, y) for x, y in light if all(
        (x + dx, y + dy) in light for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
    )}


def simplify(points, tolerance=0.65):
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    length = math.hypot(bx - ax, by - ay)
    distances = [abs((bx-ax)*(ay-y) - (ax-x)*(by-ay)) / length if length else
                 math.hypot(x-ax, y-ay) for x, y in points]
    far = max(range(len(points)), key=distances.__getitem__)
    if distances[far] <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:far+1], tolerance)[:-1] + simplify(points[far:], tolerance)


def contours(mask):
    edges = {}
    for x, y in sorted(mask):
        for neighbor, start, end in [
            ((x, y-1), (x, y), (x+1, y)),
            ((x+1, y), (x+1, y), (x+1, y+1)),
            ((x, y+1), (x+1, y+1), (x, y+1)),
            ((x-1, y), (x, y+1), (x, y)),
        ]:
            if neighbor not in mask:
                edges.setdefault(start, []).append(end)
    paths = []
    while edges:
        start = next(iter(edges))
        point = start
        path = [point]
        while point in edges:
            next_point = edges[point].pop()
            if not edges[point]:
                del edges[point]
            point = next_point
            path.append(point)
            if point == start:
                break
        if len(path) > 20:
            paths.append([[x-157, y-108] for x, y in simplify(path)])
    return paths


shape = {"body": contours(body), "highlight": contours(light)}
(DEST / "shape.js").write_text(
    "/* Generated from still.webp by scripts/build-sea-angel-shape.py. */\n"
    "window.seaAngelShape=" + json.dumps(shape, separators=(",", ":")) + ";\n"
)
# A flat, tiled no-JavaScript fallback with the same two inks.
tiles = []
for y in range(20, 290, 12):
    for x in range(16, 300, 12):
        covered = sum((x+dx, y+dy) in body for dx in range(12) for dy in range(12))
        pale = sum((x+dx, y+dy) in light for dx in range(12) for dy in range(12))
        if covered >= 72:
            color = "#FFD2DE" if pale > covered * 0.5 else "#8A0F30"
            tiles.append(f'<rect x="{x}" y="{y}" width="10.32" height="10.32" rx="2" fill="{color}"/>')
(DEST / "fallback.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="16 8 288 300">' + "".join(tiles) + '</svg>\n'
)
print(f"Shape: {sum(len(p) for paths in shape.values() for p in paths)} contour points; "
      f"{len(light)/len(body):.1%} highlights; {(DEST/'shape.js').stat().st_size} bytes")
