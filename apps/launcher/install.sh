#!/bin/sh
# Midnite Apps installer — macOS (Apple Silicon)
#
#   curl -fsSL https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-launcher/install.sh | sh
#
# Downloads the latest release .zip with curl and installs it to /Applications.
# Because curl (unlike a browser) never sets the com.apple.quarantine attribute,
# the app opens normally on first launch — no Gatekeeper "unverified app" popup.
#
# Robust by design: the app is staged and integrity-checked (Info.plist +
# full-size Electron Framework) BEFORE it replaces the installed copy, then
# swapped in atomically with the previous version kept as a backup until the new
# one verifies. An interrupted download or copy can never leave a broken app in
# /Applications — the exact failure that a plain `ditto` install can silently
# produce (missing Frameworks → dyld "Library not loaded" crash on launch).
#
# Version resolution reads midnite-launcher/version.json rather than
# releases/latest: this repo distributes several apps, so `releases/latest` is
# whichever app shipped most recently and is not necessarily this one.
#
# Options (environment variables):
#   MIDNITE_LAUNCHER_VERSION=0.3.1   install a specific version instead of the latest
#   MIDNITE_LAUNCHER_NO_OPEN=1       don't launch the app after installing

set -eu

REPO="bilo-io/midnite-apps"
FEED="https://raw.githubusercontent.com/$REPO/main/midnite-launcher/version.json"
APP="Midnite Apps.app"
EXE="Midnite Apps"
DEST="/Applications"
# The framework binary is ~150MB; a truncated copy is the failure we guard
# against, so treat anything under 100MB as incomplete.
MIN_FRAMEWORK_BYTES=104857600

say() { printf '%s\n' "$*"; }
fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

# Verify a .app bundle is structurally complete. $1 = bundle path.
# Returns non-zero (logging what's missing) for a partial/truncated bundle.
verify_bundle() {
  _b="$1"
  [ -f "$_b/Contents/Info.plist" ] || { echo "  missing Contents/Info.plist" >&2; return 1; }
  [ -x "$_b/Contents/MacOS/$EXE" ] || { echo "  missing Contents/MacOS/$EXE" >&2; return 1; }
  _fw="$_b/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
  [ -f "$_fw" ] || { echo "  missing Electron Framework" >&2; return 1; }
  _sz=$(stat -f%z "$_fw" 2>/dev/null || echo 0)
  [ "$_sz" -gt "$MIN_FRAMEWORK_BYTES" ] ||
    { echo "  Electron Framework is only ${_sz} bytes — incomplete copy" >&2; return 1; }
  return 0
}

# ── Preflight ────────────────────────────────────────────────────────────────
[ "$(uname -s)" = "Darwin" ] || fail "Midnite Apps is macOS-only."
[ "$(uname -m)" = "arm64" ] || fail "Midnite Apps ships Apple Silicon (arm64) builds only, and this Mac reports $(uname -m)."
command -v curl >/dev/null 2>&1 || fail "curl is required."

# ── Resolve version ──────────────────────────────────────────────────────────
# Fetched best-effort even for a pinned version: it is also where the zip's digest lives.
feed=$(curl -fsSL "$FEED" 2>/dev/null) || feed=""
if [ -n "${MIDNITE_LAUNCHER_VERSION:-}" ]; then
  version="${MIDNITE_LAUNCHER_VERSION#v}"
else
  # The per-app update feed. Parsed with sed rather than jq so the installer has
  # no dependency beyond curl — the file is generated, so its shape is stable.
  [ -n "$feed" ] || fail "could not reach github.com to resolve the latest version."
  version=$(printf '%s' "$feed" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  [ -n "$version" ] ||
    fail "Midnite Apps has no published release yet. Watch https://github.com/$REPO/releases for the first one."
fi

# The zip's sha256, from the same feed (Phase 91 Theme H). The feed describes one
# version only, so a pinned install of a different version has no digest to check.
feed_version=$(printf '%s' "$feed" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
expected_sha=""
if [ "$feed_version" = "$version" ]; then
  expected_sha=$(printf '%s' "$feed" | sed -n 's/.*"sha256"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]\{64\}\)".*/\1/p' | tr 'A-F' 'a-f')
fi

tag="midnite-launcher/v${version}"
asset="midnite-launcher-${version}-arm64.zip"
url="https://github.com/$REPO/releases/download/${tag}/${asset}"

tmp=$(mktemp -d)
staged="$DEST/.midnite-launcher.new.$$"
backup="$DEST/.midnite-launcher.old.$$"
# Best-effort cleanup of the temp dir and any staging leftovers on exit.
# An if, not `[ … ] &&`: under `set -e` a false test as the trap's last command
# becomes the script's exit status, so every successful install exited 1.
cleanup() {
  rm -rf "$tmp" 2>/dev/null || true
  if [ -e "$staged" ]; then
    rm -rf "$staged" 2>/dev/null || sudo rm -rf "$staged" 2>/dev/null || true
  fi
}
trap cleanup EXIT

say "Downloading Midnite Apps v${version} …"
curl -fL --progress-bar "$url" -o "$tmp/$asset" || fail "download failed: $url"

# Integrity before anything reads the archive (Phase 91 Theme H): a truncated or
# tampered zip stops here, not inside ditto.
if [ -n "$expected_sha" ]; then
  say "Verifying checksum …"
  actual_sha=$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)
  [ "$actual_sha" = "$expected_sha" ] ||
    fail "checksum mismatch for $asset (expected $expected_sha, got $actual_sha). Nothing was installed."
  say "  sha256 $actual_sha"
else
  printf 'warning: the release feed carries no sha256 for v%s (an older release) — skipping checksum verification.\n' "$version" >&2
fi

# ditto (not unzip/cp) preserves the code-signing seal and extended attributes.
ditto -xk "$tmp/$asset" "$tmp/extracted" || fail "could not extract $asset — the download may be corrupt. Re-run the installer."
[ -d "$tmp/extracted/$APP" ] || fail "archive did not contain $APP"

# Gate on a complete download BEFORE touching /Applications — a truncated
# download/extract stops here instead of installing a broken app.
say "Verifying download …"
verify_bundle "$tmp/extracted/$APP" ||
  fail "the downloaded app is incomplete (interrupted download?). Nothing was installed — re-run the installer."

# Assess the signature BEFORE installing (Phase 91 Theme H). codesign --verify
# catches a tampered or broken seal, and that refuses. spctl asks Gatekeeper
# whether it would run the app; every build ships ad hoc signed until
# notarisation lands, and Gatekeeper rejects all of those, so a rejection warns
# rather than refuses — refusing would turn away every install of every release.
# The sha256 above is what ties the zip to the release; spctl adds nothing to it
# for an unnotarised build.
say "Checking code signature …"
codesign --verify --deep --strict "$tmp/extracted/$APP" 2>"$tmp/codesign.err" || {
  cat "$tmp/codesign.err" >&2
  fail "the app's code signature is invalid. Nothing was installed."
}
gatekeeper_ok=1
if ! spctl --assess --type execute "$tmp/extracted/$APP" 2>/dev/null; then
  gatekeeper_ok=0
  say "warning: Gatekeeper rejects this build (signed ad hoc, not notarised). Its code signature is intact, so it is installed anyway." >&2
fi

# ── Install (staged + atomic) ────────────────────────────────────────────────
# Quit a running copy so the bundle can be replaced (best-effort).
if pgrep -xq "$EXE" 2>/dev/null; then
  say "Quitting the running Midnite Apps …"
  osascript -e "tell application \"$EXE\" to quit" >/dev/null 2>&1 || true
  sleep 2
fi

# Elevate only if /Applications isn't writable by this user.
SUDO=""
if [ -w "$DEST" ] && { [ ! -e "$DEST/$APP" ] || [ -w "$DEST/$APP" ]; }; then
  :
else
  say "(administrator password needed to write to $DEST)"
  SUDO="sudo"
fi
run() { if [ -n "$SUDO" ]; then sudo "$@"; else "$@"; fi; }

say "Installing to $DEST/$APP …"
run rm -rf "$staged" "$backup"
# Stage on the SAME volume as $DEST so the final swap is an atomic rename.
run ditto "$tmp/extracted/$APP" "$staged"
verify_bundle "$staged" || { run rm -rf "$staged"; fail "staged copy is incomplete — $DEST left untouched."; }

# Swap: move the old copy aside, rename the staged one into place.
if [ -e "$DEST/$APP" ]; then run mv "$DEST/$APP" "$backup"; fi
if ! run mv "$staged" "$DEST/$APP"; then
  [ -e "$backup" ] && run mv "$backup" "$DEST/$APP"
  fail "could not move the new app into place — previous copy restored."
fi

# Final integrity check on the live bundle; restore the backup if it fails.
if ! verify_bundle "$DEST/$APP"; then
  run rm -rf "$DEST/$APP"
  [ -e "$backup" ] && run mv "$backup" "$DEST/$APP"
  fail "installed bundle failed verification — previous copy restored."
fi
run rm -rf "$backup"

# curl doesn't quarantine, but clear the bit defensively (e.g. re-runs over a
# browser-downloaded copy). Best-effort: the attribute usually isn't there.
# Only for a build codesign and Gatekeeper both passed: stripping it from one that
# did not would hide exactly the refusal Gatekeeper should be making.
[ "$gatekeeper_ok" = 1 ] && { run xattr -dr com.apple.quarantine "$DEST/$APP" 2>/dev/null || true; }

say ""
say "✓ Midnite Apps v${version} installed."
if [ -z "${MIDNITE_LAUNCHER_NO_OPEN:-}" ]; then
  open "$DEST/$APP"
else
  say "Launch it with: open -a \"$EXE\""
fi
