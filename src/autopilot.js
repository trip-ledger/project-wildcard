import * as THREE from 'three';

const euler = new THREE.Euler(0, 0, 0, 'YXZ');

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(delta) {
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

/**
 * A smooth path through every ring, used by the demo capture.
 * The clock is wall time so a slow frame still finishes the route
 * in about a minute. Each frame is walked in short steps so a ring
 * is crossed on the path instead of being cut off at a corner.
 */
export function createRouteFlyer({ gates, start, heightAt, duration = 52 }) {
  const points = buildPath(gates, start, heightAt);
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const d = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
      points[i].z - points[i - 1].z,
    );
    lengths.push(d);
    total += d;
  }

  let startedAt = 0;
  let lastNow = 0;
  let lastDistance = 0;
  let roll = 0;
  let prevYaw = null;

  function sample(distance) {
    let remain = clamp(distance, 0, total);
    for (let i = 0; i < lengths.length; i += 1) {
      const span = lengths[i];
      if (remain <= span || i === lengths.length - 1) {
        const t = span === 0 ? 0 : clamp(remain / span, 0, 1);
        const a = points[i];
        const b = points[i + 1];
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
        };
      }
      remain -= span;
    }
    return points[points.length - 1];
  }

  function poseAt(distance, dt) {
    const here = sample(distance);
    const ahead = sample(Math.min(total, distance + 90));
    const dx = ahead.x - here.x;
    const dy = ahead.y - here.y;
    const dz = ahead.z - here.z;
    const horiz = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = clamp(Math.atan2(dy, horiz), -0.32, 0.42);
    if (prevYaw != null) {
      const rate = wrapAngle(yaw - prevYaw) / dt;
      const target = clamp(-rate * 0.42, -0.62, 0.62);
      roll += (target - roll) * Math.min(1, dt * 4);
    }
    prevYaw = yaw;
    return { ...here, yaw, pitch, roll };
  }

  return {
    duration,
    /**
     * Positions to test for ring crossings this frame, then the pose to draw.
     * Steps stay short so a sharp turn still passes through the ring.
     */
    advance(now) {
      if (!startedAt) startedAt = now;
      const dt = lastNow ? clamp((now - lastNow) / 1000, 0.001, 0.5) : 0.016;
      lastNow = now;
      const u = clamp((now - startedAt) / (duration * 1000), 0, 1);
      const target = u * total;
      const poses = [];
      let cursor = lastDistance;
      const step = 8;
      if (target > cursor + 0.05) {
        while (cursor + step < target) {
          cursor += step;
          poses.push(sample(cursor));
        }
        poses.push(sample(target));
      } else {
        poses.push(sample(cursor));
      }
      lastDistance = target;
      const pose = poseAt(target, dt);
      const speed = total / duration;
      return { poses, pose, speed, done: u >= 1 };
    },
  };
}

export function applyFlyerPose(flight, pose, speed) {
  flight.position.set(pose.x, pose.y, pose.z);
  flight.yaw = pose.yaw;
  flight.pitch = pose.pitch;
  flight.roll = pose.roll;
  euler.set(pose.pitch, pose.yaw, -pose.roll);
  flight.quaternion.setFromEuler(euler);
  flight.forward.set(0, 0, -1).applyQuaternion(flight.quaternion);
  flight.up.set(0, 1, 0).applyQuaternion(flight.quaternion);
  flight.airspeed = speed;
  flight.throttle = 0.74;
  flight.velocity.copy(flight.forward).multiplyScalar(speed);
  flight.lastSafe.copy(flight.position);
  flight.crashed = false;
}

function buildPath(gates, start, heightAt) {
  const raw = [{ ...start }];
  for (let i = 0; i < gates.length; i += 1) {
    const gate = gates[i];
    raw.push({
      x: gate.x - gate.ax * 60,
      y: gate.y - gate.ay * 16,
      z: gate.z - gate.az * 60,
    });
    raw.push({ x: gate.x, y: gate.y, z: gate.z });
    raw.push({
      x: gate.x + gate.ax * 70,
      y: gate.y + gate.ay * 16,
      z: gate.z + gate.az * 70,
    });
  }

  const points = [{ ...raw[0] }];
  for (let i = 1; i < raw.length; i += 1) {
    const a = raw[i - 1];
    const b = raw[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
    const steps = Math.max(1, Math.ceil(dist / 36));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      let y = a.y + (b.y - a.y) * t;
      const along = dist * t;
      const fromEnd = dist - along;
      const nearGate = rawPointIsGate(b, gates) || rawPointIsGate(a, gates);
      if (!nearGate && along > 120 && fromEnd > 160) {
        y = Math.max(y, heightAt(x, z) + 90);
      }
      points.push({ x, y, z });
    }
  }
  return points;
}

function rawPointIsGate(point, gates) {
  for (let i = 0; i < gates.length; i += 1) {
    const gate = gates[i];
    if (Math.abs(point.x - gate.x) < 0.01 && Math.abs(point.z - gate.z) < 0.01) return true;
  }
  return false;
}
