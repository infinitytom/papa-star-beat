// Story, built-in levels and the level format (validated for uploads)
//
// Level JSON:
// { id, title, author, desc, bpm, music:{type:'synth',style} | {type:'url',url,offset,credit},
//   story:{intro:[[who,text]], outro:[[who,text]]},
//   bars:[ { lvl, text, drones, drummer, echo:{notes:[[t,'z'|'x',len]]}, wall, bossIn, bossAtk } ],
//   boss: { name, hp, loop:[bar...] } | null }

// "0z 1z 2x 3z:1" → [[0,'z',0],[1,'z',0],[2,'x',0],[3,'z',1]]
export const N = s => s.trim().split(/\s+/).map(tok => { const m = tok.match(/^([\d.]+)([zx])(?::([\d.]+))?$/); return m ? [parseFloat(m[1]), m[2], m[3] ? parseFloat(m[3]) : 0] : null; }).filter(Boolean);
export const notesToStr = notes => (notes || []).map(([t, k, l]) => `${t}${k}${l ? ':' + l : ''}`).join(' ');

export const CHARS = {
  pai:   { name: '拍拍', skin: '#ffe7d1', rim: '#ff5c9a' },
  metro: { name: '梅特罗', skin: '#d8f6ff', rim: '#44dcff', metro: true },
  drum:  { name: '鼓手长咚咚', skin: '#ffe0bf', rim: '#ff9a3d', brow: 1 },
  boss:  { name: '合唱团长', skin: '#ffc2d6', rim: '#ffd447', brow: 1 },
  sil:   { name: '静默之王', skin: '#3b3463', rim: '#14102b', eye: '#aba2d8' },
};

const L1 = {
  id: 'official-1', title: '第一章 · 节拍星港', author: '官方', bpm: 110, music: { type: 'synth', style: 'chip' },
  desc: '学会在拍子上开火，听懂回声怪的歌。',
  story: {
    intro: [
      ['metro', '拍拍，醒醒！静默之王把银河的节拍偷走了，星港的灯一盏盏都灭了。'],
      ['pai', '……节拍？我只会跟着节拍张嘴。'],
      ['metro', '够用了！踩在拍子上按 Z 开火，打出的 PERFECT 能把节拍抢回来。'],
      ['metro', '还有回声怪：它先唱一段，你在下一小节照着节奏打回去。长音就按住别放。'],
    ],
    outro: [
      ['metro', '星港的灯亮了！听见了吗？远处有鼓声。'],
      ['pai', '咚、咚……是在叫我过去？'],
      ['metro', '是静默之王的鼓手团。准备好你的另一只手吧。'],
    ],
  },
  bars: [
    { lvl: 0, text: '第一章 · 节拍星港' },
    { lvl: 0, count: true },
    { lvl: 1, text: '在拍子上按 Z = PERFECT 激光', drones: { n: 5, form: 'line', fire: [], life: 4, hp: 2 } },
    { lvl: 1 },
    { lvl: 1, drones: { n: 4, form: 'zig', fire: [], life: 2, hp: 2 } },
    { lvl: 1 },
    { lvl: 2, text: '回声怪：先听它唱，下一小节照着打', echo: { notes: N('0z 1z 2z') } },
    { lvl: 2 },
    { lvl: 2, text: '敌人也踩着拍子开火，转移躲开', drones: { n: 5, form: 'v', fire: [3], aim: 'down', life: 4, hp: 2 } },
    { lvl: 2 },
    { lvl: 2, echo: { notes: N('0z 1z 2z 3z') } },
    { lvl: 2 },
    { lvl: 2, drones: { n: 4, form: 'line', fire: [1, 3], aim: 'aim', life: 2, hp: 3, alt: true } },
    { lvl: 2 },
    { lvl: 2, echo: { notes: N('0z 1z 1.5z 2z') } },
    { lvl: 2 },
    { lvl: 3, text: '连续 PERFECT 会提升火力', drones: { n: 6, form: 'circle', fire: [2], aim: 'spread', life: 2, hp: 3, alt: true } },
    { lvl: 3 },
    { lvl: 3, text: '长音：按住 Z，唱完再松开', echo: { notes: N('0z:2 3z') } },
    { lvl: 3 },
    { lvl: 3, drones: { n: 6, form: 'zig', fire: [1, 3], aim: 'aim', life: 2, hp: 3, alt: true } },
    { lvl: 3 },
    { lvl: 3, echo: { notes: N('0z 0.5z 1z 2z:1') } },
    { lvl: 3 },
    { lvl: 2, text: '子弹墙！找缺口，或按 C 放炸弹', wall: { rows: [0, 2, 4, 6], gaps: [0.25, 0.7, 0.4, 0.6] } },
    { lvl: 2 },
    { lvl: 3, drones: { n: 5, form: 'v', fire: [0, 2], aim: 'down', life: 2, hp: 3, alt: true } },
    { lvl: 3 },
    { lvl: 1, text: '星港 · 复明' },
  ],
  boss: null,
};

const L2 = {
  id: 'official-2', title: '第二章 · 鼓点星环', author: '官方', bpm: 120, music: { type: 'synth', style: 'trance' },
  desc: '学会用 X 弹反重音弹，Z 和 X 交替应答。',
  story: {
    intro: [
      ['drum', '咚！咚！谁准你在星环里乱放拍子的？'],
      ['metro', '小心，鼓手的重音弹会在 2 拍之后砸到你刚才站的位置。'],
      ['metro', '弹落到你身边的那一拍，按 X，把它弹回去！'],
      ['pai', 'Z 开火，X 弹反。高音按 Z，低音按 X。记住了。'],
    ],
    outro: [
      ['drum', '咚……我的鼓……原来也能打得这么开心？'],
      ['metro', '星环的节拍回来了。下一站是霓虹航道，那里全是反拍。'],
    ],
  },
  bars: [
    { lvl: 0, text: '第二章 · 鼓点星环' },
    { lvl: 0, count: true },
    { lvl: 1, text: '重音弹落地那一拍按 X 弹反', drummer: { x: 0.5, fire: [0], life: 4, hp: 5 } },
    { lvl: 1 },
    { lvl: 1 },
    { lvl: 1 },
    { lvl: 2, text: '高音按 Z，低音按 X', echo: { notes: N('0z 1x 2z 3x') } },
    { lvl: 2 },
    { lvl: 2, drones: { n: 5, form: 'line', fire: [3], aim: 'down', life: 2, hp: 2 }, drummer: { x: 0.25, fire: [0], life: 3, hp: 5 } },
    { lvl: 2 },
    { lvl: 2, echo: { notes: N('0x 1x 2z') } },
    { lvl: 2 },
    { lvl: 2, drones: { n: 5, form: 'v', fire: [1, 3], aim: 'aim', life: 2, hp: 3, alt: true }, drummer: { x: 0.75, fire: [2], life: 3, hp: 5 } },
    { lvl: 2 },
    { lvl: 3, echo: { notes: N('0z 0.5z 1x 2x') } },
    { lvl: 3 },
    { lvl: 3, text: 'X 在拍上也能张开护盾挡子弹', drones: { n: 6, form: 'circle', fire: [0, 2], aim: 'spread', life: 2, hp: 3, alt: true } },
    { lvl: 3 },
    { lvl: 3, echo: { notes: N('0x:1 2z 3z') } },
    { lvl: 3 },
    { lvl: 3, drummer: { x: 0.3, fire: [0], life: 4, hp: 6 }, drones: { n: 2, form: 'pair', fire: [1, 3], aim: 'aim', life: 2, hp: 3 } },
    { lvl: 3, drummer: { x: 0.7, fire: [2], life: 3, hp: 6 } },
    { lvl: 3 },
    { lvl: 3 },
    { lvl: 3, text: '快速交替！', echo: { notes: N('0z 0.5x 1z 1.5x 2z 3x') } },
    { lvl: 3 },
    { lvl: 2, wall: { rows: [0, 2, 4, 6], gaps: [0.7, 0.3, 0.55, 0.2] } },
    { lvl: 2 },
    { lvl: 1, text: '星环 · 复律' },
  ],
  boss: null,
};

const L3 = {
  id: 'official-3', title: '第三章 · 切分霓虹', author: '官方', bpm: 130, music: { type: 'synth', style: 'synthwave' },
  desc: '反拍、切分、长音混合，敌人在反拍上开火。',
  story: {
    intro: [
      ['metro', '霓虹航道的敌人都在反拍上开火，比你想的早半拍。'],
      ['pai', '那我就在它们开火之前先唱完。'],
      ['sil', '……（远处传来一片寂静。）'],
      ['metro', '信号很弱，但能确定：合唱团长就在航道尽头。'],
    ],
    outro: [
      ['metro', '前面就是合唱团长的舞台。它只允许自己唱歌。'],
      ['pai', '那就来一场对唱吧。'],
    ],
  },
  bars: [
    { lvl: 0, text: '第三章 · 切分霓虹' },
    { lvl: 0, count: true },
    { lvl: 2, drones: { n: 5, form: 'zig', fire: [1.5, 3.5], aim: 'down', life: 4, hp: 3, alt: true }, text: '反拍上的子弹' },
    { lvl: 2 },
    { lvl: 2 },
    { lvl: 2 },
    { lvl: 2, text: '切分音', echo: { notes: N('0z 1.5z 2z 3x') } },
    { lvl: 2 },
    { lvl: 3, drummer: { x: 0.5, fire: [0, 2], life: 3, hp: 7 }, drones: { n: 4, form: 'line', fire: [], life: 2, hp: 2 } },
    { lvl: 3 },
    { lvl: 3 },
    { lvl: 3, echo: { notes: N('0.5z 1.5z 2.5x 3x') } },
    { lvl: 3 },
    { lvl: 3, drones: { n: 6, form: 'circle', fire: [0.5, 2.5], aim: 'spread', life: 2, hp: 3, alt: true } },
    { lvl: 3 },
    { lvl: 3, echo: { notes: N('0x:1.5 2z 2.5z 3.5z') } },
    { lvl: 3 },
    { lvl: 2, wall: { rows: [0.5, 2.5, 4.5, 6.5], gaps: [0.2, 0.8, 0.35, 0.65] }, text: '反拍子弹墙' },
    { lvl: 2 },
    { lvl: 3, drummer: { x: 0.25, fire: [1], life: 4, hp: 6 }, drones: { n: 4, form: 'v', fire: [3.5], aim: 'aim', life: 3, hp: 3, alt: true } },
    { lvl: 3, drummer: { x: 0.75, fire: [3], life: 3, hp: 6 } },
    { lvl: 3 },
    { lvl: 3 },
    { lvl: 3, echo: { notes: N('0z 0.5x 1.5z 2x 2.5z 3.5x') } },
    { lvl: 3 },
    { lvl: 3, echo: { notes: N('0z:1 1.5x 2z:1.5') } },
    { lvl: 3 },
    { lvl: 1, text: '航道 · 通畅' },
  ],
  boss: null,
};

const L4 = {
  id: 'official-4', title: '终章 · 合唱团长', author: '官方', bpm: 126, music: { type: 'synth', style: 'boss' },
  desc: 'Boss 战。它唱，你答；唱完它会喷出弹幕。',
  story: {
    intro: [
      ['boss', '节拍？吵死了。在我的合唱团里，只有我能开口。'],
      ['pai', '那我就跟着你唱，一拍都不落。'],
      ['boss', '有趣。跟得上我的歌，再来谈节拍吧！'],
    ],
    outro: [
      ['boss', '……你接住了我每一个音。'],
      ['metro', '银河的节拍回来了！不过静默之王还在更远的地方。'],
      ['sil', '……（寂静里，有什么东西在等着。）'],
      ['pai', '下一首歌，由大家来写吧。'],
    ],
  },
  bars: [
    { lvl: 0, text: '终章 · 合唱团长' },
    { lvl: 0, count: true },
    { lvl: 3, bossIn: true, text: 'BOSS · 合唱团长' },
  ],
  boss: {
    name: '合唱团长', hp: 300,
    loop: [
      { lvl: 3, echo: { host: 'boss', notes: N('0z 1z 2x') } },
      { lvl: 3 },
      { lvl: 3, bossAtk: 'spread' },
      { lvl: 3, bossAtk: 'aim' },
      { lvl: 3, echo: { host: 'boss', notes: N('0z 1x 1.5x 2z:1') } },
      { lvl: 3 },
      { lvl: 3, bossAtk: 'rain', drones: { n: 3, form: 'line', fire: [], life: 1, hp: 2 } },
      { lvl: 3, bossAtk: 'spread' },
      { lvl: 3, echo: { host: 'boss', notes: N('0z 0.5z 1x 2z 3x') } },
      { lvl: 3 },
      { lvl: 3, bossAtk: 'aim', drummer: { x: 0.2, fire: [1], life: 2, hp: 5 } },
      { lvl: 3, bossAtk: 'spread' },
      { lvl: 3, echo: { host: 'boss', notes: N('0x:1 1.5z 2z 2.5x 3z') } },
      { lvl: 3 },
      { lvl: 3, bossAtk: 'rain' },
      { lvl: 3, bossAtk: 'aim' },
    ],
  },
};

export const OFFICIAL = [L1, L2, L3, L4];

export function blankLevel() {
  return {
    id: 'local-' + Date.now().toString(36), title: '我的关卡', author: '', desc: '', bpm: 120, music: { type: 'synth', style: 'trance' },
    story: { intro: [], outro: [] },
    bars: [{ lvl: 0, text: '我的关卡' }, { lvl: 0, count: true }, { lvl: 2, drones: { n: 4, form: 'line', fire: [3], aim: 'down', life: 2, hp: 2 } }, { lvl: 2 }, { lvl: 2, echo: { notes: N('0z 1z 2x') } }, { lvl: 2 }],
    boss: null,
  };
}

// ---------------- validation (for imports & community uploads) ----------------
const num = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const str = (v, n) => String(v ?? '').slice(0, n);
const beats = (arr, max = 8) => Array.isArray(arr) ? arr.slice(0, max).map(v => num(v, 0, 3.75, 0)).map(v => Math.round(v * 4) / 4) : [];
function cleanBar(b) {
  if (!b || typeof b !== 'object') return { lvl: 2 };
  const o = { lvl: num(b.lvl, 0, 3, 2) | 0 };
  if (b.text) o.text = str(b.text, 40);
  if (b.count) o.count = true;
  if (b.drones) { const d = b.drones; o.drones = { n: num(d.n, 1, 8, 4) | 0, form: ['line', 'v', 'zig', 'circle', 'pair'].includes(d.form) ? d.form : 'line', fire: beats(d.fire), aim: ['down', 'aim', 'spread'].includes(d.aim) ? d.aim : 'down', life: num(d.life, 1, 8, 2) | 0, hp: num(d.hp, 1, 20, 2), alt: !!d.alt }; }
  if (b.drummer) { const d = b.drummer; o.drummer = { x: num(d.x, 0.1, 0.9, 0.5), fire: beats(d.fire, 4), life: num(d.life, 1, 8, 4) | 0, hp: num(d.hp, 1, 30, 5) }; if (!o.drummer.fire.length) o.drummer.fire = [0]; }
  if (b.echo && Array.isArray(b.echo.notes)) {
    const notes = b.echo.notes.slice(0, 12).map(n => Array.isArray(n) ? [Math.round(num(n[0], 0, 3.75, 0) * 4) / 4, n[1] === 'x' ? 'x' : 'z', Math.round(num(n[2], 0, 4, 0) * 4) / 4] : null).filter(Boolean);
    if (notes.length) o.echo = { notes, ...(b.echo.host === 'boss' ? { host: 'boss' } : {}) };
  }
  if (b.wall) o.wall = { rows: beats(b.wall.rows, 4).length ? beats(b.wall.rows, 4) : [0, 2], gaps: (b.wall.gaps || []).slice(0, 4).map(g => num(g, 0.1, 0.9, 0.5)) };
  if (b.bossIn) o.bossIn = true;
  if (['spread', 'aim', 'rain'].includes(b.bossAtk)) o.bossAtk = b.bossAtk;
  return o;
}
export function validateLevel(L) {
  if (!L || typeof L !== 'object') throw new Error('不是关卡文件');
  const music = L.music && L.music.type === 'url' && /^https?:\/\/|^music\//.test(L.music.url || '')
    ? { type: 'url', url: str(L.music.url, 400), offset: num(L.music.offset, -10, 30, 0), credit: str(L.music.credit, 120) }
    : { type: 'synth', style: ['chip', 'trance', 'synthwave', 'boss'].includes(L.music && L.music.style) ? L.music.style : 'trance' };
  const lines = a => (Array.isArray(a) ? a : []).slice(0, 20).map(x => [CHARS[x[0]] ? x[0] : 'metro', str(x[1], 120)]);
  const bars = (Array.isArray(L.bars) ? L.bars : []).slice(0, 200).map(cleanBar);
  if (!bars.length) throw new Error('关卡没有小节');
  const out = {
    id: str(L.id || 'local-' + Date.now().toString(36), 60), title: str(L.title || '未命名关卡', 40), author: str(L.author, 24), desc: str(L.desc, 120),
    bpm: num(L.bpm, 60, 220, 120), music, story: { intro: lines(L.story && L.story.intro), outro: lines(L.story && L.story.outro) }, bars, boss: null,
  };
  if (L.boss && typeof L.boss === 'object') out.boss = { name: str(L.boss.name || 'BOSS', 20), hp: num(L.boss.hp, 20, 2000, 170), loop: (Array.isArray(L.boss.loop) ? L.boss.loop : []).slice(0, 64).map(cleanBar) };
  if (out.boss && !out.bars.some(b => b.bossIn)) out.bars[out.bars.length - 1].bossIn = true;
  return out;
}
export const levelLength = L => (L.bars.length * 4 * 60) / L.bpm;
