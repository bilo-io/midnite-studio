import { healthBridge } from './use-health';

/** Studio carries no Health bridge: a view shows this instead of crashing. */
export function HealthMissing() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm opacity-70" data-testid="health-missing">
      Health runs in its own app.
    </div>
  );
}

export const hasHealthBridge = (): boolean => healthBridge() !== undefined;
