import type { BatteryDeviceType } from '@midnite/studio-shared';
import {
  LuGamepad2,
  LuHeadphones,
  LuKeyboard,
  LuLaptop,
  LuMouse,
  LuSparkles,
  LuTouchpad,
} from 'react-icons/lu';

export function BatteryDeviceIcon({
  type,
  className = 'h-4 w-4',
}: {
  type: BatteryDeviceType;
  className?: string;
}) {
  switch (type) {
    case 'internal':
      return <LuLaptop className={className} aria-hidden="true" />;
    case 'headphones':
      return <LuHeadphones className={className} aria-hidden="true" />;
    case 'keyboard':
      return <LuKeyboard className={className} aria-hidden="true" />;
    case 'trackpad':
      return <LuTouchpad className={className} aria-hidden="true" />;
    case 'mouse':
      return <LuMouse className={className} aria-hidden="true" />;
    case 'gamepad':
      return <LuGamepad2 className={className} aria-hidden="true" />;
    case 'device':
    default:
      return <LuSparkles className={className} aria-hidden="true" />;
  }
}
