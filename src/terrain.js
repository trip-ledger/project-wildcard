import * as THREE from 'three';
import { yieldThread } from './yield.js';

// Hand-placed so the spawn view looks down a short chain of land, then a
// larger coast. Shapes are elliptical domes warped by value noise.
export const ISLANDS = [
  { x: -40, z: -1180, rx: 520, rz: 340, peak: 56 },
  { x: 1320, z: -1680, rx: 440, rz: 330, peak: 98 },
  { x: -1360, z: -2060, rx: 480, rz: 360, peak: 116 },
  { x: 980, z: -2460, rx: 400, rz: 300, peak: 132 },
  { x: 80, z: -4200, rx: 1460, rz: 820, peak: 300 },
  { x: 2280, z: -2920, rx: 360, rz: 280, peak: 92 },
];

const SAND = new THREE.Color(0xd8bc86);
const DUNE = new THREE.Color(0xc6b56a);
const SCRUB = new THREE.Color(0x8ea24a);
const GRASS = new THREE.Color(0x4f7a38);
const FOREST = new THREE.Color(0x335833);
const ROCK = new THREE.Color(0x8e847b);
const PEAK = new THREE.Color(0xb5a394);
const STOPS = [
  { h: 1.5, color: SAND },
  { h: 7, color: DUNE },
  { h: 18, color: SCRUB },
  { h: 48, color: GRASS },
  { h: 110, color: FOREST },
  { h: 200, color: ROCK },
  { h: 340, color: PEAK },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(ix, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const n00 = hash2(x0, z0);
  const n10 = hash2(x0 + 1, z0);
  const n01 = hash2(x0, z0 + 1);
  const n11 = hash2(x0 + 1, z0 + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sz;
}

function fbm(x, z) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 3; octave += 1) {
    value += amplitude * noise(x * frequency, z * frequency);
    frequency *= 2;
    amplitude *= 0.5;
  }
  return value;
}

function sampleIsland(island, x, z) {
  const warpX = (fbm(x * 0.0016 + 8, z * 0.0016) - 0.5) * island.rx * 0.2;
  const warpZ = (fbm(x * 0.0016, z * 0.0016 + 5) - 0.5) * island.rz * 0.2;
  const dx = (x - island.x + warpX) / island.rx;
  const dz = (z - island.z + warpZ) / island.rz;
  const distance = Math.hypot(dx, dz);
  if (distance >= 1) return { height: 0, distance };

  const inland = 1 - distance;
  const beach = smoothstep(0, 0.14, inland);
  const hill = inland ** 1.85;
  const broad = fbm(x * 0.0024 + island.x * 0.01, z * 0.0024);
  const ridge = fbm(x * 0.006 + 19, z * 0.006);
  const shape = 0.62 + 0.38 * broad;
  let height = island.peak * beach * hill * shape;
  height += island.peak * 0.16 * hill * clamp(ridge - 0.42, 0, 1) ** 1.4;
  return { height, distance };
}

export function heightAt(x, z) {
  let height = 0;
  for (let i = 0; i < ISLANDS.length; i += 1) {
    const sample = sampleIsland(ISLANDS[i], x, z).height;
    if (sample > height) height = sample;
  }
  return height;
}

const grids = [];

function heightOnGrid(grid, x, z) {
  const fx = (x - grid.x0) / grid.xStep;
  const fz = (z - grid.z0) / grid.zStep;
  const eps = 1e-3;
  if (fx < -eps || fz < -eps || fx > grid.cells + eps || fz > grid.cells + eps) return null;
  const clampedX = Math.min(grid.cells, Math.max(0, fx));
  const clampedZ = Math.min(grid.cells, Math.max(0, fz));
  const ix = Math.min(grid.cells - 1, Math.floor(clampedX));
  const iz = Math.min(grid.cells - 1, Math.floor(clampedZ));
  const tx = clampedX - ix;
  const tz = clampedZ - iz;
  const stride = grid.cells + 1;
  const h00 = grid.heights[iz * stride + ix];
  const h10 = grid.heights[iz * stride + ix + 1];
  const h01 = grid.heights[(iz + 1) * stride + ix];
  const h11 = grid.heights[(iz + 1) * stride + ix + 1];
  // Matches the two triangles written in appendIsland: (a, c, b) and (b, c, d).
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return h11 + (h10 - h11) * (1 - tz) + (h01 - h11) * (1 - tx);
}

/** Height of the drawn island mesh. Open water is 0. The apron can be below 0. */
export function meshHeightAt(x, z) {
  let height = null;
  for (let i = 0; i < grids.length; i += 1) {
    const sample = heightOnGrid(grids[i], x, z);
    if (sample == null) continue;
    if (height == null || sample > height) height = sample;
  }
  return height == null ? 0 : height;
}

function colorAt(height, target) {
  const y = Math.max(height, 0);
  let below = STOPS[0];
  let above = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length; i += 1) {
    if (STOPS[i].h >= y) {
      above = STOPS[i];
      below = STOPS[Math.max(0, i - 1)];
      break;
    }
    below = STOPS[i];
  }
  const span = above.h - below.h;
  const t = span <= 0 ? 0 : clamp((y - below.h) / span, 0, 1);
  return target.copy(below.color).lerp(above.color, t);
}

function appendIsland(island, positions, colors, indices, scratch) {
  const reach = 1.36;
  const cells = Math.min(
    42,
    Math.max(12, Math.round((Math.max(island.rx, island.rz) * 2 * reach) / 58)),
  );
  const stride = cells + 1;
  const base = positions.length / 3;
  const x0 = island.x - island.rx * reach;
  const z0 = island.z - island.rz * reach;
  const xStep = (island.rx * 2 * reach) / cells;
  const zStep = (island.rz * 2 * reach) / cells;
  const heights = new Float32Array(stride * stride);

  for (let iz = 0; iz <= cells; iz += 1) {
    for (let ix = 0; ix <= cells; ix += 1) {
      const x = x0 + ix * xStep;
      const z = z0 + iz * zStep;
      const local = sampleIsland(island, x, z);
      let y = local.height;
      if (local.distance > 0.9) {
        const t = smoothstep(0.9, 1.14, local.distance);
        y = y * (1 - t) - 3.5 * t;
      }
      heights[iz * stride + ix] = y;
      positions.push(x, y, z);
      colorAt(y, scratch);
      colors.push(scratch.r, scratch.g, scratch.b);
    }
  }
  grids.push({ x0, z0, xStep, zStep, cells, heights });

  for (let iz = 0; iz < cells; iz += 1) {
    for (let ix = 0; ix < cells; ix += 1) {
      const a = base + iz * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
}

export async function createTerrain() {
  grids.length = 0;
  const positions = [];
  const colors = [];
  const indices = [];
  const scratch = new THREE.Color();

  for (let i = 0; i < ISLANDS.length; i += 1) {
    appendIsland(ISLANDS[i], positions, colors, indices, scratch);
    await yieldThread();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  await yieldThread();
  geometry.computeVertexNormals();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;

  function vertexError() {
    const position = geometry.getAttribute('position');
    let maxError = 0;
    const step = Math.max(1, Math.floor(position.count / 40));
    for (let i = 0; i < position.count; i += step) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      let best = Infinity;
      for (let g = 0; g < grids.length; g += 1) {
        const sample = heightOnGrid(grids[g], x, z);
        if (sample == null) continue;
        best = Math.min(best, Math.abs(sample - y));
      }
      if (!Number.isFinite(best)) best = Math.abs(meshHeightAt(x, z) - y);
      if (!Number.isFinite(best)) best = 1000;
      maxError = Math.max(maxError, best);
    }
    return maxError;
  }

  return { mesh, heightAt, meshHeightAt, vertexError };
}
