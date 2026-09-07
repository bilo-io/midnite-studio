# bash completion for the `midnite-studio` CLI wrapper (Phase 33 Theme B).
#
# Completes exactly the grammar the wrapper implements
# (`resources/bin/midnite-studio`) and nothing else: the subcommands `open`
# and `clone`, and the flags `--version`/`--help`. `open` completes
# directories; `clone` completes nothing — there is no way to enumerate
# remote URLs.

_midnite_studio_completions() {
  local cur
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "open clone --version --help" -- "$cur"))
    # Also offer directories, matching the wrapper's bare `midnite-studio [path]` form.
    COMPREPLY+=($(compgen -d -- "$cur"))
    return 0
  fi

  case "${COMP_WORDS[1]}" in
    open)
      COMPREPLY=($(compgen -d -- "$cur"))
      ;;
    clone)
      # No completion source for a remote URL.
      ;;
  esac
}

complete -F _midnite_studio_completions midnite-studio
