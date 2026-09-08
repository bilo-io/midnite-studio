#!/bin/sh
# Midnite Studio installer — macOS (Apple Silicon)
#
#   curl -fsSL https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-studio/install.sh | sh
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
# Version resolution reads midnite-studio/version.json rather than
# releases/latest: this repo distributes several apps, so `releases/latest` is
# whichever app shipped most recently and is not necessarily this one.
#
# Options (environment variables):
#   MIDNITE_STUDIO_VERSION=0.3.1   install a specific version instead of the latest
#   MIDNITE_STUDIO_NO_OPEN=1       don't launch the app after installing

set -eu

REPO="bilo-io/midnite-apps"
FEED="https://raw.githubusercontent.com/$REPO/main/midnite-studio/version.json"
APP="Midnite Studio.app"
EXE="Midnite Studio"
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
[ "$(uname -s)" = "Darwin" ] || fail "Midnite Studio is macOS-only."
[ "$(uname -m)" = "arm64" ] || fail "Midnite Studio ships Apple Silicon (arm64) builds only, and this Mac reports $(uname -m)."
command -v curl >/dev/null 2>&1 || fail "curl is required."

# ── Resolve version ──────────────────────────────────────────────────────────
if [ -n "${MIDNITE_STUDIO_VERSION:-}" ]; then
  version="${MIDNITE_STUDIO_VERSION#v}"
else
  # The per-app update feed. Parsed with sed rather than jq so the installer has
  # no dependency beyond curl — the file is generated, so its shape is stable.
  feed=$(curl -fsSL "$FEED") || fail "could not reach github.com to resolve the latest version."
  version=$(printf '%s' "$feed" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  [ -n "$version" ] ||
    fail "Midnite Studio has no published release yet. Watch https://github.com/$REPO/releases for the first one."
fi

tag="midnite-studio/v${version}"
asset="midnite-studio-${version}-arm64.zip"
url="https://github.com/$REPO/releases/download/${tag}/${asset}"

tmp=$(mktemp -d)
staged="$DEST/.midnite-studio.new.$$"
backup="$DEST/.midnite-studio.old.$$"
# Best-effort cleanup of the temp dir and any staging leftovers on exit.
cleanup() {
  rm -rf "$tmp" 2>/dev/null || true
  [ -e "$staged" ] && { rm -rf "$staged" 2>/dev/null || sudo rm -rf "$staged" 2>/dev/null || true; }
}
trap cleanup EXIT

say "Downloading Midnite Studio v${version} …"
curl -fL --progress-bar "$url" -o "$tmp/$asset" || fail "download failed: $url"

# ditto (not unzip/cp) preserves the code-signing seal and extended attributes.
ditto -xk "$tmp/$asset" "$tmp/extracted" || fail "could not extract $asset — the download may be corrupt. Re-run the installer."
[ -d "$tmp/extracted/$APP" ] || fail "archive did not contain $APP"

# Gate on a complete download BEFORE touching /Applications — a truncated
# download/extract stops here instead of installing a broken app.
say "Verifying download …"
verify_bundle "$tmp/extracted/$APP" ||
  fail "the downloaded app is incomplete (interrupted download?). Nothing was installed — re-run the installer."

# ── Install (staged + atomic) ────────────────────────────────────────────────
# Quit a running copy so the bundle can be replaced (best-effort).
if pgrep -xq "$EXE" 2>/dev/null; then
  say "Quitting the running Midnite Studio …"
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
run xattr -dr com.apple.quarantine "$DEST/$APP" 2>/dev/null || true

say ""
say "✓ Midnite Studio v${version} installed."
if [ -z "${MIDNITE_STUDIO_NO_OPEN:-}" ]; then
  open "$DEST/$APP"
else
  say "Launch it with: open -a \"$EXE\""
fi
