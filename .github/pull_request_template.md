<!-- Thanks for contributing! Please fill this out so it's safe + quick to review. -->

## What & why

<!-- What does this change, and why? Link any issue. -->

## Screenshots / clip (for UI changes)

<!-- A before/after image or short clip helps a lot. -->

## Checklist

- [ ] `npm test` and `npm run verify` pass locally
- [ ] I loaded the unpacked extension in Chrome and confirmed the change works (say what you tested)
- [ ] **No new permissions** added to `manifest.json` (or I explained exactly why one is needed)
- [ ] **No new runtime dependencies** and **no build step** introduced
- [ ] **No new network calls** (`fetch`/`XMLHttpRequest`/`WebSocket`/external URLs) — this extension sends nothing to any server
- [ ] No `eval` / `new Function` / remote or dynamically-generated code
- [ ] Any page-derived text rendered into the DOM is escaped (see `AGENTS.md`)
- [ ] Used an AI agent for this? I pointed it at [`AGENTS.md`](../blob/main/AGENTS.md)

<!-- Maintainers review against docs/MAINTAINING.md before merging. -->
