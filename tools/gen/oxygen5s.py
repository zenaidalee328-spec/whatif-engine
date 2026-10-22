"""Generates src/timelines/oxygen-5s.json: "What if oxygen disappeared for 5 seconds?" (TikTok 9:16, ~76 s).
Rule shown on screen: every oxygen atom vanishes for 5 s, except the ones inside living things.
Physics (all computed here):
  air: 101.325 kPa, O2 20.95 % by volume -> 80.1 kPa (11.6 psi, -21 %), the pressure ~2.0 km up (scale height 8.4 km)
  window glass (soda-lime) ~47 % O by mass; concrete ~49 %; water 88.8 %
  1 L of water -> 55.5 mol H2 -> 1,660 L of gas at 80 kPa, 15 C
  burning it back (LHV 241.8 kJ/mol): 13.4 GJ per m3 of water = 3.2 t TNT; the river in view (46 m x 600 m x 5 m) ~443 kt
  hydrogen fire front ~15 m/s (turbulent deflagration), from the far bank (~104 m) to you in ~7 s
The 5 story seconds play in 10x slow motion (HUD shows story time).
usage: python3 tools/gen/oxygen5s.py [--until SECONDS]"""
import json, math, sys

P0 = 101.325; P1 = P0 * (1 - 0.2095); PSI = 6.894757
alt = 8.4 * math.log(P0 / P1)
R, T15 = 8.314, 288.15
L_H2 = 1000 / 18.015 * R * T15 / (P1 * 1000) * 1000  # litres of H2 per litre of water
river_m3 = 46 * 600 * 5
h2_m3 = river_m3 * L_H2
E = river_m3 * 55508 * 241.8e3
HIRO = E / 4.184e12 / 15
EVENT, RETURN, SLOW = 5.0, 55.0, 0.1
CAMZ = -7.4
FIRE_T0, FIRE_T1, FIRE_Z0 = 55.5, 62.5, -110.0
def fire_z(T):
    u = min(1, max(0, (T - FIRE_T0) / (FIRE_T1 - FIRE_T0)))
    return FIRE_Z0 + (CAMZ - FIRE_Z0) * u
def fire_dist(T): return max(0.0, CAMZ - fire_z(T))

until = float(sys.argv[sys.argv.index('--until') + 1]) if '--until' in sys.argv else 1e9
segs = []
def shot(id, a, b, scene='rooftop', **kw):
    if a < until:
        segs.append(dict(id=id, **{'from': a, 'to': min(b, until)}, scene=scene, **kw))
def cam(p0, p1, l0, l1, d, fov=48, roll=None):
    c = {'path': 'keys', 'pos': [[0, p0], [d, p1]], 'look': [[0, l0], [d, l1]], 'fov': fov}
    if roll: c['roll'] = roll
    return c
def fk(f, a, b, n=8):  # keyframes (local time) of a function of absolute time over [a,b]
    return [[round((b - a) * i / n, 3), round(f(a + (b - a) * i / n), 3)] for i in range(n + 1)]
def sub(text, a=0.15, b=None, d=None):
    return {'from': a, 'to': b if b is not None else d - 0.1, 'text': text, 'style': 'subtle'}

AFTER = {'fire': 0, 'lights': 1, 'clutch': 1}

# ---------- before ----------
shot('rail', 0.0, 3.2, camera=cam([0.4, 1.62, -3.6], [0.0, 1.6, -4.9], [-1.2, 1.0, -30], [-0.8, 0.6, -30], 3.2),
     params={'fire': 1, 'lights': 1}, effects={'vignette': 0.35},
     captions=[{'from': 0.1, 'to': 3.1, 'text': 'What if oxygen disappeared|for 5 seconds?', 'style': 'top'}])
shot('party', 3.2, 5.0, camera=cam([0.2, 1.65, -4.8], [0.9, 1.6, -4.3], [3.5, 1.2, -1.0], [1.6, 0.8, -0.5], 1.8),
     params={'fire': 1, 'lights': 1}, transitionIn='whip', effects={'vignette': 0.35},
     captions=[sub('You are on a rooftop bar downtown.', d=1.8)], sfx=[{'at': 0.6, 'type': 'riser', 'dur': 1.2, 'gain': 0.35}])
# ---------- the event ----------
shot('fireout', 5.0, 6.8, camera=cam([0.9, 1.6, -4.3], [1.15, 1.55, -3.8], [1.6, 0.8, -0.5], [1.6, 0.85, -0.5], 1.8),
     params={'fire': [[0, 1], [0.08, 1], [0.35, 0]], 'lights': 1}, effects={'vignette': 0.4, 'shake': [[0, 0], [0.08, 0.5], [0.6, 0.1]]},
     captions=[sub('Every flame on Earth goes out.', a=0.5, d=1.8)],
     sfx=[{'at': 0.08, 'type': 'thud', 'gain': 0.9}, {'at': 0.08, 'type': 'subdrop', 'gain': 0.7}])
shot('ears', 6.8, 8.6, camera=cam([-1.0, 1.6, -2.6], [-1.4, 1.58, -2.0], [-3.4, 1.3, 1.2], [-3.4, 1.3, 1.2], 1.8, 46),
     params={'fire': 0, 'lights': 1, 'clutch': [[0, 0.05], [0.15, 0.1], [0.9, 1]]}, transitionIn='whip', effects={'vignette': 0.4},
     captions=[sub("Everyone's ears pop at once.", a=0.2, d=1.8)],
     sfx=[{'at': 0.2, 'type': 'thud', 'gain': 0.5}, {'at': 0.25, 'type': 'warble', 'dur': 1.5, 'gain': 0.25}])
shot('pressure', 8.6, 10.4, camera=cam([3.7, 1.55, 0.5], [4.2, 1.5, 1.0], [6.0, 1.35, 2.7], [6.0, 1.3, 2.7], 1.8, 44),
     params=AFTER, transitionIn='whip', effects={'vignette': 0.4},
     captions=[sub(f'Like being lifted {round(alt * 1000, -2):,.0f} m|in a blink.', d=1.8)])
shot('rule', 10.4, 13.4, camera=cam([0.5, 1.6, -1.5], [0.4, 1.5, -1.9], [1.5, 1.6, -7], [1.2, 9, -12], 3.0, 50),
     params=AFTER, transitionIn='whip', effects={'vignette': 0.45, 'blur': [[0, 0], [1.5, 0], [3.0, 1.5]]},
     captions=[sub('The rule: every oxygen atom vanishes,|except the ones inside living things.', d=3.0)])
# ---------- glass ----------
shot('glass', 13.4, 16.6, camera=cam([7.4, 1.7, -3.2], [8.3, 1.8, -2.4], [12.5, 4.6, -0.6], [12.5, 3.6, 0.2], 3.2, 46),
     params={**AFTER, 'glass': [[0, 0], [0.4, 0], [2.2, 1]]}, transitionIn='whip', effects={'vignette': 0.4},
     captions=[sub('Window glass is 47% oxygen.', d=1.6), sub('Every pane falls as dust.', a=1.6, d=3.2)],
     sfx=[{'at': 0.4, 'type': 'crack', 'gain': 0.45}])
shot('drinks', 16.6, 18.6, camera=cam([-3.9, 1.45, -0.45], [-3.7, 1.4, -0.2], [-3.3, 1.1, 0.7], [-3.3, 1.12, 0.7], 2.0, 42),
     params={**AFTER, 'glass': [[0, 0], [0.3, 0], [1.1, 1]]}, transitionIn='whip', effects={'vignette': 0.4},
     captions=[sub('So is your glass. And your drink.', d=2.0)])
# ---------- the river ----------
shot('river1', 18.6, 21.8, camera=cam([2.2, 1.8, -6.0], [1.2, 3.4, -8.9], [-0.1, 1.3, -7.4], [-0.6, -28, -42], 2.0, 50),
     params={**AFTER, 'glass': 1, 'river': [[0, 0], [2.2, 0], [3.2, 0.22]]}, transitionIn='whip', effects={'vignette': 0.4},
     captions=[sub(f'The river below is {16 / 18 * 100:.0f}% oxygen.', d=3.2)], sfx=[{'at': 2.2, 'type': 'rumble', 'dur': 3, 'gain': 0.6}])
shot('river2', 21.8, 25.2, camera=cam([1.4, 2.4, -7.6], [1.0, 2.6, -7.9], [0, -16, -45], [-8, -12, -50], 3.4, 52),
     params={**AFTER, 'glass': 1, 'river': [[0, 0.22], [3.4, 0.72]]}, effects={'vignette': 0.45, 'shake': 0.35},
     captions=[sub(f'Every litre becomes {round(L_H2, -1):,.0f} litres|of hydrogen gas.', d=3.4)], ambience='roar')
shot('river3', 25.2, 28.4, camera=cam([0.0, 4.0, -9.0], [-1.0, 3.8, -9.2], [-15, -27, -40], [-20, -27.5, -38], 3.2, 55),
     params={**AFTER, 'glass': 1, 'river': [[0, 0.72], [1.6, 1.0]]}, transitionIn='whip', effects={'vignette': 0.45},
     captions=[sub('In one second, the river is gone.', d=3.2)])
# ---------- the city ----------
shot('crumble1', 28.4, 32.0, camera=cam([0.5, 1.8, -7.2], [0.3, 1.85, -7.6], [0, 6, -150], [0, 4, -150], 3.6, 46),
     params={**AFTER, 'glass': 1, 'river': 1, 'crumble': [[0, 0], [3.6, 0.45]], 'haze': [[0, 0], [3.6, 0.3]]}, transitionIn='whip',
     effects={'vignette': 0.4, 'shake': 0.2}, captions=[sub('Concrete is about half oxygen.', d=3.6)],
     sfx=[{'at': 0.3, 'type': 'rumble', 'dur': 3.4, 'gain': 0.8}], ambience='roar')
shot('crumble2', 32.0, 35.6, camera=cam([-5.8, 1.75, -7.2], [-5.4, 1.8, -7.4], [12, 3, -160], [8, 3, -160], 3.6, 50),
     params={**AFTER, 'glass': 1, 'river': 1, 'crumble': [[0, 0.45], [3.6, 0.85]], 'haze': [[0, 0.3], [3.6, 0.6]]}, transitionIn='whip',
     effects={'vignette': 0.4, 'shake': 0.3}, captions=[sub('Every building in the city|is turning to dust.', d=3.6)],
     sfx=[{'at': 0.0, 'type': 'rumble', 'dur': 3.6, 'gain': 0.9}], ambience='roar')
shot('ours', 35.6, 39.2, camera=cam([2.6, 1.05, -2.2], [2.3, 1.0, -2.6], [0, 1.3, -6.5], [-0.3, 1.2, -6.8], 3.6, 50, roll=[[0, 0], [3.6, 0.06]]),
     params={**AFTER, 'glass': 1, 'river': 1, 'crumble': 0.9, 'haze': [[0, 0.6], [3.6, 0.7]]}, transitionIn='whip',
     effects={'vignette': 0.5, 'shake': [[0, 0.3], [3.6, 0.75]]}, captions=[sub("So is the one you're standing on.", d=3.6)],
     sfx=[{'at': 0.2, 'type': 'rumble', 'dur': 3.4, 'gain': 1.0}, {'at': 1.4, 'type': 'crash', 'gain': 0.5}], ambience='roar')
shot('dust', 39.2, 43.0, camera=cam([2.8, 1.75, -5.4], [2.4, 1.75, -5.8], [-0.6, 1.3, -7.4], [-0.9, 1.0, -12], 3.8, 46),
     params={**AFTER, 'glass': 1, 'river': 1, 'crumble': 0.92, 'haze': [[0, 0.7], [3.8, 0.85]]}, transitionIn='whip',
     effects={'vignette': 0.5, 'shake': 0.15}, captions=[sub('The air fills with metal|and silicon dust.', d=3.8)])
shot('energy', 43.0, 47.2, camera=cam([0.8, 2.6, -7.8], [0.6, 2.8, -8.2], [-4, -24, -45], [-4, -20, -60], 4.2, 50),
     params={**AFTER, 'glass': 1, 'river': 1, 'crumble': 0.93, 'haze': 0.6}, transitionIn='whip', effects={'vignette': 0.5},
     captions=[sub('The hydrogen from the river you can see', d=2.1), sub(f'holds the energy of {HIRO:.0f} Hiroshima bombs.', a=2.1, d=4.2)])
shot('yet', 47.2, 51.2, camera=cam([0.3, 1.62, -3.8], [0.1, 1.6, -4.6], [-0.9, 1.0, -30], [-0.8, 0.8, -30], 4.0),
     params={**AFTER, 'glass': 1, 'river': 1, 'crumble': 0.94, 'haze': 0.85}, transitionIn='whip', effects={'vignette': 0.5},
     captions=[sub('Nothing is burning. Yet.', a=0.6, d=4.0)])
shot('return', 51.2, 55.0, camera=cam([3.0, 1.7, -6.9], [3.0, 1.72, -7.4], [-1, -6, -80], [-1, -5, -80], 3.8),
     params={**AFTER, 'glass': 1, 'river': 1, 'crumble': 0.95, 'haze': 0.85}, effects={'vignette': 0.5},
     captions=[sub('Then the oxygen comes back.', a=0.6, d=3.8)], sfx=[{'at': 1.0, 'type': 'riser', 'dur': 2.8, 'gain': 0.5}])
# ---------- oxygen returns: the hydrogen burns ----------
FIRE = {**AFTER, 'glass': 1, 'river': 1, 'crumble': 0.95, 'haze': 0.65}
def fire_params(a, b, **extra):
    return {**FIRE, 'spark': fk(lambda T: min(1, max(0, (T - 55.15) / 0.25)) * (1 - min(1, max(0, (T - 57) / 2))), a, b),
            'fireZ': fk(fire_z, a, b), 'fireball': fk(lambda T: min(1, max(0, (T - 55.6) / 3.0)), a, b), **extra}
def fire_counter(a, b, sub_):
    return {'label': 'THE FIRE', 'value': fk(fire_dist, a, b), 'unit': ' m', 'sub': sub_}
shot('spark', 55.0, 56.8, camera=cam([3.0, 1.72, -7.4], [3.0, 1.72, -7.4], [-1, -5, -80], [-1, -5.5, -80], 1.8),
     params=fire_params(55.0, 56.8), effects={'vignette': 0.5},
     hud={'counter': fire_counter(55.0, 56.8, 'HYDROGEN + OXYGEN')}, captions=[sub('Hydrogen. Oxygen. One spark.', a=0.4, d=1.8)],
     sfx=[{'at': 0.18, 'type': 'impact', 'gain': 0.7}], ambience='fire')
shot('front1', 56.8, 59.6, camera=cam([3.0, 1.72, -7.4], [3.0, 1.7, -7.3], [-1, -5, -80], [-1, -2, -80], 2.8),
     params=fire_params(56.8, 59.6), effects={'vignette': 0.5, 'shake': [[0, 0.2], [2.8, 0.45]]},
     hud={'counter': fire_counter(56.8, 59.6, 'HYDROGEN + OXYGEN')}, captions=[sub('The hydrogen is still here.', d=2.8)], ambience='fire')
shot('front2', 59.6, 62.5, camera=cam([3.0, 1.7, -7.3], [3.0, 1.66, -7.1], [-1, -2, -80], [-1, 1, -80], 2.9),
     params=fire_params(59.6, 62.5, debris=1), effects={'vignette': 0.55, 'shake': [[0, 0.45], [2.9, 0.9]]},
     hud={'counter': fire_counter(59.6, 62.5, 'HYDROGEN + OXYGEN')}, captions=[sub('And now it has oxygen to burn.', d=2.9)], ambience='fire')
shot('hit', 62.5, 66.0, camera=cam([3.0, 1.66, -7.1], [3.8, 0.35, -5.0], [-1, 1, -80], [5, 4, -40], 3.5, 54, roll=[[0, 0], [0.4, 0.5], [3.5, 0.95]]),
     params={**FIRE, 'fireball': 0.6, 'fireZ': -40, 'haze': 0.95}, effects={'vignette': 0.6, 'flash': [{'at': 0.0, 'dur': 0.35, 'color': '#fff8ea'}], 'crack': [{'at': 0.02, 'x': 0.55, 'y': 0.32}], 'shake': [[0, 1.0], [1.2, 0.4], [3.5, 0.1]], 'tint': {'color': '#c98a4a', 'amount': 0.35}},
     hud={'counter': {'label': 'THE FIRE', 'value': 0, 'format': 'text', 'text': 'HERE', 'sub': 'HYDROGEN + OXYGEN = WATER'}},
     captions=[sub('The fire turns back into water.', a=1.0, d=3.5)],
     sfx=[{'at': 0.0, 'type': 'impact', 'gain': 1.0}, {'at': 0.0, 'type': 'boom', 'gain': 0.8}], ambience='fire')
shot('rain', 66.0, 70.0, camera=cam([3.8, 0.35, -5.0], [3.8, 0.34, -5.0], [5, 4, -40], [4.5, 8, -30], 4.0, 54, roll=[[0, 0.95], [4.0, 0.95]]),
     params={**FIRE, 'fireball': 0, 'haze': [[0, 0.95], [4.0, 0.7]], 'dusk': 0.4}, effects={'vignette': 0.6, 'crack': [{'at': -1, 'x': 0.55, 'y': 0.32}], 'drops': [[0, 0], [3.5, 1]], 'tint': {'color': '#8a7a6a', 'amount': 0.25}, 'fade': {'color': '#000000', 'amount': [[0, 0], [3.2, 0], [4.0, 1]]}},
     hud={'counter': {'label': 'OXYGEN', 'value': 0, 'format': 'text', 'text': 'BACK', 'sub': 'MINUTES LATER'}},
     captions=[sub('Minutes later, it rains.', a=0.6, d=3.6)], ambience='rain')
shot('end', 70.0, 76.0, scene='black', params={'color': '#111111'},
     hud={'endcard': {'title': 'What if oxygen disappeared|for 5 seconds?', 'lines': ['Every oxygen atom gone, except inside living things.', 'Part 2: what if nitrogen disappeared?'], 'cta': 'Comment your guess · Follow for more What Ifs'}})

end = segs[-1]['to']
story_end = 5 - (min(end, RETURN) - EVENT) * SLOW
tl = {
    'meta': {'id': 'Oxygen5s', 'title': 'What if oxygen disappeared for 5 seconds?', 'fps': 30, 'width': 1080, 'height': 1920, 'fovScale': 1.25, 'autoWhoosh': False,
             'music': {'keys': [[0, 0.3], [4.8, 0.55], [5.0, 0.15], [6.0, 0.4], [18, 0.45], [28, 0.6], [43, 0.7], [51, 0.5], [54.8, 0.75], [55.0, 0.1],
                                [56, 0.6], [62.4, 0.95], [62.5, 0.1], [66, 0.3], [70, 0.2], [end, 0.2]], 'root': 52}},
    'hud': {'clock': {'label': 'OXYGEN DISAPPEARS IN', 'keys': [[0, 5.0], [EVENT, 0.0], [EVENT + 0.001, 5.0], [RETURN, 0.0]], 'format': 'countdown',
                      'style': 'minimal', 'colorRamp': [1e9, 2e9], 'labelKeys': [[0, 'OXYGEN DISAPPEARS IN'], [EVENT, 'OXYGEN RETURNS IN']],
                      'sub': f'AIR PRESSURE {P0 / PSI:.1f} PSI',
                      'subKeys': [[0, f'AIR PRESSURE {P0 / PSI:.1f} PSI'], [EVENT, f'AIR PRESSURE {P1 / PSI:.1f} PSI · -21%'],
                                  [21.8, f'HYDROGEN: {h2_m3 / 1e6:,.0f} MILLION M³'], [28.4, f'AIR PRESSURE {P1 / PSI:.1f} PSI · -21%']]},
            'start': 0, 'end': RETURN - 0.001},
    'segments': segs,
}
json.dump(tl, open('src/timelines/oxygen-5s.json', 'w'), indent=1)
print(f'wrote oxygen-5s.json {end}s, {len(segs)} shots | P1 {P1 / PSI:.2f} psi, alt {alt:.2f} km, H2 {L_H2:.0f} L/L, river H2 {h2_m3:.2e} m3, {HIRO:.1f} Hiroshimas, fire speed {(CAMZ - FIRE_Z0) / (FIRE_T1 - FIRE_T0):.1f} m/s')
