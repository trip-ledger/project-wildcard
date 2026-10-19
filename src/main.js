import * as THREE from 'three';
import { createChaseCamera, updateChaseCamera } from './camera.js';
import { FlightModel } from './flight.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createJet } from './jet.js';
import { createOcean } from './ocean.js';
import { createSky, updateSky } from './sky.js';

const FOG_COLOR = new THREE.Color(0xd2b39a);
const FOG_DENSITY = 0.00028;

const app = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.domElement.tabIndex = 0;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = FOG_COLOR;
scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

const sky = createSky();
scene.add(sky.mesh);

const ocean = createOcean(FOG_COLOR, FOG_DENSITY);
ocean.mesh.renderOrder = 0;
scene.add(ocean.mesh);
ocean.material.uniforms.sunDirection.value.copy(sky.sunDirection);

scene.add(new THREE.HemisphereLight(0xf3c7a2, 0x1a3d4e, 0.9));
scene.add(new THREE.AmbientLight(0xfff2e6, 0.34));

const sunLight = new THREE.DirectionalLight(0xffc288, 3.6);
sunLight.position.copy(sky.sunDirection).multiplyScalar(100);
scene.add(sunLight);
scene.add(sunLight.target);

const jet = createJet();
scene.add(jet);

const flight = new FlightModel();
const chase = createChaseCamera(window.innerWidth / Math.max(window.innerHeight, 1));
const input = createInput();
const hud = createHud();

renderer.domElement.addEventListener('pointerdown', () => {
  renderer.domElement.focus();
});

const PIXEL_BUDGET = 1920 * 1080;
const frameTimes = [];
let resolutionScale = 1;

function currentPixelRatio() {
  const dprCap = Math.min(window.devicePixelRatio || 1, 1.5);
  let ratio = dprCap * resolutionScale;
  const pixels = window.innerWidth * Math.max(window.innerHeight, 1) * ratio * ratio;
  if (pixels > PIXEL_BUDGET) ratio *= Math.sqrt(PIXEL_BUDGET / pixels);
  return ratio;
}

function resize() {
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  chase.camera.aspect = width / height;
  chase.camera.updateProjectionMatrix();
  renderer.setPixelRatio(currentPixelRatio());
  renderer.setSize(width, height);
}

function considerResolution(elapsed) {
  if (elapsed > 0.08) return;
  frameTimes.push(elapsed);
  if (frameTimes.length > 40) frameTimes.shift();
  if (frameTimes.length < 30 || resolutionScale <= 0.5) return;
  const average = frameTimes.reduce((sum, time) => sum + time, 0) / frameTimes.length;
  if (average <= 0.0176) return;
  resolutionScale = Math.max(0.5, resolutionScale * 0.75);
  frameTimes.length = 0;
  resize();
}

window.addEventListener('resize', resize);
resize();

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = (now - last) / 1000;
  last = now;
  if (document.hidden) return;
  const dt = Math.min(Math.max(elapsed, 0), 0.05);

  input.update();
  flight.update(input.state, dt);

  jet.position.copy(flight.position);
  jet.quaternion.copy(flight.quaternion);

  updateChaseCamera(chase, flight, dt);
  updateSky(sky, chase.camera);

  ocean.mesh.position.x = flight.position.x;
  ocean.mesh.position.z = flight.position.z;
  ocean.material.uniforms.time.value = now * 0.001;

  sky.material.uniforms.time.value = now * 0.001;

  hud.update(flight);
  renderer.render(scene, chase.camera);
  considerResolution(elapsed);
}

requestAnimationFrame(frame);
window.addEventListener('visibilitychange', () => {
  last = performance.now();
});
