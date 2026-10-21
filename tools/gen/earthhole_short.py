"""Generates src/timelines/earthhole-short.json (TikTok 9:16) in the fast 'montage' style:
a new shot every ~1.5 s, each with its own HUD counter + one short caption. All numbers come from
src/data/fall.json (PREM free fall, tools/physics/prem_fall.py) and the temperature anchors in engine/fall.ts.
usage: python3 tools/gen/earthhole_short.py [--until SECONDS]"""
import bisect, json, sys

F = json.load(open('src/data/fall.json')); ROWS = F['rows']; TC = F['Tc']
TEMP = [[0, -1.5], [4.26, 0], [6, 60], [11, 250], [30, 600], [100, 1300], [410, 1532], [660, 1680], [2800, 2257], [2891, 3700], [5150, 5230], [6371, 5300]]

def fall(s):  # story s -> (depth km, v km/h)
    if s <= ROWS[1][0]:
        return 0.5 * 9.83 * s * s / 1000, 9.83 * s * 3.6
    i = max(0, bisect.bisect_right([r[0] for r in ROWS], s) - 1); a, b = ROWS[i], ROWS[min(i + 1, len(ROWS) - 1)]
    u = 0 if b[0] == a[0] else (s - a[0]) / (b[0] - a[0])
    return a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u

def temp(d):
    for i in range(1, len(TEMP)):
        if d <= TEMP[i][0]:
            (d0, t0), (d1, t1) = TEMP[i - 1], TEMP[i]
            return t0 + (t1 - t0) * (d - d0) / (d1 - d0)
    return 5300

def keys(f, s0, s1, dur, n=6):  # value keyframes over a shot whose story time runs s0 -> s1
    return [[round(dur * i / n, 3), round(f(s0 + (s1 - s0) * i / n), 2)] for i in range(n + 1)]

def mmss(s): s = round(s); return f'{s // 60}:{s % 60:02d}'

until = float(sys.argv[sys.argv.index('--until') + 1]) if '--until' in sys.argv else 1e9
segs = []
def shot(id, a, b, scene, **kw):
    if a < until: segs.append(dict(id=id, **{'from': a, 'to': min(b, until)}, scene=scene, **kw))

# 1) HOOK: walk to the rim while the jump counts down in real time
shot('rim', 0.0, 3.0, 'northpole',
     params={'walk': [[0, 0], [2.95, 1]], 'drop': [[0, -1], [2.99, -1]], 'sunElev': 5, 'bloom': 0.15},
     camera={'path': 'keys', 'pos': [[0, [5.5, 2.0, 12.5]], [3.0, [3.2, 2.3, 8.4]]], 'look': [[0, [0, 1.1, 3.8]], [3.0, [0, 0.6, 2.6]]], 'fov': 40},
     effects={'vignette': 0.45}, hud={'telemetry': False},
     captions=[{'from': 0.15, 'to': 2.85, 'text': 'What if you fell into a hole|through the Earth?', 'style': 'top'}],
     sfx=[{'at': 0.0, 'type': 'footsteps', 'dur': 2.9, 'rate': 1.8, 'gain': 0.4}, {'at': 1.6, 'type': 'riser', 'dur': 1.4, 'gain': 0.5}])

# 2) THE DROP: looking straight down the shaft as he falls away
d2 = 1.6
shot('drop', 3.0, 4.6, 'northpole',
     params={'walk': 1, 'drop': [[0, 0], [d2, d2]], 'sunElev': 5, 'bloom': 0.15},
     camera={'path': 'keys', 'pos': [[0, [1.6, 6.0, 3.2]], [d2, [0.8, 7.5, 1.6]]], 'look': [[0, [0, -6, 0.3]], [d2, [0, -30, 0]]], 'fov': 46},
     transitionIn='cut', effects={'vignette': 0.5, 'shake': [[0, 0.5], [0.4, 0.15]]},
     hud={'telemetry': False, 'counter': {'label': 'DEPTH', 'value': keys(lambda s: fall(s)[0] * 1000, 0, d2, d2), 'unit': ' m', 'sub': 'NO AIR · NO BRAKES'}},
     captions=[{'from': 0.2, 'to': 1.6, 'text': 'No air. No brakes.', 'style': 'subtle'}],
     sfx=[{'at': 0.0, 'type': 'whoosh', 'gain': 0.9}, {'at': 0.05, 'type': 'subdrop', 'gain': 0.7}])

# 3) the ocean behind glass, sunlight dying (story 6 -> 9 s, ~200 m)
shot('ocean', 4.6, 6.2, 'tunnel',
     params={'view': 'close', 'exposure': 1.7, 'panic': 0.8, 's': [[0, 6.0], [1.6, 9.0]]},
     transitionIn='whip', effects={'speedLines': 0.25, 'vignette': 0.5},
     hud={'counter': {'label': 'DEPTH', 'value': keys(lambda s: fall(s)[0] * 1000, 6.0, 9.0, 1.6), 'unit': ' m', 'sub': f'SPEED {fall(9.0)[1]:.0f} KM/H'}},
     captions=[{'from': 0.15, 'to': 1.6, 'text': 'Below 200 m, the sunlight is gone.', 'style': 'subtle'}])

# 4) scale shot: the deepest hole humans ever dug (Kola, 12,262 m) - passed at story 0:50
s_kola = 49.9
shot('kola', 6.2, 8.0, 'earthcut',
     params={'labels': 0, 'spin': [[0, -30], [1.8, -24]], 's': [[0, s_kola], [1.8, s_kola + 2]], 'mark': 1, 'trail': 0},
     camera={'path': 'keys', 'pos': [[0, [2.6, 12.2, 5.5]], [1.8, [1.8, 11.4, 4.2]]], 'look': [[0, [0, 9.6, 0]], [1.8, [0, 9.4, 0]]], 'fov': 34},
     transitionIn='whip', effects={'vignette': 0.4},
     hud={'counter': {'label': 'DEEPEST HOLE EVER DUG', 'value': 0, 'format': 'text', 'text': '12.3 km', 'sub': f'YOU PASS IT AT {mmss(s_kola)}'}},
     captions=[{'from': 0.15, 'to': 1.8, 'text': 'The deepest hole ever dug: 12 km.|You pass it in 50 seconds.', 'style': 'subtle'}],
     sfx=[{'at': 0.9, 'type': 'thud', 'gain': 0.6}])

# 5) the rock outside starts to glow (story 1:12, 26 km)
s5a, s5b = 70.0, 76.0
shot('glow', 8.0, 9.6, 'tunnel',
     params={'view': 'side', 'bloom': 0.8, 'panic': 0.5, 's': [[0, s5a], [1.6, s5b]]},
     transitionIn='whip', effects={'speedLines': 0.45, 'shake': 0.25, 'vignette': 0.5},
     hud={'counter': {'label': 'ROCK OUTSIDE', 'value': keys(lambda s: temp(fall(s)[0]), s5a, s5b, 1.6), 'unit': ' °C', 'sub': f'{mmss(72)} INTO THE FALL'}},
     captions=[{'from': 0.15, 'to': 1.6, 'text': 'A minute in, the rock is hot enough to glow.', 'style': 'subtle'}])

# 6) tease: where this ends up (top speed at the centre)
shot('tease', 9.6, 11.0, 'earthcut',
     params={'labels': 0, 'spin': [[0, -12], [1.4, -2]], 's': [[0, 400], [1.4, 1145.4]], 'trail': 1},
     camera={'path': 'keys', 'pos': [[0, [20, 6, 16]], [1.4, [16, 4, 22]]], 'look': [[0, [0, 0, 0]], [1.4, [0, 0, 0]]], 'fov': 40},
     transitionIn='flash', effects={'vignette': 0.4},
     hud={'counter': {'label': 'TOP SPEED', 'value': round(fall(TC)[1]), 'unit': ' km/h', 'sub': 'AT THE CENTRE OF THE EARTH'}},
     captions=[{'from': 0.15, 'to': 1.4, 'text': 'And you never stop speeding up.', 'style': 'subtle'}],
     sfx=[{'at': 0.1, 'type': 'hum', 'dur': 1.3, 'gain': 0.4}])

end = segs[-1]['to']
tl = {
    'meta': {'id': 'EarthHoleShort', 'title': 'What if you fell into a hole through the Earth? (Short)', 'fps': 30, 'width': 1080, 'height': 1920,
             'fovScale': 1.3, 'music': {'keys': [[0, 0.35], [2.9, 0.6], [3.0, 0.75], [9.5, 0.85], [end, 0.9]], 'root': 49}},
    'hud': {'clock': {'label': 'YOU JUMP IN', 'keys': [[0, 3.0], [3.0, 0]], 'format': 'countdown', 'style': 'minimal', 'colorRamp': [1e9, 2e9], 'sub': 'THE HOLE: 12,742 KM DEEP'}, 'start': 0, 'end': 2.99},
    'segments': segs,
}
json.dump(tl, open('src/timelines/earthhole-short.json', 'w'), indent=1)
print('wrote earthhole-short.json', end, 's,', len(segs), 'shots')
