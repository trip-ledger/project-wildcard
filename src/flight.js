import * as THREE from 'three';

const G = 9.81;
const V_REF = 115;
const THRUST_MAX = 17;
const DRAG_K = (THRUST_MAX * 0.62) / (V_REF * V_REF);
const PITCH_RATE = 0.7;
const ROLL_RATE = 1.4;
const YAW_RATE = 0.55;
const THROTTLE_RATE = 0.42;
const MAX_PITCH = 1.05;
const MIN_PITCH = -0.85;
const MAX_ROLL = 1.2;
const STALL = 46;
const FLOOR_Y = 3;
const CEILING_Y = 6000;
const LAND = 1;
const PROBES = [
  [0, -0.95, 0.2],
  [0, -0.4, -6.1],
  [0, 0.15, 5.6],
  [7.3, -0.35, 0.3],
  [-7.3, -0.35, 0.3],
];

const IDLE_INPUT = {
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttleUp: false,
  throttleDown: false,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function headingDegrees(yaw) {
  const degrees = -THREE.MathUtils.radToDeg(yaw);
  return (degrees % 360 + 360) % 360;
}

/**
 * Arcade jet: orientation integrates from the keys, bank adds yaw,
 * and speed comes from thrust, quadratic drag, and the along-track
 * part of gravity. Lift cancels weight near cruise and falls off
 * when the wings are slow or steeply banked.
 */
export class FlightModel {
  constructor(groundHeight = null) {
    this.groundHeight = typeof groundHeight === 'function' ? groundHeight : null;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._g = new THREE.Vector3(0, -G, 0);
    this._gPerp = new THREE.Vector3();
    this._liftDir = new THREE.Vector3();
    this._perpVel = new THREE.Vector3();
    this._probe = new THREE.Vector3();
    this.lastSafe = new THREE.Vector3();
    this.crashed = false;
    this._grace = 0;
    this.reset();
  }

  reset() {
    this.position.set(0, 320, 0);
    this.velocity.set(0, 0, -V_REF);
    this.forward.set(0, 0, -1);
    this.up.set(0, 1, 0);
    this.quaternion.identity();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.throttle = 0.62;
    this.airspeed = V_REF;
    this._booted = false;
    this._perpVel.set(0, 0, 0);
    this.crashed = false;
    this._grace = 0.35;
    this.lastSafe.copy(this.position);
  }

  armGrace(seconds) {
    this._grace = seconds;
  }

  get heading() {
    return headingDegrees(this.yaw);
  }

  update(input = IDLE_INPUT, dt = 0) {
    dt = clamp(dt, 0, 0.05);
    if (dt === 0 || this.crashed) return;

    this.pitch = clamp(this.pitch + input.pitch * PITCH_RATE * dt, MIN_PITCH, MAX_PITCH);
    this.roll = clamp(this.roll + input.roll * ROLL_RATE * dt, -MAX_ROLL, MAX_ROLL);
    this.yaw += input.yaw * YAW_RATE * dt;

    const bank = clamp(this.roll, -1.02, 1.02);
    const turnSpeed = Math.max(this.airspeed, 28);
    this.yaw -= Math.tan(bank) * G / turnSpeed * dt;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));

    if (typeof input.throttleHold === 'number' && Number.isFinite(input.throttleHold)) {
      this.throttle = clamp(input.throttleHold, 0, 1);
    } else {
      if (input.throttleUp) this.throttle = Math.min(1, this.throttle + THROTTLE_RATE * dt);
      if (input.throttleDown) this.throttle = Math.max(0, this.throttle - THROTTLE_RATE * dt);
    }

    this._euler.set(this.pitch, this.yaw, -this.roll);
    this.quaternion.setFromEuler(this._euler);
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion);

    const thrust = THRUST_MAX * this.throttle;
    const drag = DRAG_K * this.airspeed * this.airspeed;
    const gravityAlong = this._g.dot(this.forward);
    this.airspeed = clamp(this.airspeed + (thrust - drag + gravityAlong) * dt, 0, 240);

    const gDotF = this._g.dot(this.forward);
    this._gPerp.copy(this._g).addScaledVector(this.forward, -gDotF);

    this._liftDir.copy(this.up).addScaledVector(this.forward, -this.up.dot(this.forward));
    const liftLen = this._liftDir.length();
    if (liftLen > 1e-4) this._liftDir.multiplyScalar(1 / liftLen);
    else this._liftDir.set(0, 1, 0);

    let liftScale = (this.airspeed / V_REF) ** 2;
    if (this.airspeed < STALL) {
      liftScale *= this.airspeed / STALL;
      this.pitch -= (1 - this.airspeed / STALL) * 0.3 * dt;
    }
    liftScale = Math.min(liftScale, 1.35);

    const gPerpMag = this._gPerp.length();
    const liftMag = gPerpMag * liftScale;

    if (!this._booted) {
      this._perpVel.set(0, 0, 0);
      this._booted = true;
    } else {
      const along = this.velocity.dot(this.forward);
      this._perpVel.copy(this.velocity).addScaledVector(this.forward, -along);
      this._perpVel.addScaledVector(this._liftDir, liftMag * dt);
      this._perpVel.addScaledVector(this._gPerp, dt);
      this._perpVel.multiplyScalar(Math.exp(-1.2 * dt));
    }

    this.velocity.copy(this.forward).multiplyScalar(this.airspeed).add(this._perpVel);
    this.position.addScaledVector(this.velocity, dt);

    this.applyWater(dt);
    this.applyCeiling();

    if (this._grace > 0) {
      this._grace = Math.max(0, this._grace - dt);
    } else if (this.terrainContact()) {
      this.position.copy(this.lastSafe);
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (this._perpVel.y < 0) this._perpVel.y = 0;
      this.crashed = true;
      return;
    }
    this.lastSafe.copy(this.position);
  }

  groundAt(x, z) {
    if (!this.groundHeight) return 0;
    const height = this.groundHeight(x, z);
    return Number.isFinite(height) ? height : 0;
  }

  applyWater(dt) {
    if (this.groundAt(this.position.x, this.position.z) > LAND) return;
    if (this.position.y >= FLOOR_Y) return;
    this.position.y = FLOOR_Y;
    if (this.velocity.y < 0) this.velocity.y = 0;
    if (this._perpVel.y < 0) this._perpVel.y = 0;
    this.airspeed = Math.max(0, this.airspeed - 6 * dt);
    if (this.pitch < 0) this.pitch = Math.min(0, this.pitch + 0.35 * dt);
  }

  applyCeiling() {
    if (this.position.y <= CEILING_Y) return;
    this.position.y = CEILING_Y;
    if (this.velocity.y > 0) this.velocity.y = 0;
  }

  pointHits(x, y, z, pad) {
    const height = this.groundAt(x, z);
    return height > LAND && y < height + pad;
  }

  /**
   * Solid ground stops the aircraft. Callers reset the route.
   * Samples are the fuselage, nose, tail, and wingtips, plus the
   * segment since the last clear position so a fast frame cannot
   * tunnel through a ridge. Heights come from the drawn mesh.
   */
  terrainContact() {
    if (!this.groundHeight) return false;
    for (let i = 0; i < PROBES.length; i += 1) {
      const probe = PROBES[i];
      this._probe.set(probe[0], probe[1], probe[2])
        .applyQuaternion(this.quaternion)
        .add(this.position);
      if (this.pointHits(this._probe.x, this._probe.y, this._probe.z, 0.3)) return true;
    }
    const dx = this.position.x - this.lastSafe.x;
    const dy = this.position.y - this.lastSafe.y;
    const dz = this.position.z - this.lastSafe.z;
    const steps = Math.ceil(Math.hypot(dx, dy, dz) / 5);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (this.pointHits(this.lastSafe.x + dx * t, this.lastSafe.y + dy * t, this.lastSafe.z + dz * t, 1.05)) {
        return true;
      }
    }
    return false;
  }
}
