# Overview

This page shows every block type the editor supports. Use it as a reference, or as a starting point for a new note.

## Headings

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

## Paragraphs and inline formatting

A plain paragraph is just text. Inline styles can be mixed freely: **bold**, *italic*, ***bold italic***, ~~strikethrough~~, `inline code`, and a [link to the repo](https://github.com/bilo-io/midnite-studio).

A second paragraph starts after a blank line.  
A line ending in two spaces makes a hard line break, like this one.

## Lists

### Bulleted list

- Git client
- Integrated terminal
  - Agent roster
  - Broker-backed sessions
- Embedded browser

### Numbered list

1. Clone the repository
2. Install the toolchain with `proto use`
3. Run the gate:
   1. `moon run :typecheck`
   2. `moon run :lint`
   3. `moon run :test`

### Task list

- [x] Write the overview
- [x] Add a table
- [ ] Review with the team
- [ ] Publish

## Blockquote

> Destructive ops need a confirm dialog showing blast radius.
>
> > A nested quote sits inside the first one.

## Code blocks

```ts
import { z } from 'zod';

export const GitOpResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), kind: z.enum(['conflict', 'error']), message: z.string() }),
]);
```

```sh
export GITHUB_PACKAGES_TOKEN=$(gh auth token)
pnpm install --frozen-lockfile
```

```json
{
  "name": "midnite-studio",
  "private": true
}
```

## Table

| Package | Role | May import `electron` |
|---|---|:---:|
| `shared` | Wire contract (zod only) | ❌ |
| `git-engine` | Everything that touches git | ❌ |
| `app` | Renderer | ❌ |
| `desktop` | Electron main + preload | ✅ |

## Image

![Midnite Studio wordmark candidates](docs/screenshots/website-wordmark/candidates.png)

## Horizontal rule

Content above the rule.

---

Content below the rule.

## Footnote-style reference

Reference-style links keep long URLs out of the text: see the [design plan][plan].

[plan]: docs/INITIAL_PLAN.md
