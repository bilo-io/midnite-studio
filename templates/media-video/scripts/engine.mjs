/**
 * Which video engine this workspace uses — shared by render.mjs and
 * sync-assets.mjs so both dispatch off the same answer.
 *
 * The choice lives in `<root>/video.config.json` (`{ "engine": "remotion" |
 * "hyperframes" }`), written by Midnite Studio's Setup Video and its engine
 * switch. **A workspace without that file is Remotion** — workspaces made
 * before the choice existed keep working untouched.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ENGINES = ["remotion", "hyperframes"];

/** Each engine's editor app, relative to the workspace root. */
export const APP_DIR = { remotion: "video-editor", hyperframes: "hyperframes-editor" };

export const readEngine = (root) => {
  try {
    const { engine } = JSON.parse(readFileSync(join(root, "video.config.json"), "utf8"));
    return ENGINES.includes(engine) ? engine : "remotion";
  } catch {
    return "remotion";
  }
};
