---
name: video-write-editorial-script
description: Turn a video brief into a detailed, execution-ready editorial script markdown file, verified against the actual source video and assets on disk rather than the brief's stated assumptions
---

# Write an editorial script from a brief

Use this when someone hands you a brief (a markdown doc, a Notion/Google Doc dump, an
email, whatever form it takes) describing a video to make — either an edit to an existing
one or a piece built from scratch — and you need to turn it into a precise,
execution-ready plan before writing any Remotion code.

ARGUMENTS: the project folder, e.g. "project: projects/acme/marketing/001-launch" —
the brief is `<project>/input/BRIEF.md`, the source video (if this edit has one) is the
`source` named in `<project>/project.json`, and reusable media lives in the repo-level
`assets/`. A brief and a video may also be passed as explicit paths instead. If either is
missing or ambiguous, ask before proceeding — don't guess which file is the brief or the
source.

Note that a **project id is a path**, not a single segment:
`<brand>/<category>/<NNN-name>`. See the repo README.

## Why this exists

Briefs are written by humans describing what they remember or intend, not what's
technically true. Placement markers are ambiguous ("0.34" could be a timestamp or a
fraction of runtime), linked assets get moved or renamed after the brief is written, and
the "before" state the brief assumes may not match what's actually in the file — an
earlier draft may already contain part of what's being asked for. Don't build against the
brief's stated assumptions. Build against verified reality, then reconcile the
differences with the human.

## Process

1. **Read the brief in full.** Note every linked asset, every placement instruction,
   every piece of copy, and every open/unanswered question the brief itself contains
   (blank fields, embedded questions like "or something more abstract?").

2. **Verify every linked asset exists.** For each link in the brief, confirm the file is
   actually at that path. When it isn't, search the surrounding directories for a
   same/similar-named file before asking the human — reorgs and renames are common and
   usually mechanically fixable. Assets live in exactly two places: reusable ones
   (logos, b-roll, music, brand elements) in the repo-level `assets/<kind>/`, and
   video-specific ones in `<project>/input/`. If a needed asset sits somewhere else,
   move it into the right one and point the brief at the new path. Fix broken links in
   the brief file directly (these are factual corrections, not creative calls) and note
   what you changed. Also check for accidental duplicates (same file landed in two
   places — compare hashes, not just names) and mislabeled files (e.g. a comment
   describing a logo's colour that doesn't match what the file actually contains — check
   the source, trust it over the label).


3. **Get the source video's ground truth — don't assume:**
   - `ffprobe` for resolution, fps, duration, codec, audio presence.
   - Check whether the audio track actually contains signal
     (`ffmpeg -af volumedetect -f null -`) before assuming there's narration or music to
     work with. A present-but-silent track is common.
   - If the brief references spoken phrases and there IS real audio, transcribe it (see
     the `remotion-captions` skill's transcription flow) to get exact timestamps rather
     than guessing. If transcription comes back empty/blank, the messaging is probably
     on-screen text, not narration — switch to frame inspection instead.

   For a video built from scratch there is no source to probe; skip to step 6 and spend
   the effort on the per-section specs instead.

4. **Resolve ambiguous placement notation empirically.** If the brief says things like
   "0.34" or "after X phrase," don't guess whether that means a timestamp, a fraction of
   runtime, or something else — extract frames at the candidate timestamp(s) and look.
   Use a coarse-then-fine approach: wide contact-sheet grids (tile multiple low-res
   frames into one image via ffmpeg's `tile` filter, e.g.
   `-vf "fps=1,scale=480:270,tile=4x6"`) to narrow down a region, then dense sampling
   (5-10fps) around the actual boundary to find the precise cut point. `tools/cut-detect.py`
   turns that last step into one command — a single-frame spike in its diff series is a
   hard cut and gives the exact frame. A single isolated "wrong scene" frame in a
   fast-sampled contact sheet is usually a seek/decode artifact, not real content —
   cross-check against neighbouring frames before trusting it. Frame-accurate cut points
   matter more than the brief's approximate language; state both the seconds and the
   frame number (at the video's real fps) once resolved.

5. **Build a full timeline map of the existing video** around every point the brief
   touches — what's on screen immediately before and after each placement, not just at
   the exact marker. This is what catches cases like "the brief describes this placement
   as an insert, but there's already similar content sitting exactly there" — a sign the
   brief means replace, not insert. Never assume insert vs. replace; if the evidence is
   ambiguous, surface it as an explicit question rather than picking one.

6. **Pixel-measure any persistent brand overlay** (logo, watermark, lower-third, CTA
   block) that new sections need to replicate. Don't eyeball coordinates — extract a
   full-resolution frame and measure bounding boxes programmatically with `tools/bbox.py`,
   cross-validated against at least two frames with different backgrounds so underlying
   footage isn't mistaken for the overlay. Decide per-element whether to recreate it
   (vector logo + real text, for elements sitting directly on varying footage with no
   card behind them — a rectangular crop would carry visible background artifacts) or
   crop it as a static asset (only for genuinely opaque, self-contained elements, where
   a crop is reusable over any background).

7. **Separate what's blocking from what's just unspecified.** Some gaps need a human
   decision before you can proceed (ambiguous scope, missing required assets, genuinely
   open creative questions the brief itself leaves blank). Others you can propose a
   reasonable default for and flag for confirmation later (e.g. a duration the brief
   never states, inferred from the pacing of surrounding beats). Don't block on the
   second kind — note the proposal and move on.

8. **Ask before assuming on genuine ambiguities** — especially insert-vs-replace calls,
   missing required assets, and anything the brief itself left blank. Skip re-litigating
   anything the human has already answered in conversation.

## Output

Write a single markdown file at `<project>/EDITORIAL_SCRIPT.md` (next to `input/`, not
inside it) containing:

- **Environment notes** — anything a fresh session needs before touching the project
  (PATH quirks, font setup already done, dependencies already installed, etc.)
- **Source video ground truth** — verified specs, audio status, anything that contradicts
  what the brief assumes. (Omit for a from-scratch build, and say so.)
- **Asset inventory** — resolved, verified on-disk paths for everything needed, marking
  each as shared (`assets/…`, referenced in code as
  `staticFile("logos/agents/claude-white.svg")`) or project-specific (`<project>/input/…`,
  referenced as `projectFile`/`<name>File("x.mp4")`)
- **Full timeline map** — a table of beats with real timestamps AND frame numbers (state
  the fps used for conversion), flagging replace-vs-insert points explicitly
- **Per-section build specs** — copy, timing, animation, assets, exact pixel coordinates
  for any matched overlay, called out per section from the brief
- **Open items** — anything still blocking, clearly separated from resolved items, so a
  fresh session doesn't have to re-derive what's already settled
- **Next-steps checklist** — concrete, ordered, actionable

Write this so a separate Claude Code session with zero prior context could execute the
edit correctly from this document alone, without re-reading the brief or re-deriving
anything already verified here.

Don't write any composition code as part of this skill — that's
`video-execute-editorial-script`. This skill only produces the plan.
