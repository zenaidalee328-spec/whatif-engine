import type { CameraSpec, Vec3 } from './types';
import { lerp, noise1, v, vv } from './val';

export type Cam = { pos: Vec3; look: Vec3; fov: number; roll: number };
const D2R = Math.PI / 180;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

/** point at arc-length distance d along a polyline (clamped, extrapolates past the end along the last leg) */
const along = (pts: Vec3[], d: number): Vec3 => {
  let rest = d;
  for (let i = 1; i < pts.length; i++) {
    const seg = sub(pts[i], pts[i - 1]);
    const L = len(seg);
    if (rest <= L || i === pts.length - 1) return add(pts[i - 1], scale(seg, rest / Math.max(1e-6, L)));
    rest -= L;
  }
  return pts[pts.length - 1];
};
const pathLen = (pts: Vec3[]) => pts.slice(1).reduce((s, p, i) => s + len(sub(p, pts[i])), 0);

/** integral of a Val from 0..t (for step phase with a changing step rate) */
const integ = (x: any, t: number, def: number) => {
  if (typeof x !== 'object' || x === undefined) return (x ?? def) * t;
  let s = 0;
  const dt = 1 / 30;
  for (let u = 0; u < t; u += dt) s += v(x, u, def) * Math.min(dt, t - u);
  return s;
};

/** rotate a horizontal heading by yaw and pitch (degrees) and return a look target at distance 10 */
const aim = (pos: Vec3, dir: Vec3, yawDeg: number, pitchDeg: number): Vec3 => {
  const h = Math.atan2(dir[0], dir[2]) + yawDeg * D2R; // heading around y
  const flat = Math.hypot(dir[0], dir[2]);
  const p = Math.atan2(dir[1], flat) + pitchDeg * D2R;
  return [pos[0] + Math.sin(h) * Math.cos(p) * 10, pos[1] + Math.sin(p) * 10, pos[2] + Math.cos(h) * Math.cos(p) * 10];
};

export const evalCamera = (c: CameraSpec | undefined, t: number, dur: number, shake = 0): Cam | null => {
  if (!c) return null;
  let out: Cam;
  switch (c.path) {
    case 'pov-walk': {
      const pts = [c.from, ...(c.via ?? []), c.to];
      const L = pathLen(pts);
      let u = Math.min(1, t / dur);
      if (c.ease === 'inout') u = u * u * (3 - 2 * u);
      const d = u * L;
      const eye = c.eye ?? 1.68;
      const base = along(pts, d);
      const ahead = along(pts, d + 3);
      let dir = sub(ahead, base);
      if (len(dir) < 1e-4) dir = sub(pts[pts.length - 1], pts[pts.length - 2]);
      dir = [dir[0], 0, dir[2]];
      const phase = integ(c.stepRate, t, 1.9) * Math.PI * 2;
      const bob = v(c.bob, t, 1);
      const sway = v(c.sway, t, 0);
      const droop = v(c.droop, t, 0);
      // lateral (right) vector
      const n = len(dir) || 1;
      const right: Vec3 = [-dir[2] / n, 0, dir[0] / n];
      const lat = Math.sin(phase / 2) * 0.03 * bob + noise1(t * 0.5, 3) * 0.25 * sway;
      const pos: Vec3 = [
        base[0] + right[0] * lat,
        eye + Math.sin(phase) * 0.04 * bob - droop * 0.12 + base[1],
        base[2] + right[2] * lat,
      ];
      const yaw = v(c.yaw, t, 0) + noise1(t * 0.6, 7) * 10 * sway;
      const pitch = v(c.pitch, t, -4) - droop * 26 + Math.sin(phase) * 0.6 * bob;
      out = { pos, look: aim(pos, dir, yaw, pitch), fov: v(c.fov, t, 64), roll: noise1(t * 0.45, 11) * 5 * sway * D2R };
      break;
    }
    case 'pov-stand': {
      const p0 = vv(c.pos, t);
      const l0 = vv(c.look, t);
      const br = v(c.breathe, t, 1);
      const sway = v(c.sway, t, 0);
      const droop = v(c.droop, t, 0);
      const pos: Vec3 = [p0[0] + noise1(t * 0.3, 1) * 0.02 * br, p0[1] + Math.sin(t * 1.6) * 0.012 * br - droop * 0.1, p0[2]];
      const dir = sub(l0, p0);
      const yaw = v(c.yaw, t, 0) + noise1(t * 0.5, 5) * 9 * sway + noise1(t * 0.4, 2) * 0.6 * br;
      const pitch = v(c.pitch, t, 0) - droop * 26 + noise1(t * 0.35, 9) * 0.5 * br;
      out = { pos, look: aim(pos, dir, yaw, pitch), fov: v(c.fov, t, 62), roll: noise1(t * 0.4, 13) * 5 * sway * D2R };
      break;
    }
    case 'orbit': {
      const a = ((c.startDeg ?? 0) + (c.degPerSec ?? 6) * t) * D2R;
      const r = v(c.radius, t, 20);
      out = {
        pos: [c.center[0] + Math.sin(a) * r, c.center[1] + v(c.height, t, 8), c.center[2] + Math.cos(a) * r],
        look: c.center,
        fov: v(c.fov, t, 45),
        roll: 0,
      };
      break;
    }
    case 'dolly': {
      let u = Math.min(1, t / dur);
      if (c.ease !== 'linear') u = u * u * (3 - 2 * u);
      const L = (a: Vec3, b: Vec3): Vec3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
      out = { pos: L(c.from.pos, c.to.pos), look: L(c.from.look, c.to.look), fov: v(c.fov, t, 50), roll: 0 };
      break;
    }
    case 'keys':
      out = { pos: vv(c.pos, t, [0, 0, 0], c.ease !== 'linear'), look: vv(c.look, t, [0, 0, 0], c.ease !== 'linear'), fov: v(c.fov, t, 55), roll: (v(c.roll, t, 0) * Math.PI) / 180 };
      break;
  }
  if (shake > 0) {
    const f = t * 22;
    out.pos = [out.pos[0] + noise1(f, 21) * 0.035 * shake, out.pos[1] + noise1(f, 22) * 0.035 * shake, out.pos[2]];
    out.look = [out.look[0] + noise1(f, 23) * 0.25 * shake, out.look[1] + noise1(f, 24) * 0.25 * shake, out.look[2]];
    out.roll += noise1(f, 25) * 0.02 * shake;
  }
  return out;
};
