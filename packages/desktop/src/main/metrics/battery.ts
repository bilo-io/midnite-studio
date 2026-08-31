import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BatteryDevice, BatteryDeviceType, BatteryReading } from '@midnite/studio-shared';
import { clampPercent } from './cpu';

const exec = promisify(execFile);

const IOREG = '/usr/sbin/ioreg';

/**
 * `-r` means "print only the subtrees rooted at the objects matching the
 * criteria" — and the criteria are the `-c`/`-k`/`-n` flags that follow it.
 * With none of them, `ioreg -r -w 0 -l` matches nothing, prints zero bytes,
 * and still exits 0. That silent-empty mode is why the battery segment never
 * appeared: the parsers were fed an empty string, `hasBattery` came back
 * false, and `BatterySegment` correctly rendered `null` for a machine that
 * does in fact have a battery.
 *
 * So every invocation below pairs `-r` with a selector, and they are split in
 * two because the two readings live under different criteria:
 *
 * - the internal cell is a class (`AppleSmartBattery`),
 * - peripherals are whatever object publishes a `BatteryPercent` key, across
 *   several unrelated classes (Magic Keyboard/Mouse/Trackpad, AirPods, game
 *   controllers), so they are selected by key instead.
 *
 * The alternative — dropping `-r` for a whole-registry dump — also works, but
 * costs ~5.7MB per sample against a 4MB `maxBuffer`, every other tick.
 */
export const IOREG_INTERNAL_ARGS = ['-r', '-w', '0', '-l', '-c', 'AppleSmartBattery'];
export const IOREG_PERIPHERAL_ARGS = ['-r', '-w', '0', '-l', '-k', 'BatteryPercent'];

/**
 * Parses internal battery information from `ioreg` output on macOS.
 */
export function parseAppleSmartBattery(output: string): {
  hasBattery: boolean;
  percent?: number;
  isCharging?: boolean;
  isFullyCharged?: boolean;
} {
  // Check for AppleSmartBattery section
  const batteryMatch = output.match(/AppleSmartBattery\b[\s\S]*?(?=\+-o|$)/);
  const batteryText = batteryMatch ? batteryMatch[0] : (output.includes('"CurrentCapacity"') ? output : '');

  if (!batteryText || !batteryText.includes('"CurrentCapacity"')) {
    return { hasBattery: false };
  }

  const isInstalled = /"BatteryInstalled"\s*=\s*(Yes|True)/i.test(batteryText) ||
    !batteryText.includes('"BatteryInstalled"');

  if (!isInstalled) {
    return { hasBattery: false };
  }

  const currentCapMatch = batteryText.match(/"CurrentCapacity"\s*=\s*(\d+)/);
  const maxCapMatch = batteryText.match(/"MaxCapacity"\s*=\s*(\d+)/);
  const stateOfChargeMatch = batteryText.match(/"StateOfCharge"\s*=\s*(\d+)/);

  let percent: number | undefined;

  if (stateOfChargeMatch && stateOfChargeMatch[1]) {
    percent = Number(stateOfChargeMatch[1]);
  } else if (currentCapMatch && maxCapMatch && currentCapMatch[1] && maxCapMatch[1]) {
    const current = Number(currentCapMatch[1]);
    const max = Number(maxCapMatch[1]);
    if (max > 0) {
      percent = Math.round((current / max) * 100);
    }
  } else if (currentCapMatch && currentCapMatch[1]) {
    percent = Number(currentCapMatch[1]);
  }

  if (percent !== undefined) {
    percent = clampPercent(percent);
  }

  const isCharging = /"IsCharging"\s*=\s*(Yes|True)/i.test(batteryText);
  const isFullyCharged = /"FullyCharged"\s*=\s*(Yes|True)/i.test(batteryText);

  return {
    hasBattery: true,
    percent,
    isCharging,
    isFullyCharged,
  };
}

/**
 * Infers the device type from its product name / description.
 */
export function inferDeviceType(name: string): BatteryDeviceType {
  const lower = name.toLowerCase();
  if (
    lower.includes('headphone') ||
    lower.includes('headset') ||
    lower.includes('airpods') ||
    lower.includes('buds') ||
    lower.includes('earphones') ||
    lower.includes('speaker') ||
    lower.includes('boom') ||
    lower.includes('sound') ||
    lower.includes('audio')
  ) {
    return 'headphones';
  }
  if (lower.includes('keyboard') || lower.includes('keychron') || lower.includes('magic keyboard')) {
    return 'keyboard';
  }
  if (lower.includes('trackpad') || lower.includes('magic trackpad') || lower.includes('touchpad')) {
    return 'trackpad';
  }
  if (lower.includes('mouse') || lower.includes('magic mouse') || lower.includes('mx master') || lower.includes('pointer')) {
    return 'mouse';
  }
  if (lower.includes('controller') || lower.includes('dualsense') || lower.includes('gamepad') || lower.includes('xbox')) {
    return 'gamepad';
  }
  if (lower.includes('macbook') || lower.includes('laptop') || lower.includes('internal') || lower.includes('computer')) {
    return 'internal';
  }
  return 'device';
}

/**
 * Parses connected peripheral devices with battery information from `ioreg` output.
 */
export function parseConnectedBatteryDevices(output: string): BatteryDevice[] {
  const devices: BatteryDevice[] = [];
  const seenNames = new Set<string>();

  // Look for sections containing BatteryPercent or BatteryPercentage
  const sections = output.split(/(?=\+-o)/);

  for (const section of sections) {
    const batteryMatch = section.match(/"(?:BatteryPercent|BatteryPercentage|BatteryPercentRemaining)"\s*=\s*(\d+)/i);
    if (!batteryMatch || !batteryMatch[1]) continue;

    const percent = clampPercent(Number(batteryMatch[1]));

    const productMatch = section.match(/"(?:Product|DeviceProduct|Product Name|Name)"\s*=\s*"([^"]+)"/i);
    let name = productMatch && productMatch[1] ? productMatch[1].trim() : 'Connected Device';

    // Ignore internal keyboard/trackpad battery duplicate if present
    if (name.toLowerCase().includes('apple internal keyboard')) {
      continue;
    }

    if (seenNames.has(name)) {
      // Add a suffix if multiple devices of same name exist
      let counter = 2;
      while (seenNames.has(`${name} (${counter})`)) {
        counter += 1;
      }
      name = `${name} (${counter})`;
    }
    seenNames.add(name);

    const type = inferDeviceType(name);
    const isCharging = /"IsCharging"\s*=\s*(Yes|True)/i.test(section);
    const isFullyCharged = /"FullyCharged"\s*=\s*(Yes|True)/i.test(section);

    devices.push({
      id: `dev-${devices.length + 1}-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      type,
      percent,
      isCharging,
      isFullyCharged,
      isConnected: true,
    });
  }

  return devices;
}

export type BatteryProbe = {
  sample: () => Promise<BatteryReading | undefined>;
};

export function createBatteryProbe(
  run: () => Promise<string> = runIoregBattery,
  platform: string = process.platform,
): BatteryProbe {
  if (platform !== 'darwin') {
    return {
      sample: async () => undefined,
    };
  }

  return {
    async sample(): Promise<BatteryReading | undefined> {
      try {
        const output = await run();
        const internal = parseAppleSmartBattery(output);
        const peripheralDevices = parseConnectedBatteryDevices(output);

        const devices: BatteryDevice[] = [];

        if (internal.hasBattery && internal.percent !== undefined) {
          devices.push({
            id: 'internal-battery',
            name: 'Computer',
            type: 'internal',
            percent: internal.percent,
            isCharging: internal.isCharging,
            isFullyCharged: internal.isFullyCharged,
            isConnected: true,
          });
        }

        devices.push(...peripheralDevices);

        if (!internal.hasBattery && devices.length === 0) {
          return undefined;
        }

        return {
          percent: internal.percent ?? devices[0]?.percent,
          isCharging: internal.isCharging ?? devices[0]?.isCharging,
          isFullyCharged: internal.isFullyCharged ?? devices[0]?.isFullyCharged,
          hasBattery: internal.hasBattery || devices.length > 0,
          devices,
        };
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * One `ioreg` invocation, resolving to `''` rather than throwing. Each tree is
 * probed independently so that a machine with no battery-reporting
 * peripherals — the common case — still reports its internal cell, instead of
 * one empty branch taking the whole reading down with it.
 */
async function runIoreg(args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await exec(IOREG, [...args], {
      timeout: 2_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return '';
  }
}

/**
 * The internal cell first, then peripherals: `parseAppleSmartBattery` reads up
 * to the next `+-o` header, so the order decides where its section ends.
 */
async function runIoregBattery(): Promise<string> {
  const [internal, peripherals] = await Promise.all([
    runIoreg(IOREG_INTERNAL_ARGS),
    runIoreg(IOREG_PERIPHERAL_ARGS),
  ]);
  return `${internal}\n${peripherals}`;
}
