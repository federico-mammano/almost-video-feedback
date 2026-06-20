/*
 * Extract a compact, agent-useful descriptor of a DOM element so the feedback
 * file can say *which* thing the reviewer clicked / selected / pointed at.
 * Classic content script -> globalThis.SCF_DOM.
 */
(function (root) {
  'use strict';

  function classOf(el) {
    if (!el) return '';
    if (typeof el.className === 'string') return el.className;
    if (el.getAttribute) return el.getAttribute('class') || '';
    return '';
  }

  function attr(el, name) {
    return el && el.getAttribute ? el.getAttribute(name) || '' : '';
  }

  function describe(el) {
    if (!el || el.nodeType !== 1) return null;
    let rect = { x: 0, y: 0, width: 0, height: 0 };
    try {
      rect = el.getBoundingClientRect();
    } catch (e) {
      /* detached */
    }
    const text = (el.innerText || el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);
    return {
      tag: el.tagName,
      id: el.id || '',
      classes: classOf(el).trim(),
      role: attr(el, 'role'),
      ariaLabel: attr(el, 'aria-label'),
      title: attr(el, 'title'),
      name: attr(el, 'name'),
      text,
      rect: {
        x: Math.round(rect.x || rect.left || 0),
        y: Math.round(rect.y || rect.top || 0),
        w: Math.round(rect.width || 0),
        h: Math.round(rect.height || 0),
      },
    };
  }

  function describeAtPoint(x, y, ignoreEl) {
    let el = null;
    try {
      el = document.elementFromPoint(x, y);
    } catch (e) {
      el = null;
    }
    if (!el) return null;
    if (ignoreEl && (el === ignoreEl || (ignoreEl.contains && ignoreEl.contains(el)))) return null;
    return describe(el);
  }

  root.SCF_DOM = { describe, describeAtPoint };
})(typeof globalThis !== 'undefined' ? globalThis : self);
