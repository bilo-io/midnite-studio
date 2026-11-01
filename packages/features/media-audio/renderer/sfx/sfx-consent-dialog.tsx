import {
  SFX_ATTRIBUTION,
  SFX_DOWNLOAD_BYTES,
  SFX_ENTERPRISE_URL,
  SFX_LICENCE_NAME,
  SFX_LICENCE_SHA256,
  SFX_LICENCE_TEXT,
  SFX_REPO,
  SFX_REVENUE_LIMIT_USD,
  SFX_REVISION,
} from '@midnite/studio-shared';
import { useState } from 'react';
import { LuDownload, LuTriangleAlert } from 'react-icons/lu';

import { FrameModal } from '@midnite/studio-frame';

import { formatBytes } from './format';

/**
 * The consent step for Stable Audio Open Small: the Stability AI Community License, verbatim, and its
 * US$1M annual-revenue line, shown *before* anything is downloaded. Accept is off until both boxes are
 * ticked; it records consent to this exact licence text (its sha256) and only then starts the download.
 * An agent can never reach this: the MCP tools only tell it to ask the user to open Media ▸ SFX.
 */
export function SfxConsentDialog({
  open,
  onClose,
  onAccept,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onAccept: (licenceSha256: string) => void;
  busy?: boolean;
}) {
  const [read, setRead] = useState(false);
  const [revenue, setRevenue] = useState(false);
  const limit = `US$${SFX_REVENUE_LIMIT_USD.toLocaleString('en-US')}`;

  return (
    <FrameModal open={open} onClose={onClose} title={SFX_LICENCE_NAME} size="lg" scope="window" testId="sfx-consent">
      <div className="flex max-h-[inherit] flex-col gap-3 p-4 text-xs">
        <h2 className="text-sm font-semibold text-foreground">Set up Stable Audio Open Small — {SFX_LICENCE_NAME}</h2>
        <p
          role="note"
          data-testid="sfx-revenue-note"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-foreground"
        >
          <LuTriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            Stable Audio Open Small is free for research, non-commercial use and for individuals and organisations with{' '}
            <strong>less than {limit} in annual revenue</strong>. Above that, the licence ends and you need a Stability AI Enterprise licence (
            {SFX_ENTERPRISE_URL}). Commercial use also requires registering with Stability AI, and a product that ships its sounds shows “
            {SFX_ATTRIBUTION}”.
          </span>
        </p>
        <p className="text-muted-foreground">
          Accepting downloads {formatBytes(SFX_DOWNLOAD_BYTES)} — the community ONNX port <code className="font-mono">{SFX_REPO}</code> at revision{' '}
          <code className="font-mono">{SFX_REVISION.slice(0, 7)}</code> — into this app’s data folder, checking every file’s sha256. It runs on
          this Mac; your prompts never leave it. You can uninstall it at any time.
        </p>
        <pre
          data-testid="sfx-licence-text"
          tabIndex={0}
          className="min-h-[120px] flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
        >
          {SFX_LICENCE_TEXT}
        </pre>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} data-testid="sfx-consent-read" className="mt-0.5" />
          <span>I have read and accept the {SFX_LICENCE_NAME}.</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={revenue} onChange={(e) => setRevenue(e.target.checked)} data-testid="sfx-consent-revenue" className="mt-0.5" />
          <span>I (and any organisation I use this for) earn less than {limit} a year, or hold a Stability AI Enterprise licence.</span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-border px-3 hover:bg-accent">
            Not now
          </button>
          <button
            type="button"
            data-testid="sfx-consent-accept"
            disabled={!read || !revenue || busy}
            onClick={() => onAccept(SFX_LICENCE_SHA256)}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            <LuDownload aria-hidden className="h-3.5 w-3.5" />
            Accept and download {formatBytes(SFX_DOWNLOAD_BYTES)}
          </button>
        </div>
      </div>
    </FrameModal>
  );
}
