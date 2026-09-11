/* ============================================================
   АУДИО (раздел 13 паспорта, v0.5-preview)
   Zero-dependency WebAudio: процедурный эмбиент по регионам,
   погода влияет на звук, SFX для UI/боя/ачивок.
   Контекст создаётся по первому жесту пользователя (autoplay policy).
   ============================================================ */

let ctx = null;
let master = null;
let muted = false;
let current = { region: null, weather: null };
let nodes = [];          // активные узлы текущего эмбиента
let chirpTimer = null;
let desired = null;      // желаемое состояние до init

const P = (f, t) => Math.pow(f, t); // хелпер

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(ctx.destination);
  if (desired) applyAmbient(desired.region, desired.weather);
}

export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.1);
}
export function isMuted() { return muted; }

/* ---------------- SFX ---------------- */
function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise(dur, vol = 0.25, filterFreq = 800, type = 'lowpass', delay = 0) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}

export function sfx(name) {
  if (!ctx || muted) return;
  switch (name) {
    case 'click': tone(700, 0.06, 'triangle', 0.12); break;
    case 'open': tone(440, 0.08, 'sine', 0.14, 620); break;
    case 'close': tone(620, 0.08, 'sine', 0.12, 440); break;
    case 'step': noise(0.12, 0.1, 500); break;
    case 'hit': noise(0.16, 0.3, 700); tone(95, 0.14, 'sine', 0.3, 60); break;
    case 'crit': noise(0.2, 0.32, 900); tone(120, 0.2, 'sawtooth', 0.22, 50); tone(1200, 0.1, 'square', 0.08, 400); break;
    case 'heal': tone(520, 0.2, 'sine', 0.14, 780); tone(780, 0.25, 'sine', 0.1, 1040, 0.12); break;
    case 'coin': tone(1320, 0.09, 'square', 0.09); tone(1760, 0.12, 'square', 0.07, null, 0.07); break;
    case 'quest': tone(660, 0.14, 'sine', 0.16); tone(990, 0.22, 'sine', 0.14, null, 0.12); break;
    case 'achievement': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.16, null, i * 0.11)); break;
    case 'levelup': [392, 523, 659].forEach((f, i) => tone(f, 0.25, 'sine', 0.15, null, i * 0.09)); break;
    case 'death': tone(220, 1.4, 'sine', 0.22, 55); noise(1.2, 0.12, 300); break;
    case 'combat': tone(110, 0.5, 'sawtooth', 0.14, 82); noise(0.5, 0.12, 250); break;
    case 'victory': [523, 659, 784].forEach((f, i) => tone(f, 0.35, 'triangle', 0.16, null, i * 0.13)); break;
    case 'bell': tone(880, 1.2, 'sine', 0.1, 870); tone(1318, 0.9, 'sine', 0.05, null, 0.02); break;
  }
}

/* ---------------- ЭМБИЕНТ ---------------- */
const REGIONS_CFG = {
  village: { drone: [110, 164.8], droneType: 'triangle', droneVol: 0.05, windVol: 0.02, chirp: true },
  forest:  { drone: [82.4, 123.5], droneType: 'sine', droneVol: 0.055, windVol: 0.035, chirp: true },
  road:    { drone: [98, 147], droneType: 'sine', droneVol: 0.04, windVol: 0.03, chirp: false },
  combat:  { drone: [55, 58.3], droneType: 'sawtooth', droneVol: 0.045, windVol: 0.015, chirp: false, pulse: true },
};

export function setAmbient(region, weather = null) {
  desired = { region, weather };
  if (!ctx) return;
  if (current.region === region && current.weather === weather) return;
  applyAmbient(region, weather);
}

/* полная остановка эмбиента (выход с игрового экрана) */
export function stop() {
  desired = null;
  stopAmbient();
}

function stopAmbient() {
  for (const n of nodes) { try { n.stop?.(); n.disconnect?.(); } catch (e) {} }
  nodes = [];
  if (chirpTimer) { clearInterval(chirpTimer); chirpTimer = null; }
  current = { region: null, weather: null };
}

function applyAmbient(region, weather) {
  stopAmbient();
  const cfg = REGIONS_CFG[region] || REGIONS_CFG.village;
  current = { region, weather };
  const t0 = ctx.currentTime;

  // дрон: два расстроенных осциллятора через lowpass + медленный LFO
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 420;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  droneGain.gain.setTargetAtTime(cfg.droneVol, t0, 2.5); // мягкий вход
  filter.connect(droneGain); droneGain.connect(master);
  for (const f of cfg.drone) {
    const o = ctx.createOscillator();
    o.type = cfg.droneType; o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
    o.connect(filter); o.start();
    nodes.push(o);
  }
  // LFO на громкость дрона (дыхание)
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07 + Math.random() * 0.05;
  const lfoG = ctx.createGain(); lfoG.gain.value = cfg.droneVol * 0.5;
  lfo.connect(lfoG); lfoG.connect(droneGain.gain); lfo.start();
  nodes.push(lfo);

  // ветер: зацикленный шум через bandpass
  const windGain = ctx.createGain();
  let windVol = cfg.windVol;
  if (weather === 'storm') windVol = Math.min(0.09, windVol * 2.6);
  else if (weather === 'rain') windVol = Math.min(0.07, windVol * 2.1);
  windGain.gain.value = 0;
  windGain.gain.setTargetAtTime(windVol, t0, 3);
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass'; windFilter.frequency.value = weather === 'storm' ? 500 : 350; windFilter.Q.value = 0.6;
  const noiseLen = 4 * ctx.sampleRate;
  const nbuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = nbuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < noiseLen; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; nd[i] = last * 3.2; }
  const nsrc = ctx.createBufferSource(); nsrc.buffer = nbuf; nsrc.loop = true;
  nsrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);
  nsrc.start();
  nodes.push(nsrc);

  // пульс для боя
  if (cfg.pulse) {
    const pTimer = setInterval(() => {
      if (muted || !ctx || current.region !== 'combat') return;
      tone(55, 0.25, 'sine', 0.1, 40);
    }, 1600);
    nodes.push({ stop: () => clearInterval(pTimer), disconnect: () => {} });
  }

  // птицы: днём, в деревне/лесу, не в грозу
  if (cfg.chirp) {
    const hour = desiredHourProvider ? desiredHourProvider() : 12;
    if (hour >= 6 && hour < 20 && weather !== 'storm') {
      chirpTimer = setInterval(() => {
        if (muted || !ctx) return;
        if (Math.random() < 0.65) {
          const base = 2200 + Math.random() * 1400;
          tone(base, 0.09, 'sine', 0.035, base * (0.8 + Math.random() * 0.5));
          if (Math.random() < 0.5) tone(base * 1.2, 0.07, 'sine', 0.03, base, 0.12);
        }
      }, 2800 + Math.random() * 2500);
    }
  }
}

/* часы для птиц — подключается игровым экраном */
let desiredHourProvider = null;
export function setHourProvider(fn) { desiredHourProvider = fn; }

/* дождь: отдельные капли при rain/storm */
export function weatherTick(weather) {
  if (!ctx || muted) return;
  if (weather === 'rain' || weather === 'storm') {
    if (Math.random() < (weather === 'storm' ? 0.5 : 0.3)) noise(0.05, 0.05, 2600, 'highpass');
  }
}
