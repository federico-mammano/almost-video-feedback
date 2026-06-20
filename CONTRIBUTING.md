# Contributing

Thanks for helping improve **Almost Video Feedback for AI**! Contributions of all sizes are welcome —
bug fixes, new screenshot triggers, transcription engines, UI polish, docs.

## Quick start (dev)

There is **no build step** and **no runtime dependencies** — the `src/` tree loads as-is.

1. Fork and clone the repo.
2. Load it in Chrome:
   - `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the repo folder.
   - After editing files, click the **reload** ↻ icon on the extension card to pick up changes.
3. You'll need **Node** (18+) only to run the tests/checks:
   ```bash
   npm test       # pure-logic unit tests (image hash, gesture math, exporter, zip)
   npm run verify # validates manifest references + syntax-checks every JS file
   npm run pack   # build a shareable dist/ zip
   npm run icons  # regenerate the toolbar PNGs
   ```

Please run `npm test` and `npm run verify` before opening a PR — both must pass.

## How it's built

- **Manifest V3**, no bundler. The service worker is a classic worker using `importScripts`; the
  content script is split across files that share the isolated-world scope; pages use classic
  `<script>`. This keeps it loadable unpacked with zero tooling.
- Pure logic (`src/background/image-hash.js`, `src/content/gesture.js`, `src/background/exporter.js`,
  `src/common/zip.js`) is **dual-exported** so it runs in the browser *and* `require()`s in Node —
  that's what the unit tests exercise. Keep new pure logic in this style and add tests.
- Cross-context messaging goes through the string constants in `src/common/protocol.js`. Add new
  message types there rather than hard-coding strings.
- Architecture overview: see [`README.md`](README.md) and the design spec in
  [`docs/superpowers/specs/`](docs/superpowers/specs/).

### Good first contributions

- **A new screenshot trigger:** add it in the content script's input tracking, define a `TRIGGER`
  in `protocol.js`, and (if it's a "noisy" trigger) leave it out of `PRIORITY_TRIGGERS` so it gets
  deduped. Expose a toggle in `src/common/config.js` + the options page.
- **A remote transcription engine** (Deepgram / AssemblyAI / Whisper): the recognizer lives in the
  content script behind a small interface — wire an alternative engine selectable in settings.
- **Output tweaks:** the agent-facing `feedback.md` is built in `src/background/exporter.js`.

## Submitting changes

1. Branch from `main`: `git checkout -b my-change`.
2. Make focused commits; keep the code style of the files you touch (2-space indent, no bundler-only
   syntax — these are plain classic scripts, so no `import`/`export` in content/worker files).
3. `npm test && npm run verify` must pass.
4. Open a pull request describing **what** changed and **why**, with before/after notes or a short
   clip/screenshot for UI changes.

## Reporting bugs / ideas

Open an issue with steps to reproduce (and the page/site if relevant). For transcription problems,
include anything from the service-worker console (`chrome://extensions` → the extension's
**service worker** link).

By contributing you agree your contributions are licensed under the project's [MIT License](LICENSE).
