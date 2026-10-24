// three.js renderer — a pastel toy stage floating over a cloud sea.
// Everything sits on one height plane so what you see lines up with what gets hit;
// blob shadows on the stage mark each object's true position.
import * as THREE from 'three';
import { drawFace, clamp, lerp } from './util.js';

const FWW = 12, FDD = 15;      // field size in world units
const HY = 0.5;                // the one height every object and bullet lives at
export const toWorld = (x, y, h = HY, v = new THREE.Vector3()) => v.set((x - 0.5) * FWW, h, (y - 0.5) * FDD);
const col = c => new THREE.Color(c);

export const K = { // cute palette (3D)
  plum: '#5b3a5e', cream: '#fff7ea', pink: '#ff8fb8', hot: '#ff4f8b', sky: '#8fd3ff', mint: '#7fe0b6',
  lemon: '#ffe066', lav: '#b9a2ff', peach: '#ffb38a', violet: '#8a5cff', white: '#ffffff', blue: '#6cc4ff',
};

// 3-step toon ramp
const ramp = (() => { const d = new Uint8Array([90, 170, 255]); const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const toonMat = (c, e = 0) => new THREE.MeshToonMaterial({ color: col(c), gradientMap: ramp, emissive: col(c), emissiveIntensity: e });
const outlineMat = new THREE.MeshBasicMaterial({ color: col(K.plum), side: THREE.BackSide });
/** toon mesh with an inverted-hull outline */
function toon(geo, c, o = 1.07) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, toonMat(c)); g.add(m);
  const l = new THREE.Mesh(geo, outlineMat); l.scale.setScalar(o); g.add(l);
  g.userData.mat = m.material; return g;
}

class FaceTex {
  constructor(o = {}) {
    this.o = o; this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = 128;
    this.g = this.cv.getContext('2d'); this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.key = '';
    this.set(0, 0);
  }
  set(mouth, blink, extra = {}) {
    const k = Math.round(mouth * 8) + '|' + (blink > 0.5 ? 1 : 0) + '|' + (extra.flash ? 1 : 0) + '|' + (extra.mood || 0);
    if (k === this.key) return; this.key = k;
    const g = this.g; g.clearRect(0, 0, 128, 128);
    drawFace(g, 64, 64, 50, { ...this.o, mouth, blink, mood: extra.mood ?? 1, skin: extra.flash ? '#ffffff' : this.o.skin, eye: K.plum, rim: K.plum, rimW: 0.08 });
    this.tex.needsUpdate = true;
  }
}
function faceSprite(o, size) {
  const ft = new FaceTex(o);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft.tex, transparent: true, depthWrite: false }));
  sp.scale.set(size, size, 1); sp.userData.face = ft; sp.renderOrder = 2; return sp;
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const starPath = (g, cx, cy, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); };

function discTex(fill, core = '#ffffff') {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = K.plum; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.fillStyle = fill; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.fill();
    g.fillStyle = core; g.beginPath(); g.arc(64, 64, 25, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(46, 42, 12, 8, -0.6, 0, Math.PI * 2); g.fill();
  });
}
function starBulletTex(fill) {
  return canvasTex(128, 128, (g) => {
    g.lineJoin = 'round'; starPath(g, 64, 68, 58); g.fillStyle = K.plum; g.fill(); g.lineWidth = 10; g.strokeStyle = K.plum; g.stroke();
    starPath(g, 64, 68, 46); g.fillStyle = fill; g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 68, 13, 0, Math.PI * 2); g.fill();
  });
}
function noteTex(fill) {
  return canvasTex(128, 128, (g) => {
    g.font = 'bold 112px "Segoe UI Symbol","Apple Symbols","Noto Sans Symbols 2",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = K.plum; g.strokeText('♪', 64, 70); g.fillStyle = fill; g.fillText('♪', 64, 70);
  });
}
const beamTex = canvasTex(64, 4, (g) => { const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 4); });
const easeBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export class Renderer3D {
  constructor(canvas) {
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.outputColorSpace = THREE.SRGBColorSpace;
    const s = this.scene = new THREE.Scene();
    s.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7cc8ff'); gr.addColorStop(0.55, '#c7e6ff'); gr.addColorStop(1, '#ffd9ec'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    s.fog = new THREE.Fog('#ffe3f0', 40, 110);
    this.cam = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.camPos = new THREE.Vector3(0, 24, 7); this.camLook = new THREE.Vector3(0, 0, 0.6);
    s.add(new THREE.HemisphereLight('#ffffff', '#ffd0e6', 1.6));
    const dl = new THREE.DirectionalLight('#ffffff', 1.5); dl.position.set(-4, 14, 6); s.add(dl);

    // stage: pastel checker that scrolls one row per beat, candy-stripe rim
    this.stageU = { uScroll: { value: 0 }, uPulse: { value: 0 } };
    const stage = new THREE.Mesh(new THREE.PlaneGeometry(FWW + 1.2, FDD + 1.2), new THREE.ShaderMaterial({
      uniforms: this.stageU,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float uScroll; uniform float uPulse; varying vec2 vP;
        void main(){
          vec2 q = vec2(vP.x, -vP.y + uScroll*1.5) / 1.5;
          float ck = mod(floor(q.x) + floor(q.y), 2.0);
          vec3 a = vec3(1.0, 0.97, 0.92), b = vec3(1.0, 0.89, 0.94);
          vec3 c = mix(a, b, ck);
          float ex = 6.0 - abs(vP.x), ez = 7.5 - abs(vP.y), e = min(ex, ez);
          if (e < 0.0) { float st = step(0.5, fract((vP.x + vP.y) * 0.9)); c = mix(vec3(1.0,0.56,0.72), vec3(1.0), st); }
          c *= 1.0 + uPulse*0.06;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    stage.rotation.x = -Math.PI / 2; stage.position.y = -0.02; s.add(stage);
    const base = new THREE.Mesh(new THREE.BoxGeometry(FWW + 1.2, 1.2, FDD + 1.2), toonMat('#ffc2d9')); base.position.y = -0.63; s.add(base);
    // beat lamps along both rims: light up in sequence, one pair per beat
    this.lamps = [];
    const lg = new THREE.SphereGeometry(0.2, 12, 8);
    for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) { const m = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: col(K.lemon) })); m.position.set(sx * (FWW / 2 + 0.6), 0.15, -FDD / 2 + 1 + i * (FDD - 2) / 7); s.add(m); this.lamps.push(m); }

    // cloud sea + drifting clouds
    this.clouds = new THREE.Group(); s.add(this.clouds);
    const cg = new THREE.SphereGeometry(1, 16, 12), cm = toonMat('#ffffff');
    for (let i = 0; i < 46; i++) {
      const c = new THREE.Group(), n = 3 + (i % 3);
      for (let k = 0; k < n; k++) { const b = new THREE.Mesh(cg, cm); b.position.set((k - n / 2) * 1.3, Math.sin(k * 2.1) * 0.35, Math.cos(k * 1.7) * 0.5); b.scale.setScalar(1.1 + ((k * 7 + i) % 3) * 0.35); c.add(b); }
      const side = i % 2 ? 1 : -1;
      c.position.set(side * (11 + (i * 37 % 23)), -4 - (i % 4), -90 + (i * 53 % 110)); c.scale.setScalar(1.2 + (i % 5) * 0.3);
      c.userData.speed = 0.6 + (i % 4) * 0.2; this.clouds.add(c);
    }
    // floating sparkles in the sky
    const spark = canvasTex(64, 64, (g) => { g.fillStyle = '#fff'; starPath(g, 32, 32, 28); g.fill(); });
    const sg = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 160; i++) sp.push((Math.random() - 0.5) * 140, 8 + Math.random() * 40, -100 + Math.random() * 80);
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ map: spark, size: 1.4, transparent: true, depthWrite: false, color: '#fff6c2', fog: false }));
    s.add(this.sparks);

    this.world = new THREE.Group(); s.add(this.world);
    this.shadowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(91,58,94,0.45)'); gr.addColorStop(0.7, 'rgba(91,58,94,0.25)'); gr.addColorStop(1, 'rgba(91,58,94,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    this.player = this.makePlayer(); this.world.add(this.player);
    this.pShadow = this.makeShadow(0.7); this.world.add(this.pShadow);
    this.ents = new Map();

    // bullets: billboard candy sprites, one instanced batch per kind
    const qg = new THREE.PlaneGeometry(1, 1);
    this.bk = {};
    for (const [k, tex] of [['n', discTex(K.hot)], ['h', starBulletTex(K.violet)], ['p', noteTex(K.lemon)], ['r', discTex(K.mint)]]) {
      const m = new THREE.InstancedMesh(qg, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.02 }), k === 'n' ? 1600 : 300);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; m.renderOrder = 3; this.world.add(m); this.bk[k] = m;
    }
    this.noteTex = {};
    this.bshadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }), 1600);
    this.bshadow.count = 0; this.bshadow.frustumCulled = false; this.world.add(this.bshadow);

    // pools
    this.beams = []; this.rings = []; this.parts = [];
    const pg = new THREE.BufferGeometry(); this.PMAX = 2000;
    this.pPos = new Float32Array(this.PMAX * 3); this.pCol = new Float32Array(this.PMAX * 3);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const starTex = canvasTex(64, 64, (g) => { g.fillStyle = '#fff'; starPath(g, 32, 33, 29); g.fill(); });
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.55, map: starTex, vertexColors: true, transparent: true, depthWrite: false, alphaTest: 0.05 }));
    this.points.frustumCulled = false; this.world.add(this.points);
    this.holdBeam = this.makeBeamMesh(); this.holdBeam.visible = false; this.world.add(this.holdBeam);
    this.ringGeo = new THREE.RingGeometry(0.88, 1, 64);
    this.approach = [];
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 1; this.world.add(m); this.approach.push(m); }
    this.v = new THREE.Vector3(); this.flash = 0; this.shake = 0; this.trailT = 0;
    this.flashPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.flashPlane.renderOrder = 99; this.flashPlane.frustumCulled = false;
    this.flashPlane.onBeforeRender = () => {}; this.cam.add(this.flashPlane); this.flashPlane.position.set(0, 0, -0.2); s.add(this.cam);
  }
  resize(w, h) { this.w = w; this.h = h; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  makeShadow(size) { const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, size * 2), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m; }
  makePlayer() {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.userData.body = body;
    const b = toon(new THREE.SphereGeometry(0.5, 28, 20), K.pink); b.scale.set(1, 0.82, 1); body.add(b);
    for (const s of [-1, 1]) {
      const w = toon(new THREE.SphereGeometry(0.32, 16, 12), K.white, 1.1); w.scale.set(1.2, 0.35, 0.8); w.position.set(s * 0.62, 0.05, 0.1); w.rotation.z = s * 0.4; body.add(w); w.userData.side = s; (g.userData.wings = g.userData.wings || []).push(w);
      const ear = toon(new THREE.ConeGeometry(0.13, 0.3, 10), K.hot); ear.position.set(s * 0.24, 0.42, -0.1); ear.rotation.z = -s * 0.35; body.add(ear);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color: col(K.lemon) })); tail.position.set(0, -0.05, 0.55); body.add(tail); g.userData.eng = tail;
    const face = faceSprite({ skin: '#fff3e6' }, 0.78); face.position.set(0, 0.5, 0); g.add(face); g.userData.face = face;
    const hb = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), new THREE.MeshBasicMaterial({ color: col(K.hot), depthTest: false })); hb.rotation.x = -Math.PI / 2; hb.position.y = 0.9; hb.renderOrder = 5; g.add(hb); g.userData.hit = hb;
    return g;
  }
  makeBeamMesh() {
    const g = new THREE.Group(), geo = new THREE.PlaneGeometry(1, 1);
    const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: beamTex, color: '#ffffff', transparent: true, depthWrite: false }));
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: beamTex, color: '#ffffff', transparent: true, depthWrite: false }));
    for (const m of [glow, core]) { m.rotation.x = -Math.PI / 2; g.add(m); }
    core.position.y = 0.02; core.scale.x = 0.38; g.userData.glow = glow; g.userData.core = core; g.renderOrder = 2;
    g.userData.setColor = c => glow.material.color.set(c);
    g.userData.setOpacity = a => { glow.material.opacity = a; core.material.opacity = Math.min(1, a * 1.2); };
    return g;
  }
  makeEnt(e) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.userData.body = body;
    let faceSize = 0.6, faceY = 0.45, shadow = 0.6;
    if (e.type === 'drone') {
      const c = { '#44dcff': K.sky, '#72f0b0': K.mint, '#9b7bff': K.lav, '#ffd447': K.lemon }[e.col] || K.sky;
      const b = toon(new THREE.SphereGeometry(0.42, 20, 16), c); b.scale.set(1, 0.85, 1); body.add(b); g.userData.mat = b.userData.mat;
      const st = toon(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), K.plum, 1); st.position.y = 0.45; body.add(st);
      const ball = toon(new THREE.SphereGeometry(0.09, 10, 8), K.hot); ball.position.y = 0.62; body.add(ball);
      faceSize = 0.62; faceY = 0.42;
    } else if (e.type === 'drummer') {
      const d = toon(new THREE.CylinderGeometry(0.62, 0.62, 0.55, 24), K.peach); body.add(d); g.userData.mat = d.userData.mat;
      const top = toon(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 24), K.cream, 1.03); top.position.y = 0.3; body.add(top);
      for (const s of [-1, 1]) { const st = toon(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), K.lemon, 1.15); st.position.set(s * 0.45, 0.7, 0); st.rotation.z = s * 0.6; body.add(st); }
      faceSize = 0.75; faceY = 0.75; shadow = 0.8;
    } else if (e.type === 'totem') {
      const b = toon(new THREE.SphereGeometry(0.75, 24, 18), K.lav); b.scale.set(1, 0.95, 1); body.add(b); g.userData.mat = b.userData.mat;
      for (const s of [-1, 1]) { const ear = toon(new THREE.SphereGeometry(0.2, 12, 10), K.lav); ear.position.set(s * 0.55, 0.55, 0); body.add(ear); }
      faceSize = 1.15; faceY = 0.9; shadow = 1.0;
    } else if (e.type === 'boss') {
      const b = toon(new THREE.SphereGeometry(1.45, 32, 24), K.pink); b.scale.set(1, 0.9, 1); body.add(b); g.userData.mat = b.userData.mat;
      const crown = new THREE.Group(); crown.position.set(0, 0.95, -0.95); body.add(crown);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const c = toon(new THREE.ConeGeometry(0.22, 0.6, 10), K.lemon); c.position.set(Math.cos(a) * 0.55, 0.2, Math.sin(a) * 0.55); crown.add(c); }
      const band = toon(new THREE.TorusGeometry(0.6, 0.12, 8, 24), K.lemon); band.rotation.x = Math.PI / 2; crown.add(band);
      faceSize = 2.1; faceY = 1.55; shadow = 1.8;
    }
    const face = faceSprite(e.type === 'boss' ? { skin: '#ffe0ea', brow: 1 } : e.type === 'drummer' ? { skin: '#fff0dc', brow: 1 } : { skin: '#ffffff' }, faceSize);
    face.position.set(0, faceY, e.type === 'boss' ? 0.2 : 0); g.add(face); g.userData.face = face;
    g.userData.notes = new THREE.Group(); g.add(g.userData.notes);
    g.userData.shadow = this.makeShadow(shadow); this.world.add(g.userData.shadow);
    this.world.add(g); return g;
  }
  note(c) { return this.noteTex[c] || (this.noteTex[c] = noteTex(c)); }
  ensureNotes(g, ex, size) {
    const grp = g.userData.notes;
    if (grp.userData.ex === ex) return grp;
    while (grp.children.length) grp.remove(grp.children[0]);
    grp.userData.ex = ex; if (!ex) return grp;
    const n = ex.notes.length;
    ex.notes.forEach((nt, i) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.note('#e8dff5'), transparent: true, depthWrite: false })); const sc = nt.l > 0 ? 0.9 : 0.72; m.scale.set(sc, sc, 1); m.userData.base = sc; m.position.set((i - (n - 1) / 2) * size, 0.4, 0); m.renderOrder = 4; grp.add(m); });
    return grp;
  }

  // ---------------- fx ----------------
  consumeFx(G) {
    for (const f of G.fx) {
      if (f.k === 'beam') this.spawnBeam(f);
      else if (f.k === 'burst') { this.burst(f.x, f.y, f.col, f.n, f.sp); if (f.n >= 14) this.ring(f.x, f.y, 1.4, '#ffffff', 0.35, true); }
      else if (f.k === 'shield') this.ring(f.x, f.y, f.r * FDD, f.j === 'perfect' ? K.sky : K.mint, 0.4, true);
      else if (f.k === 'flash') this.flash = 1;
      else if (f.k === 'hurt') this.shake = 1;
    }
    G.fx.length = 0;
  }
  spawnBeam(f) {
    let m = this.beams.find(b => !b.visible);
    if (!m) { m = this.makeBeamMesh(); this.world.add(m); this.beams.push(m); }
    const c = f.j === 'perfect' ? K.lemon : f.j === 'good' ? K.sky : f.j === 'tick' ? K.mint : '#d9cfe8';
    m.userData.setColor(c); m.userData.t = 0; m.userData.life = f.j === 'tick' ? 0.12 : 0.26; m.visible = true;
    const len = 40, z0 = toWorld(f.x, f.y).z;
    m.userData.w = f.w * FWW * 1.15;
    m.scale.set(m.userData.w, 1, len); m.position.set((f.x - 0.5) * FWW, HY, z0 - len / 2 - 0.4);
    if (f.j === 'perfect') { this.ring(f.x, f.y - 0.035, 0.7, K.lemon, 0.22, true); this.burst(f.x, f.y - 0.04, K.lemon, 5, 0.25); }
  }
  ring(x, y, rad, c, life, grow = false) {
    let m = this.rings.find(r => !r.visible);
    if (!m) { m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; this.world.add(m); this.rings.push(m); }
    m.material.color.set(c); m.visible = true; m.userData = { t: 0, life, rad, grow };
    toWorld(x, y, HY, m.position); m.scale.setScalar(rad);
  }
  burst(x, y, c, n = 14, sp = 0.5) {
    const map = { '#ffd447': K.lemon, '#44dcff': K.sky, '#72f0b0': K.mint, '#9b7bff': K.lav, '#ff5c9a': K.pink, '#ff5560': K.hot, '#ff9a3d': K.peach };
    const cc = col(map[c] || c), w = toWorld(x, y, HY + 0.2);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.PMAX) this.parts.shift();
      const a = Math.random() * Math.PI * 2, v = sp * 12 * (0.3 + Math.random());
      this.parts.push({ x: w.x, y: w.y, z: w.z, vx: Math.cos(a) * v, vy: (0.5 + Math.random()) * v * 0.5, vz: Math.sin(a) * v, life: 1, c: cc });
    }
  }
  updateCamera(dt, px = 0.5, py = 0.84) {
    const tp = new THREE.Vector3(), tl = new THREE.Vector3(), asp = this.cam.aspect;
    const k = Math.max(1, 0.95 / asp); tp.set(0, 22.5 * k, 6.2 * k); tl.set(0, 0, 0.5);
    const a = 1 - Math.exp(-dt * 4.5);
    this.camPos.lerp(tp, a); this.camLook.lerp(tl, a);
    this.cam.position.copy(this.camPos);
    if (this.shake > 0) { this.cam.position.x += (Math.random() - 0.5) * this.shake * 0.5; this.cam.position.z += (Math.random() - 0.5) * this.shake * 0.5; }
    this.cam.lookAt(this.camLook);
  }
  unproject(sx, sy) {
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(sx / this.w * 2 - 1, -(sy / this.h) * 2 + 1), this.cam);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -HY), hit)) return null;
    return { x: hit.x / FWW + 0.5, y: hit.z / FDD + 0.5 };
  }
  project(x, y, h = 0.6) { toWorld(x, y, h, this.v).project(this.cam); return { x: (this.v.x * 0.5 + 0.5) * this.w, y: (-this.v.y * 0.5 + 0.5) * this.h, vis: this.v.z < 1 }; }

  render(G, dt, beat, idle = null) {
    const t = performance.now() / 1000, bf = beat - Math.floor(beat);
    const squash = 1 - 0.14 * Math.max(0, 1 - bf / 0.18); // every body bounces on the beat
    this.stageU.uScroll.value = beat; this.stageU.uPulse.value = Math.max(0, 1 - bf * 4);
    this.lamps.forEach((m, i) => { const on = Math.floor(i / 2) === ((Math.floor(beat) % 8) + 8) % 8; m.material.color.set(on ? K.hot : K.lemon); m.scale.setScalar(on ? 1.5 - bf * 0.5 : 1); });
    for (const c of this.clouds.children) { c.position.z += dt * c.userData.speed * 2; if (c.position.z > 30) c.position.z -= 120; }
    this.sparks.rotation.y = Math.sin(t * 0.05) * 0.05;
    const p = G ? G.p : idle;
    // player
    const pl = this.player; toWorld(p.x, p.y, HY, pl.position);
    pl.userData.body.rotation.z = -p.roll * 0.5; pl.userData.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    for (const w of pl.userData.wings) w.rotation.z = w.userData.side * (0.4 + Math.sin(t * 18) * 0.25);
    const blink = performance.now() % 3400 < 130 ? 1 : 0;
    pl.userData.face.userData.face.set(p.mouth || 0, blink, { mood: 1 });
    const inv = G && beat < G.inv; pl.visible = !(inv && Math.floor(performance.now() / 70) % 2) && !(G && G.over && !G.win);
    pl.userData.eng.scale.setScalar(0.9 + Math.sin(t * 30) * 0.15 + (p.mouth || 0) * 0.5);
    pl.userData.hit.visible = !!G && !G.over;
    toWorld(p.x, p.y, 0.01, this.pShadow.position);

    if (G && !G.over) {
      this.trailT += dt;
      while (this.trailT > 0.09) { this.trailT -= 0.09; const w = toWorld(p.x, p.y + 0.03, HY); if (this.parts.length < this.PMAX) this.parts.push({ x: w.x + (Math.random() - 0.5) * 0.3, y: w.y, z: w.z, vx: (Math.random() - 0.5) * 0.8, vy: 0.4, vz: 2.5, life: 0.4, c: col([K.pink, K.lemon, K.sky, K.lav][Math.floor(Math.random() * 4)]) }); }
    }
    if (G) this.consumeFx(G);
    this.syncEnts(G, beat, squash);
    this.syncBullets(G);
    this.syncRings(G, beat);

    if (G && G.beamHold && !G.over) {
      const m = this.holdBeam, w = (0.03 + G.power * 0.006) * FWW * 0.8, z0 = toWorld(p.x, p.y).z, len = 40;
      m.visible = true; m.userData.setColor(K.mint); m.userData.setOpacity(0.7 + Math.sin(t * 40) * 0.15);
      m.scale.set(w * 1.3, 1, len); m.position.set((p.x - 0.5) * FWW, HY, z0 - len / 2 - 0.4);
    } else this.holdBeam.visible = false;
    for (const m of this.beams) { if (!m.visible) continue; m.userData.t += dt; const a = 1 - m.userData.t / m.userData.life; if (a <= 0) { m.visible = false; continue; } m.userData.setOpacity(0.95 * a); m.scale.x = m.userData.w * (0.5 + 0.5 * a); }
    for (const m of this.rings) { if (!m.visible) continue; const u = m.userData; u.t += dt; const a = 1 - u.t / u.life; if (a <= 0) { m.visible = false; continue; } m.material.opacity = a; if (u.grow) m.scale.setScalar(u.rad * (0.6 + 0.4 * (1 - a * a))); }
    let n = 0;
    for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vx *= 0.92; q.vy = q.vy * 0.92 - dt * 6; q.vz *= 0.92; q.life -= dt * 1.4; }
    this.parts = this.parts.filter(q => q.life > 0);
    for (const q of this.parts) { this.pPos[n * 3] = q.x; this.pPos[n * 3 + 1] = q.y; this.pPos[n * 3 + 2] = q.z; this.pCol[n * 3] = q.c.r; this.pCol[n * 3 + 1] = q.c.g; this.pCol[n * 3 + 2] = q.c.b; n++; }
    this.points.geometry.setDrawRange(0, n); this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;

    this.flash = Math.max(0, this.flash - dt * 2.5); this.shake = Math.max(0, this.shake - dt * 3);
    this.flashPlane.material.opacity = this.flash * 0.6;
    this.updateCamera(dt, p.x, p.y);
    this.r.render(this.scene, this.cam);
  }
  syncEnts(G, beat, squash) {
    const seen = new Set();
    if (G) for (const e of G.ents) {
      if (e.type === 'wallgen' || beat < e.enter - 0.01 || (e.dead && e.type === 'boss')) continue;
      seen.add(e.id);
      let g = this.ents.get(e.id); if (!g) { g = this.makeEnt(e); g.userData.born = performance.now(); this.ents.set(e.id, g); }
      const age = clamp((performance.now() - g.userData.born) / 320, 0, 1); g.scale.setScalar(Math.max(0.01, easeBack(age)));
      toWorld(e.x, e.y, HY, g.position);
      g.userData.shadow.visible = e.y > -0.02;
      toWorld(clamp(e.x, 0, 1), clamp(e.y, 0, 1), 0.01, g.userData.shadow.position);
      const hit = performance.now() - e.hitT < 90, mat = g.userData.mat;
      if (mat) { mat.emissive.set(hit ? '#ffffff' : e.warn ? K.hot : '#000000'); mat.emissiveIntensity = hit ? 0.9 : e.warn ? 0.35 + Math.sin(performance.now() / 40) * 0.2 : 0; }
      const sq = e.warn ? squash * 0.92 : squash;
      g.userData.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      const face = g.userData.face.userData.face;
      if (e.type === 'drone') face.set(e.warn ? 0.7 : 0, 0, { flash: hit, mood: e.warn ? 0 : 1 });
      if (e.type === 'drummer') { const since = beat - e.hitBeat; face.set(since >= 0 && since < 0.4 ? 1 : 0, 0, { flash: hit, mood: 1 }); }
      const ex = e.echo && !e.echo.done ? e.echo : null;
      if (e.type === 'totem' || e.type === 'boss') {
        let m = 0; if (ex) for (const nt of ex.notes) { const d = beat - nt.t; if (d >= -0.05 && d < Math.max(0.35, nt.l)) m = Math.max(m, nt.l > 0 ? 0.9 : 1 - Math.max(0, d) / 0.35); }
        if (e.type === 'boss') m = Math.max(m, Math.max(0, 1 - (performance.now() - e.mouthT) / 250));
        const listening = ex && beat >= ex.notes[0].rt - 1;
        face.set(m, listening ? 0.6 : 0, { flash: hit, mood: 1 });
        const grp = this.ensureNotes(g, ex, e.type === 'boss' ? 0.62 : 0.5);
        grp.position.set(0, 0.3, e.type === 'boss' ? -2.2 : -1.45);
        if (ex) ex.notes.forEach((nt, i) => { const mm = grp.children[i]; if (!mm) return; const called = beat >= nt.t - 0.02; mm.material.map = this.note(nt.s === 2 || nt.s === 1 ? K.mint : nt.s === -1 ? '#c9bfcf' : called ? (nt.k === 'x' ? K.violet : '#ffc21a') : '#ffffff'); const pop = called && beat - nt.t < 0.25 ? 1.45 - (beat - nt.t) * 1.8 : 1; mm.scale.setScalar(mm.userData.base * pop); });
      }
    }
    for (const [id, g] of this.ents) if (!seen.has(id)) {
      this.world.remove(g); this.world.remove(g.userData.shadow);
      g.traverse(o => { if (o.material && o.material.map) o.material.map.dispose(); });
      this.ents.delete(id);
    }
  }
  syncBullets(G) {
    const M = new THREE.Matrix4(), S3 = new THREE.Vector3(), cq = this.cam.quaternion, spin = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
    const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const cnt = { n: 0, h: 0, p: 0, r: 0 }; let si = 0;
    const tnow = performance.now() / 1000;
    if (G) for (const b of G.bullets) {
      const k = b.ref ? 'r' : b.kind === 'h' ? 'h' : b.kind === 'p' ? 'p' : 'n', mesh = this.bk[k];
      if (cnt[k] >= mesh.instanceMatrix.count) continue;
      const r = b.r * FDD * (k === 'h' ? 2.6 : k === 'p' ? 2.4 : 2.2);
      const lift = k === 'h' ? Math.sin(Math.PI * clamp((G.Pb - b.b0) / Math.max(0.1, b.arrive - b.b0), 0, 1)) * 2.2 : 0;
      toWorld(b.x, b.y, HY + 0.1 + lift, this.v);
      if (k === 'h' || k === 'p') { spin.setFromAxisAngle(Z, tnow * (k === 'h' ? 4 : 0) + (k === 'p' ? Math.sin(tnow * 10) * 0.3 : 0)); M.compose(this.v, cq.clone().multiply(spin), S3.set(r, r, r)); }
      else M.compose(this.v, cq, S3.set(r, r, r));
      mesh.setMatrixAt(cnt[k]++, M);
      if (si < 1600) { toWorld(b.x, b.y, 0.012, this.v); M.compose(this.v, flat, S3.set(r * 0.9, r * 0.9, 1)); this.bshadow.setMatrixAt(si++, M); }
    }
    for (const k in this.bk) { this.bk[k].count = cnt[k]; this.bk[k].instanceMatrix.needsUpdate = true; }
    this.bshadow.count = si; this.bshadow.instanceMatrix.needsUpdate = true;
  }
  syncRings(G, beat) {
    let k = 0;
    const put = (x, y, rad, c, a, h = HY - 0.3) => { if (k >= this.approach.length) return; const m = this.approach[k++]; m.visible = true; toWorld(x, y, h, m.position); m.scale.setScalar(rad); m.material.color.set(c); m.material.opacity = a; };
    if (G && !G.over) {
      const p = G.p, f = Math.ceil(beat) - beat;
      put(p.x, p.y, 0.95 + f * 1.8, K.plum, 0.12 + (1 - f) * 0.4);
      for (const ex of G.echoes) { if (ex.done) continue; for (const n of ex.notes) { if (n.s !== 0) continue; const d = n.rt - beat; if (d < -0.1 || d > 1) continue; put(p.x, p.y, 0.95 + Math.max(d, 0) * 2.4, n.k === 'x' ? K.violet : '#ffb800', 0.4 + (1 - Math.max(d, 0)) * 0.6); } }
      for (const b of G.bullets) { if (b.kind !== 'h' || b.ref) continue; const d = b.arrive - beat; if (d < -0.15 || d > 2) continue; put(b.tx, b.ty, 0.5 + Math.max(d, 0) * 0.9, K.violet, 0.35 + (1 - Math.min(1, Math.max(d, 0) / 2)) * 0.65, 0.03); }
    }
    for (; k < this.approach.length; k++) this.approach[k].visible = false;
  }
}
