/**
 * Working out which port a repository's dev server is on (Phase 71 Theme C).
 *
 * A dev server is the URL a developer types most often and the one the app can
 * work out for itself — the repo's own `package.json` usually says the port
 * outright, and when it does not, five conventional ports cover almost every
 * stack this app is opened on.
 *
 * **Detection is a hint, never a navigation.** Nothing in this module or its
 * callers opens anything. The result becomes a tile on the new-tab page and a
 * palette row; a person chooses it. This is stated here because the next
 * reader's first instinct is to open it automatically, and an app that
 * navigates somewhere because a port answered is an app that navigates
 * somewhere you did not ask for.
 *
 * The probe is **injected** — the same shape `terminal-links.ts` uses for its
 * opener, and the reason that module is testable. A renderer cannot open a TCP
 * socket, so the real one is `bridge().browser.devServerProbe`; a test hands in
 * a function and needs no network and no listening socket.
 */

export type DevServerHint = {
  port: number;
  /**
   * `'script'` — the port was written down in the repo's own `dev`/`start`
   * script, so nothing was probed and the answer cannot be a coincidence.
   * `'probe'` — something is listening on a conventional port, which is a
   * good guess and no more than that.
   */
  source: 'script' | 'probe';
  /** Which script named it. Only ever set for `source: 'script'`. */
  script?: string;
};

/** Answers whether something is listening on `127.0.0.1:<port>`. */
export type PortProbe = (port: number) => Promise<boolean>;

/**
 * Tried in this order, and the first that answers wins.
 *
 * Ordered by how likely a hit is to be *this* repo's dev server rather than
 * something else the machine is running: 3000 (Next, CRA, Nest), 4200
 * (Angular), 5173 (Vite — this app's own), 8000 (Django, php, python -m http),
 * 8080 (the generic fallback, and the one most likely to be somebody else's).
 */
export const DEV_SERVER_PORTS: readonly number[] = [3000, 4200, 5173, 8000, 8080];

/** The scripts a dev server conventionally hides behind, most specific first. */
const DEV_SCRIPT_NAMES: readonly string[] = ['dev', 'start'];

/**
 * The three shapes a port argument takes on a command line.
 *
 * `--port 3001`, `--port=3001` and `-p 3001` — the last deliberately not
 * `-p3001`, which no dev-server CLI in this list accepts and which would make
 * `-progress` parse as port 0. Anchored on a word boundary so `--report 3001`
 * cannot match.
 */
const PORT_PATTERNS: readonly RegExp[] = [
  /(?:^|\s)--port[=\s]+(\d{1,5})(?:\s|$)/,
  /(?:^|\s)-p\s+(\d{1,5})(?:\s|$)/,
];

/** A port out of a single script command, or `null` if it does not name one. */
export function extractPort(command: string): number | null {
  for (const pattern of PORT_PATTERNS) {
    const match = pattern.exec(command);
    const port = match?.[1] ? Number(match[1]) : NaN;
    if (Number.isInteger(port) && port >= 1 && port <= 65535) return port;
  }
  return null;
}

/**
 * The `scripts` block of a `package.json`, or `{}` for anything that is not
 * one — a parsed array, a string, `null`, a file with no scripts at all.
 *
 * Total rather than throwing: a repo whose `package.json` this cannot read is
 * a repo that gets probed instead, which is exactly the fallback that exists.
 */
function scriptsOf(pkgJson: unknown): Record<string, string> {
  if (!pkgJson || typeof pkgJson !== 'object' || Array.isArray(pkgJson)) return {};
  const scripts = (pkgJson as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof value === 'string') out[name] = value;
  }
  return out;
}

/**
 * The repository's dev server, if there is one to be found.
 *
 * An explicit `--port` in a `dev`/`start` script is taken at its word and
 * costs no probe — it is what the repo itself says, and probing it would only
 * add a way to be wrong. Everything else falls back to
 * {@link DEV_SERVER_PORTS}, in order, first answer wins.
 *
 * Ports are probed **sequentially, not in parallel**: the common case is a hit
 * on the first or second, and firing five loopback connections at once to save
 * a few milliseconds is how a detector becomes something that looks like a
 * scan in a packet log.
 */
export async function detectDevServer(
  pkgJson: unknown,
  probe: PortProbe,
): Promise<DevServerHint | null> {
  const scripts = scriptsOf(pkgJson);

  for (const name of DEV_SCRIPT_NAMES) {
    const command = scripts[name];
    if (!command) continue;
    const port = extractPort(command);
    if (port !== null) return { port, source: 'script', script: name };
  }

  for (const port of DEV_SERVER_PORTS) {
    if (await probe(port)) return { port, source: 'probe' };
  }

  return null;
}

/** What a hint opens, and what the tile and the palette row are labelled with. */
export const devServerUrl = (hint: DevServerHint): string => `http://localhost:${hint.port}`;
export const devServerLabel = (hint: DevServerHint): string => `Dev server · ${hint.port}`;
