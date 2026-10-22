import { bridge } from '@midnite/studio-frame';
import type {
  SecurityFinding,
  SecurityFindingsListRequest,
  VanguardSensorsResponse,
  VanguardSettings,
  VanguardSettingsSetRequest,
} from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';

/** The ledger's findings under a filter, refetched when the ledger changes. */
export function useFindings(filter: SecurityFindingsListRequest): { findings: SecurityFinding[]; loaded: boolean } {
  const key = JSON.stringify(filter);
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    const request = JSON.parse(key) as SecurityFindingsListRequest;
    const refetch = (): void => {
      void bridge()
        ?.vanguard.findings.list(request)
        .then((r) => {
          if (!live) return;
          setFindings(r.findings);
          setLoaded(true);
        });
    };
    refetch();
    const off = bridge()?.vanguard.findings.onChanged(refetch);
    return () => {
      live = false;
      off?.();
    };
  }, [key]);
  return { findings, loaded };
}

const NO_SENSORS: VanguardSensorsResponse = { sensors: [], active: false };

/** Every registered sensor's state, refetched when the host reports a change. */
export function useSensors(): { sensors: VanguardSensorsResponse; loaded: boolean } {
  const [sensors, setSensors] = useState<VanguardSensorsResponse>(NO_SENSORS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    const refetch = (): void => {
      void bridge()
        ?.vanguard.sensors()
        .then((next) => {
          if (!live) return;
          setSensors(next);
          setLoaded(true);
        });
    };
    refetch();
    const off = bridge()?.vanguard.onChanged(refetch);
    return () => {
      live = false;
      off?.();
    };
  }, []);
  return { sensors, loaded };
}

/** The persisted settings; `update` merges a patch and adopts main's answer. */
export function useVanguardSettings(): { settings: VanguardSettings | null; update: (patch: VanguardSettingsSetRequest) => Promise<void> } {
  const [settings, setSettings] = useState<VanguardSettings | null>(null);
  useEffect(() => {
    let live = true;
    void bridge()
      ?.vanguard.settings()
      .then((next) => {
        if (live) setSettings(next);
      });
    return () => {
      live = false;
    };
  }, []);
  const update = useCallback(async (patch: VanguardSettingsSetRequest) => {
    const next = await bridge()?.vanguard.setSettings(patch);
    if (next) setSettings(next);
  }, []);
  return { settings, update };
}
