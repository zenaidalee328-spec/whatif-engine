import type { Val, Vec3, VecVal } from './types';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};

const isKeys = (x: unknown): x is [number, any][] => Array.isArray(x) && x.length > 0 && Array.isArray(x[0]);

/** Evaluate a Val at time t. Keyframes interpolate linearly (smoothstep if `ease`). */
export const v = (x: Val | undefined, t: number, def = 0, ease = false): number => {
  if (x === undefined || x === null) return def;
  if (typeof x === 'number') return x;
  if (!isKeys(x)) return def;
  if (t <= x[0][0]) return x[0][1];
  for (let i = 1; i < x.length; i++) {
    if (t <= x[i][0]) {
      const [t0, a] = x[i - 1];
      const [t1, b] = x[i];
      let u = (t - t0) / Math.max(1e-6, t1 - t0);
      if (ease) u = u * u * (3 - 2 * u);
      return lerp(a, b, u);
    }
  }
  return x[x.length - 1][1];
};

export const vv = (x: VecVal | undefined, t: number, def: Vec3 = [0, 0, 0], ease = true): Vec3 => {
  if (!x) return def;
  if (typeof (x as any)[0] === 'number') return x as Vec3;
  const k = x as [number, Vec3][];
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, a] = k[i - 1];
      const [t1, b] = k[i];
      let u = (t - t0) / Math.max(1e-6, t1 - t0);
      if (ease) u = u * u * (3 - 2 * u);
      return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
    }
  }
  return k[k.length - 1][1];
};

/** Read every scene param at time t: numbers/keyframes become numbers, everything else passes through. */
export const evalParams = (p: Record<string, unknown> | undefined, t: number): Record<string, any> => {
  const out: Record<string, any> = {};
  if (!p) return out;
  for (const [k, x] of Object.entries(p)) {
    if (typeof x === 'number' || (isKeys(x) && typeof (x as any)[0][1] === 'number')) out[k] = v(x as Val, t);
    else out[k] = x;
  }
  return out;
};

export const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** smooth 1D value noise in [-1, 1] */
export const noise1 = (x: number, seed = 0) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 101) * 2 - 1, hash(i + 1 + seed * 101) * 2 - 1, u);
};

export const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0');
export const fmtHMS = (s: number) => `${Math.floor(s / 3600)}:${pad2((s % 3600) / 60)}:${pad2(s % 60)}`;
