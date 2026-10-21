#!/usr/bin/env python3
"""Measure the bounding box of bright (or dark) pixels in a region of a PNG frame.

Used to pixel-measure brand overlays and baked-in captions (logo block, QR card, URL
line, caption glyphs) so recreated elements land exactly where the original's did — and
to verify a rendered Remotion still against those numbers. Needs only Python — ffmpeg comes from Remotion (see _ffmpeg.py).

Prints the overall bounding box, then the horizontal "runs" (glyphs/words) with their
individual vertical extents — from which you read cap height, x-height, baseline and stem
width to derive font size and weight (Poppins: cap height ≈ 0.70em, x-height ≈ 0.55em,
Regular stem ≈ 0.09em).

Usage:
  tools/bbox.py IMAGE --region x0,y0,x1,y1 [--th 235] [--dark] [--gap 3] [--rows]

  --region   area to scan (full-res pixel coords, x1/y1 exclusive)
  --th       threshold: pixels > th count as "on" (or < th with --dark). Default 235.
  --dark     measure dark text on a light background instead of light on dark
  --gap      pixels of empty columns that separate two runs (default 3)
  --rows     also print vertical runs (e.g. the three rows of a logo block)

Examples (COP31 showreel, 1920x1080 frames):
  tools/bbox.py frame.png --region 0,0,400,260 --th 200 --rows       # logo + tagline block
  tools/bbox.py frame.png --region 150,440,1800,620                   # white caption glyphs
  tools/bbox.py frame.png --region 980,400,1850,600 --dark --th 90    # navy caption on light bg
"""
import argparse

from _ffmpeg import dimensions, gray_frames


def runs(indices, gap):
    if not indices:
        return []
    out, start, prev = [], indices[0], indices[0]
    for v in indices[1:]:
        if v - prev > gap:
            out.append((start, prev))
            start = v
        prev = v
    out.append((start, prev))
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("image")
    p.add_argument("--region", required=True)
    p.add_argument("--th", type=int, default=235)
    p.add_argument("--dark", action="store_true")
    p.add_argument("--gap", type=int, default=3)
    p.add_argument("--rows", action="store_true")
    a = p.parse_args()

    w, h = dimensions(a.image)
    d = gray_frames(a.image)

    x0, y0, x1, y1 = (int(v) for v in a.region.split(","))
    x1, y1 = min(x1, w), min(y1, h)
    on = (lambda v: v < a.th) if a.dark else (lambda v: v > a.th)

    cols = [x for x in range(x0, x1) if any(on(d[y * w + x]) for y in range(y0, y1))]
    rows = [y for y in range(y0, y1) if any(on(d[y * w + x]) for x in range(x0, x1))]
    if not cols:
        print("no matching pixels in region")
        return
    print(f"bbox  x {cols[0]}–{cols[-1]}  y {rows[0]}–{rows[-1]}  ({cols[-1]-cols[0]+1}×{rows[-1]-rows[0]+1}px)")

    print("horizontal runs (x0–x1 : y-extent):")
    for (rx0, rx1) in runs(cols, a.gap):
        ys = [y for y in range(y0, y1) if any(on(d[y * w + x]) for x in range(rx0, rx1 + 1))]
        print(f"  {rx0:5d}–{rx1:<5d} : y {ys[0]}–{ys[-1]}  (w {rx1-rx0+1}, h {ys[-1]-ys[0]+1})")

    if a.rows:
        print("vertical runs (y0–y1 : x-extent):")
        for (ry0, ry1) in runs(rows, a.gap):
            xs = [x for x in range(x0, x1) if any(on(d[y * w + x]) for y in range(ry0, ry1 + 1))]
            print(f"  {ry0:5d}–{ry1:<5d} : x {xs[0]}–{xs[-1]}")


if __name__ == "__main__":
    main()
