export type BatteryColorTier = 'high' | 'medium' | 'low';

export function getBatteryTier(percent: number): BatteryColorTier {
  const p = Math.round(percent);
  if (p >= 70) return 'high'; // Above 70% or 70%+ -> green
  if (p >= 30) return 'medium'; // 69 - 30% -> orange
  return 'low'; // Below 30% -> red
}

export type BatteryFlashTier = 'none' | 'slow' | 'medium' | 'fast';

/**
 * Below 30% the low tier starts flashing, and gets faster the lower it goes:
 * slow under 30%, a little faster under 20%, really fast under 10%.
 */
export function getBatteryFlashTier(percent: number): BatteryFlashTier {
  const p = Math.round(percent);
  if (p < 10) return 'fast';
  if (p < 20) return 'medium';
  if (p < 30) return 'slow';
  return 'none';
}

export function getBatteryFlashClass(tier: BatteryFlashTier): string {
  switch (tier) {
    case 'slow':
      return 'battery-flash-slow';
    case 'medium':
      return 'battery-flash-medium';
    case 'fast':
      return 'battery-flash-fast';
    case 'none':
      return '';
  }
}

export function getBatteryTierClasses(tier: BatteryColorTier): {
  textClass: string;
  fillClass: string;
  glowStyle?: React.CSSProperties;
} {
  switch (tier) {
    case 'high':
      return {
        textClass: 'text-emerald-500 dark:text-emerald-400',
        fillClass: 'fill-emerald-500 dark:fill-emerald-400',
      };
    case 'medium':
      return {
        textClass: 'text-amber-500 dark:text-amber-400',
        fillClass: 'fill-amber-500 dark:fill-amber-400',
      };
    case 'low':
      return {
        textClass: 'text-rose-500 dark:text-rose-400',
        fillClass: 'fill-rose-500 dark:fill-rose-400',
        glowStyle: {
          textShadow: '0 0 6px rgba(244, 63, 94, 0.65), 0 0 12px rgba(244, 63, 94, 0.4)',
          filter: 'drop-shadow(0 0 4px rgba(244, 63, 94, 0.65))',
        },
      };
  }
}
