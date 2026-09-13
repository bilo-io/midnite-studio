import { describe, expect, it } from 'vitest';
import { classifyProcess } from './classify-process.mjs';

describe('classifyProcess', () => {
  it('classifies the pty broker checked first even without --type', () => {
    const args =
      '/Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio /path/to/dist/bundle/broker.js --socket=/tmp/broker.sock';
    expect(classifyProcess(args)).toBe('broker');
  });

  it('classifies the main process with no --type', () => {
    const args =
      '/Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio --remote-debugging-port=0 /Users/user/project';
    expect(classifyProcess(args)).toBe('main');
  });

  it('classifies the renderer process', () => {
    const args =
      '/Applications/Midnite Studio.app/Contents/Frameworks/Electron Framework.framework/Helpers/Midnite Studio Helper.app/Contents/MacOS/Midnite Studio Helper --type=renderer --enable-blink-features=MiddleClickAutoscroll';
    expect(classifyProcess(args)).toBe('renderer');
  });

  it('classifies the GPU process', () => {
    const args =
      '/Applications/Midnite Studio.app/Contents/Frameworks/Electron Framework.framework/Helpers/Midnite Studio Helper.app/Contents/MacOS/Midnite Studio Helper --type=gpu-process --field-trial-handle=123';
    expect(classifyProcess(args)).toBe('gpu');
  });

  it('classifies a utility process by --utility-sub-type', () => {
    const args =
      '/Applications/Midnite Studio.app/Contents/Frameworks/Electron Framework.framework/Helpers/Midnite Studio Helper.app/Contents/MacOS/Midnite Studio Helper --type=utility --utility-sub-type=network.mojom.NetworkService';
    expect(classifyProcess(args)).toBe('utility:network.mojom.NetworkService');
  });

  it('classifies a utility process by --service-name', () => {
    const args =
      '/Applications/Midnite Studio.app/Contents/Frameworks/Electron Framework.framework/Helpers/Midnite Studio Helper.app/Contents/MacOS/Midnite Studio Helper --type=utility --service-name=storage.mojom.StorageService';
    expect(classifyProcess(args)).toBe('utility:storage.mojom.StorageService');
  });

  it('classifies a utility process with no subtype/service name as other', () => {
    const args =
      '/Applications/Midnite Studio.app/Contents/Frameworks/Electron Framework.framework/Helpers/Midnite Studio Helper.app/Contents/MacOS/Midnite Studio Helper --type=utility';
    expect(classifyProcess(args)).toBe('other');
  });

  it('classifies unknown process types as other', () => {
    const args =
      '/Applications/Midnite Studio.app/Contents/Frameworks/Electron Framework.framework/Helpers/Midnite Studio Helper.app/Contents/MacOS/Midnite Studio Helper --type=zygote';
    expect(classifyProcess(args)).toBe('other');
  });

  it('falls back safely on empty or non-string input', () => {
    expect(classifyProcess('')).toBe('other');
    expect(classifyProcess(null)).toBe('other');
  });
});
