"""How a Water Tank Becomes a Panic Room (TikTok/Shorts, 1080x1920) -- "How a [small thing] Becomes [big thing]" format.

usage: KOKORO_DIR=/tmp/tts python3 tools/gen/tankroom.py [demo|full]   -> src/timelines/tankroom-demo.json + public/audio/vo/*.wav
Voiceover: Kokoro TTS (kokoro-onnx; model files from github.com/thewh1teagle/kokoro-onnx releases model-files-v1.0).
Captions: karaoke, 2-word chunks, the newest word coloured; word timing is proportional to word length inside each sentence.
Each video re-skins the same Build scene (env = field|beach|desert|snow|forest, story object, beats): see docs/ref3-*.md.
Facts used on screen/voice: none numeric in the demo (the full script computes air volume / CO2 in a later step).
"""
import json
import os
import re
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

mode = sys.argv[1] if len(sys.argv) > 1 else 'demo'
ID = 'TankRoomDemo' if mode == 'demo' else 'TankRoom'
VOICE, SPEED = 'am_michael', 1.08
KD = os.environ.get('KOKORO_DIR', '/tmp/tts')
COLORS = ['#32e36b', '#ff3b4a', '#ff5fb0', '#ffd23f', '#2fe6f0']
ENV = 'field'

SENT = [
    'You find a huge empty water tank.',
    'Cut a hatch in the top.',
    'Now bury it deep underground.',
    'Add a vent pipe, and you can breathe.',
]

k = Kokoro(os.path.join(KD, 'kokoro.onnx'), os.path.join(KD, 'voices.bin'))
os.makedirs('public/audio/vo', exist_ok=True)
clips, t0 = [], 0.35
for i, s in enumerate(SENT):
    a, sr = k.create(s, voice=VOICE, speed=SPEED, lang='en-us')
    a = np.trim_zeros(a, 'fb') if False else a
    fn = f'audio/vo/{ID}_{i}.wav'
    sf.write('public/' + fn, a, sr)
    d = len(a) / sr
    clips.append(dict(text=s, file=fn, at=round(t0, 3), dur=round(d, 3)))
    t0 += d + 0.14
T = t0 + 0.5
S = [c['at'] for c in clips]
E_ = [c['at'] + c['dur'] for c in clips]

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
        n = 2 if len(words) - i != 3 else 3
        if len(words) - i == 1:
            n = 1
        a, b = edges[i], edges[i + n]
        caps.append(dict(from_=round(a, 3), to=round(b + 0.02, 3), text=' '.join(re.sub(r'[^A-Za-z0-9\']', '', w) for w in words[i:i + n]), style='karaoke', color=COLORS[ci % 5], y=0.2))
        ci += 1
        i += n
for c in caps:
    c['from'] = c.pop('from_')
caps.append(dict(**{'from': 0.0, 'to': S[0] + 1.6}, text='HOW A WATER TANK|BECOMES A PANIC ROOM', style='top'))

# ---------------- visual beats (absolute seconds, one continuous Build segment) ----------------
def seq(*kv):
    return [[round(a, 3), b] for a, b in kv]

s1, s2, s3, s4 = S
e1, e2, e3, e4 = E_
dig_a, dig_b = s3, s3 + 0.40 * (e3 - s3)
drop_b = s3 + 0.62 * (e3 - s3)
fill_b = e3
params = dict(
    env=ENV,
    tank=seq((0, 0), (0.25, 0), (0.85, 1)),
    props=seq((0, 0), (0.1, 0), (0.9, 1)),
    cy=seq((0, 1.7), (dig_b, 1.7), (drop_b, -2.2), (T, -2.2)),
    pit=seq((0, 0), (dig_a, 0), (dig_b, 1), (drop_b, 1), (fill_b, 0), (T, 0)),
    hatch=seq((0, 0), (s2 + 0.1, 0), (e2 - 0.05, 1), (e2 + 0.35, 1.9), (T, 1.9)),
    vent=seq((0, 0), (s4 + 0.25, 0), (s4 + 1.1, 1), (T, 1)),
    lamp=seq((0, 0), (s4 + 0.9, 0), (s4 + 1.3, 1), (T, 1)),
    bed=seq((0, 0), (s4 + 1.0, 0), (s4 + 1.5, 1), (T, 1)),
    bloom=0.22,
    hero=dict(
        x=seq((0, 3.6), (s4 - 0.01, 3.6), (s4, 0.6), (T, 0.6)),
        y=seq((0, 0), (s4 - 0.01, 0), (s4, -3.14), (T, -3.14)),
        z=seq((0, 1.4), (s4 - 0.01, 1.4), (s4, 0.9), (T, 0.9)),
        rotY=seq((0, -1.0), (s4 - 0.01, -1.0), (s4, 0.2), (T, 0.2)),
        walk=0,
    ),
)
cam = dict(
    path='keys',
    pos=seq((0, [8.5, 4.0, 29]), (e1, [6.5, 3.2, 24]), (s2, [3.0, 5.2, 16]), (e2 + 0.3, [3.0, 5.2, 16]), (s3, [1.0, 2.0, 28]), (e3, [1.0, 1.0, 28]), (s4, [3.2, -0.2, 14]), (T, [2.4, -0.4, 12])),
    look=seq((0, [0, -0.8, 0]), (s2, [0, 1.4, 0]), (e2 + 0.3, [0, 1.4, 0]), (s3, [0, -1.2, 0]), (e3, [0, -1.6, 0]), (s4, [0, -2.0, 1.5]), (T, [0, -2.1, 1.5])),
    fov=40,
)
sfx = [
    dict(at=0.3, type='thud', gain=0.9),
    dict(at=s2, type='riser', dur=1.0, gain=0.35),
    dict(at=e2 + 0.1, type='whoosh', gain=0.6),
    dict(at=s3, type='rumble', dur=dig_b - dig_a + 0.4, gain=0.5),
    dict(at=drop_b, type='thud', gain=1.0),
    dict(at=s4 + 1.0, type='beep', gain=0.4),
]
tl = dict(
    meta=dict(id=ID, title='How a Water Tank Becomes a Panic Room (demo)', fps=30, width=1080, height=1920, fovScale=1.0,
              music=dict(keys=[[0, 0.3], [T, 0.55]], root=55), autoWhoosh=False,
              vo=[dict(file=c['file'], at=c['at'], gain=1.0) for c in clips]),
    segments=[dict(id='build', from_=0, to=round(T, 2), scene='build', params=params, camera=cam, effects=dict(vignette=0.25), captions=caps, sfx=sfx)],
)
tl['segments'][0]['from'] = tl['segments'][0].pop('from_')
json.dump(tl, open(f'src/timelines/{"tankroom-demo" if mode == "demo" else "tankroom"}.json', 'w'), indent=1)
print('duration', round(T, 2), 'sentences', [(c['at'], c['dur']) for c in clips], 'caps', len(caps))
