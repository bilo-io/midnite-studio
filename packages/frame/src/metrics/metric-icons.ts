import type { MetricId } from '@midnite/studio-shared';
import type { IconType } from 'react-icons';
import { BsCpuFill, BsHddFill } from 'react-icons/bs';
import { PiGraphicsCardFill } from 'react-icons/pi';
import { RiRamFill } from 'react-icons/ri';

export const METRIC_ICONS: Record<MetricId, IconType> = {
  cpu: BsCpuFill,
  memory: RiRamFill,
  gpu: PiGraphicsCardFill,
  disk: BsHddFill,
};
