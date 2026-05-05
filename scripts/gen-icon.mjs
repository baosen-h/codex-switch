import fs from "fs";
import path from "path";
import zlib from "zlib";

const OUT_DIR = "src-tauri/icons";
const ICON_COORD = 1024;
const BG = [0xff, 0xff, 0xff, 0xff];
const INK = [0x0d, 0x0d, 0x12, 0xff];

const pngTargets = new Map([
  ["icon-source.png", 1024],
  ["icon.png", 512],
  ["32x32.png", 32],
  ["64x64.png", 64],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["Square30x30Logo.png", 30],
  ["Square44x44Logo.png", 44],
  ["Square71x71Logo.png", 71],
  ["Square89x89Logo.png", 89],
  ["Square107x107Logo.png", 107],
  ["Square142x142Logo.png", 142],
  ["Square150x150Logo.png", 150],
  ["Square284x284Logo.png", 284],
  ["Square310x310Logo.png", 310],
  ["StoreLogo.png", 50],
]);

const icoSizes = [16, 24, 32, 48, 64, 256];

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.allocUnsafe(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function blendPixel(px, index, color, alpha) {
  const sourceAlpha = alpha * (color[3] / 255);
  const destAlpha = px[index + 3] / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);

  if (outAlpha <= 0) {
    px[index] = 0;
    px[index + 1] = 0;
    px[index + 2] = 0;
    px[index + 3] = 0;
    return;
  }

  px[index] = Math.round((color[0] * sourceAlpha + px[index] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  px[index + 1] = Math.round((color[1] * sourceAlpha + px[index + 1] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  px[index + 2] = Math.round((color[2] * sourceAlpha + px[index + 2] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  px[index + 3] = Math.round(outAlpha * 255);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared === 0 ? 0 : clamp((wx * vx + wy * vy) / lengthSquared);
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return Math.hypot(dx, dy);
}

function distanceToPolyline(x, y, points) {
  let distance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i += 1) {
    distance = Math.min(
      distance,
      distanceToSegment(x, y, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]),
    );
  }
  return distance;
}

function roundedRectDistance(x, y, centerX, centerY, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x - centerX) - halfWidth + radius;
  const qy = Math.abs(y - centerY) - halfHeight + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function strokeCoverage(distance, width, aa) {
  return clamp((width / 2 + aa - distance) / (2 * aa));
}

function fillCoverage(distance, aa) {
  return clamp((aa - distance) / (2 * aa));
}

function renderIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const unit = ICON_COORD / size;
  const aa = Math.max(unit * 1.3, 1.1);
  const cPath = [
    [708, 304],
    [394, 304],
    [306, 392],
    [306, 632],
    [394, 720],
    [708, 720],
  ];
  const switchPath = [
    [438, 512],
    [724, 512],
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const sx = (x + 0.5) * unit;
      const sy = (y + 0.5) * unit;

      const bgDistance = roundedRectDistance(sx, sy, 512, 512, 424, 424, 160);
      const bgCoverage = fillCoverage(bgDistance, aa);
      if (bgCoverage > 0) {
        blendPixel(px, index, BG, bgCoverage);
      }

      const markDistance = Math.min(
        distanceToPolyline(sx, sy, cPath),
        distanceToPolyline(sx, sy, switchPath),
      );
      const markCoverage = strokeCoverage(markDistance, 112, aa);
      if (markCoverage > 0) {
        blendPixel(px, index, INK, markCoverage);
      }
    }
  }

  return encodePng(px, size);
}

function encodePng(px, size) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.allocUnsafe(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    raw[y * (1 + size * 4)] = 0;
    for (let x = 0; x < size; x += 1) {
      const source = (y * size + x) * 4;
      const target = y * (1 + size * 4) + 1 + x * 4;
      raw[target] = px[source];
      raw[target + 1] = px[source + 1];
      raw[target + 2] = px[source + 2];
      raw[target + 3] = px[source + 3];
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIco(entries) {
  const headerSize = 6;
  const entrySize = 16;
  const header = Buffer.alloc(headerSize + entries.length * entrySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let imageOffset = header.length;
  entries.forEach(({ size, png }, index) => {
    const offset = headerSize + index * entrySize;
    header[offset] = size >= 256 ? 0 : size;
    header[offset + 1] = size >= 256 ? 0 : size;
    header[offset + 2] = 0;
    header[offset + 3] = 0;
    header.writeUInt16LE(1, offset + 4);
    header.writeUInt16LE(32, offset + 6);
    header.writeUInt32LE(png.length, offset + 8);
    header.writeUInt32LE(imageOffset, offset + 12);
    imageOffset += png.length;
  });

  return Buffer.concat([header, ...entries.map((entry) => entry.png)]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const pngCache = new Map();
for (const size of new Set([...pngTargets.values(), ...icoSizes])) {
  pngCache.set(size, renderIcon(size));
}

for (const [fileName, size] of pngTargets) {
  const outPath = path.join(OUT_DIR, fileName);
  fs.writeFileSync(outPath, pngCache.get(size));
  console.log(`Written ${outPath} (${size}x${size})`);
}

const ico = encodeIco(icoSizes.map((size) => ({ size, png: pngCache.get(size) })));
fs.writeFileSync(path.join(OUT_DIR, "icon.ico"), ico);
console.log(`Written ${path.join(OUT_DIR, "icon.ico")} (${icoSizes.join(", ")})`);
