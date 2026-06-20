/*
 * Generate the toolbar icons (16/32/48/128) as real PNGs using only Node's
 * built-in zlib — no image libraries. A dark rounded square with a red
 * "record" dot. Run: node scripts/generate-icons.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function lerp(a, b, t) { return a + (b - a) * t; }

function renderRGBA(size) {
  const data = Buffer.alloc(size * size * 4);
  const r = size * 0.2; // corner radius
  const cx = size / 2, cy = size / 2;
  const dotR = size * 0.3;
  const bg = [15, 23, 42]; // #0f172a
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-rect alpha
      let inside = true;
      const rx = Math.min(x + 0.5, size - 0.5 - x);
      const ry = Math.min(y + 0.5, size - 0.5 - y);
      if (rx < r && ry < r) {
        const dx = r - rx, dy = r - ry;
        if (dx * dx + dy * dy > r * r) inside = false;
      }
      if (!inside) {
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
        continue;
      }
      // distance to centre for the record dot
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (dist <= dotR) {
        // radial gradient #fb7185 -> #e11d48
        const t = dist / dotR;
        data[i] = clamp(lerp(251, 225, t));
        data[i + 1] = clamp(lerp(113, 29, t));
        data[i + 2] = clamp(lerp(133, 72, t));
        data[i + 3] = 255;
      } else if (dist <= dotR + Math.max(1, size * 0.03)) {
        // subtle glow ring
        const g = 1 - (dist - dotR) / Math.max(1, size * 0.03);
        data[i] = clamp(lerp(bg[0], 244, g * 0.5));
        data[i + 1] = clamp(lerp(bg[1], 63, g * 0.5));
        data[i + 2] = clamp(lerp(bg[2], 94, g * 0.5));
        data[i + 3] = 255;
      } else {
        data[i] = bg[0];
        data[i + 1] = bg[1];
        data[i + 2] = bg[2];
        data[i + 3] = 255;
      }
    }
  }
  return data;
}

function encodePNG(size) {
  const rgba = renderRGBA(size);
  // add per-scanline filter byte (0 = none)
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = encodePNG(size);
  fs.writeFileSync(path.join(outDir, 'icon' + size + '.png'), png);
  console.log('wrote icons/icon' + size + '.png (' + png.length + ' bytes)');
}
