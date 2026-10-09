"""Finding an ffmpeg, on a machine that may not have one.

`bbox.py` and `cut-detect.py` were written against a system ffmpeg, and at the
time there wasn't one here. There doesn't need to be: `video-editor/` depends
on Remotion, which ships its own ffmpeg and ffprobe and exposes them as
`npx remotion ffmpeg` / `npx remotion ffprobe`. This module picks whichever is
available, preferring a real system install because it starts instantly where
the npx wrapper costs a second or so per call.

A Homebrew ffmpeg 9.0.2 has since appeared on this machine, so the system path
is the one normally taken now — but the fallback stays, because the bundled
copy is the only one the repo actually *depends* on, and because the two
builds disagree about flags (see the `-fps_mode` note in `gray_frames`).

Two wrinkles in that bundled build drove the shape of `gray_frames`, and both
are invisible until it is the binary actually running:

1. It is compiled `--disable-muxers` with a short allow-list and **`rawvideo`
   is not on it**, so the `-f rawvideo` both tools were written against fails
   outright. `image2pipe` *is* enabled and with `-vcodec rawvideo` writes the
   same uncompressed frames, so this pipes through that instead of writing a
   `.gray` temp file. Verified byte-for-byte: a 1920x1080 still comes back as
   exactly 2073600 bytes.

2. It is compiled `--disable-filters` with an allow-list that is almost
   entirely audio. Of the video filters only `scale` (and `zscale`,
   `colorspace`, `tonemap`, `split`, `copy`) survive — **`select`, `fps` and
   `tile` are all absent**. So a frame range cannot be cut with
   `-vf select='between(n,a,b)'`; `frame_range` seeks instead, with `-ss`
   placed *after* `-i` so it decodes from the start and lands on the exact
   frame rather than the nearest keyframe.

The same limits apply to anything else written against `npx remotion ffmpeg` —
notably the contact-sheet recipes in the README, which need `fps` and `tile`
and therefore a real ffmpeg.
"""

import shutil
import subprocess
from pathlib import Path

EDITOR = Path(__file__).resolve().parent.parent / "video-editor"


def _cmd(tool: str) -> list:
    """The argv prefix that runs `tool`, system copy first."""
    found = shutil.which(tool)
    return [found] if found else ["npx", "remotion", tool]


def _run(argv: list, **kwargs):
    """Run from `video-editor/` so the npx fallback resolves Remotion's copy."""
    return subprocess.run(argv, cwd=EDITOR, **kwargs)


def dimensions(path: str) -> tuple:
    """(width, height) of the first video stream."""
    out = _run(
        _cmd("ffprobe")
        + ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
           "-of", "csv=p=0", str(Path(path).resolve())],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    """
    The npx wrapper prefixes npm's own notices, so take the last non-empty
    line rather than the whole of stdout.
    """
    line = [ln for ln in out.strip().splitlines() if ln.strip()][-1]
    w, h = (int(v) for v in line.split(","))
    return w, h


def gray_frames(source: str, scale: tuple = None, frame_range: tuple = None, fps: float = None) -> bytes:
    """Decode `source` to raw 8-bit greyscale bytes, one frame after another.

    `scale` is an optional (width, height). `frame_range` is an inclusive
    (start, end) in frames, which needs `fps` to convert to a seek — the
    `select` filter that would express it directly is not compiled into
    Remotion's ffmpeg (see the module docstring).

    Returns every frame concatenated; the caller knows the geometry and so
    knows where each frame starts.
    """
    argv = _cmd("ffmpeg") + ["-loglevel", "error", "-y", "-i", str(Path(source).resolve())]
    if frame_range is not None:
        if not fps:
            raise ValueError("frame_range needs fps")
        start, end = frame_range
        """
        `-ss` here is an *output* option because it follows `-i`: ffmpeg
        decodes from the file's start and discards, which costs time on a long
        source but lands on the requested frame rather than the preceding
        keyframe. Frame-accuracy is the entire point of a cut detector.

        Half a frame of slack keeps a timestamp that lands exactly on the
        boundary from rounding to the frame before.
        """
        argv += ["-ss", f"{(start + 0.5) / fps:.6f}", "-frames:v", str(end - start + 1)]
    if scale is not None:
        argv += ["-vf", f"scale={scale[0]}:{scale[1]}"]
    """
    `-fps_mode passthrough`, not the `-vsync 0` this was written with: the two
    mean the same thing, but `-vsync` was deprecated in ffmpeg 5 and *removed*
    in 9, where passing it aborts the run before decoding starts
    ("Unrecognized option 'vsync'", exit 8). Remotion's bundled n7.1 and a
    current system build both understand `-fps_mode`.
    """
    argv += ["-fps_mode", "passthrough", "-f", "image2pipe", "-vcodec", "rawvideo", "-pix_fmt", "gray", "-"]
    return _run(argv, check=True, capture_output=True).stdout
