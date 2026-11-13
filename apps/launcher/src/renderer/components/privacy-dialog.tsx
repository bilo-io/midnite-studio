import { useEffect, useState } from 'react';

import type { LauncherBridge, LauncherPrivacy } from '../../common/bridge';

/**
 * Phase 115 Theme A: the launcher's two automatic network calls, each with its own switch, plus the master
 * "turn off all automatic network". Off means nothing is requested at start; Check again still asks.
 */
export function PrivacyDialog({ bridge, onClose }: { bridge: LauncherBridge; onClose: () => void }) {
  const [privacy, setPrivacy] = useState<LauncherPrivacy | null>(null);

  useEffect(() => {
    let live = true;
    void bridge.privacy.get().then((p) => live && setPrivacy(p), () => undefined);
    return () => {
      live = false;
    };
  }, [bridge]);

  const save = (next: LauncherPrivacy) => {
    setPrivacy(next);
    void bridge.privacy.set(next).then(setPrivacy, () => undefined);
  };

  return (
    <div className="sheet-backdrop sheet-backdrop-center">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
        <h2 id="privacy-title" className="dialog-title">
          Automatic network calls
        </h2>
        <p className="dialog-body">
          When Midnite Apps opens it asks the public release feed whether anything is new. Nothing about you is sent. Turn any of it
          off and nothing is requested at start; Check again still asks when you click it.
        </p>
        {privacy === null ? null : (
          <div className="dialog-list" role="group" aria-label="Automatic network calls">
            <label>
              <input
                type="checkbox"
                checked={privacy.allAutomaticOff}
                onChange={(e) => save({ ...privacy, allAutomaticOff: e.target.checked })}
              />{' '}
              Turn off all automatic network
            </label>
            <label>
              <input
                type="checkbox"
                checked={privacy.switches['launcher-updates']}
                disabled={privacy.allAutomaticOff}
                onChange={(e) => save({ ...privacy, switches: { ...privacy.switches, 'launcher-updates': e.target.checked } })}
              />{' '}
              Check for updates at start
            </label>
            <label>
              <input
                type="checkbox"
                checked={privacy.switches['launcher-catalog']}
                disabled={privacy.allAutomaticOff}
                onChange={(e) => save({ ...privacy, switches: { ...privacy.switches, 'launcher-catalog': e.target.checked } })}
              />{' '}
              Refresh the app catalog at start
            </label>
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose} autoFocus>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
