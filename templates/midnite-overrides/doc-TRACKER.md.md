# docs/TRACKER.md

The kit's copy drops this repo's history (the retired markdown tracker) and its own settings values.

<<<<
Planning is tracked as GitHub issues on this repo, never as markdown files in git. `.midnite/tasks/`
and `todo/` are git-ignored: a session may draft a plan there as a scratch file, but a plan exists
only once it is filed as issues. The pre-2026-11 tracker files stay on disk locally as history and
are not updated any more.
====
Planning is tracked as GitHub issues on this repo, never as markdown files in git. A session may draft
a plan in a git-ignored scratch folder (`.midnite/tasks/` is the convention; add it to `.gitignore`),
but a plan exists only once it is filed as issues. The table maps the markdown tracker this model
replaces, for anyone coming from it.
>>>>

<<<<
This repo's file sets `project` to 8 (`bilo-io: all repos`), `ghUser` to `bilo-io`, the moon gate, and
both issue boards `address-issue` scans.
====
A typical file:

```json
{
  "ghUser": "your-login",
  "project": 3,
  "gate": ["npm", "test"]
}
```
>>>>
