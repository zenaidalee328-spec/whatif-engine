// Screen-space overlays drawn over the 3D scene: lens crack, POV phone alert, end card.
import React from 'react';
import { AbsoluteFill, interpolate, useVideoConfig } from 'remotion';
import { FONT, SERIF } from './Hud';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// deterministic pseudo-random so every render of a frame is identical
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Glass crack spreading out from an impact point in ~0.15 s, then held. */
export const Crack: React.FC<{ cracks: { at: number; x?: number; y?: number }[]; t: number }> = ({ cracks, t }) => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={width} height={height}>
        {cracks.map((c, ci) => {
          if (t < c.at) return null;
          const grow = interpolate(t - c.at, [0, 0.15], [0, 1], clamp);
          const cx = (c.x ?? 0.5) * width, cy = (c.y ?? 0.3) * height, R = Math.max(width, height) * 0.45;
          const rays: React.ReactNode[] = [];
          for (let i = 0; i < 11; i++) {
            const a0 = (i / 11) * Math.PI * 2 + rnd(ci * 50 + i) * 0.4;
            let x = cx, y = cy, a = a0;
            let d = `M${x},${y}`;
            const len = R * (0.45 + rnd(ci * 50 + i + 7) * 0.55) * grow;
            for (let k = 1; k <= 6; k++) {
              a += (rnd(ci * 90 + i * 7 + k) - 0.5) * 0.5;
              x += Math.cos(a) * (len / 6);
              y += Math.sin(a) * (len / 6);
              d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
            }
            rays.push(<path key={i} d={d} stroke="rgba(255,255,255,0.75)" strokeWidth={2.2} fill="none" />);
          }
          // concentric fracture rings
          const rings = [0.06, 0.13, 0.22].map((r, k) => (
            <circle key={'r' + k} cx={cx} cy={cy} r={R * r * grow} stroke="rgba(255,255,255,0.35)" strokeWidth={1.4} fill="none" strokeDasharray={`${18 + k * 9} ${11 + k * 6}`} />
          ));
          return (
            <g key={ci} style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.6))' }}>
              {rays}
              {rings}
              <circle cx={cx} cy={cy} r={7} fill="rgba(255,255,255,0.9)" />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/** First-person hands holding a phone that lights up with an alert (slides up from the bottom). */
export const Phone: React.FC<{ ph: { from: number; to: number; title: string; body?: string; time?: string }; t: number }> = ({ ph, t }) => {
  const { width, height } = useVideoConfig();
  if (t < ph.from || t > ph.to) return null;
  const k = Math.min(interpolate(t, [ph.from, ph.from + 0.35], [0, 1], clamp), interpolate(t, [ph.to - 0.3, ph.to], [1, 0], clamp));
  const ease = 1 - Math.pow(1 - k, 3);
  const w = Math.min(width * 0.46, height * 0.3), h = w * 1.95;
  const jitter = Math.sin(t * 9) * 3 + Math.sin(t * 23) * 1.5; // shaky hands
  const skin = '#c99a7a', skinD = '#a9785a';
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', pointerEvents: 'none' }}>
      <div style={{ position: 'relative', width: w * 1.7, height: h * 0.95, transform: `translateY(${(1 - ease) * h + jitter}px) rotate(${-3 + jitter * 0.3}deg)`, marginBottom: -h * 0.18 }}>
        {/* fingers behind the phone */}
        {[0, 1, 2, 3].map((i) => (
          <div key={'l' + i} style={{ position: 'absolute', left: w * 0.27 - w * 0.12, top: h * (0.2 + i * 0.13), width: w * 0.2, height: h * 0.09, background: skin, borderRadius: w * 0.05, boxShadow: `inset -6px -4px 0 ${skinD}` }} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <div key={'r' + i} style={{ position: 'absolute', left: w * 1.27 + w * 0.0, top: h * (0.2 + i * 0.13), width: w * 0.2, height: h * 0.09, background: skin, borderRadius: w * 0.05, boxShadow: `inset 6px -4px 0 ${skinD}` }} />
        ))}
        {/* phone */}
        <div style={{ position: 'absolute', left: w * 0.35, top: 0, width: w, height: h, background: '#0d0f12', borderRadius: w * 0.12, padding: w * 0.05, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: w * 0.09, background: 'linear-gradient(#2a2f3a,#14171d)', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: FONT, color: 'white' }}>
            <div style={{ marginTop: h * 0.07, fontSize: w * 0.2, fontWeight: 300 }}>{ph.time ?? '4:12'}</div>
            <div style={{ marginTop: h * 0.05, width: '86%', background: 'rgba(250,250,250,0.94)', color: '#111', borderRadius: w * 0.05, padding: w * 0.05, transform: `scale(${0.9 + 0.1 * ease})` }}>
              <div style={{ fontSize: w * 0.05, fontWeight: 700, color: '#d0021b', letterSpacing: 1 }}>⚠ EMERGENCY ALERT</div>
              <div style={{ fontSize: w * 0.085, fontWeight: 800, marginTop: w * 0.02, lineHeight: 1.1 }}>{ph.title}</div>
              {ph.body && <div style={{ fontSize: w * 0.05, marginTop: w * 0.02, lineHeight: 1.25 }}>{ph.body}</div>}
            </div>
          </div>
        </div>
        {/* thumbs in front */}
        <div style={{ position: 'absolute', left: w * 0.22, top: h * 0.62, width: w * 0.28, height: h * 0.1, background: skin, borderRadius: w * 0.06, transform: 'rotate(-35deg)', boxShadow: `inset -5px -5px 0 ${skinD}` }} />
        <div style={{ position: 'absolute', left: w * 1.2, top: h * 0.62, width: w * 0.28, height: h * 0.1, background: skin, borderRadius: w * 0.06, transform: 'rotate(35deg)', boxShadow: `inset 5px -5px 0 ${skinD}` }} />
      </div>
    </AbsoluteFill>
  );
};

/** Closing card on black: title, small facts, call to action (Part 2 / comment / follow). */
export const EndCard: React.FC<{ e: { title: string; lines?: string[]; cta?: string }; t: number }> = ({ e, t }) => {
  const { width } = useVideoConfig();
  const u = width / 1080;
  const a = (d: number) => interpolate(t, [d, d + 0.5], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: '#111', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 80 * u }}>
      <div style={{ opacity: a(0), fontFamily: SERIF, color: 'white', fontSize: 64 * u, lineHeight: 1.2 }}>
        {e.title.split('|').map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      {e.lines?.map((l, i) => (
        <div key={i} style={{ opacity: a(0.6 + i * 0.25), fontFamily: FONT, color: 'rgba(255,255,255,0.65)', fontSize: 24 * u, letterSpacing: 3 * u, marginTop: (i ? 10 : 40) * u, textTransform: 'uppercase' }}>
          {l}
        </div>
      ))}
      {e.cta && (
        <div style={{ opacity: a(1.4), fontFamily: FONT, color: 'white', fontSize: 30 * u, fontWeight: 700, letterSpacing: 4 * u, marginTop: 48 * u, textTransform: 'uppercase' }}>
          {e.cta}
        </div>
      )}
    </AbsoluteFill>
  );
};

/** Water drops landing on the lens: `amount` 0..1 = how many of the drops are present; each runs down slowly. */
export const Drops: React.FC<{ amount: number; t: number }> = ({ amount, t }) => {
  const { width, height } = useVideoConfig();
  const n = Math.round(60 * Math.min(1, Math.max(0, amount)));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: n }, (_, i) => {
        const r = (6 + rnd(i * 3) * 22) * (width / 1080);
        const x = rnd(i * 7) * width;
        const y = ((rnd(i * 11) * height + t * (10 + rnd(i * 5) * 50)) % (height + 60)) - 30;
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: r, height: r * 1.25, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), rgba(255,255,255,0.08) 45%, rgba(0,0,0,0.18) 75%, rgba(255,255,255,0.25))', backdropFilter: 'blur(2px)' }} />
        );
      })}
    </AbsoluteFill>
  );
};
