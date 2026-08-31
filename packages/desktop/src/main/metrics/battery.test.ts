import { describe, expect, it } from 'vitest';
import {
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
