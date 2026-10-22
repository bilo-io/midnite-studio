/** Captured-shape fixtures for Theme D's parsers. */

export const HOME = '/Users/dev';

export const CODESIGN_DEVID = `Executable=/Applications/Foo.app/Contents/MacOS/Foo
Identifier=com.foo.app
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=1234 flags=0x10000(runtime) hashes=30+7 location=embedded
Signature size=9012
Authority=Developer ID Application: Foo Inc (ABCDE12345)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
TeamIdentifier=ABCDE12345
`;

export const CODESIGN_ADHOC = `Executable=/opt/homebrew/bin/tool
Identifier=tool
Format=Mach-O thin (arm64)
CodeDirectory v=20400 size=500 flags=0x20002(adhoc,linker-signed) hashes=10+0 location=embedded
Signature=adhoc
TeamIdentifier=not set
`;

export const CODESIGN_UNSIGNED = '/tmp/x: code object is not signed at all\n';

/** A benign Homebrew launch agent. */
export const PLIST_HOMEBREW = JSON.stringify({
  Label: 'homebrew.mxcl.postgresql@16',
  ProgramArguments: ['/opt/homebrew/opt/postgresql@16/bin/postgres', '-D', '/opt/homebrew/var/postgresql@16'],
  RunAtLoad: true,
  KeepAlive: true,
});

/** An AMOS-shaped agent: hidden target under Application Support. */
export const PLIST_AMOS = JSON.stringify({
  Label: 'com.apple.updater.helper',
  ProgramArguments: [`${HOME}/Library/Application Support/.x/x`],
  RunAtLoad: true,
  KeepAlive: { SuccessfulExit: false },
});

export const PS_TABLE = `  PID  PPID   UID COMM             ARGS
    1     0     0 /sbin/launchd    /sbin/launchd
  400     1   501 /bin/zsh         -zsh
  500   400   501 /Users/dev/Library/Application Support/.x/x /Users/dev/Library/Application Support/.x/x --run
  600     1   501 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --flag
  700   400   501 /opt/homebrew/bin/node node server.js
`;
