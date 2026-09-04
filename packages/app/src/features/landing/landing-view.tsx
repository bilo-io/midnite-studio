import { Brand } from '../../components/brand';
import { NeuroCloudBackground } from '../screensaver/neuro-cloud-background';
import { LockScreenChrome } from '../screensaver/lock-screen-chrome';
import { applyPillDestination } from '../screensaver/pill-destinations';
import { ScreensaverStage, useScreensaverReading } from '../screensaver/screensaver-stage';
import { useAppearanceStore } from '../../store/appearance-store';
import { useUiStore } from '../../store/ui-store';
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
 * The border and the blurred inner rim are the FAB loop console panel's own
 * rotating rainbow, to the pixel — both wear the shared `.gradient-frame`
 * class (see the note on that class in `styles.css`), not a copy of it. This
 * page fixes its own half-ring arc rather than reading one off
 * `[data-fab-tab]` (it has no tab), so the same orbiting-segment behaviour
 * the FAB panel's border and glow have shows here too, and — like the FAB
 * panel itself — the page carries no border-radius, so its corners sit
 * flush with the content box around it.
 */
export function LandingView() {
  const reading = useScreensaverReading();
  const reduced = useAppearanceStore((s) => s.motion) === 'reduced';
  const setActiveView = useUiStore((s) => s.setActiveView);
  const setReposOpen = useUiStore((s) => s.setReposOpen);
  const setTerminalOpen = useUiStore((s) => s.setTerminalOpen);

  // The rotation and the rim pulse both freeze while the OS has focus
  // elsewhere, exactly as the FAB console's do — same attribute, same CSS.
  useWindowFocusGate(true);

  const slides: readonly CarouselSlide[] = [
    {
      key: 'stage',
      label: 'Workspace status',
      // Held still for the length of the transition, so the word types
      // itself out once the slide has settled rather than while it moves.
      // No passcode gate here (Phase 46 Theme C): this is a real view, not
      // an overlay to unlock, so a pill click navigates immediately.
      render: (active) => (
        <ScreensaverStage
          {...reading}
          paused={!active}
          onPillClick={(key) => applyPillDestination(key, { setActiveView, setReposOpen, setTerminalOpen })}
        />
      ),
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
      className="gradient-frame landing-panel-gradient relative flex h-full w-full flex-col items-center justify-center overflow-hidden border border-border bg-popover px-6 text-center"
    >
      <NeuroCloudBackground animate={!reduced} />

      <LockScreenChrome
        topCentre={
          <Brand
            data-testid="landing-brand"
            className="gap-2.5 drop-shadow-sm"
            markClassName="h-7 w-7"
            wordmarkClassName="text-xl"
          />
        }
      />

      <LandingCarousel slides={slides} />
    </div>
  );
}
