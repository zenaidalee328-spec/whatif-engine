import React from 'react';
import { AbsoluteFill, Easing, interpolate, useVideoConfig } from 'remotion';
import type { Caption, ClockSpec, HudStat, SegmentHud } from './types';
import { fmtHMS, v } from './val';

export const FONT = 'Inter, "Inter Display", sans-serif';
export const SERIF = 'Georgia, "DejaVu Serif", "Times New Roman", serif';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const vis = (t: number, a: number, b: number, f = 0.3) => {
  const g = Math.min(f, (b - a) / 3);
  return interpolate(t, [a, a + g, b - g, b], [0, 1, 1, 0], clamp);
};
const ACCENT = '#ffcf4a';
const LABEL = 'rgba(180,195,255,0.85)';

const Panel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      background: 'linear-gradient(180deg, rgba(10,12,22,0.8), rgba(10,12,22,0.6))',
      border: '1px solid rgba(170,190,255,0.25)',
      borderRadius: 14,
      padding: '14px 22px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
      ...style,
    }}
  >
    {children}
  </div>
);
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 15, letterSpacing: 3.5, fontWeight: 600, color: LABEL }}>{children}</div>
);
const pop = (o: number, side: 'left' | 'right' = 'left'): React.CSSProperties => ({
  opacity: o,
  transform: `translateX(${(1 - o) * (side === 'left' ? -40 : 40)}px)`,
});

const rampColor = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return `rgb(255,${Math.round(255 - 165 * k)},${Math.round(255 - 205 * Math.min(1, k * 1.6))})`;
};

const fill = (s: string, n: number | undefined, d = 0) => (n === undefined ? s : s.replace('{n}', n.toFixed(d)));

/** Global "AWAKE FOR" style counter. T = absolute seconds. */
export const ClockPanel: React.FC<{ c: ClockSpec & { text?: string }; T: number; opacity: number }> = ({ c, T, opacity }) => {
  const label = c.labelKeys ? [...c.labelKeys].reverse().find(([t0]) => T >= t0)?.[1] ?? c.label : c.label;
  const sub = c.subKeys ? [...c.subKeys].reverse().find(([t0]) => T >= t0)?.[1] ?? c.sub : c.sub;
  const val = v(c.keys, T, 0);
  const fmt = c.format ?? 'hms';
  const ms = Math.max(0, val);
  const text = c.text !== undefined ? c.text : fmt === 'countdown' ? `${Math.floor(ms / 60)}:${String(Math.floor(ms % 60)).padStart(2, '0')}.${String(Math.floor((ms % 1) * 1000)).padStart(3, '0')}` : fmt === 'hms' ? fmtHMS(val) : fmt === 'hours' ? `${Math.floor(val)}` : fmt === 'days' ? val.toFixed(1) : val.toLocaleString('en-US', { minimumFractionDigits: val >= 1000 ? 0 : c.decimals ?? 0, maximumFractionDigits: val >= 1000 ? 0 : c.decimals ?? 0 }) + (c.unit ?? '');
  const ramp = c.colorRamp ?? [0, 1];
  const col = rampColor((val - ramp[0]) / Math.max(1e-6, ramp[1] - ramp[0]));
  if (c.style === 'minimal')
    return (
      <div style={{ opacity, fontFamily: FONT, textShadow: '0 2px 14px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: 15, letterSpacing: 4, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{label}</div>
        <div style={{ fontSize: 54, fontWeight: 400, fontFamily: c.format === 'number' ? SERIF : undefined, fontVariantNumeric: 'tabular-nums', color: col, lineHeight: 1.1, letterSpacing: 0.5 }}>{text}</div>
        {sub && <div style={{ fontSize: 14, letterSpacing: 2, color: 'rgba(255,255,255,0.6)' }}>{sub}</div>}
      </div>
    );
  return (
    <div style={pop(opacity)}>
      <Panel>
        <Label>{label}</Label>
        <div style={{ fontSize: 66, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: col, lineHeight: 1.1, textShadow: `0 0 24px ${col}55` }}>{text}</div>
        {c.sub && <div style={{ fontSize: 15, letterSpacing: 2, color: 'rgba(255,255,255,0.6)' }}>{c.sub}</div>}
      </Panel>
    </div>
  );
};

const Stat: React.FC<{ s: HudStat; t: number }> = ({ s, t }) => (
  <div style={pop(vis(t, s.from, s.to), s.side)}>
    <Panel style={{ minWidth: 300 }}>
      <Label>{s.label}</Label>
      <div style={{ fontSize: 44, fontWeight: 800, color: s.color ?? ACCENT, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
        {fill(s.value, s.count !== undefined ? v(s.count, t) : undefined, s.decimals)}
        {s.sub && <span style={{ fontSize: 20, fontWeight: 600, opacity: 0.75 }}> {s.sub}</span>}
      </div>
    </Panel>
  </div>
);

/** Segment HUD. t = local seconds. `clock` is the global clock element (rendered in the left stack). */
export const SegmentHudView: React.FC<{ h: SegmentHud | undefined; t: number; frame: number; clock?: React.ReactNode }> = ({ h, t, frame, clock }) => {
  const on = (x: { from: number; to: number }) => t >= x.from && t <= x.to;
  const stats = (h?.stats ?? []).filter(on);
  const left = stats.filter((s) => s.side !== 'right');
  const right = stats.filter((s) => s.side === 'right');
  const { width, height } = useVideoConfig();
  // vertical (TikTok/Shorts): keep clear of the top tabs, the right-hand buttons and the bottom description
  const vert = height > width;
  const top = vert ? 250 : 50;
  const side = vert ? 40 : 56;
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: 'white' }}>
      {/* left stack */}
      <div style={{ position: 'absolute', left: side, top, transformOrigin: 'top left', transform: vert ? 'scale(1.3)' : undefined, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
        {clock}
        {(h?.alerts ?? []).filter(on).map((a, i) => {
          const blink = a.blink && Math.sin(frame * 0.45) < -0.3 ? 0.45 : 1;
          return (
            <div key={i} style={{ ...pop(vis(t, a.from, a.to, 0.2)), opacity: vis(t, a.from, a.to, 0.2) * blink }}>
              <div style={{ background: a.color ?? 'rgba(170,20,32,0.9)', borderRadius: 10, padding: '10px 18px', fontSize: 22, fontWeight: 800, letterSpacing: 2, fontVariantNumeric: 'tabular-nums', boxShadow: '0 0 30px rgba(255,40,60,0.35)' }}>
                {fill(a.text, a.count !== undefined ? v(a.count, t - a.from) : undefined, a.decimals)}
              </div>
            </div>
          );
        })}
        {left.map((s, i) => (
          <Stat key={i} s={s} t={t} />
        ))}
        {(h?.meters ?? []).filter(on).filter((m) => m.side !== 'right').map((m, i) => {
          const f = Math.max(0, Math.min(1, v(m.value, t)));
          const col = m.color ?? '#ffb04a';
          return (
            <div key={i} style={pop(vis(t, m.from, m.to))}>
              <Panel style={{ minWidth: 360 }}>
                <Label>{m.label}</Label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
                  <div style={{ flex: 1, height: 12, background: 'rgba(255,255,255,0.12)', borderRadius: 6 }}>
                    <div style={{ width: `${f * 100}%`, height: 12, background: col, borderRadius: 6, boxShadow: `0 0 12px ${col}` }} />
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: col, fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'right' }}>
                    {m.noValue ? (v(m.value, t + 0.1) < f ? '↓' : '↑') : `${Math.round(f * 100)}${m.suffix ?? '%'}`}
                  </div>
                </div>
              </Panel>
            </div>
          );
        })}
        {(h?.compare ?? []).filter(on).map((c, i) => {
          const val = v(c.value, t);
          const f = Math.min(1.08, val / c.target);
          return (
            <div key={i} style={pop(vis(t, c.from, c.to))}>
              <Panel style={{ width: 460 }}>
                <Label>{c.label}</Label>
                <div style={{ position: 'relative', height: 16, background: 'rgba(255,255,255,0.12)', borderRadius: 8, marginTop: 14 }}>
                  <div style={{ width: `${Math.min(1, f) * 100}%`, height: 16, background: f >= 1 ? '#ff5b4a' : ACCENT, borderRadius: 8 }} />
                  <div style={{ position: 'absolute', left: 'calc(100% - 2px)', top: -8, width: 3, height: 32, background: 'white' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: ACCENT, fontWeight: 800 }}>
                    {c.youLabel ?? 'YOU'}: {Math.floor(val)} {c.unit ?? ''}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
                    {c.targetLabel}: {c.target} {c.unit ?? ''}
                  </span>
                </div>
              </Panel>
            </div>
          );
        })}
      </div>

      {/* right stack */}
      <div style={{ position: 'absolute', right: side, top, transformOrigin: 'top right', transform: vert ? 'scale(1.3)' : undefined, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-end', textAlign: 'right' }}>
        {(h?.tags ?? []).filter(on).map((g, i) => (
          <div key={i} style={pop(vis(t, g.from, g.to), 'right')}>
            <div style={{ border: '2px solid rgba(255,255,255,0.8)', padding: '8px 20px', borderRadius: 8, fontWeight: 800, fontSize: 24, letterSpacing: 6, background: 'rgba(0,0,0,0.35)' }}>{g.text}</div>
            {g.sub && <div style={{ marginTop: 6, fontSize: 15, color: 'rgba(255,255,255,0.65)' }}>{g.sub}</div>}
          </div>
        ))}
        {(h?.next ?? []).filter(on).map((n, i) => (
          <div key={i} style={pop(vis(t, n.from, n.to), 'right')}>
            <Panel>
              <Label>NEXT</Label>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{n.title}</div>
              {n.text && <div style={{ fontSize: 18, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>{n.text}</div>}
            </Panel>
          </div>
        ))}
        {right.map((s, i) => (
          <Stat key={i} s={s} t={t} />
        ))}
      </div>

      {/* location chip */}
      {h?.location && (
        <div style={{ position: 'absolute', top: vert ? 165 : 56, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: vis(t, 0.15, 3.6, 0.35) }}>
          <div style={{ background: 'rgba(10,12,22,0.7)', border: '1px solid rgba(170,190,255,0.25)', borderRadius: 30, padding: '8px 24px', fontSize: 20, fontWeight: 700, letterSpacing: 4 }}>
            <span style={{ color: '#ff5b4a', marginRight: 10 }}>●</span>
            {h.location}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

/** "Next" text with a live countdown, built by Video from the clock. */
export const nextText = (unit: 'hours' | 'minutes' | 'days' | undefined, remainingSec: number) => {
  const r = Math.max(0, remainingSec);
  if (unit === 'minutes') return `in ~${Math.ceil(r / 60)} min`;
  if (unit === 'days') return `in ~${(r / 86400).toFixed(1)} days`;
  return `in ~${Math.ceil(r / 3600)} hours`;
};


/** cinematic small captions: serif italic, soft fade (style 'subtle' lower third, 'top' upper area) */
const SubtleCaption: React.FC<{ c: Caption; t: number; vert: boolean }> = ({ c, t, vert }) => {
  const local = t - c.from;
  const dur = c.to - c.from;
  const f = Math.min(0.35, dur / 3);
  const op = interpolate(local, [0, f, dur - f, dur], [0, 1, 1, 0], clamp);
  const top = c.style === 'top';
  return (
    <AbsoluteFill style={{ justifyContent: top ? 'flex-start' : 'flex-end', alignItems: 'center', paddingTop: top ? (vert ? 560 : 160) : 0, paddingBottom: top ? 0 : vert ? 640 : 110 }}>
      <div
        style={{
          opacity: op,
          maxWidth: vert ? 900 : 1300,
          textAlign: 'center',
          fontFamily: SERIF,
          fontStyle: top ? 'normal' : 'italic',
          fontSize: vert ? (top ? 58 : 46) : top ? 52 : 40,
          fontWeight: 400,
          lineHeight: 1.25,
          letterSpacing: 0.3,
          color: 'rgba(255,255,255,0.94)',
          textShadow: '0 2px 18px rgba(0,0,0,0.65), 0 1px 3px rgba(0,0,0,0.6)',
          filter: `blur(${(1 - op) * 3}px)`,
        }}
      >
        {c.text.split('|').map((line, li) => (
          <div key={li} style={{ fontStyle: li > 0 ? 'italic' : top ? 'normal' : c.text.includes('|') ? 'normal' : 'italic' }}>
            {line.split(' ').map((w, i) => (
              <span key={i} style={{ color: c.hl?.includes(w) ? '#9fd0ff' : undefined }}>
                {w}{' '}
              </span>
            ))}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const Captions: React.FC<{ caps: Caption[] | undefined; t: number }> = ({ caps, t }) => {
  const { width, height } = useVideoConfig();
  const vert = height > width;
  const active = (caps ?? []).filter((x) => t >= x.from && t < x.to);
  const subtle = active.filter((x) => x.style === 'subtle' || x.style === 'top');
  const c = active.find((x) => x.style !== 'subtle' && x.style !== 'top');
  return (
    <>
      {subtle.map((x, i) => (
        <SubtleCaption key={i} c={x} t={t} vert={vert} />
      ))}
      {c && <BoldCaption c={c} t={t} vert={vert} />}
    </>
  );
};

const BoldCaption: React.FC<{ c: Caption; t: number; vert: boolean }> = ({ c, t, vert }) => {
  const local = t - c.from;
  const dur = c.to - c.from;
  const f2 = Math.min(0.2, dur / 3);
  const op = interpolate(local, [0, f2, dur - Math.min(0.25, dur / 3), dur], [0, 1, 1, 0], clamp);
  const words = c.text.split(' ');
  const step = Math.min(0.13, (dur * 0.5) / words.length);
  const style = c.style ?? 'bottom';
  const big = style === 'big';
  const center = style !== 'bottom';
  return (
    <AbsoluteFill style={{ justifyContent: center ? 'center' : 'flex-end', alignItems: 'center', paddingBottom: center ? 0 : vert ? 600 : 92, fontFamily: FONT }}>
      <div
        style={{
          opacity: op,
          maxWidth: vert ? (big ? 1000 : 940) : big ? 1600 : 1450,
          textAlign: 'center',
          fontSize: vert ? (big ? 118 : center ? 76 : 66) : big ? 104 : center ? 60 : 50,
          fontWeight: big ? 900 : 800,
          lineHeight: 1.15,
          textShadow: '0 3px 0 rgba(0,0,0,0.6), 0 0 30px rgba(0,0,0,0.75)',
          transform: big ? `scale(${interpolate(local, [0, 0.25], [1.25, 1], { ...clamp, easing: Easing.out(Easing.back(2)) })})` : undefined,
        }}
      >
        {words.map((w, i) => {
          const a = interpolate(local, [i * step, i * step + 0.15], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
          return (
            <span key={i} style={{ display: 'inline-block', marginRight: big ? 24 : 14, opacity: a, transform: `translateY(${(1 - a) * 12}px)`, color: c.hl?.includes(w) ? ACCENT : 'white' }}>
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
