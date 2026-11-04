/**
 * Best-run ghost for one daily route.
 *
 * Samples are position and rotation at a fixed rate, quantized into
 * 16-bit fields, and stored under `untitled-ghost:<seed>`. Two seeds
 * are kept. A later attempt of the same route plays the samples back.
 */

export const GHOST_INTERVAL = 0.125;
export const MAX_CAPTURE = 2400;
export const MAX_STORED = 960;
export const MAX_ROUTES = 2;

const INDEX_KEY = 'untitled-ghost-index';
const VERSION = 1;
const ANGLE_SCALE = 10000;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toI16(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(Math.round(value), -32768, 32767);
}

function clampScore(score) {
  if (!Number.isFinite(score)) return 0;
  return clamp(Math.round(score), 0, 65535);
}

export function lerpAngle(from, to, t) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

export function ghostStorageKey(seed) {
  const clean = String(seed || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(clean)) return null;
  return `untitled-ghost:${clean}`;
}

function defaultStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function toBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(bytes.length, i + chunk)),
    );
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function cleanPose(sample) {
  if (!sample) return null;
  const pose = {
    x: Number(sample.x),
    y: Number(sample.y),
    z: Number(sample.z),
    pitch: Number(sample.pitch),
    yaw: Number(sample.yaw),
    roll: Number(sample.roll),
  };
  if (!Object.values(pose).every(Number.isFinite)) return null;
  return pose;
}

/**
 * Keep at most MAX_STORED samples spread across the whole run.
 * `interval` is the spacing of `samples` in seconds.
 */
export function fitSamples(samples, interval = GHOST_INTERVAL) {
  const step = Number(interval);
  if (!Number.isFinite(step) || step <= 0) return null;
  const clean = [];
  const list = Array.isArray(samples) ? samples : [];
  for (let i = 0; i < list.length && clean.length < MAX_CAPTURE; i += 1) {
    const pose = cleanPose(list[i]);
    if (pose) clean.push(pose);
  }
  if (clean.length < 2) return null;
  if (clean.length <= MAX_STORED) return { samples: clean, interval: step };
  const stored = [];
  const last = MAX_STORED - 1;
  const span = clean.length - 1;
  for (let i = 0; i < MAX_STORED; i += 1) {
    stored.push(clean[Math.round((i / last) * span)]);
  }
  return { samples: stored, interval: (span * step) / last };
}

export function encodeGhost({ score, interval, samples }) {
  const fitted = fitSamples(samples, interval);
  if (!fitted) return null;
  const count = fitted.samples.length;
  const bytes = new Uint8Array(8 + count * 12);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, VERSION, true);
  view.setUint16(2, count, true);
  view.setUint16(4, clamp(Math.round(fitted.interval * ANGLE_SCALE), 1, 65535), true);
  view.setUint16(6, clampScore(score), true);
  for (let i = 0; i < count; i += 1) {
    const pose = fitted.samples[i];
    const offset = 8 + i * 12;
    view.setInt16(offset, toI16(pose.x), true);
    view.setInt16(offset + 2, toI16(pose.y), true);
    view.setInt16(offset + 4, toI16(pose.z), true);
    view.setInt16(offset + 6, toI16(pose.pitch * ANGLE_SCALE), true);
    view.setInt16(offset + 8, toI16(pose.yaw * ANGLE_SCALE), true);
    view.setInt16(offset + 10, toI16(pose.roll * ANGLE_SCALE), true);
  }
  return toBase64(bytes);
}

export function decodeGhost(payload) {
  if (typeof payload !== 'string' || payload.length < 8 || payload.length > 40000) return null;
  let bytes;
  try {
    bytes = fromBase64(payload);
  } catch {
    return null;
  }
  if (bytes.length < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(0, true);
  const count = view.getUint16(2, true);
  const intervalUnits = view.getUint16(4, true);
  const score = view.getUint16(6, true);
  if (version !== VERSION || count < 2 || count > 4096 || intervalUnits === 0) return null;
  if (bytes.length !== 8 + count * 12) return null;
  const samples = [];
  for (let i = 0; i < count; i += 1) {
    const offset = 8 + i * 12;
    samples.push({
      x: view.getInt16(offset, true),
      y: view.getInt16(offset + 2, true),
      z: view.getInt16(offset + 4, true),
      pitch: view.getInt16(offset + 6, true) / ANGLE_SCALE,
      yaw: view.getInt16(offset + 8, true) / ANGLE_SCALE,
      roll: view.getInt16(offset + 10, true) / ANGLE_SCALE,
    });
  }
  return { score, interval: intervalUnits / ANGLE_SCALE, samples };
}

export function ghostPoseAt(record, time) {
  if (!record || !record.samples || record.samples.length === 0) return null;
  const samples = record.samples;
  const first = samples[0];
  if (samples.length === 1 || !(record.interval > 0)) {
    return { ...first };
  }
  const maxT = (samples.length - 1) * record.interval;
  const t = clamp(Number(time) || 0, 0, maxT);
  const scaled = t / record.interval;
  const i0 = Math.min(samples.length - 1, Math.floor(scaled));
  const i1 = Math.min(samples.length - 1, i0 + 1);
  const u = i1 === i0 ? 0 : scaled - i0;
  const a = samples[i0];
  const b = samples[i1];
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
    pitch: a.pitch + (b.pitch - a.pitch) * u,
    roll: a.roll + (b.roll - a.roll) * u,
    yaw: lerpAngle(a.yaw, b.yaw, u),
  };
}

export function createGhostRecorder() {
  let samples = [];
  let acc = 0;

  function copyPose(pose) {
    const clean = cleanPose(pose);
    return clean || {
      x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0,
    };
  }

  return {
    reset() {
      samples = [];
      acc = 0;
    },
    sample(pose, dt = 0, force = false) {
      // Match the flight step cap so one long frame does not skip the path.
      const step = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
      acc += step;
      const due = samples.length === 0 || acc >= GHOST_INTERVAL;
      if (!force && !due) return false;
      if (!force && samples.length >= MAX_CAPTURE) return false;
      const next = copyPose(pose);
      if (samples.length > 0 && (samples.length >= MAX_CAPTURE || (force && acc < GHOST_INTERVAL * 0.35))) {
        samples[samples.length - 1] = next;
        return true;
      }
      acc = 0;
      samples.push(next);
      return true;
    },
    snapshot() {
      return samples.map((sample) => ({ ...sample }));
    },
    get count() {
      return samples.length;
    },
  };
}

function readIndex(storage) {
  try {
    const raw = storage.getItem(INDEX_KEY);
    const data = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data.filter((row) => row && ghostStorageKey(row.seed));
  } catch {
    return [];
  }
}

export function createGhostStore({ seed, storage = defaultStorage(), now = () => Date.now() } = {}) {
  const key = ghostStorageKey(seed);

  function remember() {
    if (!storage || !key) return;
    const id = key.slice('untitled-ghost:'.length);
    const rows = readIndex(storage).filter((row) => row.seed !== id);
    rows.push({ seed: id, at: now() });
    rows.sort((a, b) => a.at - b.at);
    while (rows.length > MAX_ROUTES) {
      const drop = rows.shift();
      try {
        storage.removeItem(ghostStorageKey(drop.seed));
      } catch {
        // A leftover key is harmless. The new run is already stored.
      }
    }
    storage.setItem(INDEX_KEY, JSON.stringify(rows));
  }

  return {
    get key() {
      return key;
    },
    load() {
      if (!storage || !key) return null;
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        return decodeGhost(raw);
      } catch {
        return null;
      }
    },
    write(score, samples, interval = GHOST_INTERVAL) {
      if (!storage || !key) return false;
      const payload = encodeGhost({ score, interval, samples });
      if (!payload) return false;
      try {
        storage.setItem(key, payload);
        remember();
        return true;
      } catch {
        return false;
      }
    },
    save(score, samples, interval = GHOST_INTERVAL) {
      const existing = this.load();
      const nextScore = clampScore(score);
      if (existing && existing.score >= nextScore) return false;
      return this.write(nextScore, samples, interval);
    },
  };
}
