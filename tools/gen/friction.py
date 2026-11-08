"""Generates src/timelines/friction-5s.json (What If Friction Disappeared for 5 Seconds? — TikTok, 1080x1920).

The video is slow motion: a global map from video time T to physical time pt (seconds since friction vanished).
The scene `frictioncity` computes every car/person/sign from `pt`; this script also computes the POV camera
(your own slip and fall) with the same physics so camera and legs stay in sync.
usage: python3 tools/gen/friction.py
"""
import json
import math

FPS = 30
# video T -> physical pt (piecewise linear)
PT_MAP = [(0, -7.5), (7.5, 0.0), (12.5, 0.45), (23, 1.4), (31, 2.2), (36.5, 2.7), (45, 3.5), (54, 4.3), (64.5, 5.0), (68, 8.5), (72, 12.5)]


def pt_at(T):
    for (t0, p0), (t1, p1) in zip(PT_MAP, PT_MAP[1:]):
        if T <= t1:
            return p0 + (p1 - p0) * (T - t0) / (t1 - t0)
    return PT_MAP[-1][1]


def smooth(a, b, x):
    u = min(1, max(0, (x - a) / (b - a)))
    return u * u * (3 - 2 * u)


def pt_keys(a, b):
    """scene param keys (local time) for a segment from T=a to T=b"""
    pts = sorted({a, b, *[t for t, _ in PT_MAP if a < t < b]})
    return [[round(t - a, 4), round(pt_at(t), 5)] for t in pts]


# ---------- you ----------
X_ME, Z0_ME, EYE = 6.2, 1.0, 1.68


def me(pt):
    z = Z0_ME - 1.4 * min(pt, 5.0) if pt > 0 else Z0_ME - 1.4 * pt
    spread = 0 if pt <= 0 else min(1.25, 2.4 * pt)
    fall = 0 if pt <= 0 else smooth(0.25, 1.35, pt)
    return z, spread, fall


def pov(pt):
    """eye position and look target while slipping and falling backward (facing -z)"""
    z, spread, fall = me(pt)
    th = fall * math.pi / 2 * 0.97
    hip_drop = 0.88 * (1 - math.cos(spread)) * (1 - fall)
    h = EYE - hip_drop
    eye = [X_ME, 0.15 + h * math.cos(th) + 0.18 * fall, z + h * math.sin(th)]
    # gaze: down at phone/legs -> thrown up at the sky while falling -> lift head to look along your body
    pitch = -38 + 95 * smooth(0.5, 1.05, pt) - 115 * smooth(1.12, 1.38, pt)
    yaw = 6 * math.sin(pt * 3)
    pr, yr = math.radians(pitch), math.radians(yaw)
    d = [math.sin(yr) * math.cos(pr) * -1, math.sin(pr), -math.cos(yr) * math.cos(pr)]
    look = [eye[0] + d[0] * 10, eye[1] + d[1] * 10, eye[2] + d[2] * 10]
    roll = 14 * smooth(0.5, 1.2, pt) * math.sin(pt * 2)
    return eye, look, roll


def seg_time(a, b, step=0.1):
    n = max(1, round((b - a) / step))
    return [a + (b - a) * i / n for i in range(n + 1)]


def r(v, d=3):
    return [round(x, d) for x in v]


segs = []


def S(**kw):
    segs.append(kw)


TINT = {"color": "#3a6fd8", "amount": 0.28}
SLOW_FX = {"tint": TINT, "desaturate": 0.12, "vignette": 0.58}

# 1) normal world, real time
S(id="normal", frm=0, to=7.5, scene="frictioncity",
  params={"hand": True},
  camera={"path": "pov-walk", "from": [X_ME, 0.15, Z0_ME + 1.4 * 7.5], "to": [X_ME, 0.15, Z0_ME], "stepRate": 1.8, "pitch": -6, "fov": 62},
  effects={"vignette": 0.45},
  hud={"location": "DOWNTOWN · 5:36 PM", "tags": [{"from": 0.3, "to": 7.5, "text": "FRICTION: ON"}]},
  captions=[{"from": 0.2, "to": 3.6, "text": "What if friction disappeared for 5 seconds?", "style": "big", "hl": ["friction"]},
            {"from": 3.8, "to": 7.4, "text": "You're walking home, eyes on your phone.", "hl": ["phone."]}],
  sfx=[{"at": 0.1, "type": "footsteps", "dur": 7.3, "rate": 1.8, "gain": 0.45}, {"at": 2.2, "type": "beep", "gain": 0.25},
       {"at": 5.8, "type": "riser", "dur": 1.7, "gain": 0.6}])

# 2) phone slips out of your hand (pt 0 .. 0.45)
a, b = 7.5, 12.5
ts = seg_time(a, b)
S(id="phone", frm=a, to=b, scene="frictioncity", transitionIn="glitch",
  params={"hand": True, "meShow": True, "meX": X_ME,
          "meZ": [[round(t - a, 3), round(me(pt_at(t))[0], 3)] for t in ts],
          "meSpread": [[round(t - a, 3), round(me(pt_at(t))[1], 3)] for t in ts],
          "meFall": [[round(t - a, 3), round(me(pt_at(t))[2], 3)] for t in ts]},
  camera={"path": "keys", "ease": "linear",
          "pos": [[round(t - a, 3), r(pov(pt_at(t))[0])] for t in ts],
          "look": [[round(t - a, 3), r([pov(pt_at(t))[0][0] + 0.02, pov(pt_at(t))[0][1] - 10 * math.sin(math.radians(6 + 30 * smooth(0, 0.4, pt_at(t)))), pov(pt_at(t))[0][2] - 10])] for t in ts],
          "fov": 62},
  effects={**SLOW_FX, "flash": [{"at": 0, "dur": 0.2}], "shake": [[0, 0.8], [0.6, 0]]},
  hud={"alerts": [{"from": 0.2, "to": 5, "text": "FRICTION: OFF", "blink": True}]},
  captions=[{"from": 0.2, "to": 2.4, "text": "FRICTION IS GONE.", "style": "big", "hl": ["GONE."]},
            {"from": 2.5, "to": 4.9, "text": "Your phone slides right out of your hand.", "hl": ["slides"]}],
  sfx=[{"at": 0.0, "type": "boom", "gain": 1.0}, {"at": 0.05, "type": "glitch", "gain": 0.6}, {"at": 0.3, "type": "heartbeat", "dur": 4.5, "gain": 0.45}],
  ambience="slowmo")

# 3) your feet slide apart and you fall backwards (pt 0.45 .. 1.4)
a, b = 12.5, 23
ts = seg_time(a, b)
S(id="slip", frm=a, to=b, scene="frictioncity",
  params={"meShow": True, "meX": X_ME,
          "meZ": [[round(t - a, 3), round(me(pt_at(t))[0], 3)] for t in ts],
          "meSpread": [[round(t - a, 3), round(me(pt_at(t))[1], 3)] for t in ts],
          "meFall": [[round(t - a, 3), round(me(pt_at(t))[2], 3)] for t in ts]},
  camera={"path": "keys", "ease": "linear",
          "pos": [[round(t - a, 3), r(pov(pt_at(t))[0])] for t in ts],
          "look": [[round(t - a, 3), r(pov(pt_at(t))[1])] for t in ts],
          "roll": [[round(t - a, 3), round(pov(pt_at(t))[2], 2)] for t in ts],
          "fov": 64},
  effects={**SLOW_FX, "blur": [[0, 0], [5, 0.6], [9.5, 1.5], [10.5, 0.3]], "shake": [[9.8, 0], [10, 0.9], [10.5, 0.2]]},
  hud={"alerts": [{"from": 0, "to": 10.5, "text": "FRICTION: OFF", "blink": True}]},
  captions=[{"from": 0.3, "to": 4.2, "text": "Then your feet slide apart.", "hl": ["slide"]},
            {"from": 4.6, "to": 10.3, "text": "Walking only works because your shoes grip the ground.", "hl": ["grip"]}],
  sfx=[{"at": 0.2, "type": "heartbeat", "dur": 10, "gain": 0.5}, {"at": 3.5, "type": "whoosh", "dur": 2.5, "gain": 0.5},
       {"at": 9.9, "type": "thud", "gain": 1.0}],
  ambience="slowmo")

# 4) the street: cars that can't stop (pt 1.4 .. 2.2)
S(id="cars", frm=23, to=31, scene="frictioncity", transitionIn="whip",
  camera={"path": "dolly", "from": {"pos": [-3.5, 1.6, 2.5], "look": [6, 1, -16]}, "to": {"pos": [-2.5, 1.4, -0.5], "look": [7, 0.9, -18]}, "fov": 64, "ease": "linear"},
  effects=SLOW_FX,
  hud={"alerts": [{"from": 0.1, "to": 8, "text": "BRAKES: USELESS", "blink": True}]},
  captions=[{"from": 0.2, "to": 3.9, "text": "Cars can't brake, steer or speed up.", "hl": ["brake,"]},
            {"from": 4.1, "to": 7.9, "text": "The turning car keeps spinning… in a straight line.", "hl": ["spinning…"]}],
  sfx=[{"at": 0.4, "type": "warble", "dur": 6, "gain": 0.3}],
  ambience="slowmo")

# 5) the cup that doesn't move (pt 2.2 .. 2.7)
S(id="cup", frm=31, to=36.5, scene="frictioncity", transitionIn="whip",
  camera={"path": "dolly", "from": {"pos": [6.25, 1.25, -4.3], "look": [7.15, 0.82, -6.0]}, "to": {"pos": [6.35, 1.12, -4.75], "look": [7.15, 0.83, -6.0]}, "fov": 50},
  effects=SLOW_FX,
  captions=[{"from": 0.2, "to": 2.6, "text": "But this cup?", "style": "center", "hl": ["cup?"]},
            {"from": 2.7, "to": 5.4, "text": "It doesn't move. Nothing is pushing it.", "hl": ["doesn't"]}],
  sfx=[{"at": 0.3, "type": "tick", "dur": 5, "rate": 1, "gain": 0.3}],
  ambience="slowmo")

# 6) screws spin loose, the sign drops, the knot slips (pt 2.7 .. 3.5)
S(id="sign", frm=36.5, to=45, scene="frictioncity", transitionIn="whip",
  camera={"path": "keys", "pos": [[0, [5.6, 1.5, -3.2]], [8.5, [5.8, 1.4, -4.0]]],
          "look": [[0, [8.4, 3.2, -9]], [3.5, [8.3, 2.2, -9.4]], [6.0, [8.1, 1.6, -11.0]], [8.5, [8.0, 1.0, -11.5]]], "fov": 60},
  effects=SLOW_FX,
  captions=[{"from": 0.2, "to": 4.1, "text": "Screws only hold because of friction.", "hl": ["friction."]},
            {"from": 4.3, "to": 8.4, "text": "They spin loose. Knots slip open.", "hl": ["loose.", "open."]}],
  sfx=[{"at": 0.2, "type": "tick", "dur": 2.5, "rate": 5, "gain": 0.35}, {"at": 8.2, "type": "thud", "gain": 0.8}],
  ambience="slowmo")

# 7) the hill (pt 3.5 .. 4.3)
S(id="hill", frm=45, to=54, scene="frictioncity", transitionIn="whip",
  camera={"path": "dolly", "from": {"pos": [1.2, 2.6, -112], "look": [0, 4.2, -150]}, "to": {"pos": [0.9, 2.2, -117], "look": [0, 4.0, -150]}, "fov": 56},
  effects=SLOW_FX,
  captions=[{"from": 0.2, "to": 4.3, "text": "Anything on a slope starts to slide.", "hl": ["slide."]},
            {"from": 4.5, "to": 8.9, "text": "Parked cars. Bins. All heading downhill.", "hl": ["downhill."]}],
  sfx=[{"at": 0.3, "type": "hum", "dur": 8.5, "gain": 0.5}],
  ambience="slowmo")

# 8) drone shot, last 0.7 s of physics (pt 4.3 .. 5.0)
S(id="drone", frm=54, to=64.5, scene="frictioncity", transitionIn="whip",
  camera={"path": "dolly", "from": {"pos": [-6, 34, 4], "look": [3, 0, -14]}, "to": {"pos": [-2, 24, -4], "look": [4, 0, -17]}, "fov": 52},
  effects={**SLOW_FX, "redPulse": [[5, 0], [10.5, 0.4]]},
  hud={"alerts": [{"from": 0.2, "to": 10.5, "text": "FRICTION: OFF", "blink": True}]},
  captions=[{"from": 0.3, "to": 4.9, "text": "Everyone is sliding. Nobody can stop.", "hl": ["Nobody"]},
            {"from": 5.4, "to": 10.3, "text": "And then friction comes back. All at once.", "hl": ["once."]}],
  sfx=[{"at": 0.2, "type": "heartbeat", "dur": 10, "gain": 0.6}, {"at": 7.0, "type": "riser", "dur": 3.5, "gain": 0.8}],
  ambience="slowmo")

# 9) friction returns (real time)
S(id="back", frm=64.5, to=68, scene="frictioncity", transitionIn="flash",
  camera={"path": "pov-stand", "pos": [-0.5, 1.2, -22], "look": [3, 0.7, -36], "fov": 60},
  effects={"shake": [[0, 1], [1.5, 0.2]], "vignette": 0.5},
  hud={"tags": [{"from": 0.2, "to": 3.5, "text": "FRICTION: ON"}]},
  captions=[{"from": 0.1, "to": 1.7, "text": "FRICTION IS BACK.", "style": "big", "hl": ["BACK."]},
            {"from": 1.8, "to": 3.45, "text": "Every sliding car skids to a stop.", "hl": ["skids"]}],
  sfx=[{"at": 0.0, "type": "boom", "gain": 1.0}, {"at": 0.05, "type": "screech", "dur": 1.6, "gain": 0.8},
       {"at": 0.3, "type": "screech", "dur": 1.3, "gain": 0.6, "pan": 0.5}, {"at": 1.0, "type": "crash", "gain": 0.5}])

# 10) end card
S(id="end", frm=68, to=72, scene="black", transitionIn="dip",
  captions=[{"from": 0.2, "to": 3.9, "text": "Would you survive 5 seconds without friction?", "style": "center", "hl": ["survive"]}],
  sfx=[{"at": 0.2, "type": "boom", "gain": 0.5}])

# scene params: physical time for every frictioncity segment
for s in segs:
    if s["scene"] == "frictioncity":
        s.setdefault("params", {})["pt"] = pt_keys(s["frm"], s["to"])
        s["params"]["clock"] = 17.6

# countdown: FRICTION RETURNS IN (5 - pt), shown 7.5 .. 64.5
clock_keys = [[t, round(max(0.0, 5 - p), 4)] for t, p in PT_MAP if 7.5 <= t <= 64.5]

tl = {
    "meta": {
        "id": "FrictionGone",
        "title": "What If Friction Disappeared for 5 Seconds? (TikTok 1080x1920)",
        "fps": FPS, "width": 1080, "height": 1920, "fovScale": 1.3,
        "music": {"keys": [[0, 0.4], [7.5, 0.6], [30, 0.7], [54, 0.85], [64.4, 0.95], [64.5, 0.5], [72, 0.2]], "root": 49},
    },
    "hud": {"clock": {"label": "FRICTION RETURNS IN", "keys": clock_keys, "format": "countdown", "colorRamp": [5, 0]}, "start": 7.5, "end": 64.5},
    "segments": [{"id": s["id"], "from": s["frm"], "to": s["to"], **{k: v for k, v in s.items() if k not in ("id", "frm", "to")}} for s in segs],
}
json.dump(tl, open("src/timelines/friction-5s.json", "w"), indent=1)
print("wrote src/timelines/friction-5s.json", len(segs), "segments")
