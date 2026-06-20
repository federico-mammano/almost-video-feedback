/*
 * Minimal ZIP writer (STORE method, no compression) with no dependencies.
 * Screenshots are already-compressed PNGs, so STORE is the right choice.
 *
 * Dual-exported: browser pages get globalThis.SCF_ZIP; Node (tests) gets
 * module.exports. buildZipBytes() is pure (Uint8Array in/out, node-testable);
 * buildZip() resolves Blobs/strings then wraps the result in a Blob.
 */
(function () {
  'use strict';

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function strToUtf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return Uint8Array.from(Buffer.from(s, 'utf8')); // node fallback
  }

  // entries: [{ name: string, data: Uint8Array }]
  function buildZipBytes(entries) {
    const DOS_TIME = 0;
    const DOS_DATE = 0x21; // 1980-01-01

    const parts = entries.map((e) => {
      const nameBytes = strToUtf8(e.name);
      const data = e.data || new Uint8Array(0);
      return { nameBytes, data, crc: crc32(data), size: data.length };
    });

    let localSize = 0;
    let centralSize = 0;
    for (const p of parts) {
      localSize += 30 + p.nameBytes.length + p.size;
      centralSize += 46 + p.nameBytes.length;
    }
    const total = localSize + centralSize + 22;
    const buf = new Uint8Array(total);
    const dv = new DataView(buf.buffer);
    let off = 0;
    const offsets = [];

    // local file headers + data
    for (const p of parts) {
      offsets.push(off);
      dv.setUint32(off, 0x04034b50, true); off += 4;
      dv.setUint16(off, 20, true); off += 2; // version needed
      dv.setUint16(off, 0, true); off += 2; // flags
      dv.setUint16(off, 0, true); off += 2; // method = store
      dv.setUint16(off, DOS_TIME, true); off += 2;
      dv.setUint16(off, DOS_DATE, true); off += 2;
      dv.setUint32(off, p.crc, true); off += 4;
      dv.setUint32(off, p.size, true); off += 4; // compressed size
      dv.setUint32(off, p.size, true); off += 4; // uncompressed size
      dv.setUint16(off, p.nameBytes.length, true); off += 2;
      dv.setUint16(off, 0, true); off += 2; // extra length
      buf.set(p.nameBytes, off); off += p.nameBytes.length;
      buf.set(p.data, off); off += p.size;
    }

    // central directory
    const cdStart = off;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      dv.setUint32(off, 0x02014b50, true); off += 4;
      dv.setUint16(off, 20, true); off += 2; // version made by
      dv.setUint16(off, 20, true); off += 2; // version needed
      dv.setUint16(off, 0, true); off += 2; // flags
      dv.setUint16(off, 0, true); off += 2; // method
      dv.setUint16(off, DOS_TIME, true); off += 2;
      dv.setUint16(off, DOS_DATE, true); off += 2;
      dv.setUint32(off, p.crc, true); off += 4;
      dv.setUint32(off, p.size, true); off += 4;
      dv.setUint32(off, p.size, true); off += 4;
      dv.setUint16(off, p.nameBytes.length, true); off += 2;
      dv.setUint16(off, 0, true); off += 2; // extra
      dv.setUint16(off, 0, true); off += 2; // comment
      dv.setUint16(off, 0, true); off += 2; // disk number
      dv.setUint16(off, 0, true); off += 2; // internal attrs
      dv.setUint32(off, 0, true); off += 4; // external attrs
      dv.setUint32(off, offsets[i], true); off += 4; // local header offset
      buf.set(p.nameBytes, off); off += p.nameBytes.length;
    }
    const cdSize = off - cdStart;

    // end of central directory
    dv.setUint32(off, 0x06054b50, true); off += 4;
    dv.setUint16(off, 0, true); off += 2; // this disk
    dv.setUint16(off, 0, true); off += 2; // disk with cd
    dv.setUint16(off, parts.length, true); off += 2; // entries on this disk
    dv.setUint16(off, parts.length, true); off += 2; // total entries
    dv.setUint32(off, cdSize, true); off += 4;
    dv.setUint32(off, cdStart, true); off += 4;
    dv.setUint16(off, 0, true); off += 2; // comment length

    return buf;
  }

  // entries: [{ name, blob } | { name, text } | { name, data:Uint8Array }]
  async function buildZip(entries) {
    const resolved = [];
    for (const e of entries) {
      let data;
      if (e.data) data = e.data;
      else if (e.text != null) data = strToUtf8(e.text);
      else if (e.blob) data = new Uint8Array(await e.blob.arrayBuffer());
      else data = new Uint8Array(0);
      resolved.push({ name: e.name, data });
    }
    return new Blob([buildZipBytes(resolved)], { type: 'application/zip' });
  }

  const api = { crc32, buildZipBytes, buildZip };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    const root = typeof globalThis !== 'undefined' ? globalThis : self;
    root.SCF_ZIP = api;
  }
})();
