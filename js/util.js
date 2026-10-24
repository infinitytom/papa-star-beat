// Shared helpers, palette, storage and the 2D cartoon-face drawer
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = t => 1 - (1 - t) * (1 - t);
export const TAU = Math.PI * 2;
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const C = {
  bg: '#15102e', bg2: '#241a4d', ink: '#f6f1ff', mute: '#aba2d8',
  pink: '#ff5c9a', cyan: '#44dcff', gold: '#ffd447', mint: '#72f0b0',
  red: '#ff5560', violet: '#9b7bff', skin: '#ffe7d1', orange: '#ff9a3d',
};
export const PIX = 'Silkscreen, ui-monospace, monospace';
export const DISP = '"ZCOOL KuaiLe","PingFang SC","Microsoft YaHei",sans-serif';

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

// note keys: 'z' = A (high tone), 'x' = B (low tone)
export const NOTE_COL = { z: C.gold, x: C.violet };

/**
 * Draws a cartoon face centred at (cx, cy) with radius R on a 2D context.
 * Used for 3D textures (player, monsters, boss) and story portraits.
 */
export function drawFace(g, cx, cy, R, o = {}) {
  const { skin = C.skin, mouth = 0, blink = 0, brow = 0, eye = '#2a1c3f', cheek = true, rim = null, rimW = 0.12, mood = 0 } = o;
  if (rim) { g.fillStyle = rim; g.beginPath(); g.arc(cx, cy, R * (1 + rimW), 0, TAU); g.fill(); }
  g.fillStyle = skin; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  if (cheek) { g.fillStyle = 'rgba(255,92,154,0.35)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * R * 0.55, cy + R * 0.18, R * 0.14, R * 0.08, 0, 0, TAU); g.fill(); } }
  g.fillStyle = eye; g.strokeStyle = eye;
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(cx + s * R * 0.36, cy - R * 0.14, R * 0.12, Math.max(R * 0.025, R * 0.17 * (1 - blink)), 0, 0, TAU); g.fill();
    if (blink < 0.5) { g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + s * R * 0.36 + R * 0.04, cy - R * 0.2, R * 0.04, 0, TAU); g.fill(); g.fillStyle = eye; }
    if (brow) { g.lineWidth = R * 0.09; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + s * R * 0.56, cy - R * 0.46 + brow * R * 0.08); g.lineTo(cx + s * R * 0.18, cy - R * 0.38 - brow * R * 0.08); g.stroke(); }
  }
  const mh = R * (0.05 + 0.34 * mouth);
  if (mouth < 0.08 && mood > 0) {
    g.lineWidth = R * 0.07; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy + R * 0.22, R * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  } else {
    g.fillStyle = '#7a1f3d'; g.beginPath(); g.ellipse(cx, cy + R * 0.38, R * (0.2 + 0.07 * mouth), mh, 0, 0, TAU); g.fill();
    if (mouth > 0.35) { g.fillStyle = '#ff8fb5'; g.beginPath(); g.ellipse(cx, cy + R * 0.38 + mh * 0.45, R * 0.12, mh * 0.4, 0, 0, TAU); g.fill(); }
  }
}

export function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
