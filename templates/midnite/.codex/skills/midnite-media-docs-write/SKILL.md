---
name: midnite-media-docs-write
description: Write or revise a markdown document for Midnite Studio's Media ▸ Docs page. Use when the user asks for notes, a spec, a README or any long-form text that should live in the Docs page.
---

# Media ▸ Docs — write

The Docs page is a markdown editor with an AI thread beside each file. Export to md, html or pdf needs no ffmpeg.

## Layout

```
<repo>/.midnite/media/doc/<project>/
  <name>.md              the document (plain markdown, nested folders allowed)
  <name>.thread.json     the doc's own chat history — owned by the app, do not hand-edit
```

A project is one folder (single path segment, no leading dot). Create the folder if it is new.

## Conventions

- Write plain markdown to `<name>.md`; keep one `# Title` at the top. Use kebab-case or the human title as the file name, whatever the folder already does.
- Never create, rename or edit a `.thread.json`; the app writes it. Renaming a doc without its thread orphans the chat.
- Edit in place rather than creating `-v2` copies; version control is the history.

## MCP

None for docs. Edit the files directly.

## Hand-off to the UI

Tell the user the path and to open **Media ▸ Docs ▸ `<project>`**. The page reloads files from disk, so there is nothing to import. Exports (md / html / pdf) are done from the page's export toolbar.
