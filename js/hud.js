// 2D overlay on the pastel stage: candy cards for score / life / power, a beat track with upcoming notes,
// ribbon banners, bouncy judgement pops and a soft hurt vignette.
import { C, PIX, DISP, clamp, TAU } from './util.js';
import { label } from './input.js';

const P = { ink: '#5b3a5e', mute: '#9a7f9f', gold: '#ffad00', mint: '#22b07c', cyan: '#2a9fe0', pink: '#ff4f8b', red: '#ff3b5c', violet: '#8a5cff', line: '#f3d3e2' };
const FIX = { [C.gold]: P.gold, [C.mint]: P.mint, [C.cyan]: P.cyan, [C.pink]: P.pink, [C.red]: P.red, [C.mute]: P.mute, [C.violet]: P.violet, [C.orange]: '#ff8a3d' };
const hasCJK = t => /[一-鿿]/.test(t);

function TX(g, text, x, y, w = 5) { g.save(); g.lineJoin = 'round'; g.strokeStyle = '#ffffff'; g.lineWidth = w; g.strokeText(text, x, y); g.restore(); g.fillText(text, x, y); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function card(g, x, y, w, h, r = 16) {
  g.fillStyle = 'rgba(224,74,133,0.16)'; rr(g, x, y + 4, w, h, r); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.92)'; rr(g, x, y, w, h, r); g.fill();
}
function heart(g, x, y, s, on) {
  g.beginPath(); g.moveTo(x, y + s * 0.35); g.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.4, y - s, x, y - s * 0.35); g.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.4, x, y + s * 0.35);
  g.fillStyle = on ? P.pink : '#efe3ea'; g.fill();
  if (on) { g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(x - s * 0.38, y - s * 0.38, s * 0.16, s * 0.1, -0.6, 0, TAU); g.fill(); }
}
function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.48 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); }

let lastCombo = 0, comboAt = 0, mile = null, lastHp = 99, hurtAt = -9;

export function drawHUD(g, W, H, G, R, beat, safe) {
  const now = performance.now() / 1000;
  const T = 14 + safe.top, L = 16 + safe.left, Rr = W - 16 - safe.right, B = H - 14 - safe.bottom;
  const big = W > 720;
  if (G.combo !== lastCombo) { if (G.combo > lastCombo) comboAt = now; if (G.combo > 0 && G.combo % 10 === 0) mile = { n: G.combo, at: now }; lastCombo = G.combo; }
  if (G.hp < lastHp) hurtAt = now; lastHp = G.hp;

  // hurt vignette
  const hv = clamp(1 - (now - hurtAt) / 0.7, 0, 1);
  if (hv > 0) { const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); gr.addColorStop(0, 'rgba(255,59,92,0)'); gr.addColorStop(1, `rgba(255,59,92,${0.45 * hv})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }

  // score card
  const cw = big ? 200 : 158, ch = big ? 108 : 92;
  card(g, L, T, cw, ch);
  g.textAlign = 'left'; g.fillStyle = P.mute; g.font = `700 10px ${PIX}`; g.fillText('SCORE', L + 14, T + 20);
  g.fillStyle = P.ink; g.font = `700 ${big ? 25 : 19}px ${PIX}`; g.fillText(String(G.score).padStart(7, '0'), L + 13, T + (big ? 47 : 41));
  // power pips
  const py = T + (big ? 66 : 58);
  g.fillStyle = P.mint; g.font = `700 10px ${PIX}`; g.fillText('POWER', L + 14, py + 8);
  for (let i = 0; i < 4; i++) { g.fillStyle = i < G.power ? (G.power >= 4 ? P.gold : P.mint) : '#efe3ea'; rr(g, L + 66 + i * 22, py, 18, 10, 5); g.fill(); }
  g.fillStyle = '#efe3ea'; rr(g, L + 14, py + 18, cw - 28, 7, 4); g.fill();
  g.fillStyle = G.power >= 4 ? P.gold : P.mint; rr(g, L + 14, py + 18, Math.max(7, (cw - 28) * clamp(G.energy, 0, 1)), 7, 4); g.fill();
  // combo (bounces when it goes up)
  if (G.combo > 1) {
    const bounce = 1 + 0.35 * clamp(1 - (now - comboAt) / 0.15, 0, 1);
    g.save(); g.translate(L + 14, T + ch + 30); g.scale(bounce, bounce);
    g.fillStyle = P.gold; g.font = `700 ${big ? 24 : 18}px ${PIX}`; TX(g, String(G.combo), 0, 0, 6);
    const w = g.measureText(String(G.combo)).width; g.fillStyle = P.pink; g.font = `${big ? 16 : 13}px ${DISP}`; TX(g, ' 连击', w, -1, 5);
    g.restore();
  }

  // life & bombs card
  const hs = big ? 10 : 8, lw = Math.max(G.maxHp * hs * 2.3 + 22, 3 * 26 + 60);
  card(g, Rr - lw, T, lw, 66);
  for (let i = 0; i < G.maxHp; i++) heart(g, Rr - 18 - i * hs * 2.3, T + 24, hs, i < G.hp);
  for (let i = 0; i < 3; i++) { star(g, Rr - 20 - i * 26, T + 47, 9); g.fillStyle = i < G.bombs ? P.gold : '#efe3ea'; g.fill(); }
  g.fillStyle = P.mute; g.font = `9px ${PIX}`; g.textAlign = 'left'; g.fillText(`[${label('bomb')}]`, Rr - lw + 12, T + 51);

  // boss bar
  if (G.boss && !G.bossDead && beat >= G.boss.enter) {
    const bw = Math.min(W * 0.42, 420), bx = (W - bw) / 2, by = T + 30;
    card(g, bx - 10, by - 26, bw + 20, 46, 14);
    g.fillStyle = '#efe3ea'; rr(g, bx, by, bw, 10, 5); g.fill();
    const f = clamp(G.boss.hp / G.boss.max, 0, 1);
    const gr = g.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#ff8fb8'); gr.addColorStop(1, P.pink);
    g.fillStyle = gr; rr(g, bx, by, Math.max(10, bw * f), 10, 5); g.fill();
    g.font = `15px ${DISP}`; g.fillStyle = P.ink; g.textAlign = 'center'; g.fillText(G.boss.name, W / 2, by - 7);
  }

  drawTrack(g, W, G, beat, L, Rr, B);

  // ribbon banner
  const bn = G.banner;
  if (bn && beat >= bn.from && beat <= bn.to) {
    const a = Math.min(1, (beat - bn.from) * 2, (bn.to - beat) * 2), sz = clamp(W / 28, 17, 28);
    const slide = (1 - Math.min(1, (beat - bn.from) * 2)) * -40;
    g.save(); g.globalAlpha = a; g.translate(slide, 0);
    g.font = `${sz}px ${DISP}`; g.textAlign = 'center';
    const tw = g.measureText(bn.text).width, y = H * 0.3, bw = tw + 56, bh = sz * 1.7, x = W / 2 - bw / 2;
    g.fillStyle = '#e04a85';
    for (const s of [-1, 1]) { const ex = s < 0 ? x + 6 : x + bw - 6; g.beginPath(); g.moveTo(ex, y - bh * 0.5 + 8); g.lineTo(ex + s * 26, y - bh * 0.5 + 8); g.lineTo(ex + s * 16, y + 4); g.lineTo(ex + s * 26, y + bh * 0.5 - 2); g.lineTo(ex, y + bh * 0.5 - 2); g.fill(); }
    g.fillStyle = P.pink; rr(g, x, y - bh * 0.62, bw, bh, 12); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)'; rr(g, x + 6, y - bh * 0.62 + 4, bw - 12, bh * 0.3, 8); g.fill();
    g.fillStyle = '#ffffff'; g.fillText(bn.text, W / 2, y + sz * 0.12);
    g.restore();
  }
  // count-in
  const bar = Math.floor(beat / 4), info = G.barInfo(bar);
  if (info && info.count && beat >= 0) {
    const k = Math.floor(beat - bar * 4), f = beat - Math.floor(beat), sc = 1 + 0.5 * Math.max(0, 1 - f / 0.15);
    g.save(); g.globalAlpha = 1 - f * 0.8; g.translate(W / 2, H * 0.47); g.scale(sc, sc);
    g.fillStyle = k === 3 ? P.pink : P.ink; g.textAlign = 'center'; g.font = `700 86px ${PIX}`; TX(g, String(k + 1), 0, 30, 10);
    g.restore();
  }
  // combo milestone
  if (mile && now - mile.at < 0.9) {
    const t = now - mile.at, sc = 1 + 0.6 * Math.max(0, 1 - t / 0.12);
    g.save(); g.globalAlpha = 1 - Math.max(0, t - 0.5) / 0.4; g.translate(W / 2, H * 0.62); g.scale(sc, sc);
    g.textAlign = 'center'; g.font = `30px ${DISP}`; g.fillStyle = P.gold; TX(g, `${mile.n} 连击！`, 0, 0, 8); g.restore();
  }
  // judgement pops: pop in big, then float up
  for (const q of G.pops) {
    const s = R.project(q.x, q.y, 0.8); if (!s.vis) continue;
    const sc = 1 + 0.45 * Math.max(0, 1 - q.t / 0.1);
    g.save(); g.globalAlpha = 1 - Math.max(0, q.t - 0.45) / 0.35; g.translate(s.x, s.y - q.t * 34); g.scale(sc, sc);
    const sz = q.big ? 24 : 16;
    g.font = hasCJK(q.text) ? `${sz + 2}px ${DISP}` : `700 ${sz * 0.85}px ${PIX}`;
    g.textAlign = 'center'; g.fillStyle = FIX[q.col] || q.col; TX(g, q.text, 0, 0, 6); g.restore();
  }
  // hold progress ring
  for (const k of ['a', 'b']) {
    const n = G.holding[k]; if (!n) continue;
    const s = R.project(G.p.x, G.p.y, 0.5), prog = clamp((beat - n.rt) / n.l, 0, 1);
    g.lineCap = 'round'; g.strokeStyle = '#ffffff'; g.lineWidth = 9; g.beginPath(); g.arc(s.x, s.y, 36, 0, TAU); g.stroke();
    g.strokeStyle = n.k === 'x' ? P.violet : P.gold; g.lineWidth = 6; g.beginPath(); g.arc(s.x, s.y, 36, -Math.PI / 2, -Math.PI / 2 + prog * TAU); g.stroke();
  }
}

function drawTrack(g, W, G, beat, L, Rr, B) {
  const x0 = Math.max(L, W / 2 - 380), x1 = Math.min(Rr, W / 2 + 380), h = 46, y = B - h / 2;
  const jx = x0 + 42, ppb = Math.min(120, (x1 - jx) / 4.3);
  card(g, x0, y - h / 2, x1 - x0, h, h / 2);
  // judgement target pulses on every beat
  const f = beat - Math.floor(beat), pulse = Math.max(0, 1 - f / 0.2);
  g.fillStyle = '#fff2c2'; g.beginPath(); g.arc(jx, y, 15 + pulse * 3, 0, TAU); g.fill();
  g.strokeStyle = P.gold; g.lineWidth = 3; g.beginPath(); g.arc(jx, y, 15 + pulse * 3, 0, TAU); g.stroke();
  g.save(); rr(g, x0 + 4, y - h / 2 + 4, x1 - x0 - 8, h - 8, h / 2 - 4); g.clip();
  for (let b = Math.floor(beat) - 1; b < beat + 6; b++) {
    const x = jx + (b - beat) * ppb; if (x < jx - 30) continue;
    g.fillStyle = b % 4 === 0 ? P.ink : '#e2cdd9'; g.beginPath(); g.arc(x, y, b % 4 === 0 ? 4 : 3, 0, TAU); g.fill();
  }
  for (const ex of G.echoes) {
    for (const n of ex.notes) { // the call, shown faintly above
      const cx = jx + (n.t - beat) * ppb; g.fillStyle = n.k === 'x' ? 'rgba(138,92,255,0.45)' : 'rgba(255,173,0,0.5)';
      if (n.l > 0) { rr(g, cx, y - 15, n.l * ppb, 4, 2); g.fill(); }
      g.beginPath(); g.arc(cx, y - 13, 3.5, 0, TAU); g.fill();
    }
    for (const n of ex.notes) { // your answer
      const x = jx + (n.rt - beat) * ppb, c = n.s === 2 ? P.mint : n.s === -1 ? '#cdbfd3' : n.k === 'x' ? P.violet : P.gold;
      if (n.l > 0) { g.fillStyle = c; g.globalAlpha = 0.5; rr(g, x, y - 5, n.l * ppb, 10, 5); g.fill(); g.globalAlpha = 1; }
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y + 2, 13, 0, TAU); g.fill();
      g.fillStyle = c; g.beginPath(); g.arc(x, y + 2, 10.5, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.font = `700 10px ${PIX}`; g.textAlign = 'center'; g.fillText(n.k === 'x' ? label('b') : label('a'), x, y + 6);
    }
  }
  for (const b of G.bullets) {
    if (b.kind !== 'h' || b.ref) continue;
    const x = jx + (b.arrive - beat) * ppb;
    star(g, x, y + 2, 13); g.fillStyle = '#ffffff'; g.fill(); star(g, x, y + 2, 10); g.fillStyle = P.violet; g.fill();
  }
  g.restore();
  g.fillStyle = P.mute; g.font = `9px ${PIX}`; g.textAlign = 'left';
  TX(g, `A[${label('a')}]  B[${label('b')}]`, x0 + 14, y - h / 2 - 6, 4);
}
