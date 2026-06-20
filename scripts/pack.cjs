/*
 * Build a clean, shareable .zip of the extension (only what Chrome needs to
 * "Load unpacked" — no tests/scripts/docs). Reuses the bundled ZIP writer.
 * Run: node scripts/pack.cjs  ->  dist/almost-video-feedback-for-ai.zip
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zip = require('../src/common/zip.js');

const root = path.join(__dirname, '..');
const TOP = 'almost-video-feedback-for-ai';
const FILES = ['manifest.json', 'README.md', 'INSTALL.md', 'LICENSE'];
const DIRS = ['icons', 'src'];

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const files = [];
for (const f of FILES) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) files.push(p);
}
for (const d of DIRS) {
  const p = path.join(root, d);
  if (fs.existsSync(p)) walk(p, files);
}

const entries = files.map((full) => ({
  name: TOP + '/' + path.relative(root, full).split(path.sep).join('/'),
  data: new Uint8Array(fs.readFileSync(full)),
}));

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, TOP + '.zip');
fs.writeFileSync(out, Buffer.from(zip.buildZipBytes(entries)));
console.log('wrote ' + path.relative(root, out) + ' — ' + entries.length + ' files, ' + fs.statSync(out).size + ' bytes');
