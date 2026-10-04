import {
  SF3D_DOWNLOAD_BYTES,
  SF3D_ENTERPRISE_URL,
  SF3D_LICENCE_NAME,
  SF3D_LICENCE_SHA256,
  SF3D_LICENCE_TEXT,
  SF3D_REPO,
  SF3D_REVENUE_LIMIT_USD,
  SF3D_REVISION,
} from '@midnite/studio-shared';
import { useState } from 'react';
import { LuDownload, LuTriangleAlert } from 'react-icons/lu';

import { Modal } from '../../../components/modal';
import { formatBytes } from './use-sf3d';

/**
 * The consent step for SF3D (Phase 103 Theme J): the Stability AI Community License, verbatim, and
 * its US$1M annual-revenue line, shown *before* anything is downloaded. Accept is off until the
 * user ticks both boxes; it records consent to this exact licence text (its sha256) and only then
 * starts the download.
 */
export function Sf3dConsentDialog({
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
  const limit = `US$${SF3D_REVENUE_LIMIT_USD.toLocaleString('en-US')}`;

  return (
    <Modal open={open} onClose={onClose} title={SF3D_LICENCE_NAME} size="lg" testId="sf3d-consent">
      <div className="flex flex-col gap-3 text-xs">
        <p
          role="note"
          data-testid="sf3d-revenue-note"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-foreground"
        >
          <LuTriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            SF3D is free for research, non-commercial use and for individuals and organisations with <strong>less than {limit} in annual revenue</strong>.
            Above that, the licence ends and you need a Stability AI Enterprise licence ({SF3D_ENTERPRISE_URL}). Commercial use also requires
            registering with Stability AI.
          </span>
        </p>
        <p className="text-muted-foreground">
          Accepting downloads {formatBytes(SF3D_DOWNLOAD_BYTES)} — the community ONNX port <code className="font-mono">{SF3D_REPO}</code> at
          revision <code className="font-mono">{SF3D_REVISION.slice(0, 7)}</code> — into this app’s data folder, checking every file’s sha256.
          It runs on this Mac; your pictures never leave it. You can uninstall it at any time.
        </p>
        <pre
          data-testid="sf3d-licence-text"
          tabIndex={0}
          className="max-h-[42vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
        >
          {SF3D_LICENCE_TEXT}
        </pre>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} data-testid="sf3d-consent-read" className="mt-0.5" />
          <span>I have read and accept the {SF3D_LICENCE_NAME}.</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={revenue} onChange={(e) => setRevenue(e.target.checked)} data-testid="sf3d-consent-revenue" className="mt-0.5" />
          <span>
            I (and any organisation I use this for) earn less than {limit} a year, or hold a Stability AI Enterprise licence.
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-border px-3 hover:bg-accent">
            Not now
          </button>
          <button
            type="button"
            data-testid="sf3d-consent-accept"
            disabled={!read || !revenue || busy}
            onClick={() => onAccept(SF3D_LICENCE_SHA256)}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            <LuDownload aria-hidden className="h-3.5 w-3.5" />
            Accept and download {formatBytes(SF3D_DOWNLOAD_BYTES)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
