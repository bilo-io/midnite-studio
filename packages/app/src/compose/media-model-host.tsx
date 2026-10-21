import type { ModelComposerProps, ModelHost, ModelPickerProvider } from '@midnite/studio-feature-media-model/renderer';
import { lazy, useMemo } from 'react';
import { LuImagePlus } from 'react-icons/lu';

import { AiComposer, AttachMenu, ProviderModelPicker, useComposerMic } from '../components/ai-thread';
import { IconSelect } from '../components/icon-select';
import { resolveAgentIcon } from '../components/icons';
import { Modal } from '../components/modal';
import { TreeSection } from '../components/tree-section';
import { useAgents } from '../features/terminal/use-agents';
import { MEDIA_PROMPT_BOX } from '../features/media/prompt-input';
import { useSpeakOutcome, useVoiceThread } from '../features/media/voice/use-voice-thread';
import { SpeechToggle } from '../features/media/voice/voice-controls';
import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the Model feature's host port (Phase 113 Theme S).
 *
 * The prompt box is the ai-thread composer with its engine picker, the "+" attach menu, hold-to-talk and the
 * spoken outcome; the engine picker's agents are the roster's, with the primary agent recommended; the
 * explorer's tree sections persist their open state in `ui-store`'s `collapsedAccordionSections` (so no
 * stored key moved); the SF3D licence is Studio's focus-trapped `Modal`; the editor's shading and projection
 * dropdowns are Studio's `IconSelect`; and `model.json` is read in Monaco, loaded on first use.
 *
 * Installed by Studio's Media view (`features/media/media-view.tsx`), not by `StudioProviders`: the tab
 * renders nowhere else, and the view is a lazy chunk, so the AI chrome this host carries stays out of the
 * entry chunk.
 */

function Composer({ picker, attach, outcome, onDictation, ...props }: ModelComposerProps) {
  const voice = useVoiceThread();
  const mic = useComposerMic({ onTranscript: onDictation });
  useSpeakOutcome(voice, outcome.busy, outcome.error, outcome.done);
  return (
    <AiComposer
      {...props}
      enterToSend={false}
      mic={mic}
      boxClassName={MEDIA_PROMPT_BOX}
      leading={
        <>
          <ProviderModelPicker
            testId={picker.testId}
            providers={[...picker.providers] as ModelPickerProvider[]}
            provider={picker.provider}
            onProviderChange={picker.onProviderChange}
            models={[...picker.models]}
            model={picker.model}
            onModelChange={picker.onModelChange}
          />
          <AttachMenu testId={attach.testId} options={[{ id: 'image', label: attach.label, icon: LuImagePlus, onSelect: attach.onSelect }]} />
        </>
      }
      trailing={<SpeechToggle voice={voice} />}
    />
  );
}

function useAgentRoster() {
  const primaryAgent = useUiStore((s) => s.primaryAgent);
  const { agents } = useAgents();
  const roster = useMemo(
    () => agents.map((a) => ({ id: a.id, label: a.label, icon: resolveAgentIcon(a), ...(a.accent ? { accent: a.accent } : {}) })),
    [agents],
  );
  return { agents: roster, primaryAgent };
}

function useTreeCollapse() {
  const collapsed = useUiStore((s) => s.collapsedAccordionSections);
  const toggle = useUiStore((s) => s.toggleAccordionSection);
  return { collapsed, toggle };
}

/** Monaco is heavy and only this pane wants it, so it loads on first use — the API client's field, read-only. */
const JsonView = lazy(() =>
  import('./api-client/api-client-code-field').then((m) => ({
    default: ({ text }: { text: string }) => <m.ApiClientCodeField value={text} onChange={() => undefined} language="json" readOnly />,
  })),
);

export const STUDIO_MODEL_HOST = {
  Composer,
  useAgentRoster,
  resolveAgentIcon: (id) => resolveAgentIcon({ id }),
  TreeSection,
  useTreeCollapse,
  Modal,
  IconSelect,
  JsonView,
} satisfies ModelHost;
