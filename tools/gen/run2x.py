"""'What if you ran twice as fast every 2 seconds?' — v2 (realistic hero, physics-checked), TikTok 1080x1920.
usage: python3 tools/gen/run2x.py [--until SECONDS]   -> src/timelines/run2x.json

Story clock = video clock: walk starts at T = 3 s at 5 km/h, speed doubles every 2 s:  v(T) = 5 * 2^((T-3)/2) km/h.
Every number in a caption is computed here from v(T) at the moment the caption appears.

Physics used (SI units):
  drag            F = 1/2 rho v^2 CdA, rho = 1.225 kg/m^3, CdA = 0.6 m^2 subsonic; ~x1.5 wave drag above Mach 1
  push force      m a + drag, m = 80 kg, a = v ln2 / 2   (speed doubles every 2 s)
  stagnation T    T0 = T (1 + 0.2 M^2), T = 288 K, M = v / 343 m/s
  facts           Bolt peak 44.72 km/h (Berlin 2009); water running needs ~30 m/s (Glasheen & McMahon 1996, Nature);
                  sound 1,235 km/h at 15 C; airliner cruise ~900 km/h; wool ignites ~570 C
"""
import json, math, sys

V0 = 5.0
T_WALK = 3.0
M = 80.0
RHO = 1.225
G = 9.81
UNTIL = float(sys.argv[sys.argv.index('--until') + 1]) if '--until' in sys.argv else 1e9


def speed(T):  # km/h
    return V0 * 2 ** (max(0.0, T - T_WALK) / 2)


def ms(T):
    return speed(T) / 3.6


def dist(T):  # metres run since T_WALK
    if T <= T_WALK:
        return 0.0
    return (V0 / 3.6) * (2 / math.log(2)) * (2 ** ((T - T_WALK) / 2) - 1)


def cadence(v):  # gait cycles per second for v km/h
    if v < 8:
        return 0.19 * v
    if v < 40:
        return 1.4 + (v - 8) * 0.03
    return min(3.4, 2.36 + (v - 40) * 0.01)


def phase_at(T):
    ph, s, dt = 0.0, T_WALK, 1 / 240
    while s < T - 1e-9:
        ph += cadence(speed(s)) * dt
        s += dt
    return ph


def mach(T):
    return ms(T) / 343.0


def drag(T):
    m = mach(T)
    cda = 0.6 * (1.5 if m > 1.2 else 1.0 + 0.5 * max(0.0, min(1.0, (m - 0.8) / 0.4)))
    return 0.5 * RHO * ms(T) ** 2 * cda


def push(T):  # total force the legs must deliver (N)
    return M * ms(T) * math.log(2) / 2 + drag(T)


def stag_C(T):
    return 288 * (1 + 0.2 * mach(T) ** 2) - 273


def smooth(a, b, x):
    u = max(0.0, min(1.0, (x - a) / (b - a)))
    return u * u * (3 - 2 * u)


def run_mix(T):
    return smooth(7, 10, speed(T))


def sprint_mix(T):
    return smooth(20, 45, speed(T))


def lean(T):  # torso lean (rad): into the wind, capped for a believable pose
    return min(0.6, 0.04 + 0.5 * math.atan(drag(T) / (M * G)))


def heat(T):  # 0..0.5 smoulder (stagnation heating), 0.5..1 plasma
    return 0.5 * smooth(500, 1700, stag_C(T)) + 0.5 * smooth(15000, 30000, speed(T))


def fmt(v):
    return f"{v:,.0f}"


def keys(a, b, f, step=0.1, nd=4):
    out, t = [], 0.0
    while t < b - a - 1e-9:
        out.append([round(t, 3), round(f(a + t), nd)])
        t += step
    out.append([round(b - a, 3), round(f(b), nd)])
    return out


def hero_keys(a, b, **over):
    h = {"phase": keys(a, b, phase_at, 0.05), "run": keys(a, b, run_mix), "sprint": keys(a, b, sprint_mix), "lean": keys(a, b, lean), "heat": keys(a, b, heat), "hatFly": -1, "show": 1}
    h.update(over)
    return h


def scroll_keys(a, b, cap):
    out, s, t, dt, nxt = [[0, 0.0]], 0.0, 0.0, 1 / 240, 0.05
    while t < b - a - 1e-9:
        s += min(ms(a + t), cap) * dt
        t += dt
        if t >= nxt - 1e-9:
            out.append([round(t, 3), round(s, 3)])
            nxt += 0.05
    return out


segs = []


def add(sid, a, b, scene, params, **kw):
    if a >= UNTIL:
        return
    seg = {"id": sid, "from": round(a, 3), "to": round(b, 3), "scene": scene, "params": params}
    seg.update(kw)
    segs.append(seg)


def C(T, a, text, end):
    return {"from": round(T - a, 3), "to": round(end - a, 3), "text": text, "style": "subtle"}


CARS = [  # city traffic (x lane, z, v m/s along z; negative v = toward -z)
    {"x": 4.8, "z": -30, "v": -11, "c": "#7d1a1a"}, {"x": 1.6, "z": -8, "v": -12, "c": "#e9e9e9"}, {"x": 1.6, "z": -70, "v": -12, "c": "#1f3a6e"},
    {"x": -1.6, "z": -60, "v": 12, "c": "#2a2a2a"}, {"x": -4.8, "z": -20, "v": 10, "c": "#c8b27a"}, {"x": -1.6, "z": -130, "v": 12, "c": "#5d666d"},
    {"x": 4.8, "z": -110, "v": -11, "c": "#2c5a3a"}, {"x": -4.8, "z": -95, "v": 11, "c": "#b0b4b8"},
    {"x": 6.0, "z": -160, "v": 0, "c": "#3c4652", "rot": 3.1416}, {"x": -6.0, "z": -85, "v": 0, "c": "#8a8f96", "rot": 0},
]

# ================================================================= 0 – 1.2  HOOK: flash-forward to the footstep blasts (T ~ 33.5)
T_H = 33.5
e_step = 0.5 * M * ms(T_H) ** 2 * math.log(2) / cadence(speed(T_H)) / 2 / 4.184e9  # tons TNT poured in per step
hook_z = [[0, -30], [1.2, -112]]
blasts = []
for k in range(9):
    tb = 0.12 + k * 0.12
    zb = -30 - (82) * (tb / 1.2)
    blasts.append({"t": round(tb, 3), "x": round(2.0 + (0.25 if k % 2 else -0.25), 2), "z": round(zb, 2), "e": round(min(e_step, 6.0), 2)})
HOOK_CARS = [{"x": 5.6, "z": -62, "v": 0, "c": "#7d1a1a", "rot": 3.1416}, {"x": -1.6, "z": -80, "v": 0, "c": "#e9e9e9", "rot": 0.2},
             {"x": 4.0, "z": -96, "v": 0, "c": "#1f3a6e", "rot": 2.9}, {"x": -4.8, "z": -50, "v": 0, "c": "#c8b27a", "rot": 0}]
add("hook", 0, 1.2, "city2", {
    "hero": {"x": 2.0, "z": hook_z, "rotY": 3.1416, "phase": [[0, 0], [1.2, 2.2]], "run": 1, "sprint": 1, "lean": 0.5, "heat": 0.75, "hatFly": 99},
    "blasts": blasts, "cars": HOOK_CARS, "aura": 0.5, "trail": 0.5, "flames": 0.6, "bloom": 0.6, "peds": 0, "sunElev": 30},
    camera={"path": "keys", "pos": [[0, [-7.5, 3.2, -46]], [1.2, [-7.0, 3.0, -122]]], "look": [[0, [2.0, 1.2, -28]], [1.2, [2.0, 1.2, -110]]], "fov": 48, "ease": "linear"},
    effects={"shake": [[0, 0.3], [0.2, 1.0], [1.1, 1.2]], "impact": [{"at": 0.13, "dur": 0.07}], "vignette": 0.45},
    captions=[{"from": 0.0, "to": 3.0, "text": "What if you ran twice as fast|every 2 seconds?", "style": "top"}],
    sfx=[{"at": 0.12 + 0.12 * k, "type": "boom", "gain": 0.9 if k == 0 else 0.55} for k in range(9)] + [{"at": 0.15, "type": "crash", "gain": 0.6}])

# ================================================================= 1.2 – 3  aerial reveal, he hasn't started yet
add("reveal", 1.2, 3.0, "city2", {
    "hero": {"x": 9.2, "z": 0, "rotY": 3.1416, "phase": [[0, 0], [1.8, 0.4]], "run": 0, "sprint": 0, "lean": 0, "heat": 0, "hatFly": -1},
    "cars": CARS, "bloom": 0.3,
    "rig": {"mode": "aerial", "dist": [[0, 30], [1.8, 5.5]], "height": [[0, 60], [1.8, 3.2]], "side": [[0, -6], [1.8, -1.0]], "ahead": [[0, 20], [1.8, 0.5]], "look": 1.0, "fov": [[0, 50], [1.8, 42]]}},
    effects={"vignette": 0.4}, sfx=[{"at": 0.0, "type": "whoosh", "gain": 0.6}])

# ================================================================= 3 – 11.9  the city
def city_hero(a, b, x, **over):
    h = hero_keys(a, b, **over)
    h.update({"x": x, "z": keys(a, b, lambda T: -dist(T), 0.05, 3), "rotY": 3.1416})
    return h


a, b = 3.0, 6.0
add("walk", a, b, "city2", {"hero": city_hero(a, b, 9.2), "cars": CARS, "aperture": 0.00035, "bloom": 0.3,
    "rig": {"mode": "front", "dist": [[0, 3.4], [3, 3.9]], "height": 1.5, "side": 0.4, "look": 1.3, "fov": 38}},
    effects={"vignette": 0.42}, captions=[C(3.3, a, "It starts|with a walk.", 5.85)],
    sfx=[{"at": 0.05, "type": "footsteps", "dur": 2.9, "rate": 1.9, "gain": 0.55}])

a, b = 6.0, 8.0
add("jog", a, b, "city2", {"hero": city_hero(a, b, 8.6), "cars": CARS, "aperture": 0.0003, "bloom": 0.3,
    "rig": {"mode": "side", "dist": -3.6, "height": 1.15, "side": [[0, -0.8], [2, 0.6]], "look": 1.1, "fov": 40}},
    effects={"vignette": 0.42},
    captions=[C(6.05, a, "Every 2 seconds,|twice as fast.", 6.95), C(7.0, a, f"{fmt(speed(7.0))} km/h.|A good jog.", 8.0)],
    sfx=[{"at": 0.0, "type": "whoosh", "gain": 0.5}, {"at": 0.05, "type": "footsteps", "dur": 1.95, "rate": 2.8, "gain": 0.6}])

T_BOLT = T_WALK + 2 * math.log2(44.72 / V0)
a, b = 8.0, 10.4
add("bolt", a, b, "city2", {"hero": city_hero(a, b, [[0, 7.6], [1.0, 4.8]]), "cars": CARS, "aperture": 0.00025, "bloom": 0.35,
    "rig": {"mode": "low", "dist": [[0, 4.4], [2, 5.4]], "height": 0.45, "side": 0.8, "look": 1.0, "fov": 54}},
    effects={"speedLines": [[0, 0.08], [2, 0.3]], "vignette": 0.45, "shake": 0.1},
    captions=[C(T_BOLT, a, f"{speed(T_BOLT):.1f} km/h.|Faster than Usain Bolt.", 10.4)],
    sfx=[{"at": 0.0, "type": "whoosh", "gain": 0.6}, {"at": 0.05, "type": "footsteps", "dur": 1.95, "rate": 4.0, "gain": 0.65}])

T_HAT = 10.45
a, b = 10.4, 11.9
add("hat", a, b, "city2", {"hero": city_hero(a, b, 4.8, hatFly=[[0, -1], [T_HAT - a - 0.001, -1], [T_HAT - a, 0], [b - a, b - T_HAT]]), "cars": CARS, "wind": [[0, 0.3], [1, 1]], "bloom": 0.35,
    "rig": {"mode": "front", "dist": [[0, 4.6], [1.9, 5.6]], "height": [[0, 1.2], [1.9, 1.0]], "side": [[0, 1.0], [1.9, 1.5]], "look": 1.2, "fov": 46}},
    effects={"speedLines": 0.25, "vignette": 0.42, "shake": 0.2},
    captions=[C(T_HAT, a, f"{fmt(speed(T_HAT))} km/h.|The wind takes your hat.", 11.15), C(11.2, a, f"{fmt(speed(11.2))} km/h.|Behind you, a gale.", b)],
    sfx=[{"at": 0, "type": "whoosh", "gain": 0.7}, {"at": 0.05, "type": "footsteps", "dur": 1.8, "rate": 5, "gain": 0.5}, {"at": T_HAT - a, "type": "whoosh", "gain": 0.5, "pan": -0.4}], ambience="roar")

# ================================================================= 11.9 – 18.9  water, highway, train, drag, jet
def land_hero(a, b, **over):
    return hero_keys(a, b, hatFly=99, **over)  # hat is long gone


T_W = T_WALK + 2 * math.log2(108 / V0)
a, b = 11.9, 13.9
add("water", a, b, "land2", {"biome": "water", "scroll": scroll_keys(a, b, 45), "vis": 40, "cad": cadence(speed(12.9)), "hero": land_hero(a, b), "splash": 1, "bloom": 0.45, "aperture": 0.0002,
    "rig": {"mode": "front", "dist": [[0, 6.5], [2, 5.0]], "height": [[0, 0.8], [2, 1.2]], "side": [[0, 2.6], [2, 1.6]], "look": 1.0, "fov": 46}},
    transitionIn="whip", effects={"speedLines": [[0, 0.15], [2, 0.3]], "vignette": 0.42, "shake": 0.2},
    captions=[C(max(T_W, a + 0.05), a, f"{fmt(speed(max(T_W, a + 0.05)))} km/h.|Fast enough to run on water.", b)],
    sfx=[{"at": 0.0, "type": "whoosh", "gain": 0.8}, {"at": 0.05, "type": "footsteps", "dur": 1.9, "rate": 6, "gain": 0.3}], ambience="roar")

a, b = 13.9, 15.0
add("highway", a, b, "land2", {"biome": "highway", "scroll": scroll_keys(a, b, 70), "vis": 70, "cad": 3.4, "hero": land_hero(a, b), "carRel": round(1 - 110 / speed(14.4), 3), "dust": 0.35, "bloom": 0.4,
    "rig": {"mode": "low", "dist": [[0, 6], [1.1, 4.5]], "height": [[0, 0.7], [1.1, 0.5]], "side": [[0, 2.5], [1.1, 1.2]], "look": 1.4, "fov": 56}},
    transitionIn="whip", effects={"speedLines": 0.25, "vignette": 0.4, "shake": 0.25},
    captions=[C(13.95, a, f"{fmt(speed(13.95))} km/h.|The highway looks parked.", b)],
    sfx=[{"at": 0.0, "type": "whoosh", "gain": 0.7}], ambience="roar")


def train_z(T):
    s, t, dt = -14.0, 15.0, 1 / 240
    while t < T:
        s += (ms(t) - 320 / 3.6) * dt * 0.5  # relative speed, halved (the visual world scroll is capped too)
        t += dt
    return s


a, b = 15.0, 16.6
add("train", a, b, "land2", {"biome": "rails", "scroll": scroll_keys(a, b, 80), "vis": 80, "cad": 3.4, "hero": land_hero(a, b), "trainZ": keys(a, b, train_z), "dust": 0.4, "bloom": 0.4, "aperture": 0.00015,
    "rig": {"mode": "side", "dist": [[0, -7.5], [1.6, -6.5]], "height": [[0, 1.5], [1.6, 1.8]], "side": [[0, 0.8], [1.6, -0.6]], "look": 1.5, "fov": 52}},
    transitionIn="whip", effects={"speedLines": 0.3, "vignette": 0.42, "shake": 0.25},
    captions=[C(15.0, a, f"{fmt(speed(15.0))} km/h.|Overtaking a bullet train.", b)],
    sfx=[{"at": 0.0, "type": "whoosh", "gain": 0.8}, {"at": 0.1, "type": "hum", "dur": 1.5, "gain": 0.4}], ambience="roar")

T_D = 17.0
a, b = 16.6, 18.0
add("drag", a, b, "land2", {"biome": "road", "scroll": scroll_keys(a, b, 95), "vis": 95, "cad": 3.4, "hero": land_hero(a, b), "dust": 0.9, "bloom": 0.4,
    "rig": {"mode": "front", "dist": [[0, 3.8], [1.4, 3.2]], "height": [[0, 1.3], [1.4, 1.1]], "side": [[0, -1.6], [1.4, -1.0]], "look": 1.1, "fov": 44}},
    transitionIn="whip", effects={"speedLines": 0.4, "vignette": 0.45, "shake": 0.45},
    captions=[C(T_D, a, f"{fmt(speed(T_D))} km/h.|The air pushes back with {drag(T_D) / (1000 * G):.1f} tons of force.", b)],
    sfx=[{"at": 0.0, "type": "whoosh", "gain": 0.9}], ambience="roar")

a, b = 18.0, 18.9
add("jet", a, b, "land2", {"biome": "road", "scroll": scroll_keys(a, b, 110), "vis": 110, "cad": 3.4, "hero": land_hero(a, b), "jet": [[0, [10, 80, 0]], [0.9, [10, 80, 70]]], "dust": 0.7, "bloom": 0.45,
    "rig": {"mode": "low", "dist": 3.6, "height": 0.3, "side": 0.9, "look": 4.0, "fov": 74}},
    effects={"speedLines": 0.35, "vignette": 0.45, "shake": 0.35},
    captions=[C(18.0, a, f"{fmt(speed(18.0))} km/h.|Faster than a jet airliner.", b)],
    sfx=[{"at": 0.0, "type": "whoosh", "gain": 0.8}, {"at": 0.05, "type": "hum", "dur": 0.85, "gain": 0.7}], ambience="roar")

T_S = T_WALK + 2 * math.log2(1235 / V0)
a, b = 18.9, 20.6
add("barrier", a, b, "land2", {"biome": "road", "scroll": scroll_keys(a, b, 120), "vis": 120, "cad": 3.4, "hero": land_hero(a, b), "cone": [[0, 0.3], [0.1, 1.0], [1.7, 0.6]], "domes": [round(T_S - a + 0.02, 3), 0.75], "dust": 1, "bloom": 0.5,
    "rig": {"mode": "side", "dist": [[0, 7.5], [1.7, 6]], "height": [[0, 1.3], [1.7, 1.9]], "side": [[0, 0.5], [1.7, -1.2]], "look": 1.1, "fov": 48}},
    transitionIn="flash", effects={"impact": [{"at": max(0.02, round(T_S - a, 3)), "dur": 0.13}], "shake": [[0, 1.2], [0.4, 0.5]], "speedLines": 0.4, "vignette": 0.45},
    captions=[C(max(T_S, a + 0.05), a, f"{fmt(speed(max(T_S, a + 0.05)))} km/h.|You break the sound barrier.", b)],
    sfx=[{"at": max(0.02, round(T_S - a, 3)), "type": "boom", "gain": 1.3}, {"at": 0.75, "type": "boom", "gain": 0.7}], ambience="roar")

# ================================================================= 20.6 – 25.5  Mach 2 windows, the road breaks, fire
a, b = 20.6, 22.2
v2 = ms(20.9)
pass_t = 0.9  # local time the hero passes the camera
add("mach2", a, b, "city2", {
    "hero": {"x": 2.0, "z": [[0, -100 + v2 * pass_t], [b - a, -100 - v2 * (b - a - pass_t)]], "rotY": 3.1416, "phase": [[0, 0], [b - a, 5]], "run": 1, "sprint": 1, "lean": 0.6, "heat": round(heat(20.9), 3), "hatFly": 99},
    "shockV": round(v2, 1), "cars": CARS, "peds": 1, "bloom": 0.5, "trail": 0.5, "cone": 0.8, "dust": [[0, 0], [pass_t, 0], [pass_t + 0.3, 1]]},
    camera={"path": "pov-stand", "pos": [-9.5, 1.6, -100], "look": [-2, 3.0, -40], "breathe": 0.4, "fov": 52},
    transitionIn="whip", effects={"impact": [{"at": pass_t, "dur": 0.1}], "shake": [[pass_t - 0.05, 0], [pass_t + 0.05, 1.6], [b - a, 0.5]], "vignette": 0.45},
    captions=[C(20.9, a, "Mach 2.|Every window you pass shatters.", b)],
    sfx=[{"at": 0.0, "type": "riser", "dur": pass_t, "gain": 0.5}, {"at": pass_t, "type": "boom", "gain": 1.3}, {"at": pass_t + 0.05, "type": "crash", "gain": 1.0}, {"at": pass_t + 0.4, "type": "crash", "gain": 0.6}])

T_C = 22.3
a, b = 22.2, 23.6
add("craters", a, b, "land2", {"biome": "road", "scroll": scroll_keys(a, b, 140), "vis": 140, "cad": 3.4, "hero": land_hero(a, b), "craters": 1, "dust": 0.8, "cone": 0.5, "bloom": 0.45,
    "rig": {"mode": "aerial", "dist": [[0, 10], [1.4, 8]], "height": [[0, 5.5], [1.4, 4.2]], "side": [[0, 3.5], [1.4, 2.5]], "ahead": 5, "fov": 50}},
    transitionIn="whip", effects={"speedLines": 0.3, "vignette": 0.45, "shake": 0.5},
    captions=[C(T_C, a, f"{fmt(speed(T_C))} km/h.|Each step pushes with {push(T_C) / (1000 * G):.0f} tons.|The road breaks.", b)],
    sfx=[{"at": 0.0, "type": "whoosh", "gain": 0.9}] + [{"at": round(k * 0.15, 2), "type": "thud", "gain": 0.7} for k in range(9)], ambience="roar")

T_F = 23.65
a, b = 23.6, 25.5
add("fire", a, b, "land2", {"biome": "road", "scroll": scroll_keys(a, b, 140), "vis": 140, "cad": 3.4, "hero": land_hero(a, b), "fire": [[0, 0.4], [0.6, 1]], "burn": [[0, 0.3], [0.8, 1]], "flames": [[0, 0.1], [1.0, 0.9]], "cone": 0.4, "dust": 0.4, "bloom": 0.75, "sunElev": 14,
    "rig": {"mode": "side", "dist": [[0, 5.0], [1.9, 4.2]], "height": [[0, 0.7], [1.9, 0.9]], "side": [[0, 0.6], [1.9, -0.2]], "look": 0.85, "fov": 44}},
    transitionIn="flash", effects={"speedLines": 0.35, "vignette": 0.5, "shake": 0.35},
    captions=[C(T_F, a, f"{fmt(speed(T_F))} km/h.|The air ahead hits {round(stag_C(T_F), -2):,.0f} °C.", 24.6), C(24.6, a, "Your suit|catches fire.", b)],
    sfx=[{"at": 0.0, "type": "whoosh", "gain": 0.8}, {"at": 0.2, "type": "hum", "dur": 1.7, "gain": 0.4}], ambience="roar")

END = max(s["to"] for s in segs)
ks = [[0, 296.4], [1.2, 296.4], [1.2001, V0], [T_WALK, V0]]
ks[0][1] = ks[1][1] = round(speed(T_H), 0)
T = T_WALK + 1 / 30
while T < END + 1e-6:
    ks.append([round(T, 4), round(speed(T), 2)])
    T += 1 / 30

tl = {
    "meta": {"id": "Run2x", "title": "What if you ran twice as fast every 2 seconds?", "fps": 30, "width": 1080, "height": 1920, "fovScale": 1.0,
             "music": {"keys": [[0, 0.75], [1.2, 0.35], [3, 0.4], [10, 0.6], [19, 0.8], [25.5, 0.85]], "root": 55}},
    "hud": {"clock": {"label": "SPEED", "sub": "×2 EVERY 2 SECONDS", "keys": ks, "format": "number", "decimals": 1, "unit": " km/h", "colorRamp": [0, 1e12], "style": "minimal"}, "start": 0},
    "segments": segs,
}
json.dump(tl, open("src/timelines/run2x.json", "w"), indent=1)
print("wrote", len(segs), "segments, end", END)
for s in segs:
    for c in s.get("captions", []):
        print(f"{s['from'] + c['from']:6.2f}  {c['text']}")
print(f"hook step energy {e_step:.1f} t TNT/step at {speed(T_H):,.0f} km/h")
