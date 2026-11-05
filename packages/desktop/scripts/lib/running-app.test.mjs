import { describe, expect, it } from 'vitest';
import { findAppMainPids } from './running-app.mjs';

const exe = '/Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio';

describe('findAppMainPids', () => {
  it('finds the main process', () => {
    expect(findAppMainPids(`  101 ${exe}\n`, exe)).toEqual([101]);
  });
  it('ignores the broker, helpers, other apps and unrelated processes', () => {
    const ps = [
      `  200 ${exe} /Applications/Midnite Studio.app/Contents/Resources/app.asar/broker.js`,
      `  201 ${exe} --type=renderer`,
      `  202 /Applications/Midnite Studio.app/Contents/Frameworks/Midnite Studio Helper.app/Contents/MacOS/Midnite Studio Helper`,
      `  203 /Users/x/other/Midnite Studio.app/Contents/MacOS/Midnite Studio`,
      `  204 vim ${exe}`,
      `  101 ${exe}`,
    ].join('\n');
    expect(findAppMainPids(ps, exe)).toEqual([101]);
  });
  it('returns nothing when not running', () => {
    expect(findAppMainPids('  1 /sbin/launchd\n', exe)).toEqual([]);
  });
});
