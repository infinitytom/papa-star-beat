#!/usr/bin/env python3
"""
拍拍星航 · 每日演奏 — builds level charts for free (CC BY 4.0) songs by Tanner Helland.

Each song ships as an MP3 plus the composer's own MIDI. The MIDI gives an exact beat grid,
so the chart is read straight off the music:
  - echo-monster calls copy the melody's rhythm in that bar (high notes → A, low notes → B,
    long notes → hold)
  - drones fire on the snare / clap hits, drummers launch on crash downbeats
  - quiet passages get calm echoes, loud passages get bullets; walls mark big section changes
Usage: python3 tools/make_daily.py <free-music checkout>
Writes music/*.mp3 and js/daily.js
"""
import json, math, os, re, subprocess, sys
import mido

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else "free-music"

# offset = seconds into the MP3 where MIDI time 0 sits (measured by onset / beat-phase analysis)
SONGS = [
    dict(n=1, file="Surreptitious", slug="surreptitious", zh="蹑手蹑脚", offset=0.52, diff=1, grid=1.0, maxn=3,
         desc="马林巴和贝斯悄悄走路。先跟着四分音符应答。"),
    dict(n=2, file="Daybreak", slug="daybreak", zh="破晓", offset=0.035, diff=2, grid=0.5, maxn=4,
         desc="合唱和弦乐的日出。旋律里的八分音符开始出现。"),
    dict(n=3, file="Wild Waters", slug="wild-waters", zh="狂野水域", offset=0.53, diff=3, grid=0.5, maxn=5,
         desc="合成器和贝斯翻浪。反拍、长音和鼓手一起来。"),
    dict(n=4, file="Clowns", slug="clowns", zh="小丑嘉年华", offset=0.02, diff=4, grid=0.25, maxn=6,
         desc="铃铛和管风琴的马戏团。本周最难的一首。"),
]
STORY = {
    1: dict(intro=[["metro", "节拍回到银河以后，每天都有一场「每日演奏会」。"], ["metro", "今天的点歌是《蹑手蹑脚》。回声怪会照着旋律唱，你照着回应就好。"], ["pai", "嘘——轻轻地来。"]],
            outro=[["metro", "一个音都没吵醒大家，干得漂亮。"], ["pai", "明天还来！"]]),
    2: dict(intro=[["drum", "咚！今天的点歌是《破晓》，太阳要出来了！"], ["metro", "鼓手会跟着镲片砸下重音弹，记得在落地那拍按 B。"], ["pai", "早安，银河。"]],
            outro=[["drum", "咚咚！太阳出来了，我的鼓也醒了。"], ["metro", "今天的演奏完成。"]]),
    3: dict(intro=[["metro", "《狂野水域》的旋律在反拍上翻浪，比看起来难。"], ["boss", "我来听。唱错一个音，我会皱眉的。"], ["pai", "那就请团长听好啦。"]],
            outro=[["boss", "……还不错，我决定明天也来。"], ["metro", "浪平了，星河很安静。"]]),
    4: dict(intro=[["boss", "周末嘉年华！今天的点歌是《小丑嘉年华》。"], ["drum", "鼓手团也到齐了，咚！"], ["metro", "这是本周最难的一首，祝你好运，拍拍。"]],
            outro=[["pai", "整个银河都在跟着拍子跳！"], ["sil", "……（远处的寂静里，好像有人跟着点了一下头。）"], ["metro", "下周的演奏会，还会有新的歌。"]]),
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
    d = song["diff"]
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

def main():
    os.makedirs(os.path.join(ROOT, "music"), exist_ok=True)
    out = []
    for s in SONGS:
        bpm, notes, nbars, length = analyse(os.path.join(SRC, "midi", s["file"] + ".mid"))
        bars = build(s, bpm, notes, nbars)
        mp3 = os.path.join(ROOT, "music", s["slug"] + ".mp3")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(SRC, "mp3", s["file"] + ".mp3"), "-codec:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", mp3], check=True)
        echoes = sum(1 for b in bars if b.get("echo")); drones = sum(1 for b in bars if b.get("drones")); drummers = sum(1 for b in bars if b.get("drummer")); walls = sum(1 for b in bars if b.get("wall"))
        print(f"{s['file']:14s} bpm={bpm:.1f} bars={nbars} echo={echoes} drones={drones} drummer={drummers} wall={walls} mp3={os.path.getsize(mp3)//1024}KB")
        out.append({
            "id": f"daily-{s['slug']}", "title": f"Day {s['n']} · {s['zh']}", "author": "Tanner Helland（音乐）", "desc": s["desc"],
            "bpm": round(bpm, 2), "music": {"type": "url", "url": f"music/{s['slug']}.mp3", "offset": s["offset"],
                                            "credit": f"“{s['file']}” by Tanner Helland · CC BY 4.0 · tannerhelland.com/music（重新编码为 128kbps，未改动内容）"},
            "story": STORY[s["n"]], "bars": bars, "boss": None, "day": s["n"], "stars": s["diff"], "original": s["file"],
        })
    js = "// Generated by tools/make_daily.py — 每日演奏: songs by Tanner Helland (CC BY 4.0), charts read from the songs' MIDI\nexport const DAILY = " + json.dumps(out, ensure_ascii=False) + ";\n"
    open(os.path.join(ROOT, "js", "daily.js"), "w", encoding="utf8").write(js)
    print("wrote js/daily.js")

if __name__ == "__main__":
    main()
