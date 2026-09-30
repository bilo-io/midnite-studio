import { cp, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { failure, ok, type GitOpResult } from '@midnite/studio-shared';

/**
 * Setup Video (Phase 99 Theme D) — copies the checked-in
 * `templates/media-video/` skeleton into `<repo>/.midnite/media/video/`.
 * No network clone: the template ships in the app bundle (`extraResources`).
 *
 * `VIDEO_TEMPLATE_FILES` is the manifest a scaffold needs; the test asserts
 * every entry exists in the checked-in template, so trimming the template
 * cannot silently break Setup Video.
 */
export const VIDEO_TEMPLATE_FILES = [
  'README.md',
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
  'projects/_template/project.json',
  'projects/_template/README.md',
  'projects/_template/input/BRIEF.md',
  'projects/example/000-hello/project.json',
  'projects/example/000-hello/input/BRIEF.md',
  'scripts/render.mjs',
  'scripts/sync-assets.mjs',
  'scripts/projects.mjs',
  '.claude/skills/video-write-editorial-script/SKILL.md',
  '.claude/skills/video-execute-editorial-script/SKILL.md',
] as const;

/** Empty on purpose — git cannot track an empty folder, so the scaffold creates them. */
export const VIDEO_ASSET_DIRS = ['audio', 'fonts', 'images', 'logos', 'video'] as const;

/** The example project Setup Video opens Studio on. */
export const VIDEO_EXAMPLE_PROJECT_ID = 'example/000-hello';

export async function scaffoldVideoWorkspace(templateDir: string, dest: string): Promise<GitOpResult<void>> {
  if (!existsSync(join(templateDir, 'video-editor', 'package.json'))) {
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
  await mkdir(dest, { recursive: true });
  await cp(templateDir, dest, { recursive: true, errorOnExist: true, force: false });
  for (const dir of VIDEO_ASSET_DIRS) await mkdir(join(dest, 'assets', dir), { recursive: true });
  return ok();
}
