"""Generates src/timelines/oxygen-5s.json: "What if oxygen disappeared for 5 seconds?" (TikTok 9:16).
Physics: sea-level air 101.325 kPa; O2 is 20.95 % by volume -> without it 80.1 kPa (11.6 psi, -21 %),
the pressure ~2.0 km up (scale height 8.4 km). Water is 16/18 = 88.9 % oxygen by mass.
The 5 story seconds play in ~10x slow motion after the event (HUD shows story time).
usage: python3 tools/gen/oxygen5s.py [--until SECONDS]"""
import json, math, sys

P0 = 101.325
P1 = P0 * (1 - 0.2095)
PSI = 6.894757
alt = 8.4 * math.log(P0 / P1)  # km
O_IN_WATER = 16 / 18
EVENT, SLOW = 5.0, 0.1  # video second of the event, story-seconds per video-second afterwards

until = float(sys.argv[sys.argv.index('--until') + 1]) if '--until' in sys.argv else 1e9
segs = []
def shot(id, a, b, **kw):
    if a < until:
        segs.append(dict(id=id, **{'from': a, 'to': min(b, until)}, scene='rooftop', **kw))
def cam(p0, p1, l0, l1, d, fov=48):
    return {'path': 'keys', 'pos': [[0, p0], [d, p1]], 'look': [[0, l0], [d, l1]], 'fov': fov}

# 1) hook: her back, the skyline, the countdown
shot('rail', 0.0, 3.2, camera=cam([0.4, 1.62, -3.6], [0.0, 1.6, -4.9], [-1.2, 1.0, -30], [-0.8, 0.6, -30], 3.2),
     params={'fire': 1, 'lights': 1}, effects={'vignette': 0.35},
     captions=[{'from': 0.1, 'to': 3.1, 'text': 'What if oxygen disappeared|for 5 seconds?', 'style': 'top'}])
# 2) turn to the party and the fire pit (countdown hits zero on the flames)
shot('party', 3.2, 5.0, camera=cam([0.2, 1.65, -4.8], [0.9, 1.6, -4.3], [3.5, 1.2, -1.0], [1.6, 0.8, -0.5], 1.8),
     params={'fire': 1, 'lights': 1}, transitionIn='whip', effects={'vignette': 0.35},
     captions=[{'from': 0.1, 'to': 1.8, 'text': 'You are on a rooftop bar downtown.', 'style': 'subtle'}],
     sfx=[{'at': 0.6, 'type': 'riser', 'dur': 1.2, 'gain': 0.45}])
# 3) EVENT: every flame dies in the same instant (same camera, no cut)
shot('fireout', 5.0, 6.8, camera=cam([0.9, 1.6, -4.3], [1.15, 1.55, -3.8], [1.6, 0.8, -0.5], [1.6, 0.85, -0.5], 1.8),
     params={'fire': [[0, 1], [0.08, 1], [0.35, 0]], 'lights': 1}, effects={'vignette': 0.4, 'shake': [[0, 0], [0.08, 0.5], [0.6, 0.1]]},
     captions=[{'from': 0.5, 'to': 1.8, 'text': 'Every flame on Earth goes out.', 'style': 'subtle'}],
     sfx=[{'at': 0.08, 'type': 'thud', 'gain': 0.9}, {'at': 0.08, 'type': 'subdrop', 'gain': 0.7}])
# 4) ears pop: the whole terrace grabs their heads
shot('ears', 6.8, 8.6, camera=cam([-1.0, 1.6, -2.6], [-1.4, 1.58, -2.0], [-3.4, 1.3, 1.2], [-3.4, 1.3, 1.2], 1.8, 46),
     params={'fire': 0, 'lights': 1, 'clutch': [[0, 0.05], [0.15, 0.1], [0.9, 1]]}, transitionIn='whip', effects={'vignette': 0.4},
     captions=[{'from': 0.2, 'to': 1.8, 'text': "Everyone's ears pop at once.", 'style': 'subtle'}],
     sfx=[{'at': 0.2, 'type': 'thud', 'gain': 0.5}, {'at': 0.25, 'type': 'warble', 'dur': 1.5, 'gain': 0.25}])
# 5) why: 21 % of the air just vanished
shot('pressure', 8.6, 10.4, camera=cam([3.7, 1.55, 0.5], [4.2, 1.5, 1.0], [6.0, 1.35, 2.7], [6.0, 1.3, 2.7], 1.8, 44),
     params={'fire': 0, 'lights': 1, 'clutch': 1}, transitionIn='whip', effects={'vignette': 0.4},
     captions=[{'from': 0.1, 'to': 1.8, 'text': f'Like being lifted {round(alt * 1000, -2):,.0f} m|in a blink.', 'style': 'subtle'}])
# 6) tease: the river below
shot('river', 10.4, 12.0, camera=cam([2.2, 1.8, -6.0], [1.2, 3.4, -8.9], [-0.1, 1.3, -7.4], [-0.6, -28, -42], 1.6, 50),
     params={'fire': 0, 'lights': 1, 'clutch': 1}, transitionIn='whip', effects={'vignette': 0.4},
     captions=[{'from': 0.15, 'to': 1.6, 'text': f'The river below is {O_IN_WATER * 100:.0f}% oxygen.', 'style': 'subtle'}],
     sfx=[{'at': 0.2, 'type': 'riser', 'dur': 1.4, 'gain': 0.5}])

end = segs[-1]['to']
story_end = 5 - (end - EVENT) * SLOW
tl = {
    'meta': {'id': 'Oxygen5s', 'title': 'What if oxygen disappeared for 5 seconds?', 'fps': 30, 'width': 1080, 'height': 1920, 'fovScale': 1.25,
             'music': {'keys': [[0, 0.3], [4.8, 0.55], [5.0, 0.15], [6.0, 0.45], [end, 0.65]], 'root': 52}},
    'hud': {'clock': {'label': 'OXYGEN DISAPPEARS IN', 'keys': [[0, 5.0], [EVENT, 0.0], [EVENT + 0.001, 5.0], [end, story_end]], 'format': 'countdown',
                      'style': 'minimal', 'colorRamp': [1e9, 2e9], 'labelKeys': [[0, 'OXYGEN DISAPPEARS IN'], [EVENT, 'OXYGEN RETURNS IN']],
                      'sub': f'AIR PRESSURE {P0 / PSI:.1f} PSI', 'subKeys': [[0, f'AIR PRESSURE {P0 / PSI:.1f} PSI'], [EVENT, f'AIR PRESSURE {P1 / PSI:.1f} PSI · -21%']]},
            'start': 0, 'end': 1e9},
    'segments': segs,
}
json.dump(tl, open('src/timelines/oxygen-5s.json', 'w'), indent=1)
print(f'wrote oxygen-5s.json {end}s, {len(segs)} shots; P1={P1:.1f} kPa = {P1 / PSI:.2f} psi, alt={alt:.2f} km')
