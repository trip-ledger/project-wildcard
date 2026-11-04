const STORAGE_KEY = 'untitled-settings';

const QUALITIES = new Set(['low', 'medium', 'high']);
const MOTION = new Set(['system', 'on', 'off']);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function systemReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

export function createSettings({ defaultQuality = 'high' } = {}) {
  const saved = loadRaw();
  const listeners = new Set();
  const state = {
    muted: saved.muted === true,
    volume: Number.isFinite(Number(saved.volume)) ? clamp(Number(saved.volume), 0, 1) : 0.7,
    quality: QUALITIES.has(saved.quality) ? saved.quality : defaultQuality,
    qualitySaved: QUALITIES.has(saved.quality),
    invertPitch: saved.invertPitch === true,
    reducedMotion: MOTION.has(saved.reducedMotion) ? saved.reducedMotion : 'system',
    showGhost: saved.showGhost !== false,
  };

  function persist() {
    const payload = {
      muted: state.muted,
      volume: state.volume,
      invertPitch: state.invertPitch,
      reducedMotion: state.reducedMotion,
      showGhost: state.showGhost,
    };
    if (state.qualitySaved) payload.quality = state.quality;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage can be blocked. The current visit still keeps the choice.
    }
  }

  function emit(key) {
    const snapshot = api.snapshot();
    for (const listener of listeners) listener(snapshot, key);
  }

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (media.addEventListener) {
    media.addEventListener('change', () => {
      if (state.reducedMotion === 'system') emit('motion');
    });
  }

  const api = {
    get muted() {
      return state.muted;
    },
    get volume() {
      return state.volume;
    },
    get quality() {
      return state.quality;
    },
    get invertPitch() {
      return state.invertPitch;
    },
    /** 'system' | 'on' | 'off' */
    get reducedMotionChoice() {
      return state.reducedMotion;
    },
    /** Effective flag after the system preference is applied. */
    get reducedMotion() {
      if (state.reducedMotion === 'on') return true;
      if (state.reducedMotion === 'off') return false;
      return systemReducedMotion();
    },
    get showGhost() {
      return state.showGhost;
    },
    setMuted(muted) {
      const next = Boolean(muted);
      if (next === state.muted) return;
      state.muted = next;
      persist();
      emit('muted');
    },
    setVolume(volume) {
      const next = clamp(Number(volume) || 0, 0, 1);
      if (Math.abs(next - state.volume) < 0.0001) return;
      state.volume = next;
      persist();
      emit('volume');
    },
    setQuality(quality) {
      if (!QUALITIES.has(quality) || quality === state.quality) return;
      state.quality = quality;
      state.qualitySaved = true;
      persist();
      emit('quality');
    },
    setInvertPitch(invertPitch) {
      const next = Boolean(invertPitch);
      if (next === state.invertPitch) return;
      state.invertPitch = next;
      persist();
      emit('invert');
    },
    setReducedMotionChoice(choice) {
      if (!MOTION.has(choice) || choice === state.reducedMotion) return;
      state.reducedMotion = choice;
      persist();
      emit('motion');
    },
    setShowGhost(showGhost) {
      const next = Boolean(showGhost);
      if (next === state.showGhost) return;
      state.showGhost = next;
      persist();
      emit('ghost');
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return {
        muted: state.muted,
        volume: state.volume,
        quality: state.quality,
        invertPitch: state.invertPitch,
        reducedMotionChoice: state.reducedMotion,
        reducedMotion: api.reducedMotion,
        showGhost: state.showGhost,
      };
    },
  };

  return api;
}
