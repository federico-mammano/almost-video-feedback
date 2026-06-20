/*
 * Perceptual hashing for "cull near-identical screenshots" (dedup-by-diff).
 *
 * dHash (difference hash): downscale to 9x8 grayscale, then for each row record
 * whether each pixel is brighter than its right neighbour -> 8x8 = 64 bits.
 * Two images with a small Hamming distance are visually near-identical.
 *
 * Pure module: in the browser it attaches to globalThis.SCF.imageHash; in Node
 * (tests) it exports via module.exports. No DOM/Canvas dependency here — callers
 * pass an {width, height, data} ImageData-like object (RGBA, length w*h*4).
 */
(function () {
  'use strict';

  const HASH_W = 9; // 8 comparisons per row
  const HASH_H = 8;

  function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Convert a 64-char binary string to a 16-char hex string.
  function bitsToHex(bits) {
    let hex = '';
    for (let i = 0; i < bits.length; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  }

  /**
   * @param {{width:number,height:number,data:Uint8ClampedArray|number[]}} imageData
   *        Expected to be HASH_W x HASH_H (9x8) RGBA. If larger, the top-left
   *        9x8 block is sampled (callers should resize via canvas first).
   * @returns {string} 16-char hex dHash
   */
  function dHash(imageData) {
    const { width, data } = imageData;
    let bits = '';
    for (let y = 0; y < HASH_H; y++) {
      for (let x = 0; x < HASH_W - 1; x++) {
        const i1 = (y * width + x) * 4;
        const i2 = (y * width + (x + 1)) * 4;
        const g1 = luminance(data[i1], data[i1 + 1], data[i1 + 2]);
        const g2 = luminance(data[i2], data[i2 + 1], data[i2 + 2]);
        bits += g1 > g2 ? '1' : '0';
      }
    }
    return bitsToHex(bits);
  }

  const POPCOUNT = (() => {
    const t = new Array(16);
    for (let i = 0; i < 16; i++) {
      t[i] = (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1);
    }
    return t;
  })();

  /** Hamming distance between two equal-length hex hashes (0..64). */
  function hammingDistance(hexA, hexB) {
    if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
    let d = 0;
    for (let i = 0; i < hexA.length; i++) {
      const x = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
      d += POPCOUNT[x];
    }
    return d;
  }

  /** True when two hashes are within `threshold` bits => visually duplicate. */
  function isDuplicate(hexA, hexB, threshold) {
    return hammingDistance(hexA, hexB) <= threshold;
  }

  const api = {
    HASH_W,
    HASH_H,
    luminance,
    bitsToHex,
    dHash,
    hammingDistance,
    isDuplicate,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    const root = typeof globalThis !== 'undefined' ? globalThis : self;
    root.SCF = root.SCF || {};
    root.SCF.imageHash = api;
  }
})();
