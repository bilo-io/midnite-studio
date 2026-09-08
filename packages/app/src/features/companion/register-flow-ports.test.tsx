import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { companionPorts } from './companion-ports';
import { silentSpeaker } from './ports';
import { companionSpeaker, setCompanionSpeaker } from './runtime';
import { companionTtsSpeaker } from './speaker';
// Imported for its side effect: this module registers Themes D+E into Theme
// C's port registry at module scope. A dynamic `import()` inside a test would
// be wrong here — module scope runs once, so a `resetCompanionPorts()` in a
// `beforeEach` would put the no-op defaults back and every later case would be
// testing Theme C's fallbacks rather than this wiring.
import './register-flow-ports';
import { useCompanionSpeakerWiring } from './register-flow-ports';
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

/**
 * The speaker wiring — the Phase 79 follow-up's first fix.
 *
 * Phase 79 shipped with `setCompanionSpeaker` uncalled: Theme E built the port
 * and Theme F built the speaker, in parallel PRs, and nothing joined them, so
 * the app was mute and every turn was `spoken: false`. This is the test that
 * would have caught it — the assertion is on `companionSpeaker()`'s *identity*,
 * because that is the only thing that was wrong.
 *
 * Rendered through the real hook rather than calling the effect body, so the
 * unmount cleanup and the re-run on a preference change are covered too.
 */
describe('useCompanionSpeakerWiring', () => {
  beforeEach(() => {
    setCompanionSpeaker(null);
    useUiStore.setState({ companionEnabled: false, companionSpeakAloud: true });
  });

  function Harness() {
    useCompanionSpeakerWiring();
    return null;
  }

  it('registers the real TTS speaker once the companion is enabled', () => {
    useUiStore.setState({ companionEnabled: true, companionSpeakAloud: true });
    render(<Harness />);
    expect(companionSpeaker()).toBe(companionTtsSpeaker);
  });

  it('stays silent while the companion is off, whatever the speak switch says', () => {
    useUiStore.setState({ companionEnabled: false, companionSpeakAloud: true });
    render(<Harness />);
    expect(companionSpeaker()).toBe(silentSpeaker);
  });

  it('goes back to silence the moment the switch is turned off, mid-sentence', () => {
    useUiStore.setState({ companionEnabled: true, companionSpeakAloud: true });
    render(<Harness />);
    expect(companionSpeaker()).toBe(companionTtsSpeaker);

    const cancel = vi.spyOn(companionTtsSpeaker, 'cancel');
    act(() => {
      useUiStore.setState({ companionSpeakAloud: false });
    });

    expect(companionSpeaker()).toBe(silentSpeaker);
    // Unregistering alone would leave the utterance speechSynthesis has
    // already accepted talking after the user asked for quiet.
    expect(cancel).toHaveBeenCalled();
    cancel.mockRestore();
  });

  it('unregisters on unmount', () => {
    useUiStore.setState({ companionEnabled: true, companionSpeakAloud: true });
    const view = render(<Harness />);
    expect(companionSpeaker()).toBe(companionTtsSpeaker);
    view.unmount();
    expect(companionSpeaker()).toBe(silentSpeaker);
  });
});
