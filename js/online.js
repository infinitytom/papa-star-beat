// Leaderboards & community levels. Uses Supabase's REST API when configured, localStorage otherwise.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { store } from './util.js';
import { validateLevel } from './levels.js';

export const ONLINE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const base = (SUPABASE_URL || '').replace(/\/+$/, '') + '/rest/v1/';
async function rq(path, opt = {}) {
    // publishable keys (sb_publishable_…) go in the apikey header only; legacy anon JWTs may also be sent as a bearer token
  const auth = SUPABASE_ANON_KEY.startsWith('eyJ') ? { Authorization: 'Bearer ' + SUPABASE_ANON_KEY } : {};
  const r = await fetch(base + path, { ...opt, headers: { apikey: SUPABASE_ANON_KEY, ...auth, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (e) {} throw new Error(m || 'HTTP ' + r.status); }
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const enc = encodeURIComponent;

// ---- scores ----
const LKEY = 'beatface.scores.v1';
const localAll = () => store.get(LKEY, {});
function localAdd(e) {
  const all = localAll(), k = e.level_id + '|' + e.diff;
  all[k] = [...(all[k] || []), e].sort((a, b) => b.score - a.score).slice(0, 20); store.set(LKEY, all);
}
export function localBest(levelId, diff) { const l = localAll()[levelId + '|' + diff]; return l && l[0] ? l[0] : null; }
export async function topScores(levelId, diff, n = 10) {
  const isOnlineLevel = !levelId.startsWith('local-') && !levelId.startsWith('test-');
  if (ONLINE && isOnlineLevel) {
    const rows = await rq(`scores?level_id=eq.${enc(levelId)}&diff=eq.${enc(diff)}&select=name,score,acc,rank,max_combo,created_at&order=score.desc&limit=${n}`);
    return { online: true, rows };
  }
  return { online: false, rows: (localAll()[levelId + '|' + diff] || []).slice(0, n) };
}
export async function submitScore(e) {
  const row = { level_id: e.levelId, diff: e.diff, name: String(e.name).slice(0, 16), score: Math.round(e.score), acc: Math.round(e.acc * 1000) / 1000, rank: e.rank, max_combo: e.maxCombo, created_at: new Date().toISOString() };
  localAdd(row);
  if (ONLINE && !e.levelId.startsWith('local-') && !e.levelId.startsWith('test-')) {
    const { created_at, ...body } = row;
    await rq('scores', { method: 'POST', body: JSON.stringify(body), headers: { Prefer: 'return=minimal' } });
    return true;
  }
  return false;
}

// ---- community levels ----
export async function listLevels({ sort = 'new', search = '' } = {}) {
  if (!ONLINE) return [];
  let q = `levels?select=id,title,author,description,bpm,plays,created_at&order=${sort === 'hot' ? 'plays.desc' : 'created_at.desc'}&limit=60`;
  if (search.trim()) q += `&title=ilike.${enc('*' + search.trim().replace(/[*,()]/g, '') + '*')}`;
  return rq(q);
}
export async function getLevel(id) {
  const rows = await rq(`levels?id=eq.${enc(id)}&select=id,data`);
  if (!rows || !rows[0]) throw new Error('关卡不存在');
  const L = validateLevel(rows[0].data); L.id = 'c-' + rows[0].id; return L;
}
export async function uploadLevel(level) {
  if (!ONLINE) throw new Error('还没有配置 Supabase（见 README）');
  const L = validateLevel(level);
  const data = { ...L, id: undefined };
  const rows = await rq('levels', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ title: L.title, author: L.author || '匿名', description: L.desc, bpm: L.bpm, data }) });
  return rows && rows[0] && rows[0].id;
}
export async function addPlay(id) { if (ONLINE && id.startsWith('c-')) try { await rq('rpc/add_play', { method: 'POST', body: JSON.stringify({ lid: id.slice(2) }) }); } catch (e) {} }

// ---- my levels (this browser) ----
const MKEY = 'beatface.mylevels.v1';
export const myLevels = () => store.get(MKEY, []);
export function saveMyLevel(L) { const all = myLevels().filter(x => x.id !== L.id); all.unshift(L); store.set(MKEY, all.slice(0, 50)); }
export function deleteMyLevel(id) { store.set(MKEY, myLevels().filter(x => x.id !== id)); }
