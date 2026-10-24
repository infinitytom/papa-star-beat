// Boot, screens, input routing, story, results, settings
import { $, esc, C, store, drawFace, clamp, DISP } from './util.js';
import { binds, actionsOf, rebind, resetBinds, keyLabel, label, held, ACTIONS } from './input.js';
import { initAudio, ac, sfx, perfToAudio, outLat, Conductor, loadTrack, setVolumes, SFX, musicLevel, useContext } from './audio.js';
import { Game, DIFF } from './game.js';
import { Renderer3D } from './render3d.js';
import { drawHUD } from './hud.js';
import { OFFICIAL, CHARS, blankLevel, validateLevel, levelLength } from './levels.js';
import * as net from './online.js';
import { openEditor, initEditor } from './editor.js';
import { DAILY } from './daily.js';
// today's featured song rotates through the week's playlist
const todayIdx = () => { const d = new Date(), start = new Date(d.getFullYear(), 0, 0); return Math.floor((d - start) / 864e5) % DAILY.length; };

// ---------------- settings ----------------
const SKEY = 'beatface.settings.v1';
const S = Object.assign({ diff: 'normal', music: 1, sfx: 1, name: '', off: { key: 0, touch: 0.02 }, cleared: {} }, store.get(SKEY, {}));
const saveS = () => store.set(SKEY, S);

// ---------------- canvases ----------------
const glc = $('#gl'), hud = $('#hud'), hg = hud.getContext('2d');
let R = null;
try { R = new Renderer3D(glc); }
catch (e) { console.error(e); $('#fatal').hidden = false; }
let W = 0, H = 0, DPR = 1;
const probe = $('#safe');
let safe = { top: 0, right: 0, bottom: 0, left: 0 };
function resize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
  hud.width = W * DPR; hud.height = H * DPR; hud.style.width = W + 'px'; hud.style.height = H + 'px';
  if (R) R.resize(W, H);
  const cs = getComputedStyle(probe); safe = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
}
addEventListener('resize', resize); resize();

// ---------------- state ----------------
let mode = 'title', G = null, current = null, finishTimer = 0;
const cond = new Conductor();
const idle = { x: 0.5, y: 0.78, mouth: 0, roll: 0 };
const ptr = { on: false, x: 0.5, y: 0.8, drag: null };
const SCREENS = ['#title', '#select', '#story', '#pause', '#result', '#settings', '#calib', '#loading', '#support'];
function show(id) { for (const s of SCREENS) $(s).hidden = s !== id; $('#touch').hidden = !(id === null && mode === 'play' && matchMedia('(pointer: coarse)').matches); }

// ---------------- title ----------------
function nextChapter() { return OFFICIAL.findIndex(l => !S.cleared[l.id]); }
function renderTitle() {
  const k = nextChapter();
  $('#bStory').textContent = k === -1 ? '重玩教学故事' : k === 0 ? '教学故事 · 从这里开始' : `继续教学 · 第 ${k + 1} 章`;
  const T = DAILY[todayIdx()]; $('#bToday').innerHTML = `今日演奏 ♪ <small>${esc(T.title.replace(/^Day \d+ · /, ''))}</small>`;
  $('#onlineBadge').textContent = net.ONLINE ? '在线排行榜已连接' : '本地模式 · 配置 Supabase 后开启在线排行榜';
  $('#onlineBadge').className = 'badge ' + (net.ONLINE ? 'ok' : '');
}
function toTitle() { cond.stop(); G = null; mode = 'title'; renderTitle(); show('#title'); }

// ---------------- level select ----------------
let tab = 'daily', selLevel = null, community = [], commSort = 'new';
async function openSelect(t = tab) {
  tab = t; mode = 'select'; show('#select'); cond.stop(); G = null;
  document.querySelectorAll('#selTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  $('#commTools').hidden = tab !== 'community';
  $('#dailyNote').hidden = tab !== 'daily';
  const list = $('#levelList');
  if (tab === 'official') renderLevelList(OFFICIAL.map(l => ({ id: l.id, title: l.title, author: l.author, bpm: l.bpm, desc: l.desc, level: l })));
  else if (tab === 'daily') renderLevelList(DAILY.map((l, i) => ({ id: l.id, title: l.title + (i === todayIdx() ? ' · 今日' : ''), author: '★'.repeat(l.stars) + '☆'.repeat(4 - l.stars) + ' · 音乐 Tanner Helland', bpm: l.bpm, desc: l.desc, level: l })), '', todayIdx());
  else if (tab === 'mine') renderLevelList(net.myLevels().map(l => ({ id: l.id, title: l.title, author: l.author || '我', bpm: l.bpm, desc: l.desc, level: l })), '还没有自制关卡。去「关卡编辑器」做一个吧。');
  else {
    if (!net.ONLINE) { list.innerHTML = `<li class="empty">社区关卡需要配置 Supabase（README 里有 5 分钟步骤）。<br>现在可以用「导入 JSON」玩别人分享的关卡文件。</li>`; showDetail(null); return; }
    list.innerHTML = '<li class="empty">加载中…</li>';
    try { community = await net.listLevels({ sort: commSort, search: $('#commSearch').value }); renderLevelList(community.map(r => ({ id: 'c-' + r.id, title: r.title, author: r.author, bpm: r.bpm, desc: r.description, plays: r.plays, remote: r.id })), '还没有人上传关卡。'); }
    catch (e) { list.innerHTML = `<li class="empty">加载失败：${esc(e.message)}</li>`; }
  }
}
function renderLevelList(items, empty = '', pick = 0) {
  const list = $('#levelList');
  if (!items.length) { list.innerHTML = `<li class="empty">${empty}</li>`; showDetail(null); return; }
  list.innerHTML = items.map((it, i) => {
    const best = net.localBest(it.id, S.diff), cl = S.cleared[it.id];
    return `<li><button data-i="${i}" class="lv"><span class="lt">${esc(it.title)}</span><span class="lm">${esc(it.author || '匿名')} · ${Math.round(it.bpm)} BPM${it.plays != null ? ' · ' + it.plays + ' 次游玩' : ''}</span><span class="lr">${cl ? `<b class="rk">${cl}</b>` : ''}${best ? best.score.toLocaleString() : ''}</span></button></li>`;
  }).join('');
  list.onclick = e => { const b = e.target.closest('.lv'); if (!b) return; list.querySelectorAll('.lv').forEach(x => x.classList.toggle('on', x === b)); showDetail(items[Number(b.dataset.i)]); sfx('ui'); };
  const first = list.querySelectorAll('.lv')[pick] || list.querySelector('.lv'); first.classList.add('on'); showDetail(items[pick] || items[0]);
}
async function showDetail(it) {
  selLevel = it; const d = $('#detail');
  if (!it) { d.innerHTML = ''; return; }
  const L = it.level;
  d.innerHTML = `<h2>${esc(it.title)}</h2><p class="meta">${esc(it.author || '匿名')} · ${Math.round(it.bpm)} BPM${L ? ' · 约 ' + Math.round(levelLength(L)) + ' 秒' + (L.boss ? ' + Boss' : '') : ''}</p>
    <p>${esc(it.desc || '')}</p>
    ${L && L.music.type === 'url' && L.music.credit ? `<p class="meta">音乐：${esc(L.music.credit)}</p>` : ''}
    <div class="row">${diffSeg()}</div>
    <div class="row"><button class="btn go" id="bPlay">开始</button>
      ${tab === 'mine' ? '<button class="btn" id="bEdit">编辑</button><button class="btn" id="bDel">删除</button>' : ''}
      ${tab !== 'mine' ? '<button class="btn" id="bCopy">复制到编辑器</button>' : ''}
      ${it.id.startsWith('c-') ? '<button class="btn" id="bShare">复制分享链接</button>' : ''}</div><p class="hint" id="shareMsg"></p>
    <h3>排行榜 · ${DIFF[S.diff].name}</h3><ol class="board" id="board"><li class="empty">加载中…</li></ol>`;
  bindDiffSeg(d, () => showDetail(it));
  $('#bPlay').onclick = async () => { const lv = await resolveLevel(it); if (lv) startLevel(lv, { story: tab === 'official' || tab === 'daily' }); };
  if ($('#bEdit')) $('#bEdit').onclick = () => openEditorScreen(L);
  if ($('#bDel')) $('#bDel').onclick = e => { if (e.target.dataset.sure) { net.deleteMyLevel(it.id); openSelect('mine'); } else { e.target.dataset.sure = 1; e.target.textContent = '再点一次确认删除'; } };
  if ($('#bShare')) $('#bShare').onclick = async () => { const url = location.origin + location.pathname + '?level=' + it.id.slice(2); try { await navigator.clipboard.writeText(url); $('#shareMsg').textContent = '已复制：' + url; } catch (e) { $('#shareMsg').textContent = url; } };
  if ($('#bCopy')) $('#bCopy').onclick = async () => { const lv = await resolveLevel(it); if (lv) { const c = JSON.parse(JSON.stringify(lv)); c.id = 'local-' + Date.now().toString(36); c.title = lv.title + '（副本）'; openEditorScreen(c); } };
  renderBoard($('#board'), it.id);
}
async function resolveLevel(it) {
  if (it.level) return it.level;
  try { return await net.getLevel(it.remote); } catch (e) { $('#board').innerHTML = `<li class="empty">关卡读取失败：${esc(e.message)}</li>`; return null; }
}
async function renderBoard(el, levelId, hiName = null) {
  try {
    const { online, rows } = await net.topScores(levelId, S.diff);
    el.innerHTML = rows.length ? rows.map((r, i) => `<li class="${hiName && r.name === hiName ? 'me' : ''}"><b>${i + 1}</b><span>${esc(r.name)}</span><span class="rk">${r.rank}</span><span class="sc">${Number(r.score).toLocaleString()}</span></li>`).join('')
      : `<li class="empty">还没有成绩${online ? '' : '（本机）'}</li>`;
    if (!online) el.insertAdjacentHTML('beforeend', '<li class="note">本机排行榜</li>');
  } catch (e) { el.innerHTML = `<li class="empty">排行榜读取失败：${esc(e.message)}</li>`; }
}
const diffSeg = () => `<div class="seg" data-seg="diff">${Object.entries(DIFF).map(([k, v]) => `<button data-v="${k}" aria-pressed="${S.diff === k}">${v.name}</button>`).join('')}</div>`;
function bindDiffSeg(root, after) { root.querySelectorAll('[data-seg="diff"] button').forEach(b => b.onclick = () => { S.diff = b.dataset.v; saveS(); after && after(); }); }

// ---------------- story ----------------
let story = null;
function portrait(cv, who, mouth = 0) {
  const g = cv.getContext('2d'), w = cv.width, ch = CHARS[who] || CHARS.metro;
  g.clearRect(0, 0, w, w);
  if (ch.metro) { g.fillStyle = C.cyan; g.beginPath(); g.moveTo(w * 0.5, w * 0.04); g.lineTo(w * 0.94, w * 0.96); g.lineTo(w * 0.06, w * 0.96); g.fill(); g.strokeStyle = C.ink; g.lineWidth = w * 0.03; g.beginPath(); g.moveTo(w * 0.5, w * 0.9); g.lineTo(w * 0.5 + Math.sin(performance.now() / 300) * w * 0.25, w * 0.15); g.stroke(); }
  drawFace(g, w / 2, w * 0.58, w * 0.32, { skin: ch.skin, rim: ch.rim, brow: ch.brow || 0, eye: ch.eye, mouth, rimW: 0.14, mood: mouth < 0.1 ? 1 : 0 });
}
function runStory(lines) {
  return new Promise(res => {
    if (!lines || !lines.length) return res();
    initAudio(); story = { lines, i: 0, shown: 0, done: res, last: 0 }; mode = 'story'; show('#story'); storyLine();
  });
}
function storyLine() { const [who] = story.lines[story.i]; story.shown = 0; $('#stName').textContent = (CHARS[who] || CHARS.metro).name; $('#stName').style.color = (CHARS[who] || CHARS.metro).rim; }
function storyNext() {
  if (!story) return;
  const text = story.lines[story.i][1];
  if (story.shown < text.length) { story.shown = text.length; return; }
  story.i++; sfx('ui');
  if (story.i >= story.lines.length) { const d = story.done; story = null; d(); return; }
  storyLine();
}
function storyTick(dt) {
  if (!story) return;
  const [who, text] = story.lines[story.i];
  const prev = Math.floor(story.shown); story.shown = Math.min(text.length, story.shown + dt * 32);
  if (Math.floor(story.shown) > prev && Math.floor(story.shown) % 2 === 0) sfx('talk');
  $('#stText').textContent = text.slice(0, Math.floor(story.shown));
  const talking = story.shown < text.length;
  portrait($('#stFace'), who, talking ? (Math.sin(performance.now() / 60) > 0 ? 0.6 : 0.1) : 0);
}

// ---------------- play ----------------
async function startLevel(level, opts = {}) {
  initAudio(); setVolumes(S.music, S.sfx); cond.stop(); clearTimeout(finishTimer);
  let buffer = opts.buffer || null;
  current = { level, ...opts };
  if (level.music.type === 'url' && !buffer) {
    mode = 'loading'; show('#loading'); $('#loadMsg').textContent = '加载音乐…'; $('#loadBtns').hidden = true;
    try { buffer = await loadTrack(level.music.url); }
    catch (e) {
      $('#loadMsg').textContent = '音乐加载失败（' + e.message + '）。外部音频需要允许跨域访问。'; $('#loadBtns').hidden = false;
      const ok = await new Promise(r => { $('#bLoadSynth').onclick = () => r(true); $('#bLoadBack').onclick = () => r(false); });
      if (!ok) return opts.fromEditor ? backToEditor() : openSelect();
      level = { ...level, music: { type: 'synth', style: 'trance' } }; current.level = level;
    }
  }
  current.buffer = buffer;
  if (opts.story && !opts.startBar && level.story.intro.length) await runStory(level.story.intro);
  G = new Game(level, cond, { diff: S.diff, startBar: opts.startBar || 0, buffer, offsets: S.off });
  G.begin(); mode = 'play'; show(null); net.addPlay(level.id);
}
function pause() { if (mode !== 'play' || G.over) return; mode = 'pause'; ac.suspend(); show('#pause'); $('#pauseEditor').hidden = !current.fromEditor; }
function resume() { if (mode !== 'pause') return; show(null); ac.resume().then(() => { mode = 'play'; show(null); }); }
function quitPlay() { cond.stop(); if (ac.state === 'suspended') ac.resume(); G = null; current && current.fromEditor ? backToEditor() : openSelect(); }
async function onFinish() {
  const res = G.result(), L = current.level;
  if (res.win && !current.fromEditor) { const order = 'SABCF'; const prev = S.cleared[L.id]; if (!prev || order.indexOf(res.rank) < order.indexOf(prev)) S.cleared[L.id] = res.rank; saveS(); }
  if (res.win && current.story && L.story.outro.length) await runStory(L.story.outro);
  showResult(res);
}
function showResult(res) {
  mode = 'result'; show('#result');
  const L = current.level;
  $('#resTitle').textContent = res.win ? (L.boss ? 'BOSS 击破' : '关卡完成') : '失败';
  $('#resRank').textContent = res.rank; $('#resRank').style.color = res.win ? C.gold : C.red;
  $('#resStats').innerHTML = [['分数', res.score.toLocaleString()], ['节拍精度', (res.acc * 100).toFixed(1) + '%'], ['最大连击', res.maxCombo], ['PERFECT / GOOD / OFF', `${res.perfect} / ${res.good} / ${res.off}`], ['回声命中 / 漏', `${res.eHit} / ${res.eMiss}`], ['弹反', res.parry], ['击落', res.kills]]
    .map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
  const idx = OFFICIAL.findIndex(l => l.id === L.id);
  const di = DAILY.findIndex(l => l.id === L.id);
  $('#bNext').hidden = !(res.win && ((idx >= 0 && idx < OFFICIAL.length - 1) || (di >= 0 && di < DAILY.length - 1)));
  $('#bNext').textContent = di >= 0 ? '下一天' : '下一章';
  $('#bNext').onclick = () => startLevel(di >= 0 ? DAILY[di + 1] : OFFICIAL[idx + 1], { story: true });
  $('#bResBack').textContent = current.fromEditor ? '回到编辑器' : '选关';
  const testRun = current.fromEditor || L.id.startsWith('test-');
  $('#submitBox').hidden = !res.win || testRun;
  $('#resName').value = S.name;
  $('#subMsg').textContent = '';
  const submit = async () => {
    const name = $('#resName').value.trim(); if (!name) { $('#subMsg').textContent = '先填一个名字'; return; }
    S.name = name; saveS(); $('#bSubmit').disabled = true;
    try { const on = await net.submitScore({ levelId: L.id, diff: S.diff, name, ...res }); $('#subMsg').textContent = on ? '已上传到在线排行榜' : '已记录到本机排行榜'; }
    catch (e) { $('#subMsg').textContent = '上传失败：' + e.message; $('#bSubmit').disabled = false; }
    renderBoard($('#resBoard'), L.id, name);
  };
  $('#bSubmit').disabled = false; $('#bSubmit').onclick = submit;
  if (res.win && !testRun && S.name) submit(); else renderBoard($('#resBoard'), L.id);
}

// ---------------- editor ----------------
let editorLevelCache = null;
function openEditorScreen(level) { cond.stop(); G = null; mode = 'editor'; show(null); editorLevelCache = level; openEditor(level, { onTest: (lv, startBar, buffer) => { editorLevelCache = lv; startLevel(lv, { startBar, buffer, fromEditor: true }); }, onExit: () => openSelect('mine') }); }
function backToEditor() { cond.stop(); G = null; mode = 'editor'; show(null); $('#editor').hidden = false; }

// ---------------- settings ----------------
let capture = null;
function renderSettings() {
  $('#keyTable').innerHTML = ACTIONS.map(([a, n]) => `<div class="kr"><span>${n}</span>${[0, 1].map(s => `<button class="key ${capture && capture.a === a && capture.s === s ? 'cap' : ''}" data-a="${a}" data-s="${s}">${capture && capture.a === a && capture.s === s ? '按下新键…' : esc(keyLabel(binds[a][s]))}</button>`).join('')}</div>`).join('');
  $('#set_diff').innerHTML = Object.entries(DIFF).map(([k, v]) => `<button data-v="${k}" aria-pressed="${S.diff === k}">${v.name}</button>`).join('');
  $('#volMusic').value = S.music; $('#volSfx').value = S.sfx; $('#setName').value = S.name;
  $('#offInfo').textContent = `按键 ${Math.round(S.off.key * 1000)} ms · 鼠标/触屏 ${Math.round(S.off.touch * 1000)} ms`;
}
function openSettings() { mode = 'settings'; show('#settings'); renderSettings(); }
$('#keyTable').addEventListener('click', e => { const b = e.target.closest('.key'); if (!b) return; capture = { a: b.dataset.a, s: Number(b.dataset.s) }; renderSettings(); });
$('#set_diff').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.diff = b.dataset.v; saveS(); renderSettings(); });
$('#volMusic').addEventListener('input', e => { S.music = Number(e.target.value); saveS(); setVolumes(S.music, S.sfx); });
$('#volSfx').addEventListener('input', e => { S.sfx = Number(e.target.value); saveS(); setVolumes(S.music, S.sfx); });
$('#setName').addEventListener('input', e => { S.name = e.target.value.trim().slice(0, 16); saveS(); });
$('#bResetKeys').onclick = () => { resetBinds(); renderSettings(); };

// ---------------- calibration ----------------
const CAL = { t0: 0, data: {}, run: false, spb: 0.5 };
function openCalib() { mode = 'calib'; show('#calib'); $('#calRes').innerHTML = ''; $('#calMsg').textContent = `听 4 拍预备，然后在接下来的 12 拍上按 ${label('a')}（或点按屏幕）。`; }
function startCalib() {
  initAudio(); ac.resume(); CAL.t0 = ac.currentTime + 0.8; CAL.data = {}; CAL.run = true;
  for (let k = 0; k < 16; k++) SFX.click(CAL.t0 + k * CAL.spb, k < 4 ? k === 0 : true);
  $('#bCalGo').disabled = true; $('#calMsg').textContent = '预备……';
  setTimeout(finishCalib, (0.8 + 16.5 * CAL.spb) * 1000);
}
function calibInput(src, at) {
  if (!CAL.run) return;
  const t = at - outLat() - CAL.t0, k = Math.round(t / CAL.spb);
  if (k < 4 || k > 15) return;
  (CAL.data[src] = CAL.data[src] || []).push(t - k * CAL.spb); CAL.flash = performance.now();
}
function finishCalib() {
  CAL.run = false; $('#bCalGo').disabled = false; const rows = [];
  for (const [src, arr] of Object.entries(CAL.data)) {
    const nm = src === 'key' ? '键盘' : '鼠标/触屏';
    if (arr.length < 4) { rows.push([nm, `样本不足（${arr.length}）`]); continue; }
    const s = [...arr].sort((a, b) => a - b), med = s[s.length >> 1];
    S.off[src] = clamp(med, -0.15, 0.3); rows.push([nm, `${Math.round(med * 1000)} ms，抖动 ±${Math.round((s[Math.floor(s.length * 0.8)] - s[Math.floor(s.length * 0.2)]) * 500)} ms`]);
  }
  saveS();
  $('#calRes').innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('') || '<span>没有收到输入</span><span>—</span>';
  $('#calMsg').textContent = rows.length ? '已保存。正数表示你比拍子晚，游戏会自动补偿。' : '没有收到输入，再试一次？';
}

// ---------------- input routing ----------------
function onAction(a, down, ts, src) {
  const at = perfToAudio(ts);
  if (mode === 'play' && G && !G.over) {
    if (a === 'a' || a === 'b') { down ? G.press(a, at, src) : G.release(a, at, src); return; }
    if (!down) return;
    if (a === 'bomb') G.bomb(); else if (a === 'pause') pause();
    return;
  }
  if (!down) return;
  if (mode === 'pause' && a === 'pause') return resume();
  if (mode === 'story' && (a === 'a' || a === 'b')) return storyNext();
  if (mode === 'calib' && (a === 'a' || a === 'b')) return calibInput(src, at);
  if ((a === 'a' || a === 'b') && (mode === 'title' || mode === 'select')) { initAudio(); sfx(a === 'a' ? 'ansz' : 'ansx'); idle.mouth = 1; }
}
addEventListener('keydown', e => {
  if (capture) { e.preventDefault(); if (e.code !== 'Escape') rebind(capture.a, capture.s, e.code); capture = null; renderSettings(); return; }
  const tgt = e.target; const typing = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT');
  if (typing && mode !== 'play') return;
  if (mode === 'story' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); storyNext(); return; }
  const acts = actionsOf(e.code); if (!acts.length) return;
  if (mode === 'play' || mode === 'story' || mode === 'calib' || ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  for (const a of acts) { held.add(a); onAction(a, true, e.timeStamp, 'key'); }
});
addEventListener('keyup', e => { for (const a of actionsOf(e.code)) { held.delete(a); onAction(a, false, e.timeStamp, 'key'); } });
addEventListener('blur', () => { held.clear(); if (mode === 'play') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pause(); });

// mouse: move to steer, left = A, right = B · touch: drag to steer, buttons for A/B/bomb
glc.addEventListener('contextmenu', e => e.preventDefault());
glc.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { if (!R) return; const f = R.unproject(e.clientX, e.clientY); if (f) { ptr.on = true; ptr.x = f.x; ptr.y = f.y; } return; }
  const d = ptr.drag; if (!d || d.id !== e.pointerId) return;
  ptr.on = true; ptr.x = d.px + (e.clientX - d.sx) / W * 1.6; ptr.y = d.py + (e.clientY - d.sy) / H * 1.6;
});
glc.addEventListener('pointerdown', e => {
  initAudio();
  if (e.pointerType === 'mouse') { const a = e.button === 2 ? 'b' : e.button === 0 ? 'a' : null; if (a) { held.add('m' + a); onAction(a, true, e.timeStamp, 'touch'); } return; }
  const p = G ? G.p : idle; ptr.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, px: p.x, py: p.y }; glc.setPointerCapture(e.pointerId);
  if (mode === 'story') storyNext();
  if (mode === 'calib') calibInput('touch', perfToAudio(e.timeStamp));
});
glc.addEventListener('pointerup', e => {
  if (e.pointerType === 'mouse') { const a = e.button === 2 ? 'b' : e.button === 0 ? 'a' : null; if (a) { held.delete('m' + a); onAction(a, false, e.timeStamp, 'touch'); } return; }
  if (ptr.drag && ptr.drag.id === e.pointerId) ptr.drag = null;
});
glc.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') ptr.on = false; });
document.querySelectorAll('#touch [data-act]').forEach(b => {
  const a = b.dataset.act;
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); onAction(a, true, e.timeStamp, 'touch'); });
  b.addEventListener('pointerup', e => onAction(a, false, e.timeStamp, 'touch'));
  b.addEventListener('pointercancel', e => onAction(a, false, e.timeStamp, 'touch'));
});
$('#story').addEventListener('click', e => { if (!e.target.closest('button')) storyNext(); });

// ---------------- buttons ----------------
$('#bStory').onclick = () => { const k = nextChapter(); startLevel(OFFICIAL[k === -1 ? 0 : k], { story: true }); };
$('#bSelect').onclick = () => openSelect('daily');
$('#bToday').onclick = () => startLevel(DAILY[todayIdx()], { story: true });
$('#bEditor').onclick = () => openEditorScreen(blankLevel());
$('#bSettings').onclick = openSettings;
let supportBack = 'title';
function openSupport(from) { supportBack = from; mode = 'support'; show('#support'); }
$('#bSupport').onclick = () => openSupport('title');
$('#bResSupport').onclick = () => openSupport('result');
$('#bSupBack').onclick = () => { if (supportBack === 'result') { mode = 'result'; show('#result'); } else toTitle(); };
$('#bSetBack').onclick = () => { capture = null; toTitle(); };
$('#bCalib').onclick = openCalib;
$('#bCalGo').onclick = startCalib;
$('#bCalBack').onclick = openSettings;
$('#bSelBack').onclick = toTitle;
$('#selTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) openSelect(b.dataset.tab); });
$('#commSort').addEventListener('change', e => { commSort = e.target.value; openSelect('community'); });
$('#commSearch').addEventListener('change', () => openSelect('community'));
$('#importLevel').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const L = validateLevel(JSON.parse(await f.text())); L.id = 'local-' + Date.now().toString(36); net.saveMyLevel(L); openSelect('mine'); }
  catch (err) { $('#levelList').innerHTML = `<li class="empty">导入失败：${esc(err.message)}</li>`; }
  e.target.value = '';
});
$('#bResume').onclick = resume;
$('#bRestart').onclick = () => { cond.stop(); ac.resume(); startLevel(current.level, { ...current, story: false }); };
$('#bQuit').onclick = quitPlay;
$('#pauseEditor').onclick = quitPlay;
$('#bRetry').onclick = () => startLevel(current.level, { ...current, story: false });
$('#bResBack').onclick = () => (current.fromEditor ? backToEditor() : openSelect());
$('#bStSkip').onclick = () => { if (story) { const d = story.done; story = null; d(); } };
initEditor();

// ---------------- frame loop ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mode === 'story') storyTick(dt);
  document.body.classList.toggle('playing', mode === 'play');
  const move = {
    kx: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
    ky: (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0),
    slow: held.has('slow'), ptr: ptr.on, px: ptr.x, py: ptr.y,
  };
  if (move.kx || move.ky) ptr.on = false;
  let beat = now / 500;
  if (G && (mode === 'play' || mode === 'result' || mode === 'story' || mode === 'pause')) {
    if (mode === 'play') G.update(dt, move);
    beat = G.over ? (G.lastBeat ?? 0) : cond.on ? cond.beat() : 0;
    if (!G.over) G.lastBeat = beat;
    if (mode === 'play' && G.over && !finishTimer) finishTimer = setTimeout(() => { finishTimer = 0; if (G && G.over) onFinish(); }, 1300);
    if (R) R.render(G, mode === 'pause' ? 0 : dt, beat);
  } else {
    // idle stage: the ship bobs to its own beat
    if (move.kx || move.ky) { idle.x = clamp(idle.x + move.kx * dt, 0.05, 0.95); idle.y = clamp(idle.y + move.ky * dt * 0.8, 0.45, 0.95); }
    else if (move.ptr) { idle.x += (ptr.x - idle.x) * 0.15; idle.y += (clamp(ptr.y, 0.45, 0.95) - idle.y) * 0.15; }
    idle.mouth = Math.max(0, idle.mouth - dt * 4);
    if (R && mode !== 'editor') R.render(null, dt, beat, idle);
  }
  hg.setTransform(DPR, 0, 0, DPR, 0, 0); hg.clearRect(0, 0, W, H);
  if (G && R && (mode === 'play' || mode === 'pause')) drawHUD(hg, W, H, G, R, beat, safe);
  if (mode === 'calib' && CAL.run) {
    const t = (ac.currentTime - outLat() - CAL.t0) / CAL.spb, k = Math.floor(t), f = t - k;
    if (t > -0.5 && t < 16) {
      hg.strokeStyle = k < 4 ? C.mute : C.pink; hg.lineWidth = 4; hg.globalAlpha = 0.3 + (1 - Math.max(0, f)) * 0.7;
      hg.beginPath(); hg.arc(W / 2, H * 0.25, 36 + (Math.ceil(t) - t) * 50, 0, Math.PI * 2); hg.stroke(); hg.globalAlpha = 1;
      hg.fillStyle = performance.now() - (CAL.flash || 0) < 120 ? C.gold : C.ink; hg.beginPath(); hg.arc(W / 2, H * 0.25, 30, 0, Math.PI * 2); hg.fill();
    }
  }
  requestAnimationFrame(frame);
}
renderTitle(); show('#title');
requestAnimationFrame(frame);
// deep link: ?level=<community id> opens that level's page
(async () => {
  const id = new URLSearchParams(location.search).get('level');
  if (!id || !net.ONLINE) return;
  try {
    const L = await net.getLevel(id);
    tab = 'community'; mode = 'select'; show('#select');
    document.querySelectorAll('#selTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === 'community')));
    $('#commTools').hidden = false;
    renderLevelList([{ id: L.id, title: L.title, author: L.author, bpm: L.bpm, desc: L.desc, level: L }]);
  } catch (e) { console.warn(e); }
})();
window.__bf = { R, get G() { return G; }, get mode() { return mode; }, cond, S, startLevel, OFFICIAL, DAILY, toSupport: () => { cond.stop(); G = null; openSupport('title'); }, onAction, musicLevel, useContext, storyNext, get story() { return story; }, get ac() { return ac; } };
