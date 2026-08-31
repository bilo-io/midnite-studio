import { describe, expect, it } from 'vitest';
import {
  IOREG_INTERNAL_ARGS,
  IOREG_PERIPHERAL_ARGS,
  createBatteryProbe,
  inferDeviceType,
  parseAppleSmartBattery,
  parseConnectedBatteryDevices,
} from './battery';

describe('inferDeviceType', () => {
  it('identifies headphones and audio devices', () => {
    expect(inferDeviceType('AirPods Pro')).toBe('headphones');
    expect(inferDeviceType('WH-1000XM4 Headset')).toBe('headphones');
    expect(inferDeviceType('BILO BOOM 3')).toBe('headphones');
    expect(inferDeviceType('Galaxy Buds')).toBe('headphones');
  });

  it('identifies keyboard', () => {
    expect(inferDeviceType('Magic Keyboard with Touch ID')).toBe('keyboard');
    expect(inferDeviceType('Keychron K2')).toBe('keyboard');
  });

  it('identifies trackpad and mouse', () => {
    expect(inferDeviceType("Bilo's Magic Trackpad")).toBe('trackpad');
    expect(inferDeviceType('Magic Mouse')).toBe('mouse');
    expect(inferDeviceType('MX Master 3S')).toBe('mouse');
  });

  it('identifies gamepads', () => {
    expect(inferDeviceType('DualSense Wireless Controller')).toBe('gamepad');
    expect(inferDeviceType('Xbox Wireless Controller')).toBe('gamepad');
  });

  it('identifies internal / computer', () => {
    expect(inferDeviceType('MacBook Pro Battery')).toBe('internal');
    expect(inferDeviceType('Laptop Internal')).toBe('internal');
  });

  it('defaults to generic device', () => {
    expect(inferDeviceType('Unknown Gizmo')).toBe('device');
  });
});

describe('parseAppleSmartBattery', () => {
  it('parses valid AppleSmartBattery ioreg dump', () => {
    const sample = `
+-o AppleSmartBattery  <class AppleSmartBattery, id 0x1000009b3, registered, matched, active, busy 0 (7 ms), retain 9>
    {
      "CurrentCapacity" = 85
      "MaxCapacity" = 100
      "IsCharging" = Yes
      "FullyCharged" = No
      "BatteryInstalled" = Yes
    }
`;
    const result = parseAppleSmartBattery(sample);
    expect(result.hasBattery).toBe(true);
    expect(result.percent).toBe(85);
    expect(result.isCharging).toBe(true);
    expect(result.isFullyCharged).toBe(false);
  });

  it('parses StateOfCharge when present', () => {
    const sample = `
+-o AppleSmartBattery  <class AppleSmartBattery, id 0x1000009b3, registered, matched, active, busy 0 (7 ms), retain 9>
    {
      "CurrentCapacity" = 9
      "BatteryData" = {"StateOfCharge"=42}
      "IsCharging" = No
      "FullyCharged" = No
    }
`;
    const result = parseAppleSmartBattery(sample);
    expect(result.hasBattery).toBe(true);
    expect(result.percent).toBe(42);
    expect(result.isCharging).toBe(false);
  });

  it('returns hasBattery: false on desktop / no battery', () => {
    const sample = `
+-o AppleACPIPlatformExpert <class AppleACPIPlatformExpert>
    {
    }
`;
    const result = parseAppleSmartBattery(sample);
    expect(result.hasBattery).toBe(false);
    expect(result.percent).toBeUndefined();
  });
});

describe('parseConnectedBatteryDevices', () => {
  it('parses external Bluetooth peripherals', () => {
    const sample = `
+-o BNBMouseDevice  <class BNBMouseDevice>
    {
      "Product" = "Magic Mouse"
      "BatteryPercent" = 74
      "IsCharging" = No
    }
+-o BNBTrackpadDevice <class BNBTrackpadDevice>
    {
      "Product" = "Magic Trackpad"
      "BatteryPercentage" = 18
      "IsCharging" = Yes
    }
`;
    const devices = parseConnectedBatteryDevices(sample);
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({
      name: 'Magic Mouse',
      type: 'mouse',
      percent: 74,
      isCharging: false,
    });
    expect(devices[1]).toMatchObject({
      name: 'Magic Trackpad',
      type: 'trackpad',
      percent: 18,
      isCharging: true,
    });
  });

  it('ignores Apple Internal Keyboard duplicate battery entries', () => {
    const sample = `
+-o AppleDeviceManagementHIDEventService
    {
      "Product" = "Apple Internal Keyboard / Trackpad"
      "BatteryPercent" = 100
    }
`;
    const devices = parseConnectedBatteryDevices(sample);
    expect(devices).toHaveLength(0);
  });
});

describe('createBatteryProbe', () => {
  it('disables when platform is not darwin', async () => {
    const probe = createBatteryProbe(async () => '', 'linux');
    const result = await probe.sample();
    expect(result).toBeUndefined();
  });

  it('assembles internal and peripheral batteries', async () => {
    const sample = `
+-o AppleSmartBattery
    {
      "CurrentCapacity" = 88
      "MaxCapacity" = 100
      "IsCharging" = No
      "FullyCharged" = No
      "BatteryInstalled" = Yes
    }
+-o BluetoothDevice
    {
      "Product" = "AirPods Pro"
      "BatteryPercent" = 65
    }
`;
    const probe = createBatteryProbe(async () => sample, 'darwin');
    const result = await probe.sample();
    expect(result).toBeDefined();
    expect(result?.hasBattery).toBe(true);
    expect(result?.percent).toBe(88);
    expect(result?.devices).toHaveLength(2);
    expect(result?.devices[0]).toMatchObject({
      name: 'Computer',
      type: 'internal',
      percent: 88,
    });
    expect(result?.devices[1]).toMatchObject({
      name: 'AirPods Pro',
      type: 'headphones',
      percent: 65,
    });
  });
});

/**
 * The `run` seam that every test above injects is exactly why the original
 * bug shipped: the parsers were always fed a good fixture, so nothing ever
 * exercised the argv actually handed to `ioreg`. `ioreg -r -w 0 -l` with no
 * `-c`/`-k`/`-n` matches no subtree, prints nothing and exits 0 — a silent
 * empty reading that looks identical to a desktop with no battery. These
 * assert the argv itself.
 */
describe('ioreg arguments', () => {
  const withSelector = [
    ['internal', IOREG_INTERNAL_ARGS],
    ['peripheral', IOREG_PERIPHERAL_ARGS],
  ] as const;

  it.each(withSelector)('pairs -r with a selector for the %s tree', (_name, args) => {
    expect(args).toContain('-r');
    // -c (class), -k (key) and -n (name) are the only criteria `-r` accepts.
    expect(args.some((arg) => arg === '-c' || arg === '-k' || arg === '-n')).toBe(true);
  });

  it('selects the internal cell by class and peripherals by key', () => {
    expect(IOREG_INTERNAL_ARGS).toEqual(
      expect.arrayContaining(['-c', 'AppleSmartBattery']),
    );
    expect(IOREG_PERIPHERAL_ARGS).toEqual(expect.arrayContaining(['-k', 'BatteryPercent']));
  });

  it('keeps -w 0 so long property lines are never truncated mid-value', () => {
    for (const args of [IOREG_INTERNAL_ARGS, IOREG_PERIPHERAL_ARGS]) {
      expect(args.indexOf('-w')).toBeGreaterThanOrEqual(0);
      expect(args[args.indexOf('-w') + 1]).toBe('0');
      expect(args).toContain('-l');
    }
  });
});
