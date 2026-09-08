import { beforeEach, describe, expect, it, vi } from 'vitest';

import { companionPorts } from './companion-ports';
// Imported for its side effect: this module registers Themes D+E into Theme
// C's port registry at module scope. A dynamic `import()` inside a test would
// be wrong here — module scope runs once, so a `resetCompanionPorts()` in a
// `beforeEach` would put the no-op defaults back and every later case would be
// testing Theme C's fallbacks rather than this wiring.
import './register-flow-ports';
import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';

/**
 * Themes D+E plugging into Theme C's port registry — Phase 79.
 *
 * Two properties are worth asserting, and both are invisible when they break.
 *
 * **`submit` replaces Theme C's default, not wraps it.** That default posts the
 * user's turn itself so the input bar works before this theme exists;
 * `submitCompanionInput` posts its own. Registering something that also called
 * the default would put every typed message in the thread twice, which reads as
 * a rendering bug rather than a wiring one.
 *
 * **The registration actually happened.** The discriminator is the
 * `companionEnabled` guard: Theme C's default has none (it cannot — it does not
 * know the feature can be off), and this theme's `submit` returns early. So a
 * message refused while the switch is off is proof the registry is holding
 * *our* function rather than the fallback.
 */

beforeEach(() => {
  useCompanionStore.setState({ transcript: [], activeHandoff: null, state: 'idle' });
});

describe('register-flow-ports', () => {
  it('has registered submit, greet, interrupt and repeat', () => {
    const ports = companionPorts();
    for (const member of ['submit', 'greet', 'interrupt', 'repeat'] as const) {
      expect(typeof ports[member]).toBe('function');
    }
  });

  it('refuses a message while the companion is switched off', async () => {
    // The proof of registration: Theme C's default `submit` has no such guard.
    useUiStore.setState({ companionEnabled: false });

    companionPorts().submit('probe-while-disabled');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(
      useCompanionStore
        .getState()
        .transcript.filter((turn) => turn.text === 'probe-while-disabled'),
    ).toHaveLength(0);
  });

  it('posts a typed message exactly once', async () => {
    useUiStore.setState({ companionEnabled: true });

    companionPorts().submit('start a swarm');

    // The flow runs on past this point into a bridge that does not exist under
    // jsdom; what matters here is that the turn was not posted twice — once by
    // the default and once by the registration.
    await vi.waitFor(() => {
      expect(
        useCompanionStore.getState().transcript.filter((turn) => turn.text === 'start a swarm'),
      ).toHaveLength(1);
    });
  });
});
