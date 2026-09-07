# fish completion for the `midnite-studio` CLI wrapper (Phase 33 Theme B).
#
# Completes exactly the grammar the wrapper implements
# (`resources/bin/midnite-studio`) and nothing else: the subcommands `open`
# and `clone`, and the flags `--version`/`--help`. `open` completes
# directories; `clone` completes nothing — there is no way to enumerate
# remote URLs.

function __midnite_studio_no_subcommand
  set -l cmd (commandline -opc)
  test (count $cmd) -eq 1
end

complete -c midnite-studio -f

complete -c midnite-studio -n __midnite_studio_no_subcommand -a open -d 'Open repository at <path>'
complete -c midnite-studio -n __midnite_studio_no_subcommand -a clone -d 'Clone repository from <url>'
complete -c midnite-studio -n __midnite_studio_no_subcommand -l version -d 'Print version'
complete -c midnite-studio -n __midnite_studio_no_subcommand -l help -d 'Print help'

# Bare `midnite-studio [path]` and `midnite-studio open <path>` both complete directories.
complete -c midnite-studio -n __midnite_studio_no_subcommand -a '(__fish_complete_directories)'
complete -c midnite-studio -n '__fish_seen_subcommand_from open' -a '(__fish_complete_directories)'
# `clone <url>` has no completion source — there is no way to enumerate remote URLs.
