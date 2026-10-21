// Physics of a fall through a pole-to-pole vacuum tunnel in a PREM Earth (tools/physics/prem_fall.py).
import FALL from '../data/fall.json';

const ROWS = (FALL as any).rows as [number, number, number, number, number][]; // t s, depth km, v km/h, g m/s2, P GPa (surface -> center)
export const TC = (FALL as any).Tc as number; // s to the centre (1145.4)
export const R_KM = 6371;

const lerpRow = (s: number) => {
  if (s <= ROWS[1][0]) {
    // first metres: constant-g fall
    const d = 0.5 * 9.83 * s * s / 1000;
    return { depth: d, v: 9.83 * s * 3.6, g: 9.82 + 0.0012 * d, P: d < 4.26 ? 0.0101 * d : 0.043 + 0.028 * (d - 4.26) };
  }
  let lo = 0, hi = ROWS.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (ROWS[m][0] <= s) lo = m;
    else hi = m;
  }
  const a = ROWS[lo], b = ROWS[hi];
  const u = Math.min(1, Math.max(0, (s - a[0]) / Math.max(1e-9, b[0] - a[0])));
  const L = (i: number) => a[i] + (b[i] - a[i]) * u;
  return { depth: L(1), v: L(2), g: L(3), P: L(4) };
};

// temperature of the rock around the tunnel (°C) vs depth (km). Anchors:
// Arctic water ~-1 °C; Kola 12 km ~180 °C (continental, for scale); oceanic lithosphere base ~1,300 °C;
// 410 km 1,532 °C, 660 km ~1,680 °C, 2,800 km 2,257 °C (Katsura 2022 adiabat); core side of CMB ~3,700 °C (~4,000 K);
// inner-core boundary ~5,230 °C (5,500 K, Anzellini et al. 2013); centre ~5,300 °C.
const TEMP: [number, number][] = [[0, -1.5], [4.26, 0], [6, 60], [11, 250], [30, 600], [100, 1300], [410, 1532], [660, 1680], [2800, 2257], [2891, 3700], [5150, 5230], [6371, 5300]];
export const tempAt = (depth: number) => {
  for (let i = 1; i < TEMP.length; i++)
    if (depth <= TEMP[i][0]) {
      const [d0, t0] = TEMP[i - 1], [d1, t1] = TEMP[i];
      return t0 + ((t1 - t0) * (depth - d0)) / (d1 - d0);
    }
  return 5300;
};

export type FallState = { depth: number; v: number; g: number; P: number; temp: number; leg: 0 | 1; dist: number; s: number };
/** story seconds since the jump -> state. leg 0 = going down, 1 = coming up the far side. Oscillates every 4*TC. */
export const fallAt = (sIn: number): FallState => {
  const period = 4 * TC;
  let s = ((sIn % period) + period) % period;
  let flip = false;
  if (s > 2 * TC) {
    s = s - 2 * TC; // falling back from the far side: same physics mirrored
    flip = true;
  }
  const down = s <= TC;
  const r = lerpRow(down ? s : 2 * TC - s);
  const leg = (down ? 0 : 1) as 0 | 1;
  const dist = down ? r.depth : 2 * R_KM - r.depth;
  return { depth: r.depth, v: r.v, g: r.g, P: r.P, temp: tempAt(r.depth), leg: (flip ? 1 - leg : leg) as 0 | 1, dist: flip ? 2 * R_KM - dist : dist, s: sIn };
};

export const LAYERS = [
  { name: 'OCEAN', top: 0, bot: 4.26 },
  { name: 'OCEANIC CRUST', top: 4.26, bot: 11 },
  { name: 'UPPER MANTLE', top: 11, bot: 410 },
  { name: 'TRANSITION ZONE', top: 410, bot: 660 },
  { name: 'LOWER MANTLE', top: 660, bot: 2891 },
  { name: 'OUTER CORE', top: 2891, bot: 5150 },
  { name: 'INNER CORE', top: 5150, bot: 6371 },
];
export const layerAt = (depth: number, leg: 0 | 1 = 0) => {
  if (leg === 1 && depth < 38) return { name: depth < -0.135 ? 'ANTARCTIC ICE' : 'CONTINENTAL CRUST', top: 0, bot: 38 };
  return LAYERS.find((l) => depth <= l.bot) ?? LAYERS[LAYERS.length - 1];
};
/** far side (South Pole): rock temperature for the top 100 km (ice -49 °C at the surface, continental geotherm) */
export const tempSouth = (depth: number) => (depth < 0 ? -49 + ((depth + 2.835) / 2.835) * 37 : depth < 38 ? -12 + (depth / 38) * 612 : depth < 100 ? 600 + ((depth - 38) / 62) * 700 : tempAt(depth));
/** the South Pole surface is 2,835 m above sea level (ice sheet) */
export const SOUTH_POLE_ALT_KM = 2.835;
