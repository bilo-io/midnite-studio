import { describe, expect, it } from 'vitest';

import {
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
    };
    expect(VideoToolchainSchema.parse(toolchain)).toEqual(toolchain);
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
