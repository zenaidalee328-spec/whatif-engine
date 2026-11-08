"""'What if you fell into a hole through the Earth?' — YouTube 16:9 (1920x1080), ~5:22, no voiceover.
Physics: tools/physics/prem_fall.py (PREM density, vacuum, pole-to-pole) -> engine/fall.ts drives the telemetry + tunnel.
usage: python3 tools/gen/earthhole.py -> src/timelines/earthhole.json

Facts used (checked):
  fall time 38 min 11 s, uniform Earth ~42 min (Klotz 2015, Am. J. Phys.); g peaks ~1.09 g at the core-mantle boundary;
  v max 35,707 km/h; P centre 364 GPa (3.6 million atm); Kola Superdeep Borehole 12,262 m (1989);
  North Pole sea depth 4,261 m; South Pole surface 2,835 m above sea level (ice sheet ~2.7 km);
  inner-core boundary ~5,500 K (Anzellini et al. 2013); Sun's surface ~5,500 °C; outer core (r 3,480 km) > Mars (r 3,390 km);
  lower mantle = 55% of Earth's volume (PREM radii); air scale height 8.4 km -> density doubles every ~5.8 km;
  ideal-gas air reaches body density (985 kg/m3) at ~56 km; terminal velocity in surface air ~200 km/h.
"""
import json, math

TC = 1145.4
segs = []
tele = []  # (T, s) telemetry keys


def add(sid, a, b, scene, params, s=None, **kw):
    seg = {"id": sid, "from": round(a, 3), "to": round(b, 3), "scene": scene, "params": params}
    if s is not None:
        seg["params"]["s"] = [[round(t - a, 3), round(v, 2)] for t, v in s]
        tele.extend([[round(t, 3), round(v, 2)] for t, v in s])
    seg.update(kw)
    segs.append(seg)


def cap(a, t0, t1, text, style="subtle"):
    return {"from": round(t0 - a, 3), "to": round(t1 - a, 3), "text": text, "style": style}


def lin(T0, T1, s0, s1, n=1):
    return [(T0 + (T1 - T0) * k / n, s0 + (s1 - s0) * k / n) for k in range(n + 1)]


NO_TELE = {"telemetry": False}
CUT_CAM = lambda a, b, p0, p1: {"path": "keys", "pos": [[0, p0], [b - a, p1]], "look": [[0, [0, 0, 0]], [b - a, [0, 0, 0]]], "fov": 40}

# ================================================================ 0 - 10  HOOK (the approved demo)
add("pole", 0, 3.0, "northpole", {"walk": [[0, 0], [1.5, 1]], "drop": [[0, -1], [1.55, -1], [1.5501, 0], [3.0, 1.45]], "sunElev": 16},
    camera={"path": "keys", "pos": [[0, [7.5, 2.4, 13]], [1.5, [6.0, 2.6, 10.5]], [3.0, [2.2, 6.5, 6.5]]], "look": [[0, [0, 1.0, 4]], [1.5, [0, 0.9, 3.6]], [3.0, [0, -6, 0.5]]], "fov": 42},
    effects={"vignette": 0.4}, hud=NO_TELE,
    captions=[{"from": 0.2, "to": 3.0, "text": "What if you fell into a hole|through the Earth?", "style": "top"}],
    sfx=[{"at": 0.0, "type": "footsteps", "dur": 1.5, "rate": 1.8, "gain": 0.4}, {"at": 1.55, "type": "whoosh", "gain": 0.7}])
add("plunge", 3.0, 6.5, "tunnel", {"view": "below", "bloom": 0.6}, s=[(3.0, 3), (3.6, 40), (4.2, 160), (4.9, 420), (5.6, 800), (6.5, TC)],
    transitionIn="whip", effects={"speedLines": [[0, 0.2], [3.5, 0.6]], "shake": [[0, 0.2], [3.5, 0.6]], "vignette": 0.45},
    captions=[cap(3.0, 3.3, 6.3, "6,371 km straight down.|No air. No brakes.")],
    sfx=[{"at": 0.0, "type": "riser", "dur": 3.4, "gain": 0.6}, {"at": 0.05, "type": "whoosh", "gain": 0.8}], ambience="roar")
add("cut", 6.5, 10.0, "earthcut", {"labels": 0, "spin": [[0, -20], [3.5, -5]]}, s=[(6.5, TC), (9.1, 2 * TC), (10.0, 2 * TC)],
    camera=CUT_CAM(6.5, 10, [21, 5, 15], [18, 4, 21]), transitionIn="flash", effects={"vignette": 0.4},
    captions=[cap(6.5, 6.8, 8.5, "Through the centre of the Earth…"), cap(6.5, 8.5, 10.0, "…and out the other side|in 38 minutes, 11 seconds.")],
    sfx=[{"at": 0.0, "type": "boom", "gain": 0.9}, {"at": 0.1, "type": "hum", "dur": 3.3, "gain": 0.4}])

# ================================================================ 10 - 36  the hole, and why pole to pole
a, b = 10, 20
add("intro", a, b, "earthcut", {"labels": [[0, 0], [1.5, 1]], "dot": 0, "trail": 0, "spin": [[0, 10], [10, 20]]},
    camera=CUT_CAM(a, b, [16, 3, 26], [12, 2, 30]), transitionIn="dip", hud=NO_TELE,
    captions=[cap(a, 10.3, 13.8, "To fall through, you'd need a hole|12,742 km long."), cap(a, 14.0, 17.0, "The deepest hole ever dug is 12.3 km|(Kola, Russia, 1989)."),
              cap(a, 17.0, 20.0, "That's 0.1% of the way.")],
    sfx=[{"at": 0.0, "type": "hum", "dur": 10, "gain": 0.3}])
a, b = 20, 36
add("spin", a, b, "earthcut", {"labels": 0, "dot": 0, "trail": 0, "spin": [[0, 0], [16, 160]]},
    camera=CUT_CAM(a, b, [26, 8, 10], [22, 6, 18]), transitionIn="whip", hud=NO_TELE,
    captions=[cap(a, 20.1, 23.0, "FIRST: WHERE TO DIG", "top"), cap(a, 20.5, 24.5, "Earth spins. At the equator, the ground moves at 1,670 km/h."),
              cap(a, 24.7, 29.5, "Dig anywhere else, and the deep part of your tunnel|moves slower than the top. You'd scrape the walls all the way."),
              cap(a, 29.7, 33.3, "Only one line doesn't swing sideways:|the axis. Pole to pole."), cap(a, 33.4, 36.0, "So we start at the North Pole.")])
add("arctic", 36, 42, "northpole", {"walk": 0, "drop": -1, "sunElev": 16},
    camera={"path": "keys", "pos": [[0, [30, 9, 34]], [6, [16, 5, 20]]], "look": [[0, [0, 0, 2]], [6, [0, 0.8, 3]]], "fov": 40}, transitionIn="dip", hud=NO_TELE,
    captions=[cap(36, 36.4, 41.8, "The North Pole: sea ice 2 m thick,|floating on 4,261 m of ocean.")],
    ambience="wind")

# ================================================================ 42 - 70  problem 1: AIR
H, VT = 8.43, 200.0
dens = lambda d: math.exp(d / H)
vterm = lambda d: VT / math.sqrt(dens(d))
air = lambda a, ds: {"depthKm": [[t - a, d] for t, d in ds], "speedKmh": [[t - a, round(vterm(d), 1)] for t, d in ds]}
a, b = 42, 50
d1 = [(42, 0.3), (50, 1.2)]
add("air1", a, b, "tunnel", {**air(a, d1), "haze": [[0, 0.08], [8, 0.15]], "panic": 0.6, "view": "side", "exposure": 2.2}, hud={"telemetry": False, "stats": [
    {"from": 0.3, "to": 8, "label": "SPEED (TERMINAL)", "value": "{n} km/h", "count": [[0, vterm(0.3)], [8, vterm(1.2)]], "decimals": 0},
    {"from": 0.3, "to": 8, "label": "AIR DENSITY", "value": "×{n}", "count": [[0, dens(0.3)], [8, dens(1.2)]], "decimals": 1}]},
    transitionIn="whip", captions=[cap(a, 42.1, 44.6, "PROBLEM 1: AIR", "top"), cap(a, 44.6, 49.8, "With air in the tunnel, you'd hit terminal velocity:|about 200 km/h. And then it gets worse.")],
    sfx=[{"at": 0.0, "type": "whoosh", "gain": 0.6}], ambience="wind")
a, b = 50, 60
d2 = [(50, 8), (55, 25), (60, 45)]
add("air2", a, b, "tunnel", {**air(a, d2), "haze": [[0, 0.3], [10, 0.7]], "view": "side"}, hud={"telemetry": False, "stats": [
    {"from": 0.2, "to": 10, "label": "DEPTH", "value": "{n} km", "count": [[t - a, d] for t, d in d2], "decimals": 0},
    {"from": 0.2, "to": 10, "label": "AIR DENSITY", "value": "×{n}", "count": [[t - a, dens(d)] for t, d in d2], "decimals": 0},
    {"from": 0.2, "to": 10, "label": "SPEED (TERMINAL)", "value": "{n} km/h", "count": [[t - a, vterm(d)] for t, d in d2], "decimals": 0}]},
    captions=[cap(a, 50.2, 54.6, "Deeper down, the air is squeezed|by all the air above it."), cap(a, 54.7, 59.9, f"Its density doubles every ~{H * math.log(2):.0f} km.|The thicker it gets, the slower you fall.")],
    ambience="wind")
a, b = 60, 70
d3 = [(60, 50), (65, 56.4), (70, 56.4)]
add("air3", a, b, "tunnel", {**air(a, d3), "speedKmh": [[0, vterm(50)], [5, 0], [10, 0]], "haze": [[0, 0.8], [10, 0.9]], "view": "close"}, hud={"telemetry": False, "stats": [
    {"from": 0.2, "to": 10, "label": "DEPTH", "value": "{n} km", "count": [[t - a, d] for t, d in d3], "decimals": 0},
    {"from": 0.2, "to": 10, "label": "AIR DENSITY", "value": "×{n}", "count": [[t - a, dens(d)] for t, d in d3], "decimals": 0}]},
    captions=[cap(a, 60.2, 64.6, "Around 56 km down, the air is as dense|as your own body."),
              cap(a, 64.7, 68.0, f"You stop falling. You float.|(It takes {(2 * H / VT) * (dens(56.4) ** 0.5 - 1):.1f} hours to get here.)"),
              cap(a, 68.0, 70.0, "So: pump out all the air.")],
    ambience="wind")

# ================================================================ 70 - 86  problem 2: heat and pressure
a, b = 70, 86
add("heat", a, b, "earthcut", {"labels": [[0, 0], [1, 1]], "dot": 0, "trail": 0, "mark": [[0, -1], [2, -1], [2.01, 6], [11, 6], [11.01, -1]], "spin": [[0, 30], [16, 45]]},
    camera=CUT_CAM(a, b, [10, 2, 30], [5, 1, 20]), transitionIn="dip", hud=NO_TELE,
    captions=[cap(a, 70.1, 72.5, "PROBLEM 2: HEAT", "top"), cap(a, 72.5, 77.0, "The centre is about 5,200 °C —|nearly as hot as the surface of the Sun."),
              cap(a, 77.1, 81.0, "The pressure: 3.6 million atmospheres."), cap(a, 81.1, 86.0, "No material we know could hold this tunnel open.|So let's pretend one does.")],
    sfx=[{"at": 0.0, "type": "hum", "dur": 16, "gain": 0.35}])

# ================================================================ 86 - 96  the jump
J = 89.2  # video time of the jump (story s = 0)
a, b = 86, 96
add("jump", a, b, "northpole", {"walk": [[0, 0], [J - a - 0.05, 1]], "drop": [[0, -1], [J - a - 0.001, -1], [J - a, 0], [b - a, b - J]], "sunElev": 16},
    camera={"path": "keys", "pos": [[0, [7.5, 2.4, 13]], [J - a, [5.5, 2.6, 10]], [b - a, [1.2, 9, 4.5]]], "look": [[0, [0, 1.0, 4]], [J - a, [0, 0.9, 3.6]], [b - a, [0, -30, 0]]], "fov": 42},
    transitionIn="dip", hud=NO_TELE,
    captions=[cap(a, 86.3, 89.2, "Vacuum. Unbreakable walls.|Let's jump."), cap(a, 89.6, 95.8, "From the first second, you're weightless:|in free fall, nothing pushes on you.")],
    sfx=[{"at": 0.2, "type": "footsteps", "dur": 2.8, "rate": 1.8, "gain": 0.4}, {"at": J - a, "type": "whoosh", "gain": 0.7}], ambience="wind")
tele.append([J, 0])
tele.append([96, 96 - J])

# ================================================================ 96 - 134  ocean, crust, glowing rock (close to real time)
a, b = 96, 104
add("ocean1", a, b, "tunnel", {"view": "close", "exposure": 1.9}, s=[(96, 96 - J), (104, 15)], transitionIn="whip",
    captions=[cap(a, 96.3, 100.0, "Sunlight fades out within ~200 m."), cap(a, 100.2, 103.9, "14 s: 1,000 m. Total darkness —|only animals that make their own light.")],
    sfx=[{"at": 0, "type": "whoosh", "gain": 0.5}], ambience="slowmo")
a, b = 104, 112
add("ocean2", a, b, "tunnel", {"view": "above", "exposure": 1.6}, s=[(104, 15), (110, 29.4), (112, 33)],
    captions=[cap(a, 110.0, 112.0, "29 s: the bottom|of the Arctic Ocean.")], ambience="slowmo")
a, b = 112, 124
add("crust", a, b, "tunnel", {"view": "side"}, s=[(112, 33), (116, 47.3), (119, 49.9), (124, 56)], transitionIn="whip",
    captions=[cap(a, 116.0, 118.9, "47 s: through the crust.|Into the mantle."), cap(a, 119.0, 123.9, "50 s: 12,262 m. Deeper than any hole|humans have ever dug. 1,768 km/h.")],
    sfx=[{"at": 0, "type": "whoosh", "gain": 0.6}], ambience="roar")
a, b = 124, 134
add("glow", a, b, "tunnel", {"view": "close"}, s=[(124, 56), (129, 71.8), (134, 85)],
    captions=[cap(a, 129.0, 133.9, "1:12 — 26 km down, the rock is 525 °C.|Hot enough to glow.")], ambience="roar")

# ================================================================ 134 - 170  mantle
a, b = 134, 144
add("lapse1", a, b, "earthcut", {"labels": 0, "spin": [[0, 50], [10, 56]]}, s=[(134, 85), (144, 280)], camera=CUT_CAM(a, b, [14, 6, 24], [12, 5, 25]), transitionIn="dip",
    captions=[cap(a, 134.3, 139.0, "You keep accelerating.|1 km every second… then 2… then 3."), cap(a, 139.2, 143.9, "Weightless the whole way.|Gravity is still 1 g out here.")])
a, b = 144, 158
add("tz", a, b, "tunnel", {"view": "side"}, s=[(144, 280), (147, 288.4), (158, 305)], transitionIn="whip",
    captions=[cap(a, 147.0, 150.5, "4:48 — 410 km.|The transition zone."), cap(a, 150.6, 157.9, "Its blue ringwoodite crystals can trap water.|This layer may hold as much water as all the oceans.")],
    sfx=[{"at": 0, "type": "whoosh", "gain": 0.6}], ambience="roar")
a, b = 158, 170
add("lower", a, b, "tunnel", {"view": "below"}, s=[(158, 340), (162, 365.7), (170, 395)],
    captions=[cap(a, 162.0, 169.9, "6:06 — 660 km. The lower mantle:|55% of the entire Earth.")], ambience="roar")

# ================================================================ 170 - 222  half-time, the core
a, b = 170, 180
add("half", a, b, "earthcut", {"labels": 0, "spin": [[0, 60], [10, 66]]}, s=[(170, 395), (175, 572.7), (180, 700)], camera=CUT_CAM(a, b, [14, 4, 25], [12, 3, 26]), transitionIn="dip",
    captions=[cap(a, 175.0, 179.9, "9:33 — halfway to the centre in time…|but only a quarter of the way in distance.")])
a, b = 180, 196
add("cmb", a, b, "tunnel", {"view": "close"}, s=[(180, 740), (184, 763.5), (196, 800)], transitionIn="whip",
    captions=[cap(a, 184.0, 187.5, "12:43 — 2,891 km. The core."), cap(a, 187.6, 192.0, "Down here gravity is 9% STRONGER|than at the surface."),
              cap(a, 192.1, 195.9, "Most of Earth's mass is now below you,|and much closer.")],
    sfx=[{"at": 4.0, "type": "boom", "gain": 0.7}], ambience="roar")
a, b = 196, 210
add("outer", a, b, "tunnel", {"view": "side"}, s=[(196, 800), (210, 960)],
    captions=[cap(a, 196.3, 202.5, "An ocean of liquid iron —|larger than the planet Mars."), cap(a, 202.6, 209.9, "Its swirling currents generate|Earth's magnetic field.")], ambience="roar")
a, b = 210, 222
add("inner", a, b, "tunnel", {"view": "below"}, s=[(210, 1000), (213, 1021.1), (222, 1060)],
    captions=[cap(a, 213.0, 216.8, "17:01 — 5,150 km.|The inner core."), cap(a, 216.9, 221.9, "5,200 °C, yet solid: 3.3 million atmospheres|crush the iron into crystals.")], ambience="roar")

# ================================================================ 222 - 240  the centre (slow motion)
a, b = 222, 240
add("centre", a, b, "tunnel", {"view": "close", "bloom": 0.7}, s=[(222, 1090), (230, 1145.4), (240, 1170)], transitionIn="flash",
    effects={"vignette": 0.45, "flash": [{"at": 8.0, "dur": 0.5}]},
    captions=[cap(a, 230.0, 233.4, "19:05 — the centre of the Earth.", "top"), cap(a, 230.2, 233.4, "Top speed: 35,707 km/h."),
              cap(a, 233.5, 236.8, "Gravity: zero."), cap(a, 236.9, 240.0, "The whole planet pulls on you|equally from every side.")],
    sfx=[{"at": 0, "type": "riser", "dur": 8, "gain": 0.6}, {"at": 8.0, "type": "boom", "gain": 1.0}, {"at": 8.2, "type": "hum", "dur": 9, "gain": 0.4}], ambience="slowmo")

# ================================================================ 240 - 282  climbing, the South Pole twist
a, b = 240, 252
add("climb", a, b, "earthcut", {"labels": 0, "spin": [[0, 70], [12, 78]]}, s=[(240, 1170), (252, 1900)], camera=CUT_CAM(a, b, [10, 4, 20], [9, 3, 23]), transitionIn="dip",
    captions=[cap(a, 240.3, 245.5, "Now everything runs in reverse.|Gravity pulls back and slows you down."), cap(a, 245.7, 251.9, "Same layers, same temperatures —|just in the opposite order.")])
a, b = 252, 264
add("antarctica", a, b, "tunnel", {"view": "below"}, s=[(252, 2150), (257, 2203.3), (264, 2245)], transitionIn="whip",
    captions=[cap(a, 257.0, 263.9, "The far end is the South Pole.|You climb into Antarctica's rock.")], ambience="roar")
a, b = 264, 282
add("stop", a, b, "tunnel", {"view": "above", "bloom": 0.5},
    s=[(264, 2245), (270, 2280), (276, 2290.8), (279, 2292.5), (282, 2296)],
    effects={"vignette": 0.45},
    captions=[cap(a, 276.0, 279.0, "38:11 — you stop.", "top"), cap(a, 270.0, 275.9, "Slower… slower…"),
              cap(a, 276.2, 279.0, "But the South Pole sits on a 2.8 km ice sheet."), cap(a, 279.1, 282.0, "Its surface is 2,835 m above where you started.|You run out of speed 2.8 km short.")],
    sfx=[{"at": 12.0, "type": "thud", "gain": 0.5}], ambience="slowmo")

# ================================================================ 282 - 322  forever, bonus, outro
a, b = 282, 292
add("forever", a, b, "earthcut", {"labels": 0, "spin": [[0, 80], [10, 95]]}, s=[(282, 2296), (292, 2296 + 9 * TC)], camera=CUT_CAM(a, b, [12, 5, 24], [10, 4, 28]), transitionIn="dip",
    captions=[cap(a, 282.3, 286.5, "…and you fall back in."), cap(a, 286.6, 291.9, "Pole to pole and back every 76 minutes, 22 seconds.|Forever.")],
    sfx=[{"at": 0, "type": "whoosh", "gain": 0.5}])
a, b = 292, 314
add("bonus", a, b, "earthcut", {"labels": 0, "dot": 0, "trail": 0, "spin": [[0, 95], [22, 120]]}, camera=CUT_CAM(a, b, [14, 4, 26], [10, 3, 30]), hud=NO_TELE,
    captions=[cap(a, 292.3, 297.8, "If Earth had the same density all the way through,|the trip would take 42 minutes."),
              cap(a, 297.9, 302.9, "Its heavy iron core pulls harder|and makes it 4 minutes faster."),
              cap(a, 303.0, 313.8, "On such a planet, a straight tunnel between ANY two cities —|London to Karachi, or next door — takes the same 42 minutes.")])
add("outro", 314, 322, "northpole", {"walk": 0, "drop": -1, "showHero": 0, "sunElev": 16},
    camera={"path": "keys", "pos": [[0, [8, 5, 12]], [8, [3, 14, 5]]], "look": [[0, [0, 0, 0]], [8, [0, -20, 0]]], "fov": 42}, transitionIn="dip", hud=NO_TELE,
    effects={"fade": {"color": "black", "amount": [[6.5, 0], [8, 1]]}},
    captions=[{"from": 0.5, "to": 6.5, "text": "So…|would you jump?", "style": "top"}], ambience="wind")

END = max(s["to"] for s in segs)
tele.sort()
dedup = []
for k in tele:
    if dedup and abs(dedup[-1][0] - k[0]) < 1e-6:
        dedup[-1] = k
    else:
        dedup.append(k)
tl = {"meta": {"id": "EarthHole", "title": "What if you fell into a hole through the Earth?", "fps": 30, "width": 1920, "height": 1080,
               "music": {"keys": [[0, 0.5], [3, 0.8], [6.5, 0.6], [10, 0.35], [42, 0.4], [86, 0.5], [96, 0.6], [180, 0.75], [222, 0.85], [240, 0.6], [264, 0.4], [282, 0.5], [314, 0.35], [322, 0]], "root": 49}},
      "hud": {"telemetry": {"keys": dedup, "start": 3.0, "end": 292}},
      "segments": segs}
json.dump(tl, open("src/timelines/earthhole.json", "w"), indent=1)
print("ok", len(segs), "segments, end", END)
