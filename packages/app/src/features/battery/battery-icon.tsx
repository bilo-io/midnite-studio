import type { ComponentProps } from 'react';

/**
 * A battery icon with an SVG body and an inner fill rectangle
 * proportional to `percent` (0-100), plus an optional charging lightning bolt.
 */
export function BatteryIcon({
  percent = 100,
  isCharging = false,
  className = 'h-3.5 w-3.5',
  ...rest
}: {
  percent?: number;
  isCharging?: boolean;
  className?: string;
} & ComponentProps<'svg'>) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  // The battery body inner bounds in a 24x24 viewBox:
  // Body rect: x=2, y=6, width=17, height=12, rx=2, ry=2
  // Terminal pin: x=21, y=10, width=2, height=4
  // Inner fill area: x=4, y=8, max width=13, height=8
  const innerMaxWidth = 13;
  const fillWidth = Math.max(0.5, (clamped / 100) * innerMaxWidth);

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* Battery shell */}
      <rect x="2" y="6" width="17" height="12" rx="2" ry="2" />
      {/* Battery positive terminal cap */}
      <path d="M21 10v4" strokeWidth="2" />
      {/* Filled battery capacity bar */}
      <rect
        x="4"
        y="8"
        width={fillWidth}
        height="8"
        rx="1"
        fill="currentColor"
        stroke="none"
      />
      {/* Charging bolt overlay if charging */}
      {isCharging && (
        <path
          d="M11 6.5L8.5 12h3.5L9.5 17.5"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
