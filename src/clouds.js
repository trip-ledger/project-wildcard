import * as THREE from 'three';

const SPAN = 8400;
const COLUMNS = 5;
const ROWS = 5;

const vertexShader = /* glsl */ `
  attribute vec3 aPlaneNormal;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vColor;
  varying float vFacing;

  void main() {
    vUv = uv;
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec3 worldNormal = normalize(mat3(instanceMatrix) * aPlaneNormal);
    vFacing = abs(dot(normalize(cameraPosition - world.xyz), worldNormal));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 sunDirection;
  uniform vec3 fogColor;
  uniform float fogDensity;

  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vColor;
  varying float vFacing;

  void main() {
    float alpha = texture2D(map, vUv).a;
    /* Edge-on cards collapse into a dark streak; fade them. */
    float graze = smoothstep(0.04, 0.22, vFacing);
    alpha *= graze;
    if (alpha < 0.04) discard;

    vec3 toSun = normalize(sunDirection);
    float warm = clamp(dot(normalize(vWorld - cameraPosition), toSun) * 0.5 + 0.5, 0.0, 1.0);
    float lift = smoothstep(0.15, 0.95, vUv.y);
    vec3 shade = vec3(0.67, 0.48, 0.42);
    vec3 lit = vec3(1.0, 0.84, 0.64);
    vec3 col = mix(shade, lit, clamp(0.35 + warm * 0.4 + lift * 0.25, 0.0, 1.0));
    col = mix(lit, col, graze);
    col *= mix(vec3(1.0), vColor, 0.55);

    float dist = length(cameraPosition - vWorld);
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
    col = mix(col, fogColor, clamp(fogFactor, 0.0, 0.9));
    float fade = 1.0 - smoothstep(2400.0, 4000.0, dist);
    alpha *= fade * (1.0 - fogFactor * 0.35);
    gl_FragColor = vec4(col, alpha * 0.82);
  }
`;

function mulberry32(seed) {
  let state = seed >>> 0;
  return function rand() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePuffTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const blobs = [
    [64, 72, 48, 0.62],
    [42, 78, 34, 0.42],
    [88, 76, 36, 0.4],
    [64, 50, 32, 0.48],
    [54, 84, 26, 0.28],
    [76, 58, 24, 0.26],
  ];
  for (let i = 0; i < blobs.length; i += 1) {
    const [x, y, radius, strength] = blobs[i];
    const gradient = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${strength})`);
    gradient.addColorStop(0.5, `rgba(255,255,255,${strength * 0.42})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function puffGeometry() {
  const positions = [];
  const uvs = [];
  const quad = [
    [-1, -0.42, 0, 0.15],
    [1, -0.42, 1, 0.15],
    [1, 0.72, 1, 1],
    [-1, -0.42, 0, 0.15],
    [1, 0.72, 1, 1],
    [-1, 0.72, 0, 1],
  ];

  const normals = [];
  for (let plane = 0; plane < 2; plane += 1) {
    const angle = plane * Math.PI * 0.5;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const nx = -sine;
    const nz = cosine;
    for (let i = 0; i < quad.length; i += 1) {
      const [x, y, u, v] = quad[i];
      positions.push(x * cosine, y, x * sine);
      uvs.push(u, v);
      normals.push(nx, 0, nz);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aPlaneNormal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function buildPuffs() {
  const rand = mulberry32(0x51c0);
  const puffs = [];
  for (let gz = 0; gz < ROWS; gz += 1) {
    for (let gx = 0; gx < COLUMNS; gx += 1) {
      const cx = ((gx + 0.5) / COLUMNS) * SPAN - SPAN / 2 + (rand() - 0.5) * SPAN * 0.1;
      const cz = ((gz + 0.5) / ROWS) * SPAN - SPAN / 2 + (rand() - 0.5) * SPAN * 0.1;
      const baseY = 500 + rand() * 620;
      const members = rand() > 0.55 ? 4 : 3;
      for (let i = 0; i < members; i += 1) {
        puffs.push({
          x: cx + (rand() - 0.5) * 420,
          y: baseY + (rand() - 0.5) * 90,
          z: cz + (rand() - 0.5) * 420,
          sx: 170 + rand() * 210,
          sy: 78 + rand() * 70,
          rot: rand() * Math.PI,
          phase: rand() * Math.PI * 2,
          hue: rand(),
        });
      }
    }
  }
  return puffs;
}

function wrap(delta, span) {
  const half = span * 0.5;
  return ((delta + half) % span + span) % span - half;
}

export function createClouds(fogColor, fogDensity) {
  const puffs = buildPuffs();
  const geometry = puffGeometry();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: makePuffTexture() },
      sunDirection: { value: new THREE.Vector3(0.2, 0.4, -0.4) },
      fogColor: { value: fogColor.clone() },
      fogDensity: { value: fogDensity },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, puffs.length);
  mesh.name = 'clouds';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const color = new THREE.Color();
  for (let i = 0; i < puffs.length; i += 1) {
    color.setHSL(0.07 + puffs[i].hue * 0.04, 0.45, 0.78 + puffs[i].hue * 0.12);
    mesh.setColorAt(i, color);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  mesh.count = puffs.length;
  return {
    mesh,
    material,
    puffs,
    span: SPAN,
    active: puffs.length,
    dummy: new THREE.Object3D(),
  };
}

export function setCloudDensity(clouds, fraction) {
  const clamped = Math.min(1, Math.max(0.15, fraction));
  const count = Math.max(6, Math.round(clouds.puffs.length * clamped));
  clouds.active = count;
  clouds.mesh.count = count;
}

export function updateClouds(clouds, camera, timeSeconds) {
  const { puffs, span, dummy, mesh } = clouds;
  const count = clouds.active || puffs.length;
  const originX = camera.position.x;
  const originZ = camera.position.z;
  const wind = timeSeconds * 8;

  for (let i = 0; i < count; i += 1) {
    const puff = puffs[i];
    const x = originX + wrap(puff.x + wind - originX, span);
    const z = originZ + wrap(puff.z + wind * 0.35 - originZ, span);
    const y = puff.y + Math.sin(timeSeconds * 0.18 + puff.phase) * 8;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, puff.rot, 0);
    dummy.scale.set(puff.sx, puff.sy, puff.sx);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
