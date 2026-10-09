import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import type { ImageAspect } from '@midnite/studio-shared';

import { ImageProviderError, type GeneratedImage, type ImageProvider } from './types';

/**
 * Antigravity CLI (`agy`) — image generation with no API key. `agy -p` runs
 * one non-interactive turn; the prompt below asks it to use its image
 * generation tool and write the result into the (throwaway) working directory,
 * which we then read back. `--mode accept-edits` lets it write there without a
 * prompt. This is also what main falls back to when a Gemini/OpenAI key is
 * missing (see `image-service.ts`).
 */
export const AGY_COMMAND = 'agy';
export const AGY_TIMEOUT_MS = 5 * 60_000;
export const AGY_MISSING_REASON =
  'Antigravity CLI (agy) was not found. Install it, or add an API key in Settings ▸ Media.';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export type AgyRunner = (args: string[], opts: { cwd: string; signal: AbortSignal }) => Promise<void>;

/** The instruction handed to `agy -p`. Exported for tests. */
export function agyImagePrompt(prompt: string, aspect: ImageAspect, file: string): string {
  return (
    `Use your image generation tool to create one image: ${prompt}\n` +
    `Aspect ratio ${aspect}. Save the image into the current directory as ${file}. ` +
    'Do not write any other files. Reply with the file name only.'
  );
}

export function agyArgs(instruction: string): string[] {
  return ['-p', instruction, '--mode', 'accept-edits'];
}

const defaultRunner: AgyRunner = (args, { cwd, signal }) =>
  new Promise((resolve, reject) => {
    execFile(AGY_COMMAND, args, { cwd, signal, timeout: AGY_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (error, _out, stderr) => {
      if (!error) return resolve();
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return reject(new ImageProviderError(AGY_MISSING_REASON));
      if (signal.aborted) return reject(error);
      const detail = String(stderr).trim().split('\n').at(-1);
      reject(new ImageProviderError(`Antigravity CLI failed${detail ? `: ${detail}` : '.'}`));
    });
  });

/** Whether `agy` can be launched at all. Never throws. */
export function isAgyInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(AGY_COMMAND, ['--help'], { timeout: 5000 }, (error) => {
      resolve(!error || (error as NodeJS.ErrnoException).code !== 'ENOENT');
    });
  });
}

export function createAgyImageProvider(run: AgyRunner = defaultRunner): ImageProvider {
  return {
    id: 'agy',
    generate: async (req, deps) => {
      const images: GeneratedImage[] = [];
      for (let i = 0; i < req.count; i++) {
        const dir = await mkdtemp(join(tmpdir(), 'midnite-agy-image-'));
        try {
          await run(agyArgs(agyImagePrompt(req.prompt, req.aspect, 'image.png')), { cwd: dir, signal: deps.signal });
          const found = (await readdir(dir)).find((name) => MIME_BY_EXT[extname(name).toLowerCase()]);
          if (!found) {
            throw new ImageProviderError('Antigravity CLI finished without producing an image. Try rewording the prompt.');
          }
          const image = { bytes: await readFile(join(dir, found)), mime: MIME_BY_EXT[extname(found).toLowerCase()]! };
          images.push(image);
          deps.onImage?.(image);
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      }
      return images;
    },
  };
}

export const agyImageProvider = createAgyImageProvider();
