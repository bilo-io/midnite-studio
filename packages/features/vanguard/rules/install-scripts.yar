/*
 * Vanguard ruleset: poisoned install scripts (Phase 120 Theme F).
 *
 * Subset-conformant (see clickfix.yar). An npm `preinstall`/`install`/`postinstall` runs with the
 * installing user's full rights the moment a dependency lands, which is why the supply-chain worms use
 * it. These rules read package.json for an install script that touches credential files or pipes a
 * download into a shell. A script that does neither is not matched.
 */

rule InstallScript_Reads_Credential_Files
{
  meta:
    description = "An npm install script that reads credential files"
    source = "npm supply-chain compromises, 2025 waves"
    severity = "high"
  strings:
    $a = /"(pre|post)?install"[ \t]*:[ \t]*"([^"\\\n]|\\.){0,200}(\.npmrc|\.ssh\/|\.aws\/|id_rsa|id_ed25519|\.netrc|\.config\/gh)/
  condition:
    $a
}

rule InstallScript_Pipes_Download_To_Shell
{
  meta:
    description = "An npm install script that pipes a download into a shell"
    source = "npm supply-chain compromises, 2025 waves"
    severity = "high"
  strings:
    $a = /"(pre|post)?install"[ \t]*:[ \t]*"([^"\\\n]|\\.){0,120}(curl|wget)([^"\\\n]|\\.){0,120}\|[ \t]*(sudo[ \t]+)?(ba|z)?sh/
  condition:
    $a
}
