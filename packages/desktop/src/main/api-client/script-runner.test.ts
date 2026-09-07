import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ScriptContext } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readEnvironment, saveEnvironment } from './environment-io';
import { runScript } from './script-runner';

function baseContext(overrides: Partial<ScriptContext> = {}): ScriptContext {
  return {
    environment: { baseUrl: 'https://api.example.com', apiKey: 'shh' },
    collectionVariables: { baseUrl: 'https://collection.example.com', teamId: 't-1' },
    request: { method: 'GET', url: 'https://api.example.com/users', headers: { 'X-Test': '1' } },
    response: {
      code: 200,
      status: 'OK',
      headers: { 'content-type': 'application/json' },
      body: '{"id":1,"name":"Ada"}',
      bodyIsJson: true,
    },
    ...overrides,
  };
}

function run(source: string, overrides: Partial<ScriptContext> = {}, timeoutMs = 1000) {
  return runScript(source, baseContext(overrides), timeoutMs);
}

describe('runScript — pm.test / pm.expect', () => {
  it('a passing pm.test records one passed result', () => {
    const result = run(`pm.test('one plus one', () => pm.expect(1 + 1).to.equal(2));`);
    expect(result.error).toBeNull();
    expect(result.results).toEqual([{ name: 'one plus one', passed: true }]);
  });

  it('a failing assertion inside pm.test becomes {passed:false, error}, and does not stop later tests', () => {
    const result = run(`
      pm.test('fails', () => pm.expect(1).to.equal(2));
      pm.test('still runs', () => pm.expect(1).to.equal(1));
    `);
    expect(result.error).toBeNull();
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({ name: 'fails', passed: false });
    expect(result.results[0]?.error).toMatch(/expected 1 to equal 2/);
    expect(result.results[1]).toEqual({ name: 'still runs', passed: true });
  });

  it('a throw inside pm.test (not just a failed pm.expect) is also a failed result, not a crashed run', () => {
    const result = run(`pm.test('throws', () => { throw new Error('boom'); });`);
    expect(result.error).toBeNull();
    expect(result.results).toEqual([{ name: 'throws', passed: false, error: 'boom' }]);
  });

  it('a throw outside any pm.test sets ScriptRun.error with zero results', () => {
    const result = run(`throw new Error('top-level boom');`);
    expect(result.error).toBe('top-level boom');
    expect(result.results).toEqual([]);
  });

  it('.to.equal is strict equality', () => {
    expect(run(`pm.test('t', () => pm.expect(1).to.equal(1));`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect(1).to.equal('1'));`).results[0]?.passed).toBe(false);
  });

  it('.to.eql is deep equality', () => {
    const source = `pm.test('t', () => pm.expect({a:[1,2],b:{c:3}}).to.eql({a:[1,2],b:{c:3}}));`;
    expect(run(source).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect({a:1}).to.eql({a:2}));`).results[0]?.passed).toBe(false);
  });

  it('.to.be.a checks type, including "array" via Array.isArray', () => {
    expect(run(`pm.test('t', () => pm.expect([1]).to.be.a('array'));`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect('x').to.be.a('string'));`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect('x').to.be.a('array'));`).results[0]?.passed).toBe(false);
  });

  it('.to.be.true/false/null/undefined', () => {
    expect(run(`pm.test('t', () => pm.expect(true).to.be.true);`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect(false).to.be.false);`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect(null).to.be.null);`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect(undefined).to.be.undefined);`).results[0]?.passed).toBe(true);
  });

  it('.to.be.above / .to.be.below', () => {
    expect(run(`pm.test('t', () => pm.expect(5).to.be.above(1));`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect(5).to.be.below(1));`).results[0]?.passed).toBe(false);
  });

  it('.to.include works for arrays, strings and objects', () => {
    expect(run(`pm.test('t', () => pm.expect([1,2,3]).to.include(2));`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect('hello world').to.include('world'));`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect({a:1,b:2}).to.include(2));`).results[0]?.passed).toBe(true);
  });

  it('.to.have.property checks own-key presence', () => {
    expect(run(`pm.test('t', () => pm.expect({a:1}).to.have.property('a'));`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect({a:1}).to.have.property('b'));`).results[0]?.passed).toBe(false);
  });

  it('.to.have.status reads pm.response.code', () => {
    const source = `pm.test('t', () => pm.expect(pm.response).to.have.status(200));`;
    expect(run(source).results[0]?.passed).toBe(true);
    const failing = `pm.test('t', () => pm.expect(pm.response).to.have.status(404));`;
    expect(run(failing).results[0]?.passed).toBe(false);
  });

  it('.not inverts any of the above', () => {
    expect(run(`pm.test('t', () => pm.expect(1).to.not.equal(2));`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect(false).to.not.be.true);`).results[0]?.passed).toBe(true);
    expect(run(`pm.test('t', () => pm.expect({a:1}).to.not.have.property('b'));`).results[0]?.passed).toBe(true);
  });

  it('an unsupported pm.expect method throws a named TypeError, not "is not a function"', () => {
    const result = run(`pm.test('t', () => pm.expect(1).to.match(/x/));`);
    expect(result.results[0]?.passed).toBe(false);
    expect(result.results[0]?.error).toMatch(/pm\.expect\(\.\.\.\)\.to\.match is not supported/);
  });
});

describe('runScript — pm.environment / pm.collectionVariables / pm.variables', () => {
  it('pm.environment.get reads the merged environment; .set records a mutation only', () => {
    const result = run(`
      pm.test('reads', () => pm.expect(pm.environment.get('baseUrl')).to.equal('https://api.example.com'));
      pm.environment.set('token', 'abc123');
    `);
    expect(result.results[0]?.passed).toBe(true);
    expect(result.mutations.environment).toEqual({ token: 'abc123' });
    expect(result.mutations.collectionVariables).toEqual({});
  });

  it('pm.collectionVariables.get/set mirrors the environment scope', () => {
    const result = run(`
      pm.test('reads', () => pm.expect(pm.collectionVariables.get('teamId')).to.equal('t-1'));
      pm.collectionVariables.set('runId', 'r-1');
    `);
    expect(result.results[0]?.passed).toBe(true);
    expect(result.mutations.collectionVariables).toEqual({ runId: 'r-1' });
  });

  it('pm.variables.get resolves environment over collection, same order interpolate.ts uses', () => {
    // baseUrl is set in both tiers in baseContext() — environment must win.
    const result = run(`pm.test('t', () => pm.expect(pm.variables.get('baseUrl')).to.equal('https://api.example.com'));`);
    expect(result.results[0]?.passed).toBe(true);
  });
});

describe('runScript — pm.request / pm.response', () => {
  it('pm.request is read-only draft data — method, url, headers.get', () => {
    const result = run(`
      pm.test('method', () => pm.expect(pm.request.method).to.equal('GET'));
      pm.test('url', () => pm.expect(pm.request.url).to.equal('https://api.example.com/users'));
      pm.test('header', () => pm.expect(pm.request.headers.get('x-test')).to.equal('1'));
    `);
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  it('pm.response exposes code/status/headers.get/json()/text()', () => {
    const result = run(`
      pm.test('code', () => pm.expect(pm.response.code).to.equal(200));
      pm.test('status', () => pm.expect(pm.response.status).to.equal('OK'));
      pm.test('header', () => pm.expect(pm.response.headers.get('Content-Type')).to.equal('application/json'));
      pm.test('json', () => pm.expect(pm.response.json().name).to.equal('Ada'));
      pm.test('text', () => pm.expect(pm.response.text()).to.include('"id":1'));
    `);
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  it('pm.response is null for a pre-request script (no response yet)', () => {
    const result = run(`pm.test('t', () => pm.expect(pm.response).to.equal(null));`, { response: null });
    expect(result.results[0]?.passed).toBe(true);
  });
});

describe('runScript — standard globals still work without being host own-properties', () => {
  it('JSON/Math/Date/Array/RegExp/Error resolve to the context\'s own intrinsics', () => {
    const result = run(`
      pm.test('json', () => pm.expect(JSON.parse('{"a":1}').a).to.equal(1));
      pm.test('math', () => pm.expect(Math.max(1, 2, 3)).to.equal(3));
      pm.test('date', () => pm.expect(new Date(2020, 0, 1).getFullYear()).to.equal(2020));
      pm.test('array', () => pm.expect([1, 2, 3].map((n) => n + 1)).to.eql([2, 3, 4]));
      pm.test('regexp', () => pm.expect(new RegExp('a').test('cat')).to.be.true);
      pm.test('error', () => pm.expect(new Error('hi').message).to.equal('hi'));
    `);
    expect(result.error).toBeNull();
    expect(result.results.every((r) => r.passed)).toBe(true);
  });
});

describe('runScript — console', () => {
  it('console.log/warn/error append into logs', () => {
    const result = run(`console.log('hello'); console.warn('careful'); console.error('bad');`);
    expect(result.logs).toEqual(['hello', '[warn] careful', '[error] bad']);
  });
});

describe('runScript — timeout', () => {
  it('while(true){} hits the timeout and returns an error rather than hanging the suite', () => {
    const result = run(`while (true) {}`, {}, 50);
    expect(result.error).toBe('Script timed out after 50 ms.');
    expect(result.results).toEqual([]);
  }, 2000);
});

describe('runScript — the five pinned escape attempts, each asserted UNREACHABLE', () => {
  it('require is not reachable', () => {
    const result = run(`require('node:fs');`);
    expect(result.error).toMatch(/require is not defined/);
  });

  it('process is not reachable', () => {
    const result = run(`process.exit(0);`);
    expect(result.error).toMatch(/process is not defined/);
  });

  it('Buffer is not reachable', () => {
    const result = run(`Buffer.from('x');`);
    expect(result.error).toMatch(/Buffer is not defined/);
  });

  it('globalThis.constructor cannot be used to synthesise and run code', () => {
    // `globalThis` itself is a legitimate part of every JS realm (this
    // context's own global object, not the host's) — so referencing it does
    // not throw. What must fail is USING the constructor chain it exposes
    // to compile new code: `codeGeneration.strings: false` blocks that at
    // the point of compilation, regardless of which realm the reached
    // `Function` object originally came from.
    const result = run(`const F = globalThis.constructor.constructor; F('return 1')();`);
    expect(result.error).toMatch(/disallowed|not allowed/i);
  });

  it('eval is not usable to run arbitrary code', () => {
    const result = run(`eval('1 + 1');`);
    expect(result.error).toMatch(/disallowed|not allowed/i);
  });

  it('pm and console themselves cannot be used to reach a live Function, not just globalThis', () => {
    // The more natural-looking attempt: a script interacts with `pm`/
    // `console` directly far more plausibly than typing `globalThis`, and
    // both are host-realm objects this module built — exactly what
    // `harden()` walks before the context is ever created.
    const viaPm = run(`const F = pm.constructor.constructor; F('return 1')();`);
    expect(viaPm.error).toMatch(/is not defined|Cannot read properties|not a function/i);

    const viaConsole = run(`const F = console.log.constructor; F('return 1')();`);
    expect(viaConsole.error).toMatch(/is not defined|Cannot read properties|not a function/i);
  });

  it('a script cannot reach the parent process or process.binding, given the utilityProcess split', () => {
    // Even granting the (blocked) Function-constructor trick above, the
    // worst a synthesised function could reach is a bare identifier lookup
    // inside THIS process — and this process is the forked utilityProcess,
    // not Electron's main: there is no window, no repo write-queue, no
    // keychain access an escape here could reach even in principle.
    const result = run(`
      const F = (function () {}).constructor;
      const fn = F('return typeof process !== "undefined" ? process.binding("fs") : null');
      fn();
    `);
    expect(result.error).toMatch(/disallowed|not allowed/i);
  });
});

describe('runScript — mutations never touch disk', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-script-runner-')));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('pm.environment.set appears in mutations and the environment file on disk is untouched', async () => {
    const saved = await saveEnvironment(
      repoRoot,
      null,
      { id: 'env-1', name: 'Local', values: [{ key: 'baseUrl', value: 'https://api.example.com', type: 'default', enabled: true }] },
      true,
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const fileName = saved.value.status === 'saved' ? saved.value.fileName : (() => { throw new Error('expected saved'); })();
    const filePath = join(repoRoot, '.midnite', 'api', 'environments', fileName);
    const before = await readFile(filePath, 'utf8');

    const loaded = await readEnvironment(repoRoot, fileName);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const result = runScript(
      `pm.environment.set('baseUrl', 'https://changed.example.com'); pm.environment.set('newKey', 'newValue');`,
      {
        environment: Object.fromEntries(loaded.value.values.map((row) => [row.key, row.value ?? ''])),
        collectionVariables: {},
        request: { method: 'GET', url: 'https://api.example.com', headers: {} },
        response: null,
      },
      1000,
    );

    expect(result.error).toBeNull();
    expect(result.mutations.environment).toEqual({
      baseUrl: 'https://changed.example.com',
      newKey: 'newValue',
    });

    const after = await readFile(filePath, 'utf8');
    expect(after).toBe(before);
  });
});
