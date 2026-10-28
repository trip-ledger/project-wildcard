import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ROUTES,
  MAX_STORED,
  createGhostRecorder,
  createGhostStore,
  decodeGhost,
  encodeGhost,
  ghostPoseAt,
  ghostStorageKey,
  lerpAngle,
} from '../src/ghost.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function pose(x, extra = {}) {
  return {
    x,
    y: 320,
    z: -x,
    pitch: 0.2,
    yaw: 0.4,
    roll: -0.1,
    ...extra,
  };
}

function track(count, interval = 0.125) {
  const samples = [];
  for (let i = 0; i < count; i += 1) samples.push(pose(i));
  return { samples, interval };
}

test('storage key is the route seed', () => {
  assert.equal(ghostStorageKey('deadbeef'), 'untitled-ghost:deadbeef');
  assert.equal(ghostStorageKey('DEADBEEF'), 'untitled-ghost:deadbeef');
  assert.equal(ghostStorageKey('nope'), null);
  assert.equal(ghostStorageKey('zzzzzzzz'), null);
});

test('round-trips a short recording', () => {
  const samples = [
    pose(0, { yaw: 3.1, pitch: -0.4, roll: 1.1 }),
    pose(40, { y: 480, z: -220, yaw: -3.1, pitch: 0.5, roll: -0.8 }),
  ];
  const encoded = encodeGhost({ score: 8450, interval: 0.125, samples });
  assert.ok(encoded.length < 20000);
  const decoded = decodeGhost(encoded);
  assert.equal(decoded.score, 8450);
  assert.ok(Math.abs(decoded.interval - 0.125) < 0.0002);
  assert.equal(decoded.samples.length, 2);
  assert.ok(Math.abs(decoded.samples[1].x - 40) <= 0.5);
  assert.ok(Math.abs(decoded.samples[1].y - 480) <= 0.5);
  assert.ok(Math.abs(decoded.samples[1].z - -220) <= 0.5);
  assert.ok(Math.abs(decoded.samples[0].yaw - 3.1) < 0.001);
  assert.ok(Math.abs(decoded.samples[1].yaw - -3.1) < 0.001);
});

test('yaw takes the short way around the circle', () => {
  const mid = lerpAngle(3.1, -3.1, 0.5);
  assert.ok(Math.abs(mid) > 2.5);
  const record = decodeGhost(encodeGhost({
    score: 10,
    interval: 1,
    samples: [pose(0, { yaw: 3.1 }), pose(1, { yaw: -3.1 })],
  }));
  const poseAt = ghostPoseAt(record, 0.5);
  assert.ok(Math.abs(poseAt.yaw) > 2.5);
});

test('playback holds the last sample', () => {
  const record = {
    score: 1,
    interval: 1,
    samples: [pose(0), pose(10)],
  };
  const at = ghostPoseAt(record, 8);
  assert.equal(at.x, 10);
  const start = ghostPoseAt(record, 0);
  assert.equal(start.x, 0);
});

test('a long run is thinned but keeps both ends', () => {
  const { samples, interval } = track(2000);
  const decoded = decodeGhost(encodeGhost({ score: 100, interval, samples }));
  assert.equal(decoded.samples.length, MAX_STORED);
  assert.equal(decoded.samples[0].x, 0);
  assert.equal(decoded.samples[MAX_STORED - 1].x, 1999);
  assert.ok(decoded.interval > interval);
});

test('best score wins and a worse run is kept out', () => {
  const storage = memoryStorage();
  const store = createGhostStore({ seed: 'abcde012', storage, now: () => 1 });
  assert.equal(store.save(100, [pose(1), pose(2)]), true);
  assert.equal(store.save(100, [pose(9), pose(8)]), false);
  assert.equal(store.save(40, [pose(9), pose(8)]), false);
  assert.equal(store.load().score, 100);
  assert.equal(store.load().samples[0].x, 1);
  assert.equal(store.save(140, [pose(7), pose(6)]), true);
  assert.equal(store.load().score, 140);
  assert.equal(store.load().samples[0].x, 7);
});

test('only two route seeds stay in storage', () => {
  const storage = memoryStorage();
  const seeds = ['aaaaaaa1', 'bbbbbbb2', 'ccccccc3'];
  seeds.forEach((seed, index) => {
    const store = createGhostStore({ seed, storage, now: () => index + 1 });
    assert.equal(store.write(10, [pose(index), pose(index + 1)]), true);
  });
  assert.equal(createGhostStore({ seed: seeds[0], storage }).load(), null);
  assert.ok(createGhostStore({ seed: seeds[1], storage }).load());
  assert.ok(createGhostStore({ seed: seeds[2], storage }).load());
  assert.equal(MAX_ROUTES, 2);
});

test('corrupt payloads and a blocked store do not throw', () => {
  const storage = memoryStorage();
  const store = createGhostStore({ seed: '01234567', storage });
  storage.setItem(store.key, '@@@');
  assert.equal(store.load(), null);
  storage.setItem(store.key, btoa('hello'));
  assert.equal(store.load(), null);
  assert.equal(store.save(1, [pose(1)]), false);

  const blocked = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error('quota');
    },
    removeItem() {},
  };
  const full = createGhostStore({ seed: '89abcdef', storage: blocked });
  assert.equal(full.save(20, [pose(1), pose(2)]), false);
  assert.equal(createGhostStore({ seed: 'bad', storage }).save(1, [pose(1), pose(2)]), false);
});

test('recorder samples at a modest rate and can stamp the finish', () => {
  const recorder = createGhostRecorder();
  assert.equal(recorder.sample(pose(1), 0.016), true);
  assert.equal(recorder.sample(pose(2), 0.016), false);
  assert.equal(recorder.sample(pose(3), 0, true), true);
  assert.equal(recorder.count, 1);
  assert.equal(recorder.snapshot()[0].x, 3);
  assert.equal(recorder.sample(pose(4), 0.05), false);
  assert.equal(recorder.sample(pose(4), 0.05), false);
  assert.equal(recorder.sample(pose(5), 0.05), true);
  assert.equal(recorder.count, 2);
  assert.equal(recorder.snapshot()[1].x, 5);
  recorder.reset();
  assert.equal(recorder.count, 0);
});
