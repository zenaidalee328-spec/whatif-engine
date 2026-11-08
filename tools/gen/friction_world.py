"""What If Friction Disappeared for 5 Seconds? — v2, one continuous camera journey (TikTok 1080x1920, 70 s).
street -> roofs & scaffolding -> towers -> hills sliding -> white-out -> Earth's faults -> friction returns -> aftermath.
Writes src/timelines/friction-world.json.   usage: python3 tools/gen/friction_world.py
"""
import json

T_EVENT, T_SPACE, T_BACK, T_END = 4.5, 38.0, 58.0, 70.0
# video T -> physical pt (seconds since friction vanished)
PT_MAP = [(0, -T_EVENT), (T_EVENT, 0.0), (10, 1.3), (14, 1.75), (24, 2.6), (T_SPACE, 3.85), (T_BACK, 5.0), (64, 7.0), (T_END, 9.0)]

# continuous city camera (T, pos, look) — Catmull-Rom through these
CITY = [
    (0.0, (0.6, 4.2, 40.0), (0.0, 4.6, -10.0)),
    (T_EVENT, (0.4, 5.3, 34.0), (-0.6, 5.6, -12.0)),
    (10.0, (-0.6, 10.5, 26.0), (-2.8, 7.2, -16.0)),
    (15.0, (-2.5, 21.0, 21.0), (-5.0, 6.0, -18.0)),
    (21.0, (0.0, 42.0, 14.0), (0.0, 12.0, -70.0)),
    (28.0, (0.0, 80.0, -110.0), (0.0, 25.0, -330.0)),
    (34.0, (0.0, 120.0, -150.0), (0.0, 28.0, -340.0)),
    (T_SPACE, (0.0, 140.0, -190.0), (0.0, 280.0, -380.0)),
]
AFTER = [
    (T_BACK, (2.0, 12.0, 30.0), (-4.0, 4.0, -6.0)),
    (64.0, (1.0, 18.0, 38.0), (-3.0, 5.0, -12.0)),
    (T_END, (0.0, 48.0, 75.0), (0.0, 18.0, -260.0)),
]
PLANET = [
    (T_SPACE, (0.0, 9.0, 80.0), (0.0, 0.0, 0.0)),
    (52.0, (2.0, 5.0, 36.0), (0.0, 0.0, 0.0)),
    (T_BACK, (3.0, 3.5, 19.0), (0.0, 0.5, 0.0)),
]


def lerp(a, b, u):
    return a + (b - a) * u


def pt_at(T):
    for (t0, p0), (t1, p1) in zip(PT_MAP, PT_MAP[1:]):
        if T <= t1:
            return lerp(p0, p1, (T - t0) / (t1 - t0))
    return PT_MAP[-1][1]


def catmull(points, T, idx):
    ts = [p[0] for p in points]
    i = next((k for k in range(len(ts) - 1) if T <= ts[k + 1]), len(ts) - 2)
    p0, p1, p2, p3 = (points[max(0, i - 1)][idx], points[i][idx], points[i + 1][idx], points[min(len(points) - 1, i + 2)][idx])
    u = max(0.0, min(1.0, (T - ts[i]) / (ts[i + 1] - ts[i])))
    return [round(0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u ** 3), 3)
            for a, b, c, d in zip(p0, p1, p2, p3)]


def cam(path, a, b, fov, step=0.1):
    n = max(1, round((b - a) / step))
    ts = [a + (b - a) * i / n for i in range(n + 1)]
    return {"path": "keys", "ease": "linear", "fov": fov,
            "pos": [[round(t - a, 3), catmull(path, t, 1)] for t in ts],
            "look": [[round(t - a, 3), catmull(path, t, 2)] for t in ts]}


def pt_keys(a, b):
    pts = sorted({a, b, *[t for t, _ in PT_MAP if a < t < b]})
    return [[round(t - a, 4), round(pt_at(t), 5)] for t in pts]


SLOW = {"vignette": 0.55, "desaturate": 0.2, "tint": {"color": "#3a6fd8", "amount": 0.22}}


def city(sid, a, b, extra_params=None, **kw):
    params = {"pt": pt_keys(a, b), "clock": 17.6}
    params.update(extra_params or {})
    return {"id": sid, "from": a, "to": b, "scene": "frictioncity", "params": params, "camera": cam(CITY if b <= T_SPACE else AFTER, a, b, 64), **kw}


def sub(a, b, text, **k):
    return {"from": a, "to": b, "text": text, "style": "subtle", **k}


segs = [
    city("before", 0, T_EVENT, {"glow": [[3.0, 0], [3.9, 1]]},
         effects={"vignette": 0.5, "desaturate": [[2.8, 0], [3.9, 0.35]], "tint": {"color": "#1a2a55", "amount": [[2.8, 0], [3.9, 0.3]]}},
         captions=[{"from": 0.2, "to": 4.45, "text": "What if friction disappeared for 5 seconds?", "style": "top", "hl": ["friction"]},
                   sub(2.9, 4.45, "Friction is holding all of this together.")],
         sfx=[{"at": 0.1, "type": "tick", "dur": 4.3, "rate": 1, "gain": 0.4}, {"at": 2.8, "type": "riser", "dur": 1.7, "gain": 0.7}]),
    city("street", T_EVENT, 14, {"glow": [[0, 1], [0.15, 1], [0.6, 0.55], [1.4, 0]], "dust": [[3.5, 0], [9.5, 0.6]]},
         effects={**SLOW, "flash": [{"at": 0, "dur": 0.1}], "shake": [[0, 0.5], [0.6, 0]], "tint": {"color": "#3a6fd8", "amount": [[0, 0.1], [1, 0.22]]}},
         captions=[sub(0.4, 2.6, "Every grip on Earth just let go."), sub(2.8, 5.6, "Roof tiles slide off. Scaffolding drops."),
                   sub(5.9, 9.3, "Scaffold clamps hold on by friction alone.")],
         sfx=[{"at": 0.0, "type": "boom", "gain": 1.0}, {"at": 0.3, "type": "heartbeat", "dur": 9, "gain": 0.4},
              {"at": 3.0, "type": "crash", "gain": 0.3}, {"at": 4.6, "type": "thud", "gain": 0.5}, {"at": 6.8, "type": "crash", "gain": 0.35},
              {"at": 8.2, "type": "thud", "gain": 0.6}],
         ambience="slowmo"),
    city("towers", 14, 24, {"dust": 0.7},
         effects=SLOW,
         captions=[sub(0.3, 3.6, "Cars can't stop. People can't stand."), sub(3.9, 6.9, "Steel towers sway as bolted joints slip."),
                   sub(7.1, 9.9, "And the ground? Soil is grains held together by friction.")],
         sfx=[{"at": 0.2, "type": "hum", "dur": 9.6, "gain": 0.5}, {"at": 4.0, "type": "warble", "dur": 3, "gain": 0.3}],
         ambience="slowmo"),
    city("hills", 24, T_SPACE, {"dust": [[0, 0.7], [8, 1.0]]},
         effects={**SLOW, "shake": [[2, 0], [5, 0.15], [12, 0.25]], "fade": {"color": "#ffffff", "amount": [[10.6, 0], [14, 1]]}},
         captions=[sub(0.5, 4.5, "Hillsides start to flow like liquid."), sub(4.8, 9.3, "Whole slopes slide, carrying houses and trees with them."),
                   sub(9.8, 13.4, "But it goes deeper than the soil.")],
         sfx=[{"at": 0.4, "type": "boom", "gain": 0.6}, {"at": 1.0, "type": "hum", "dur": 12, "gain": 0.7}, {"at": 5.0, "type": "boom", "gain": 0.5},
              {"at": 10.5, "type": "riser", "dur": 3.5, "gain": 0.6}],
         ambience="slowmo"),
    {"id": "planet", "from": T_SPACE, "to": T_BACK, "scene": "planet",
     "params": {"faults": [[0, 0], [6.4, 0.05], [7.6, 1.0]], "quake": [[7, 0], [9, 0.5], [20, 1.0]], "clouds": 1, "spin": [[0, 58], [20, 92]]},
     "camera": cam(PLANET, T_SPACE, T_BACK, 40),
     "effects": {"fade": {"color": "#ffffff", "amount": [[0, 1], [1.8, 0]]}, "vignette": 0.5, "redPulse": [[13, 0], [20, 0.3]], "shake": [[15, 0], [20, 0.35]]},
     "captions": [sub(1.8, 6.2, "Tectonic plates are locked together by friction."), sub(6.6, 11.2, "Now every fault on Earth can slip at once."),
                  sub(11.6, 15.6, "Earthquakes on every continent.")],
     "sfx": [{"at": 7.0, "type": "boom", "gain": 1.0}, {"at": 7.3, "type": "hum", "dur": 12.5, "gain": 0.9}, {"at": 9.5, "type": "boom", "gain": 0.6},
             {"at": 14.0, "type": "heartbeat", "dur": 6, "gain": 0.7}, {"at": 16.4, "type": "riser", "dur": 3.6, "gain": 0.9}],
     "ambience": "space"},
    city("back", T_BACK, 64, {"dust": [[0, 1.0], [6, 0.85]]},
         transitionIn="flash",
         effects={"shake": [[0, 1.0], [1.6, 0.1]], "vignette": 0.5},
         captions=[{"from": 0.2, "to": 2.8, "text": "FRICTION IS BACK.", "style": "top"}, sub(2.9, 5.9, "Everything stops… wherever it happens to be.")],
         sfx=[{"at": 0.0, "type": "boom", "gain": 1.0}, {"at": 0.05, "type": "screech", "dur": 1.6, "gain": 0.7},
              {"at": 0.25, "type": "screech", "dur": 1.2, "gain": 0.5, "pan": 0.5}, {"at": 0.4, "type": "crash", "gain": 0.6}, {"at": 1.2, "type": "crash", "gain": 0.4}]),
    city("aftermath", 64, T_END, {"dust": [[0, 0.85], [6, 0.7]]},
         effects={"vignette": [[0, 0.5], [6, 0.7]], "fade": {"color": "#000000", "amount": [[5.2, 0], [6, 0.6]]}},
         captions=[{"from": 0.4, "to": 5.9, "text": "Would you survive 5 seconds without friction?", "style": "top", "hl": ["survive"]}],
         sfx=[{"at": 0.3, "type": "hum", "dur": 5.5, "gain": 0.3}]),
]
clock_keys = [[0, T_EVENT], [T_EVENT, 0.0], [T_EVENT + 0.001, 5.0]] + [[t, round(5 - p, 4)] for t, p in PT_MAP if T_EVENT < t <= T_BACK]
tl = {
    "meta": {"id": "FrictionWorld", "title": "What If Friction Disappeared for 5 Seconds? v2 (TikTok)", "fps": 30, "width": 1080, "height": 1920, "fovScale": 1.3,
             "music": {"keys": [[0, 0.35], [4.4, 0.6], [4.5, 0.75], [24, 0.8], [38, 0.85], [57.9, 1.0], [58, 0.6], [64, 0.4], [70, 0.15]], "root": 49}},
    "hud": {"clock": {"label": "FRICTION DISAPPEARS IN", "labelKeys": [[0, "FRICTION DISAPPEARS IN"], [T_EVENT, "FRICTION RETURNS IN"]], "keys": clock_keys,
                      "format": "countdown", "colorRamp": [5, 0], "style": "minimal"}, "start": 0, "end": T_BACK + 0.2},
    "segments": segs,
}
json.dump(tl, open("src/timelines/friction-world.json", "w"), indent=1)
print("wrote src/timelines/friction-world.json", T_END, "s")
