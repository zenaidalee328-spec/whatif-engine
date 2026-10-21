import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { Effects, Segment } from './types';
import { clamp01, hash as hashf, noise1, smooth, v } from './val';

/** lid closure 0..1 at local time t */
export const lidAt = (fx: Effects | undefined, t: number, transitionIn?: Segment['transitionIn']) => {
  let lid = v(fx?.eyelids?.droop, t, 0);
  for (const b of fx?.eyelids?.blinks ?? []) {
    const c = b.close ?? 0.15, h = b.hold ?? 0.05, o = b.open ?? 0.25, a = b.amount ?? 1;
    const u = t - b.at;
    if (u < 0 || u > c + h + o) continue;
    const k = u < c ? u / c : u < c + h ? 1 : 1 - (u - c - h) / o;
    lid = Math.max(lid, a * k);
  }
  for (const m of fx?.microsleep ?? []) {
    // lids sink over 0.5 s, shut during the blackout
    if (t >= m.at - 0.5 && t <= m.at + m.dur) lid = Math.max(lid, t < m.at ? smooth(m.at - 0.5, m.at, t) : 1);
  }
  if (transitionIn === 'wake' && t < 0.7) {
    // flutter open: 1 -> 0.4 -> 0.55 -> 0
    const k = t < 0.25 ? 1 - (t / 0.25) * 0.6 : t < 0.45 ? 0.4 + ((t - 0.25) / 0.2) * 0.15 : 0.55 * (1 - (t - 0.45) / 0.25);
    lid = Math.max(lid, k);
  }
  return clamp01(lid);
};

export const blackAt = (fx: Effects | undefined, t: number) => {
  let b = 0;
  for (const m of fx?.microsleep ?? []) {
    const f = Math.min(0.1, m.dur / 4);
    if (t >= m.at && t <= m.at + m.dur) b = Math.max(b, Math.min((t - m.at) / f, (m.at + m.dur - t) / 0.04, 1));
  }
  return clamp01(b);
};

type FxState = {
  blur: number;
  dv: number;
  chroma: number;
  whip: number;
  glare: number;
  desat: number;
  impact: number; // 0 none, 1 / 2 alternating impact-frame polarity
};

export const fxState = (fx: Effects | undefined, t: number, tr: Segment['transitionIn']): FxState => {
  let blur = v(fx?.blur, t, 0);
  let chroma = v(fx?.chroma, t, 0);
  let whip = 0;
  if (tr === 'wake') blur = Math.max(blur, 5 * (1 - smooth(0, 1.6, t)));
  if (tr === 'whip') whip = 1 - smooth(0, 0.3, t);
  if (tr === 'glitch' && t < 0.35) chroma = Math.max(chroma, 1 - t / 0.35);
  const impact = (fx?.impact ?? []).some((k) => t >= k.at && t < k.at + (k.dur ?? 0.1)) ? (Math.floor(t * 30) % 2 ? 2 : 1) : 0;
  return { blur, dv: v(fx?.doubleVision, t, 0), chroma, whip, glare: v(fx?.glare, t, 0), desat: v(fx?.desaturate, t, 0), impact };
};

/** Wraps a scene; applies blur / glare / desaturation via CSS and double vision / chroma / whip via an SVG filter. */
export const FxScene: React.FC<{ id: string; t: number; s: FxState; children: React.ReactNode }> = ({ id, t, s, children }) => {
  const useSvg = s.dv > 0.001 || s.chroma > 0.001 || s.whip > 0.001;
  const fid = `fx-${id}`;
  const dx = 6 + 22 * s.dv + noise1(t * 1.5, 4) * 8 * s.dv;
  const dy = 2 + noise1(t * 1.2, 8) * 5 * s.dv;
  const ca = 3 + 14 * s.chroma;
  const filters = [
    useSvg ? `url(#${fid})` : '',
    s.blur > 0.05 ? `blur(${s.blur.toFixed(2)}px)` : '',
    s.glare > 0.01 ? `brightness(${(1 + 0.28 * s.glare).toFixed(3)}) contrast(${(1 + 0.12 * s.glare).toFixed(3)})` : '',
    s.desat > 0.01 ? `saturate(${(1 - 0.85 * s.desat).toFixed(3)})` : '',
    s.impact ? `grayscale(1) contrast(9) brightness(1.15)${s.impact === 2 ? ' invert(1)' : ''}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <AbsoluteFill>
      {useSvg && (
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <filter id={fid} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
            {s.whip > 0.001 ? (
              <feGaussianBlur in="SourceGraphic" stdDeviation={`${(70 * s.whip).toFixed(1)} 0`} result="base" />
            ) : (
              <feOffset in="SourceGraphic" dx="0" dy="0" result="base" />
            )}
            {s.dv > 0.001 ? (
              <>
                <feOffset in="base" dx={dx} dy={dy} result="ghost" />
                <feComposite in="base" in2="ghost" operator="arithmetic" k1="0" k2={1 - 0.38 * s.dv} k3={0.38 * s.dv} k4="0" result="dv" />
              </>
            ) : (
              <feOffset in="base" dx="0" dy="0" result="dv" />
            )}
            {s.chroma > 0.001 ? (
              <>
                <feColorMatrix in="dv" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
                <feOffset in="r" dx={ca} dy="0" result="r2" />
                <feColorMatrix in="dv" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
                <feColorMatrix in="dv" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
                <feOffset in="b" dx={-ca} dy="0" result="b2" />
                <feComposite in="r2" in2="g" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rg" />
                <feComposite in="rg" in2="b2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
              </>
            ) : (
              <feOffset in="dv" dx="0" dy="0" />
            )}
          </filter>
        </svg>
      )}
      <AbsoluteFill style={{ filter: filters || undefined, transform: s.whip > 0 ? `translateX(${(-s.whip * 60).toFixed(1)}px) scale(${1 + 0.04 * s.whip})` : undefined }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Overlays drawn on top of the scene (under HUD). */
export const FxOverlay: React.FC<{ fx: Effects | undefined; t: number; dur: number; tr: Segment['transitionIn']; glare: number }> = ({ fx, t, dur, tr, glare }) => {
  const lid = lidAt(fx, t, tr);
  let black = blackAt(fx, t);
  if (tr === 'dip') black = Math.max(black, 1 - smooth(0, 0.35, t));
  if (tr === 'wake') black = Math.max(black, 1 - smooth(0, 0.08, t));
  let white = 0;
  if (tr === 'flash') white = 1 - smooth(0, 0.3, t);
  for (const f of fx?.flash ?? []) {
    const d = f.dur ?? 0.3;
    if (t >= f.at && t <= f.at + d) white = Math.max(white, 1 - (t - f.at) / d);
  }
  const vig = v(fx?.vignette, t, 0.5);
  const tunnel = v(fx?.tunnel, t, 0);
  const red = v(fx?.redPulse, t, 0) * (0.75 + 0.25 * Math.sin(t * 2.4));
  const tint = fx?.tint ? v(fx.tint.amount, t, 0) : 0;
  const sl = v(fx?.speedLines, t, 0);
  const impactOn = (fx?.impact ?? []).find((k) => t >= k.at && t < k.at + (k.dur ?? 0.1));
  const lines = (n: number, seed: number, inner: number, w0: number, w1: number, col: string, op: number) => (
    <svg viewBox="-50 -50 100 100" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: op }}>
      {Array.from({ length: n }).map((_, i) => {
        const a = (hashf(i * 7.3 + seed) * Math.PI * 2);
        const r0 = inner + hashf(i * 3.1 + seed) * 18;
        const w = w0 + hashf(i * 1.7 + seed) * (w1 - w0);
        const x0 = Math.cos(a) * r0, y0 = Math.sin(a) * r0, x1 = Math.cos(a) * 90, y1 = Math.sin(a) * 90;
        const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
        return <polygon key={i} points={`${x0},${y0} ${x1 + nx},${y1 + ny} ${x1 - nx},${y1 - ny}`} fill={col} />;
      })}
    </svg>
  );
  return (
    <>
      {tint > 0.005 && <AbsoluteFill style={{ background: fx!.tint!.color, opacity: tint, mixBlendMode: 'color' }} />}
      {glare > 0.01 && (
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 0%, rgba(255,250,235,${0.3 * glare}) 0%, rgba(255,250,235,0) 60%)`, mixBlendMode: 'screen' }} />
      )}
      {sl > 0.01 && lines(70, Math.floor(t * 24), 26, 0.15, 0.7, 'white', sl * 0.55)}
      {impactOn && lines(90, Math.floor(t * 30) + 3, 14, 0.6, 3.2, Math.floor(t * 30) % 2 ? 'white' : 'black', 1)}
      {red > 0.005 && <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(120,0,10,0) 35%, rgba(160,0,20,${red}) 100%)` }} />}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) ${50 - 20 * tunnel}%, rgba(0,0,0,${Math.min(1, vig + tunnel * 0.5)}) ${100 - 25 * tunnel}%)` }} />
      {lid > 0.002 && (
        <>
          <div style={{ position: 'absolute', left: -100, right: -100, top: 0, height: `${lid * 56}%`, background: 'black', borderBottomLeftRadius: '50% 40%', borderBottomRightRadius: '50% 40%', boxShadow: '0 10px 40px 20px rgba(0,0,0,0.6)' }} />
          <div style={{ position: 'absolute', left: -100, right: -100, bottom: 0, height: `${lid * 56}%`, background: 'black', borderTopLeftRadius: '50% 40%', borderTopRightRadius: '50% 40%', boxShadow: '0 -10px 40px 20px rgba(0,0,0,0.6)' }} />
        </>
      )}
      {black > 0.002 && <AbsoluteFill style={{ background: 'black', opacity: black }} />}
      {fx?.fade && v(fx.fade.amount, t, 0) > 0.002 && <AbsoluteFill style={{ background: fx.fade.color, opacity: v(fx.fade.amount, t, 0) }} />}
      {white > 0.002 && <AbsoluteFill style={{ background: 'white', opacity: white }} />}
    </>
  );
};
