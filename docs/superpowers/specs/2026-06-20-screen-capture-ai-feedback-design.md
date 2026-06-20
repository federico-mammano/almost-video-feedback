# Screen Capture AI Feedback — Design Spec

**Date:** 2026-06-20
**Status:** Approved-by-default (per user's build-don't-gate preference) → implementing.

## 1. Purpose

A Chrome extension (Manifest V3) that lets a human record spoken + visual feedback about
a web app, then hands an AI coding agent (e.g. Claude Code) a single file describing exactly
what to fix, with screenshots correlated to what the reviewer said and did.

Workflow:
1. Click the toolbar button or press a hotkey → recording starts.
2. The user talks ("this button is misaligned", "this list doesn't sort right") while
   clicking, selecting text, scrolling, and moving the mouse around the things they mean.
3. The extension transcribes speech in real time and captures screenshots at the
   *strategically optimal* moments, correlating each screenshot with the words spoken
   around it, the page URL, and what the user did (clicked/selected/scrolled/etc.).
4. On stop, it writes a session bundle to Downloads and copies a ready-to-paste prompt
   (with the absolute path to `feedback.md`) to the clipboard.
5. The user pastes into Claude Code; the agent reads the file + screenshots and does the work.

## 2. Components (MV3)

| Component | Context | Responsibility |
|---|---|---|
| `manifest.json` | — | MV3 config, permissions, commands, content scripts |
| Service worker | background (classic + `importScripts`) | Orchestrator: owns session state, listens for capture requests, runs `captureVisibleTab`, dedup, persistence, file export, clipboard hand-off, hotkeys, navigation events, toolbar badge |
| Offscreen doc | `offscreen.html` | Mic + Web Speech transcription (survives whole session), clipboard writes, service-worker keepalive |
| Content script | injected all_urls (classic, multi-file shared scope) | Shadow-DOM overlay (transcript bar, screenshot toast, force button), input tracking (click / selection / scroll-stop / mouse-dwell / circling), SPA route-change detection, hide-overlay-during-capture coordination |
| Popup | `popup.html` | Start/stop, live status, mic-permission bootstrap, last-session path + re-copy |
| Options | `options.html` | Tunable settings (triggers, sensitivity, language, format) in `chrome.storage` |
| Permission page | `permission.html` | One-time `getUserMedia` prompt to grant the extension origin mic access |

## 3. Screenshot strategy (the core IP)

**Triggers** (each can be toggled in options):
- **On start** — capture initial state immediately. *(always kept)*
- **New page load** — `webNavigation.onCompleted` for the recorded tab, after a render-settle delay. *(always kept)*
- **SPA route change** — content script patches `history.pushState/replaceState`, listens to `popstate`/`hashchange`. *(always kept)*
- **Click** — on `mousedown` (capture phase), record target element descriptor, capture ~150 ms later to catch the effect.
- **Text selection release** — on `mouseup` with a non-empty selection; record the selected text. *(always kept — strong feedback signal)*
- **Mouse circling / scribble** — recent-points buffer; high path-length-to-bounding-box ratio ⇒ the user is circling something ⇒ capture. *(always kept — high intent)*
- **Mouse dwell after movement** — moved a lot, then still for ~400 ms ⇒ capture.
- **Scroll start→stop** — capture once scrolling idles ~500 ms after a significant delta.
- **Periodic heartbeat** — every ~30 s as a safety net (`chrome.alarms`).
- **Manual** — global hotkey (`force-screenshot`) and floating overlay button. *(always kept)*

**Aggressive-capture + cull-by-diff:** non-priority triggers (heartbeat, scroll-stop, dwell,
circling-as-dwell) are deduplicated against the last *kept* screenshot using a **dHash**
(9×8 grayscale difference hash) and Hamming distance. Distance below threshold ⇒ discard as
"nothing meaningfully changed". Priority triggers (start, nav, selection, forced, circling)
bypass dedup.

**Rate limiting:** `captureVisibleTab` is browser-capped (~2/s). A single-flight queue enforces
a min interval (~600 ms) and coalesces bursts, keeping the highest-priority pending reason.

**Clean captures:** before each capture the SW asks the content script to hide the overlay,
waits 2 animation frames, captures, then restores. Canonical recording state is shown in the
**toolbar badge** (red "●"), which is never part of the page capture, so the user always knows
it's recording even during the brief overlay hide.

## 4. Correlation model

Everything is one **timeline** of timestamped events, persisted to IndexedDB as it happens
(durable against service-worker eviction):
- `transcript` events: `{t, text, final}` (finalized speech segments).
- `screenshot` events: `{t, file, trigger, url, title, element?, selectionText?, scrollY?}`.
- `navigation` events: `{t, url, title}`.

On export, transcript segments are attached to the temporally nearest screenshot(s), and the
timeline is emitted chronologically.

## 5. Output bundle

`Downloads/ai-feedback/session-YYYYMMDD-HHMMSS/`
- `screenshots/0001.png …`
- `feedback.md` — agent-facing: an instruction header, session metadata (pages visited,
  duration), then chronological entries grouped by page. Each entry has relative timestamp,
  what the user did, what they said, element/selection metadata, and the screenshot image ref.
- `session.json` — structured timeline for programmatic consumption.

**Clipboard on stop** (auto): a ready-to-paste instruction containing the **absolute path** to
`feedback.md` (resolved via `chrome.downloads.search({id}).filename`). Also shown in the popup
with a re-copy button.

## 6. Key technical decisions / constraints

- **No bundler / build step.** SW is a classic worker using `importScripts`; content script is
  split across files that share the isolated-world scope; pages use classic `<script>`. Loadable
  unpacked as-is. Pure logic modules (`image-hash`, gesture math) also export for Node so they're
  unit-testable.
- **Transcription engine is swappable** behind a small interface; Web Speech API is the v1 engine
  (free, real-time, no key). Remote streaming (Deepgram/AssemblyAI/Whisper) is a future drop-in.
- **`host_permissions: <all_urls>`** so `captureVisibleTab` works across navigations for the whole
  session (not just one user-gesture `activeTab` grant). Documented as a broad permission.
- **Durability:** captures + transcript persisted to IndexedDB during the session; offscreen doc
  holds a keepalive port to the SW; export reads from IndexedDB at stop.
- **Mic permission bootstrap:** one-time `permission.html` tab runs `getUserMedia` to grant the
  extension origin; thereafter the offscreen doc transcribes silently.
- **Limitations:** cannot run on `chrome://` pages or the Chrome Web Store; download entries appear
  in Chrome's downloads UI; Web Speech sends audio to Google's servers (not truly offline) — the
  remote-engine path will later allow private/offline options.

## 7. Future / explicitly out of scope for v1

- Remote high-quality transcription engines (interface is ready; not wired).
- Writing directly into a project repo (would need a native-messaging host or local companion
  server) — v1 uses Downloads + absolute path, which fully satisfies the paste-into-agent flow.
- Audio of the tab itself (we capture mic speech + visual frames only).
