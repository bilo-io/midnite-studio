// Phase 113 Theme C — one fixture per app-suite layer rule in eslint.config.mjs.
//
// The layer rules are `no-restricted-imports` patterns, and a pattern that stops
// matching fails silently: nothing imports across the line today, so nothing
// lints red, and the rule could be dead for months before the first import that
// it should have caught lands. Each case below lints a one-line import, at a
// virtual path inside the layer it tests, against the repo's real config — so a
// typo in a glob, a block that a later block replaces (flat config does not
// merge `no-restricted-imports`), or a `files:` pattern that no longer matches
// the package layout turns this file red.
//
// No file is written: `lintText` takes the path only to pick the config blocks.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {ESLint} */
let eslint;

// The first lint loads the config and typescript-eslint cold (~5-10 s); warm it here, under a
// hook timeout sized for that, so the first case is not the one that pays it against 5 s.
beforeAll(async () => {
  eslint = new ESLint({ cwd: repoRoot });
  await eslint.lintText('export {};\n', { filePath: path.join(repoRoot, 'packages/frame/src/warm-up.ts'), warnIgnored: true });
}, 60_000);

/**
 * Lint `import … from '<specifier>'` as if it sat at `file` (repo-relative) and
 * return the no-restricted-imports messages it produced.
 */
async function restrictedImports(file, specifier) {
  const code = `import * as dep from '${specifier}';\nexport default dep;\n`;
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, file), warnIgnored: true });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports').map((m) => m.message);
}

// Representative files, one per layer.
const FEATURE_RENDERER = 'packages/features/optimizer/renderer/optimizer-view.tsx';
const FEATURE_RENDERER_NESTED = 'packages/features/optimizer/renderer/tabs/storage-tab.tsx';
const FEATURE_MAIN = 'packages/features/optimizer/main/index.ts';
const FEATURE_MANIFEST = 'packages/features/optimizer/manifest.ts';
const FRAME = 'packages/frame/src/layout/content-box.ts';
const RUNTIME = 'packages/runtime/src/feature-main.ts';
const APP = 'packages/app/src/compose/studio-providers.tsx';
const APP_TEST = 'packages/app/src/compose/optimizer/storage-tab.test.tsx';
const SUITE_APP = 'apps/browser/src/browser-app.tsx';
const DESKTOP = 'packages/desktop/src/main/ipc/optimizer-handlers.ts';
// Phase 113 Theme Q: media is one folder split into a shell and tab packages that never import each other.
const MEDIA_CORE = 'packages/features/media-core/renderer/media-shell.tsx';
const MEDIA_DOCS = 'packages/features/media-docs/renderer/docs-tab.tsx';
const MEDIA_IMAGES = 'packages/features/media-images/renderer/image-tab.tsx';
const MEDIA_DOCS_MAIN = 'packages/features/media-docs/main/index.ts';
const MEDIA_AUDIO = 'packages/features/media-audio/renderer/audio-tab.tsx';
const MEDIA_VIDEO_MAIN = 'packages/features/media-video/main/video-service.ts';
const SLIDES = 'packages/features/slides/renderer/deck.tsx';
// Phase 113 Theme O slice 2: the git graph and diff live in the frame; Coder's git main is an app's own.
const FRAME_GRAPH = 'packages/frame/src/graph/ci-cell.tsx';
const FRAME_DIFF = 'packages/frame/src/diff/diff-cell.tsx';
const CODER_MAIN = 'packages/modules/coder/main/git.ts';
// Phase 113 Theme G: Studio's composition, and the two entries that hand over to its internals.
const STUDIO_COMPOSITION = 'apps/studio/src/composition.ts';
const STUDIO_RENDERER_ENTRY = 'apps/studio/entry/renderer.ts';
const STUDIO_MAIN_ENTRY = 'apps/studio/entry/main.ts';
// Phase 124 Theme B: the module layer, between features and apps.
const MODULE_RENDERER = 'packages/modules/coder/renderer/coder-view.tsx';
const MODULE_MAIN = 'packages/modules/coder/main/index.ts';
const MODULE_MANIFEST = 'packages/modules/coder/manifest.ts';

/** [description, file, import specifier, substring the firing message must contain] */
const REJECTED = [
  // --- The three rules the phase doc's Verification names ------------------
  ['a feature imports an app (package name)', FEATURE_RENDERER, '@midnite/studio-app/store/ui-store', 'Nothing below an app imports one'],
  ['a feature imports an app (relative path)', FEATURE_RENDERER, '../../../app/src/store/ui-store', 'Nothing below an app imports one'],
  ['a feature imports another feature (package name)', FEATURE_RENDERER, '@midnite/studio-feature-notes/renderer', 'never imports another feature'],
  ['a feature imports another feature (relative path)', FEATURE_RENDERER_NESTED, '../../../notes/renderer/notes-view', 'never imports another feature'],
  ['the frame imports a feature (package name)', FRAME, '@midnite/studio-feature-optimizer/renderer', 'The frame never imports a feature'],
  ['the frame imports a feature (relative path)', FRAME, '../../../features/optimizer/renderer/index', 'The frame never imports a feature'],

  // --- The rest of the layer graph -----------------------------------------
  ['the frame imports an app', FRAME, '@midnite/studio-app', 'Nothing below an app imports one'],
  ['the frame imports the runtime', FRAME, '@midnite/studio-runtime', 'main-process only'],
  ['a feature renderer imports the runtime', FEATURE_RENDERER, '@midnite/studio-runtime', 'main-process only'],
  ['a feature renderer imports its own main half', FEATURE_RENDERER, '../main/index', 'never imports its own main half'],
  ['a feature renderer imports git-engine (renderer rules apply)', FEATURE_RENDERER, '@midnite/studio-git-engine', ''],
  ['a feature main half imports electron', FEATURE_MAIN, 'electron', 'FeatureMainContext'],
  ['a feature main half imports an app', FEATURE_MAIN, '@midnite/studio-app', 'Nothing below an app imports one'],
  ['a feature main half imports another feature', FEATURE_MAIN, '@midnite/studio-feature-notes/main', 'never imports another feature'],
  ['a feature main half imports the frame', FEATURE_MAIN, '@midnite/studio-frame', 'no renderer'],
  ['a feature main half imports React', FEATURE_MAIN, 'react', 'no renderer'],
  ['a feature main half imports desktop', FEATURE_MAIN, '@midnite/studio-desktop', 'Desktop is Studio'],
  ['a feature main half imports its own renderer half', FEATURE_MAIN, '../renderer/index', 'never imports its own renderer half'],
  ['a feature manifest imports anything but shared', FEATURE_MANIFEST, 'react', 'pure data'],
  ['a feature manifest imports its own renderer half', FEATURE_MANIFEST, './renderer/index', 'pure data'],
  ['the runtime imports a feature', RUNTIME, '@midnite/studio-feature-optimizer/main', 'The runtime never imports a feature'],
  ['the runtime imports the frame', RUNTIME, '@midnite/studio-frame', 'no renderer'],
  ['the runtime imports an app', RUNTIME, '@midnite/studio-app', 'Nothing below an app imports one'],
  ['the runtime imports desktop', RUNTIME, '@midnite/studio-desktop', 'Desktop is Studio'],
  ['the runtime imports node-pty (Theme D)', RUNTIME, 'node-pty', 'only in the broker process'],
  ["an app imports a feature's main half", APP, '@midnite/studio-feature-optimizer/main', "feature's main half runs in the main process"],
  ['an app imports the runtime', APP, '@midnite/studio-runtime', 'main-process only'],
  ["an app's production code imports a feature's testing entry", APP, '@midnite/studio-feature-optimizer/renderer/testing', 'composition tests only'],
  ['desktop imports the frame', DESKTOP, '@midnite/studio-frame', 'never imports renderer code'],
  ["desktop imports a feature's renderer half", DESKTOP, '@midnite/studio-feature-optimizer/renderer', 'never imports renderer code'],

  // --- Phase 113 Theme E: no app runs its own updater ----------------------
  ['a feature main half imports electron-updater', FEATURE_MAIN, 'electron-updater', 'No app runs its own updater'],
  ['a feature renderer imports electron-updater', FEATURE_RENDERER, 'electron-updater', 'No app runs its own updater'],
  ['the frame imports electron-updater', FRAME, 'electron-updater', 'No app runs its own updater'],
  ['the runtime imports electron-updater', RUNTIME, 'electron-updater', 'No app runs its own updater'],

  // --- Phase 113 suite apps boundary rules ---------------------------------
  ['a suite app imports electron-updater', SUITE_APP, 'electron-updater', 'No app runs its own updater'],
  ['a suite app imports another app', SUITE_APP, '@midnite/studio-app', 'An app never imports another app'],
  ['a suite app imports the runtime', SUITE_APP, '@midnite/studio-runtime', 'main-process only'],
  ["a suite app imports a feature's main half", SUITE_APP, '@midnite/studio-feature-optimizer/main', "feature's main half runs in the main process"],
  ['a feature imports a suite app (relative path)', FEATURE_RENDERER, '../../../../apps/browser/src/index', 'Nothing below an app imports one'],
  // --- Theme Q: the media tab-registry contract lives in the frame, not in media-core --------
  ['a media tab imports the media shell (package name)', MEDIA_DOCS, '@midnite/studio-feature-media-core/renderer', 'never imports another feature'],
  ['a media tab imports the media shell (relative path)', MEDIA_DOCS, '../../media-core/renderer/kit', 'never imports another feature'],
  ['a media tab imports a sibling tab (package name)', MEDIA_IMAGES, '@midnite/studio-feature-media-docs/renderer', 'never imports another feature'],
  ['a media tab imports a sibling tab (relative path)', MEDIA_IMAGES, '../../media-docs/renderer/docs-tab', 'never imports another feature'],
  ['the media shell imports a tab (package name)', MEDIA_CORE, '@midnite/studio-feature-media-images/renderer', 'never imports another feature'],
  ['the media shell imports a tab (relative path)', MEDIA_CORE, '../../media-images/renderer/index', 'never imports another feature'],
  ["a media tab's main half imports media-core's main half", MEDIA_DOCS_MAIN, '@midnite/studio-feature-media-core/main', 'never imports another feature'],
  // --- Theme Q slice 2: Audio, Video and Slides keep to the same rules ----------------------
  ['the audio tab imports a sibling tab (package name)', MEDIA_AUDIO, '@midnite/studio-feature-media-video/renderer', 'never imports another feature'],
  ["the video service imports electron (it is injected)", MEDIA_VIDEO_MAIN, 'electron', 'FeatureMainContext'],
  ['the deck imports an app (its overlay rules come through the host port)', SLIDES, '@midnite/studio-app/components/use-dismiss', 'Nothing below an app imports one'],
  ['the deck imports a feature (package name)', SLIDES, '@midnite/studio-feature-media-docs/renderer', 'never imports another feature'],
  // --- Theme O slice 2: the graph's CI glyph and the diff's highlighter come through GitHost -------
  ['the frame graph imports the forge feature (its CI glyph is a host member)', FRAME_GRAPH, '@midnite/studio-feature-forge/renderer', 'The frame never imports a feature'],
  ["the frame graph imports Studio's ui-store (relative path)", FRAME_GRAPH, '../../../app/src/store/ui-store', 'Nothing below an app imports one'],
  ["the frame diff imports Studio's highlighter (package name)", FRAME_DIFF, '@midnite/studio-app/lib/highlighter', 'Nothing below an app imports one'],
  ['the frame graph imports the runtime', FRAME_GRAPH, '@midnite/studio-runtime', 'main-process only'],
  // --- Theme G: Studio's entries take one seam each; its composition takes none ------------------
  ["Studio's composition imports its renderer internals", STUDIO_COMPOSITION, '@midnite/studio-app/boot', 'An app never imports another app'],
  ["Studio's renderer entry reaches past the boot seam", STUDIO_RENDERER_ENTRY, '@midnite/studio-app/store/ui-store', 'nothing deeper'],
  ["Studio's renderer entry reaches past the boot seam (relative path)", STUDIO_RENDERER_ENTRY, '../../../packages/app/src/app', 'nothing deeper'],
  ["Studio's renderer entry imports another app", STUDIO_RENDERER_ENTRY, '@midnite/app-browser', 'never imports another app'],
  ["Studio's renderer entry imports the main seam", STUDIO_RENDERER_ENTRY, '@midnite/studio-desktop/main', 'never imports the git/database/knowledge engine'],
  ["Studio's renderer entry imports electron", STUDIO_RENDERER_ENTRY, 'electron', 'no node integration'],
  ["Studio's renderer entry imports the runtime", STUDIO_RENDERER_ENTRY, '@midnite/studio-runtime', 'main-process only'],
  ["Studio's main entry reaches past the main seam", STUDIO_MAIN_ENTRY, '@midnite/studio-desktop/ipc/handle', 'nothing deeper'],
  ["Studio's main entry reaches past the main seam (relative path)", STUDIO_MAIN_ENTRY, '../../../packages/desktop/src/main/window', 'nothing deeper'],
  ["Studio's main entry imports the renderer seam", STUDIO_MAIN_ENTRY, '@midnite/studio-app/boot', 'nothing deeper'],
  ["Studio's main entry imports another app", STUDIO_MAIN_ENTRY, '@midnite/app-agents', 'never imports another app'],
  ["Studio's main entry imports the frame", STUDIO_MAIN_ENTRY, '@midnite/studio-frame', 'A main-process module has no renderer'],
  ["Studio's main entry imports electron-updater", STUDIO_MAIN_ENTRY, 'electron-updater', 'No app runs its own updater'],

  // --- Phase 124 Theme B: modules sit above features and the frame, below apps ------------------
  ['a module imports another module (package name)', MODULE_RENDERER, '@midnite/studio-module-creator/renderer', 'never imports another module'],
  ['a module imports another module (relative path)', MODULE_RENDERER, '../../creator/renderer/index', 'never imports another module'],
  ["a module's main half imports another module's main half", MODULE_MAIN, '@midnite/studio-module-creator/main', 'never imports another module'],
  ['a module imports an app', MODULE_RENDERER, '@midnite/studio-app/store/ui-store', 'Nothing below an app imports one'],
  ['a module imports a suite app', MODULE_RENDERER, '../../../../apps/browser/src/index', 'Nothing below an app imports one'],
  ["a module's main half imports an app", MODULE_MAIN, '@midnite/app-browser', 'Nothing below an app imports one'],
  ['a module renderer imports electron', MODULE_RENDERER, 'electron', 'no node integration'],
  ["a module's main half imports electron", MODULE_MAIN, 'electron', 'FeatureMainContext'],
  ['a module renderer imports the runtime', MODULE_RENDERER, '@midnite/studio-runtime', 'main-process only'],
  ["a module renderer imports a feature's main half", MODULE_RENDERER, '@midnite/studio-feature-optimizer/main', "feature's main half runs in the main process"],
  ["a module's main half imports the frame", MODULE_MAIN, '@midnite/studio-frame', 'no renderer'],
  ['a module manifest imports anything but shared', MODULE_MANIFEST, '@midnite/studio-feature-optimizer', 'pure data'],
  ['a feature renderer imports a module (package name)', FEATURE_RENDERER, '@midnite/studio-module-coder/renderer', 'Nothing below an app imports a module'],
  ['a feature renderer imports a module (relative path)', FEATURE_RENDERER, '../../../modules/coder/renderer/index', 'Nothing below an app imports a module'],
  ['a feature main half imports a module', FEATURE_MAIN, '@midnite/studio-module-coder/main', 'Nothing below an app imports a module'],
  ['the frame imports a module (package name)', FRAME, '@midnite/studio-module-coder/renderer', 'Nothing below an app imports a module'],
  ['the frame imports a module (relative path)', FRAME, '../../../modules/coder/renderer/index', 'Nothing below an app imports a module'],
  ['the runtime imports a module', RUNTIME, '@midnite/studio-module-coder/main', 'Nothing below an app imports a module'],
];

/** [description, file, import specifier] — must produce no no-restricted-imports message. */
const ALLOWED = [
  ['an app imports a feature renderer half', APP, '@midnite/studio-feature-optimizer/renderer'],
  ['an app imports the frame', APP, '@midnite/studio-frame'],
  ['a suite app imports the frame', SUITE_APP, '@midnite/studio-frame'],
  ['a suite app imports a feature renderer half', SUITE_APP, '@midnite/studio-feature-optimizer/renderer'],
  ['a suite app imports shared', SUITE_APP, '@midnite/studio-shared'],
  ["an app's composition test imports a feature's testing entry", APP_TEST, '@midnite/studio-feature-optimizer/renderer/testing'],
  ['a feature renderer imports the frame', FEATURE_RENDERER, '@midnite/studio-frame'],
  ['a feature renderer imports shared', FEATURE_RENDERER, '@midnite/studio-shared'],
  ['a feature renderer imports its own files', FEATURE_RENDERER_NESTED, '../store/optimizer-store'],
  ['a feature renderer imports its own manifest', FEATURE_RENDERER, '../manifest'],
  ['a feature main half imports the runtime', FEATURE_MAIN, '@midnite/studio-runtime'],
  ['a feature main half imports shared', FEATURE_MAIN, '@midnite/studio-shared'],
  ['a feature main half imports its own manifest', FEATURE_MAIN, '../manifest'],
  ['a feature manifest imports shared', FEATURE_MANIFEST, '@midnite/studio-shared'],
  ['the frame imports shared', FRAME, '@midnite/studio-shared'],
  ['the runtime imports electron', RUNTIME, 'electron'],
  ['the runtime imports shared', RUNTIME, '@midnite/studio-shared'],
  ["desktop imports a feature's main half", DESKTOP, '@midnite/studio-feature-optimizer/main'],
  ['desktop imports the runtime', DESKTOP, '@midnite/studio-runtime'],
  // The suite's one updater, and Studio's until Theme G repoints it.
  ['the launcher imports electron-updater', 'apps/launcher/src/main/updater.ts', 'electron-updater'],
  ["Studio's update service imports electron-updater", 'packages/desktop/src/main/update-service.ts', 'electron-updater'],
  ["desktop imports one of the runtime's broker files (Theme D)", DESKTOP, '@midnite/studio-runtime/broker/protocol'],
  // Theme Q: what a media tab composes instead — the frame's registry contract and kit port.
  ['a media tab imports the frame (descriptor type + media kit)', MEDIA_DOCS, '@midnite/studio-frame'],
  ['the media shell imports the frame (the contract it implements)', MEDIA_CORE, '@midnite/studio-frame'],
  ['an app imports the media shell and a media tab', APP, '@midnite/studio-feature-media-docs/renderer'],
  // Theme O slice 2: an app composes the frame's graph and diff entries; Coder's main reads git itself.
  ['an app imports the frame graph entry', APP, '@midnite/studio-frame/graph'],
  ['a suite app imports the frame diff entry', SUITE_APP, '@midnite/studio-frame/diff'],
  ["Coder's git main imports git-engine", CODER_MAIN, '@midnite/studio-git-engine'],
  ["Coder's git main imports the runtime", CODER_MAIN, '@midnite/studio-runtime'],
  // Theme G: the one seam each Studio entry hands over through.
  ["Studio's renderer entry mounts its shell", STUDIO_RENDERER_ENTRY, '@midnite/studio-app/boot'],
  ["Studio's main entry starts its main process", STUDIO_MAIN_ENTRY, '@midnite/studio-desktop/main'],
  // Phase 124 Theme B: an app composes modules; a module composes features, the frame and shared.
  ['a suite app imports a module renderer half', SUITE_APP, '@midnite/studio-module-coder/renderer'],
  ["Studio's composition imports a module", STUDIO_COMPOSITION, '@midnite/studio-module-coder/renderer'],
  ["a module imports a feature's renderer half", MODULE_RENDERER, '@midnite/studio-feature-optimizer/renderer'],
  ['a module renderer imports the frame', MODULE_RENDERER, '@midnite/studio-frame'],
  ['a module renderer imports shared', MODULE_RENDERER, '@midnite/studio-shared'],
  ['a module renderer imports its own files', MODULE_RENDERER, '../manifest'],
  ['a module main half imports the runtime', MODULE_MAIN, '@midnite/studio-runtime'],
  ["a module's main half imports a feature's main half", MODULE_MAIN, '@midnite/studio-feature-optimizer/main'],
  ['a module manifest imports shared', MODULE_MANIFEST, '@midnite/studio-shared'],
];

describe('eslint layer boundaries (Phase 113 Theme C)', () => {
  it.each(REJECTED)('rejects: %s', async (_desc, file, specifier, expected) => {
    const messages = await restrictedImports(file, specifier);
    expect(messages.length, `no no-restricted-imports error for '${specifier}' in ${file}`).toBeGreaterThan(0);
    if (expected) expect(messages.join('\n')).toContain(expected);
  });

  it.each(ALLOWED)('allows: %s', async (_desc, file, specifier) => {
    expect(await restrictedImports(file, specifier)).toEqual([]);
  });
});
