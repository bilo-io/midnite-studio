import { z } from 'zod';

export const BatteryDeviceTypeSchema = z.enum([
  'internal',
  'headphones',
  'keyboard',
  'trackpad',
  'mouse',
  'gamepad',
  'device',
]);

export type BatteryDeviceType = z.infer<typeof BatteryDeviceTypeSchema>;

export const BatteryDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: BatteryDeviceTypeSchema,
  percent: z.number().min(0).max(100),
  isCharging: z.boolean().optional(),
  isFullyCharged: z.boolean().optional(),
  isConnected: z.boolean().optional(),
});

export type BatteryDevice = z.infer<typeof BatteryDeviceSchema>;

export const BatteryReadingSchema = z.object({
  /** Primary / internal battery percentage (0-100), or undefined if not battery-powered. */
  percent: z.number().min(0).max(100).optional(),
  isCharging: z.boolean().optional(),
  isFullyCharged: z.boolean().optional(),
  hasBattery: z.boolean(),
  devices: z.array(BatteryDeviceSchema),
});

export type BatteryReading = z.infer<typeof BatteryReadingSchema>;
