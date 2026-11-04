import * as THREE from 'three';
import { createAudio } from './audio.js';
import { createChaseCamera, liftCameraAboveTerrain, updateChaseCamera } from './camera.js';
import { createClouds, updateClouds } from './clouds.js';
import { FlightModel } from './flight.js';
import { createGates, updateGates } from './gates.js';
import { createGhostRecorder, createGhostStore, ghostPoseAt } from './ghost.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createJet } from './jet.js';
import { createMenu } from './menu.js';
import { createOcean } from './ocean.js';
import { createAdaptive, detectPhone } from './quality.js';
import { buildRoute, localDateKey } from './route.js';
import { createSession } from './session.js';
import { createSettings } from './settings.js';
import { createSky, updateSky } from './sky.js';
import { createTerrain } from './terrain.js';
import { GAME_TITLE } from './title.js';

const FOG_COLOR = new THREE.Color(0xd2b39a);
const FOG_DENSITY = 0.00028;

const phone = detectPhone();
const settings = createSettings({ defaultQuality: phone ? 'low' : 'high' });
document.title = GAME_TITLE;

const app = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({
  antialias: settings.quality !== 'low',
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.domElement.tabIndex = -1;
renderer.domElement.setAttribute('aria-hidden', 'true');
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
jet.traverse((obj) => {
  if (!obj.isMesh) return;
  obj.castShadow = true;
  obj.receiveShadow = true;
});
scene.add(jet);

const ghostJet = createJet({ ghost: true });
ghostJet.visible = false;
scene.add(ghostJet);
const ghostEuler = new THREE.Euler(0, 0, 0, 'YXZ');

const params = new URLSearchParams(location.search);
const dateParam = params.get('date');
const dateKey = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
  ? dateParam
  : localDateKey(new Date());
const route = buildRoute(dateKey, terrain.heightAt);
const gates = createGates(route);
scene.add(gates.group);

const flight = new FlightModel(terrain.meshHeightAt);
const prevPosition = new THREE.Vector3().copy(flight.position);
const ghostStore = createGhostStore({ seed: route.seedHex });
const ghostRecorder = createGhostRecorder();
let ghostTime = 0;
let ghostRecord = null;
const chase = createChaseCamera(window.innerWidth / Math.max(window.innerHeight, 1));
const input = createInput(() => ({ invertPitch: settings.invertPitch }));
const session = createSession(route);

let hud;
const audio = createAudio({
  getMuted: () => settings.muted,
  getVolume: () => settings.volume,
  setMuted: (muted) => settings.setMuted(muted),
  onChange: (muted) => hud?.setMuted(muted),
});

let mode = 'title';
let crashUntil = 0;
let raf = 0;

const adaptive = createAdaptive({
  renderer,
  sunLight,
  sunDirection: sky.sunDirection,
  clouds,
  getQuality: () => settings.quality,
  phone,
});

function placeAircraft() {
  jet.position.copy(flight.position);
  jet.quaternion.copy(flight.quaternion);
  updateChaseCamera(chase, flight, 1, { reduced: settings.reducedMotion, now: performance.now() });
  liftCameraAboveTerrain(chase.camera, flight.position, chase.lookCurrent, terrain.meshHeightAt);
}

function glowAmount() {
  return adaptive.glow() * (settings.reducedMotion ? 0.28 : 1);
}

function flightPose() {
  return {
    x: flight.position.x,
    y: flight.position.y,
    z: flight.position.z,
    pitch: flight.pitch,
    yaw: flight.yaw,
    roll: flight.roll,
  };
}

function syncGhost() {
  const show = Boolean(
    settings.showGhost
    && ghostRecord
    && (mode === 'playing' || mode === 'paused' || mode === 'crashed'),
  );
  ghostJet.visible = show;
  if (!show || !ghostRecord) return;
  const pose = ghostPoseAt(ghostRecord, ghostTime);
  if (!pose) {
    ghostJet.visible = false;
    return;
  }
  ghostJet.position.set(pose.x, pose.y, pose.z);
  ghostEuler.set(pose.pitch, pose.yaw, -pose.roll);
  ghostJet.quaternion.setFromEuler(ghostEuler);
}

function beginAttempt() {
  ghostRecorder.reset();
  ghostTime = 0;
  ghostRecord = ghostStore.load();
  syncGhost();
}

function setMode(next) {
  mode = next;
  input.setEnabled(next === 'playing');
  hud.setChrome(next);
  document.documentElement.classList.toggle('is-playing', next === 'playing' || next === 'crashed');
  if (next === 'title') menu.showTitle();
  else if (next === 'paused') menu.showPause();
  else menu.hide();
  if (next === 'playing') {
    session.resumeClock(performance.now());
    renderer.domElement.focus({ preventScroll: true });
  }
  syncGhost();
}

function playFromMenu() {
  flight.reset();
  session.reset();
  prevPosition.copy(flight.position);
  chase.ready = false;
  hud.hideResults();
  hud.hideCrash();
  audio.start();
  placeAircraft();
  beginAttempt();
  setMode('playing');
}

function openPause() {
  if (mode !== 'playing') return;
  session.pauseClock(performance.now());
  setMode('paused');
}

function resume() {
  if (mode !== 'paused') return;
  setMode('playing');
}

function quitToTitle() {
  hud.hideResults();
  hud.hideCrash();
  flight.crashed = false;
  setMode('title');
}

function flyAgain() {
  flight.reset();
  session.reset();
  prevPosition.copy(flight.position);
  chase.ready = false;
  hud.hideResults();
  hud.hideCrash();
  placeAircraft();
  beginAttempt();
  setMode('playing');
}

function onCrash(now) {
  mode = 'crashed';
  input.setEnabled(false);
  hud.setChrome('crashed');
  menu.hide();
  hud.showCrash("Hit terrain. Resetting today's route.");
  audio.thud();
  crashUntil = now + 1700;
}

function finishCrash() {
  flight.reset();
  session.reset();
  prevPosition.copy(flight.position);
  chase.ready = false;
  hud.hideCrash();
  placeAircraft();
  beginAttempt();
  setMode('playing');
}

const menu = createMenu({
  settings,
  getRoute: () => {
    const view = session.view(performance.now());
    return {
      date: route.date,
      seedHex: route.seedHex,
      gates: route.gates.length,
      bestToday: view.bestToday,
      bestAll: view.bestAll,
      ghost: ghostStore.load() ? (settings.showGhost ? 'Saved' : 'Hidden') : 'None',
    };
  },
  onPlay: playFromMenu,
  onResume: resume,
  onQuit: quitToTitle,
});

hud = createHud({
  onFlyAgain: flyAgain,
  onToggleMute: () => hud.setMuted(audio.toggle()),
  onPause: openPause,
  onMainMenu: quitToTitle,
});
hud.setMuted(settings.muted);
audio.sync();

settings.subscribe((_snapshot, key) => {
  hud.setMuted(settings.muted);
  audio.sync();
  if (key === 'muted' && !settings.muted) audio.start();
  if (key === 'quality') adaptive.reset();
  if (key === 'ghost') syncGhost();
});

function resize() {
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  chase.camera.aspect = width / height;
  chase.camera.updateProjectionMatrix();
  adaptive.resize(width, height);
}

window.addEventListener('resize', resize);
resize();
adaptive.reset();
placeAircraft();

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.key !== 'Escape' && event.code !== 'KeyP') return;
  if (mode === 'playing') {
    event.preventDefault();
    openPause();
  } else if (mode === 'paused' && event.code === 'KeyP' && menu.isOpen()) {
    event.preventDefault();
    resume();
  }
});

if (params.get('complete') === '1') {
  hud.showResults(session.debugFinish());
  updateGates(gates, session, performance.now(), {
    reducedMotion: settings.reducedMotion,
    glow: glowAmount(),
  });
  setMode('results');
} else if (params.get('play') === '1') {
  beginAttempt();
  setMode('playing');
} else {
  setMode('title');
}

const debugOn = params.get('debug') === '1' || params.get('complete') === '1';

function restorePlayState() {
  flight.reset();
  session.reset();
  prevPosition.copy(flight.position);
  chase.ready = false;
  hud.hideCrash();
  placeAircraft();
  if (mode === 'playing') hud.setChrome('playing');
}

if (debugOn) {
  const idle = { pitch: 0, roll: 0, yaw: 0, throttleUp: false, throttleDown: false };
  window.__selfTest = () => {
    const vertexError = terrain.vertexError();
    const center = terrain.meshHeightAt(80, -4200);
    flight.armGrace(0);
    flight.crashed = false;
    flight.pitch = 0;
    flight.roll = 0;
    flight.yaw = 0;
    flight.position.set(0, 1, 0);
    flight.lastSafe.set(0, 1, 0);
    flight.update(idle, 0.05);
    const water = { crashed: flight.crashed, y: flight.position.y };

    flight.armGrace(0);
    flight.crashed = false;
    flight.pitch = 0;
    flight.roll = 0;
    flight.yaw = 0;
    flight.position.set(80, center - 2, -4200);
    flight.lastSafe.set(80, center + 25, -4200);
    flight.update(idle, 0.016);
    const crash = {
      crashed: flight.crashed,
      y: flight.position.y,
      ground: center,
      embedded: flight.position.y < center - 0.5,
    };

    const anchor = new THREE.Vector3(80, center + 80, -4100);
    chase.camera.position.set(80, Math.max(4, center * 0.25), -4200);
    const look = new THREE.Vector3(80, center + 40, -4160);
    liftCameraAboveTerrain(chase.camera, anchor, look, terrain.meshHeightAt);
    const camHeight = terrain.meshHeightAt(chase.camera.position.x, chase.camera.position.z);
    const camera = {
      y: chase.camera.position.y,
      ground: camHeight,
      clear: chase.camera.position.y >= camHeight + 3,
    };

    restorePlayState();
    return {
      vertexError,
      center,
      water,
      crash,
      camera,
      ok: vertexError < 0.2
        && center > 80
        && water.crashed === false
        && water.y >= 2.9
        && crash.crashed === true
        && crash.embedded === false
        && camera.clear === true,
    };
  };

  window.__crashNow = () => {
    const ground = terrain.meshHeightAt(80, -4200);
    flight.armGrace(0);
    flight.crashed = false;
    flight.pitch = 0;
    flight.roll = 0;
    flight.yaw = 0;
    flight.position.set(80, ground - 2, -4200);
    flight.lastSafe.set(80, ground + 30, -4200);
    return { ground };
  };

  window.__scriptedPass = () => {
    let guard = 0;
    while (!session.state.finished && guard < 16) {
      const gate = route.gates[session.state.index];
      if (!gate) break;
      prevPosition.set(gate.x - gate.ax * 40, gate.y, gate.z - gate.az * 40);
      flight.position.set(gate.x + gate.ax * 25, gate.y, gate.z + gate.az * 25);
      flight.lastSafe.copy(flight.position);
      flight.crashed = false;
      const outcome = session.update(flight, performance.now(), 0.05, prevPosition);
      prevPosition.copy(flight.position);
      guard += 1;
      if (outcome.finished) {
        hud.showResults(outcome.result);
        setMode('results');
        return {
          finished: true,
          guard,
          hits: outcome.result.hits,
          total: outcome.result.total,
          score: outcome.result.score,
          dialog: !document.querySelector('#results').hidden,
        };
      }
    }
    return {
      finished: false,
      guard,
      index: session.state.index,
      hits: session.state.hits,
    };
  };

  window.__debug = () => ({
    mode,
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
      crashed: flight.crashed,
    },
    session: session.view(performance.now()),
    audio: audio.debug(),
    settings: settings.snapshot(),
    quality: adaptive.stats(),
    ghost: {
      visible: ghostJet.visible,
      show: settings.showGhost,
      time: ghostTime,
      recording: ghostRecorder.count,
      samples: ghostRecord ? ghostRecord.samples.length : 0,
      score: ghostRecord ? ghostRecord.score : null,
      x: ghostJet.position.x,
      y: ghostJet.position.y,
      z: ghostJet.position.z,
    },
  });

  window.__plantGhost = ({ score = 1, interval, samples } = {}) => {
    const wrote = ghostStore.write(score, samples, interval);
    ghostRecord = ghostStore.load();
    ghostTime = 0;
    syncGhost();
    return {
      wrote,
      score: ghostRecord ? ghostRecord.score : null,
      samples: ghostRecord ? ghostRecord.samples.length : 0,
    };
  };

  window.__commitGhost = (score = 1) => {
    ghostRecorder.sample(flightPose(), 0, true);
    const saved = ghostStore.save(score, ghostRecorder.snapshot());
    const stored = ghostStore.load();
    return {
      saved,
      recording: ghostRecorder.count,
      samples: stored ? stored.samples.length : 0,
      score: stored ? stored.score : null,
    };
  };
}

let last = performance.now();

function frame(now) {
  if (document.hidden) {
    raf = 0;
    return;
  }
  raf = requestAnimationFrame(frame);
  const elapsed = (now - last) / 1000;
  last = now;
  const dt = Math.min(Math.max(elapsed, 0), 0.05);

  const pad = menu.poll();
  if (pad.startEdge && mode === 'playing') openPause();

  if (mode === 'playing') {
    input.update();
    flight.update(input.state, dt);
    if (flight.crashed) onCrash(now);
  }

  if (mode === 'playing') {
    const outcome = session.update(flight, now, dt, prevPosition);
    if (outcome.chime) audio.chime();
    if (outcome.finished) {
      ghostRecorder.sample(flightPose(), 0, true);
      ghostStore.save(outcome.result.score, ghostRecorder.snapshot());
      hud.showResults(outcome.result);
      setMode('results');
    } else {
      prevPosition.copy(flight.position);
    }
  }

  if (mode === 'playing') {
    ghostRecorder.sample(flightPose(), dt);
    ghostTime += dt;
  }
  syncGhost();

  const simulate = mode === 'playing' || mode === 'crashed';
  if (simulate) {
    jet.position.copy(flight.position);
    jet.quaternion.copy(flight.quaternion);
    updateChaseCamera(chase, flight, dt, {
      reduced: settings.reducedMotion,
      crash: mode === 'crashed' ? 1 : 0,
      now,
    });
    liftCameraAboveTerrain(chase.camera, flight.position, chase.lookCurrent, terrain.meshHeightAt);
    if (mode === 'playing') input.syncThrottle(flight.throttle);
    hud.update(flight, session.view(now));
    audio.update(flight);
  }

  if (mode === 'crashed' && now >= crashUntil) finishCrash();

  const glow = glowAmount();
  sky.material.uniforms.glow.value = glow;
  updateSky(sky, chase.camera);
  ocean.mesh.position.x = flight.position.x;
  ocean.mesh.position.z = flight.position.z;
  ocean.material.uniforms.time.value = now * 0.001;
  sky.material.uniforms.time.value = now * 0.001;
  updateClouds(clouds, chase.camera, now * 0.001);
  updateGates(gates, session, now, { reducedMotion: settings.reducedMotion, glow });
  adaptive.placeShadow(flight.position);

  const renderStart = performance.now();
  renderer.render(scene, chase.camera);
  adaptive.note(elapsed, (performance.now() - renderStart) / 1000);
}

function startLoop() {
  if (document.hidden) return;
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = 0;
    audio.suspendForHide();
    return;
  }
  audio.resumeFromHide();
  startLoop();
});

startLoop();
