/*
 * Offscreen document: clipboard writes only.
 *
 * (Transcription moved to the content script — Chrome's Web Speech API does not
 * produce results inside an offscreen document.) This doc is created on stop,
 * used for one execCommand('copy'), then closed. execCommand('copy') works here
 * without user activation because the document is created with the CLIPBOARD reason.
 */
(function () {
  'use strict';
  const MSG = self.SCF.MSG;

  function copyToClipboard(text) {
    const ta = document.getElementById('clip');
    ta.value = text || '';
    ta.focus();
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.blur();
    return ok;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === MSG.COPY_TO_CLIPBOARD) {
      sendResponse({ ok: copyToClipboard(msg.text) });
      return true;
    }
  });
})();
