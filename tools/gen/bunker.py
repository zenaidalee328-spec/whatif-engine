"""How a Hole on a Beach Becomes a Bunker (TikTok/Shorts 1080x1920, 61.6 s) -- full build of the Liam3d-style short.
usage: KOKORO_DIR=/tmp/tts python3 tools/gen/bunker.py [full|demo]  -> src/timelines/bunker.json (+ public/audio/vo/Bunker_*.wav)
Beat timing, camera moves and visuals follow docs/ref3-*.md (reference viewed frame by frame at 30 fps).
The voiceover lines are our own wording; each sentence is time-fitted (Kokoro speed) to the reference beat window.
"""
import json
import os
import re
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

mode = sys.argv[1] if len(sys.argv) > 1 else 'full'
ID = 'Bunker' if mode == 'full' else 'BunkerDemo'
VOICE = 'am_michael'
KD = os.environ.get('KOKORO_DIR', '/tmp/tts')
COLORS = ['#32e36b', '#ff3b4a', '#ff5fb0', '#ffd23f', '#2fe6f0']
F = lambda f: f / 30.0
T = F(1848)

# (start frame, end frame, line)
SENT = [
    (0, 104, 'Dig a pit in the beach to hide from warships, and you have a foxhole.'),
    (105, 227, 'Then the first wave floods it with seawater, and the sides cave in on you.'),
    (228, 334, 'So you run behind the dunes and pour concrete around the pit.'),
    (335, 366, "Now it's a lookout."),
    (368, 466, 'But warships spot the grey box and blow it to pieces.'),
    (467, 596, 'So you rebuild it with walls and a roof a full body thick, then cover it with sand and grass.'),
    (597, 676, 'Now it looks like a plain dune. A perfect hideout.'),
    (677, 754, 'But tanks simply roll off the boats and up the beach.'),
    (755, 922, 'So you weld three steel beams into a big X and scatter them across the sand. A tank trap.'),
    (923, 999, 'But at high tide the landing boats float right over them.'),
    (1000, 1101, 'So you drive wooden poles into the sea and put a mine on each.'),
    (1102, 1208, "But once the shooting starts, you can't dash across open sand under fire."),
    (1209, 1345, 'So you dig a tunnel beneath the dunes, all the way back to camp. A supply tunnel.'),
    (1346, 1419, 'But warships can still aim straight at your window.'),
    (1420, 1575, 'So you turn it sideways and face it down the beach behind thick concrete. That window points the wrong way on purpose.'),
    (1576, 1678, "Ships can't see it, but it sees every boat that lands."),
    (1679, 1771, 'Add a stove, a deck of cards, and a gull that steals your bread.'),
    (1772, 1848, 'Congratulations. You just built a bunker.'),
]

k = Kokoro(os.path.join(KD, 'kokoro.onnx'), os.path.join(KD, 'voices.bin'))
os.makedirs('public/audio/vo', exist_ok=True)
clips = []
for i, (a, b, s) in enumerate(SENT):
    win = F(b - a) - 0.06
    au, sr = k.create(s, voice=VOICE, speed=1.0, lang='en-us')
    d0 = len(au) / sr
    sp = min(1.7, max(0.8, d0 / win))
    if abs(sp - 1) > 0.02:
        au, sr = k.create(s, voice=VOICE, speed=sp, lang='en-us')
    fn = f'audio/vo/{ID}_{i}.wav'
    sf.write('public/' + fn, au, sr)
    clips.append(dict(text=s, file=fn, at=round(F(a) + 0.02, 3), dur=round(len(au) / sr, 3), win=round(win, 3), sp=round(sp, 2)))
print('speeds', [c['sp'] for c in clips])

caps, ci = [], 0
for c in clips:
    ws = c['text'].replace('.', ' .').replace(',', ' ,').split()
    words = [w for w in ws if w not in '.,']
    wt = []
    for w in ws:
        if w in '.,':
            if wt:
                wt[-1] += 3.5 if w == ',' else 2
        else:
            wt.append(len(w) + 2.0)
    tot = sum(wt)
    edges = np.cumsum([0] + wt) / tot * c['dur'] + c['at']
    i = 0
    while i < len(words):
        n = 1 if len(words[i]) > 11 else min(2, len(words) - i)
        a_, b_ = edges[i], edges[i + n]
        caps.append(dict(**{'from': round(a_, 3)}, to=round(b_ + 0.02, 3), text=' '.join(re.sub(r"[^A-Za-z0-9']", '', w) for w in words[i:i + n]).upper() if False else ' '.join(re.sub(r"[^A-Za-z0-9']", '', w) for w in words[i:i + n]), style='karaoke', color=COLORS[ci % 5], y=0.2))
        ci += 1
        i += n


# ---------------- keyframe helpers ----------------
def seq(*kv):
    return [[round(a, 3), b] for a, b in kv]


def step(*kv):
    out = []
    for i, (a, b) in enumerate(kv):
        if i:
            out.append([round(a - 0.01, 3), kv[i - 1][1]])
        out.append([round(a, 3), b])
    out.append([round(T, 3), kv[-1][1]])
    return out


def hold(*kv):
    """seq that holds the last value to the end"""
    kv = list(kv)
    if kv[-1][0] < T:
        kv.append((T, kv[-1][1]))
    return seq(*kv)


def jump(prev, t, val):
    return [(t - 0.01, prev), (t, val)]


P = {}
# --- scene params (times in seconds) ---
# hole: 8 shovel strikes, shell hit, wave, flood, cave-in, refill
dig_a, dig_b, N = 0.1, 1.5, 8
per = (dig_b - dig_a) / N
pit = [(0, 0), (dig_a, 0)]
for i in range(N):
    ts = dig_a + (i + 0.5) * per
    pit += [(ts, i / N), (ts + 0.07, (i + 1) / N)]
pit += [(6.6, 1), (7.3, 0)]
P['pit'] = hold(*pit)
P['pw'] = hold((0, 0), (4.3, 0), (5.6, 1), (6.6, 1), (7.0, 0))
P['wave'] = hold((0, 0), (3.2, 0.001), (4.35, 1.05), (4.4, 0))
P['cave'] = hold((0, 0), (5.6, 0), (6.7, 1), (7.0, 1), (7.1, 0))
# bunker construction
P['form'] = hold((0, 0), (8.95, 0), (9.25, 1), (10.0, 1), (10.3, 0))
P['pour'] = hold((0, 0), (9.43, 0), (9.95, 1))
P['bunk'] = hold((0, 0), (10.0, 0), (10.4, 1), (14.99, 1), (15.0, 0), (15.2, 0), (15.55, 1))
P['thick'] = hold((0, 0), (15.0, 0), (15.01, 1))
P['blast'] = hold((0, 0), (14.52, 0), (14.54, 0.03), (15.0, 1), (15.01, 0))
P['sand'] = hold((0, 0), (18.4, 0), (19.2, 1))
P['grass'] = hold((0, 0), (19.3, 0), (19.9, 1))
P['lamp'] = hold((0, 0), (20.9, 0), (21.3, 1))
P['crate'] = hold((0, 0), (21.2, 0), (21.5, 1))
P['gun'] = hold((0, 0), (21.5, 0), (21.8, 1))
P['stove'] = hold((0, 0), (56.2, 0), (56.5, 1))
P['cards'] = hold((0, 0), (57.0, 0), (57.3, 1))
P['bread'] = hold((0, 0), (57.1, 0), (57.3, 1), (58.1, 1), (58.15, 0))
P['plume'] = hold((0, 0), (60.0, 0), (61.0, 1))
P['gullV'] = hold((0, 0), (57.4, 0), (57.45, 1), (58.9, 1), (58.95, 0))
P['gx'] = hold((0, 10), (57.4, 10.0), (57.9, 10.4), (58.15, 10.9), (58.35, 10.9), (58.9, 14))
P['gy'] = hold((0, 5), (57.4, 5.6), (57.9, 1.55), (58.15, 1.5), (58.35, 1.9), (58.9, 6.5))
P['gz'] = hold((0, 0), (57.4, 0.4), (57.9, 0.8), (58.35, 0.7), (58.9, -3))
P['gry'] = hold((0, 0), (57.4, 0), (57.9, 3.1), (58.9, 0))
# enemies and fx
P['f1'] = hold((0, 0), (1.27, 0.001), (1.5, 1), (1.6, 0), (13.7, 0), (13.8, 0.001), (14.0, 1), (14.1, 0))
P['f2'] = hold((0, 0))
P['tr1'] = hold((0, 0), (1.33, 0.001), (1.85, 1), (1.86, 0))
P['tr2'] = hold((0, 0))
P['tr3'] = hold((0, 0), (14.1, 0.001), (14.55, 1), (14.56, 0))
P['b1'] = hold((0, 0), (1.86, 0.001), (2.9, 1), (2.91, 0))
P['b2'] = hold((0, 0), (14.55, 0.001), (15.6, 1), (15.61, 0))
P['b3'] = hold((0, 0), (36.4, 0.001), (37.3, 1), (37.31, 0))
mg = [(0, 0)]
tt = 37.03
while tt < 38.1:
    mg += [(tt, 0), (tt + 0.033, 1)]
    tt += 0.066
mg += [(38.1, 0)]
P['mg'] = hold(*mg)
P['bul'] = hold((0, 0), (39.0, 0.001), (39.9, 1), (39.91, 0))
# boats, tank, traps, tide, poles, mines
P['boatV'] = hold((0, 0), (22.6, 0), (22.7, 1), (25.0, 1), (25.1, 0), (31.6, 0), (31.7, 1), (33.2, 1), (33.21, 0), (36.0, 0), (36.1, 1), (36.5, 1), (36.51, 0), (54.9, 0), (55.0, 1))
P['boatX'] = hold((0, -30), (22.6, -16), (23.4, -7.5), (25.1, -7.5), (31.6, -14), (32.6, 3.6), (33.2, 3.6), (36.0, -12), (36.4, -4.4), (36.5, -4.4), (54.9, 2), (55.9, 2))
P['boatZ'] = hold((0, -9), (22.6, -8.6), (25.1, -8.6), (31.6, -3.4), (33.2, -3.4), (36.0, -9.6), (36.5, -9.6), (54.9, -6.5))
P['ramp'] = hold((0, 0), (23.3, 0), (23.6, 1))
P['boatTank'] = hold((0, 0), (22.6, 1), (23.9, 1), (23.95, 0))
P['tankV'] = hold((0, 0), (23.9, 0), (24.0, 1))
P['tankX'] = hold((0, -7), (23.9, -7.4), (25.2, -2.2), (29.0, 1.8), (29.6, 3.2))
P['tankZ'] = hold((0, -8.4), (23.9, -8.2), (25.2, -6.6), (29.0, -2.0), (29.6, -0.8))
P['tankTilt'] = hold((0, 0), (29.0, 0), (29.7, 0.5))
P['tankY'] = hold((0, 0), (29.0, 0), (29.7, 0.5))
P['x1'] = hold((0, 0), (26.7, 0), (27.0, 1))
P['xtrap'] = hold((0, 0), (28.2, 0), (29.3, 10.8))
P['tide'] = hold((0, 0), (30.8, 0), (31.5, 0.85), (33.0, 0.85), (33.35, 0))
P['poles'] = hold((0, 0), (33.4, 0), (35.2, 9.8))
P['mines'] = hold((0, 0), (35.0, 0), (36.3, 9.8))
P['smoke'] = 1
# tunnel, cart
P['hatch'] = hold((0, 0), (40.3, 0), (40.45, 1))
P['tunnel'] = hold((0, 0), (40.7, 0), (43.0, 1))
P['cartV'] = hold((0, 0), (43.2, 0), (43.4, 1))
P['cartX'] = hold((0, 20.8), (43.8, 20.8), (45.0, 10.6))
# sight lines, ghost, cone
P['laser1'] = hold((0, 0), (45.3, 0), (46.1, 1), (52.4, 1), (52.5, 1))
P['laser2'] = hold((0, 0), (53.3, 0), (53.9, 1), (55.9, 1))
P['arrow'] = hold((0, 0), (47.4, 0), (48.2, 1), (49.3, 1), (49.5, 0))
P['ghost'] = hold((0, 0), (48.9, 0), (49.2, 0.9), (50.0, 0.9), (50.2, 0), (53.5, 0), (53.7, 0.9), (54.2, 0))
P['ghostRot'] = hold((0, 0), (49.0, 0), (49.7, 1.5708))
P['cone'] = hold((0, 0), (54.2, 0), (55.0, 1))
P['rings'] = hold((0, 0), (55.0, 0), (55.9, 1.5))
P['camp'] = 1
P['bloom'] = 0.2

# --- hero keys ---
# the early part uses hold() (adds a T key) -> rebuild cleanly instead
HX = seq((0, 1.6), (1.73, 1.6), (2.0, -0.8), (2.15, -1.7), (5.5, -1.7), (6.6, -1.5), (7.3, -0.6), (7.5, -0.4), (8.9, 6.3), (10.4, 6.3), (11.0, 8.4), (16.29, 8.4), (16.3, 15.5), (16.8, 11.5), (18.1, 11.5), (18.5, 13.9), (19.9, 13.9), (20.8, 9.5), (25.2, 9.5), (25.9, 3.6), (29.4, 3.6), (29.7, 6.8), (33.0, 6.8), (33.01, -8.4), (34.4, -8.4), (35.2, 7), (36.7, 7), (36.71, 9.3), (38.1, 9.3), (38.5, 12.8), (39.2, 21), (39.9, 10.8), (40.3, 11.0), (40.5, 9.85), (40.7, 10.6), (43.0, 21.4), (43.6, 21.6), (43.8, 20.8), (45.0, 10.6), (45.02, 9.85), (45.7, 9.3), (50.4, 9.3), (50.41, 10.5), (56.0, 10.5), (56.5, 10.4), (T, 10.4))
HY = seq((0, 0), (1.73, 0), (1.85, 1.1), (2.0, 0.5), (2.15, -2.6), (4.3, -2.6), (5.5, -0.3), (6.6, 0), (14.49, 0), (14.7, 3), (15.0, 6), (15.01, 6), (16.29, 0), (30.8, 0), (31.5, 1.3), (33.0, 1.3), (33.01, -0.85), (34.4, -0.85), (35.2, -0.85), (35.5, 0), (40.3, 0), (40.5, 0), (40.62, -1.9), (43.0, -1.9), (43.6, 0), (43.7, -1.45), (44.9, -1.45), (45.0, -1.9), (45.7, 0), (T, 0))
HZ = seq((0, 1.0), (2.0, 0.9), (2.15, 0.9), (7.3, 0.9), (8.9, 1.5), (10.4, 2.0), (11.0, 0.3), (16.29, 0.3), (16.3, 0.4), (18.1, 0.6), (18.5, 1.5), (19.9, 1.5), (20.8, 0.4), (25.2, -1.6), (25.9, -0.2), (29.7, 0.8), (33.0, 0.8), (33.01, -9.3), (35.2, -9.3), (36.7, -9.3), (36.71, 0.2), (38.1, 0.2), (38.5, 1.0), (40.3, 0.8), (40.5, 1.8), (40.7, 2.2), (45.0, 2.2), (45.02, 0.5), (45.7, 0.2), (50.4, 0.2), (50.41, 0.6), (T, 1.0))
HR = seq((0, -1.2), (1.6, -1.2), (2.0, -1.5), (2.15, 0.2), (4.3, 0.2), (7.4, 1.5), (8.9, 1.5708), (9.0, 1.2), (10.4, 0.5), (11.0, -1.5708), (14.49, -1.5708), (16.3, -1.5708), (17.8, -0.3), (18.1, -0.3), (18.4, -1.5), (19.9, -1.5), (20.8, -1.5), (21.5, -0.3), (25.2, -1.5708), (25.9, -1.2), (29.6, -1.0), (29.7, 0.3), (33.0, 0.3), (33.01, 2.6), (34.4, 2.6), (34.5, 1.5708), (35.2, 1.5708), (36.7, 1.5708), (36.71, -1.5708), (38.0, -1.5708), (38.1, 1.5708), (39.2, 1.5708), (39.3, -1.5708), (40.3, -1.5708), (40.5, 0.2), (40.7, 1.3), (43.0, 1.3), (43.6, 0.2), (43.7, -1.5708), (44.9, -1.5708), (45.7, -1.5708), (50.4, -1.5708), (50.41, 0.0), (56.0, 0.0), (56.5, 0.4), (T, 0.0))
ACT = step((0, 7), (1.5, 0), (1.73, 2), (2.1, 3), (4.3, 4), (4.9, 5), (6.5, 6), (7.4, 12), (8.8, 7), (9.1, 0), (10.4, 12), (10.9, 5), (14.49, 4), (15.0, 0), (16.3, 12), (16.8, 0), (17.8, 10), (18.1, 12), (18.5, 7), (19.3, 0), (19.9, 12), (20.8, 5), (25.2, 12), (25.9, 8), (27.1, 0), (29.5, 12), (29.7, 11), (30.7, 5), (33.0, 0), (33.02, 7), (34.4, 12), (35.2, 0), (36.7, 3), (38.1, 12), (39.3, 12), (39.95, 5), (40.3, 7), (40.55, 6), (40.7, 7), (43.0, 6), (43.6, 10), (43.7, 5), (45.0, 6), (45.6, 12), (45.75, 3), (50.4, 5), (56.0, 5), (58.3, 11), (59.1, 10))
TOOL = step((0, 1), (1.5, 0), (8.8, 1), (9.1, 0), (18.5, 1), (19.3, 0), (25.9, 2), (27.1, 0), (33.0, 3), (34.4, 0), (40.3, 4), (40.55, 0), (40.7, 4), (43.0, 0))
TXYZ = dict(tx=step((0, 2.4)), ty=step((0, 0.4)), tz=step((0, -1.3)))
SHOW = step((0, 1), (14.9, 0), (16.3, 1))
HERO = dict(x=HX, y=HY, z=HZ, rotY=HR, act=ACT, tool=TOOL, toolK=1, sp=step((0, round(1 / per, 3)), (8.8, 2.0), (18.5, 2.0), (33.02, 1.6), (40.3, 2.0)), tilt=seq((0, 0), (14.5, 0), (15.0, 4.5), (15.01, 0), (T, 0)), k=1, show=SHOW,
            run=step((0, 1), (7.4, 1), (16.3, 0), (33.0, 0), (34.4, 1), (35.2, 0), (38.5, 1), (39.95, 0)), walkSp=step((0, 1.0), (16.3, 0.85)), **TXYZ)
P['hero'] = HERO

# --- camera (pos, look) ---
C = [  # (t, pos, look) -- close, hero-centred framing like the reference
    (0.0, [0.2, 2.2, 9.5], [-0.2, 0.0, 0]),
    (1.4, [-0.4, 1.7, 8.0], [-0.8, -0.5, 0]),
    (2.2, [-1.2, 1.2, 7.0], [-1.6, -1.2, 0]),
    (3.4, [-1.7, 0.9, 6.3], [-1.7, -1.0, 0]),
    (4.4, [-1.7, 0.9, 6.3], [-1.7, -0.8, 0]),
    (6.9, [-1.0, 2.3, 8.5], [-1.0, -0.6, 0]),
    (7.6, [1.0, 1.8, 9.0], [1.5, 0.9, 0]),
    (8.9, [7.5, 1.8, 9.0], [7.5, 0.9, 0]),
    (10.0, [7.4, 2.3, 10.5], [8.4, 1.4, 0]),
    (11.2, [8.5, 1.8, 7.5], [9.0, 1.4, 0]),
    (12.0, [8.2, 1.8, 7.5], [8.6, 1.4, 0]),
    (12.25, [-8, 2.4, 12], [-14, 1.8, -20]),
    (12.7, [-26, 3.0, 8], [-26, 1.6, -48]),
    (14.0, [-25, 3.4, 8], [-27, 1.6, -48]),
    (14.45, [-10, 3.0, 13], [-2, 1.3, -10]),
    (14.55, [7.5, 2.6, 11.5], [10, 1.6, 0]),
    (15.5, [8.0, 2.6, 10.5], [10, 1.8, 0]),
    (16.4, [9.0, 2.4, 9.5], [10.2, 1.7, 0]),
    (18.1, [12.0, 2.2, 9.0], [12.0, 1.4, 0]),
    (18.5, [12.6, 2.2, 9.0], [12.6, 1.4, 0]),
    (19.9, [10.5, 3.8, 12.5], [10.5, 2.0, 0]),
    (20.8, [10.0, 2.4, 9.5], [10, 1.8, 0]),
    (22.0, [9.8, 1.7, 6.2], [9.8, 1.3, 0]),
    (22.3, [8.4, 1.3, 3.0], [2, 1.1, 0]),
    (22.55, [-8, 0.9, 5], [-8, 0.8, -8]),
    (23.3, [-7, 1.0, 5], [-7, 0.9, -8]),
    (25.1, [-3, 1.1, 3], [-2, 1.0, -6]),
    (25.5, [2.5, 1.5, 6], [3.2, 0.8, -0.6]),
    (27.0, [4.0, 1.5, 5.2], [3.0, 0.7, -0.8]),
    (27.4, [3, 10, 4.5], [3, 0, -0.5]),
    (28.1, [3, 9.5, 4.5], [3, 0, -0.5]),
    (29.2, [2.5, 1.8, 6.5], [3.2, 0.9, -0.8]),
    (30.7, [3.0, 1.8, 6.0], [3.6, 0.9, -0.8]),
    (31.4, [3, 1.2, 6.5], [3.5, 0.9, -2]),
    (33.2, [3, 1.3, 6.5], [3.5, 0.9, -2]),
    (33.3, [-7.5, 1.6, -3.5], [-8.4, 0.8, -9.3]),
    (34.4, [-7, 1.6, -3.5], [-7.5, 0.8, -9.5]),
    (34.6, [-9, 4.5, -2], [-2, 0.5, -9.5]),
    (36.3, [-6, 5, -2], [3, 0.8, -9.5]),
    (36.9, [6, 1.8, 6], [9, 1.0, 0]),
    (37.0, [10.2, 1.5, 5.8], [9.2, 1.2, 0]),
    (38.1, [10.2, 1.5, 5.8], [9.2, 1.2, 0]),
    (38.5, [13.5, 2.0, 9], [13.5, 1.2, 0]),
    (39.2, [20.0, 2.0, 9], [20.0, 1.2, 0]),
    (39.9, [11.0, 2.0, 9], [11.0, 1.2, 0]),
    (40.1, [10.4, 1.7, 6.5], [10.4, 1.2, 0]),
    (40.6, [10.3, 0.0, 8.5], [10.3, -1.0, 0]),
    (41.5, [14, 0.0, 8.5], [14, -1.0, 0]),
    (43.0, [20, 0.0, 8.5], [20.5, -1.0, 0]),
    (43.6, [21.6, 0.6, 8], [21.6, -0.3, 0]),
    (44.4, [17, -0.2, 8.5], [15.5, -1.2, 0]),
    (45.0, [11, -0.2, 8], [10.3, -0.9, 0]),
    (45.3, [9.4, 1.4, 4.0], [8.4, 1.2, 0]),
    (46.0, [-6, 3.0, 8], [-26, 1.0, -48]),
    (46.15, [6.0, 1.7, 5.5], [8.6, 1.5, 0]),
    (47.25, [6.0, 2.2, 8.0], [8.6, 1.6, 0]),
    (47.4, [10, 11.5, 5], [10, 2, -0.5]),
    (48.4, [10.2, 11.5, 5], [10, 2, -0.5]),
    (49.2, [3, 6.0, 12], [9, 0.8, -3]),
    (50.1, [8, 3.5, 10], [10, 1.6, -1]),
    (50.5, [10, 1.8, 7.0], [10, 1.4, 0]),
    (52.4, [10, 1.8, 7.5], [10, 1.4, 0]),
    (53.0, [7, 2.4, 11], [8, 1.5, 0]),
    (53.8, [-2, 2.2, 12], [5, 0.8, -3]),
    (55.0, [-4, 3.0, 12], [6, 0.8, -3]),
    (55.8, [2, 4.5, 12], [7, 0.8, -2]),
    (56.0, [10.2, 1.8, 6.5], [10.2, 1.4, 0]),
    (58.4, [10.2, 1.8, 6.5], [10.2, 1.4, 0]),
    (59.1, [10.2, 2.0, 8.0], [10.2, 1.6, 0]),
    (61.6, [8, 7.5, 27], [10, 2.4, 0]),
]
C.sort(key=lambda x: x[0])
cam = dict(path='keys', pos=[[round(a, 3), p] for a, p, l in C], look=[[round(a, 3), l] for a, p, l in C], fov=40)

# --- sfx ---
sfx = []
for i in range(N):
    sfx.append(dict(at=round(dig_a + (i + 0.5) * per, 3), type='thud', gain=0.45))
sfx += [
    dict(at=1.3, type='whoosh', gain=0.5), dict(at=1.88, type='boom', gain=0.8), dict(at=4.3, type='whoosh', gain=0.9), dict(at=4.4, type='crash', gain=0.7),
    dict(at=9.43, type='rumble', gain=0.5), dict(at=10.2, type='thud', gain=0.9), dict(at=13.9, type='whoosh', gain=0.7), dict(at=14.55, type='boom', gain=1.0),
    dict(at=15.4, type='thud', gain=0.8), dict(at=19.0, type='thud', gain=0.4), dict(at=23.4, type='crash', gain=0.5), dict(at=26.0, type='riser', gain=0.4),
    dict(at=28.3, type='thud', gain=0.8), dict(at=30.9, type='whoosh', gain=0.8), dict(at=33.4, type='thud', gain=0.6), dict(at=33.8, type='thud', gain=0.6),
    dict(at=36.4, type='boom', gain=0.9), dict(at=40.45, type='thud', gain=0.7), dict(at=45.3, type='beep', gain=0.4), dict(at=49.2, type='whoosh', gain=0.6),
    dict(at=56.4, type='thud', gain=0.5), dict(at=60.1, type='riser', gain=0.4),
]
for tm in np.arange(37.03, 38.1, 0.13):
    sfx.append(dict(at=round(float(tm), 3), type='thud', gain=0.35))
tl = dict(
    meta=dict(id=ID, title='How a Hole on a Beach Becomes a Bunker', fps=30, width=1080, height=1920, fovScale=1.0,
              music=dict(keys=[[0, 0.3], [T, 0.5]], root=55), autoWhoosh=False,
              vo=[dict(file=c['file'], at=c['at'], gain=1.0) for c in clips]),
    segments=[dict(id='beach', to=round(T, 2), scene='bunker', params=P, camera=cam, effects=dict(vignette=0.2), captions=caps, sfx=sfx)],
)
tl['segments'][0]['from'] = 0
out = 'src/timelines/bunker.json' if mode == 'full' else 'src/timelines/bunker-demo.json'
json.dump(tl, open(out, 'w'), indent=1)
print('duration', round(T, 2), 'caps', len(caps), 'wrote', out)
