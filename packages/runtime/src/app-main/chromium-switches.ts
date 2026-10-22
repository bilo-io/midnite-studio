/**
 * Site isolation stays on (Phase 117 Theme A).
 *
 * Every embedded page's security story rests on Chromium's process model: the renderer sandbox,
 * site-per-process, and web security. Each is one command-line switch away from off, and a switch
 * can arrive three ways — on the process argv, through `app.commandLine.appendSwitch` somewhere in
 * main, or inherited from a launcher. None of the suite's apps has a reason to pass any of them,
 * so a boot that finds one is a bug, not a configuration.
 *
 * Pure of Electron, like everything in the runtime: the caller hands in `process.argv` and a
 * `hasSwitch` over `app.commandLine`, and gets back the switches it must refuse to boot with. In
 * dev and test the assertion throws, which is loud exactly where someone can act on it; a packaged
 * build logs instead — crashing the user's app on an inherited flag is a worse outcome than
 * running and recording that it did.
 */

/**
 * Switches that turn the sandbox, site isolation or web security off. Debugging switches
 * (`--remote-debugging-*`, `--inspect`) are deliberately not here: Playwright drives a dev build
 * through them, and they open nothing to a page.
 */
export const FORBIDDEN_CHROMIUM_SWITCHES: readonly string[] = [
  'no-sandbox',
  'disable-site-isolation-trials',
  'disable-web-security',
  'disable-site-isolation-for-policy',
  'allow-running-insecure-content',
];

/** `--disable-features=` values that disable site isolation by another name. */
const FORBIDDEN_DISABLED_FEATURES = ['IsolateOrigins', 'site-per-process', 'SitePerProcess'];

/**
 * The forbidden switches present on `argv` or reported by `hasSwitch`, as `--name`, deduplicated
 * and in the order of {@link FORBIDDEN_CHROMIUM_SWITCHES}; `--disable-features=<feature>` entries
 * follow. Empty when the boot is clean.
 */
export function findForbiddenChromiumSwitches(
  argv: readonly string[],
  hasSwitch: (name: string) => boolean = () => false,
  getSwitchValue: (name: string) => string = () => '',
): string[] {
  const found: string[] = [];
  for (const name of FORBIDDEN_CHROMIUM_SWITCHES) {
    const flag = `--${name}`;
    const onArgv = argv.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
    if (onArgv || hasSwitch(name)) found.push(flag);
  }
  // `--disable-features` on argv, and the one `appendSwitch('disable-features', …)` set programmatically.
  const disabled = new Set<string>();
  for (const arg of argv) {
    if (arg.startsWith('--disable-features=')) {
      for (const feature of arg.slice('--disable-features='.length).split(',')) disabled.add(feature);
    }
  }
  for (const feature of getSwitchValue('disable-features').split(',')) if (feature !== '') disabled.add(feature);
  for (const feature of FORBIDDEN_DISABLED_FEATURES) {
    if (disabled.has(feature)) found.push(`--disable-features=${feature}`);
  }
  return found;
}

export type SiteIsolationBoot = {
  argv: readonly string[];
  /** `app.commandLine.hasSwitch` — catches a switch appended programmatically, not just one on argv. */
  hasSwitch: (name: string) => boolean;
  /** `app.commandLine.getSwitchValue` — the programmatic `disable-features` list (`''` when unset). */
  getSwitchValue?: (name: string) => string;
  isPackaged: boolean;
  log: { error(message: string): void };
};

/**
 * Refuse to boot with site isolation, the sandbox or web security off: throws in dev and test,
 * logs in a packaged build. Returns the offending switches either way (empty on a clean boot).
 */
export function assertSiteIsolation(boot: SiteIsolationBoot): string[] {
  const found = findForbiddenChromiumSwitches(boot.argv, boot.hasSwitch, boot.getSwitchValue);
  if (found.length === 0) return found;
  const message = `site isolation: refusing ${found.join(' ')} — no midnite app runs with the sandbox, site isolation or web security off`;
  if (!boot.isPackaged) throw new Error(message);
  boot.log.error(`[security] ${message}`);
  return found;
}
