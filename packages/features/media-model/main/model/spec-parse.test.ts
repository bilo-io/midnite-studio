import { describe, expect, it } from 'vitest';

import { buildRepairPrompt, buildSpecPrompt } from './prompts';
import { describeIssues, extractJson, normalizeSpec, parseSpec } from './spec-parse';

const GOOD = { name: 'stool', parts: [{ name: 'seat', shape: 'cylinder', radiusTop: 0.2, radiusBottom: 0.2, height: 0.05, position: [0, 0.4, 0], color: '#aa7744' }] };

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson(JSON.stringify(GOOD))).toEqual(GOOD);
  });

  it('reads an object out of prose and a fence', () => {
    const reply = `Sure! Here is your model:\n\`\`\`json\n${JSON.stringify(GOOD)}\n\`\`\`\nHope that helps.`;
    expect(extractJson(reply)).toEqual(GOOD);
  });

  it('is not fooled by braces inside strings', () => {
    expect(extractJson('{"name":"a } b { c","parts":[]}')).toEqual({ name: 'a } b { c', parts: [] });
  });

  it('reports an unclosed or missing object', () => {
    expect(() => extractJson('{"name": "x", "parts": [')).toThrow(/cut off/);
    expect(() => extractJson('no json here')).toThrow(/no JSON/);
  });
});

describe('parseSpec', () => {
  it('accepts a valid reply', () => {
    const outcome = parseSpec(JSON.stringify(GOOD));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.spec.parts[0]!.shape).toBe('cylinder');
  });

  it('forgives the habits small models have', () => {
    const outcome = parseSpec(
      JSON.stringify({
        objects: [
          { type: 'Cube', pos: ['1', 0, 0], size: 2, colour: 'Red' },
          { kind: 'ball', radius: '0.5', color: 'ABC' },
          { shape: 'pyramid', radiusBottom: 1, height: 2 },
          { shape: 'extrude', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], height: 1 },
        ],
      }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const [cube, ball, cone, extrude] = outcome.spec.parts;
    expect(cube).toMatchObject({ shape: 'box', position: [1, 0, 0], size: [2, 2, 2], color: '#cc3333' });
    expect(ball).toMatchObject({ shape: 'sphere', radius: 0.5, color: '#abc' });
    expect(cone).toMatchObject({ shape: 'cone', radius: 1 });
    expect(extrude).toMatchObject({ shape: 'extrude', outline: [[0, 0], [1, 0], [0, 1]] });
  });

  it('wraps a bare array of parts', () => {
    expect(normalizeSpec([{ shape: 'sphere', radius: 1 }])).toEqual({ parts: [{ shape: 'sphere', radius: 1 }] });
  });

  it('turns schema failures into short, actionable bullets', () => {
    const outcome = parseSpec(JSON.stringify({ parts: [{ shape: 'box', size: [0, 1, 1] }, { shape: 'teapot' }] }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('parts.0.size.0');
    expect(outcome.error.split('\n').every((line) => line.startsWith('- '))).toBe(true);
  });

  it('caps the number of issues it lists', () => {
    const issues = Array.from({ length: 12 }, (_, i) => ({ code: 'custom' as const, path: ['parts', i], message: 'bad' }));
    expect(describeIssues(issues).split('\n')).toHaveLength(9);
    expect(describeIssues(issues)).toContain('and 4 more');
  });
});

describe('prompts', () => {
  it('puts the request and the image description in the brief', () => {
    const prompt = buildSpecPrompt({ prompt: 'a lamp', imageDescription: 'a brass lamp with a green shade' });
    expect(prompt).toContain('Request: a lamp');
    expect(prompt).toContain('a brass lamp with a green shade');
    expect(prompt).toContain('"lathe"');
  });

  it('works from an image alone', () => {
    const prompt = buildSpecPrompt({ prompt: '', imageDescription: 'a red mug' });
    expect(prompt).not.toContain('Request:');
    expect(prompt).toContain('a red mug');
  });

  it('feeds the validation errors back for a repair', () => {
    const prompt = buildRepairPrompt({ previousReply: '{"parts":[]}', error: '- parts: Array must contain at least 1 element(s)' });
    expect(prompt).toContain('Array must contain at least 1');
    expect(prompt).toContain('{"parts":[]}');
  });
});
