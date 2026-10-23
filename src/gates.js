import * as THREE from 'three';

const COURSE = 0xffe0b0;
const FINISH = 0xd7ffe8;
const HIT = 0x9ddec0;
const MISS = 0x8d7568;
const AHEAD = 0xc9b292;

function ringMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

export function createGates(route) {
  const group = new THREE.Group();
  group.name = 'gates';
  const axisZ = new THREE.Vector3(0, 0, 1);
  const axis = new THREE.Vector3();
  const items = [];

  for (let i = 0; i < route.gates.length; i += 1) {
    const gate = route.gates[i];
    const color = gate.finish ? FINISH : COURSE;
    const gateGroup = new THREE.Group();
    gateGroup.position.set(gate.x, gate.y, gate.z);
    axis.set(gate.ax, gate.ay, gate.az);
    if (axis.lengthSq() < 1e-8) axis.set(0, 0, -1);
    else axis.normalize();
    gateGroup.quaternion.setFromUnitVectors(axisZ, axis);

    const tube = gate.finish ? 3.8 : 3.3;
    const core = new THREE.Mesh(
      new THREE.TorusGeometry(gate.radius, tube, 8, 32),
      ringMaterial(color, i === 0 ? 0.96 : 0.72),
    );
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(gate.radius, gate.finish ? 11 : 9, 8, 32),
      ringMaterial(color, i === 0 ? 0.34 : 0.16),
    );
    gateGroup.add(core);
    gateGroup.add(halo);
    group.add(gateGroup);
    items.push({
      group: gateGroup,
      core,
      halo,
      base: color,
      mode: i === 0 ? 'active' : 'pending',
    });
  }

  return { group, items };
}

function applyMode(item, mode) {
  if (item.mode === mode) return;
  item.mode = mode;
  const color = mode === 'hit' ? HIT : mode === 'miss' ? MISS : mode === 'active' ? item.base : AHEAD;
  item.core.material.color.setHex(color);
  item.halo.material.color.setHex(color);
  item.core.material.opacity = mode === 'active' ? 0.96 : mode === 'pending' ? 0.62 : 0.4;
  item.halo.material.opacity = mode === 'active' ? 0.34 : mode === 'pending' ? 0.14 : 0.08;
  if (mode !== 'active') item.group.scale.setScalar(1);
}

export function updateGates(gates, session, now) {
  const { index, statuses, finished } = session.state;
  const pulse = 1 + Math.sin(now * 0.0032) * 0.04;
  const haloPulse = 0.28 + Math.sin(now * 0.0032) * 0.08;

  for (let i = 0; i < gates.items.length; i += 1) {
    const item = gates.items[i];
    let mode = statuses[i];
    if (!finished && i === index && mode === 'pending') mode = 'active';
    applyMode(item, mode);
    if (mode === 'active') {
      item.group.scale.setScalar(pulse);
      item.halo.material.opacity = haloPulse;
    }
  }
}
