// Level editor
// left: level settings · middle: bar timeline with mini lanes + checks · right: the selected bar
// Notes and fire beats are edited on click grids (16th-note cells); drag along a row to make a hold note.
import { $, esc, download, store, drawFace } from './util.js';
import { N, notesToStr, validateLevel, CHARS, levelLength } from './levels.js';
import { STYLES, decodeFile, initAudio, ac, SFX } from './audio.js';
import { FORMS, FORM } from './game.js';
import { saveMyLevel, uploadLevel, ONLINE } from './online.js';

let L = null, sel = 0, track = 'bars', hooks = {}, root = null, localBuffer = null, tab = 'basic';
let hist = [], hpos = -1, drag = null, shareUrl = '';
const DRAFT = 'papa.editor.draft.v1';
const FORM_NAMES = { line: '一字', v: 'V 字', zig: '锯齿', circle: '环形', pair: '双列' };
const AIM_NAMES = { down: '直下', aim: '瞄准', spread: '三向' };
const ATK_NAMES = { spread: '扇形', aim: '重音弹', rain: '弹雨' };
const LVL_NAMES = ['0 · 节拍器', '1 · 鼓+贝斯', '2 · 加琶音', '3 · 全编制'];
const storyToText = lines => (lines || []).map(([w, t]) => `${CHARS[w] ? CHARS[w].name : w}: ${t}`).join('\n');
const nameToKey = n => { n = n.trim(); for (const k in CHARS) if (CHARS[k].name === n || k === n) return k; return 'metro'; };
const textToStory = s => s.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.search(/[:：]/); return i > 0 ? [nameToKey(l.slice(0, i)), l.slice(i + 1).trim()] : ['metro', l]; });
const list = () => (track === 'bars' ? L.bars : L.boss ? L.boss.loop : []);
const clone = o => JSON.parse(JSON.stringify(o));

// ---------------- history & draft ----------------
function commit() {
  const snap = JSON.stringify(L);
  if (hist[hpos] === snap) return;
  hist = hist.slice(0, hpos + 1); hist.push(snap); if (hist.length > 120) hist.shift(); hpos = hist.length - 1;
  store.set(DRAFT, { at: Date.now(), level: L });
}
function undo() { if (hpos > 0) { hpos--; L = JSON.parse(hist[hpos]); sel = Math.min(sel, list().length - 1); render(); } }
function redo() { if (hpos < hist.length - 1) { hpos++; L = JSON.parse(hist[hpos]); sel = Math.min(sel, list().length - 1); render(); } }

export function openEditor(level, h) {
  L = clone(level); hooks = h; sel = 0; track = 'bars'; shareUrl = '';
  hist = []; hpos = -1; commit();
  root = $('#editor'); root.hidden = false; render();
}
export const editorBuffer = () => localBuffer;

// ---------------- templates ----------------
const TEMPLATES = {
  intro: { name: '开场 + 倒数', bars: [{ lvl: 0, text: '新关卡' }, { lvl: 0, count: true }] },
  warm: { name: '热身：不开火的靶子', bars: [{ lvl: 1, drones: { n: 5, form: 'line', fire: [], aim: 'down', life: 2, hp: 2 } }, { lvl: 1 }] },
  echo: { name: '回声 + 应答小节', bars: [{ lvl: 2, echo: { notes: N('0z 1z 2x') } }, { lvl: 2 }] },
  hold: { name: '长音回声', bars: [{ lvl: 2, echo: { notes: N('0z:2 3x') } }, { lvl: 2 }] },
  shoot: { name: '踩拍弹幕', bars: [{ lvl: 2, drones: { n: 5, form: 'v', fire: [1, 3], aim: 'aim', life: 2, hp: 3, alt: true } }, { lvl: 2 }] },
  drum: { name: '鼓手弹反', bars: [{ lvl: 2, drummer: { x: 0.5, fire: [0], life: 2, hp: 5 } }, { lvl: 2 }] },
  wall: { name: '子弹墙', bars: [{ lvl: 2, wall: { rows: [0, 2, 4, 6], gaps: [0.3, 0.7, 0.45, 0.6] } }, { lvl: 2 }] },
  boss: { name: 'Boss 段（4 小节）', loop: true, bars: [{ lvl: 3, echo: { host: 'boss', notes: N('0z 1z 2x') } }, { lvl: 3 }, { lvl: 3, bossAtk: 'spread' }, { lvl: 3, bossAtk: 'aim' }] },
};

// ---------------- checks ----------------
function checks() {
  const w = [], bars = L.bars;
  if (!L.title.trim()) w.push(['err', '还没有标题']);
  if (!(bars[0] && bars[0].lvl === 0) && !bars.slice(0, 2).some(b => b.count)) w.push(['warn', '开头最好留 1–2 个预备 / 倒数小节，玩家需要时间进入节奏']);
  const scan = (arr, name) => arr.forEach((b, i) => {
    if (b.echo) {
      const nx = arr[i + 1];
      if (!nx && name === '主线' && !L.boss) w.push(['err', `${name}第 ${i + 1} 小节的回声在最后，没有应答小节`]);
      else if (nx && (nx.echo || nx.wall || (nx.drones && nx.drones.fire.length) || nx.drummer)) w.push(['warn', `${name}第 ${i + 2} 小节是应答小节，里面有攻击会很难`]);
      const ts = {}; for (const [t] of b.echo.notes) { if (ts[t]) w.push(['warn', `${name}第 ${i + 1} 小节：同一拍有两个音符`]); ts[t] = 1; }
      for (const [t, , l] of b.echo.notes) if (t + l > 4) w.push(['warn', `${name}第 ${i + 1} 小节：长音超出了小节`]);
    }
    if (b.bossAtk && name === '主线') w.push(['warn', `主线第 ${i + 1} 小节的 Boss 攻击不会生效（只在 Boss 循环里有效）`]);
    if (b.drones && b.drones.fire.length > 4 && b.drones.aim === 'spread' && b.drones.n > 5) w.push(['warn', `${name}第 ${i + 1} 小节弹幕很密，简单难度会自动减半`]);
  });
  scan(bars, '主线');
  if (L.boss) {
    if (!L.boss.loop.length) w.push(['err', 'Boss 循环是空的']);
    if (!bars.some(b => b.bossIn)) w.push(['warn', '没有标记 Boss 登场的小节，会在主线最后一小节登场']);
    if (!L.boss.loop.some(b => b.echo && b.echo.host === 'boss')) w.push(['warn', 'Boss 循环里没有「由 Boss 来唱」的回声，Boss 只能靠激光慢慢打']);
    scan(L.boss.loop, 'Boss 循环');
  }
  if (L.music.type === 'url' && !L.music.url) w.push(['err', '外部音频还没填地址']);
  return w;
}

// ---------------- render ----------------
const field = (lbl, html, hint = '') => `<label class="f"><span>${lbl}</span>${html}</label>${hint ? `<p class="hint">${hint}</p>` : ''}`;
function lane(b) { // tiny 16-step strip for the bar list
  const cells = [];
  for (let c = 0; c < 16; c++) {
    const t = c / 4; let k = '';
    if (b.echo) for (const [nt, key, l] of b.echo.notes) { if (Math.abs(nt - t) < 0.01) k = key === 'x' ? 'nx' : 'nz'; else if (t > nt && t < nt + l) k = key === 'x' ? 'hx' : 'hz'; }
    if (!k && b.drones && b.drones.fire.some(f => Math.abs(f - t) < 0.01)) k = 'f';
    if (!k && b.drummer && b.drummer.fire.some(f => Math.abs(f - t) < 0.01)) k = 'r';
    if (!k && b.wall && b.wall.rows.some(f => Math.abs(f - t) < 0.01)) k = 'w';
    cells.push(`<i class="${k} ${c % 4 === 0 ? 'q' : ''}"></i>`);
  }
  return `<span class="lane">${cells.join('')}</span>`;
}
function chips(b) {
  const c = [];
  if (b.lvl === 0) c.push('<i>预备</i>'); if (b.count) c.push('<i>倒数</i>');
  if (b.drones) c.push(`<i class="d">无人机×${b.drones.n}</i>`);
  if (b.drummer) c.push('<i class="r">鼓手</i>');
  if (b.echo) c.push(`<i class="e">${b.echo.host === 'boss' ? 'Boss 唱' : '回声'}</i>`);
  if (b.wall) c.push('<i class="w">子弹墙</i>');
  if (b.bossIn) c.push('<i class="b">Boss 登场</i>');
  if (b.bossAtk) c.push(`<i class="b">${ATK_NAMES[b.bossAtk]}</i>`);
  if (b.text) c.push(`<i class="t">“${esc(b.text)}”</i>`);
  return c.join('');
}
function barRow(b, i, arr) {
  const resp = i > 0 && arr[i - 1].echo;
  return `<li class="${i === sel ? 'on' : ''} ${resp ? 'resp' : ''}" data-i="${i}"><b>${i + 1}</b>${lane(b)}<span class="chips">${chips(b) || (resp ? '<i class="m">应答</i>' : '<i class="m">空</i>')}</span></li>`;
}
function grid(kind, row, sel, cells = 16, lbl = '') {
  let h = `<div class="grid" data-grid="${kind}" data-row="${row}"><span class="gl">${lbl}</span>`;
  for (let c = 0; c < cells; c++) h += `<button class="gc ${c % 4 === 0 ? 'q' : ''} ${sel(c) || ''}" data-c="${c}" aria-label="${kind} ${c}"></button>`;
  return h + '</div>';
}
function notesGrid(b) {
  const at = (row, c) => { const t = c / 4; for (const [nt, k, l] of b.echo.notes) { if (k !== row) continue; if (Math.abs(nt - t) < 0.01) return 'on'; if (t > nt && t < nt + l - 0.01) return 'hold'; } return ''; };
  return `<div class="gridwrap">${grid('note', 'z', c => at('z', c), 16, 'A 高音')}${grid('note', 'x', c => at('x', c), 16, 'B 低音')}<div class="gnum"><span></span>${[1, 2, 3, 4].map(n => `<em>${n}</em>`).join('')}</div></div>`;
}
const beatGrid = (kind, arr, step = 0.25, lbl = '开火') => `<div class="gridwrap">${grid(kind, '-', c => (arr || []).some(f => Math.abs(f - c * step) < 0.01) ? 'on' : '', 16, lbl)}<div class="gnum"><span></span>${(step === 0.25 ? [1, 2, 3, 4] : [1, 3, 5, 7]).map(n => `<em>${n}</em>`).join('')}</div></div>`;

function render() {
  const keepScroll = root.querySelector('.bars') ? root.querySelector('.bars').scrollTop : 0;
  const arr = list(), b = arr[sel] || {}, m = L.music, isUrl = m.type === 'url';
  const len = levelLength(L), warns = checks();
  const tabs = [['basic', '基本'], ['music', '音乐'], ['boss', 'Boss'], ['story', '剧情']];
  root.innerHTML = `
  <div class="ed-top">
    <button class="btn" data-a="exit">← 返回</button>
    <input id="edTitle" value="${esc(L.title)}" maxlength="40" aria-label="关卡标题" placeholder="关卡标题">
    <div class="row">
      <button class="btn sm" data-a="undo" title="Ctrl+Z" ${hpos > 0 ? '' : 'disabled'}>↶ 撤销</button>
      <button class="btn sm" data-a="redo" title="Ctrl+Y" ${hpos < hist.length - 1 ? '' : 'disabled'}>↷ 重做</button>
      <button class="btn" data-a="test">▶ 从选中小节试玩</button>
      <button class="btn" data-a="testall">▶ 从头试玩</button>
      <button class="btn" data-a="save">保存</button>
      <button class="btn" data-a="export">导出</button>
      <label class="btn file">导入<input type="file" id="edImport" accept=".json,application/json" hidden></label>
      <button class="btn go sm" data-a="upload">上传到社区</button>
    </div>
  </div>
  <div class="ed-body">
    <section class="ed-meta">
      <div class="seg">${tabs.map(([k, t]) => `<button data-tab="${k}" aria-pressed="${tab === k}">${t}</button>`).join('')}</div>
      ${tab === 'basic' ? `
        ${field('作者', `<input id="edAuthor" value="${esc(L.author)}" maxlength="24" placeholder="你的名字">`)}
        ${field('简介', `<textarea id="edDesc" rows="2" maxlength="120" placeholder="一句话介绍这关的特色">${esc(L.desc)}</textarea>`)}
        ${field('BPM', `<input id="edBpm" type="number" min="60" max="220" step="1" value="${L.bpm}">`, '建议 100–140。越快越难。')}
        <div class="stat"><div><b>${L.bars.length}</b><span>主线小节</span></div><div><b>${Math.floor(len / 60)}:${String(Math.round(len % 60)).padStart(2, '0')}</b><span>主线时长</span></div><div><b>${[...L.bars, ...(L.boss ? L.boss.loop : [])].filter(x => x.echo).length}</b><span>回声</span></div><div><b>${L.boss ? '有' : '无'}</b><span>Boss</span></div></div>
        <h3>插入模板（加在选中小节后面）</h3>
        <div class="tpl">${Object.entries(TEMPLATES).map(([k, t]) => `<button class="btn sm" data-tpl="${k}" ${t.loop && !L.boss ? 'disabled title="先在 Boss 页启用 Boss"' : ''}>${t.name}</button>`).join('')}</div>
        ${store.get(DRAFT, null) ? '<button class="btn sm" data-a="draft">恢复上次自动保存的草稿</button>' : ''}` : ''}
      ${tab === 'music' ? `
        ${field('音乐', `<select id="edMusic"><option value="synth" ${!isUrl ? 'selected' : ''}>内置合成</option><option value="url" ${isUrl ? 'selected' : ''}>外部音频</option></select>`)}
        ${!isUrl ? field('风格', `<select id="edStyle">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}" ${m.style === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select>`, '每个小节的「音乐强度」决定加入哪些声部；回声小节会自动让出主旋律。') : `
          ${field('音频地址', `<input id="edUrl" value="${esc(m.url || '')}" placeholder="music/song.mp3 或 https://…">`)}
          ${field('首拍偏移', `<input id="edOffset" type="number" step="0.01" value="${m.offset || 0}">`, '音频里第 1 小节第 1 拍所在的秒数。')}
          ${field('署名', `<input id="edCredit" value="${esc(m.credit || '')}" placeholder="曲名 / 作者 / 许可协议">`)}
          <label class="btn file sm">用本机音频对拍<input type="file" id="edLocal" accept="audio/*" hidden></label>
          <p class="hint">${localBuffer ? '已载入本机音频，只用于试玩，不会上传。' : '外部音频需要能跨域访问；放进仓库的 music/ 目录最省事。上传到社区的关卡必须用公开的 https 地址。'}</p>`}` : ''}
      ${tab === 'boss' ? `
        <label class="ck"><input type="checkbox" id="edBoss" ${L.boss ? 'checked' : ''}> 启用 Boss</label>
        <p class="hint">主线放完后，Boss 循环里的小节会一直重复，直到 Boss 被打倒。</p>
        ${L.boss ? field('名字', `<input id="edBossName" value="${esc(L.boss.name)}" maxlength="20">`) + field('血量', `<input id="edBossHp" type="number" min="20" max="2000" value="${L.boss.hp}">`, '参考：官方 Boss 300。回声全对和弹反重音弹伤害最高，激光对 Boss 只有 35%。') : ''}` : ''}
      ${tab === 'story' ? `
        <p class="hint">每行一句：<code>角色: 台词</code>。角色：${Object.values(CHARS).map(c => c.name).join('、')}</p>
        ${field('开场', `<textarea id="edIntro" rows="6">${esc(storyToText(L.story.intro))}</textarea>`)}
        ${field('结尾', `<textarea id="edOutro" rows="5">${esc(storyToText(L.story.outro))}</textarea>`)}
        <div class="faces">${Object.entries(CHARS).map(([k, c]) => `<figure><canvas width="64" height="64" data-face="${k}"></canvas><figcaption>${c.name}</figcaption></figure>`).join('')}</div>` : ''}
      <h3>检查</h3>
      <ul class="checks">${warns.length ? warns.map(([k, t]) => `<li class="${k}">${k === 'err' ? '✕' : '!'} ${esc(t)}</li>`).join('') : '<li class="ok">✓ 没有发现问题</li>'}</ul>
    </section>
    <section class="ed-bars">
      <div class="row between"><div class="seg">
        <button data-t="bars" aria-pressed="${track === 'bars'}">主线 · ${L.bars.length}</button>${L.boss ? `<button data-t="loop" aria-pressed="${track === 'loop'}">Boss 循环 · ${L.boss.loop.length}</button>` : ''}
      </div><span class="legend"><i class="nz"></i>A <i class="nx"></i>B <i class="f"></i>开火 <i class="r"></i>鼓手 <i class="w"></i>墙</span></div>
      <ol class="bars">${arr.map((x, i) => barRow(x, i, arr)).join('')}</ol>
      <div class="row"><button class="btn sm" data-a="add">+ 小节</button><button class="btn sm" data-a="dup">复制</button><button class="btn sm" data-a="up">↑</button><button class="btn sm" data-a="down">↓</button><button class="btn sm" data-a="del">删除</button><span class="hint">↑↓ 选择 · Ctrl+D 复制 · Del 删除</span></div>
    </section>
    <section class="ed-bar">
      <div class="row between"><h3>第 ${sel + 1} 小节${track === 'loop' ? ' · Boss 循环' : ''}</h3><canvas id="edPrev" width="200" height="250" aria-label="小节预览"></canvas></div>
      ${field('音乐强度', `<select id="bLvl">${LVL_NAMES.map((t, i) => `<option value="${i}" ${b.lvl === i ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
      ${field('横幅文字', `<input id="bText" value="${esc(b.text || '')}" maxlength="40" placeholder="可选">`)}
      <label class="ck"><input type="checkbox" id="bCount" ${b.count ? 'checked' : ''}> 显示 1-2-3-4 倒数</label>
      <fieldset><legend><label class="ck"><input type="checkbox" data-ev="echo" ${b.echo ? 'checked' : ''}> 回声：本小节唱，下一小节应答</label></legend>${b.echo ? `
        ${notesGrid(b)}
        <div class="row"><button class="btn sm" data-a="listen">▶ 试听</button><button class="btn sm" data-a="clearnotes">清空</button>${track === 'loop' ? `<label class="ck"><input type="checkbox" data-k="echo.host" data-type="boss" ${b.echo.host === 'boss' ? 'checked' : ''}> 由 Boss 来唱</label>` : ''}</div>
        <p class="hint">点格子放音符，沿同一行拖动变成长按。每格是 1/4 拍。</p>
        ${field('文本', `<input data-k="echo.notes" data-type="notes" value="${esc(notesToStr(b.echo.notes))}">`)}` : ''}</fieldset>
      <fieldset><legend><label class="ck"><input type="checkbox" data-ev="drones" ${b.drones ? 'checked' : ''}> 无人机编队</label></legend>${b.drones ? `
        ${beatGrid('dfire', b.drones.fire)}
        ${field('数量', `<input data-k="drones.n" type="range" min="1" max="8" value="${b.drones.n}"><output>${b.drones.n}</output>`)}
        ${field('队形', `<select data-k="drones.form">${FORMS.map(f => `<option value="${f}" ${b.drones.form === f ? 'selected' : ''}>${FORM_NAMES[f] || f}</option>`).join('')}</select>`)}
        ${field('弹型', `<select data-k="drones.aim">${Object.entries(AIM_NAMES).map(([v, t]) => `<option value="${v}" ${b.drones.aim === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
        ${field('停留小节', `<input data-k="drones.life" type="number" min="1" max="8" value="${b.drones.life}">`)}
        ${field('血量', `<input data-k="drones.hp" type="number" min="1" max="20" value="${b.drones.hp}">`)}
        <label class="ck"><input type="checkbox" data-k="drones.alt" ${b.drones.alt ? 'checked' : ''}> 交替开火（每小节只有一半开火）</label>` : ''}</fieldset>
      <fieldset><legend><label class="ck"><input type="checkbox" data-ev="drummer" ${b.drummer ? 'checked' : ''}> 鼓手：重音弹 2 拍后落地，落地那拍按 B 弹反</label></legend>${b.drummer ? `
        ${beatGrid('rfire', b.drummer.fire, 0.25, '发射')}
        ${field('位置', `<input data-k="drummer.x" type="range" min="0.1" max="0.9" step="0.05" value="${b.drummer.x}"><output>${b.drummer.x}</output>`)}
        ${field('停留小节', `<input data-k="drummer.life" type="number" min="1" max="8" value="${b.drummer.life}">`)}
        ${field('血量', `<input data-k="drummer.hp" type="number" min="1" max="30" value="${b.drummer.hp}">`, '鼓手只怕弹反，弹回去一发就倒。')}` : ''}</fieldset>
      <fieldset><legend><label class="ck"><input type="checkbox" data-ev="wall" ${b.wall ? 'checked' : ''}> 子弹墙（可跨到下一小节）</label></legend>${b.wall ? `
        ${beatGrid('wall', b.wall.rows, 0.5, '发射')}
        <p class="hint">每格半拍，共 8 拍。下面依次是每排的缺口位置。</p>
        ${b.wall.rows.map((r, i) => field(`第 ${i + 1} 排`, `<input data-gap="${i}" type="range" min="0.1" max="0.9" step="0.05" value="${(b.wall.gaps || [])[i] ?? 0.5}">`)).join('')}` : ''}</fieldset>
      ${L.boss ? (track === 'bars'
        ? `<label class="ck"><input type="checkbox" id="bBossIn" ${b.bossIn ? 'checked' : ''}> Boss 在这一小节登场</label>`
        : field('Boss 攻击', `<select id="bBossAtk"><option value="">无</option>${Object.entries(ATK_NAMES).map(([v, t]) => `<option value="${v}" ${b.bossAtk === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`)) : ''}
      <div id="edMsg" class="hint"></div>
    </section>
  </div>
  <div class="ed-modal" id="edUp" hidden></div>`;
  const ol = root.querySelector('.bars'); if (ol) { ol.scrollTop = keepScroll; const on = ol.querySelector('li.on'); if (on && (on.offsetTop < ol.scrollTop || on.offsetTop > ol.scrollTop + ol.clientHeight - 40)) on.scrollIntoView({ block: 'nearest' }); }
  drawPreview(); drawFaces();
}
function drawFaces() {
  root.querySelectorAll('[data-face]').forEach(cv => { const c = CHARS[cv.dataset.face], g = cv.getContext('2d'); g.clearRect(0, 0, 64, 64); drawFace(g, 32, 34, 22, { skin: c.skin, rim: c.rim, brow: c.brow || 0, eye: c.eye, mood: 1, rimW: 0.14 }); });
}
function drawPreview() {
  const cv = $('#edPrev'); if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, b = list()[sel] || {};
  for (let y = 0; y < 10; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#ffe3ef' : '#fff7ea'; g.fillRect(x * W / 8, y * H / 10, W / 8, H / 10); }
  const dot = (x, y, r, c, s = '#5b3a5e') => { g.fillStyle = c; g.strokeStyle = s; g.lineWidth = 2; g.beginPath(); g.arc(x * W, y * H, r, 0, Math.PI * 2); g.fill(); g.stroke(); };
  if (b.wall) b.wall.rows.forEach((r, i) => { const gap = (b.wall.gaps || [])[i] ?? 0.5, y = 0.06 + i * 0.07; for (let k = 0; k < 12; k++) { const x = 0.04 + k * 0.083; if (Math.abs(x - gap) < 0.11) continue; dot(x, y, 3, '#ff4f8b', '#fff'); } });
  if (b.drones) { const n = b.drones.n; for (let i = 0; i < n; i++) { const p = FORM[b.drones.form](i, n); dot(p.x, p.y, 8, ['#8fd3ff', '#7fe0b6', '#b9a2ff', '#ffe066'][i % 4]); } }
  if (b.drummer) dot(b.drummer.x, 0.14, 11, '#ffb38a');
  if (b.echo && b.echo.host !== 'boss') dot(0.5, 0.22, 13, '#b9a2ff');
  if (b.bossIn || (b.echo && b.echo.host === 'boss') || b.bossAtk) dot(0.5, 0.25, 22, '#ff8fb8');
  dot(0.5, 0.84, 9, '#ff8fb8'); g.fillStyle = '#ff4f8b'; g.beginPath(); g.arc(W / 2, 0.84 * H, 2.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ff8fb8'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);
}
const msg = (t, err) => { const el = $('#edMsg'); if (el) { el.textContent = t; el.className = 'hint ' + (err ? 'err' : 'ok'); } };
const DEFAULTS = {
  drones: () => ({ n: 4, form: 'line', fire: [3], aim: 'down', life: 2, hp: 2, alt: false }),
  drummer: () => ({ x: 0.5, fire: [0], life: 2, hp: 5 }),
  echo: () => ({ notes: N('0z 1z 2x') }),
  wall: () => ({ rows: [0, 2], gaps: [0.3, 0.7] }),
};

// ---------------- events ----------------
function softRefresh() { // update list, checks and preview without rebuilding inputs (keeps focus)
  const arr = list(), ol = root.querySelector('.bars');
  if (ol) ol.innerHTML = arr.map((x, i) => barRow(x, i, arr)).join('');
  const ck = root.querySelector('.checks'); if (ck) { const w = checks(); ck.innerHTML = w.length ? w.map(([k, t]) => `<li class="${k}">${k === 'err' ? '✕' : '!'} ${esc(t)}</li>`).join('') : '<li class="ok">✓ 没有发现问题</li>'; }
  drawPreview();
}
function onInput(e) {
  const t = e.target, b = list()[sel];
  const v = t.value;
  switch (t.id) {
    case 'edTitle': L.title = v; break; case 'edAuthor': L.author = v; break; case 'edDesc': L.desc = v; break;
    case 'edBpm': L.bpm = Number(v) || 120; break; case 'edStyle': L.music.style = v; break;
    case 'edUrl': L.music.url = v.trim(); break; case 'edOffset': L.music.offset = Number(v) || 0; break; case 'edCredit': L.music.credit = v; break;
    case 'edBossName': L.boss.name = v; break; case 'edBossHp': L.boss.hp = Number(v) || 170; break;
    case 'edIntro': L.story.intro = textToStory(v); break; case 'edOutro': L.story.outro = textToStory(v); break;
    case 'bLvl': b.lvl = Number(v); break;
    case 'bText': if (v) b.text = v; else delete b.text; break;
    case 'bCount': if (t.checked) b.count = true; else delete b.count; break;
    case 'bBossAtk': if (v) b.bossAtk = v; else delete b.bossAtk; break;
    default:
      if (t.dataset.gap != null) { b.wall.gaps = b.wall.gaps || []; b.wall.gaps[Number(t.dataset.gap)] = Number(v); break; }
      if (!t.dataset.k) return;
      { const [ev, key] = t.dataset.k.split('.'), o = b[ev]; if (!o) return;
        const ty = t.dataset.type;
        if (ty === 'notes') { const n = N(v); if (n.length) { o.notes = n; t.classList.remove('bad'); const gw = t.closest('fieldset').querySelector('.gridwrap'); if (gw) gw.outerHTML = notesGrid(b); } else t.classList.add('bad'); }
        else if (ty === 'boss') { if (t.checked) o.host = 'boss'; else delete o.host; }
        else if (t.type === 'checkbox') o[key] = t.checked;
        else if (t.type === 'number' || t.type === 'range') { o[key] = Number(v); const out = t.nextElementSibling; if (out && out.tagName === 'OUTPUT') out.textContent = v; }
        else o[key] = v; }
  }
  softRefresh();
}
async function onChange(e) {
  const t = e.target;
  if (t.dataset.ev) { const b = list()[sel]; if (t.checked) b[t.dataset.ev] = DEFAULTS[t.dataset.ev](); else delete b[t.dataset.ev]; commit(); render(); return; }
  if (t.id === 'edMusic') { L.music = t.value === 'url' ? { type: 'url', url: '', offset: 0, credit: '' } : { type: 'synth', style: 'trance' }; commit(); render(); return; }
  if (t.id === 'edBoss') { L.boss = t.checked ? { name: 'BOSS', hp: 300, loop: clone(TEMPLATES.boss.bars) } : null; if (L.boss && !L.bars.some(b => b.bossIn)) L.bars[L.bars.length - 1].bossIn = true; if (!L.boss) track = 'bars'; commit(); render(); return; }
  if (t.id === 'bBossIn') { L.bars.forEach(x => delete x.bossIn); if (t.checked) list()[sel].bossIn = true; commit(); render(); return; }
  if (t.id === 'edImport' && t.files[0]) {
    try { L = validateLevel(JSON.parse(await t.files[0].text())); sel = 0; track = 'bars'; commit(); render(); msg('已导入'); } catch (err) { msg('导入失败：' + err.message, true); }
    return;
  }
  if (t.id === 'edLocal' && t.files[0]) {
    try { localBuffer = await decodeFile(t.files[0]); if (!L.music.url) L.music.url = 'music/' + t.files[0].name; render(); } catch (err) { msg('音频解码失败', true); }
    return;
  }
  commit(); render();
}
function toggleBeat(arr, beat) { const i = arr.findIndex(f => Math.abs(f - beat) < 0.01); if (i >= 0) arr.splice(i, 1); else { arr.push(beat); arr.sort((a, b) => a - b); } }
function onPointerDown(e) {
  const cell = e.target.closest('.gc'); if (!cell) return;
  e.preventDefault();
  const gridEl = cell.parentElement, kind = gridEl.dataset.grid, row = gridEl.dataset.row, c = Number(cell.dataset.c), b = list()[sel];
  if (kind === 'note') {
    const t = c / 4, notes = b.echo.notes;
    const hit = notes.findIndex(([nt, k, l]) => k === row && t >= nt - 0.01 && t < nt + Math.max(0.25, l) - 0.01);
    if (hit >= 0 && Math.abs(notes[hit][0] - t) < 0.01) drag = { note: notes[hit], start: c, row, moved: false, existed: true, idx: hit };
    else if (hit >= 0) { notes[hit][2] = Math.max(0, t - notes[hit][0] + 0.25); drag = { note: notes[hit], start: Math.round(notes[hit][0] * 4), row, moved: true }; }
    else { for (let i = notes.length - 1; i >= 0; i--) if (Math.abs(notes[i][0] - t) < 0.01) notes.splice(i, 1); const n = [t, row, 0]; notes.push(n); notes.sort((a, b2) => a[0] - b2[0]); drag = { note: n, start: c, row, moved: false, existed: false }; playNote(row); }
    gridEl.closest('.gridwrap').outerHTML = notesGrid(b); syncNoteText(b);
  } else {
    const o = kind === 'dfire' ? b.drones.fire : kind === 'rfire' ? b.drummer.fire : b.wall.rows;
    const beat = kind === 'wall' ? c / 2 : c / 4;
    toggleBeat(o, beat);
    if (kind === 'wall') { b.wall.gaps = b.wall.rows.map((r, i) => (b.wall.gaps || [])[i] ?? 0.5); commit(); render(); return; }
    cell.classList.toggle('on'); commit();
  }
  softRefresh();
}
function onPointerMove(e) {
  if (!drag) return;
  const el = document.elementFromPoint(e.clientX, e.clientY), cell = el && el.closest && el.closest('.gc');
  if (!cell || cell.parentElement.dataset.row !== drag.row) return;
  const c = Number(cell.dataset.c), b = list()[sel];
  const l = Math.max(0, (c - drag.start) / 4 + (c > drag.start ? 0.25 : 0));
  if (c !== drag.start) drag.moved = true;
  if (drag.note[2] !== l && drag.moved) { drag.note[2] = Math.min(l, 4 - drag.note[0]); const n0 = drag.note; b.echo.notes = b.echo.notes.filter(n => n === n0 || n[1] !== n0[1] || n[0] < n0[0] || n[0] >= n0[0] + n0[2]); const gw = root.querySelector('[data-grid="note"]').closest('.gridwrap'); gw.outerHTML = notesGrid(b); syncNoteText(b); softRefresh(); }
}
function onPointerUp() {
  if (!drag) return;
  const b = list()[sel];
  if (drag.existed && !drag.moved) { b.echo.notes.splice(b.echo.notes.indexOf(drag.note), 1); if (!b.echo.notes.length) b.echo.notes = N('0z'); root.querySelector('[data-grid="note"]').closest('.gridwrap').outerHTML = notesGrid(b); syncNoteText(b); softRefresh(); }
  drag = null; commit();
}
function syncNoteText(b) { const inp = root.querySelector('[data-type="notes"]'); if (inp) { inp.value = notesToStr(b.echo.notes); inp.classList.remove('bad'); } }
function playNote(k) { initAudio(); const t = ac.currentTime; (k === 'x' ? SFX.callx : SFX.callz)(t); }
function listen() {
  const b = list()[sel]; if (!b.echo) return; initAudio();
  const spb = 60 / L.bpm, t0 = ac.currentTime + 0.1;
  for (let k = 0; k < 4; k++) SFX.click(t0 + k * spb, k === 0);
  for (const [t, key, l] of b.echo.notes) { const at = t0 + t * spb; if (l > 0) (key === 'x' ? SFX.holdx : SFX.holdz)(at, l * spb); else (key === 'x' ? SFX.callx : SFX.callz)(at); }
}
function insertTemplate(k) {
  const tp = TEMPLATES[k];
  if (tp.loop) { if (!L.boss) return; track = 'loop'; }
  const arr = list(), at = Math.min(sel + 1, arr.length);
  arr.splice(at, 0, ...clone(tp.bars)); sel = at; commit(); render(); msg(`已插入「${tp.name}」`);
}
function uploadDialog() {
  const box = $('#edUp'), w = checks().filter(x => x[0] === 'err');
  box.hidden = false;
  if (!ONLINE) { box.innerHTML = `<div class="panel-in"><h2>上传到社区</h2><p>这个网站还没有接入在线服务（Supabase），暂时没法上传。</p><p class="hint">可以先「导出」JSON 文件发给朋友，对方在「选择关卡 → 导入 JSON」里就能玩。</p><div class="row"><button class="btn" data-a="closeup">知道了</button></div></div>`; return; }
  box.innerHTML = `<div class="panel-in"><h2>上传到社区</h2>
    ${field('标题', `<input id="upTitle" value="${esc(L.title)}" maxlength="40">`)}
    ${field('作者', `<input id="upAuthor" value="${esc(L.author)}" maxlength="24" placeholder="会显示在社区列表里">`)}
    ${field('简介', `<textarea id="upDesc" rows="2" maxlength="120">${esc(L.desc)}</textarea>`)}
    ${w.length ? `<ul class="checks">${w.map(([, t]) => `<li class="err">✕ ${esc(t)}</li>`).join('')}</ul>` : '<p class="hint ok">✓ 检查通过</p>'}
    <p class="hint">上传后所有人都能看到并游玩，暂时不能修改或删除。建议先完整试玩一遍。</p>
    <label class="ck"><input type="checkbox" id="upOk"> 关卡内容是我自己做的，音乐可以公开使用</label>
    <div class="row"><button class="btn go sm" data-a="doupload" ${w.length ? 'disabled' : ''}>确认上传</button><button class="btn" data-a="closeup">取消</button></div>
    <p class="hint" id="upMsg"></p></div>`;
}
async function doUpload(btn) {
  if (!$('#upOk').checked) { $('#upMsg').textContent = '请先勾选确认'; return; }
  L.title = $('#upTitle').value.trim() || L.title; L.author = $('#upAuthor').value.trim(); L.desc = $('#upDesc').value.trim();
  if (!L.author) { $('#upMsg').textContent = '请填写作者'; return; }
  if (L.music.type === 'url' && !/^https?:\/\//.test(L.music.url || '')) { $('#upMsg').textContent = '上传的关卡需要公开的 https 音频地址，或改用内置合成音乐'; return; }
  btn.disabled = true; $('#upMsg').textContent = '上传中…';
  try {
    const id = await uploadLevel(L); commit();
    shareUrl = location.origin + location.pathname + '?level=' + id;
    $('#edUp').innerHTML = `<div class="panel-in"><h2>上传成功！</h2><p>把这个链接发给朋友，打开就能直接玩：</p><input id="shareUrl" value="${esc(shareUrl)}" readonly><div class="row"><button class="btn go sm" data-a="copyshare">复制链接</button><button class="btn" data-a="closeup">完成</button></div><p class="hint" id="upMsg"></p></div>`;
  } catch (err) { $('#upMsg').textContent = '上传失败：' + err.message; btn.disabled = false; }
}
async function onClick(e) {
  const li = e.target.closest('.bars li'); if (li) { sel = Number(li.dataset.i); render(); return; }
  const tb = e.target.closest('[data-t]'); if (tb) { track = tb.dataset.t; sel = 0; render(); return; }
  const tt = e.target.closest('[data-tab]'); if (tt) { tab = tt.dataset.tab; render(); return; }
  const tp = e.target.closest('[data-tpl]'); if (tp) { insertTemplate(tp.dataset.tpl); return; }
  const a = e.target.closest('[data-a]'); if (!a) return;
  const arr = list();
  switch (a.dataset.a) {
    case 'exit': root.hidden = true; hooks.onExit && hooks.onExit(L); break;
    case 'undo': undo(); break; case 'redo': redo(); break;
    case 'add': arr.splice(sel + 1, 0, { lvl: arr[sel] ? arr[sel].lvl : 2 }); sel++; commit(); render(); break;
    case 'dup': arr.splice(sel + 1, 0, clone(arr[sel])); sel++; commit(); render(); break;
    case 'del': if (arr.length > 1) { arr.splice(sel, 1); sel = Math.max(0, sel - 1); commit(); render(); } break;
    case 'up': if (sel > 0) { [arr[sel - 1], arr[sel]] = [arr[sel], arr[sel - 1]]; sel--; commit(); render(); } break;
    case 'down': if (sel < arr.length - 1) { [arr[sel + 1], arr[sel]] = [arr[sel], arr[sel + 1]]; sel++; commit(); render(); } break;
    case 'listen': listen(); break;
    case 'clearnotes': list()[sel].echo.notes = N('0z'); commit(); render(); break;
    case 'draft': { const d = store.get(DRAFT, null); if (d) { L = d.level; sel = 0; track = 'bars'; commit(); render(); msg('已恢复草稿'); } break; }
    case 'test': case 'testall': {
      let lv; try { lv = validateLevel(L); } catch (err) { msg(err.message, true); return; }
      lv.id = 'test-' + Date.now();
      const start = a.dataset.a === 'testall' || track === 'loop' ? 0 : sel;
      root.hidden = true; hooks.onTest(lv, start, localBuffer); break;
    }
    case 'save': try { const lv = validateLevel(L); lv.id = L.id && L.id.startsWith('local-') ? L.id : 'local-' + Date.now().toString(36); L.id = lv.id; saveMyLevel(lv); msg('已保存到「我的关卡」'); } catch (err) { msg(err.message, true); } break;
    case 'export': try { const lv = validateLevel(L); download((lv.title || 'level') + '.papa.json', JSON.stringify(lv, null, 1)); msg('已导出 JSON 文件'); } catch (err) { msg(err.message, true); } break;
    case 'upload': uploadDialog(); break;
    case 'doupload': doUpload(a); break;
    case 'closeup': $('#edUp').hidden = true; break;
    case 'copyshare': { const inp = $('#shareUrl'); try { await navigator.clipboard.writeText(inp.value); $('#upMsg').textContent = '已复制'; } catch (err) { inp.select(); $('#upMsg').textContent = '请手动复制'; } break; }
  }
}
function onKey(e) {
  if (!root || root.hidden) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY' && !typing) { e.preventDefault(); redo(); return; }
  if (typing) return;
  const arr = list();
  if (e.code === 'ArrowDown') { e.preventDefault(); sel = Math.min(arr.length - 1, sel + 1); render(); }
  else if (e.code === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
  else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') { e.preventDefault(); arr.splice(sel + 1, 0, clone(arr[sel])); sel++; commit(); render(); }
  else if (e.code === 'Delete' && arr.length > 1) { arr.splice(sel, 1); sel = Math.max(0, sel - 1); commit(); render(); }
}
export function initEditor() {
  const el = $('#editor');
  el.addEventListener('input', onInput); el.addEventListener('change', onChange); el.addEventListener('click', onClick);
  el.addEventListener('pointerdown', onPointerDown); addEventListener('pointermove', onPointerMove); addEventListener('pointerup', onPointerUp);
  addEventListener('keydown', onKey);
}
