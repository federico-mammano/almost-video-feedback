/*
 * Write the session bundle to the Downloads folder and resolve the absolute path
 * of feedback.md (so we can hand the agent a real path). Classic script in the
 * service worker -> globalThis.SCF.downloads.
 *
 * MV3 service workers can't use URL.createObjectURL, so everything is written via
 * data: URLs through chrome.downloads.download.
 */
(function (root) {
  'use strict';
  root.SCF = root.SCF || {};

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function folderName(ms) {
    const d = ms ? new Date(ms) : new Date();
    return (
      'session-' +
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      '-' +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds())
    );
  }

  function dirname(p) {
    if (!p) return p;
    const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return i >= 0 ? p.slice(0, i) : p;
  }

  function bytesToBase64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  async function blobToDataUrl(blob, mime) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return 'data:' + (mime || 'application/octet-stream') + ';base64,' + bytesToBase64(bytes);
  }

  function textDataUrl(text, mime) {
    const bytes = new TextEncoder().encode(text);
    return 'data:' + mime + ';charset=utf-8;base64,' + bytesToBase64(bytes);
  }

  function download(url, filename) {
    return chrome.downloads.download({
      url,
      filename,
      conflictAction: 'uniquify',
      saveAs: false,
    });
  }

  function resolvePath(id) {
    return new Promise((resolve) => {
      let settled = false;
      function finish(val) {
        if (settled) return;
        settled = true;
        chrome.downloads.onChanged.removeListener(onChanged);
        clearTimeout(to);
        resolve(val);
      }
      function check() {
        chrome.downloads.search({ id }, (items) => {
          const it = items && items[0];
          if (it && it.state === 'complete' && it.filename) finish(it.filename);
          else if (it && it.state === 'interrupted') finish(null);
        });
      }
      function onChanged(delta) {
        if (delta.id === id && (delta.state || delta.filename)) check();
      }
      const to = setTimeout(() => {
        chrome.downloads.search({ id }, (items) => {
          finish((items && items[0] && items[0].filename) || null);
        });
      }, 5000);
      chrome.downloads.onChanged.addListener(onChanged);
      check();
    });
  }

  /**
   * @param {{markdown:string, json:string, screenshots:Array<{seq:number,file:string}>}} bundle
   * @param {object} store SCF.sessionStore
   * @param {number} startedAtMs
   * @returns {Promise<{dir:string, mdPath:string|null, folderPath:string|null}>}
   */
  function setDownloadUi(enabled) {
    // Hide Chrome's download bubble/shelf while we write the bundle so it
    // doesn't pop up over the extension menu. Best-effort (needs downloads.ui).
    try {
      if (chrome.downloads.setUiOptions) chrome.downloads.setUiOptions({ enabled });
      else if (chrome.downloads.setShelfEnabled) chrome.downloads.setShelfEnabled(enabled);
    } catch (e) {
      /* not available */
    }
  }

  function sessionDir(startedAtMs) {
    return 'ai-feedback/' + folderName(startedAtMs);
  }

  // Write one screenshot to Downloads. Called incrementally DURING recording so
  // the cost is spread out instead of bursting at stop (big save-time win).
  async function saveShot(dir, file, blob, mime) {
    const url = await blobToDataUrl(blob, mime);
    return download(url, dir + '/' + file);
  }

  // At stop we now only write the two small text files (screenshots were already
  // written during the recording), so this is fast.
  async function writeSession(bundle, startedAtMs) {
    const dir = sessionDir(startedAtMs);
    await download(textDataUrl(bundle.json, 'application/json'), dir + '/session.json');
    const mdId = await download(textDataUrl(bundle.markdown, 'text/markdown'), dir + '/feedback.md');
    const mdPath = await resolvePath(mdId);
    return {
      dir,
      mdPath: mdPath || null,
      folderPath: mdPath ? dirname(mdPath) : null,
    };
  }

  function clipboardText(mdPath, folderPath) {
    const path = mdPath || '(feedback.md in your Downloads/ai-feedback folder)';
    return [
      'I recorded visual + spoken feedback on my web app. Please read the feedback file and',
      'address each item. Screenshots are referenced relative to the file, in the same folder.',
      '',
      'Feedback file: ' + path,
    ].join('\n');
  }

  root.SCF.downloads = {
    writeSession,
    saveShot,
    sessionDir,
    setDownloadUi,
    clipboardText,
    folderName,
    dirname,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
