#!/usr/bin/env node
/**
 * Bake midnite-studio's six loop icons into `shared/loopIcons.tsx`.
 *
 *   node scripts/make-loop-icons.mjs          → write the module
 *   node scripts/make-loop-icons.mjs --check  → fail if it is out of date
 *
 * ── Why this is generated rather than copied ────────────────────────────────
 *
 * The loops the film names are the app's own, and both the glyph and the colour
 * are already written down there —
 * `packages/app/src/features/loops/loop-icons.ts` maps each loop to a
 * `react-icons` component and `loop-glow.ts` maps it to a hex. Copying either by
 * hand would be a second list to keep in step with the app's, and the one that
 * drifted would drift silently: a video showing last year's icon in this year's
 * colour still renders, still passes every check, and is wrong. This is the same
 * argument `make-logo-cuts.mjs` makes for `shared/agentAccents.ts`, and the same
 * remedy.
 *
 * ── Why components and not SVG files ────────────────────────────────────────
 *
 * Every other mark in this repo is a file loaded through `<Img>`, and these are
 * not, for a reason the README already records: an SVG loaded by URL cannot
 * inherit a colour, so `currentColor` renders black. `make-logo-cuts.mjs` works
 * around that by cutting a second, re-filled copy of each file — which is right
 * when a mark has two fixed states (a light stage and a dark one) and wrong
 * here, where each icon is painted in its own loop's hue, crossfaded under a
 * wipe, and has a shimmer band travelling across it. That is a colour per frame,
 * not a colour per cut. Inline SVG takes `stroke`/`fill` as props and costs no
 * files.
 *
 * ── What it reads ───────────────────────────────────────────────────────────
 *
 * `react-icons` ships each pack as one ESM bundle of `GenIcon({...})` calls, so
 * the icon's geometry is a JSON literal inside a function body. This extracts
 * that literal by brace-matching from the call site and parses it, rather than
 * importing the pack — importing would pull React and a thousand unused icons
 * into a build step that wants six path strings.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "video-editor/src/shared/loopIcons.tsx");

/** Where the app lives. Its node_modules is where `react-icons` is installed. */
const STUDIO = resolve(process.env.MIDNITE_STUDIO ?? join(ROOT, "../midnite-studio"));

/**
 * The six loops, as the film names them against as the app names them.
 *
 * `id` is the app's own loop id — the key into its `loop-glow.ts` — and `slug`
 * is what the film types on screen. They differ because the client renamed three
 * of them for the video (v5), and the rename is recorded here rather than in the
 * scene file so that the colour and the glyph cannot be attached to the wrong
 * one: everything about a loop is on one row.
 *
 * `icon` is the app's icon *token*, which is not always the loop id — the app
 * keeps those separate on purpose (`loop-icons.ts`).
 */
const LOOPS = [
  { slug: "guard", id: "guard", icon: "guard", component: "LuShieldCheck", pack: "lu" },
  { slug: "concepts", id: "innovate", icon: "brain", component: "GiOvermind", pack: "gi" },
  { slug: "develop", id: "automate", icon: "bot", component: "SiClevercloud", pack: "si" },
  { slug: "patrol", id: "watchdog", icon: "watchdog", component: "SiSecurityscorecard", pack: "si" },
  { slug: "medic", id: "medic", icon: "medic", component: "FaHeartbeat", pack: "fa" },
  { slug: "overhaul", id: "overhaul", icon: "overhaul", component: "LuGauge", pack: "lu" },
];

const fail = (message) => {
  console.error(`make-loop-icons: ${message}`);
  process.exit(1);
};

/** The app's own colour table, read rather than transcribed. */
const readGlowColours = () => {
  const file = join(STUDIO, "packages/app/src/features/loops/loop-glow.ts");
  if (!existsSync(file)) fail(`cannot find ${file} — set MIDNITE_STUDIO`);
  const source = readFileSync(file, "utf8");
  const table = source.slice(source.indexOf("const LOOP_GLOW"), source.indexOf("export const LOOP_WAITING_COLOR"));
  const colours = {};
  for (const [, id, hex] of table.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)) colours[id] = hex;
  if (Object.keys(colours).length === 0) fail("read no colours out of loop-glow.ts");
  return colours;
};

/** Confirm the app still maps this loop to this icon, so a rename is caught. */
const assertIconTokens = () => {
  const file = join(STUDIO, "packages/app/src/features/loops/loop-icons.ts");
  if (!existsSync(file)) fail(`cannot find ${file} — set MIDNITE_STUDIO`);
  const source = readFileSync(file, "utf8");
  for (const loop of LOOPS) {
    const re = new RegExp(`${loop.icon}:\\s*${loop.component}\\b`);
    if (!re.test(source)) {
      fail(`the app no longer draws '${loop.icon}' with ${loop.component} — update LOOPS`);
    }
  }
};

/** The `GenIcon({...})` literal for one icon, by brace-matching from the call. */
const readIcon = ({ component, pack }) => {
  const file = join(STUDIO, `node_modules/.pnpm`);
  const store = existsSync(file) ? file : null;
  let bundle = null;
  if (store) {
    const dir = readdirSync(store).find((d) => d.startsWith("react-icons@"));
    if (dir) bundle = join(store, dir, "node_modules/react-icons", pack, "index.mjs");
  }
  if (!bundle || !existsSync(bundle)) {
    bundle = join(STUDIO, "node_modules/react-icons", pack, "index.mjs");
  }
  if (!existsSync(bundle)) fail(`cannot find react-icons/${pack} — is midnite-studio installed?`);

  const source = readFileSync(bundle, "utf8");
  const marker = source.indexOf(`function ${component} (props)`);
  if (marker < 0) fail(`${component} is not in react-icons/${pack}`);
  const open = source.indexOf("GenIcon(", marker) + "GenIcon(".length;

  let depth = 0;
  let end = open;
  for (; end < source.length; end++) {
    if (source[end] === "{") depth++;
    else if (source[end] === "}") {
      depth--;
      if (depth === 0) {
        end++;
        break;
      }
    }
  }
  return JSON.parse(source.slice(open, end));
};

/** React needs camelCase; the bundle already uses it, so only `class` differs. */
const attrName = (key) => (key === "class" ? "className" : key);

const renderChildren = (children, indent) =>
  children
    .map((node) => {
      const attrs = Object.entries(node.attr ?? {})
        .map(([k, v]) => `${attrName(k)}="${v}"`)
        .join(" ");
      const kids = node.child?.length ? renderChildren(node.child, `${indent}  `) : null;
      return kids
        ? `${indent}<${node.tag} ${attrs}>\n${kids}\n${indent}</${node.tag}>`
        : `${indent}<${node.tag} ${attrs} />`;
    })
    .join("\n");

const colours = readGlowColours();
assertIconTokens();

const entries = LOOPS.map((loop) => {
  const icon = readIcon(loop);
  const colour = colours[loop.id];
  if (!colour) fail(`the app has no colour for loop '${loop.id}'`);

  /*
    Lucide draws with a stroke and no fill; the other packs draw a filled path.
    Which one an icon is decides whether the film paints its `stroke` or its
    `fill`, so it is recorded per icon rather than assumed — a filled glyph given
    a stroke colour is a black square on a dark stage.
  */
  const stroked = icon.attr.fill === "none" && icon.attr.stroke === "currentColor";

  return {
    ...loop,
    colour,
    stroked,
    viewBox: icon.attr.viewBox,
    strokeWidth: icon.attr.strokeWidth ?? null,
    body: renderChildren(icon.child, "      "),
  };
});

const module = `/* GENERATED by scripts/make-loop-icons.mjs — do not edit.
   Source: midnite-studio's own loop-icons.ts and loop-glow.ts, and the
   react-icons build they resolve to. Re-run the script to update. */

/**
 * The six agent loops midnite Studio ships, as the film draws them.
 *
 * Each row carries everything about one loop: the name the film types, the
 * app's own id for it, its colour out of the app's table, and its glyph inlined
 * from \`react-icons\`. One row rather than four parallel lists, so a loop's
 * colour cannot end up on another loop's icon.
 *
 * \`stroked\` is the one thing a caller has to respect: Lucide's glyphs are
 * strokes on an unfilled path and the rest are filled shapes, so the colour goes
 * to a different attribute for each. Painting a filled glyph's stroke leaves it
 * black, which on this film's dark stage is nothing at all.
 */
export type LoopIcon = {
  /** What the film types, after the \`/\`. */
  slug: string;
  /** The app's own loop id — the key into its colour table. */
  id: string;
  /** The loop's colour, from the app's \`loop-glow.ts\`. */
  colour: string;
  /** True when the glyph is drawn with a stroke rather than a fill. */
  stroked: boolean;
  /** Draw the glyph at \`size\` px in \`colour\`. */
  Icon: React.FC<{ size: number; colour: string; opacity?: number }>;
};

export const LOOP_ICONS: readonly LoopIcon[] = [
${entries
  .map(
    (e) => `  {
    slug: ${JSON.stringify(e.slug)},
    id: ${JSON.stringify(e.id)},
    colour: ${JSON.stringify(e.colour)},
    stroked: ${e.stroked},
    Icon: ({ size, colour, opacity = 1 }) => (
      <svg
        width={size}
        height={size}
        viewBox=${JSON.stringify(e.viewBox)}
        fill=${e.stroked ? '"none"' : "{colour}"}
        ${e.stroked ? "stroke={colour}" : ""}
        ${e.strokeWidth ? `strokeWidth=${JSON.stringify(e.strokeWidth)}` : ""}
        ${e.stroked ? 'strokeLinecap="round"' : ""}
        ${e.stroked ? 'strokeLinejoin="round"' : ""}
        opacity={opacity}
        aria-hidden
      >
${e.body}
      </svg>
    ),
  },`,
  )
  .join("\n")}
];

/** By the name the film types, because that is what the scene has in hand. */
export const loopBySlug = (slug: string): LoopIcon => {
  const found = LOOP_ICONS.find((loop) => loop.slug === slug);
  if (!found) throw new Error(\`no loop named '\${slug}'\`);
  return found;
};
`;

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== module) fail(`${OUT} is out of date — re-run without --check`);
  console.log("make-loop-icons: up to date");
} else {
  writeFileSync(OUT, module);
  console.log(`make-loop-icons: wrote ${entries.length} icons → ${OUT}`);
  for (const e of entries) {
    console.log(`  /${e.slug.padEnd(9)} ${e.colour}  ${e.stroked ? "stroke" : "fill  "}  ${e.id}`);
  }
}
