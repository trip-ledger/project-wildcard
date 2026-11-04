// Engine, wind, and the gate chime are synthesized here. Nothing is fetched.

export function createAudio(onChange) {
  let ctx = null;
  let master = null;
  let engine = null;
  let wind = null;
  let muted = false;
  let started = false;

  function applyGain() {
    if (!master || !ctx) return;
    const level = muted ? 0 : 0.42;
    master.gain.setTargetAtTime(level, ctx.currentTime, 0.03);
  }

  function ensure() {
    if (ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.42;
      master.connect(ctx.destination);

      const fundamental = ctx.createOscillator();
      fundamental.type = 'sine';
      fundamental.frequency.value = 62;
      const overtone = ctx.createOscillator();
      overtone.type = 'triangle';
      overtone.frequency.value = 93;
      const overtoneGain = ctx.createGain();
      overtoneGain.gain.value = 0.35;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      filter.Q.value = 0.65;
      const engineGain = ctx.createGain();
      engineGain.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 4.2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.008;
      fundamental.connect(filter);
      overtone.connect(overtoneGain);
      overtoneGain.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      lfo.connect(lfoGain);
      lfoGain.connect(engineGain.gain);
      fundamental.start();
      overtone.start();
      lfo.start();

      const length = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 640;
      windFilter.Q.value = 0.55;
      const windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      noise.start();

      engine = { fundamental, overtone, filter, gain: engineGain };
      wind = { filter: windFilter, gain: windGain };
    } catch {
      ctx = null;
      master = null;
      engine = null;
      wind = null;
    }
  }

  function start() {
    if (started) {
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    ensure();
    if (!ctx) return;
    started = true;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    applyGain();
  }

  function toggle() {
    muted = !muted;
    if (!muted) start();
    applyGain();
    if (onChange) onChange(muted);
    return muted;
  }

  window.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (target && target.closest && target.closest('#mute')) return;
    if (!muted) start();
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') {
      if (event.repeat) return;
      event.preventDefault();
      toggle();
      return;
    }
    if (!muted) start();
  });

  return {
    toggle,
    get muted() {
      return muted;
    },
    update(flight) {
      if (!started || !ctx || !engine || muted) return;
      const throttle = Math.min(1, Math.max(0, flight.throttle));
      const now = ctx.currentTime;
      engine.fundamental.frequency.setTargetAtTime(52 + throttle * 78, now, 0.08);
      engine.overtone.frequency.setTargetAtTime(78 + throttle * 140, now, 0.08);
      engine.filter.frequency.setTargetAtTime(140 + throttle * 460, now, 0.1);
      engine.gain.gain.setTargetAtTime(0.03 + throttle * 0.09, now, 0.08);
      const speed = Math.min(flight.airspeed / 150, 1.5);
      wind.gain.gain.setTargetAtTime(0.012 + speed * 0.07, now, 0.12);
      wind.filter.frequency.setTargetAtTime(380 + speed * 980, now, 0.12);
    },
    chime() {
      if (!started || !ctx || muted || !master) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, now);
      osc.frequency.exponentialRampToValueAtTime(1240, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.46);
    },
    debug() {
      return {
        started,
        muted,
        state: ctx ? ctx.state : 'none',
      };
    },
  };
}
