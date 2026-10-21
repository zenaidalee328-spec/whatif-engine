import React from 'react';
import { useVideoConfig } from 'remotion';
import { fallAt, layerAt, R_KM, SOUTH_POLE_ALT_KM, TC, tempSouth } from './fall';

const FONT = 'Inter, "Inter Display", sans-serif';
const SERIF = 'Georgia, "DejaVu Serif", "Times New Roman", serif';
const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// cross-section colours (approximate glow of each layer)
const RINGS: [number, string][] = [
  [6371, '#5a4a3c'], // crust / upper mantle (dark)
  [5961, '#8a3a1c'], // transition zone
  [5711, '#b4481a'], // lower mantle
  [3480, '#f28a1e'], // outer core
  [1221, '#fff0c0'], // inner core
];

const Row: React.FC<{ label: string; value: string; big?: boolean; color?: string }> = ({ label, value, big, color }) => (
  <div style={{ marginTop: big ? 4 : 12 }}>
    <div style={{ fontSize: 13, letterSpacing: 3.2, fontWeight: 600, color: 'rgba(255,255,255,0.62)' }}>{label}</div>
    <div style={{ fontFamily: SERIF, fontSize: big ? 50 : 30, lineHeight: 1.08, color: color ?? 'white', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
);

/** left-side panel: mini cross-section with your position + depth, speed, time, gravity, rock temperature, rock pressure */
export const Telemetry: React.FC<{ s: number; opacity?: number }> = ({ s, opacity = 1 }) => {
  const { width, height } = useVideoConfig();
  const vert = height > width;
  const st = fallAt(Math.max(0, s));
  const layer = layerAt(st.depth, st.leg);
  const shown = st.leg === 1 ? st.depth + SOUTH_POLE_ALT_KM : st.depth; // far side: below the South Pole's ice surface
  if (st.leg === 1) st.temp = tempSouth(st.depth);
  const depthTxt = shown < 10 ? `${fmt(shown * 1000)} m` : `${fmt(shown, shown < 100 ? 1 : 0)} km`;
  const atm = st.P * 1e9 / 101325;
  const pTxt = atm >= 1e6 ? `${(atm / 1e6).toFixed(2)} million atm` : `${fmt(atm)} atm`;
  const tcol = st.temp > 3000 ? '#fff1c8' : st.temp > 1000 ? '#ffb15a' : st.temp > 400 ? '#ff7a3a' : 'white';
  const R = 70;
  const yDot = -R + (st.dist / (2 * R_KM)) * 2 * R;
  return (
    <div style={{ position: 'absolute', left: vert ? 40 : 48, top: vert ? 230 : 70, opacity, fontFamily: FONT, color: 'white', textShadow: '0 1px 6px rgba(0,0,0,0.9)', transform: vert ? 'scale(1.15)' : 'scale(1.12)', transformOrigin: 'top left', background: 'linear-gradient(180deg, rgba(6,8,14,0.72), rgba(6,8,14,0.55))', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, padding: '16px 22px 18px', backdropFilter: 'blur(6px)', minWidth: 250 }}>
      <svg width={2 * R + 20} height={2 * R + 20} viewBox={`${-R - 10} ${-R - 10} ${2 * R + 20} ${2 * R + 20}`} style={{ filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))' }}>
        {RINGS.map(([r, c]) => (
          <circle key={r} r={(r / 6371) * R} fill={c} />
        ))}
        <line x1={0} y1={-R} x2={0} y2={R} stroke="rgba(255,255,255,0.75)" strokeWidth={1.2} strokeDasharray="3 3" />
        <circle cy={yDot} r={4.5} fill="#7fd3ff" stroke="white" strokeWidth={1.5} />
        <circle r={R} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
      </svg>
      <div style={{ fontSize: 13, letterSpacing: 3.2, fontWeight: 700, color: '#7fd3ff', marginTop: 6 }}>{layer.name}</div>
      <Row label={st.leg === 0 ? 'DEPTH' : 'DEPTH · CLIMBING'} value={depthTxt} big />
      <Row label="SPEED" value={`${fmt(st.v)} km/h`} />
      <Row label="TIME FALLING" value={mmss(s)} />
      <Row label="GRAVITY HERE" value={`${(st.g / 9.81).toFixed(2)} g`} />
      <Row label="ROCK TEMPERATURE" value={`${fmt(st.temp)} °C`} color={tcol} />
      <Row label="ROCK PRESSURE" value={pTxt} />
      {s > TC * 2 && <div />}
    </div>
  );
};
