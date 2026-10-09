#!/usr/bin/env node
/**
 * Generate the `-white` and `-color` cuts of each logo from its canonical one.
 *
 *   node scripts/make-logo-cuts.mjs           # write the cuts
 *   node scripts/make-logo-cuts.mjs --check   # fail if any is missing or stale
 *
 * The canonical mark paints with `currentColor`, which is right for inlined
 * SVG and useless through an `<Img>`: a file referenced by URL has no page to
 * inherit from, so `currentColor` resolves to the SVG's own initial `color` —
 * black — and the mark disappears on midnite's near-black stage. Hence two
 * derived cuts, each a flat re-fill of the same paths:
 *
 *   x-white.svg   white, for a mark on the dark stage
 *   x-color.svg   the agent's brand accent, for when the row should read as
 *                 a set of *brands* rather than a set of glyphs
 *
 * The accents are not invented here. They are `AgentDefinition.accent` from
 * midnite-studio's own roster (`packages/shared/src/terminal.ts`), so the row
 * in a video and the row in the app are the same colours. An agent the roster
 * does not carry has no accent to copy, gets no `-color` cut, and falls back
 * to white — see `AgentLogo.tsx`.
 *
 * ── Marks that are not `currentColor` ───────────────────────────────────────
 *
 * Two other shapes of file live under `assets/logos/` and both are left alone
 * on purpose, because re-filling them would destroy what makes them that mark:
 *
 *   - **a mark that carries its own colour** — Antigravity's masked spectrum,
 *     Aider's green bit-art `a`, GitLab's four-tone tanuki, Bitbucket's
 *     gradient, Azure DevOps' — has no `currentColor` in it and gets no derived
 *     cuts at all. Draw it as supplied.
 *   - **a mark painted in one flat brand colour** — Claude's, Cursor's,
 *     Codex's, Copilot's, Cline's, and GitHub's black — still needs a cut,
 *     because a single hue on midnite's near-black stage is a mark you cannot
 *     read and, in GitHub's case, no mark at all. The swap is one exact token,
 *     never a blanket one: `fill="black"` → white across every file would also
 *     repaint the black *details* inside a coloured mark.
 *
 * The five agent marks in that last group name no token here. Their canonical
 * file is painted in the hue the roster already records as their accent, so the
 * accent *is* the token — found below rather than configured, which is what
 * keeps the roster the only place an agent's colour is written down.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGOS = join(ROOT, "assets", "logos");

/**
 * Where the accents are re-published for the renderer.
 *
 * A component that wants to *draw* in an agent's colour — a shimmer crossing
 * its mark, say — needs the hex, and the hex lives here because this is what
 * cuts the files. Copying the table into `src/shared/` would be two lists to
 * keep in step, and the one that drifted would drift silently; emitting it
 * instead means `--check` catches it with everything else.
 */
const ACCENT_MODULE = join(ROOT, "video-editor", "src", "shared", "agentAccents.ts");

/**
 * `AgentDefinition.accent`, keyed by the mark's filename rather than the
 * agent id — the roster calls Antigravity `agy` and names its mark
 * `antigravity`, and it is the mark that is being coloured here.
 */
const ACCENT = {
  claude: "#D97757",
  cursor: "#0066FF",
  codex: "#10A37F",
  copilot: "#6E40C9",
  openclaude: "#8B5CF6",
  opencode: "#03B000",
  kilo: "#FF5500",
  cline: "#5F52FF",
  /*
    The roster gives Grok `#000000`, which is its brand and is also invisible
    on a near-black stage. White is the honest substitution — the mark is
    black-or-white by design, and this is the "or white" case — rather than
    inventing a colour the brand does not have.
  */
  grok: "#FFFFFF",
};

/**
 * Marks whose canonical file is flat black rather than `currentColor`, and the
 * exact fill value to replace — matched as written in the file, so a mark that
 * spells it `#000` is a separate entry rather than a regex over both.
 *
 * Only marks whose flat colour is *not* their roster accent need an entry.
 * GitHub's is black, which is a brand and not an accent, so it is here; the
 * agent marks painted in their own accent are found by `flatToken` below.
 *
 * A mark listed here gets a `-white` cut and no `-color` one unless `ACCENT`
 * carries it: the colour of a black-and-white mark is black or white, and
 * inventing a third would be putting a colour in a midnite video that the brand
 * it belongs to never chose.
 */
const FLAT = {
  "git/logo-github": 'fill="black"',
};

/**
 * The one paint token a flat mark is drawn with, or `undefined` if it is not
 * one — either because it is `currentColor`, or because it carries real art.
 *
 * The `ACCENT` branch is the interesting half. Several agent marks ship from
 * their vendor painted in exactly the hue midnite's roster records as their
 * accent, so there is nothing to configure: if the file has no `currentColor`
 * and does contain that hex, the hex is the token. A mark whose art happens to
 * be self-coloured — Aider's bit-art `a`, Antigravity's spectrum — carries no
 * accent that appears as a literal and so falls through to `undefined`, which
 * is the "leave it alone" case.
 */
const flatToken = (key, base, source) => {
  if (FLAT[key]) return FLAT[key];
  if (source.includes("currentColor")) return undefined;
  return ACCENT[base] && source.includes(ACCENT[base]) ? ACCENT[base] : undefined;
};

/** A flat mark re-painted: a bare hex swaps for a hex, an attribute for one. */
const repaint = (token, fill) =>
  token.startsWith("#") ? fill : token.replace(/"[^"]*"/, `"${fill}"`);

/**
 * Marks that also need an **ink** cut — the same shape dark enough to read on
 * the *light* stage, for a video that changes surface partway through.
 *
 * Only the ones that actually cross a wipe are listed, which today is midnite's
 * own crescent: it is the single object that persists through every act of the
 * golive-promo, so it is the only mark that has to be legible on both. The
 * agent marks appear on one stage each and would gain fifteen unused files.
 *
 * The value is `LIGHT.FG.base` from `video-editor/src/shared/brand.ts`, which is
 * the light theme's foreground rather than plain black — a pure-black mark on a
 * 99%-lightness page reads harder than every piece of type around it.
 *
 * Note this is **not** the same as leaning on the canonical `currentColor` cut,
 * which also renders dark through an `<Img>`. That happens because the file has
 * no page to inherit from and so falls back to its own initial `color`, which
 * is a default, not a decision — the README lists it as a bug to avoid, and
 * building a light-theme lockup on it would be shipping the bug on purpose.
 */
const INK = {
  "midnite/midnite-mark": "#171726",
  /*
    Grok's mark is black-or-white by design and `ACCENT` substitutes white for
    it, which is right on the near-black page and is *no mark at all* on the
    light one — the golive-promo deals the whole roster one mark at a time onto
    99%-lightness paper, and a rendered still of that beat is a blank frame with
    a caption over it. This is the "or black" half, in the light theme's ink
    rather than pure black for the reason above.
  */
  "agents/grok": "#171726",
};

const check = process.argv.includes("--check");
const problems = [];
/**
 * Every cut this run would produce, as `dir/file.svg`, so the sweep at the
 * bottom can name the ones on disk that nothing generates any more.
 *
 * This exists because a stale cut is silent in a way a missing one is not.
 * Aider's mark was replaced with self-coloured bit-art, which has no
 * `currentColor` and so is skipped entirely — and `aider-white.svg`, cut from
 * the *previous* mark, stayed on disk being the file `AgentLogo` loaded. The
 * roster kept drawing a logo the brand had stopped using, and `--check` passed.
 */
const expected = new Set();
let written = 0;

for (const dir of readdirSync(LOGOS, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const dirPath = join(LOGOS, dir.name);
  const canonical = readdirSync(dirPath).filter(
    (f) =>
      f.endsWith(".svg") &&
      !f.endsWith("-white.svg") &&
      !f.endsWith("-color.svg") &&
      !f.endsWith("-ink.svg"),
  );

  for (const file of canonical) {
    const base = file.replace(/\.svg$/, "");
    const source = readFileSync(join(dirPath, file), "utf8");

    /*
      A mark that carries its own colour (Antigravity's masked spectrum, the
      forge marks under `git/`) has no `currentColor` to replace. Re-filling it
      would flatten the thing that makes it that mark, so it is left with no
      derived cuts at all — unless it is in `FLAT`, which is the black-by-design
      case and does need one.
    */
    const flat = flatToken(`${dir.name}/${base}`, base, source);
    if (!source.includes("currentColor") && !flat) continue;

    /** What a cut re-fills, and what with. */
    const from = flat ?? "currentColor";
    const paint = (fill) => source.replaceAll(from, flat ? repaint(flat, fill) : fill);

    /*
      A flat mark's `-color` cut re-paints its own token with its own accent, so
      it is a byte-identical copy of the canonical file. That is deliberate:
      `AgentLogo` asks for a tone, not for a filename, and a roster where nine
      marks have a `-color` cut and five silently do not is a fallback waiting
      to be forgotten.
    */
    const cuts = [["-white.svg", "#ffffff"]];
    if (ACCENT[base]) cuts.push(["-color.svg", ACCENT[base]]);
    const ink = INK[`${dir.name}/${base}`];
    if (ink) cuts.push(["-ink.svg", ink]);

    for (const [suffix, fill] of cuts) {
      expected.add(`${dir.name}/${base}${suffix}`);
      const target = join(dirPath, base + suffix);
      const want = paint(fill);
      let have = null;
      try {
        have = readFileSync(target, "utf8");
      } catch {
        /* missing — reported below */
      }
      if (have === want) continue;
      if (check) {
        problems.push(`${dir.name}/${base}${suffix} ${have === null ? "missing" : "stale"}`);
      } else {
        writeFileSync(target, want);
        console.log(`  + ${dir.name}/${base}${suffix}`);
        written++;
      }
    }
  }
}

/* Cuts on disk that this run does not produce — see `expected` above. */
for (const dir of readdirSync(LOGOS, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  for (const file of readdirSync(join(LOGOS, dir.name))) {
    if (!/-(white|color|ink)\.svg$/.test(file)) continue;
    if (expected.has(`${dir.name}/${file}`)) continue;
    problems.push(`${dir.name}/${file} orphaned — nothing generates it; delete it`);
  }
}

/* The accents, re-published for anything that has to paint with them. */
{
  const want = `/**
 * Each agent's brand accent — generated, do not edit.
 *
 * Written by \`scripts/make-logo-cuts.mjs\`, which is where the colours live,
 * because they are what cuts the \`-color\` files. This module exists for
 * components that need the hex itself rather than a file painted with it — a
 * shimmer crossing a mark has to be *that brand's* light, and a row of eleven
 * marks all flashing violet is a row of eleven marks flashing violet.
 *
 * The source is midnite-studio's own roster (\`AgentDefinition.accent\` in
 * \`packages/shared/src/terminal.ts\`), keyed by mark filename rather than by
 * agent id — the roster calls Antigravity \`agy\` and names its mark
 * \`antigravity\`, and it is the mark being coloured.
 *
 * An agent the roster carries no accent for is simply absent; callers fall back
 * to white, which is what \`AgentLogo\` does for its \`-color\` cut too.
 */
export const AGENT_ACCENT: Readonly<Record<string, string>> = {
${Object.entries(ACCENT)
  .map(([key, hex]) => `  ${/^[a-z][a-z0-9]*$/.test(key) ? key : JSON.stringify(key)}: "${hex}",`)
  .join("\n")}
};
`;
  let have = null;
  try {
    have = readFileSync(ACCENT_MODULE, "utf8");
  } catch {
    /* missing — reported below */
  }
  if (have !== want) {
    if (check) {
      problems.push(`shared/agentAccents.ts ${have === null ? "missing" : "stale"}`);
    } else {
      writeFileSync(ACCENT_MODULE, want);
      console.log("  + shared/agentAccents.ts");
      written++;
    }
  }
}

if (check || problems.length) {
  if (problems.length) {
    console.error(`logo cuts out of date:\n  ${problems.join("\n  ")}`);
    console.error("run: node scripts/make-logo-cuts.mjs");
    process.exit(1);
  }
  console.log("logo cuts up to date");
} else {
  console.log(`${written} written`);
}
