# Chats layout adjustments

- **Branch:** feature/adhoc-chats-layout · **PR:** — · **Started:** 2026-10-04
- **Task:** Adjust chats page layout:
  1. Make composer narrower (8-12rem)
  2. Make chat thread wider by the same amount
  3. Make default height of chat text area one lineheight higher
- **Decisions:**
  - Change `max-w-3xl` to `max-w-2xl` on composer (96px reduction, middle of target range)
  - Change `rows={1}` to `rows={2}` on AiComposer textarea
- **Done:** 
  - Located composer wrapper in `chat-pane.tsx:195`
  - Located textarea config in `chat-composer.tsx:285`
- **Next:** Apply edits, test visual, screenshot, and PR
- **Gotchas:** None yet
