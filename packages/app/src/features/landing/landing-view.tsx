import { NeuroCloudBackground } from '../screensaver/neuro-cloud-background';
import { LockScreenChrome } from '../screensaver/lock-screen-chrome';
import { ScreensaverStage, useScreensaverReading } from '../screensaver/screensaver-stage';
import { useAppearanceStore } from '../../store/appearance-store';
import { useWindowFocusGate } from '../../lib/use-window-focus-gate';
import { LandingCarousel, type CarouselSlide } from './landing-carousel';
import { SHORTCUT_BATCHES } from './landing-shortcuts';
import { FabSlide, ShortcutSlide } from './landing-slides';

/**
 * The landing page — the app's front door, at `/`.
 *
 * It is the screensaver seen from the inside: the same neural-cloud
 * background, the same corner clock and date, the same finance and
 * system-monitor widgets (`LockScreenChrome`), and the same centre stage on
 * its first slide (`ScreensaverStage`). What differs is that the middle
 * paginates — the screensaver's stage, then two batches of keyboard
 * shortcuts, then the loop console explained — while everything around it
 * holds still.
 *
 * Unlike the screensaver this is a *view*, not a portal: it renders inside
 * the app's own content box, so the rail, the title bar and the status bar
 * stay where they are and the page is somewhere you can navigate away from
 * rather than something you dismiss.
 *
 * `.landing-panel-gradient` is the FAB console's own rotating rainbow — the
 * same declaration, shared rather than copied (see the note on that selector
 * in `styles.css`), so the border and the blurred inner rim are the FAB's to
 * the pixel.
 */
export function LandingView() {
  const reading = useScreensaverReading();
  const reduced = useAppearanceStore((s) => s.motion) === 'reduced';

  // The rotation and the rim pulse both freeze while the OS has focus
  // elsewhere, exactly as the FAB console's do — same attribute, same CSS.
  useWindowFocusGate(true);

  const slides: readonly CarouselSlide[] = [
    {
      key: 'stage',
      label: 'Workspace status',
      // Held still for the length of the transition, so the word types
      // itself out once the slide has settled rather than while it moves.
      render: (active) => <ScreensaverStage {...reading} paused={!active} />,
    },
    ...SHORTCUT_BATCHES.map((batch) => ({
      key: `shortcuts-${batch.title}`,
      label: batch.title,
      render: () => <ShortcutSlide batch={batch} />,
    })),
    { key: 'fab', label: 'The loop console', render: () => <FabSlide /> },
  ];

  return (
    <div
      data-testid="landing-view"
      className="landing-panel-gradient relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-popover px-6 text-center"
    >
      <NeuroCloudBackground animate={!reduced} />

      <LockScreenChrome />

      <LandingCarousel slides={slides} />
    </div>
  );
}
