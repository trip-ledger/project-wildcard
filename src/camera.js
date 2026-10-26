import * as THREE from 'three';

const LOCAL_OFFSET = new THREE.Vector3(0, 5.4, 22);

export function createChaseCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(58, aspect, 0.5, 14000);
  return {
    camera,
    quat: new THREE.Quaternion(),
    desired: new THREE.Vector3(),
    look: new THREE.Vector3(),
    lookCurrent: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    ready: false,
    shake: 0,
  };
}

export function updateChaseCamera(state, flight, dt, motion = {}) {
  const orientBlend = state.ready ? 1 - Math.exp(-3.1 * dt) : 1;
  state.quat.slerp(flight.quaternion, orientBlend);

  state.offset.copy(LOCAL_OFFSET).applyQuaternion(state.quat);
  state.desired.copy(flight.position).add(state.offset);

  const follow = state.ready ? 1 - Math.exp(-4.2 * dt) : 1;
  state.camera.position.lerp(state.desired, follow);

  state.look.copy(flight.position).addScaledVector(flight.forward, 10);
  if (!state.ready) state.lookCurrent.copy(state.look);
  else state.lookCurrent.lerp(state.look, 1 - Math.exp(-7 * dt));

  const reduced = motion.reduced === true;
  if (reduced) {
    state.shake = 0;
  } else {
    state.shake = Math.max(state.shake || 0, motion.crash || 0);
    const speed = Math.min(Math.max(flight.airspeed, 0) / 140, 1);
    const low = Math.max(0, 1 - flight.position.y / 180);
    const buzz = speed * low * 0.03;
    state.shake = Math.max(0, state.shake - dt * 0.85);
    const amp = state.shake * 0.5 + buzz;
    if (amp > 0.001) {
      const t = (motion.now || 0) * 0.001;
      state.camera.position.x += Math.sin(t * 17.2) * amp;
      state.camera.position.y += Math.sin(t * 23.1 + 1.3) * amp * 0.45;
      state.camera.position.z += Math.cos(t * 19.4) * amp * 0.35;
    }
  }

  state.camera.up.set(0, 1, 0).applyQuaternion(state.quat);
  state.camera.lookAt(state.lookCurrent);
  state.ready = true;
}

/**
 * Keep the camera, and the segment back to the aircraft, above the mesh.
 * Lifting the camera by L raises a point at fraction t along that segment by t*L.
 */
export function liftCameraAboveTerrain(camera, anchor, lookTarget, heightAt) {
  const margin = 3.6;
  for (let pass = 0; pass < 2; pass += 1) {
    let lift = 0;
    const samples = 6;
    for (let i = 1; i <= samples; i += 1) {
      const t = i / samples;
      const x = anchor.x + (camera.position.x - anchor.x) * t;
      const y = anchor.y + (camera.position.y - anchor.y) * t;
      const z = anchor.z + (camera.position.z - anchor.z) * t;
      const ground = Math.max(2.2, heightAt(x, z) + margin);
      const need = ground - y;
      if (need > 0) lift = Math.max(lift, need / t);
    }
    const around = [[2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6]];
    for (let i = 0; i < around.length; i += 1) {
      const ground = Math.max(2.2, heightAt(camera.position.x + around[i][0], camera.position.z + around[i][1]) + margin);
      const need = ground - (camera.position.y + lift);
      if (need > 0) lift += need;
    }
    if (lift <= 0.01) break;
    if (lift > 48 && pass === 0) {
      camera.position.x = anchor.x + (camera.position.x - anchor.x) * 0.45;
      camera.position.z = anchor.z + (camera.position.z - anchor.z) * 0.45;
      camera.position.y += Math.min(lift, 24);
      continue;
    }
    camera.position.y += lift;
    break;
  }
  camera.lookAt(lookTarget);
}
