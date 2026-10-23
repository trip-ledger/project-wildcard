import { ISLANDS } from './terrain.js';

const HIT_RADIUS_PAD = 2;
const MISS_DISTANCE = 240;
const MIN_STEP = 700;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function rand() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local calendar day, `YYYY-MM-DD`. The same string is the same course. */
export function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function hashDate(dateKey) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function seedHex(seed) {
  return (seed >>> 0).toString(16).padStart(8, '0');
}

function axisBetween(from, to) {
  let ax = to.x - from.x;
  let ay = to.y - from.y;
  let az = to.z - from.z;
  const length = Math.hypot(ax, ay, az) || 1;
  ax /= length;
  ay /= length;
  az /= length;
  return { ax, ay, az };
}

function separate(points) {
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    let dx = points[i].x - prev.x;
    let dz = points[i].z - prev.z;
    let dist = Math.hypot(dx, dz);
    if (dist >= MIN_STEP) continue;
    if (dist < 1) {
      dx = 0;
      dz = -1;
      dist = 1;
    }
    points[i].x = prev.x + (dx / dist) * MIN_STEP;
    points[i].z = prev.z + (dz / dist) * MIN_STEP;
  }
}

function pushOffHighGround(point, heightAt) {
  let ground = heightAt(point.x, point.z);
  if (ground <= 48) return ground;
  let nearest = ISLANDS[0];
  let best = Infinity;
  for (let i = 0; i < ISLANDS.length; i += 1) {
    const dx = point.x - ISLANDS[i].x;
    const dz = point.z - ISLANDS[i].z;
    const dist = dx * dx + dz * dz;
    if (dist < best) {
      best = dist;
      nearest = ISLANDS[i];
    }
  }
  const dx = point.x - nearest.x;
  const dz = point.z - nearest.z;
  const length = Math.hypot(dx, dz) || 1;
  point.x += (dx / length) * 200;
  point.z += (dz / length) * 200;
  return heightAt(point.x, point.z);
}

/**
 * Six to ten rings for one calendar day. The opening ring sits on the
 * departure line (the aircraft starts at y=320 flying -Z). Later rings
 * step outward through the island chain, on seeded shoulders.
 */
export function buildRoute(dateKey, heightAt) {
  const seed = hashDate(dateKey);
  const rand = mulberry32(seed);
  const count = 6 + Math.floor(rand() * 5);
  const ordered = [...ISLANDS].sort(
    (a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z),
  );

  const points = [{
    x: (rand() - 0.5) * 28,
    y: 320 + (rand() - 0.5) * 16,
    z: -560 - rand() * 70,
  }];

  for (let i = 1; i < count; i += 1) {
    const t = i / (count - 1);
    const slot = t * (ordered.length - 1);
    const index = Math.min(ordered.length - 1, Math.floor(slot));
    const nextIndex = Math.min(ordered.length - 1, index + 1);
    const island = ordered[index];
    const next = ordered[nextIndex];
    const local = nextIndex === index ? 0 : slot - index;
    const side = rand() < 0.5 ? -1 : 1;
    const out = 0.7 + rand() * 0.55;
    const along = (rand() - 0.42) * 0.7;
    const outNext = 0.45 + rand() * 0.4;
    const alongNext = (rand() - 0.5) * 0.45;
    let x = island.x + side * island.rx * out;
    let z = island.z + along * island.rz;
    const nextX = next.x - side * next.rx * outNext;
    const nextZ = next.z + alongNext * next.rz;
    const mix = local * local * (3 - 2 * local);
    x += (nextX - x) * mix * 0.8;
    z += (nextZ - z) * mix * 0.8;
    points.push({ x, y: 0, z });
  }

  separate(points);
  for (let i = 1; i < points.length; i += 1) pushOffHighGround(points[i], heightAt);
  separate(points);

  let prevY = points[0].y;
  for (let i = 1; i < points.length; i += 1) {
    const ground = heightAt(points[i].x, points[i].z);
    let y = 292 + rand() * 76;
    if (y < ground + 72) y = ground + 72;
    y = clamp(y, prevY - 68, prevY + 68);
    if (y < ground + 56) y = ground + 56;
    points[i].y = y;
    prevY = y;
  }

  const gates = points.map((point, index) => {
    const prev = index === 0 ? { x: 0, y: 320, z: 80 } : points[index - 1];
    const finish = index === points.length - 1;
    return {
      x: point.x,
      y: point.y,
      z: point.z,
      ...axisBetween(prev, point),
      radius: finish ? 52 : (index === 0 ? 48 : 42),
      finish,
    };
  });

  return {
    date: dateKey,
    seed,
    seedHex: seedHex(seed),
    gates,
  };
}

export function progressAlong(position, gate) {
  return (position.x - gate.x) * gate.ax
    + (position.y - gate.y) * gate.ay
    + (position.z - gate.z) * gate.az;
}

export function radialOffset(position, gate) {
  const px = position.x - gate.x;
  const py = position.y - gate.y;
  const pz = position.z - gate.z;
  const along = px * gate.ax + py * gate.ay + pz * gate.az;
  const rx = px - gate.ax * along;
  const ry = py - gate.ay * along;
  const rz = pz - gate.az * along;
  return Math.hypot(rx, ry, rz);
}

/** True when the segment from prev to curr passes through the ring. */
export function passedGate(prev, curr, gate) {
  const start = progressAlong(prev, gate);
  const end = progressAlong(curr, gate);
  if (start > 0 || end < 0) return false;
  const span = end - start;
  const t = span === 0 ? 0 : -start / span;
  if (t < 0 || t > 1) return false;
  const point = {
    x: prev.x + (curr.x - prev.x) * t,
    y: prev.y + (curr.y - prev.y) * t,
    z: prev.z + (curr.z - prev.z) * t,
  };
  return radialOffset(point, gate) <= gate.radius + HIT_RADIUS_PAD;
}

/** True once the aircraft is well past the ring's plane. */
export function missedGate(position, gate) {
  return progressAlong(position, gate) > MISS_DISTANCE;
}
