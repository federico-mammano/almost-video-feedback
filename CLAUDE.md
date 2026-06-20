# CLAUDE.md

Guidance for AI agents working on this repo lives in **[AGENTS.md](AGENTS.md)** — read it before
making changes.

**TL;DR**

- No build step, no runtime dependencies. **Classic scripts only** — no `import`/`export` in the
  service worker or content scripts (the worker uses `importScripts`; content files share scope via
  `globalThis`).
- Route cross-context messages through `src/common/protocol.js`; tunables through `src/common/config.js`.
- Pure logic is dual-exported and unit-tested — add tests for new pure logic in `test/run.cjs`.
- **Run `npm test && npm run verify` before committing — both must pass.**
- Most behavior is browser-bound: load the unpacked extension and sanity-check in Chrome. Don't
  claim a browser behavior works from unit tests alone; flag it as needing a human to verify.

See [AGENTS.md](AGENTS.md) for the full checklist and definition of done.
