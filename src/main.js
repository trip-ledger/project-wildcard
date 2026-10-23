import * as THREE from 'three';
import { createAudio } from './audio.js';
import { createChaseCamera, updateChaseCamera } from './camera.js';
import { createClouds, updateClouds } from './clouds.js';
import { FlightModel } from './flight.js';
import { createGates, updateGates } from './gates.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createJet } from './jet.js';
import { createOcean } from './ocean.js';
import { buildRoute, localDateKey } from './route.js';
import { createSession } from './session.js';
import { createSky, updateSky } from './sky.js';
import { createTerrain } from './terrain.js';

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

const terrain = createTerrain();
scene.add(terrain.mesh);

const clouds = createClouds(FOG_COLOR, FOG_DENSITY);
clouds.material.uniforms.sunDirection.value.copy(sky.sunDirection);
scene.add(clouds.mesh);

scene.add(new THREE.HemisphereLight(0xf3c7a2, 0x1a3d4e, 0.9));
scene.add(new THREE.AmbientLight(0xfff2e6, 0.34));

const sunLight = new THREE.DirectionalLight(0xffc288, 3.6);
sunLight.position.copy(sky.sunDirection).multiplyScalar(100);
scene.add(sunLight);
scene.add(sunLight.target);

const jet = createJet();
scene.add(jet);

const params = new URLSearchParams(location.search);
const dateParam = params.get('date');
const dateKey = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
  ? dateParam
  : localDateKey(new Date());
const route = buildRoute(dateKey, terrain.heightAt);
const gates = createGates(route);
scene.add(gates.group);

const flight = new FlightModel(terrain.heightAt);
const prevPosition = new THREE.Vector3().copy(flight.position);
const chase = createChaseCamera(window.innerWidth / Math.max(window.innerHeight, 1));
const input = createInput();
const session = createSession(route);
const audio = createAudio((muted) => hud.setMuted(muted));
const hud = createHud({
  onFlyAgain: flyAgain,
  onToggleMute: () => hud.setMuted(audio.toggle()),
});

function flyAgain() {
  flight.reset();
  session.reset();
  prevPosition.copy(flight.position);
  chase.ready = false;
  hud.hideResults();
  renderer.domElement.focus();
}

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

jet.position.copy(flight.position);
jet.quaternion.copy(flight.quaternion);
updateChaseCamera(chase, flight, 1);

if (params.get('complete') === '1') {
  hud.showResults(session.debugFinish());
  updateGates(gates, session, performance.now());
}

if (params.get('debug') === '1' || params.get('complete') === '1') {
  window.__debug = () => ({
    route: {
      date: route.date,
      seed: route.seed,
      seedHex: route.seedHex,
      gates: route.gates.map((gate) => ({
        x: gate.x,
        y: gate.y,
        z: gate.z,
        ax: gate.ax,
        ay: gate.ay,
        az: gate.az,
        radius: gate.radius,
        finish: gate.finish,
      })),
    },
    flight: {
      x: flight.position.x,
      y: flight.position.y,
      z: flight.position.z,
      airspeed: flight.airspeed,
      pitch: flight.pitch,
      roll: flight.roll,
      yaw: flight.yaw,
      throttle: flight.throttle,
    },
    session: session.view(performance.now()),
    audio: audio.debug(),
  });
}

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = (now - last) / 1000;
  last = now;
  if (document.hidden) return;
  const dt = Math.min(Math.max(elapsed, 0), 0.05);

  if (!session.state.finished) {
    input.update();
    flight.update(input.state, dt);
    const outcome = session.update(flight, now, dt, prevPosition);
    if (outcome.chime) audio.chime();
    if (outcome.finished) hud.showResults(outcome.result);
    prevPosition.copy(flight.position);

    jet.position.copy(flight.position);
    jet.quaternion.copy(flight.quaternion);

    updateChaseCamera(chase, flight, dt);
    const camera = chase.camera.position;
    const cameraFloor = Math.max(1.2, terrain.heightAt(camera.x, camera.z) + 2.2);
    if (camera.y < cameraFloor) {
      camera.y = cameraFloor;
      chase.camera.lookAt(chase.lookCurrent);
    }
    input.syncThrottle(flight.throttle);
  }

  updateSky(sky, chase.camera);
  ocean.mesh.position.x = flight.position.x;
  ocean.mesh.position.z = flight.position.z;
  ocean.material.uniforms.time.value = now * 0.001;
  sky.material.uniforms.time.value = now * 0.001;
  updateClouds(clouds, chase.camera, now * 0.001);
  updateGates(gates, session, now);
  audio.update(flight);
  hud.update(flight, session.view(now));
  renderer.render(scene, chase.camera);
  considerResolution(elapsed);
}

requestAnimationFrame(frame);
window.addEventListener('visibilitychange', () => {
  last = performance.now();
});
