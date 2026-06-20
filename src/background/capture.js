/*
 * Capture pipeline (service worker). Classic script -> globalThis.SCF.capture.
 *
 * Responsibilities:
 *   - single-flight queue with a min-interval rate limit (captureVisibleTab is
 *     browser-capped at ~2/s) and burst coalescing for noisy triggers
 *   - hide the page overlay during the capture so our own UI never appears in
 *     the screenshot (handshake with the content script, with a timeout fallback)
 *   - dedup near-identical frames via dHash Hamming distance (priority triggers
 *     bypass the cull); keep what's left in the IndexedDB session store
 */
(function (root) {
  'use strict';
  root.SCF = root.SCF || {};
  const { MSG, PRIORITY_TRIGGERS } = root.SCF;
  const imageHash = root.SCF.imageHash;
  const store = root.SCF.sessionStore;

  const state = {
    enabled: false,
    busy: false,
    queue: [],
    lastCaptureAt: 0,
    lastKeptHash: null,
    seq: 0,
    ctx: null, // { windowId, tabId, settings, lastUrl, lastTitle }
    timer: null,
  };

  // Optional hooks the orchestrator can set.
  const hooks = { onKept: null, onCapturedRaw: null };

  let captureIdCounter = 0;

  function begin(ctx) {
    state.enabled = true;
    state.busy = false;
    state.queue = [];
    state.lastCaptureAt = 0;
    state.lastKeptHash = null;
    state.seq = 0;
    state.ctx = ctx;
    state.dir =
      root.SCF.downloads && ctx && ctx.startedAt ? root.SCF.downloads.sessionDir(ctx.startedAt) : null;
  }

  // Restore capture state after a service-worker restart mid-session.
  function restore(ctx, lastSeq, lastHash) {
    begin(ctx);
    state.seq = lastSeq || 0;
    state.lastKeptHash = lastHash || null;
  }

  function end() {
    state.enabled = false;
    state.queue = [];
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function setContext(patch) {
    if (state.ctx) Object.assign(state.ctx, patch);
  }

  function getSeq() {
    return state.seq;
  }

  function request(trigger, meta) {
    if (!state.enabled || !state.ctx) return;
    const settings = state.ctx.settings;
    // Respect per-trigger toggles, but forced/start are always allowed.
    if (
      settings && settings.triggers && settings.triggers[trigger] === false &&
      trigger !== 'forced' && trigger !== 'start'
    ) {
      return;
    }
    const priority = PRIORITY_TRIGGERS.has(trigger);
    const item = { trigger, meta: meta || {}, priority, at: Date.now() };

    // Collapse a run of non-priority requests into the latest one.
    const last = state.queue[state.queue.length - 1];
    if (last && !last.priority && !priority) {
      state.queue[state.queue.length - 1] = item;
    } else {
      state.queue.push(item);
    }

    // Safety cap: never let the queue grow unbounded; drop oldest non-priority.
    if (state.queue.length > 8) {
      const idx = state.queue.findIndex((q) => !q.priority);
      state.queue.splice(idx >= 0 ? idx : 0, 1);
    }

    pump();
  }

  function pump() {
    if (state.busy || !state.enabled || state.queue.length === 0) return;
    const minInterval = (state.ctx.settings && state.ctx.settings.minCaptureIntervalMs) || 650;
    const wait = minInterval - (Date.now() - state.lastCaptureAt);
    if (wait > 0) {
      if (!state.timer) {
        state.timer = setTimeout(() => {
          state.timer = null;
          pump();
        }, wait);
      }
      return;
    }
    const req = state.queue.shift();
    state.busy = true;
    doCapture(req)
      .catch((err) => console.warn('[scf] capture failed:', err && err.message))
      .finally(() => {
        state.busy = false;
        state.lastCaptureAt = Date.now();
        pump();
      });
  }

  function sendToContent(tabId, msg, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const to = setTimeout(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      }, timeoutMs || 300);
      try {
        chrome.tabs.sendMessage(tabId, msg, (resp) => {
          void chrome.runtime.lastError; // swallow "no receiver"
          if (!done) {
            done = true;
            clearTimeout(to);
            resolve(resp == null ? null : resp);
          }
        });
      } catch (e) {
        if (!done) {
          done = true;
          clearTimeout(to);
          resolve(null);
        }
      }
    });
  }

  async function computeHash(blob) {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(imageHash.HASH_W, imageHash.HASH_H);
    const cctx = canvas.getContext('2d', { willReadFrequently: true });
    cctx.drawImage(bitmap, 0, 0, imageHash.HASH_W, imageHash.HASH_H);
    const img = cctx.getImageData(0, 0, imageHash.HASH_W, imageHash.HASH_H);
    bitmap.close();
    return imageHash.dHash(img);
  }

  async function doCapture(req) {
    const ctx = state.ctx;
    if (!ctx) return;
    const settings = ctx.settings || {};
    const tabId = ctx.tabId;

    // The overlay is intentionally NOT hidden during capture (it would flicker);
    // it's a movable/minimizable bar the user can position out of shots.
    let dataUrl;
    const opts =
      settings.captureFormat === 'jpeg'
        ? { format: 'jpeg', quality: settings.jpegQuality || 90 }
        : { format: 'png' };
    dataUrl = await chrome.tabs.captureVisibleTab(ctx.windowId, opts);

    if (!dataUrl) return;

    const mime = settings.captureFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await (await fetch(dataUrl)).blob();

    // 4) dedup (priority triggers always kept)
    let hash = null;
    try {
      hash = await computeHash(blob);
    } catch (e) {
      // if hashing fails, fall through and keep the frame
    }
    const threshold = settings.dedupHammingThreshold != null ? settings.dedupHammingThreshold : 6;
    if (
      !req.priority &&
      hash &&
      state.lastKeptHash &&
      imageHash.hammingDistance(state.lastKeptHash, hash) <= threshold
    ) {
      return; // visually unchanged -> cull
    }

    // 5) safety cap on total screenshots
    const cap = settings.maxScreenshots || 300;
    if (state.seq >= cap) {
      console.warn('[scf] screenshot cap reached (' + cap + '), skipping further captures');
      return;
    }

    // 6) keep it
    state.seq += 1;
    const seq = state.seq;
    if (hash) state.lastKeptHash = hash;

    await store.addScreenshot(seq, blob, mime);
    const meta = req.meta || {};
    const evt = {
      t: req.at || Date.now(),
      type: 'screenshot',
      seq,
      mime,
      trigger: req.trigger,
      url: meta.url || ctx.lastUrl || null,
      title: meta.title || ctx.lastTitle || null,
      element: meta.element || null,
      selectionText: meta.selectionText || null,
      scrollY: meta.scrollY != null ? meta.scrollY : null,
      hash: hash || null,
    };
    await store.addEvent(evt);
    store.patchMeta({ lastKeptHash: state.lastKeptHash, lastSeq: seq }).catch(() => {});

    // write the PNG to Downloads now, during the recording, so stop stays fast
    if (state.dir && root.SCF.downloads && root.SCF.exporter) {
      root.SCF.downloads.saveShot(state.dir, root.SCF.exporter.fileFor(seq), blob, mime).catch(() => {});
    }

    // 7) UI feedback + hook
    sendToContent(tabId, { type: MSG.SCREENSHOT_TOAST, seq, trigger: req.trigger }, 100);
    if (typeof hooks.onKept === 'function') {
      try {
        hooks.onKept({ seq, trigger: req.trigger });
      } catch (e) {
        /* ignore */
      }
    }
  }

  root.SCF.capture = { begin, restore, end, setContext, request, getSeq, hooks, _state: state };
})(typeof globalThis !== 'undefined' ? globalThis : self);
