import React, { useMemo } from 'react';
import * as THREE from 'three';
import { hash } from './common3d';

/*
  World-scale pieces for "What if friction disappeared". All driven by pt (physical seconds since friction vanished).
  - RoofHouses: old terraced houses on the left (x < -8.5); every roof tile slides down its 35° roof and flies off the eave.
  - Scaffold: scaffolding on the construction site (right side); couplers grip tubes only by friction -> ledgers and
    planks drop, then the unbraced standards topple into the street.
  - Hills: terrain behind the city; soil grains lose their grip, slopes slump and flow, houses and trees slide downhill.
  - Skyline: steel towers that sway as slip-critical bolted joints give.
  - Glow: "friction vision" points at every place friction was working (flash at the moment it vanishes).
*/
const G = 9.81;
const ROOF = (35 * Math.PI) / 180;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
/** frictionless time (stops growing 0.4 s after friction returns: things skid to a stop) */
const ft = (pt: number) => (pt <= 5 ? Math.max(0, pt) : 5 + Math.min(pt - 5, 0.4) * 0.5);

// ---------------- roof houses ----------------
export const HOUSES = [
  { z: 25.5, w: 9 },
  { z: 16, w: 9.5 },
  { z: 6.5, w: 9 },
  { z: -3, w: 9.5 },
  { z: -34, w: 9 },
  { z: -44, w: 10 },
  { z: -54, w: 9.5 },
];
const HX = -12.5; // house centre x (front wall at x = -8.5)
const HD = 8; // depth along x
const HH = 9; // wall height
const tileList = (() => {
  const out: { house: number; face: number; u0: number; zc: number; delay: number; seed: number }[] = [];
  const L = HD / 2 / Math.cos(ROOF);
  HOUSES.forEach((h, hi) => {
    for (const face of [1, -1]) {
      for (let r = 0; r < Math.floor(L / 0.32); r++) {
        for (let c = 0; c < Math.floor(h.w / 0.3); c++) {
          const seed = hi * 10000 + (face > 0 ? 0 : 5000) + r * 100 + c;
          out.push({ house: hi, face, u0: 0.16 + r * 0.32, zc: h.z - h.w / 2 + 0.15 + c * 0.3, delay: hash(seed) * 0.35, seed });
        }
      }
    }
  });
  return out;
})();

/** world transform of one roof tile at time pt (face 1 = street side, slopes down toward +x) */
const tilePose = (tl: (typeof tileList)[number], pt: number, o: THREE.Object3D) => {
  const t = ft(pt) - tl.delay;
  const a = G * Math.sin(ROOF);
  const ridgeY = HH + (HD / 2) * Math.tan(ROOF);
  const dirX = tl.face; // down-slope horizontal direction
  // distance from eave measured up the slope: u0. Sliding distance s.
  const s = t > 0 ? 0.5 * a * t * t : 0;
  if (s < tl.u0) {
    const u = tl.u0 - s;
    const x = HX + dirX * (HD / 2 - u * Math.cos(ROOF));
    const y = HH + u * Math.sin(ROOF) + 0.05;
    o.position.set(x, y, tl.zc);
    o.rotation.set(0, 0, -dirX * ROOF);
    return;
  }
  // flew off the eave: time since leaving, speed along slope at the edge
  const tEdge = Math.sqrt((2 * tl.u0) / a);
  const v = a * tEdge;
  const tf = Math.max(0, (pt <= 5 ? pt : pt) - tl.delay - tEdge);
  const vx = v * Math.cos(ROOF) * dirX, vy = -v * Math.sin(ROOF);
  let x = HX + dirX * (HD / 2) + vx * tf;
  let y = HH + 0.05 + vy * tf - 0.5 * G * tf * tf;
  const ground = 0.17 + (hash(tl.seed + 3) * 0.06);
  let spin = tf * (4 + hash(tl.seed) * 6);
  if (y < ground) {
    // landed: find landing time, then skid a little and lie flat
    const disc = vy * vy + 2 * G * (HH + 0.05 - ground);
    const tl2 = (vy + Math.sqrt(disc)) / G;
    x = HX + dirX * (HD / 2) + vx * tl2 + dirX * Math.min(1.5, (tf - tl2) * 2) * (pt <= 5 ? 1 : 0.3);
    y = ground;
    spin = Math.round(tl2 * 2) * Math.PI;
  }
  o.position.set(x, y, tl.zc + Math.sin(tl.seed) * Math.min(1, tf) * 0.6);
  o.rotation.set(spin * 0.7, hash(tl.seed + 1) * spin, -dirX * ROOF + spin);
  void ridgeY;
};

export const RoofHouses: React.FC<{ pt: number }> = ({ pt }) => {
  const geo = useMemo(() => new THREE.BoxGeometry(0.34, 0.035, 0.31), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8 }), []);
  const inst = useMemo(() => {
    const m = new THREE.InstancedMesh(geo, mat, tileList.length);
    m.castShadow = true;
    tileList.forEach((tl, i) => m.setColorAt(i, new THREE.Color('#9a3e2a').multiplyScalar(0.8 + hash(tl.seed) * 0.4)));
    return m;
  }, [geo, mat]);
  const o = useMemo(() => new THREE.Object3D(), []);
  tileList.forEach((tl, i) => {
    tilePose(tl, pt, o);
    o.updateMatrix();
    inst.setMatrixAt(i, o.matrix);
  });
  inst.instanceMatrix.needsUpdate = true;
  const ridge = HH + (HD / 2) * Math.tan(ROOF);
  return (
    <group>
      {HOUSES.map((h, i) => {
        const col = ['#b8644a', '#c9a27a', '#8f5a44', '#d1b48c', '#a85a3c', '#c48c62'][i % 6];
        return (
          <group key={i} position={[HX, 0, h.z]}>
            <mesh position={[0, HH / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[HD, HH, h.w - 0.15]} />
              <meshStandardMaterial color={col} roughness={0.95} />
            </mesh>
            <mesh position={[0, HH + (ridge - HH) / 2 - 0.02, -(h.w - 0.2) / 2]} geometry={gableGeo(h.w - 0.2, ridge - HH)}>
              <meshStandardMaterial color="#4a2e24" roughness={1} />
            </mesh>
            {/* windows + doors facing the street (+x) */}
            {[1.6, 4.4, 7.1].map((y, fi) =>
              [-h.w / 3.2, 0, h.w / 3.2].map((zz, ci) => (
                <mesh key={`${fi}${ci}`} position={[HD / 2 + 0.02, y, zz]} rotation={[0, Math.PI / 2, 0]}>
                  <planeGeometry args={fi === 0 && ci === 1 ? [1.1, 2.2] : [1.0, 1.4]} />
                  <meshStandardMaterial color={fi === 0 && ci === 1 ? '#3a2a22' : '#5d7f9a'} emissive="#ffb35c" emissiveIntensity={hash(i * 9 + fi * 3 + ci) > 0.6 ? 0.5 : 0} roughness={0.3} />
                </mesh>
              )),
            )}
          </group>
        );
      })}
      <primitive object={inst} />
    </group>
  );
};
const gableCache = new Map<number, THREE.ExtrudeGeometry>();
function gableGeo(depth: number, rise: number) {
  if (gableCache.has(depth)) return gableCache.get(depth)!;
  const s = new THREE.Shape();
  s.moveTo(-HD / 2, -rise / 2);
  s.lineTo(HD / 2, -rise / 2);
  s.lineTo(0, rise / 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  gableCache.set(depth, g);
  return g;
}

// ---------------- scaffolding ----------------
const SC = { x0: 8.15, x1: 9.25, zs: [14, 11.4, 8.8, 6.2, 3.6, 1.0], levels: [2, 4, 6, 8, 10, 12] };
const scaffoldParts = (() => {
  const ledgers: { x: number; y: number; z: number; len: number; seed: number }[] = [];
  const planks: { y: number; z: number; seed: number }[] = [];
  SC.levels.forEach((y, li) => {
    [SC.x0, SC.x1].forEach((x, xi) => {
      for (let k = 0; k < SC.zs.length - 1; k++) ledgers.push({ x, y, z: (SC.zs[k] + SC.zs[k + 1]) / 2, len: 2.6, seed: li * 100 + xi * 50 + k });
    });
    for (let k = 0; k < SC.zs.length - 1; k++) planks.push({ y, z: (SC.zs[k] + SC.zs[k + 1]) / 2, seed: 7000 + li * 10 + k });
  });
  return { ledgers, planks };
})();

export const Scaffold: React.FC<{ pt: number }> = ({ pt }) => {
  const t = ft(pt);
  const drop = (y0: number, seed: number, stackIndex: number) => {
    const d = hash(seed) * 0.25;
    const tt = Math.max(0, t - d);
    const floor = 0.2 + stackIndex * 0.07;
    return Math.max(floor, y0 - 0.5 * G * tt * tt);
  };
  // standards (poles) start to topple outward once the bracing is gone
  const topple = Math.min(Math.PI / 2.05, 0.5 * 1.6 * Math.max(0, t - 0.7) ** 2);
  const pole = '#9aa0a8';
  return (
    <group>
      {/* the building being built: bare concrete frame */}
      <group position={[13, 0, 7.5]}>
        {[0, 1, 2, 3, 4].map((f) => (
          <mesh key={f} position={[0, 0.15 + f * 3.1, 0]} castShadow receiveShadow>
            <boxGeometry args={[7, 0.3, 14]} />
            <meshStandardMaterial color="#b9b6ae" roughness={0.95} />
          </mesh>
        ))}
        {[-3.2, 0, 3.2].map((x) =>
          [-6.6, -2.2, 2.2, 6.6].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 6.2, z]} castShadow>
              <boxGeometry args={[0.45, 12.4, 0.45]} />
              <meshStandardMaterial color="#a9a69e" roughness={0.95} />
            </mesh>
          )),
        )}
      </group>
      {/* standards */}
      {[SC.x0, SC.x1].map((x) =>
        SC.zs.map((z) => (
          <group key={`${x}${z}`} position={[x, 0.15, z]} rotation={[hash(z * 3) * topple * 0.25, 0, topple * (0.85 + hash(z) * 0.15)]}>
            <mesh position={[0, 6.2, 0]} castShadow>
              <cylinderGeometry args={[0.03, 0.03, 12.4, 6]} />
              <meshStandardMaterial color={pole} metalness={0.7} roughness={0.35} />
            </mesh>
            {/* couplers at each level (they slip down with nothing to grip) */}
            {SC.levels.map((y, i) => (
              <mesh key={y} position={[0, Math.max(0.15, y - 0.5 * G * Math.max(0, t - hash(i + z) * 0.2) ** 2), 0]}>
                <boxGeometry args={[0.09, 0.09, 0.09]} />
                <meshStandardMaterial color="#5a5f68" metalness={0.8} roughness={0.3} />
              </mesh>
            ))}
          </group>
        )),
      )}
      {scaffoldParts.ledgers.map((l, i) => {
        const y = drop(l.y, l.seed, i % 4);
        const tilt = y < l.y - 0.01 ? (hash(l.seed) - 0.5) * 0.4 : 0;
        return (
          <mesh key={i} position={[l.x + (y < 0.5 ? (hash(l.seed + 2) - 0.3) * 1.5 : 0), y, l.z]} rotation={[Math.PI / 2, tilt, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, l.len, 6]} />
            <meshStandardMaterial color={pole} metalness={0.7} roughness={0.35} />
          </mesh>
        );
      })}
      {scaffoldParts.planks.map((p, i) => {
        const y = drop(p.y + 0.06, p.seed, 2 + (i % 5));
        const fallen = y < p.y - 0.02;
        return (
          <mesh key={i} position={[(SC.x0 + SC.x1) / 2 + (fallen ? (hash(p.seed) - 0.5) * 0.6 : 0), y, p.z]} rotation={[fallen ? (hash(p.seed + 1) - 0.5) * 0.5 : 0, fallen ? (hash(p.seed + 2) - 0.5) * 0.6 : 0, fallen ? (hash(p.seed + 3) - 0.5) * 0.5 : 0]} castShadow>
            <boxGeometry args={[1.0, 0.05, 2.5]} />
            <meshStandardMaterial color="#b88a4a" roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
};

// ---------------- hills + landslides ----------------
const PEAKS = [
  { x: -120, z: -330, h: 85, r: 80 },
  { x: -10, z: -390, h: 110, r: 100 },
  { x: 110, z: -320, h: 70, r: 70 },
  { x: 220, z: -370, h: 95, r: 90 },
  { x: -230, z: -360, h: 75, r: 85 },
  { x: 40, z: -300, h: 45, r: 45 },
];
const h0 = (x: number, z: number) => PEAKS.reduce((s, p) => s + p.h * Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / (2 * p.r * p.r)), 0);
const grad = (x: number, z: number) => {
  const e = 1;
  return [(h0(x + e, z) - h0(x - e, z)) / (2 * e), (h0(x, z + e) - h0(x, z - e)) / (2 * e)];
};
/** displaced terrain height: crests lose material, the foot gains a debris bulge, the surface ripples as it flows */
const surfaceY = (x: number, z: number, f: number, t: number) => {
  const hh = h0(x, z);
  const [gx, gz] = grad(x, z);
  const sl = Math.min(1.2, Math.hypot(gx, gz));
  const loss = f * sl * 0.45 * hh;
  const bulge = f * 14 * Math.exp(-((hh - 10) ** 2) / 120) * (1 - Math.min(1, sl));
  const ripple = f * sl * 4.5 * Math.sin(x * 0.12 + z * 0.09 + t * 2.5) * Math.sin(x * 0.031 - z * 0.05);
  return Math.max(0, hh - loss + bulge + ripple);
};
const hillObjs = (() => {
  const out: { x: number; z: number; kind: 'house' | 'tree'; seed: number }[] = [];
  let k = 0;
  while (out.length < 230 && k < 8000) {
    k++;
    const x = (hash(k * 1.7) - 0.5) * 560;
    const z = -260 - hash(k * 2.3) * 200;
    const h = h0(x, z);
    const [gx, gz] = grad(x, z);
    const sl = Math.hypot(gx, gz);
    if (h > 8 && sl > 0.15 && sl < 0.9) out.push({ x, z, kind: hash(k * 5.1) < 0.35 ? 'house' : 'tree', seed: k });
  }
  return out;
})();

export const Hills: React.FC<{ pt: number }> = ({ pt }) => {
  const t = ft(pt);
  const f = smooth(0, 5.2, t); // how far the slopes have slumped
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(700, 300, 140, 60);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -390);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    return g;
  }, []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
  const grass = new THREE.Color('#4a7530'), soil = new THREE.Color('#6b4526'), rock = new THREE.Color('#77706a');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], z = base[i * 3 + 2];
    const hh = h0(x, z);
    const [gx, gz] = grad(x, z);
    const sl = Math.min(1.2, Math.hypot(gx, gz));
    pos.setY(i, surfaceY(x, z, f, t));
    const streak = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.05) * 3);
    const scar = clamp01(f * (sl * 2.6 + 0.25) * (0.55 + 0.45 * streak));
    c.copy(grass).lerp(hh > 100 ? rock : soil, scar);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  geo.computeVertexNormals();
  return (
    <group>
      <mesh geometry={geo} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} flatShading />
      </mesh>
      {hillObjs.map((o, i) => {
        const [gx, gz] = grad(o.x, o.z);
        const sl = Math.hypot(gx, gz);
        const a = G * Math.sin(Math.atan(sl)) * 0.9;
        const s = Math.min(80, 0.5 * a * t * t);
        const nx = -gx / (sl || 1), nz = -gz / (sl || 1);
        const x = o.x + nx * s, z = o.z + nz * s;
        const y = surfaceY(x, z, f, t) - 0.5;
        const tumble = Math.min(1.4, s * 0.06) * (o.kind === 'tree' ? 1 : 0.5);
        return o.kind === 'house' ? (
          <group key={i} position={[x, y, z]} rotation={[tumble * nz, hash(o.seed) * 3, -tumble * nx]}>
            <mesh position={[0, 2.5, 0]} castShadow>
              <boxGeometry args={[7, 5, 8]} />
              <meshStandardMaterial color={['#e3d3b8', '#c9b49a', '#d8c2a8'][o.seed % 3]} roughness={0.9} flatShading />
            </mesh>
            <mesh position={[0, 6.2, 0]} rotation={[0, Math.PI / 4, 0]}>
              <coneGeometry args={[6, 2.6, 4]} />
              <meshStandardMaterial color="#8e3a2a" flatShading />
            </mesh>
          </group>
        ) : (
          <group key={i} position={[x, y, z]} rotation={[tumble * nz, 0, -tumble * nx]}>
            <mesh position={[0, 3, 0]}>
              <cylinderGeometry args={[0.3, 0.5, 6, 5]} />
              <meshStandardMaterial color="#5a4030" flatShading />
            </mesh>
            <mesh position={[0, 8, 0]}>
              <coneGeometry args={[3.2, 8, 6]} />
              <meshStandardMaterial color="#3f6a35" flatShading />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

// ---------------- skyline towers ----------------
export const Skyline: React.FC<{ pt: number; t: number }> = ({ pt, t }) => {
  const sway = smooth(0.3, 2.5, ft(pt)) * (pt > 5 ? Math.max(0, 1 - (pt - 5) * 0.6) : 1);
  const towers = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({ x: (i - 4.5) * 30 + (hash(i) - 0.5) * 12, z: -175 - hash(i + 3) * 40, h: 32 + hash(i + 7) * 50, w: 12 + hash(i + 9) * 8 })),
    [],
  );
  return (
    <group>
      {towers.map((tw, i) => (
        <group key={i} position={[tw.x, 0, tw.z]} rotation={[0, 0, sway * 0.025 * Math.sin(t * 1.7 + i)]}>
          <mesh position={[0, tw.h / 2, 0]} castShadow>
            <boxGeometry args={[tw.w, tw.h, tw.w]} />
            <meshStandardMaterial color={['#a9b8c8', '#c2ccd6', '#9aa8b8', '#d0d6dc'][i % 4]} roughness={0.35} metalness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// ---------------- friction-vision glow ----------------
let glowTex: THREE.CanvasTexture | null = null;
const glowMap = () => {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,200,120,0.8)');
  gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
};

/** points: list of [x,y,z]; size in metres */
export const Glow: React.FC<{ points: number[]; size: number; amount: number; color?: string }> = ({ points, size, amount, color = '#ffb060' }) => {
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  if (amount <= 0.01) return null;
  return (
    <points geometry={geo}>
      <pointsMaterial size={size} map={glowMap()} color={color} transparent opacity={amount} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
    </points>
  );
};

/** contact points for the glow, in world space */
export const contactPoints = (pt: number) => {
  const near: number[] = [];
  // roof eaves + tile rows (only the first rows, street face)
  HOUSES.forEach((h) => {
    for (let z = h.z - h.w / 2 + 0.4; z < h.z + h.w / 2; z += 0.9) {
      for (let r = 0; r < 4; r++) near.push(HX + HD / 2 - r * 1.1 * Math.cos(ROOF), HH + r * 1.1 * Math.sin(ROOF) + 0.1, z);
    }
  });
  // scaffold couplers
  [SC.x0, SC.x1].forEach((x) => SC.zs.forEach((z) => SC.levels.forEach((y) => near.push(x, y, z))));
  void pt;
  const far: number[] = [];
  for (let i = 0; i < 500; i++) {
    const x = (hash(i * 3.1) - 0.5) * 600;
    const z = -260 - hash(i * 7.3) * 220;
    const y = h0(x, z);
    if (y > 6) far.push(x, y + 1, z);
  }
  return { near, far };
};

// ---------------- dust ----------------
const dustSpots = (() => {
  const s: { x: number; y: number; z: number; r: number; n: number; col: string }[] = [];
  HOUSES.forEach((h) => s.push({ x: HX + HD / 2 + 2.5, y: 0.6, z: h.z, r: 3, n: 60, col: '#b59a80' }));
  s.push({ x: 9.5, y: 0.8, z: 7.5, r: 4, n: 90, col: '#c9c2b6' });
  for (let i = 0; i < 10; i++) s.push({ x: (i - 4.5) * 60, y: 6, z: -285 - (i % 3) * 30, r: 22, n: 60, col: '#7a5a3a' });
  return s;
})();
let dustTex: THREE.CanvasTexture | null = null;
const dustMap = () => {
  if (dustTex) return dustTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  dustTex = new THREE.CanvasTexture(c);
  return dustTex;
};
/** dust clouds that bloom where tiles, scaffolding and landslides came down (amount 0..1, t = seconds for drift) */
export const Dust: React.FC<{ amount: number; t: number }> = ({ amount, t }) => {
  if (amount <= 0.01) return null;
  return (
    <group>
      {dustSpots.map((d, k) => {
        const pts: number[] = [];
        for (let i = 0; i < d.n; i++) {
          const a = hash(k * 100 + i) * Math.PI * 2, rr = Math.sqrt(hash(k * 100 + i + 0.5)) * d.r * (0.6 + amount * 0.6);
          pts.push(d.x + Math.cos(a) * rr + Math.sin(t * 0.3 + i) * d.r * 0.05, d.y + hash(k * 7 + i) * d.r * 0.7 * amount + t * 0.15 * (d.r / 3), d.z + Math.sin(a) * rr);
        }
        return (
          <points key={k}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[new Float32Array(pts), 3]} />
            </bufferGeometry>
            <pointsMaterial size={d.r * 0.9} map={dustMap()} color={d.col} transparent opacity={(d.r > 10 ? 0.2 : 0.22) * amount} depthWrite={false} sizeAttenuation />
          </points>
        );
      })}
    </group>
  );
};

// ---------------- city blocks seen from the air ----------------
const blocks = (() => {
  const out: { x: number; z: number; w: number; d: number; h: number; c: THREE.Color }[] = [];
  let k = 0;
  for (let x = -228; x <= 228; x += 26) {
    for (let z = 70; z >= -140; z -= 26) {
      k++;
      if (Math.abs(x) < 24) continue; // main street strip is built in detail
      if (z < -12 && z > -28 && Math.abs(x) < 60) continue; // cross street
      const far = Math.min(1, Math.max(0, (-z + 40) / 250));
      const h = 6 + hash(k) * 14 + far * hash(k + 3) * 30;
      const shade = 0.55 + hash(k + 5) * 0.35;
      out.push({ x: x + (hash(k + 7) - 0.5) * 4, z: z + (hash(k + 9) - 0.5) * 4, w: 14 + hash(k + 11) * 6, d: 14 + hash(k + 13) * 6, h, c: new THREE.Color(0.85 * shade, 0.78 * shade, 0.7 * shade) });
    }
  }
  return out;
})();
export const CityBlocks: React.FC = () => {
  const inst = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), blocks.length);
    const o = new THREE.Object3D();
    blocks.forEach((b, i) => {
      o.position.set(b.x, b.h / 2, b.z);
      o.scale.set(b.w, b.h, b.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, b.c);
    });
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, -300]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial color="#56604c" roughness={1} />
      </mesh>
      <primitive object={inst} />
    </group>
  );
};
