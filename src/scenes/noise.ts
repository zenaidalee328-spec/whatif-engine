// Tiny seeded 3D value noise + fbm, used to paint a procedural Earth.
const perm = new Uint8Array(512);
(() => {
  let s = 1337;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();

const fade = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const h = (x: number, y: number, z: number) =>
  perm[(perm[(perm[x & 255] + y) & 255] + z) & 255] / 255;

export const noise3 = (x: number, y: number, z: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const c000 = h(xi, yi, zi), c100 = h(xi + 1, yi, zi);
  const c010 = h(xi, yi + 1, zi), c110 = h(xi + 1, yi + 1, zi);
  const c001 = h(xi, yi, zi + 1), c101 = h(xi + 1, yi, zi + 1);
  const c011 = h(xi, yi + 1, zi + 1), c111 = h(xi + 1, yi + 1, zi + 1);
  return lerp(
    lerp(lerp(c000, c100, xf), lerp(c010, c110, xf), yf),
    lerp(lerp(c001, c101, xf), lerp(c011, c111, xf), yf),
    zf,
  );
};

export const fbm = (x: number, y: number, z: number, oct = 5) => {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * noise3(x * f, y * f, z * f);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
};
