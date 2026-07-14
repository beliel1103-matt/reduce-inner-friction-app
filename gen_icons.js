// Generate simple calming gradient-circle PNG icons with no external deps.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tag, data) {
  const tagBuf = Buffer.from(tag, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tagBuf, data])), 0);
  return Buffer.concat([lenBuf, tagBuf, data, crcBuf]);
}

function makePng(filePath, size) {
  const c1 = [74, 158, 168];   // teal
  const c2 = [150, 130, 200];  // lavender
  const cx = size / 2, cy = size / 2;
  const ringR = size * 0.30;
  const ringW = size * 0.055;
  const dotR = size * 0.045;
  const dotX = cx + ringR * Math.cos(-Math.PI / 2);
  const dotY = cy + ringR * Math.sin(-Math.PI / 2);

  const stride = 1 + size * 4; // filter byte + RGBA
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      let r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      let g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      let b = Math.round(c1[2] + (c2[2] - c1[2]) * t);

      const dx = x - cx, dy = y - cy;
      const dist = Math.hypot(dx, dy);

      let a = 255;
      const n = 4, edge = size * 0.5;
      const se = Math.pow(Math.abs(dx) / edge, n) + Math.pow(Math.abs(dy) / edge, n);
      if (se > 1) a = 0;

      const ringDist = Math.abs(dist - ringR);
      if (ringDist < ringW / 2) {
        const mix = 1 - (ringDist / (ringW / 2));
        r = Math.round(r + (255 - r) * mix);
        g = Math.round(g + (255 - g) * mix);
        b = Math.round(b + (255 - b) * mix);
      }

      const dotDist = Math.hypot(x - dotX, y - dotY);
      if (dotDist < dotR) {
        r = 255; g = 255; b = 255;
      }

      const px = rowStart + 1 + x * 4;
      raw[px] = r; raw[px + 1] = g; raw[px + 2] = b; raw[px + 3] = a;
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type RGBA
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;

  const idatData = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

const outDir = path.join(__dirname, 'icons');
makePng(path.join(outDir, 'icon-192.png'), 192);
makePng(path.join(outDir, 'icon-512.png'), 512);
makePng(path.join(outDir, 'apple-touch-icon.png'), 180);
makePng(path.join(outDir, 'favicon-32.png'), 32);
console.log('done');
