import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const WIDTH = 1200;
const HEIGHT = 630;

const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function createImage(width, height) {
  const data = Buffer.alloc(width * height * 3);
  return {
    width,
    height,
    data,
    put(x, y, r, g, b, a = 1) {
      if (x < 0 || y < 0 || x >= width || y >= height || a <= 0) return;
      const i = (y * width + x) * 3;
      if (a >= 1) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        return;
      }
      data[i] = Math.round(data[i] * (1 - a) + r * a);
      data[i + 1] = Math.round(data[i + 1] * (1 - a) + g * a);
      data[i + 2] = Math.round(data[i + 2] * (1 - a) + b * a);
    },
  };
}

function mix(a, b, t) {
  const u = Math.min(1, Math.max(0, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
}

function smooth(t) {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

function paintSky(image) {
  const horizon = 392;
  const zenith = [32, 72, 138];
  const upper = [118, 156, 204];
  const haze = [244, 176, 112];
  const glow = [255, 214, 156];
  for (let y = 0; y < horizon; y += 1) {
    const t = y / horizon;
    let color = mix(zenith, upper, smooth(t / 0.55));
    color = mix(color, haze, smooth((t - 0.42) / 0.58));
    color = mix(color, glow, smooth((t - 0.72) / 0.28) * 0.55);
    for (let x = 0; x < image.width; x += 1) {
      const sunX = (x - 860) / image.width;
      const warm = Math.max(0, 1 - Math.abs(sunX) * 1.6) * smooth((t - 0.35) / 0.65);
      const pixel = mix(color, [255, 196, 130], warm * 0.45);
      image.put(x, y, pixel[0], pixel[1], pixel[2]);
    }
  }
}

function disc(image, cx, cy, radius, color, alpha) {
  const r = Math.ceil(radius);
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      const d = Math.hypot(x, y);
      if (d > radius) continue;
      const edge = d > radius - 1.5 ? (radius - d) / 1.5 : 1;
      image.put(cx + x, cy + y, color[0], color[1], color[2], alpha * edge);
    }
  }
}

function paintSun(image) {
  disc(image, 868, 318, 150, [255, 186, 96], 0.18);
  disc(image, 868, 318, 78, [255, 214, 140], 0.45);
  disc(image, 868, 318, 34, [255, 244, 220], 1);
  disc(image, 868, 318, 16, [255, 252, 244], 1);
}

function ellipse(image, cx, cy, rx, ry, color, alpha) {
  for (let y = Math.floor(-ry); y <= ry; y += 1) {
    const span = rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)));
    for (let x = Math.floor(-span); x <= span; x += 1) {
      const nx = x / rx;
      const ny = y / ry;
      const d = nx * nx + ny * ny;
      const edge = d > 0.85 ? Math.max(0, (1 - d) / 0.15) : 1;
      const shade = y > 0 ? 0.82 : 1;
      image.put(
        cx + x,
        cy + y,
        Math.round(color[0] * shade),
        Math.round(color[1] * shade),
        Math.round(color[2] * shade),
        alpha * edge,
      );
    }
  }
}

function paintClouds(image) {
  const puffs = [
    [180, 132, 150, 28, 0.55],
    [250, 146, 90, 18, 0.4],
    [430, 108, 180, 26, 0.5],
    [560, 124, 110, 18, 0.42],
    [760, 156, 130, 20, 0.38],
    [1020, 118, 160, 24, 0.48],
    [1120, 142, 90, 16, 0.36],
  ];
  for (const [x, y, rx, ry, alpha] of puffs) {
    ellipse(image, x, y, rx, ry, [255, 236, 214], alpha);
    ellipse(image, x, y + 8, rx * 0.72, ry * 0.7, [244, 176, 122], alpha * 0.35);
  }
}

function paintVirga(image) {
  const shafts = [
    [400, 150],
    [438, 158],
    [470, 146],
    [508, 162],
    [540, 154],
  ];
  for (const [x, y0] of shafts) {
    for (let i = 0; i < 210; i += 1) {
      const fade = 1 - i / 210;
      const sway = Math.sin(i * 0.08 + x) * 1.4;
      image.put(Math.round(x + sway), y0 + i, 186, 132, 96, fade * fade * 0.28);
      image.put(Math.round(x + sway + 1), y0 + i, 214, 168, 122, fade * 0.12);
    }
  }
}

function paintSea(image) {
  const horizon = 392;
  const near = [168, 126, 102];
  const mid = [46, 78, 96];
  const deep = [10, 32, 48];
  for (let y = horizon; y < image.height; y += 1) {
    const t = (y - horizon) / (image.height - horizon);
    let color = mix(near, mid, smooth(t / 0.45));
    color = mix(color, deep, smooth((t - 0.25) / 0.75));
    for (let x = 0; x < image.width; x += 1) {
      const glitter = Math.exp(-((x - 860) ** 2) / (2 * 90 * 90)) * (1 - t) * 0.55;
      const wave = (Math.sin(x * 0.05 + y * 0.35) * 0.5 + 0.5) * 0.06 * (1 - t);
      const pixel = mix(color, [255, 220, 170], glitter + wave);
      image.put(x, y, pixel[0], pixel[1], pixel[2]);
    }
  }
  for (let x = 0; x < image.width; x += 1) {
    image.put(x, horizon, 255, 228, 196, 0.85);
    image.put(x, horizon + 1, 244, 196, 150, 0.4);
  }
}

function mound(image, cx, base, rx, ry, body, cap) {
  for (let y = 0; y <= ry; y += 1) {
    const span = rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)));
    for (let x = Math.floor(-span); x <= span; x += 1) {
      const shade = 0.78 + (1 - y / ry) * 0.28;
      const color = y > ry * 0.62 ? cap : body;
      image.put(
        cx + x,
        base - y,
        Math.round(color[0] * shade),
        Math.round(color[1] * shade),
        Math.round(color[2] * shade),
      );
    }
  }
}

function paintIslands(image) {
  const sand = [196, 160, 108];
  const scrub = [92, 112, 64];
  const forest = [48, 86, 58];
  mound(image, 250, 400, 120, 34, scrub, forest);
  mound(image, 250, 404, 120, 10, sand, sand);
  mound(image, 470, 404, 168, 46, scrub, forest);
  mound(image, 470, 408, 168, 12, sand, sand);
  mound(image, 1088, 398, 86, 26, scrub, forest);
  mound(image, 1088, 402, 86, 8, sand, sand);
}

function fillPoly(image, points, color) {
  const ys = points.map((p) => p[1]);
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(image.height - 1, Math.ceil(Math.max(...ys)));
  for (let y = minY; y <= maxY; y += 1) {
    const xs = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + (b[0] - a[0]) * t);
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const from = Math.max(0, Math.ceil(xs[i]));
      const to = Math.min(image.width - 1, Math.floor(xs[i + 1]));
      for (let x = from; x <= to; x += 1) image.put(x, y, color[0], color[1], color[2]);
    }
  }
}

function paintJet(image) {
  const cream = [243, 240, 232];
  const shade = [196, 188, 176];
  const glass = [26, 36, 46];
  const accent = [212, 101, 47];
  const hot = [255, 177, 90];
  fillPoly(image, [
    [250, 292],
    [430, 268],
    [448, 274],
    [430, 292],
    [250, 304],
  ], cream);
  fillPoly(image, [
    [250, 304],
    [430, 292],
    [448, 300],
    [300, 312],
    [250, 308],
  ], shade);
  fillPoly(image, [
    [300, 286],
    [392, 274],
    [404, 280],
    [318, 296],
  ], cream);
  fillPoly(image, [
    [168, 286],
    [214, 278],
    [228, 292],
    [176, 302],
  ], cream);
  fillPoly(image, [
    [156, 262],
    [176, 262],
    [188, 292],
    [168, 300],
  ], cream);
  fillPoly(image, [
    [392, 278],
    [424, 274],
    [420, 286],
    [390, 286],
  ], glass);
  fillPoly(image, [
    [236, 294],
    [268, 294],
    [268, 300],
    [236, 300],
  ], accent);
  disc(image, 162, 294, 5, hot, 1);
}

function paintRing(image) {
  const cx = 640;
  const cy = 286;
  const rx = 74;
  const ry = 46;
  for (let y = cy - ry - 8; y <= cy + ry + 8; y += 1) {
    for (let x = cx - rx - 8; x <= cx + rx + 8; x += 1) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d < 0.78 || d > 1.22) continue;
      const edge = 1 - Math.min(1, Math.abs(d - 1) / 0.16);
      const glow = d < 1 ? 0.35 : edge;
      image.put(x, y, 255, 214, 150, Math.max(edge, glow * 0.7));
    }
  }
}

function paintPanel(image) {
  for (let y = 486; y <= 590; y += 1) {
    for (let x = 56; x <= 560; x += 1) {
      const r = 14;
      const left = x < 56 + r;
      const right = x > 560 - r;
      const top = y < 486 + r;
      const bottom = y > 590 - r;
      if (left && top && Math.hypot(x - (56 + r), y - (486 + r)) > r) continue;
      if (right && top && Math.hypot(x - (560 - r), y - (486 + r)) > r) continue;
      if (left && bottom && Math.hypot(x - (56 + r), y - (590 - r)) > r) continue;
      if (right && bottom && Math.hypot(x - (560 - r), y - (590 - r)) > r) continue;
      image.put(x, y, 28, 20, 15, 0.9);
    }
  }
}

function paintText(image, text, x, y, scale, color) {
  let cursor = x;
  for (const char of text) {
    const glyph = FONT[char] || FONT[' '];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== '1') continue;
        for (let py = 0; py < scale; py += 1) {
          for (let px = 0; px < scale; px += 1) {
            image.put(cursor + col * scale + px, y + row * scale + py, color[0], color[1], color[2]);
          }
        }
      }
    }
    cursor += 6 * scale;
  }
}

function crc32(buffer) {
  let c = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    c ^= buffer[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(image) {
  const { width, height, data } = image;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    data.copy(raw, row + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

const image = createImage(WIDTH, HEIGHT);
paintSky(image);
paintSun(image);
paintClouds(image);
paintVirga(image);
paintSea(image);
paintIslands(image);
paintRing(image);
paintJet(image);
paintPanel(image);
paintText(image, 'VIRGA', 84, 508, 8, [247, 241, 232]);
paintText(image, 'A DAILY RING COURSE', 86, 572, 3, [240, 210, 173]);

const png = encodePng(image);
const out = path.resolve('public/og.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
if (png.readUInt32BE(16) !== WIDTH || png.readUInt32BE(20) !== HEIGHT) {
  throw new Error('share card header does not match 1200x630');
}
console.log(`[share] ${out} ${png.length} bytes ${WIDTH}x${HEIGHT}`);
