#!/usr/bin/env python3
"""
啪嗒星球 · 每日演奏 — builds level charts for free (CC BY 4.0) songs by Tanner Helland.

Each song ships as an MP3 plus the composer's own MIDI. The MIDI gives an exact beat grid,
so the chart is read straight off the music:
  - echo-monster calls copy the melody's rhythm in that bar (high notes → A, low notes → B,
    long notes → hold)
  - drones fire on the snare / clap hits, drummers launch on crash downbeats
  - quiet passages get calm echoes, loud passages get bullets; walls mark big section changes
Usage:
  python3 tools/make_daily.py --src <free-music checkout>            rebuild everything from tools/daily_catalog.json
  python3 tools/make_daily.py --src <free-music checkout> --add 2    publish the next 2 songs from tools/daily_queue.json
Writes music/*.mp3, music/CREDITS.md, js/daily.js and the song table in README.md
"""
import argparse, json, math, os, re, subprocess, sys
import mido
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "tools", "daily_catalog.json")
QUEUE = os.path.join(ROOT, "tools", "daily_queue.json")
SETTINGS = {1: dict(grid=1.0, maxn=3), 2: dict(grid=0.5, maxn=4), 3: dict(grid=0.5, maxn=5), 4: dict(grid=0.25, maxn=6)}
STORY_POOL = {   # generic lines for songs added later; {zh} is the song title
    "intro": [[["metro", "今天的点歌是《{zh}》。"], ["pai", "准备好了，开演！"]],
              [["drum", "咚！今天轮到《{zh}》，我来打鼓！"], ["metro", "回声怪会照着旋律唱，你照着回应。"]],
              [["boss", "《{zh}》……这首我也会唱。"], ["pai", "那今天就合唱吧，团长。"]],
              [["metro", "银河点歌台收到一首新歌：《{zh}》。"], ["metro", "鼓手跟着镲片砸重音弹，落地那拍按 B。"], ["pai", "交给我！"]]],
    "outro": [[["metro", "《{zh}》演奏完成，听众都在鼓掌。"]], [["drum", "咚咚！明天也要来啊！"]], [["boss", "……合格。明天再来唱。"]], [["pai", "今天的拍子，一个都没漏！"]]],
}

FALLBACK = {1: ["0z 1z 2z", "0z 2z 3z", "0z 1z 2x"], 2: ["0z 1x 1.5x 2z", "0z 0.5z 1z 2x"], 3: ["0z 1.5z 2x 3z", "0.5z 1.5z 2x 3z"], 4: ["0z 0.5x 1z 1.5x 2z 3x", "0z 0.75z 1.5x 2.5z 3x"]}
KICK, SNARE, CRASH = {35, 36}, {38, 39, 40}, {49, 52, 55, 57}

def analyse(path):
    m = mido.MidiFile(path)
    tpb = m.ticks_per_beat
    tempo = next((msg.tempo for tr in m.tracks for msg in tr if msg.type == "set_tempo"), 500000)
    bpm = mido.tempo2bpm(tempo)
    notes = []   # (beat, dur_beats, pitch, channel, vel)
    for tr in m.tracks:
        t, on = 0, {}
        for msg in tr:
            t += msg.time
            if msg.type == "note_on" and msg.velocity > 0: on[(msg.channel, msg.note)] = (t, msg.velocity)
            elif msg.type in ("note_off", "note_on") and (msg.channel, msg.note) in on:
                st, v = on.pop((msg.channel, msg.note)); notes.append((st / tpb, (t - st) / tpb, msg.note, msg.channel, v))
    nbars = math.ceil(m.length / (4 * 60 / bpm))
    return bpm, notes, nbars, m.length

def build(song, bpm, notes, nbars):
    d = song["stars"]; song = {**SETTINGS[d], **song}
    pitched = [x for x in notes if x[3] != 9]
    drums = [x for x in notes if x[3] == 9]
    per_bar = lambda arr, b: [x for x in arr if b * 4 <= x[0] < b * 4 + 4]
    dens = [len(per_bar(pitched, b)) + 0.5 * len(per_bar(drums, b)) for b in range(nbars)]
    srt = sorted(dens); lo, hi = srt[int(len(srt) * 0.35)], srt[int(len(srt) * 0.7)]
    level = ["low" if x <= lo else "high" if x >= hi else "mid" for x in dens]
    bars = [{"lvl": 2} for _ in range(nbars)]
    bars[0]["text"] = f"DAY {song['n']} · {song['zh']}"
    every = 4
    fb = FALLBACK[d]

    def melody_notes(b):
        """the song's own rhythm in bar b: top voice per onset, quantized to the day's grid"""
        q = song["grid"]; on = {}
        for beat, dur, p, ch, v in per_bar(pitched, b):
            k = round((beat - 4 * b) / q) * q
            if k >= 4 or k < 0: continue
            if k not in on or p > on[k][0]: on[k] = (p, dur)
        if len(on) < 2: return None
        keys = sorted(on)
        # keep the strongest-looking set: prefer on-beat notes when there are too many
        while len(keys) > song["maxn"]:
            off = [k for k in keys if k % 1] or keys[1:]
            keys.remove(off[-1])
        ps = sorted(on[k][0] for k in keys); med = ps[len(ps) // 2]
        out = []
        for i, k in enumerate(keys):
            p, dur = on[k]
            key = "z" if (p >= med if d > 1 else p > med - 5) else "x"
            nxt = keys[i + 1] if i + 1 < len(keys) else 4
            l = 0
            if dur >= 0.95 and d >= 1: l = min(nxt - k - (0.5 if d < 3 else 0.25), 2, round(dur * 2) / 2)
            if l < 1: l = 0
            out.append([float(k), key, float(l)])
        if all(n[1] == "x" for n in out): out[0][1] = "z"
        return out

    def hits(b, kinds, grid=0.5, cap=3):
        hs = sorted({round((x[0] - 4 * b) / grid) * grid for x in per_bar(drums, b) if x[2] in kinds})
        hs = [h for h in hs if 0 <= h < 4]
        return hs[:cap]

    k = 0
    for b in range(2, nbars - 1):
        cyc = (b - 2) % every
        if cyc == 0:                       # echo call (copied from the melody), next bar is the answer
            if b + 1 >= nbars - 1: continue
            ns = melody_notes(b)
            if ns is None: ns = [[float(t), kk, float(l)] for t, kk, l in (re.match(r"([\d.]+)([zx])(?::([\d.]+))?", tok).groups() for tok in fb[k % len(fb)].split()) for l in [l or 0]]
            bars[b]["echo"] = {"notes": ns}; k += 1
        elif cyc in (2, 3) or (every == 8 and cyc in (4, 5, 6)):
            if cyc == 3 or cyc == 5: continue   # drones live 2 bars
            lv = level[b]
            if lv == "low" and d < 3:
                if cyc == 2: bars[b]["drones"] = {"n": 4, "form": "line", "fire": [], "aim": "down", "life": 2, "hp": 2, "alt": False}
                continue
            fire = hits(b, SNARE, 0.5 if d < 4 else 0.25, 2 if lv == "mid" or d < 3 else 3) or ([1, 3] if lv == "high" else [3])
            aim = "spread" if lv == "high" and d >= 2 else "aim" if d >= 2 else "down"
            bars[b]["drones"] = {"n": 6 if lv == "high" else 5, "form": ["v", "zig", "circle", "line", "pair"][(b // 4 + d) % 5], "fire": fire, "aim": aim, "life": 2, "hp": 3 if d >= 3 else 2, "alt": lv != "high"}
            if d >= 2 and lv == "high" and (b // 4) % 2 == 0:
                bars[b]["drummer"] = {"x": 0.3 if (b // 8) % 2 else 0.7, "fire": [0, 2] if d >= 4 else [0], "life": 2, "hp": 5}
    # walls where the music jumps from quiet to loud (and the bar is free)
    if d >= 2:
        for b in range(3, nbars - 2):
            if level[b - 1] == "low" and level[b] == "high" and not any(bars[x].get("echo") for x in (b - 1, b)) and not bars[b].get("drones"):
                bars[b]["wall"] = {"rows": [0, 2] if d < 4 else [0, 1, 2, 3], "gaps": [0.3, 0.7, 0.45, 0.6]}
    bars[nbars - 2]["text"] = "演奏完成！"
    return bars

# ---------------------------------------------------------------- audio checks for new songs
def decode(path, sr=22050):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32), sr
def flux(x, H=128):
    n = (len(x) - 1024) // H; w = np.hanning(1024)
    S = np.log1p(np.abs(np.fft.rfft(np.stack([x[i * H:i * H + 1024] * w for i in range(n)]), axis=1)) * 10)
    return np.r_[0, np.maximum(0, np.diff(S, axis=0)).sum(1)]

def measure(mp3, bpm, notes):
    """returns (offset_seconds, mp3_bpm, phase_spread) — offset is where MIDI time 0 sits in the MP3"""
    x, sr = decode(mp3); H = 128; fl = flux(x, H); t = np.arange(len(fl)) * H / sr
    per = 60 / bpm
    best = max(((abs(np.sum(fl * np.exp(2j * np.pi * t / (60 / b)))), b) for b in np.arange(bpm * 0.97, bpm * 1.03, 0.02)))[1]
    phases = []
    for s0 in range(0, int(t[-1]) - 10, 15):
        m = (t >= s0) & (t < s0 + 15); z = np.sum(fl[m] * np.exp(2j * np.pi * t[m] / per)); phases.append(np.angle(z))
    zc = np.mean(np.exp(1j * np.array(phases)))
    phase = (np.angle(zc) / (2 * np.pi)) % 1 * per - 0.012            # flux peaks trail onsets by ~half a window
    env = np.convolve(np.abs(x), np.ones(256) / 256, "same"); first_audio = int(np.argmax(env > 0.01 * env.max())) / sr
    first_note = min(n[0] for n in notes) * per
    cand = first_audio - first_note
    k = round((cand - phase) / per); off = phase + k * per
    # refine: line the MIDI onsets up with the audio onsets within ±0.12 s of the estimate
    fr = H / sr; train = np.zeros(len(fl)); fz = (fl - fl.mean()) / (fl.std() + 1e-9)
    for beat, dur, p, ch, v in notes:
        i = int(beat * per / fr)
        if i < len(train): train[i] += (2 if ch == 9 else 1) * v / 127
    best_lag, best_c = 0, -1e18
    for lag in range(int((off - 0.12) / fr), int((off + 0.12) / fr) + 1):
        c = float(np.dot(np.roll(train, lag), fz))
        if c > best_c: best_c, best_lag = c, lag
    off = best_lag * fr - 0.005            # flux onset lands ~half a hop late
    return round(float(off), 3), float(best), float(1 - abs(zc))

def midi_ok(path):
    m = mido.MidiFile(path)
    tempos = {msg.tempo for tr in m.tracks for msg in tr if msg.type == "set_tempo"}
    sigs = {(msg.numerator, msg.denominator) for tr in m.tracks for msg in tr if msg.type == "time_signature"}
    if len(tempos) > 1: return "tempo changes"
    if sigs and sigs != {(4, 4)}: return f"meter {sigs}"
    bpm = mido.tempo2bpm(next(iter(tempos))) if tempos else 120
    if not 70 <= bpm <= 200: return f"bpm {bpm:.0f}"
    if not 50 <= m.length <= 260: return f"length {m.length:.0f}s"
    return None

def auto_stars(bpm, notes, length):
    dens = len([n for n in notes if n[3] != 9]) / max(1, length)
    s = 1 + (bpm >= 112) + (dens > 14) + (bpm >= 140 or dens > 26)
    return int(min(4, max(1, s)))

def add_songs(src, n):
    cat = json.load(open(CATALOG, encoding="utf8")); queue = json.load(open(QUEUE, encoding="utf8"))
    added, rest = [], []
    for q in queue:
        if len(added) >= n or q.get("skip"): rest.append(q); continue
        mid, mp3 = os.path.join(src, "midi", q["file"] + ".mid"), os.path.join(src, "mp3", q["file"] + ".mp3")
        why = None if os.path.exists(mid) and os.path.exists(mp3) else "missing files"
        why = why or midi_ok(mid)
        if not why:
            bpm, notes, nbars, length = analyse(mid)
            off, mbpm, spread = measure(mp3, bpm, notes)
            if abs(mbpm - bpm) / bpm > 0.004: why = f"mp3 tempo {mbpm:.2f} != midi {bpm:.2f}"
            elif spread > 0.25: why = f"beat phase unstable ({spread:.2f})"
        if why:
            print(f"skip {q['file']}: {why}"); rest.append({**q, "skip": why}); continue
        stars = auto_stars(bpm, notes, length); k = len(cat) % 4
        song = {"n": len(cat) + 1, "file": q["file"], "slug": q["slug"], "zh": q["zh"], "offset": off, "stars": stars,
                "desc": q.get("desc") or f"{'★' * stars}{'☆' * (4 - stars)} · {round(bpm)} BPM · Tanner Helland 的《{q['file']}》。",
                "story": {kk: [[w, line.format(zh=q["zh"])] for w, line in STORY_POOL[kk][(k if kk == 'intro' else (k + 1)) % len(STORY_POOL[kk])]] for kk in ("intro", "outro")}}
        cat.append(song); added.append(song)
        print(f"added Day {song['n']} {q['file']} bpm={bpm:.1f} offset={off} stars={stars} phase_spread={spread:.2f}")
    json.dump(cat, open(CATALOG, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    json.dump(rest, open(QUEUE, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    return added

def write_credits(cat):
    rows = "\n".join(f"| {s['slug']}.mp3 | {s['file']} | 重新编码为 128kbps MP3，内容未改动 |" for s in cat)
    open(os.path.join(ROOT, "music", "CREDITS.md"), "w", encoding="utf8").write(
        "# 音乐署名\n\n本目录中的歌曲均由 **Tanner Helland** 创作，来自 <https://github.com/tannerhelland/free-music>（另见 <https://tannerhelland.com/music.html>），\n"
        "以 [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) 授权。\n\n"
        "| 文件 | 原曲名 | 改动 |\n|---|---|---|\n" + rows + "\n\n游戏谱面（`js/daily.js`）由 `tools/make_daily.py` 依据作者公开的同名 MIDI 生成。\n")
    readme = os.path.join(ROOT, "README.md")
    if os.path.exists(readme):
        r = open(readme, encoding="utf8").read()
        table = "| 天 | 曲目 | BPM |\n|---|---|---|\n" + "\n".join(f"| Day {s['n']} · {s['zh']} | “{s['file']}” — Tanner Helland | {s.get('bpm', '')} |" for s in cat)
        r = re.sub(r"<!-- daily:start -->.*?<!-- daily:end -->", "<!-- daily:start -->\n" + table + "\n<!-- daily:end -->", r, flags=re.S)
        open(readme, "w", encoding="utf8").write(r)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--src", default="free-music"); ap.add_argument("--add", type=int, default=0)
    a = ap.parse_args()
    if a.add: add_songs(a.src, a.add)
    cat = json.load(open(CATALOG, encoding="utf8"))
    os.makedirs(os.path.join(ROOT, "music"), exist_ok=True)
    out = []
    for s in cat:
        bpm, notes, nbars, length = analyse(os.path.join(a.src, "midi", s["file"] + ".mid"))
        s["bpm"] = round(bpm, 2)
        bars = build(s, bpm, notes, nbars)
        mp3 = os.path.join(ROOT, "music", s["slug"] + ".mp3")
        if not os.path.exists(mp3):
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(a.src, "mp3", s["file"] + ".mp3"), "-codec:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", mp3], check=True)
        echoes = sum(1 for b in bars if b.get("echo")); drones = sum(1 for b in bars if b.get("drones")); drummers = sum(1 for b in bars if b.get("drummer")); walls = sum(1 for b in bars if b.get("wall"))
        print(f"Day {s['n']:2d} {s['file'][:20]:20s} bpm={bpm:.1f} bars={nbars} echo={echoes} drones={drones} drummer={drummers} wall={walls}")
        out.append({
            "id": f"daily-{s['slug']}", "title": f"Day {s['n']} · {s['zh']}", "author": "Tanner Helland（音乐）", "desc": s["desc"],
            "bpm": round(bpm, 2), "music": {"type": "url", "url": f"music/{s['slug']}.mp3", "offset": s["offset"],
                                            "credit": f"“{s['file']}” by Tanner Helland · CC BY 4.0 · tannerhelland.com/music（重新编码为 128kbps，未改动内容）"},
            "story": s["story"], "bars": bars, "boss": None, "day": s["n"], "stars": s["stars"], "original": s["file"],
        })
    js = "// Generated by tools/make_daily.py — 每日演奏: songs by Tanner Helland (CC BY 4.0), charts read from the songs' MIDI\nexport const DAILY = " + json.dumps(out, ensure_ascii=False) + ";\n"
    open(os.path.join(ROOT, "js", "daily.js"), "w", encoding="utf8").write(js)
    write_credits(cat)
    print("wrote js/daily.js with", len(out), "songs")

if __name__ == "__main__":
    main()
