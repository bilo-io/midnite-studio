import { cp, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_VIDEO_ENGINE,
  VIDEO_ENGINE_INFO,
  failure,
  ok,
  type GitOpResult,
  type VideoEngine,
} from '@midnite/studio-shared';

import { otherEngineDirs, writeVideoEngine } from './engine';

/**
 * Setup Video (Phase 99 Theme D) — copies the checked-in
 * `templates/media-video/` skeleton into `<repo>/.midnite/media/video/`.
 * No network clone: the template ships in the app bundle (`extraResources`).
 *
 * **One template, both engines (Theme H).** `templates/media-video/` carries
 * the engine-neutral workspace (projects, scripts, skills, README) plus one
 * editor app per engine — `video-editor/` (Remotion) and `hyperframes-editor/`.
 * A scaffold copies the common files and *only the chosen engine's* app, then
 * records the choice in `video.config.json`; switching engine later is
 * `engine.ts`'s `switchVideoEngine`, which copies the other app in on demand.
 * A second template would have duplicated the projects/scripts/skills tree and
 * let the two drift — the one thing that must stay identical between engines.
 *
 * The manifests below are what a scaffold needs; the test asserts every entry
 * exists in the checked-in template, so trimming the template cannot silently
 * break Setup Video.
 */
export const VIDEO_COMMON_TEMPLATE_FILES = [
  'README.md',
  'projects/_template/project.json',
  'projects/_template/README.md',
  'projects/_template/input/BRIEF.md',
  'projects/example/000-hello/project.json',
  'projects/example/000-hello/input/BRIEF.md',
  'scripts/engine.mjs',
  'scripts/render.mjs',
  'scripts/sync-assets.mjs',
  'scripts/projects.mjs',
  '.claude/skills/midnite-media-video-write-editorial-script/SKILL.md',
  '.claude/skills/midnite-media-video-execute-editorial-script/SKILL.md',
  '.agents/skills/midnite-media-video-write-editorial-script/SKILL.md',
  '.agents/skills/midnite-media-video-execute-editorial-script/SKILL.md',
  '.codex/skills/midnite-media-video-write-editorial-script/SKILL.md',
  '.codex/skills/midnite-media-video-execute-editorial-script/SKILL.md',
] as const;

export const VIDEO_ENGINE_TEMPLATE_FILES: Record<VideoEngine, readonly string[]> = {
  remotion: [
    'video-editor/package.json',
    'video-editor/remotion.config.ts',
    'video-editor/tsconfig.json',
    'video-editor/.gitignore',
    'video-editor/src/index.ts',
    'video-editor/src/Root.tsx',
    'video-editor/src/index.css',
    'video-editor/src/shared/projectFile.ts',
    'video-editor/src/projects/example/000-hello/register.tsx',
    'video-editor/src/projects/example/000-hello/Hello.tsx',
  ],
  hyperframes: [
    'hyperframes-editor/package.json',
    'hyperframes-editor/.gitignore',
    'hyperframes-editor/projects/example/000-hello/index.html',
  ],
};

/** Everything the template ships — common files plus every engine's app. */
export const VIDEO_TEMPLATE_FILES = [
  ...VIDEO_COMMON_TEMPLATE_FILES,
  ...VIDEO_ENGINE_TEMPLATE_FILES.remotion,
  ...VIDEO_ENGINE_TEMPLATE_FILES.hyperframes,
] as const;

/** What a scaffold for `engine` puts on disk (before `video.config.json`). */
export function scaffoldManifest(engine: VideoEngine): string[] {
  return [...VIDEO_COMMON_TEMPLATE_FILES, ...VIDEO_ENGINE_TEMPLATE_FILES[engine]];
}

/** Empty on purpose — git cannot track an empty folder, so the scaffold creates them. */
export const VIDEO_ASSET_DIRS = ['audio', 'fonts', 'images', 'logos', 'video'] as const;

/** The example project Setup Video opens Studio on. */
export const VIDEO_EXAMPLE_PROJECT_ID = 'example/000-hello';

export async function scaffoldVideoWorkspace(
  templateDir: string,
  dest: string,
  engine: VideoEngine = DEFAULT_VIDEO_ENGINE,
): Promise<GitOpResult<void>> {
  const appDirName = VIDEO_ENGINE_INFO[engine].appDir;
  if (!existsSync(join(templateDir, appDirName, 'package.json'))) {
    return failure(`The video template is missing from this build (${templateDir}).`);
  }
  if (existsSync(dest)) {
    let entries: string[] = [];
    try {
      entries = await readdir(dest);
    } catch {
      return failure(`${dest} exists and cannot be read.`);
    }
    if (entries.length > 0) return failure(`${dest} already exists and is not empty.`);
  }
  try {
    await mkdir(dest, { recursive: true });
    const skipped = otherEngineDirs(engine).map((dir) => join(templateDir, dir));
    // `dest` is known empty here; `force: false` still never overwrites a file.
    await cp(templateDir, dest, {
      recursive: true,
      force: false,
      filter: (source) => !skipped.includes(source),
    });
    for (const dir of VIDEO_ASSET_DIRS) await mkdir(join(dest, 'assets', dir), { recursive: true });
    await writeVideoEngine(dest, engine);
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
  return ok();
}
