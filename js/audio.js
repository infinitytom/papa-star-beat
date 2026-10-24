// Audio: synthesized music styles, external tracks, rhythm cues, SFX, and the song clock
export let ac = null;
let master, musicBus, sfxBus, NB, musicAn;
export function musicLevel() { if (!musicAn) return 0; const b = new Float32Array(musicAn.fftSize); musicAn.getFloatTimeDomainData(b); let m = 0; for (const v of b) m = Math.max(m, Math.abs(v)); return m; }
const trackCache = new Map();

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
  return useContext(new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }));
}
/** wire buses onto a context (also used with an OfflineAudioContext to render trailers) */
export function useContext(ctx) {
  ac = ctx;
  master = ac.createGain(); master.gain.value = 0.85;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ac.destination);
  musicBus = ac.createGain(); musicBus.gain.value = 0.75; musicBus.connect(master);
  musicAn = ac.createAnalyser(); musicAn.fftSize = 1024; musicBus.connect(musicAn);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  NB = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}
export const setVolumes = (music, sfx) => { if (!ac) return; musicBus.gain.value = 0.75 * music; sfxBus.gain.value = 0.9 * sfx; };
export const outLat = () => (ac ? (ac.outputLatency || 0) + (ac.baseLatency || 0) : 0);
export const perfToAudio = ms => (ac ? ac.currentTime - (performance.now() - ms) / 1000 : 0);

function env(gn, t, a, peak, d) { gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(peak, t + a); gn.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(t, o) {
  const { type = 'sine', f = 440, f2 = 0, dur = 0.2, vol = 0.3, a = 0.004, bus = musicBus, lp = 0, q = 1, det = 0 } = o;
  const osc = ac.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(f, t); if (det) osc.detune.value = det;
  if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const gn = ac.createGain(); env(gn, t, a, vol, dur);
  let node = osc;
  if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(lp, t); fl.Q.value = q; osc.connect(fl); node = fl; }
  node.connect(gn); gn.connect(bus); osc.start(t); osc.stop(t + a + dur + 0.05);
}
function noise(t, o) {
  const { dur = 0.05, vol = 0.2, type = 'highpass', f = 7000, q = 0.7, bus = musicBus } = o;
  const s = ac.createBufferSource(); s.buffer = NB;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const gn = ac.createGain(); env(gn, t, 0.002, vol, dur);
  s.connect(fl); fl.connect(gn); gn.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
const mf = m => 440 * Math.pow(2, (m - 69) / 12);

export const SFX = {
  callz(t) { tone(t, { type: 'triangle', f: 784, f2: 740, dur: 0.17, vol: 0.42, bus: sfxBus }); tone(t, { f: 1568, dur: 0.07, vol: 0.12, bus: sfxBus }); },
  callx(t) { tone(t, { f: 210, f2: 120, dur: 0.22, vol: 0.7, bus: sfxBus }); noise(t, { type: 'bandpass', f: 400, q: 2, dur: 0.06, vol: 0.3, bus: sfxBus }); },
  ansz(t) { tone(t, { type: 'triangle', f: 1175, f2: 1110, dur: 0.17, vol: 0.4, bus: sfxBus }); tone(t, { f: 2350, dur: 0.06, vol: 0.1, bus: sfxBus }); },
  ansx(t) { tone(t, { f: 330, f2: 180, dur: 0.2, vol: 0.65, bus: sfxBus }); noise(t, { type: 'bandpass', f: 700, q: 2, dur: 0.05, vol: 0.25, bus: sfxBus }); },
  perfect(t) { tone(t, { type: 'triangle', f: 1046, dur: 0.16, vol: 0.28, bus: sfxBus }); tone(t, { f: 1568, dur: 0.22, vol: 0.12, bus: sfxBus }); },
  good(t) { tone(t, { type: 'triangle', f: 880, dur: 0.12, vol: 0.24, bus: sfxBus }); },
  off(t) { noise(t, { type: 'lowpass', f: 500, dur: 0.08, vol: 0.32, bus: sfxBus }); },
  shield(t) { tone(t, { f: 300, f2: 900, dur: 0.14, vol: 0.3, bus: sfxBus }); },
  parry(t) { tone(t, { type: 'square', f: 1320, dur: 0.12, vol: 0.14, lp: 5000, bus: sfxBus }); tone(t, { type: 'square', f: 1980, dur: 0.18, vol: 0.1, lp: 6000, bus: sfxBus }); },
  boom(t) { noise(t, { type: 'lowpass', f: 900, dur: 0.32, vol: 0.45, bus: sfxBus }); tone(t, { f: 120, f2: 40, dur: 0.25, vol: 0.4, bus: sfxBus }); },
  hurt(t) { tone(t, { type: 'sawtooth', f: 240, f2: 70, dur: 0.3, vol: 0.3, lp: 1200, bus: sfxBus }); },
  bomb(t) { noise(t, { type: 'lowpass', f: 1400, dur: 1.0, vol: 0.5, bus: sfxBus }); tone(t, { f: 90, f2: 28, dur: 0.9, vol: 0.6, bus: sfxBus }); },
  miss(t) { tone(t, { type: 'square', f: 220, f2: 180, dur: 0.12, vol: 0.12, lp: 900, bus: sfxBus }); },
  click(t, hi) { tone(t, { type: 'square', f: hi ? 1760 : 1320, dur: 0.04, vol: 0.14, bus: sfxBus }); },
  holdz(t, d = 0.5) { tone(t, { type: 'triangle', f: 784, dur: d, vol: 0.32, a: 0.01, bus: sfxBus }); tone(t, { f: 1568, dur: d * 0.6, vol: 0.06, bus: sfxBus }); },
  holdx(t, d = 0.5) { tone(t, { type: 'sawtooth', f: 110, dur: d, vol: 0.22, a: 0.01, lp: 500, bus: sfxBus }); tone(t, { f: 210, f2: 120, dur: 0.2, vol: 0.5, bus: sfxBus }); },
  efire(t) { tone(t, { type: 'square', f: 520, f2: 260, dur: 0.07, vol: 0.06, lp: 2000, bus: sfxBus }); },
  eheavy(t) { tone(t, { f: 95, f2: 50, dur: 0.25, vol: 0.55, bus: sfxBus }); noise(t, { type: 'lowpass', f: 300, dur: 0.12, vol: 0.3, bus: sfxBus }); },
  ewarn(t) { tone(t, { type: 'triangle', f: 1480, dur: 0.05, vol: 0.06, bus: sfxBus }); },
  tick(t) { tone(t, { type: 'triangle', f: 1760, dur: 0.04, vol: 0.08, bus: sfxBus }); },
  power(t) { [0, 0.06, 0.12].forEach((d, i) => tone(t + d, { type: 'triangle', f: [880, 1175, 1568][i], dur: 0.12, vol: 0.2, bus: sfxBus })); },
  ui(t) { tone(t, { type: 'triangle', f: 1320, dur: 0.05, vol: 0.12, bus: sfxBus }); },
  talk(t) { tone(t, { type: 'square', f: 600 + Math.random() * 300, dur: 0.03, vol: 0.05, lp: 2500, bus: sfxBus }); },
};
export const sfx = (name, ...a) => { if (ac && SFX[name]) SFX[name](ac.currentTime, ...a); };

// ---------------- synthesized music: cute arrangements with melody ----------------
// lvl 0: metronome + soft pad · 1: drums, bass, pad · 2: + clap, sparkle arp · 3: + lead melody
// Echo bars (call & response) duck the lead so the call is easy to hear.
export const STYLES = {
  chip:      { name: '糖果芯片', chords: [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]], lead: 'square', bass: 'square', arp: [0, 1, 2, 1], bassPat: 'bounce', scale: [0, 2, 4, 7, 9], root: 60 },
  trance:    { name: '星星流行', chords: [[62, 66, 69], [57, 61, 64], [59, 62, 66], [55, 59, 62]], lead: 'triangle', bass: 'sawtooth', arp: [0, 1, 2, 3], bassPat: 'off8', scale: [0, 2, 4, 7, 9], root: 62, pad: true },
  synthwave: { name: '泡泡放克', chords: [[65, 69, 72, 76], [62, 65, 69, 72], [70, 74, 77, 81], [67, 70, 74, 77]], lead: 'square', bass: 'sawtooth', arp: [0, 2, 1, 3], bassPat: 'funk', scale: [0, 2, 3, 5, 7, 10], root: 65, pad: true, swing: 0.08 },
  boss:      { name: '团长进行曲', chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]], lead: 'sawtooth', bass: 'sawtooth', arp: [0, 1, 2, 1, 2, 1], bassPat: 'gallop', scale: [0, 2, 3, 5, 7, 8, 11], root: 57, pad: true },
};
const RHY = [ // melody rhythms in 16th steps (one bar)
  [0, 4, 6, 8, 12], [0, 2, 4, 8, 10, 12], [0, 6, 8, 10, 12, 14], [0, 4, 8, 11, 12], [2, 4, 6, 8, 12, 14], [0, 3, 6, 8, 12],
];
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function melodyNote(style, bar, s) {
  const rh = RHY[Math.floor(hash(bar >> 1, 7) * RHY.length)];
  const i = rh.indexOf(s); if (i < 0) return null;
  const ch = style.chords[((bar % 4) + 4) % 4];
  const strong = s % 8 === 0;
  if (strong) return ch[Math.floor(hash(bar, s) * ch.length)] + 12;
  const sc = style.scale, deg = Math.floor(hash(bar * 3 + 1, s) * sc.length);
  let m = style.root + sc[deg] + 12; while (m < ch[0] + 7) m += 12; while (m > ch[0] + 22) m -= 12;
  return m;
}
function playStep(style, bar, s, lvl, t, echoBar) {
  if (lvl < 0) return;
  const ch = style.chords[((bar % 4) + 4) % 4];
  if (style.swing && s % 2 === 1) t += style.swing * 0.25;
  if (lvl === 0) {
    if (s % 4 === 0) SFX.click(t, s === 0);
    if (s === 0) for (const m of ch) tone(t, { type: 'triangle', f: mf(m), dur: 1.9, vol: 0.035, a: 0.2 });
    return;
  }
  // drums
  if (s % 4 === 0) tone(t, { f: 150, f2: 45, dur: 0.22, vol: 0.9, a: 0.002 });
  if (s % 4 === 2) noise(t, { dur: 0.045, vol: 0.13 });
  if (lvl >= 3 && s % 2 === 1) noise(t, { dur: 0.02, vol: 0.05 });
  if (lvl >= 2 && (s === 4 || s === 12)) { noise(t, { type: 'bandpass', f: 1500, q: 0.9, dur: 0.13, vol: 0.32 }); noise(t + 0.012, { type: 'bandpass', f: 1300, q: 0.9, dur: 0.1, vol: 0.2 }); }
  // bass
  const root = ch[0] - 24, bp = style.bassPat;
  const hit = bp === 'off8' ? s % 4 === 2 : bp === 'bounce' ? s % 4 === 0 || s % 4 === 2 : bp === 'funk' ? [0, 3, 6, 10, 12, 14].includes(s) : bp === 'gallop' ? s % 4 !== 1 : s % 2 === 0;
  if (hit) {
    const oct = (bp === 'bounce' && s % 4 === 2) || (bp === 'funk' && (s === 6 || s === 14)) ? 12 : 0;
    tone(t, { type: style.bass, f: mf(root + oct), dur: bp === 'gallop' ? 0.08 : 0.15, vol: style.bass === 'square' ? 0.11 : 0.22, lp: 700, q: 4 });
  }
  // pad / chord stabs
  if (s === 0) for (const m of ch) tone(t, { type: style.pad ? 'sawtooth' : 'triangle', f: mf(m), dur: 1.9, vol: style.pad ? 0.028 : 0.04, a: 0.15, lp: 1600, det: 7 });
  if (!style.pad && (s === 6 || s === 14)) for (const m of ch) tone(t, { type: 'square', f: mf(m + 12), dur: 0.08, vol: 0.018, lp: 2600 });
  // sparkle arp
  if (lvl >= 2 && s % 2 === 0) { const idx = style.arp[(s >> 1) % style.arp.length] % ch.length; tone(t, { type: 'triangle', f: mf(ch[idx] + 24), dur: 0.09, vol: echoBar ? 0.025 : 0.045 }); }
  // lead melody
  if (lvl >= 3 && !echoBar) {
    const m = melodyNote(style, bar, s);
    if (m) { tone(t, { type: style.lead, f: mf(m), dur: 0.2, vol: style.lead === 'square' ? 0.055 : style.lead === 'sawtooth' ? 0.045 : 0.11, lp: 3200, a: 0.01 }); tone(t, { type: 'sine', f: mf(m + 12), dur: 0.12, vol: 0.025 }); }
  }
}

export async function loadTrack(url) {
  initAudio();
  if (trackCache.has(url)) return trackCache.get(url);
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = await ac.decodeAudioData(await res.arrayBuffer());
  trackCache.set(url, buf); return buf;
}
export async function decodeFile(file) { initAudio(); return ac.decodeAudioData(await file.arrayBuffer()); }

// ---------------- conductor: the song clock ----------------
export class Conductor {
  constructor() { this.timer = 0; this.src = null; this.cueQ = []; this.on = false; }
  start({ bpm, music, barInfo, startBar = 0, buffer = null }) {
    this.stop(); initAudio(); ac.resume();
    this.bpm = bpm; this.spb = 60 / bpm; this.barInfo = barInfo;
    this.style = STYLES[music && music.style] || STYLES.trance;
    const now = ac.currentTime, lead = 0.5;
    this.T0 = now + lead - startBar * 4 * this.spb;
    this.nextStep = startBar * 16; this.cueQ = []; this.trackEnd = Infinity;
    this.synth = !(music && music.type === 'url' && buffer);
    if (!this.synth) {
      const src = ac.createBufferSource(); src.buffer = buffer; src.connect(musicBus);
      const pos = (music.offset || 0) + startBar * 4 * this.spb;
      if (pos >= 0) src.start(now + lead, pos); else src.start(now + lead - pos, 0);
      this.src = src; this.trackEnd = now + lead + (buffer.duration - pos);
    }
    this.on = true;
    this.timer = setInterval(() => this.schedule(), 25); this.schedule();
  }
  stop() { clearInterval(this.timer); this.on = false; if (this.src) { try { this.src.stop(); } catch (e) {} this.src = null; } }
  pt() { return ac.currentTime - outLat() - this.T0; }
  beat() { return this.pt() / this.spb; }
  atBeat(b) { return this.T0 + b * this.spb; }
  trackOver() { return ac && ac.currentTime > this.trackEnd + 0.2; }
  cue(beat, kind, arg) { this.cueQ.push({ beat, kind, arg }); this.cueQ.sort((a, b) => a.beat - b.beat); }
  schedule() {
    if (!this.on) return;
    const ahead = ac.currentTime + 0.14;
    while (this.T0 + this.nextStep * this.spb / 4 < ahead) {
      const t = this.T0 + this.nextStep * this.spb / 4, bar = Math.floor(this.nextStep / 16);
      if (t > ac.currentTime - 0.02) {
        const info = this.barInfo(bar), lvl = info.lvl ?? 1;
        if (this.synth) { const eb = !!(info.echo || (this.barInfo(bar - 1) || {}).echo); playStep(this.style, bar, this.nextStep % 16, lvl, t, eb); }
        else if (lvl === 0 && this.nextStep % 4 === 0) SFX.click(t, this.nextStep % 16 === 0);
      }
      this.nextStep++;
    }
    while (this.cueQ.length && this.T0 + this.cueQ[0].beat * this.spb < ahead) {
      const c = this.cueQ.shift(), t = this.T0 + c.beat * this.spb;
      if (t > ac.currentTime - 0.02 && SFX[c.kind]) SFX[c.kind](t, c.arg);
    }
  }
}
