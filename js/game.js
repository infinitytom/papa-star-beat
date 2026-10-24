// Game logic: one 0..1 playfield (x right, y down). Rendering is elsewhere.
// Everything an enemy does is quantized to the beat; the player is judged against the beat.
import { clamp, lerp, easeOut, TAU, C } from './util.js';
import { ac, sfx, outLat } from './audio.js';

export const DIFF = {
  easy:   { name: '简单', P: 0.09, G: 0.18, hp: 7, bul: 0.6, boss: 0.7 },
  normal: { name: '普通', P: 0.07, G: 0.14, hp: 5, bul: 1.0, boss: 1.0 },
  hard:   { name: '困难', P: 0.05, G: 0.10, hp: 4, bul: 1.3, boss: 1.25 },
};
export const ASPECT = 0.8; // field width / height (collision metric)
export const FORM = {
  line: (i, n) => ({ x: 0.14 + 0.72 * i / Math.max(1, n - 1), y: 0.2 }),
  v: (i, n) => ({ x: 0.14 + 0.72 * i / Math.max(1, n - 1), y: 0.12 + Math.abs(i - (n - 1) / 2) * 0.05 }),
  zig: (i, n) => ({ x: 0.14 + 0.72 * i / Math.max(1, n - 1), y: 0.14 + (i % 2) * 0.09 }),
  circle: (i, n) => ({ x: 0.5 + Math.cos(i / n * TAU) * 0.27, y: 0.24 + Math.sin(i / n * TAU) * 0.1 }),
  pair: (i, n) => ({ x: 0.3 + (i % 2) * 0.4, y: 0.16 + Math.floor(i / 2) * 0.08 }),
};
export const FORMS = Object.keys(FORM);
const HUES = [C.cyan, C.mint, C.violet, C.gold];
const SEQ = [0, 1, 0, -1];
function hop(beat, amp, sway) {
  const st = Math.floor(beat), ph = beat - st, e = easeOut(Math.min(1, ph / 0.2));
  return { dx: lerp(SEQ[((st - 1) % 4 + 4) % 4], SEQ[(st % 4 + 4) % 4], e) * amp * sway, dy: -0.012 * (1 - e) };
}
// bullets surge forward on every beat and drift in between
const stepTravel = t => { if (t <= 0) return 0; const k = Math.floor(t), f = t - k; return k + 0.65 * easeOut(Math.min(1, f / 0.28)) + 0.35 * f; };

export class Game {
  constructor(level, cond, { diff = 'normal', startBar = 0, buffer = null, offsets = {} } = {}) {
    this.L = level; this.cond = cond; this.D = DIFF[diff] || DIFF.normal; this.diffKey = diff;
    this.startBar = startBar; this.buffer = buffer; this.offsets = offsets;
    this.ents = []; this.bullets = []; this.echoes = []; this.fx = []; this.pops = [];
    this.score = 0; this.combo = 0; this.maxCombo = 0; this.hp = this.D.hp; this.maxHp = this.D.hp;
    this.bombs = 1; this.power = 1; this.energy = 0; this.inv = -99;
    this.st = { perfect: 0, good: 0, off: 0, eHit: 0, eMiss: 0, kills: 0, parry: 0 };
    this.proc = startBar - 2; this.boss = null; this.bossDead = false; this.endBar = Infinity;
    this.banner = null; this.lastPress = { a: -9, b: -9 }; this.holding = { a: null, b: null };
    this.beamHold = null; this.shield = null; this.over = false; this.win = false; this.beatIdx = -9; this.pulse = 0;
    this.p = { x: 0.5, y: 0.84, tx: 0.5, ty: 0.84, mouth: 0, roll: 0 };
    this.totemSide = 0; this.uid = 1;
    if (!level.boss) this.endBar = level.bars.length + 1;
  }
  begin() {
    const sb = this.startBar > 0 ? this.startBar - 1 : 0;
    this.cond.start({ bpm: this.L.bpm, music: this.L.music, barInfo: b => this.barInfo(b), startBar: sb, buffer: this.buffer });
    this.proc = sb - 1;
  }
  get spb() { return this.cond.spb; }
  get Pb() { return this.cond.beat(); }
  barInfo(b) {
    if (b < 0) return { lvl: 0 };
    if (this.startBar > 0 && b < this.startBar) return { lvl: 0 };
    const bars = this.L.bars;
    if (b < bars.length) return bars[b];
    if (this.L.boss && !this.bossDead && this.boss) { const loop = this.L.boss.loop; return loop.length ? loop[(b - bars.length) % loop.length] : { lvl: 3 }; }
    return { lvl: b < this.endBar ? 2 : -1 };
  }

  // ---------------- spawning ----------------
  spawnBar(b) {
    const info = this.barInfo(b);
    if (b < this.startBar) return;
    if (info.text) this.banner = { text: info.text, from: b * 4 - 0.5, to: b * 4 + 7 };
    if (info.drones) this.spawnDrones(b, info.drones);
    if (info.drummer) this.spawnDrummer(b, info.drummer);
    if (info.echo) this.spawnEcho(b, info.echo);
    if (info.wall) this.spawnWall(b, info.wall);
    if (info.bossIn && this.L.boss) this.spawnBoss(b);
    if (info.bossAtk && this.boss && !this.bossDead) this.bossAttack(b, info.bossAtk);
  }
  keepShot(i, bar, f) { const k = this.D.bul; if (k >= 1) return true; return (i * 7 + bar * 3 + Math.round(f * 2)) % 10 < k * 10; }
  spawnDrones(b, d) {
    const n = clamp(d.n | 0 || 4, 1, 8), life = clamp(d.life || 2, 1, 8), form = FORM[d.form] ? d.form : 'line';
    for (let i = 0; i < n; i++) {
      const h = FORM[form](i, n), fires = [];
      for (let bb = b; bb < b + life; bb++) for (const f of d.fire || []) {
        if (d.alt && (i + bb) % 2) continue;
        if (!this.keepShot(i, bb, f)) continue;
        fires.push(bb * 4 + f);
      }
      fires.sort((a, c) => a - c);
      for (const fb of fires) this.cond.cue(fb, 'efire');
      this.ents.push({ id: this.uid++, type: 'drone', hx: h.x, hy: h.y, x: h.x, y: -0.2, enter: b * 4 - 1.5 + i * 0.12, leave: (b + life) * 4,
        hp: d.hp || 2, max: d.hp || 2, r: 0.03, fires, aim: d.aim || 'down', sway: i % 2 ? 1 : -1, col: HUES[(i + b) % HUES.length], hitT: -9 });
    }
  }
  spawnDrummer(b, d) {
    const life = clamp(d.life || 4, 1, 8), fires = [];
    for (let bb = b; bb < b + life; bb++) for (const f of d.fire || [0]) fires.push(bb * 4 + f);
    for (const fb of fires) { this.cond.cue(fb, 'eheavy'); this.cond.cue(fb + 1, 'ewarn'); }
    const x = clamp(d.x ?? 0.5, 0.1, 0.9);
    this.ents.push({ id: this.uid++, type: 'drummer', hx: x, hy: d.y ?? 0.14, x, y: -0.2, enter: b * 4 - 2, leave: (b + life) * 4 + 1,
      hp: d.hp || 5, max: d.hp || 5, r: 0.045, fires, hitT: -9, hitBeat: -9 });
  }
  spawnEcho(b, e) {
    let host;
    const notes = (e.notes || []).filter(n => n[0] >= 0 && n[0] < 4).map(([t, k, l]) => ({ t: b * 4 + t, rt: (b + 1) * 4 + t, k: k === 'x' ? 'x' : 'z', l: Math.max(0, Math.min(l || 0, 4 - t)), s: 0 }));
    if (!notes.length) return;
    notes.sort((a, c) => a.t - c.t);
    if (e.host === 'boss' && this.boss && !this.bossDead) host = this.boss;
    else {
      this.totemSide ^= 1;
      const x = e.x ?? (this.totemSide ? 0.62 : 0.38);
      host = { id: this.uid++, type: 'totem', x, y: 0.22, hx: x, hy: 0.22, enter: b * 4 - 2, r: 0.07, hitT: -9, leaveAt: Infinity };
      this.ents.push(host);
    }
    const ex = { host, notes, done: false };
    for (const n of notes) n.ex = ex;
    host.echo = ex; this.echoes.push(ex);
    for (const n of notes) {
      if (n.l > 0) this.cond.cue(n.t, n.k === 'x' ? 'holdx' : 'holdz', n.l * this.spb);
      else this.cond.cue(n.t, n.k === 'x' ? 'callx' : 'callz');
    }
  }
  spawnWall(b, w) {
    const rows = (w.rows && w.rows.length ? w.rows : [0, 2]).filter((o, k) => this.D.bul >= 1 || k % 2 === 0);
    rows.forEach((o, k) => {
      const gap = (w.gaps && w.gaps[k % w.gaps.length]) ?? [0.25, 0.7, 0.4, 0.6][k % 4];
      this.ents.push({ id: this.uid++, type: 'wallgen', at: b * 4 + o, gap, done: false, enter: -1e9 });
      this.cond.cue(b * 4 + o, 'efire');
    });
  }
  spawnBoss(b) {
    const B = this.L.boss, hp = Math.round((B.hp || 170) * this.D.boss);
    this.boss = { id: this.uid++, type: 'boss', name: B.name || 'BOSS', x: 0.5, y: 0.25, hx: 0.5, hy: 0.25, enter: b * 4, hp, max: hp, r: 0.1, fires: [], hitT: -9, mouthT: -9 };
    this.ents.push(this.boss);
  }
  bossAttack(b, kind) {
    const B = this.boss, rage = B.hp < B.max * 0.5, D = this.D;
    let beats = kind === 'rain' ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : kind === 'spread' ? (rage ? [0, 1, 2, 3] : [0, 2]) : [0, 1, 2, 3];
    if (D.bul < 1) beats = beats.filter((x, i) => i % 2 === 0);
    for (const o of beats) { B.fires.push({ beat: b * 4 + o, kind, k: o }); this.cond.cue(b * 4 + o, kind === 'aim' ? 'eheavy' : 'efire'); }
    B.fires.sort((a, c) => a.beat - c.beat);
  }

  // ---------------- bullets ----------------
  aimDir(x, y, tx = this.p.x, ty = this.p.y) { const dx = (tx - x) * ASPECT, dy = ty - y, m = Math.hypot(dx, dy) || 1; return [dx / m / ASPECT, dy / m]; }
  addBullet(x, y, dir, sp, b0, o = {}) {
    this.bullets.push({ x, y, x0: x, y0: y, dx: dir[0], dy: dir[1], sp, b0, r: o.r || 0.014, kind: o.kind || 'n', step: o.step !== false });
  }
  angDir(a) { return [Math.sin(a) / ASPECT, Math.cos(a)]; }

  // ---------------- player actions ----------------
  windows() { return [this.D.P, this.D.G]; }
  press(action, audioT, src = 'key') {
    if (this.over) return;
    const pt = audioT - outLat() - this.cond.T0 - (this.offsets[src] || 0);
    if (action === 'a' || action === 'b') this.attack(action, pt);
  }
  release(action, audioT, src = 'key') {
    if (this.over) return;
    const pt = audioT - outLat() - this.cond.T0 - (this.offsets[src] || 0);
    const key = action === 'a' ? 'z' : action === 'b' ? 'x' : null; if (!key) return;
    const n = this.holding[action];
    if (n && n.s === 1) {
      const [, GW] = this.windows();
      if (pt >= (n.rt + n.l) * this.spb - GW * 1.5) this.holdDone(n); else this.noteMiss(n, '松早了');
    }
    this.holding[action] = null;
    if (action === 'a') this.beamHold = null;
    if (action === 'b' && this.shield) this.shield.hold = false;
  }
  attack(action, pt) {
    if (pt - this.lastPress[action] < 0.09) return;
    this.lastPress[action] = pt;
    const key = action === 'a' ? 'z' : 'x', [P, GW] = this.windows(), spb = this.spb;
    const b = pt / spb, dBeat = Math.abs(b - Math.round(b)) * spb;
    // candidate echo notes
    let same = null, dS = 1e9, other = null, dO = 1e9;
    for (const ex of this.echoes) { if (ex.done) continue; for (const n of ex.notes) { if (n.s !== 0) continue; const d = Math.abs(pt - n.rt * spb); if (n.k === key) { if (d < dS) { dS = d; same = n; } } else if (d < dO) { dO = d; other = n; } } }
    // heavy bullet arrivals (parry window) for B
    let heavy = null, dH = 1e9;
    if (action === 'b') for (const bl of this.bullets) { if (bl.kind !== 'h' || bl.ref) continue; const d = Math.abs(pt - bl.arrive * spb); const dist = Math.hypot((bl.tx - this.p.x) * ASPECT, bl.ty - this.p.y); if (d < dH && dist < 0.16) { dH = d; heavy = bl; } }
    let d = dBeat, kind = 'beat';
    if (same && dS <= GW) { d = Math.min(dS, d); kind = 'echo'; }
    else if (other && dO <= GW && dO < dBeat + 0.02) { this.noteMiss(other, '按错键'); this.combo = 0; this.st.off++; this.popAt('错键', this.p.x, this.p.y - 0.07, C.red); return; }
    if (heavy && dH <= GW) { d = Math.min(d, dH); }
    const j = d <= P ? 'perfect' : d <= GW ? 'good' : 'off';
    this.st[j]++;
    const early = pt - Math.round(b) * spb < 0;
    if (j === 'off') { this.combo = 0; this.addEnergy(-0.15); }
    else { this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.score += Math.round((j === 'perfect' ? 300 : 120) * (1 + Math.min(this.combo, 60) / 30)); this.addEnergy(j === 'perfect' ? 0.12 : 0.05); }
    if (kind === 'echo') { sfx(key === 'z' ? 'ansz' : 'ansx'); this.noteHit(same, j, action); } else sfx(j);
    this.popAt(j === 'perfect' ? 'PERFECT' : j === 'good' ? (early ? 'GOOD·早' : 'GOOD·晚') : 'OFF', this.p.x, this.p.y - 0.07, j === 'perfect' ? C.gold : j === 'good' ? C.cyan : C.mute, false, true);
    this.p.mouth = 1;
    if (action === 'a') {
      this.fireBeam(j);
      if (j !== 'off') this.beamHold = { j, from: pt / spb, lastTick: Math.floor(pt / spb * 2) };
    } else {
      if (heavy && dH <= GW) this.parry(heavy, j);
      if (j !== 'off') { const r = j === 'perfect' ? 0.14 : 0.1; this.shield = { r, until: pt / spb + 0.4, hold: true, j }; this.fx.push({ k: 'shield', x: this.p.x, y: this.p.y, r, j }); sfx('shield'); }
    }
  }
  addEnergy(v) {
    this.energy += v;
    if (this.energy >= 1) {
      if (this.power < 4) { this.power++; this.energy = 0; sfx('power'); this.popAt('火力 Lv' + this.power, this.p.x, this.p.y - 0.13, C.mint, true); }
      else { this.energy = 0.4; if (this.bombs < 3) { this.bombs++; this.popAt('炸弹 +1', this.p.x, this.p.y - 0.13, C.gold); } }
    } else if (this.energy < 0) {
      if (this.power > 1) { this.power--; this.energy = 0.6; this.popAt('火力下降', this.p.x, this.p.y - 0.13, C.red); } else this.energy = 0;
    }
  }
  fireBeam(j, tick = false) {
    const p = this.p, lv = this.power;
    const base = j === 'perfect' ? 0.08 : j === 'good' ? 0.052 : 0.022;
    const w = tick ? 0.03 + lv * 0.006 : base * (lv >= 3 ? 1.4 : 1);
    const dmg = tick ? 0.6 + lv * 0.2 : (j === 'perfect' ? 3 : j === 'good' ? 2 : 1) * (lv >= 3 ? 1.3 : 1);
    const lines = [[p.x, w, dmg]];
    if (lv >= 2 && j !== 'off' && !tick) { lines.push([p.x - 0.075, 0.03, dmg * 0.4], [p.x + 0.075, 0.03, dmg * 0.4]); }
    for (const [x, ww, dd] of lines) { this.fx.push({ k: 'beam', x, y: p.y, w: ww, j: tick ? 'tick' : j, lv }); this.hitColumn(x, p.y, ww, dd); }
    if (lv >= 4 && j !== 'off' && !tick) {
      for (const s of [-1, 1]) this.bullets.push({ x: p.x + s * 0.03, y: p.y - 0.02, kind: 'p', vx: s * 0.4, vy: -1.2, dmg: 1.5, life: 1.6, r: 0.016 });
    }
  }
  hitColumn(x, y, w, dmg) {
    const Pb = this.Pb;
    for (const e of this.ents) {
      if (!(e.type === 'drone' || e.type === 'boss' || e.type === 'drummer')) continue;
      if (Pb < e.enter || e.dead || e.y > y) continue;
      if (e.type === 'drummer') { if (Math.abs(e.x - x) * ASPECT < w / 2 + e.r && performance.now() - (e.immT || 0) > 900) { e.immT = performance.now(); this.popAt('鼓面挡住了！用 B 弹反', e.x, e.y + 0.08, C.orange); } continue; }
      if (Math.abs(e.x - x) * ASPECT < w / 2 + e.r) this.damage(e, e.type === 'boss' ? dmg * 0.35 : dmg);
    }
  }
  parry(bl, j) {
    bl.ref = true; bl.refFrom = this.Pb; bl.rx = bl.x; bl.ry = bl.y; this.st.parry++;
    sfx('parry'); this.popAt('弹反!', this.p.x, this.p.y - 0.1, C.violet, true);
    this.fx.push({ k: 'burst', x: bl.x, y: bl.y, col: C.violet, n: 12, sp: 0.4 });
    this.score += j === 'perfect' ? 500 : 250;
  }
  damage(e, dmg) {
    e.hp -= dmg; e.hitT = performance.now();
    if (e.type === 'boss') { this.score += Math.round(dmg * 20); if (e.hp <= 0 && !this.bossDead) this.bossDie(); return; }
    if (e.hp <= 0 && !e.dead) {
      e.dead = true; this.st.kills++; this.score += e.type === 'drummer' ? 400 : 100;
      this.fx.push({ k: 'burst', x: e.x, y: e.y, col: e.col || C.orange, n: 18, sp: 0.5 }); sfx('boom');
    }
  }
  bossDie() {
    const B = this.boss; B.dead = true; this.bossDead = true; this.score += 5000;
    for (let k = 0; k < 6; k++) this.fx.push({ k: 'burst', x: B.x + (Math.random() - 0.5) * 0.2, y: B.y + (Math.random() - 0.5) * 0.1, col: k % 2 ? C.pink : C.gold, n: 26, sp: 0.8 });
    sfx('boom'); sfx('bomb'); this.bullets = this.bullets.filter(b => b.kind === 'p'); this.fx.push({ k: 'flash' });
    this.endBar = Math.floor(this.Pb / 4) + 3;
    this.banner = { text: (B.name || 'BOSS') + ' · 击破！', from: this.Pb, to: this.Pb + 8 };
    for (const ex of this.echoes) ex.done = true;
  }
  noteHit(n, j, action) {
    const ex = n.ex, h = ex.host;
    h.hitT = performance.now(); this.fx.push({ k: 'burst', x: h.x, y: h.y - 0.02, col: n.k === 'x' ? C.violet : C.gold, n: 8, sp: 0.35 });
    if (n.l > 0) { n.s = 1; this.holding[action] = n; }
    else { n.s = 2; this.st.eHit++; if (h.type === 'boss') this.damage(h, j === 'perfect' ? 5 : 3); }
  }
  holdDone(n) {
    n.s = 2; this.st.eHit++; this.score += 200; sfx('perfect');
    const h = n.ex.host; this.fx.push({ k: 'burst', x: h.x, y: h.y, col: C.mint, n: 10, sp: 0.4 });
    if (h.type === 'boss') this.damage(h, 6);
    this.popAt('长按 OK', this.p.x, this.p.y - 0.1, C.mint);
  }
  noteMiss(n, why = 'MISS') {
    n.s = -1; this.st.eMiss++; this.combo = 0; sfx('miss');
    this.popAt(why, n.ex.host.x, n.ex.host.y + 0.1, C.red);
    for (const k of ['a', 'b']) if (this.holding[k] === n) this.holding[k] = null;
  }
  echoFinish(ex) {
    ex.done = true;
    const misses = ex.notes.filter(n => n.s === -1).length, h = ex.host;
    if (misses === 0) {
      this.score += 1000; this.popAt('完美回声!', h.x, h.y + 0.12, C.gold, true);
      if (h.type === 'totem') { h.dead = true; this.fx.push({ k: 'burst', x: h.x, y: h.y, col: C.pink, n: 26, sp: 0.6 }); sfx('boom'); }
      else this.damage(h, 10);
    } else {
      // punishment volley — still on the beat: one volley per following beat
      const nb = Math.min(3, misses), b0 = Math.ceil(this.Pb);
      for (let v = 0; v < nb; v++) { h.fires = h.fires || []; h.fires.push({ beat: b0 + v, kind: 'punish', k: v }); this.cond.cue(b0 + v, 'efire'); }
      if (h.type === 'totem') h.leaveAt = b0 + nb;
    }
  }
  bomb() {
    if (this.over || this.bombs <= 0) return;
    this.bombs--; this.fx.push({ k: 'flash' }); sfx('bomb');
    for (const bl of this.bullets) if (bl.kind !== 'p') this.fx.push({ k: 'burst', x: bl.x, y: bl.y, col: C.pink, n: 2, sp: 0.2 });
    this.bullets = this.bullets.filter(b => b.kind === 'p');
    const Pb = this.Pb;
    for (const e of this.ents) if ((e.type === 'drone' || e.type === 'boss' || e.type === 'drummer') && Pb >= e.enter && !e.dead) this.damage(e, e.type === 'boss' ? 8 : 6);
    this.popAt('炸弹!', this.p.x, this.p.y - 0.1, C.gold, true);
  }
  hurt() {
    const Pb = this.Pb; if (Pb < this.inv) return;
    this.hp--; this.inv = Pb + 2.5; this.combo = 0; sfx('hurt'); this.fx.push({ k: 'hurt' });
    this.fx.push({ k: 'burst', x: this.p.x, y: this.p.y, col: C.red, n: 16, sp: 0.5 });
    if (this.power > 1) { this.power--; this.energy = 0.5; this.popAt('火力下降', this.p.x, this.p.y - 0.13, C.red); }
    if (this.hp <= 0) this.finish(false);
  }
  finish(win) { if (this.over) return; this.over = true; this.win = win; this.endAt = performance.now(); this.cond.stop(); }
  popAt(text, x, y, col, big = false, judge = false) { if (judge) this.pops = this.pops.filter(q => !q.judge); this.pops.push({ text, x, y, col, t: 0, big, judge }); }

  // ---------------- per frame ----------------
  update(dt, move) {
    const p = this.p;
    for (const q of this.pops) q.t += dt; this.pops = this.pops.filter(q => q.t < 0.8);
    p.mouth = Math.max(this.beamHold ? 0.6 : 0, p.mouth - dt * 5);
    if (this.over) return;
    // movement
    const ox = p.x;
    if (move.kx || move.ky) {
      const v = (move.slow ? 0.42 : 1) * dt, dg = move.kx && move.ky ? 0.71 : 1;
      p.x = clamp(p.x + move.kx * v * dg, 0.04, 0.96); p.y = clamp(p.y + move.ky * v * 0.8 * dg, 0.45, 0.95); p.tx = p.x; p.ty = p.y;
    } else if (move.ptr) { p.tx = clamp(move.px, 0.04, 0.96); p.ty = clamp(move.py, 0.45, 0.95); const k = 1 - Math.exp(-dt * 32); p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }
    p.roll = lerp(p.roll, clamp((p.x - ox) / Math.max(dt, 1e-3) * 0.6, -0.6, 0.6), 1 - Math.exp(-dt * 10));

    const Pb = this.Pb;
    while (this.proc < Math.floor(Pb / 4) + 1) { this.proc++; this.spawnBar(this.proc); }
    const bi = Math.floor(Pb); if (bi !== this.beatIdx) { this.beatIdx = bi; this.pulse = 1; }
    this.pulse = Math.max(0, this.pulse - dt * 4);

    // sustained beam ticks on 8th notes
    if (this.beamHold) {
      const t8 = Math.floor(Pb * 2);
      if (t8 > this.beamHold.lastTick) { this.beamHold.lastTick = t8; this.fireBeam('good', true); this.score += 20; sfx('tick'); }
    }
    if (this.shield && !this.shield.hold && Pb > this.shield.until) this.shield = null;
    if (this.shield && this.shield.hold && Pb > this.shield.until + 1) this.shield = null;

    // entities
    for (const e of this.ents) {
      if (e.type === 'wallgen') {
        if (!e.done && Pb >= e.at) { e.done = true; for (let k = 0; k < 12; k++) { const x = 0.04 + k * 0.083; if (Math.abs(x - e.gap) < 0.11) continue; this.addBullet(x, 0.02, [0, 1], 0.14, e.at, { r: 0.016 }); } }
        continue;
      }
      if (Pb < e.enter) { e.y = -0.25; continue; }
      const ey = easeOut(clamp((Pb - e.enter) / 1.2, 0, 1));
      if (e.type === 'drone') {
        const h = hop(Pb, 0.05, e.sway);
        e.x = e.hx + h.dx; e.y = lerp(-0.2, e.hy, ey) + h.dy;
        if (Pb > e.leave) e.y -= (Pb - e.leave) * 0.25;
        while (e.fires.length && e.fires[0] <= Pb) {
          const fb = e.fires.shift(); if (e.dead || Pb > e.leave) continue;
          if (e.aim === 'aim') this.addBullet(e.x, e.y, this.aimDir(e.x, e.y), 0.15, fb);
          else if (e.aim === 'spread') for (const a of [-0.38, 0, 0.38]) this.addBullet(e.x, e.y, this.angDir(a), 0.13, fb);
          else this.addBullet(e.x, e.y, [0, 1], 0.14, fb);
        }
        e.warn = e.fires.length > 0 && e.fires[0] - Pb < 0.5 && !e.dead;
        if (e.y < -0.3 && Pb > e.leave) e.gone = true;
      } else if (e.type === 'drummer') {
        const h = hop(Pb * 0.5, 0.04, 1);
        e.x = e.hx + h.dx; e.y = lerp(-0.2, e.hy, ey) + h.dy;
        if (Pb > e.leave) { e.y -= (Pb - e.leave) * 0.25; if (e.y < -0.3) e.gone = true; }
        while (e.fires.length && e.fires[0] <= Pb) {
          const fb = e.fires.shift(); if (e.dead || Pb > e.leave) continue;
          e.hitBeat = fb;
          // heavy note: lands where you stand now, exactly 2 beats later
          this.bullets.push({ kind: 'h', x: e.x, y: e.y, sx: e.x, sy: e.y + 0.04, tx: this.p.x, ty: this.p.y, b0: fb, arrive: fb + 2, r: 0.026, src: e });
        }
        e.warn = e.fires.length > 0 && e.fires[0] - Pb < 0.5 && !e.dead;
      } else if (e.type === 'totem') {
        const h = hop(Pb * 0.5, 0.03, 1);
        e.x = e.hx + h.dx; e.y = lerp(-0.25, e.hy, ey) + h.dy;
        this.runHostFires(e, Pb);
        if (Pb > e.leaveAt) { e.y -= (Pb - e.leaveAt) * 0.3; if (e.y < -0.3) e.gone = true; }
      } else if (e.type === 'boss') {
        if (e.dead) continue;
        const h = hop(Pb * 0.5, 0.14, 1);
        e.x = e.hx + h.dx; e.y = lerp(-0.3, e.hy, ey) + h.dy * 2;
        this.runHostFires(e, Pb);
      }
    }
    this.ents = this.ents.filter(e => !e.gone && !(e.dead && e.type !== 'boss') && !(e.type === 'wallgen' && e.done));

    // echoes
    const GWb = this.D.G / this.spb;
    for (const ex of this.echoes) {
      if (ex.done) continue;
      for (const n of ex.notes) {
        if (n.s === 0 && Pb > n.rt + GWb + 0.05) this.noteMiss(n);
        else if (n.s === 1 && Pb > n.rt + n.l + 0.05) { this.holdDone(n); for (const k of ['a', 'b']) if (this.holding[k] === n) this.holding[k] = null; }
      }
      const last = ex.notes[ex.notes.length - 1];
      if (ex.notes.every(n => n.s === 2 || n.s === -1) && Pb > last.rt + last.l + 0.1) this.echoFinish(ex);
    }
    this.echoes = this.echoes.filter(ex => !ex.done || Pb < ex.notes[0].rt + 6);

    // bullets
    const pr = 0.02;
    for (const bl of this.bullets) {
      if (bl.kind === 'p') { // player homing notes
        let tgt = null, best = 9;
        for (const e of this.ents) { if (!(e.type === 'drone' || e.type === 'boss') || e.dead || Pb < e.enter) continue; const d = Math.hypot(e.x - bl.x, e.y - bl.y); if (d < best) { best = d; tgt = e; } }
        if (tgt) { const dx = tgt.x - bl.x, dy = tgt.y - bl.y, m = Math.hypot(dx, dy) || 1; bl.vx = lerp(bl.vx, dx / m * 1.3, dt * 6); bl.vy = lerp(bl.vy, dy / m * 1.3, dt * 6); if (m < tgt.r + 0.01) { this.damage(tgt, tgt.type === 'boss' ? bl.dmg * 0.35 : bl.dmg); bl.dead = true; } }
        bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt; if (bl.life < 0) bl.dead = true; continue;
      }
      if (bl.kind === 'h') {
        if (bl.ref) { // reflected back to its drummer within one beat
          const u = clamp((Pb - bl.refFrom) / 0.75, 0, 1), s = bl.src;
          bl.x = lerp(bl.rx, s.x, u); bl.y = lerp(bl.ry, s.y, u);
          if (u >= 1) { bl.dead = true; if (!s.dead) this.damage(s, s.type === 'boss' ? 12 : 99); }
          continue;
        }
        const u = clamp((Pb - bl.b0) / (bl.arrive - bl.b0), 0, 1), e = u * u * (3 - 2 * u) * 0.25 + u * 0.75;
        bl.x = lerp(bl.sx, bl.tx, e); bl.y = lerp(bl.sy, bl.ty, e);
        // lands on its beat, waits out the parry window, then explodes on the marker
        if (Pb >= bl.arrive + GWb) {
          bl.dead = true; this.fx.push({ k: 'burst', x: bl.tx, y: bl.ty, col: C.violet, n: 14, sp: 0.45 });
          if (Math.hypot((bl.tx - p.x) * ASPECT, bl.ty - p.y) < 0.075) this.hurt();
        }
        continue;
      } else {
        const tr = stepTravel(Pb - bl.b0) * bl.sp;
        bl.x = bl.x0 + bl.dx * tr; bl.y = bl.y0 + bl.dy * tr;
      }
      const dx = (bl.x - p.x) * ASPECT, dy = bl.y - p.y, dist = Math.hypot(dx, dy);
      if (this.shield && bl.kind !== 'h' && dist < this.shield.r) { bl.dead = true; this.fx.push({ k: 'burst', x: bl.x, y: bl.y, col: C.cyan, n: 3, sp: 0.2 }); this.score += 10; continue; }
      if (dist < bl.r + pr) { bl.dead = true; this.hurt(); }
    }
    this.bullets = this.bullets.filter(bl => !bl.dead && bl.y < 1.1 && bl.y > -0.35 && bl.x > -0.15 && bl.x < 1.15);

    if (this.bossDead ? Pb >= this.endBar * 4 : (!this.L.boss && Pb >= this.endBar * 4)) this.finish(true);
    if (this.cond.trackOver()) this.finish(!this.L.boss || this.bossDead);
  }
  runHostFires(e, Pb) {
    if (!e.fires) return;
    while (e.fires.length && e.fires[0].beat <= Pb) {
      const f = e.fires.shift(); if (e.dead) continue; e.mouthT = performance.now();
      const ox = e.x, oy = e.y + 0.06;
      if (f.kind === 'spread') { const n = 9, off = f.k % 2 ? 0.09 : 0; for (let k = 0; k < n; k++) this.addBullet(ox, oy, this.angDir((k - (n - 1) / 2) * 0.18 + off), 0.12, f.beat); }
      else if (f.kind === 'rain') { const x = 0.1 + ((f.k * 2.618) % 1) * 0.8; this.addBullet(x, 0.02, [0, 1], 0.16, f.beat, { r: 0.016 }); this.addBullet(1 - x, 0.02, [0, 1], 0.16, f.beat, { r: 0.016 }); }
      else if (f.kind === 'aim') { this.bullets.push({ kind: 'h', x: ox, y: oy, sx: ox, sy: oy, tx: this.p.x, ty: this.p.y, b0: f.beat, arrive: f.beat + 2, r: 0.03, src: e }); }
      else { const d = this.aimDir(ox, oy), a0 = Math.atan2(d[0] * ASPECT, d[1]); for (const da of [-0.25, 0, 0.25]) this.addBullet(ox, oy, this.angDir(a0 + da), 0.15, f.beat); }
    }
  }
  result() {
    const s = this.st, tot = s.perfect + s.good + s.off + s.eMiss;
    const acc = tot ? (s.perfect + 0.6 * s.good) / tot : 0;
    const rank = !this.win ? 'F' : acc > 0.92 ? 'S' : acc > 0.8 ? 'A' : acc > 0.65 ? 'B' : 'C';
    return { score: this.score, acc, rank, maxCombo: this.maxCombo, ...s, win: this.win };
  }
}
