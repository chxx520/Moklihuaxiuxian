// 合成音乐与音效（Web Audio）。有 assets/music/<名>.mp3 时优先播放文件。
// 古琴：Karplus-Strong 拨弦 + 轻微滑音；氛围：持续低音、风声、虫鸣、远钟。
import { findAsset } from "./assets";
import { getSettings } from "./save";

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let reverb: ConvolverNode;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 3.2);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  reverb.connect(wet).connect(master);
  musicBus.connect(master);
  musicBus.connect(reverb);
  sfxBus.connect(master);
  sfxBus.connect(reverb);
  applyVolume();
  return ctx;
}

export function applyVolume() {
  if (!ctx) return;
  const s = getSettings();
  musicBus.gain.value = s.music * 0.55;
  sfxBus.gain.value = s.sfx * 0.8;
  if (fileAudio) fileAudio.volume = s.music;
}

/** iOS 需要在用户触摸后才能出声 */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === "suspended") void c.resume();
}

document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else void ctx.resume();
  if (fileAudio) document.hidden ? fileAudio.pause() : void fileAudio.play().catch(() => {});
});

function impulse(c: AudioContext, seconds: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return buf;
}

const pluckCache = new Map<string, AudioBuffer>();
/** Karplus-Strong 拨弦，bright 越小越闷（像古琴） */
function pluckBuffer(c: AudioContext, freq: number, seconds: number, bright: number) {
  const key = `${freq.toFixed(1)}|${seconds}|${bright}`;
  const hit = pluckCache.get(key);
  if (hit) return hit;
  const sr = c.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = c.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const period = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0, last = 0;
  const decay = 0.996;
  for (let i = 0; i < n; i++) {
    const cur = ring[idx];
    const nxt = ring[(idx + 1) % period];
    const v = decay * (bright * cur + (1 - bright) * (cur + nxt) * 0.5);
    ring[idx] = v * 0.5 + last * 0.5;
    last = v;
    d[i] = cur * Math.min(1, i / 60);
    idx = (idx + 1) % period;
  }
  pluckCache.set(key, buf);
  return buf;
}

function pluck(freq: number, when: number, vol = 0.5, opts: { slide?: number; len?: number; bright?: number; bus?: GainNode } = {}) {
  const c = ensure();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(c, freq, opts.len ?? 3.5, opts.bright ?? 0.35);
  if (opts.slide) {
    src.playbackRate.setValueAtTime(1, when + 0.15);
    src.playbackRate.linearRampToValueAtTime(Math.pow(2, opts.slide / 12), when + 0.7);
  }
  const g = c.createGain();
  g.gain.value = vol;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2400;
  src.connect(lp).connect(g).connect(opts.bus ?? musicBus);
  src.start(when);
}

function noise(c: AudioContext, seconds: number) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(freq: number, when: number, dur: number, vol: number, type: OscillatorType = "sine", bus?: GainNode) {
  const c = ensure()!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(vol, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(bus ?? sfxBus);
  o.start(when);
  o.stop(when + dur + 0.05);
}

function burst(when: number, dur: number, vol: number, freq: number, q = 1, bus?: GainNode) {
  const c = ensure()!;
  const src = c.createBufferSource();
  src.buffer = noise(c, dur + 0.1);
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f).connect(g).connect(bus ?? sfxBus);
  src.start(when);
}

function bell(freq: number, when: number, vol: number, bus?: GainNode) {
  [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(freq * m, when, 4.5 / (i + 1), vol / (i + 1.5), "sine", bus));
}

// ———— 音效 ————

export type Sfx = "tap" | "brush" | "seal" | "hit" | "burst" | "shield" | "light" | "sense" | "thud" | "block" | "summon" | "miss" | "crack" | "knock" | "bell" | "page" | "wind";

export function sfx(name: Sfx | string) {
  const c = ensure();
  if (!c || getSettings().sfx <= 0) return;
  const t = c.currentTime + 0.01;
  switch (name) {
    case "tap": tone(880, t, 0.06, 0.05, "triangle"); break;
    case "page": burst(t, 0.18, 0.12, 3000, 0.6); break;
    case "brush": burst(t, 0.35, 0.22, 1800, 0.8); burst(t + 0.12, 0.25, 0.12, 900, 0.8); break;
    case "seal": tone(140, t, 0.25, 0.4, "sine"); burst(t, 0.08, 0.25, 600, 1.5); break;
    case "hit": burst(t, 0.2, 0.3, 1400, 1.2); tone(520, t, 0.18, 0.12, "triangle"); break;
    case "burst": burst(t, 0.5, 0.45, 500, 0.7); tone(90, t, 0.5, 0.35, "sawtooth"); break;
    case "shield": [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.04, 0.9, 0.07)); break;
    case "light": { const o = c.createOscillator(); const g = c.createGain(); o.frequency.setValueAtTime(400, t); o.frequency.exponentialRampToValueAtTime(1200, t + 0.5); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8); o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 0.9); break; }
    case "sense": burst(t, 1.0, 0.12, 2600, 4); tone(1568, t + 0.1, 1.2, 0.04); tone(2093, t + 0.25, 1.0, 0.03); break;
    case "thud": tone(70, t, 0.3, 0.45, "sine"); burst(t, 0.12, 0.2, 300, 1); break;
    case "block": tone(660, t, 0.25, 0.08, "triangle"); burst(t, 0.05, 0.1, 2000, 2); break;
    case "summon": tone(110, t, 0.9, 0.12, "sawtooth"); tone(116, t, 0.9, 0.12, "sawtooth"); break;
    case "miss": tone(220, t, 0.3, 0.1, "triangle"); tone(207, t + 0.12, 0.35, 0.1, "triangle"); break;
    case "crack": burst(t, 0.06, 0.4, 4000, 2); burst(t + 0.07, 0.1, 0.3, 2500, 2); burst(t + 0.2, 0.4, 0.2, 1200, 1); break;
    case "knock": [0, 0.42, 0.84].forEach((d) => { tone(95, t + d, 0.35, 0.5); burst(t + d, 0.08, 0.3, 450, 2); }); break;
    case "bell": bell(392, t, 0.12); break;
    case "wind": burst(t, 2.5, 0.12, 500, 0.4); break;
  }
}

// ———— 背景音乐 ————

// 五声音阶（D 宫）：D E F# A B
const PENTA = [0, 2, 4, 7, 9];
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Theme = {
  root: number; // MIDI
  tempo: number; // 每拍秒数
  density: number; // 每拍落音概率
  range: [number, number]; // 音阶级数范围
  drone?: number; // 低音音量
  wind?: number;
  insects?: boolean;
  bellEvery?: number;
  dissonance?: boolean;
  drum?: boolean;
};

const THEMES: Record<string, Theme> = {
  主题: { root: 50, tempo: 0.9, density: 0.45, range: [0, 10], drone: 0.05, wind: 0.02, bellEvery: 24 },
  山门: { root: 50, tempo: 1.1, density: 0.32, range: [3, 12], drone: 0.04, wind: 0.04, bellEvery: 16 },
  村庄: { root: 55, tempo: 0.65, density: 0.55, range: [2, 12], drone: 0.03, wind: 0.015 },
  夜与异常: { root: 45, tempo: 1.3, density: 0.25, range: [0, 7], drone: 0.08, wind: 0.05, insects: true, dissonance: true },
  挑战: { root: 50, tempo: 0.42, density: 0.6, range: [0, 9], drone: 0.06, drum: true },
  结局: { root: 50, tempo: 1.0, density: 0.38, range: [2, 12], drone: 0.05, bellEvery: 20 },
  回忆: { root: 57, tempo: 1.2, density: 0.3, range: [3, 11], drone: 0.03 },
};

let current = "";
let timer = 0;
let ambient: { stop: () => void } | null = null;
let fileAudio: HTMLAudioElement | null = null;

function startAmbient(th: Theme) {
  const c = ensure()!;
  const nodes: AudioScheduledSourceNode[] = [];
  const out = c.createGain();
  out.gain.setValueAtTime(0, c.currentTime);
  out.gain.linearRampToValueAtTime(1, c.currentTime + 3);
  out.connect(musicBus);
  if (th.drone) {
    [midi(th.root - 12), midi(th.root - 5)].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = i ? 6 : -4;
      const g = c.createGain();
      g.gain.value = th.drone!;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 500;
      o.connect(lp).connect(g).connect(out);
      o.start();
      nodes.push(o);
    });
  }
  if (th.wind) {
    const src = c.createBufferSource();
    src.buffer = noise(c, 4);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 420;
    f.Q.value = 0.5;
    const g = c.createGain();
    g.gain.value = th.wind;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = th.wind * 0.8;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(out);
    src.start();
    lfo.start();
    nodes.push(src, lfo);
  }
  return {
    stop() {
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 2);
      nodes.forEach((n) => n.stop(t + 2.2));
    },
  };
}

function degreeToMidi(root: number, deg: number) {
  const oct = Math.floor(deg / 5);
  return root + oct * 12 + PENTA[((deg % 5) + 5) % 5];
}

export function playMusic(name: string) {
  if (name === current) return;
  current = name;
  stopMusic(true);
  current = name;
  if (!name || name === "stop") return;

  const file = findAsset("music", name);
  if (file) {
    fileAudio = new Audio(file);
    fileAudio.loop = true;
    fileAudio.volume = getSettings().music;
    void fileAudio.play().catch(() => {});
    return;
  }
  const th = THEMES[name] ?? THEMES["主题"];
  const c = ensure();
  if (!c) return;
  ambient = startAmbient(th);
  let deg = Math.floor((th.range[0] + th.range[1]) / 2);
  let beat = 0;
  let next = c.currentTime + 0.5;
  const tick = () => {
    if (!ctx) return;
    while (next < ctx.currentTime + 1.5) {
      beat++;
      if (Math.random() < th.density) {
        deg += [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
        deg = Math.max(th.range[0], Math.min(th.range[1], deg));
        const m = degreeToMidi(th.root, deg);
        const slide = Math.random() < 0.18 ? (Math.random() < 0.5 ? 2 : -2) : 0;
        pluck(midi(m), next, 0.32 + Math.random() * 0.15, { slide, bright: 0.3 });
        if (Math.random() < 0.15) pluck(midi(m - 12), next, 0.18, { bright: 0.25 });
        if (th.dissonance && Math.random() < 0.12) pluck(midi(m + 1), next + 0.05, 0.12, { bright: 0.2 });
      }
      if (th.drum && beat % 2 === 0) { tone(beat % 8 === 0 ? 60 : 85, next, 0.25, 0.25, "sine", musicBus); }
      if (th.bellEvery && beat % th.bellEvery === 0) bell(midi(th.root + 12), next, 0.05, musicBus);
      if (th.insects && Math.random() < 0.2) {
        for (let k = 0; k < 3; k++) tone(4200 + Math.random() * 600, next + k * 0.06, 0.04, 0.006, "sine", musicBus);
      }
      next += th.tempo * (Math.random() < 0.2 ? 1.5 : 1);
    }
  };
  tick();
  timer = window.setInterval(tick, 400);
}

export function stopMusic(keepName = false) {
  if (!keepName) current = "";
  clearInterval(timer);
  ambient?.stop();
  ambient = null;
  if (fileAudio) {
    const a = fileAudio;
    fileAudio = null;
    const fade = setInterval(() => {
      a.volume = Math.max(0, a.volume - 0.08);
      if (a.volume <= 0) { clearInterval(fade); a.pause(); }
    }, 80);
  }
}
