import type { SecurityFinding, SecurityFindingSeverity } from '@midnite/studio-shared';

import { createGuardFinding, type GuardCheck } from '../check';

export const MAC_CONFIG_CHECK_ID = 'mac-config';

/** `on`/`off` as the probe read it; `unavailable` when the command failed or its output was not understood. */
export type ProbeState = 'on' | 'off' | 'unavailable';

/** What the `macConfig` resolver reports. */
export interface MacConfig {
  fileVault: ProbeState;
  firewall: ProbeState;
  gatekeeper: ProbeState;
  sip: ProbeState;
  remoteLogin: ProbeState;
  screenSharing: ProbeState;
  /** Whether `softwareupdate -l` lists a security update; `on` means one is pending. */
  pendingSecurityUpdates: ProbeState;
  /** Whether automatic update checks are enabled. */
  autoUpdates: ProbeState;
}

export const parseFileVault = (out: string): ProbeState => (/is on/i.test(out) ? 'on' : /is off/i.test(out) ? 'off' : 'unavailable');
export const parseFirewall = (out: string): ProbeState => (/enabled|state = [12]/i.test(out) ? 'on' : /disabled|state = 0/i.test(out) ? 'off' : 'unavailable');
export const parseGatekeeper = (out: string): ProbeState => (/assessments enabled/i.test(out) ? 'on' : /assessments disabled/i.test(out) ? 'off' : 'unavailable');
export const parseSip = (out: string): ProbeState => (/enabled/i.test(out) && !/disabled/i.test(out) ? 'on' : /disabled/i.test(out) ? 'off' : 'unavailable');
/** `launchctl print system/<label>` succeeding means the service is loaded; the resolver passes `loaded` for that. */
export const parseLoaded = (loaded: boolean | null): ProbeState => (loaded === null ? 'unavailable' : loaded ? 'on' : 'off');
/** `softwareupdate -l` names pending updates as `* Label:` lines; a security one says `Security` or is a macOS/Safari update. */
export const parseSecurityUpdates = (out: string): ProbeState =>
  /no new software available/i.test(out) ? 'off' : /\* Label:/i.test(out) ? (/security|safari|macos/i.test(out) ? 'on' : 'off') : 'unavailable';
/** `defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled` prints `1` or `0`. */
export const parseAutoUpdates = (out: string): ProbeState => (out.trim() === '1' ? 'on' : out.trim() === '0' ? 'off' : 'unavailable');

interface Rule {
  key: keyof MacConfig;
  /** The state that is a problem. */
  bad: ProbeState;
  severity: SecurityFindingSeverity;
  title: string;
  detail: string;
  /** The one-line fix the user runs or opens; the app never calls sudo. */
  fix: { pane?: string; command?: string };
}

const RULES: readonly Rule[] = [
  { key: 'fileVault', bad: 'off', severity: 'high', title: 'FileVault is off', detail: 'The disk is not encrypted, so a lost or stolen Mac exposes everything on it.', fix: { pane: 'Privacy & Security > FileVault' } },
  { key: 'firewall', bad: 'off', severity: 'medium', title: 'The application firewall is off', detail: 'Incoming connections are not filtered per application.', fix: { pane: 'Network > Firewall' } },
  { key: 'gatekeeper', bad: 'off', severity: 'high', title: 'Gatekeeper is off', detail: 'macOS no longer checks that downloaded apps are signed and notarized.', fix: { command: 'sudo spctl --global-enable' } },
  { key: 'sip', bad: 'off', severity: 'high', title: 'System Integrity Protection is off', detail: 'System files and processes are no longer protected from modification.', fix: { command: 'csrutil enable   # from Recovery' } },
  { key: 'remoteLogin', bad: 'on', severity: 'medium', title: 'Remote Login (SSH) is on', detail: 'The Mac accepts SSH connections from the network.', fix: { pane: 'General > Sharing > Remote Login' } },
  { key: 'screenSharing', bad: 'on', severity: 'medium', title: 'Screen Sharing or Remote Management is on', detail: 'The screen can be viewed and controlled over the network.', fix: { pane: 'General > Sharing > Screen Sharing' } },
  { key: 'pendingSecurityUpdates', bad: 'on', severity: 'high', title: 'A security update is waiting', detail: 'macOS reports an update that has not been installed.', fix: { pane: 'General > Software Update' } },
  { key: 'autoUpdates', bad: 'off', severity: 'medium', title: 'Automatic update checks are off', detail: 'The Mac does not look for updates on its own.', fix: { pane: 'General > Software Update > Automatic Updates' } },
];

/**
 * Theme D, configuration: one finding per protection that is off (or exposure that is on). `unavailable` probes are
 * silently skipped (a check that cannot read is not a finding). Fixes are text in the detail and a `command`
 * evidence the user copies or a System Settings pane they open; nothing here runs `sudo`.
 */
export const macConfigCheck: GuardCheck = {
  id: MAC_CONFIG_CHECK_ID,
  title: 'macOS security settings',
  category: 'config',
  needs: ['macConfig'],
  run(raw): SecurityFinding[] {
    const config = (raw as { macConfig?: Partial<MacConfig> }).macConfig ?? {};
    const findings: SecurityFinding[] = [];
    for (const rule of RULES) {
      if (config[rule.key] !== rule.bad) continue;
      const how = rule.fix.pane ? `Open System Settings > ${rule.fix.pane}.` : `Run in a terminal: ${rule.fix.command}`;
      findings.push(
        createGuardFinding({
          check: macConfigCheck,
          subject: rule.key,
          severity: rule.severity,
          title: rule.title,
          detail: `${rule.detail} ${how}`,
          evidence: rule.fix.command ? [{ kind: 'command', command: rule.fix.command }] : [],
        }),
      );
    }
    return findings;
  },
};
