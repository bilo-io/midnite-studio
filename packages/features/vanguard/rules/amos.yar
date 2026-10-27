/*
 * Vanguard ruleset: AMOS / MacSync-style macOS stealers (Phase 120 Theme F).
 *
 * Subset-conformant (see clickfix.yar). These are the behavioural shapes the macOS stealer write-ups agree
 * on (Moonlock, Jamf, Kandji, Trend Micro): a fake password dialog verified with dscl, and a script that
 * zips the keychain and browser stores for upload. Deliberately two-part conditions, so a legitimate
 * keychain helper that only does one of them stays quiet.
 */

rule AMOS_Password_Phish_Dialog
{
  meta:
    description = "A password dialog with a hidden answer whose result is checked with dscl"
    source = "Atomic macOS Stealer write-ups"
    severity = "high"
  strings:
    $dialog = /display dialog[^\n]{0,160}(enter|type|provide)[^\n]{0,60}password/ nocase
    $hidden = "with hidden answer"
    $auth = "dscl . authonly"
  condition:
    $dialog and $hidden and $auth
}

rule AMOS_Keychain_Browser_Collector
{
  meta:
    description = "Zips the login keychain and a browser credential store"
    source = "AMOS and MacSync stealer write-ups"
    severity = "high"
  strings:
    $zip = "ditto -c -k"
    $kc = "login.keychain"
    $login = "Login Data"
    $cookies = "Cookies.binarycookies"
    $wallet = "Library/Application Support/Exodus"
  condition:
    $zip and 2 of ($kc, $login, $cookies, $wallet)
}

rule AMOS_Drop_Strip_Quarantine_Run
{
  meta:
    description = "Drops a binary in a temp folder, strips its quarantine flag, marks it executable and runs it"
    source = "AMOS dropper stage write-ups"
    severity = "high"
  strings:
    $a = /xattr[ \t]+-[cd][^\n]{0,60}\/(private\/)?tmp\/[^\n]{0,80}[;&][ \t]*chmod[ \t]+\+x[^\n]{0,60}\/(private\/)?tmp\//
    $b = /chmod[ \t]+\+x[^\n]{0,60}\/(private\/)?tmp\/[^\n]{0,80}[;&][ \t]*xattr[ \t]+-[cd]/
  condition:
    any of them
}
