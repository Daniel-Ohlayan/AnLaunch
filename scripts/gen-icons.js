'use strict';
/**
 * Генерирует иконки AnLaunch без внешних зависимостей:
 *   public/icon.png  — 256×256 PNG
 *   build/icon.ico   — ICO (PNG-вложение, поддерживается Windows 10+/electron-builder)
 *
 * Запуск: node scripts/gen-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;

// ---- пиксельное рисование ---------------------------------------------------
function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

const TOP = hex('#16213a');
const BOTTOM = hex('#0b1220');
const A_COLOR = hex('#f8fafc');
const ACCENT = hex('#22d3ee');

// буква "A" в растре 5×7
const A = [
  '.###.',
  '#...#',
  '#...#',
  '#####',
  '#...#',
  '#...#',
  '#...#',
];
const CELL = 24; // размер одной "клетки" буквы
const AW = 5 * CELL; // 120
const AH = 7 * CELL; // 168
const AX = Math.floor((SIZE - AW) / 2); // 68
const AY = 40;
const BAR_H = 12;
const BAR_Y = AY + AH + 14;

const RADIUS = 48;
function inRoundedRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), SIZE - 1 - r);
  const cy = Math.min(Math.max(y, r), SIZE - 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r || x >= r && x < SIZE - r || y >= r && y < SIZE - r;
}

function inA(x, y) {
  const lx = x - AX;
  const ly = y - AY;
  if (lx < 0 || ly < 0 || lx >= AW || ly >= AH) return false;
  const col = Math.floor(lx / CELL);
  const row = Math.floor(ly / CELL);
  return A[row][col] === '#';
}

function pixel(x, y) {
  if (!inRoundedRect(x, y, RADIUS)) return [0, 0, 0, 0];
  const t = y / (SIZE - 1);
  let c = mix(TOP, BOTTOM, t);
  if (inA(x, y)) {
    c = A_COLOR;
  } else if (y >= BAR_Y && y < BAR_Y + BAR_H && x >= AX && x < AX + AW) {
    // акцентная полоска с градиентом по ширине
    c = mix(ACCENT, hex('#818cf8'), (x - AX) / AW);
  }
  return [c[0], c[1], c[2], 255];
}

// ---- PNG-энкодер (минимальный) ---------------------------------------------
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // raw scanlines с фильтром 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const p = y * (width * 4 + 1) + 1 + x * 4;
      const [r, g, b, a] = rgba(y, x);
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---- ICO --------------------------------------------------------------------
function encodeICO(pngBuf, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // width (0 = 256)
  entry[1] = size >= 256 ? 0 : size; // height
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuf.length, 8); // size
  entry.writeUInt32LE(6 + 16, 12); // offset
  return Buffer.concat([header, entry, pngBuf]);
}

// ---- main -------------------------------------------------------------------
const rgba = (y, x) => pixel(x, y);
const png = encodePNG(SIZE, SIZE, rgba);

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const buildDir = path.join(root, 'build');
fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'icon.png'), png);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), encodeICO(png, SIZE));
console.log('Иконки сгенерированы: public/icon.png, build/icon.ico');
