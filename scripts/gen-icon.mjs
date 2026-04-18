import fs from 'fs';
import zlib from 'zlib';

// CRC32
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const l = Buffer.allocUnsafe(4); l.writeUInt32BE(data.length, 0);
  const cBuf = Buffer.allocUnsafe(4); cBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([l, t, data, cBuf]);
}

const SIZE = 1024;
const px = new Uint8Array(SIZE * SIZE * 4);

// Fill amber background #ffbc42
for (let i = 0; i < SIZE * SIZE; i++) {
  px[i*4]=0xff; px[i*4+1]=0xbc; px[i*4+2]=0x42; px[i*4+3]=0xff;
}

// Pixel-art "C" in dark #0d0d15
// 7x7 dot grid, each dot = 100px, centered with 2px gap between dots for crispness
const dot = 110;
const gap = 8;
const gW = 6, gH = 7; // 6 cols, 7 rows
const totalW = gW * dot + (gW - 1) * gap;
const totalH = gH * dot + (gH - 1) * gap;
const oX = Math.floor((SIZE - totalW) / 2);
const oY = Math.floor((SIZE - totalH) / 2);

// "C" shape: 1 = dark pixel dot
const C = [
  [0,1,1,1,1,1],
  [1,1,0,0,0,0],
  [1,1,0,0,0,0],
  [1,1,0,0,0,0],
  [1,1,0,0,0,0],
  [1,1,0,0,0,0],
  [0,1,1,1,1,1],
];

function fillRect(x, y, w, h, r, g, b) {
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const idx = ((y + row) * SIZE + (x + col)) * 4;
      if (x+col >= 0 && x+col < SIZE && y+row >= 0 && y+row < SIZE) {
        px[idx]=r; px[idx+1]=g; px[idx+2]=b; px[idx+3]=0xff;
      }
    }
  }
}

for (let gy = 0; gy < gH; gy++) {
  for (let gx = 0; gx < gW; gx++) {
    if (C[gy][gx]) {
      fillRect(oX + gx * (dot + gap), oY + gy * (dot + gap), dot, dot, 0x0d, 0x0d, 0x15);
    }
  }
}

// Encode RGBA PNG
const ihdr = Buffer.allocUnsafe(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;

const raw = Buffer.allocUnsafe(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE*4)] = 0;
  for (let x = 0; x < SIZE; x++) {
    const s = (y*SIZE+x)*4, d = y*(1+SIZE*4)+1+x*4;
    raw[d]=px[s]; raw[d+1]=px[s+1]; raw[d+2]=px[s+2]; raw[d+3]=px[s+3];
  }
}

const png = Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = 'src-tauri/icons/icon-source.png';
fs.writeFileSync(out, png);
console.log(`Written ${out} (${SIZE}x${SIZE})`);
