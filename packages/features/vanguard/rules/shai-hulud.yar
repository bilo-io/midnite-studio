/*
 * Vanguard ruleset: the Shai-Hulud npm worm family (Phase 120 Theme F).
 *
 * Subset-conformant (see clickfix.yar). Markers follow public analyses of the September and November 2025
 * waves (Socket, Wiz, StepSecurity, Unit 42): a bundle.js postinstall, the TruffleHog download that hunts
 * secrets, setup_bun.js / bun_environment.js, the secrets-dumping workflow, and the dual npm + PyPI
 * publisher shape. The workflow *filename* check (.github/workflows/*shai-hulud*) lives in the scanner,
 * since a rule sees content, not names.
 */

rule ShaiHulud_Postinstall_Bundle
{
  meta:
    description = "An install script that runs bundle.js, the Shai-Hulud entry point"
    source = "Shai-Hulud wave 1 analyses"
    severity = "high"
  strings:
    $a = /"(pre|post)?install"[ \t]*:[ \t]*"([^"\\\n]|\\.){0,60}bundle\.js/
  condition:
    $a
}

rule ShaiHulud_Setup_Bun
{
  meta:
    description = "An install script that runs setup_bun.js or bun_environment.js (Shai-Hulud 2.0)"
    source = "Shai-Hulud 2.0 analyses"
    severity = "high"
  strings:
    $a = /"(pre|post)?install"[ \t]*:[ \t]*"([^"\\\n]|\\.){0,60}(setup_bun|bun_environment)\.js/
  condition:
    $a
}

rule ShaiHulud_TruffleHog_Secret_Hunt
{
  meta:
    description = "Downloads TruffleHog and reads npm or cloud credentials in the same script"
    source = "Shai-Hulud analyses: the worm fetches TruffleHog to harvest secrets"
    severity = "high"
  strings:
    $dl = "github.com/trufflesecurity/trufflehog/releases/download"
    $c1 = ".npmrc"
    $c2 = "NPM_TOKEN"
    $c3 = "GITHUB_TOKEN"
    $c4 = ".aws/credentials"
  condition:
    $dl and any of ($c*)
}

rule ShaiHulud_Secrets_Workflow
{
  meta:
    description = "A GitHub Actions workflow that dumps every secret to an external host"
    source = "Shai-Hulud analyses: the shai-hulud-workflow.yml exfiltration step"
    severity = "high"
  strings:
    $name = "shai-hulud" nocase
    $dump = "toJSON(secrets)"
    $sink1 = "webhook.site"
    $sink2 = "requestbin"
    $sink3 = "burpcollaborator.net"
  condition:
    $name or ($dump and any of ($sink*))
}

rule MiniShaiHulud_Dual_Registry_Publisher
{
  meta:
    description = "A script that republishes to both npm and PyPI with stolen tokens"
    source = "Mini Shai-Hulud npm and PyPI dual-registry shape"
    severity = "high"
  strings:
    $npm = "npm publish"
    $pypi = /twine[ \t]+upload|upload\.pypi\.org\/legacy/
    $t1 = ".npmrc"
    $t2 = ".pypirc"
    $t3 = "NPM_TOKEN"
    $t4 = "PYPI_TOKEN"
  condition:
    $npm and $pypi and any of ($t*)
}
