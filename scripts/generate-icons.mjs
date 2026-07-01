// Génère les icônes PWA en PNG pur (zlib Node, zéro dépendance).
// Design : fond sombre #0d1117, carré arrondi émeraude, courbe qui monte.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32b(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32b(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size, draw) {
  const px = Buffer.alloc(size * size * 4);
  draw(px, size);
  // rows with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BG = [13, 17, 23, 255];        // #0d1117
const CARD = [17, 22, 31, 255];      // #11161f
const GREEN = [52, 211, 153, 255];   // #34d399

function set(px, size, x, y, c) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
}

function draw(px, size) {
  const r = size * 0.22; // rayon coins du carré arrondi
  const m = size * 0.08; // marge
  // fond plein (iOS n'aime pas la transparence sur apple-touch-icon)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(px, size, x, y, BG);
  // carte arrondie
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inX = x >= m && x < size - m, inY = y >= m && y < size - m;
      if (!inX || !inY) continue;
      // coins arrondis
      const cx = Math.max(m + r, Math.min(size - m - r, x));
      const cy = Math.max(m + r, Math.min(size - m - r, y));
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= m + r && x < size - m - r) || (y >= m + r && y < size - m - r)) {
        set(px, size, x, y, CARD);
      }
    }
  }
  // courbe qui monte (polyline épaisse) + aire dégradée légère
  const pts = [
    [0.18, 0.72], [0.32, 0.62], [0.42, 0.66], [0.55, 0.48], [0.68, 0.40], [0.82, 0.28],
  ].map(([fx, fy]) => [fx * size, fy * size]);
  const w = Math.max(2, size * 0.045);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
    for (let s = 0; s <= steps; s++) {
      const x = x1 + ((x2 - x1) * s) / steps, y = y1 + ((y2 - y1) * s) / steps;
      for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) {
        if (dx * dx + dy * dy <= w * w) set(px, size, Math.round(x + dx), Math.round(y + dy), GREEN);
      }
    }
  }
  // point terminal
  const [ex, ey] = pts[pts.length - 1];
  const pr = w * 1.8;
  for (let dy = -pr; dy <= pr; dy++) for (let dx = -pr; dx <= pr; dx++) {
    if (dx * dx + dy * dy <= pr * pr) set(px, size, Math.round(ex + dx), Math.round(ey + dy), GREEN);
  }
}

for (const [size, name] of [[192, "icon-192.png"], [512, "icon-512.png"], [180, "apple-touch-icon.png"]]) {
  writeFileSync(`public/${name}`, makePng(size, draw));
  console.log(`public/${name} ✅ (${size}×${size})`);
}
