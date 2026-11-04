import { missedGate, passedGate } from './route.js';

const HIT_POINTS = 1200;
const MISS_PENALTY = 500;
const POINT_PER_SECOND = 20;
const SMOOTH_BONUS = 300;
const STORAGE_KEY = 'untitled-route-bests';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatTime(seconds) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const whole = Math.floor(rem);
  const tenth = Math.floor((rem - whole) * 10);
  return `${mins}:${String(whole).padStart(2, '0')}.${tenth}`;
}

export function formatBest(value) {
  return value == null || !Number.isFinite(value) ? '—' : String(Math.round(value));
}

function emptyBests() {
  return { allTime: null, days: {} };
}

export function loadBests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyBests();
    const data = JSON.parse(raw);
    const days = {};
    const source = data && typeof data.days === 'object' && data.days ? data.days : {};
    for (const key of Object.keys(source)) {
      const value = Number(source[key]);
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(value)) days[key] = value;
    }
    const allTime = data && Number.isFinite(Number(data.allTime)) ? Number(data.allTime) : null;
    return { allTime, days };
  } catch {
    return emptyBests();
  }
}

export function recordScore(date, score) {
  const bests = loadBests();
  const days = { ...bests.days };
  const previous = Object.prototype.hasOwnProperty.call(days, date) ? Number(days[date]) : null;
  const today = previous == null || score > previous ? score : previous;
  days[date] = today;
  let allTime = bests.allTime;
  if (allTime == null || today > allTime) allTime = today;
  const next = { allTime, days };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked. This run still reports its own score.
  }
  return next;
}

function freshState(route) {
  return {
    index: 0,
    hits: 0,
    misses: 0,
    statuses: route.gates.map(() => 'pending'),
    started: false,
    finished: false,
    startMs: 0,
    elapsed: 0,
    score: 0,
    smooth: 0,
    jerkSum: 0,
    jerkSamples: 0,
    lastPitch: 0,
    lastRoll: 0,
    lastPitchRate: 0,
    lastRollRate: 0,
    smoothReady: false,
    pausedMs: 0,
    pauseStarted: 0,
  };
}

export function createSession(route) {
  let state = freshState(route);
  let bests = loadBests();

  function elapsedAt(now) {
    if (!state.started) return 0;
    let paused = state.pausedMs;
    if (state.pauseStarted) paused += Math.max(0, now - state.pauseStarted);
    return Math.max(0, (now - state.startMs - paused) / 1000);
  }

  function smooth01() {
    if (state.jerkSamples === 0) return 1;
    const mean = state.jerkSum / state.jerkSamples;
    return clamp(1 - mean / 5, 0, 1);
  }

  function scoreRun() {
    const timePenalty = Math.floor(state.elapsed * POINT_PER_SECOND);
    const missPenalty = state.misses * MISS_PENALTY;
    return Math.max(0, state.hits * HIT_POINTS - missPenalty - timePenalty + state.smooth);
  }

  function summary() {
    const today = bests.days[route.date];
    return {
      date: route.date,
      seed: route.seed,
      seedHex: route.seedHex,
      hits: state.hits,
      misses: state.misses,
      total: route.gates.length,
      elapsed: state.elapsed,
      smooth: state.smooth,
      score: state.score,
      bestToday: Number.isFinite(today) ? today : null,
      bestAll: bests.allTime,
    };
  }

  function finish() {
    state.finished = true;
    state.smooth = Math.round(smooth01() * SMOOTH_BONUS);
    state.score = scoreRun();
    bests = recordScore(route.date, state.score);
  }

  function resolve(kind, now) {
    if (!state.started) {
      state.started = true;
      state.startMs = now;
      state.elapsed = 0;
      state.smoothReady = false;
    }
    if (kind === 'hit') state.hits += 1;
    else state.misses += 1;
    state.statuses[state.index] = kind;
    state.index += 1;
    if (state.index >= route.gates.length) finish();
  }

  function sampleSmooth(flight, dt) {
    if (!state.smoothReady || dt < 0.001) {
      state.lastPitch = flight.pitch;
      state.lastRoll = flight.roll;
      state.lastPitchRate = 0;
      state.lastRollRate = 0;
      state.smoothReady = true;
      return;
    }
    const pitchRate = (flight.pitch - state.lastPitch) / dt;
    const rollRate = (flight.roll - state.lastRoll) / dt;
    const pitchJerk = Math.min(8, Math.abs((pitchRate - state.lastPitchRate) / dt));
    const rollJerk = Math.min(8, Math.abs((rollRate - state.lastRollRate) / dt));
    state.jerkSum += pitchJerk + rollJerk;
    state.jerkSamples += 1;
    state.lastPitch = flight.pitch;
    state.lastRoll = flight.roll;
    state.lastPitchRate = pitchRate;
    state.lastRollRate = rollRate;
  }

  return {
    get state() {
      return state;
    },
    get bests() {
      return bests;
    },
    summary,
    update(flight, now, dt, prev) {
      const outcome = { chime: false, finished: false, result: null };
      if (state.finished) return outcome;

      if (state.started) {
        state.elapsed = elapsedAt(now);
        sampleSmooth(flight, dt);
      }

      const gate = route.gates[state.index];
      if (!gate) return outcome;

      if (passedGate(prev, flight.position, gate)) {
        resolve('hit', now);
        outcome.chime = true;
      } else if (missedGate(flight.position, gate)) {
        resolve('miss', now);
      }

      if (state.finished) {
        outcome.finished = true;
        outcome.result = summary();
      }
      return outcome;
    },
    debugFinish() {
      const total = route.gates.length;
      state.statuses = route.gates.map(() => 'hit');
      state.hits = total;
      state.misses = 0;
      state.index = total;
      state.started = true;
      state.finished = true;
      state.elapsed = 48;
      state.smooth = SMOOTH_BONUS;
      state.score = Math.max(0, total * HIT_POINTS - Math.floor(48 * POINT_PER_SECOND) + SMOOTH_BONUS);
      bests = recordScore(route.date, state.score);
      return summary();
    },
    reset() {
      state = freshState(route);
    },
    pauseClock(now) {
      if (!state.started || state.finished || state.pauseStarted) return;
      state.pauseStarted = now;
    },
    resumeClock(now) {
      if (!state.pauseStarted) return;
      state.pausedMs += Math.max(0, now - state.pauseStarted);
      state.pauseStarted = 0;
    },
    view(now) {
      const elapsed = state.finished ? state.elapsed : elapsedAt(now);
      const today = bests.days[route.date];
      return {
        date: route.date,
        seedHex: route.seedHex,
        index: state.index,
        hits: state.hits,
        total: route.gates.length,
        started: state.started,
        finished: state.finished,
        elapsed,
        gate: state.finished ? null : route.gates[state.index] || null,
        bestToday: Number.isFinite(today) ? today : null,
        bestAll: bests.allTime,
        statuses: state.statuses,
      };
    },
  };
}
