#!/usr/bin/env python3
"""Find hard cuts, dissolves and freeze-frames in a video by inter-frame difference.

Decodes a frame range to greyscale via ffmpeg (no PIL/numpy needed; ffmpeg comes from Remotion) and prints the mean
absolute difference between each frame and the previous one. Read the output like this:

  diff ~0         freeze-frame / static beat
  diff 1-15       motion or an entrance/exit animation (steady ramp = ease in/out)
  single spike    HARD CUT — the spiking frame is the first frame of the new beat
  plateau of 20+  wipe / slide / dissolve spanning those frames

Optional --watch REGION reports how many near-white pixels sit inside a region per frame
(use it to see exactly when a baked-in caption appears/disappears).

Usage:
  tools/cut-detect.py VIDEO START END [--scale 480x270] [--watch x0,y0,x1,y1] [--th 235]

  START/END are 0-based frame numbers at the video's native fps (inclusive).
  --watch coordinates are in the *scaled* frame (default 480x270 = 1/4 of 1080p).

Example (COP31 showreel, the cut into the mountain beat):
  tools/cut-detect.py projects/videos/ekko-original-1080.mp4 1840 1915 --watch 47,119,433,141
"""
import argparse
import sys

from _ffmpeg import gray_frames


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("video")
    p.add_argument("start", type=int)
    p.add_argument("end", type=int)
    p.add_argument("--scale", default="480x270", help="analysis resolution WxH (default 480x270)")
    p.add_argument("--watch", help="x0,y0,x1,y1 region (scaled coords) to count bright pixels in")
    p.add_argument("--th", type=int, default=235, help="brightness threshold for --watch (0-255)")
    p.add_argument("--fps", type=float, default=30.0, help="fps used only to print seconds")
    a = p.parse_args()

    w, h = (int(v) for v in a.scale.lower().split("x"))
    n_expected = a.end - a.start + 1
    data = gray_frames(a.video, scale=(w, h), frame_range=(a.start, a.end), fps=a.fps)

    fsize = w * h
    n = len(data) // fsize
    if n != n_expected:
        print(f"warning: expected {n_expected} frames, got {n} (range past end of video?)", file=sys.stderr)

    region = None
    if a.watch:
        x0, y0, x1, y1 = (int(v) for v in a.watch.split(","))
        region = (x0, y0, x1, y1)

    step = 7  # sample every 7th pixel for speed; plenty for cut detection
    prev = None
    diffs = []
    for i in range(n):
        cur = data[i * fsize:(i + 1) * fsize]
        frame = a.start + i
        line = f"{frame:6d}  {frame / a.fps:7.2f}s"
        if prev is not None:
            d = sum(abs(cur[k] - prev[k]) for k in range(0, fsize, step)) / (fsize / step)
            diffs.append(d)
            line += f"  diff={d:6.1f}"
        else:
            line += "  diff=   -  "
        if region:
            x0, y0, x1, y1 = region
            cnt = sum(1 for y in range(y0, y1) for x in range(x0, x1) if cur[y * w + x] > a.th)
            line += f"  bright={cnt}"
        print(line)
        prev = cur

    if diffs:
        s = sorted(diffs)
        med = s[len(s) // 2]
        spikes = [a.start + 1 + i for i, d in enumerate(diffs) if d > max(20.0, 5 * med)]
        print(f"\nmedian diff {med:.1f}; probable hard cuts at first-frame-of-new-beat: {spikes or 'none'}")


if __name__ == "__main__":
    main()
