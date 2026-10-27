import type { LockedPackage, ParseOptions } from './types';

const unquote = (s: string): string => s.trim().replace(/^['"]|['"]$/g, '');
const dedupe = (pkgs: LockedPackage[]): LockedPackage[] => {
  const seen = new Set<string>();
  return pkgs.filter((p) => {
    const k = `${p.ecosystem}:${p.name}@${p.version}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** `pnpm-lock.yaml` v5, v6 and v9: the `packages:` keys, with `importers`/top-level deps marking direct ones. */
export function parsePnpmLock(content: string, opts: ParseOptions): LockedPackage[] {
  const direct = new Set<string>(opts.directNames ?? []);
  const entries: Array<{ name: string; version: string }> = [];
  let section = '';
  let inDeps = false;
  for (const raw of content.split('\n')) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    if (indent === 0) {
      section = line.replace(/:.*$/, '');
      inDeps = section === 'dependencies' || section === 'devDependencies' || section === 'optionalDependencies';
      continue;
    }
    if (section === 'importers') {
      if (/^(dependencies|devDependencies|optionalDependencies):$/.test(line)) inDeps = true;
      else if (/^[A-Za-z]+:$/.test(line) && indent <= 4) inDeps = false;
      else if (inDeps && indent >= 6 && line.endsWith(':') && !/^(specifier|version):/.test(line)) direct.add(unquote(line.slice(0, -1)));
    } else if (inDeps && indent === 2 && line.endsWith(':')) {
      direct.add(unquote(line.slice(0, -1))); // v5/v6 top-level dependencies block
    } else if (inDeps && indent === 2 && /^[^:]+:\s*\S/.test(line)) {
      direct.add(unquote(line.slice(0, line.indexOf(':'))));
    } else if (section === 'packages' && indent === 2 && line.endsWith(':')) {
      let key = unquote(line.slice(0, -1)).replace(/^\//, '');
      key = key.replace(/\(.*$/, '');
      let name: string;
      let version: string;
      const v5 = /^(.+)\/(\d[^/_]*)(?:_.*)?$/.exec(key); // v5: name/1.2.3[_peer@x]
      if (v5) {
        name = v5[1]!;
        version = v5[2]!;
      } else {
        const at = key.lastIndexOf('@');
        if (at <= 0) continue;
        name = key.slice(0, at);
        version = key.slice(at + 1);
      }
      if (name && /^\d/.test(version)) entries.push({ name, version });
    }
  }
  return dedupe(entries.map((e) => ({ ecosystem: 'npm', ...e, direct: direct.has(e.name), path: opts.path })));
}

/** `package-lock.json` v2/v3 (`packages`) and v1 (`dependencies`). */
export function parsePackageLock(content: string, opts: ParseOptions): LockedPackage[] {
  const json = JSON.parse(content) as {
    packages?: Record<string, { version?: string; link?: boolean; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>;
    dependencies?: Record<string, { version?: string; dependencies?: Record<string, unknown> }>;
  };
  const out: LockedPackage[] = [];
  if (json.packages) {
    const root = json.packages[''];
    const rootDeps = new Set([...Object.keys(root?.dependencies ?? {}), ...Object.keys(root?.devDependencies ?? {}), ...(opts.directNames ?? [])]);
    for (const [key, value] of Object.entries(json.packages)) {
      if (!key || value.link || !value.version) continue;
      const marker = 'node_modules/';
      const idx = key.lastIndexOf(marker);
      if (idx < 0) continue;
      const name = key.slice(idx + marker.length);
      const top = key === `${marker}${name}`;
      out.push({ ecosystem: 'npm', name, version: value.version, direct: top && rootDeps.has(name), path: opts.path });
    }
  } else if (json.dependencies) {
    const walk = (deps: NonNullable<typeof json.dependencies>, top: boolean): void => {
      for (const [name, value] of Object.entries(deps)) {
        if (value.version && /^\d/.test(value.version)) {
          out.push({ ecosystem: 'npm', name, version: value.version, direct: top, path: opts.path });
        }
        if (value.dependencies) walk(value.dependencies as NonNullable<typeof json.dependencies>, false);
      }
    };
    walk(json.dependencies, true);
  }
  return dedupe(out);
}

/** `yarn.lock` classic (v1). Berry's YAML form is not read yet, so a berry file yields nothing. */
export function parseYarnLock(content: string, opts: ParseOptions): LockedPackage[] {
  const out: LockedPackage[] = [];
  let names: string[] = [];
  for (const raw of content.split('\n')) {
    if (!raw.trim() || raw.startsWith('#')) continue;
    if (!raw.startsWith(' ') && raw.trimEnd().endsWith(':')) {
      names = raw
        .trimEnd()
        .slice(0, -1)
        .split(',')
        .map((spec) => unquote(spec))
        .map((spec) => {
          const at = spec.lastIndexOf('@');
          return at > 0 ? spec.slice(0, at) : spec;
        });
    } else if (/^ {2}version\s/.test(raw) && names.length > 0) {
      const version = unquote(raw.trim().replace(/^version\s+/, ''));
      for (const name of new Set(names)) out.push({ ecosystem: 'npm', name, version, direct: opts.directNames?.has(name) ?? false, path: opts.path });
      names = [];
    }
  }
  return dedupe(out);
}

/** `requirements.txt`: only exact `name==version` pins; ranges and VCS lines are not resolvable. */
export function parseRequirementsTxt(content: string, opts: ParseOptions): LockedPackage[] {
  const out: LockedPackage[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').replace(/;.*$/, '').trim();
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*==\s*([A-Za-z0-9][A-Za-z0-9._+!-]*)$/.exec(line);
    if (m) out.push({ ecosystem: 'PyPI', name: m[1]!.toLowerCase().replace(/[_.]+/g, '-'), version: m[2]!, direct: true, path: opts.path });
  }
  return dedupe(out);
}

/** `Cargo.lock`: `[[package]]` tables with `name` and `version`; path/workspace crates carry no `source` and are skipped. */
export function parseCargoLock(content: string, opts: ParseOptions): LockedPackage[] {
  const out: LockedPackage[] = [];
  for (const block of content.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = /^name\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    const version = /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    if (name && version && /^source\s*=/m.test(block)) {
      out.push({ ecosystem: 'crates.io', name, version, direct: opts.directNames?.has(name) ?? false, path: opts.path });
    }
  }
  return dedupe(out);
}

/** `go.sum`: one `module vX.Y.Z h1:` line per module; the `/go.mod` hash lines repeat them and are skipped. */
export function parseGoSum(content: string, opts: ParseOptions): LockedPackage[] {
  const out: LockedPackage[] = [];
  for (const raw of content.split('\n')) {
    const [name, version] = raw.trim().split(/\s+/);
    if (!name || !version || version.endsWith('/go.mod')) continue;
    out.push({ ecosystem: 'Go', name, version: version.replace(/^v/, '').replace(/\+incompatible$/, ''), direct: opts.directNames?.has(name) ?? false, path: opts.path });
  }
  return dedupe(out);
}

/** Lockfile basenames and the parser that reads each. */
export const LOCKFILE_PARSERS: Readonly<Record<string, (content: string, opts: ParseOptions) => LockedPackage[]>> = {
  'pnpm-lock.yaml': parsePnpmLock,
  'package-lock.json': parsePackageLock,
  'yarn.lock': parseYarnLock,
  'requirements.txt': parseRequirementsTxt,
  'Cargo.lock': parseCargoLock,
  'go.sum': parseGoSum,
};

/** Parses a lockfile by its basename; an unknown name or an unreadable body yields no packages, never a throw. */
export function parseLockfile(basename: string, content: string, opts: ParseOptions): LockedPackage[] {
  const parser = LOCKFILE_PARSERS[basename];
  if (!parser) return [];
  try {
    return parser(content, opts);
  } catch {
    return [];
  }
}
