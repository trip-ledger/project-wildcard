import * as THREE from 'three';

const LOCAL_OFFSET = new THREE.Vector3(0, 5.4, 22);

export function createChaseCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(58, aspect, 0.35, 14000);
  return {
    camera,
    quat: new THREE.Quaternion(),
    desired: new THREE.Vector3(),
    look: new THREE.Vector3(),
    lookCurrent: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    ready: false,
  };
}

export function updateChaseCamera(state, flight, dt) {
  const orientBlend = state.ready ? 1 - Math.exp(-3.1 * dt) : 1;
  state.quat.slerp(flight.quaternion, orientBlend);

  state.offset.copy(LOCAL_OFFSET).applyQuaternion(state.quat);
  state.desired.copy(flight.position).add(state.offset);

  const follow = state.ready ? 1 - Math.exp(-4.2 * dt) : 1;
  state.camera.position.lerp(state.desired, follow);

  state.look.copy(flight.position).addScaledVector(flight.forward, 10);
  if (!state.ready) state.lookCurrent.copy(state.look);
  else state.lookCurrent.lerp(state.look, 1 - Math.exp(-7 * dt));

  state.camera.up.set(0, 1, 0).applyQuaternion(state.quat);
  state.camera.lookAt(state.lookCurrent);
  state.ready = true;
}
