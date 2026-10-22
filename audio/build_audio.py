"""Builds the soundtrack for a timeline JSON (synthesised, no samples).

usage: python3 audio/build_audio.py src/timelines/<file>.json   -> public/audio/<id>.wav

Layers: music bed (follows meta.music.keys intensity), per-scene ambience,
sfx cues from each segment (local times), auto whooshes on whip/glitch cuts,
ducking + heartbeat during microsleeps.
"""
import json
import os
import sys
import zlib

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
SCENE_AMBIENCE = {
    'street': 'street', 'room': 'room', 'city': 'city', 'brain': 'brain',
    'supermarket': 'supermarket', 'black': 'none',
    'northpole': 'wind', 'tunnel': 'roar', 'earthcut': 'space', 'planet': 'space',
    'city2': 'city', 'rooftop': 'rooftop', 'land2': 'wind',
}


def main(path):
    tl = json.load(open(path))
    meta = tl['meta']
    dur = max(s['to'] for s in tl['segments'])
    n = int(SR * dur) + 1
    t = np.arange(n) / SR
    rng = np.random.default_rng(zlib.crc32(meta['id'].encode()))
    L = np.zeros(n)
    R = np.zeros(n)

    def lp(x, f, o=2):
        b, a = butter(o, min(f, SR / 2 - 100) / (SR / 2), 'low')
        return lfilter(b, a, x)

    def hp(x, f, o=2):
        b, a = butter(o, f / (SR / 2), 'high')
        return lfilter(b, a, x)

    def bp(x, lo, hi, o=2):
        b, a = butter(o, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], 'band')
        return lfilter(b, a, x)

    def add(sig, start, gain=1.0, pan=0.0):
        i = int(max(0, start) * SR)
        j = min(n, i + len(sig))
        if i >= n or j <= i:
            return
        s = sig[: j - i] * gain
        L[i:j] += s * (1 - max(0, pan))
        R[i:j] += s * (1 + min(0, pan))

    def noise(sec):
        return rng.standard_normal(int(sec * SR))

    def k(sec):
        return np.arange(int(sec * SR)) / SR

    def crack(d=0.9, **_):
        # glass impact: sharp click + bright shatter tail
        kk = k(d)
        click = hp(noise(d), 2500) * np.exp(-kk * 60)
        shards = bp(noise(d), 3000, 12000) * np.exp(-kk * 5) * (rng.random(len(kk)) < 0.02)
        return click * 1.2 + shards * 2.5 + lp(noise(d), 200) * np.exp(-kk * 12) * 0.8

    def alert(d=1.6, **_):
        # emergency-alert two-tone (853 + 960 Hz), pulsed
        kk = k(d)
        tone = (np.sin(2 * np.pi * 853 * kk) + np.sin(2 * np.pi * 960 * kk)) * 0.5
        gate = (np.mod(kk, 0.5) < 0.38).astype(float)
        return tone * gate * 0.5

    def impact(d=2.2, **_):
        # cinematic hit: transient + sub drop + noise tail
        kk = k(d)
        sub = np.sin(2 * np.pi * (55 * np.exp(-kk * 1.5) + 28) * kk) * np.exp(-kk * 2.2)
        hit = lp(noise(d), 1800) * np.exp(-kk * 14)
        return sub * 1.2 + hit * 0.9

    def rumble(d=4.0, **_):
        # collapsing buildings: long low rumble with crackle
        kk = k(d)
        env = np.minimum(1, kk / 0.4) * np.exp(-kk * 0.5)
        return (lp(noise(d), 120) * 1.4 + bp(noise(d), 300, 900) * 0.15 * (rng.random(len(kk)) < 0.05)) * env

    def subdrop(d=1.5, **_):
        kk = k(d)
        return np.sin(2 * np.pi * np.cumsum(90 * np.exp(-kk * 2.5) + 25) / SR) * np.exp(-kk * 1.8)

    # ---------- sfx library ----------
    def footsteps(d=4, rate=1.9, **_):
        out = np.zeros(int(d * SR) + SR)
        for s in np.arange(0, d, 1 / rate):
            j = max(0, int((s + rng.uniform(-0.015, 0.015)) * SR))
            m = int(0.1 * SR)
            step = lp(rng.standard_normal(m), 900) * np.exp(-k(0.1) * 50) + 0.4 * np.sin(2 * np.pi * 70 * k(0.1)) * np.exp(-k(0.1) * 40)
            out[j:j + m] += step * rng.uniform(0.75, 1.0)
        return out

    def cart(d=4, **_):
        x = noise(d)
        rumble = lp(x, 160) * 1.4
        rattle = bp(x, 1800, 5000) * (np.abs(np.sin(2 * np.pi * 7.3 * k(d))) ** 8) * 0.5
        squeak = 0.05 * np.sin(2 * np.pi * (2400 + 300 * np.sin(2 * np.pi * 0.9 * k(d))) * k(d)) * (np.sin(2 * np.pi * 0.45 * k(d)) > 0.85)
        return (rumble + rattle + squeak) * np.minimum(1, k(d) * 4) * np.minimum(1, (d - k(d)) * 4)

    def whoosh(d=0.6, **_):
        x = noise(d)
        env = np.sin(np.pi * k(d) / d) ** 2
        lo = bp(x, 300, 1500) * env
        hi = bp(x, 1500, 6000) * env * np.linspace(0.2, 1, len(x))
        return (lo + hi * 0.6) * 1.3

    def boom(d=2.5, **_):
        kk = k(d)
        f = 38 + 50 * np.exp(-kk * 6)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-kk * 1.6)
        hit = lp(noise(d), 2500) * np.exp(-kk * 25) * 0.6
        return (body + hit) * 1.2

    def heartbeat(d=2, bpm=72, **_):
        out = np.zeros(int(d * SR) + SR)
        for s in np.arange(0, d, 60 / bpm):
            for off, g in ((0, 1.0), (0.24, 0.65)):
                m = int(0.18 * SR)
                kk = k(0.18)
                beat = np.sin(2 * np.pi * 48 * kk) * np.exp(-kk * 24)
                j = int((s + off) * SR)
                out[j:j + m] += beat * g
        return out * 1.4

    def screech(d=1.5, **_):
        kk = k(d)
        return bp(noise(d), 2200, 3600) * np.sin(np.pi * kk / d) ** 0.5 * np.exp(-kk * 0.6) * 1.2

    def horn(d=1.1, **_):
        kk = k(d)
        h = (np.sign(np.sin(2 * np.pi * 415 * kk)) + np.sign(np.sin(2 * np.pi * 523 * kk))) * 0.5
        return lp(h, 2500) * np.interp(kk, [0, 0.03, d - 0.1, d], [0, 1, 1, 0]) * 0.6

    def beep(d=0.14, f=1850, **_):
        kk = k(d)
        return np.sin(2 * np.pi * f * kk) * np.interp(kk, [0, 0.005, d - 0.02, d], [0, 1, 1, 0]) * 0.5

    def glitch(d=0.35, **_):
        x = np.sign(np.sin(2 * np.pi * rng.uniform(80, 400) * k(d))) * 0.4
        x *= (rng.random(len(x) // 800 + 1).repeat(800)[: len(x)] > 0.4)
        return bp(x + noise(d) * 0.3, 200, 6000)

    def riser(d=2.0, **_):
        kk = k(d)
        f = 200 * (6 ** (kk / d))
        tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
        air = bp(noise(d), 1000, 8000) * (kk / d) ** 2 * 0.8
        return (tone + air) * (kk / d) ** 1.5

    def tick(d=2, rate=1, **_):
        out = np.zeros(int(d * SR) + SR)
        for s in np.arange(0, d, 1 / rate):
            m = int(0.03 * SR)
            j = int(s * SR)
            out[j:j + m] += hp(rng.standard_normal(m), 3000) * np.exp(-k(0.03) * 150)
        return out

    def thud(d=0.6, **_):
        kk = k(d)
        return (np.sin(2 * np.pi * 60 * kk) * np.exp(-kk * 12) + lp(noise(d), 600) * np.exp(-kk * 30) * 0.5) * 1.3

    def crash(d=1.5, **_):
        kk = k(d)
        return (hp(noise(d), 1500) * np.exp(-kk * 3) + thud(d)) * 0.9

    def whisper(d=2, **_):
        kk = k(d)
        x = bp(noise(d), 1500, 5500) * (0.5 + 0.5 * np.sin(2 * np.pi * 3.1 * kk) ** 2) * np.sin(np.pi * kk / d)
        return x * 0.6

    def warble(d=2, **_):
        kk = k(d)
        f = 330 + 18 * np.sin(2 * np.pi * 5.5 * kk)
        a = np.sin(2 * np.pi * np.cumsum(f) / SR) + np.sin(2 * np.pi * np.cumsum(f * 1.012) / SR)
        return a * 0.18 * np.sin(np.pi * kk / d)

    def hum(d=2, f=120, **_):
        kk = k(d)
        return (np.sin(2 * np.pi * f * kk) + 0.3 * np.sin(2 * np.pi * 2 * f * kk)) * 0.15

    SFX = dict(footsteps=footsteps, cart=cart, whoosh=whoosh, boom=boom, heartbeat=heartbeat, screech=screech,
               horn=horn, beep=beep, scan=beep, glitch=glitch, riser=riser, tick=tick, thud=thud, crash=crash,
               whisper=whisper, warble=warble, hum=hum, crack=crack, alert=alert, impact=impact, subdrop=subdrop, rumble=rumble)

    # ---------- ambience per segment ----------
    def ambience(kind, d):
        x = noise(d)
        if kind == 'street':
            return lp(x, 500) * 0.28
        if kind == 'city':
            return lp(x, 350) * 0.3 + bp(x, 600, 1200) * 0.03
        if kind == 'room':
            return lp(x, 200) * 0.08
        if kind == 'supermarket':
            kk = k(d)
            buzz = (np.sin(2 * np.pi * 120 * kk) + 0.35 * np.sin(2 * np.pi * 240 * kk) + 0.12 * np.sin(2 * np.pi * 360 * kk)) * 0.05
            return buzz + lp(x, 900) * 0.07 + bp(x, 3000, 7000) * 0.006
        if kind == 'brain':
            return lp(x, 120) * 0.15
        if kind == 'wind':
            kk = k(d)
            gust = 0.6 + 0.4 * np.sin(2 * np.pi * 0.23 * kk) * np.sin(2 * np.pi * 0.07 * kk + 1)
            return (lp(x, 700) * 0.22 + bp(x, 900, 2400) * 0.03) * gust
        if kind == 'roar':  # falling fast: rumble + rushing
            return lp(x, 160) * 0.45 + bp(x, 400, 1600) * 0.05
        if kind == 'space':
            kk = k(d)
            return lp(x, 90) * 0.12 + np.sin(2 * np.pi * 41 * kk) * 0.03
        if kind == 'rooftop':  # city hum far below + crowd murmur
            kk = k(d)
            murmur = bp(x, 250, 1100) * (0.6 + 0.4 * lp(np.abs(noise(d)), 3) * 6)
            return lp(x, 300) * 0.12 + murmur * 0.05
        if kind == 'rain':
            return bp(x, 1500, 7000) * 0.06 + lp(x, 400) * 0.05
        if kind == 'fire':  # roaring wall of flame
            kk = k(d)
            return lp(x, 220) * (0.5 + 0.3 * np.sin(2 * np.pi * 0.7 * kk)) + bp(x, 600, 2500) * 0.06
        if kind == 'slowmo':
            return lp(x, 120) * 0.2
        if kind == 'office':
            return lp(x, 300) * 0.08 + hum(d, 60) * 0.5
        return np.zeros(len(x))

    duck = np.ones(n)
    for seg in tl['segments']:
        a, b = seg['from'], seg['to']
        d = b - a
        kind = seg.get('ambience') or SCENE_AMBIENCE.get(seg['scene'], 'none')
        amb = ambience(kind, d)
        fade = np.minimum(1, np.minimum(k(d) / 0.05, (d - k(d)) / 0.05))
        add(amb * fade[: len(amb)], a, 1.0)
        tr = seg.get('transitionIn', 'cut')
        cues = seg.get('sfx', [])
        auto = meta.get('autoWhoosh', True)
        if auto and tr in ('whip', 'glitch') and not any(c['at'] < 0.1 for c in cues):
            add((whoosh() if tr == 'whip' else glitch()), a, 0.7)
        if auto and tr == 'flash' and not any(c['at'] < 0.1 for c in cues):
            add(impact(), a, 0.8)
        fxd = seg.get('effects', {})
        for c in fxd.get('crack', []):
            add(crack(), a + c['at'], 0.9)
        if fxd.get('phone'):
            add(alert(min(2.0, fxd['phone']['to'] - fxd['phone']['from'])), a + fxd['phone']['from'] + 0.15, 0.35)
        for im in fxd.get('impact', []):
            add(impact(), a + im['at'], 0.8)
        for c in cues:
            fn = SFX.get(c['type'])
            if not fn:
                print('unknown sfx', c['type'])
                continue
            kw = {}
            if 'dur' in c:
                kw['d'] = c['dur']
            if 'rate' in c:
                kw['rate'] = c['rate']
            add(fn(**kw), a + c['at'], c.get('gain', 0.7), c.get('pan', 0.0))
        for m in seg.get('effects', {}).get('microsleep', []):
            s0 = a + m['at']
            i0, i1 = int(s0 * SR), int((s0 + m['dur']) * SR)
            duck[i0:i1] = 0.12

    # ---------- music bed ----------
    mk = meta.get('music', {}).get('keys', [[0, 0.4], [dur, 0.4]])
    inten = np.interp(t, [p[0] for p in mk], [p[1] for p in mk])
    root = meta.get('music', {}).get('root', 55)
    lfo = 0.65 + 0.35 * np.sin(2 * np.pi * 0.11 * t)
    pad = (np.sin(2 * np.pi * root * t) + 0.55 * np.sin(2 * np.pi * root * 1.5 * t + 0.4 * np.sin(2 * np.pi * 0.2 * t))
           + 0.35 * np.sin(2 * np.pi * root * 2.0 * t) + 0.22 * np.sin(2 * np.pi * root * 2.4 * t * (1 + 0.002 * inten)))
    music = pad * lfo * (0.05 + 0.12 * inten)
    # pulse (8ths at 100 bpm) once tension builds
    pulse_env = (np.mod(t, 0.3) < 0.12) * np.exp(-np.mod(t, 0.3) * 18)
    music += np.sin(2 * np.pi * root * t) * pulse_env * np.clip((inten - 0.4) * 2.5, 0, 1) * 0.35
    # high shimmer at peak tension
    music += bp(rng.standard_normal(n), 4000, 9000) * np.clip((inten - 0.65) * 3, 0, 1) * 0.02
    L += music
    R += np.roll(music, 330)

    L *= duck
    R *= duck
    fade = np.interp(t, [0, 0.05, dur - 0.25, dur], [0, 1, 1, 0])
    L *= fade
    R *= fade
    peak = max(np.abs(L).max(), np.abs(R).max(), 1e-6)
    out = np.stack([L, R], 1) / peak * 0.89
    dst = os.path.join('public', meta.get('audio', f"audio/{meta['id']}.wav"))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    wavfile.write(dst, SR, (out * 32767).astype(np.int16))
    print('wrote', dst, f'{dur:.1f}s')


if __name__ == '__main__':
    main(sys.argv[1])
