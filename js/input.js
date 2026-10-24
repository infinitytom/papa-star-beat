// Key bindings: every action can be rebound; two keys per action
import { store } from './util.js';

export const ACTIONS = [
  ['a', '攻击 A · 射击'], ['b', '攻击 B · 弹反'], ['bomb', '炸弹'],
  ['left', '左移'], ['right', '右移'], ['up', '上移'], ['down', '下移'], ['slow', '精细移动（按住）'],
  ['pause', '暂停'],
];
const DEF = {
  a: ['KeyZ', 'KeyJ'], b: ['KeyX', 'KeyK'], bomb: ['KeyC', 'KeyL'],
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  slow: ['ShiftLeft', 'ShiftRight'], pause: ['Escape', 'KeyP'],
};
const KEY = 'beatface.binds.v1';
export const binds = (() => { const b = store.get(KEY, null); const out = {}; for (const k in DEF) out[k] = (b && Array.isArray(b[k]) ? [...b[k], '', ''] : [...DEF[k]]).slice(0, 2); return out; })();
const save = () => store.set(KEY, binds);

export function actionsOf(code) { const r = []; for (const k in binds) if (binds[k].includes(code)) r.push(k); return r; }
export function rebind(action, slot, code) {
  for (const k in binds) binds[k] = binds[k].map(c => (c === code ? '' : c));
  binds[action][slot] = code; save();
}
export function resetBinds() { for (const k in DEF) binds[k] = [...DEF[k]]; save(); }

export function keyLabel(code) {
  if (!code) return '—';
  const m = { Space: '空格', Escape: 'Esc', ShiftLeft: '左Shift', ShiftRight: '右Shift', ControlLeft: '左Ctrl', ControlRight: '右Ctrl',
    AltLeft: '左Alt', AltRight: '右Alt', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Enter: 'Enter', Backquote: '`',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Tab: 'Tab' };
  if (m[code]) return m[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return '小键盘' + code.slice(6);
  return code;
}
export const label = action => keyLabel(binds[action][0] || binds[action][1]);

// actions currently held
export const held = new Set();
