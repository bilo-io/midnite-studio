/*
 * Vanguard ruleset: ClickFix command lines (Phase 120 Theme F).
 *
 * Written to the subset Vanguard's built-in matcher implements (text and regex strings, `nocase`, boolean
 * conditions, `N of them`), so the same file runs under `yara` and without it. Refreshed by Phase 122 C's
 * signed feed, never by Vanguard itself. Shapes are behavioural, taken from public ClickFix write-ups
 * (Proofpoint, Sekoia, Jamf) rather than copied indicators.
 */

rule ClickFix_Base64_To_Shell
{
  meta:
    description = "A pasted line that decodes a base64 blob straight into a shell"
    source = "ClickFix macOS variants, public write-ups"
    severity = "high"
  strings:
    $a = /echo[ \t]+["']?[A-Za-z0-9+\/=]{40,}["']?[ \t]*\|[ \t]*base64[ \t]+(-d|-D|--decode)[ \t]*\|[ \t]*(sudo[ \t]+)?(ba|z)?sh/
    $b = /base64[ \t]+(-d|-D|--decode)[ \t]*<<<[ \t]*["']?[A-Za-z0-9+\/=]{40,}["']?[ \t]*\|[ \t]*(ba|z)?sh/
  condition:
    any of them
}

rule ClickFix_Curl_RawIp_To_Shell
{
  meta:
    description = "A download from a bare IP address piped or substituted into a shell"
    source = "ClickFix and AMOS delivery one-liners, public write-ups"
    severity = "high"
  strings:
    $pipe = /(curl|wget)[^\n|]{0,100}https?:\/\/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}[^\n|]{0,100}\|[ \t]*(sudo[ \t]+)?(nohup[ \t]+)?(ba|z)?sh/
    $subst = /(ba|z)?sh[ \t]+-c[ \t]+["']?\$\([ \t]*(curl|wget)[^\n)]{0,100}https?:\/\/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/
  condition:
    any of them
}

rule ClickFix_Osascript_Terminal_Curl
{
  meta:
    description = "AppleScript that opens Terminal to run a downloaded script"
    source = "ClickFix macOS variants, public write-ups"
    severity = "high"
  strings:
    $a = /osascript[ \t]+-e[^\n]{0,60}tell application "Terminal"[^\n]{0,120}do script[^\n]{0,160}(curl|wget)/
  condition:
    $a
}

rule ClickFix_Fake_Verification_Page
{
  meta:
    description = "A web page that copies a command to the clipboard under a fake human-verification prompt"
    source = "ClickFix lure pages, public write-ups"
    severity = "medium"
  strings:
    $lure1 = "verify you are human" nocase
    $lure2 = "i'm not a robot" nocase
    $lure3 = "complete the verification" nocase
    $clip = "navigator.clipboard.writeText"
    $sh1 = /(curl|wget)[^\n]{0,80}\|[ \t]*(ba|z)?sh/
    $sh2 = "powershell -w hidden" nocase
    $sh3 = /mshta(\.exe)?[ \t]+https?:\/\//
  condition:
    any of ($lure*) and $clip and any of ($sh*)
}
