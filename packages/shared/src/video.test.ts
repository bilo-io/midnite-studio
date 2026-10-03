import { describe, expect, it } from 'vitest';

import {
  changelogEntry,
  parseIterations,
  studioCompositionUrl,
  VideoCompositionSchema,
  VideoProjectFileSchema,
  VideoProjectSchema,
  VideoRenderProgressEventSchema,
  VideoRenderSchema,
  VideoRenderStatusSchema,
  VideoStudioChangedEventSchema,
  VideoStudioStatusSchema,
  VideoToolBinarySchema,
  VideoToolchainSchema,
  VIDEO_RENDER_STATUSES,
  VIDEO_SKILLS,
  VIDEO_SKILL_RENAMES,
} from './video';

describe('VideoProjectFileSchema', () => {
  it("round-trips ekko-videos' own project.json shape verbatim", () => {
    const file = {
      id: '01-cop31-showreel',
      title: 'COP31 showreel',
      composition: 'COP31Showreel',
      source: 'input/ekko-original-1080.mp4',
      brief: 'input/BRIEF.md',
      script: 'EDITORIAL_SCRIPT.md',
    };
    expect(VideoProjectFileSchema.parse(file)).toEqual(file);
  });

  it('rejects a project missing a required field', () => {
    expect(() => VideoProjectFileSchema.parse({ id: 'x', title: 'X' })).toThrow();
  });
});

describe('VideoProjectSchema', () => {
  it('parses a valid project as the file shape plus valid: true', () => {
    const project = {
      valid: true as const,
      id: '01-cop31-showreel',
      title: 'COP31 showreel',
      composition: 'COP31Showreel',
      source: 'input/original.mp4',
      brief: 'input/BRIEF.md',
      script: 'EDITORIAL_SCRIPT.md',
    };
    expect(VideoProjectSchema.parse(project)).toEqual(project);
  });

  it("parses an invalid project by folder id and parse error, never a crash", () => {
    const project = { valid: false as const, id: '02-broken', error: 'Unexpected token in JSON' };
    expect(VideoProjectSchema.parse(project)).toEqual(project);
  });

  it('rejects a valid:true entry missing the file fields', () => {
    expect(() => VideoProjectSchema.parse({ valid: true, id: 'x' })).toThrow();
  });
});

describe('VideoCompositionSchema', () => {
  it('round-trips a composition', () => {
    const comp = { id: 'COP31Showreel', width: 1920, height: 1080, fps: 30, durationInFrames: 900 };
    expect(VideoCompositionSchema.parse(comp)).toEqual(comp);
  });

  it('rejects a non-positive dimension', () => {
    expect(() =>
      VideoCompositionSchema.parse({ id: 'x', width: 0, height: 1080, fps: 30, durationInFrames: 900 }),
    ).toThrow();
  });
});

describe('VideoRenderStatusSchema', () => {
  it('accepts exactly the five documented states', () => {
    expect(VIDEO_RENDER_STATUSES).toEqual(['queued', 'rendering', 'succeeded', 'failed', 'cancelled']);
    for (const status of VIDEO_RENDER_STATUSES) {
      expect(VideoRenderStatusSchema.parse(status)).toBe(status);
    }
  });

  it('rejects an unrecognised status', () => {
    expect(() => VideoRenderStatusSchema.parse('running')).toThrow();
  });
});

describe('VideoRenderSchema', () => {
  it('round-trips a render with an output file', () => {
    const render = {
      id: 'r1',
      projectId: '01-cop31-showreel',
      compositionId: 'COP31Showreel',
      status: 'succeeded' as const,
      outputFile: 'v1-first-cut.mp4',
      startedAt: 1,
      endedAt: 2,
    };
    expect(VideoRenderSchema.parse(render)).toEqual(render);
  });

  it('round-trips a queued render with no output file or end time yet', () => {
    const render = { id: 'r1', projectId: 'p1', compositionId: 'c1', status: 'queued' as const, startedAt: 1 };
    expect(VideoRenderSchema.parse(render)).toEqual(render);
  });
});

describe('VideoStudioStatusSchema', () => {
  it('parses each of the four states', () => {
    expect(VideoStudioStatusSchema.parse({ state: 'stopped' })).toEqual({ state: 'stopped' });
    expect(VideoStudioStatusSchema.parse({ state: 'starting' })).toEqual({ state: 'starting' });
    expect(VideoStudioStatusSchema.parse({ state: 'running', url: 'http://localhost:3001' })).toEqual({
      state: 'running',
      url: 'http://localhost:3001',
    });
    expect(VideoStudioStatusSchema.parse({ state: 'failed', stderr: ['Error: EADDRINUSE'] })).toEqual({
      state: 'failed',
      stderr: ['Error: EADDRINUSE'],
    });
  });

  it('rejects `running` with no url — a studio with no URL yet is a different state', () => {
    expect(() => VideoStudioStatusSchema.parse({ state: 'running' })).toThrow();
  });

  it('rejects `failed` with no stderr — the whole point is surfacing why it died', () => {
    expect(() => VideoStudioStatusSchema.parse({ state: 'failed' })).toThrow();
  });
});

describe('VideoToolBinarySchema / VideoToolchainSchema', () => {
  it('round-trips a found and a missing binary', () => {
    expect(VideoToolBinarySchema.parse({ found: true, path: '/usr/local/bin/node' })).toEqual({
      found: true,
      path: '/usr/local/bin/node',
    });
    expect(VideoToolBinarySchema.parse({ found: false, reason: 'not on PATH' })).toEqual({
      found: false,
      reason: 'not on PATH',
    });
  });

  it('round-trips a toolchain with no remotionVersion yet (no project inspected)', () => {
    const toolchain = {
      node: { found: true as const, path: '/usr/local/bin/node' },
      npx: { found: true as const, path: '/usr/local/bin/npx' },
      skills: {
        videoWriteScript: { found: true as const, path: '/videos/.claude/skills/midnite-media-video-write-editorial-script/SKILL.md' },
        videoExecuteScript: { found: false as const, reason: 'not found' },
      },
    };
    expect(VideoToolchainSchema.parse(toolchain)).toEqual(toolchain);
  });

  it('rejects a toolchain missing the skills field — Theme F expects it on every response', () => {
    expect(() =>
      VideoToolchainSchema.parse({
        node: { found: true, path: '/usr/local/bin/node' },
        npx: { found: true, path: '/usr/local/bin/npx' },
      }),
    ).toThrow();
  });
});

describe('VIDEO_SKILLS', () => {
  it('names the exact two /command invocations the app types into a terminal', () => {
    expect(VIDEO_SKILLS).toEqual({
      videoWriteScript: '/midnite-media-video-write-editorial-script',
      videoExecuteScript: '/midnite-media-video-execute-editorial-script',
    });
  });
});

describe('VIDEO_SKILL_RENAMES', () => {
  it('maps each pre-namespace directory to the name VIDEO_SKILLS now invokes', () => {
    for (const [legacy, next] of Object.entries(VIDEO_SKILL_RENAMES)) {
      expect(legacy.startsWith('midnite-')).toBe(false);
      expect(Object.values(VIDEO_SKILLS)).toContain(`/${next}`);
    }
  });
});

describe('push event schemas', () => {
  it('round-trips a studio-changed event', () => {
    const event = { projectId: 'p1', status: { state: 'running' as const, url: 'http://localhost:3000' } };
    expect(VideoStudioChangedEventSchema.parse(event)).toEqual(event);
  });

  it('round-trips a render-progress event, progress optional', () => {
    const withProgress = { renderId: 'r1', projectId: 'p1', status: 'rendering' as const, progress: 0.42 };
    expect(VideoRenderProgressEventSchema.parse(withProgress)).toEqual(withProgress);

    const withoutProgress = { renderId: 'r1', projectId: 'p1', status: 'queued' as const };
    expect(VideoRenderProgressEventSchema.parse(withoutProgress)).toEqual(withoutProgress);
  });

  it('rejects a progress fraction outside 0-1', () => {
    expect(() =>
      VideoRenderProgressEventSchema.parse({ renderId: 'r1', projectId: 'p1', status: 'rendering', progress: 1.5 }),
    ).toThrow();
  });
});

describe('parseIterations (Phase 99 Theme D)', () => {
  it('orders newest first and skips non-iterations', () => {
    const its = parseIterations(['v1-smoke.mp4', 'CHANGELOG.md', 'v10-final.mp4', 'v2.mp4', '_stills']);
    expect(its.map((i) => i.filename)).toEqual(['v10-final.mp4', 'v2.mp4', 'v1-smoke.mp4']);
    expect(its[1]).toMatchObject({ version: 2, label: null, ext: 'mp4' });
  });

  it('marks pinned variants sharing one version, unlabelled first', () => {
    const its = parseIterations(['v3-low.mp4', 'v3-high.mp4', 'v3.mp4', 'v2-a.webm']);
    expect(its.map((i) => i.filename)).toEqual(['v3.mp4', 'v3-high.mp4', 'v3-low.mp4', 'v2-a.webm']);
    expect(its.map((i) => i.sharesVersion)).toEqual([true, true, true, false]);
  });

  it('accepts every codec extension the render dialog produces', () => {
    expect(parseIterations(['v1.webm', 'v2.mov', 'v3.gif', 'v4.avi']).map((i) => i.ext)).toEqual([
      'gif',
      'mov',
      'webm',
    ]);
  });
});

describe('changelogEntry', () => {
  const log = '# X — render history\n\n## v1-smoke — 2026-09-01\n\n- first\n\n## v2-scored — 2026-09-02\n\n- music\n';
  it('returns the section for an iteration', () => {
    expect(changelogEntry(log, 'v2-scored.mp4')).toBe('## v2-scored — 2026-09-02\n\n- music');
    expect(changelogEntry(log, 'v1-smoke.mp4')).toBe('## v1-smoke — 2026-09-01\n\n- first');
  });
  it('is null when absent', () => {
    expect(changelogEntry(log, 'v9.mp4')).toBeNull();
  });
});

describe('studioCompositionUrl', () => {
  it('deep-links the composition', () => {
    expect(studioCompositionUrl('http://localhost:3000/', 'Main')).toBe('http://localhost:3000/Main');
    expect(studioCompositionUrl('http://localhost:3000', null)).toBe('http://localhost:3000');
  });
});
