import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, SkyDome, clamp01, hash } from './common3d';
import { Env, Post, Redraw } from './fx3d';
import { Hero, actHero, poseHero, standHero, useHeroFactory } from './hero';

/*
  "BUNKER" beach diorama (the Liam3d-style cut-away world). One persistent world, props accumulate.
  World: ground top y=0, slab x -12..26, z -8..3 (front cut face at z=3, camera mostly from +z). Sea behind (z<-8) and left.
  Hole at x -3..-0.4, bunker x 7.5..12.5 on the dune, tunnel under it, supply camp at x~24.
  Every param is a keyframed number (see tools/gen/bunker.py); hero{} is evaluated by scenes.tsx.
*/
const pop = (x: number) => {
  const k = clamp01(x);
  const c1 = 1.9;
  return k <= 0 ? 0.0001 : 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
const S = (x: number) => Math.max(0.0001, x);
const SAND = ['#ecc77c', '#d4a55a', '#b3843f', '#86602f'];
const CONC = '#a9adb2';

type R = [number, number, number, number]; // x0,x1,y0,y1 in the front plane


const cTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
const sandTexture = (base: string, rip: number) =>
  cTex(512, 512, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26; i++) {
      const y = (i / 26) * 512 + hash(i) * 8;
      g.strokeStyle = `rgba(120,80,30,${0.1 + rip * 0.1})`;
      g.lineWidth = 2 + hash(i * 3) * 3;
      g.beginPath();
      for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4 * rip + Math.sin(x * 0.011 + i * 2) * 6 * rip);
      g.stroke();
      g.strokeStyle = 'rgba(255,240,200,0.12)';
      g.beginPath();
      for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + 6 + Math.sin(x * 0.03 + i) * 4 * rip);
      g.stroke();
    }
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = hash(i) > 0.5 ? 'rgba(255,245,210,0.18)' : 'rgba(90,60,20,0.16)';
      g.fillRect(hash(i * 1.7) * 512, hash(i * 2.9) * 512, 1 + hash(i * 5) * 2, 1 + hash(i * 7) * 2);
    }
  });
const concreteTexture = () =>
  cTex(512, 512, (g) => {
    g.fillStyle = '#a4a8ac';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = hash(i) > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,60,60,0.12)';
      g.fillRect(hash(i * 1.3) * 512, hash(i * 2.1) * 512, 1 + hash(i * 3) * 4, 1 + hash(i * 4) * 4);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(70,70,75,${0.05 + hash(i) * 0.08})`;
      g.beginPath();
      g.ellipse(hash(i * 5) * 512, hash(i * 9) * 512, 20 + hash(i) * 50, 14 + hash(i * 2) * 30, 0, 0, 6.3);
      g.fill();
    }
    for (let x = 64; x < 512; x += 128) for (let y = 64; y < 512; y += 128) {
      g.fillStyle = '#4b4846';
      g.beginPath();
      g.arc(x, y, 5, 0, 6.3);
      g.fill();
    }
  });
const plankTexture = () =>
  cTex(256, 256, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = ['#b98a52', '#a97a45', '#c19659', '#b3834a'][i % 4];
      g.fillRect(i * 32, 0, 32, 256);
      g.fillStyle = 'rgba(70,40,15,0.5)';
      g.fillRect(i * 32, 0, 2, 256);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = 'rgba(90,55,20,0.2)';
        g.fillRect(i * 32 + 4 + hash(i * 40 + k) * 24, hash(k * 3 + i) * 256, 1, 10 + hash(k) * 30);
      }
    }
  });
const skyTexture = () =>
  cTex(1024, 512, (g) => {
    g.translate(0, 512);
    g.scale(1, -1);
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#1b66c0');
    gr.addColorStop(0.3, '#2f84d6');
    gr.addColorStop(0.43, '#5fa8e4');
    gr.addColorStop(0.5, '#cfe6f5');
    gr.addColorStop(1, '#cfe6f5');
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 140; i++) {
      const x = hash(i * 3.1) * 1024, y = 90 + hash(i * 5.3) * 150, r = 24 + hash(i * 7) * 60;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.8)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.save();
      g.translate(x, y);
      g.scale(2.4, 0.7);
      g.translate(-x, -y);
      g.beginPath();
      g.arc(x, y, r, 0, 6.3);
      g.fill();
      g.restore();
    }
  }, false);
const uvPlane = (w: number, h: number, u0: number, v0: number, scale: number) => {
  const gm = new THREE.PlaneGeometry(w, h);
  const uv = gm.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 / scale + uv.getX(i) * (w / scale), v0 / scale + uv.getY(i) * (h / scale));
  return gm;
};

const Cell: React.FC<{ x0: number; x1: number; y0: number; y1: number; z?: number; mat: THREE.Material }> = ({ x0, x1, y0, y1, z = 3, mat }) => {
  const gm = useMemo(() => uvPlane(x1 - x0, y1 - y0, x0, y0, 7), [x0, x1, y0, y1]);
  return <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, z]} geometry={gm} material={mat} receiveShadow />;
};

const FrontFace: React.FC<{ rects: R[]; mats: THREE.Material[] }> = ({ rects, mats }) => {
  const xs = Array.from(new Set([-12, 26, ...rects.flatMap((r) => [r[0], r[1]])])).sort((a, b) => a - b);
  const ys = Array.from(new Set([-4.2, 0, -0.5, -1.6, -3, ...rects.flatMap((r) => [r[2], r[3]])])).sort((a, b) => a - b);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      if (rects.some((r) => cx > r[0] && cx < r[1] && cy > r[2] && cy < r[3])) continue;
      const mi = cy > -0.5 ? 0 : cy > -1.6 ? 1 : cy > -3 ? 2 : 3;
      out.push(<Cell key={i + '_' + j} x0={xs[i]} x1={xs[i + 1]} y0={ys[j]} y1={ys[j + 1]} mat={mats[mi]} />);
    }
  return <group>{out}</group>;
};

const Smoke: React.FC<{ p: number; n?: number; col?: string; r?: number; seed?: number }> = ({ p, n = 10, col = '#3a3a3a', r = 1, seed = 1 }) => (
  <group>
    {Array.from({ length: n }, (_, i) => {
      const a = hash(i * 3.1 + seed) * 6.28, d = (0.3 + hash(i * 5.3 + seed)) * r * p;
      return <mesh key={i} position={[Math.cos(a) * d, Math.abs(Math.sin(a)) * d * 0.9 + p * 0.6 * r, Math.sin(a) * d * 0.6]} scale={S((0.28 + hash(i * 7 + seed) * 0.3) * r * (0.4 + p) * (1 - p * 0.35))}>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={i % 3 ? col : '#c9b385'} roughness={1} />
      </mesh>;
    })}
  </group>
);

const Burst: React.FC<{ p: number; pos: [number, number, number]; s?: number; seed?: number; debris?: boolean }> = ({ p, pos, s = 1, seed = 1, debris = false }) => {
  if (p <= 0.001 || p >= 1) return null;
  const f = Math.sin(Math.PI * clamp01(p * 2.2));
  return (
    <group position={pos} scale={s}>
      <mesh scale={S(1.5 * f)} position={[0, 0.3, 0.3]}><circleGeometry args={[1, 20]} /><meshBasicMaterial color={p < 0.1 ? '#fff4d6' : '#ff8a1e'} /></mesh>
      <pointLight color="#ff9a3c" intensity={30 * f} distance={14} position={[0, 1, 2]} />
      <Smoke p={p} n={12} r={1.6} seed={seed} />
      {debris && Array.from({ length: 22 }, (_, i) => {
        const a = hash(i * 2.3 + seed) * 6.28, v = 2 + hash(i * 4.1) * 5;
        return <mesh key={'d' + i} position={[Math.cos(a) * v * p, 1 + Math.sin(a * 0.5 + 1) * v * p - 5 * p * p * 1.6, (hash(i * 6.1) - 0.5) * 3 * p]} rotation={[p * 6 + i, p * 4, i]} scale={S(0.22 * (1 - p * 0.4))}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#8d9196" /></mesh>;
      })}
    </group>
  );
};

const Ship: React.FC<{ pos: [number, number, number]; s: number; t: number; flash?: number }> = ({ pos, s, t, flash = 0 }) => {
  const hull = '#5f6c79', deck = '#8f9aa5', sup = '#aab4bd', dark = '#3b434b';
  return (
    <group position={pos} scale={s}>
      <mesh position={[0, 0.3, 0]}><boxGeometry args={[7.2, 0.6, 1.2]} /><meshStandardMaterial color={hull} roughness={0.7} /></mesh>
      <mesh position={[0, 0.02, 0]}><boxGeometry args={[7.1, 0.12, 1.05]} /><meshStandardMaterial color="#7a2f2a" roughness={0.8} /></mesh>
      <mesh position={[3.95, 0.34, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.6, 1.7, 4]} /><meshStandardMaterial color={hull} roughness={0.7} /></mesh>
      <mesh position={[0, 0.62, 0]}><boxGeometry args={[7.0, 0.06, 1.1]} /><meshStandardMaterial color={deck} roughness={0.8} /></mesh>
      <mesh position={[-0.2, 0.95, 0]}><boxGeometry args={[2.8, 0.55, 0.8]} /><meshStandardMaterial color={sup} roughness={0.8} /></mesh>
      <mesh position={[0.5, 1.4, 0]}><boxGeometry args={[1.4, 0.4, 0.62]} /><meshStandardMaterial color={sup} roughness={0.8} /></mesh>
      <mesh position={[0.7, 1.75, 0]}><boxGeometry args={[0.7, 0.3, 0.5]} /><meshStandardMaterial color="#c7cfd6" roughness={0.8} /></mesh>
      <mesh position={[0.7, 2.5, 0]}><cylinderGeometry args={[0.03, 0.04, 1.4, 6]} /><meshStandardMaterial color={dark} /></mesh>
      <mesh position={[0.7, 2.9, 0]}><boxGeometry args={[0.05, 0.05, 0.7]} /><meshStandardMaterial color={dark} /></mesh>
      {[-0.9, 0.0, -1.7].map((x, i) => (
        <group key={i} position={[x, 1.55 + (i === 2 ? 0 : 0), 0]}>
          <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.2, 0.25, 0.9, 10]} /><meshStandardMaterial color="#6d7882" roughness={0.8} /></mesh>
          <mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.21, 0.2, 0.14, 10]} /><meshStandardMaterial color="#17191b" roughness={0.9} /></mesh>
        </group>
      ))}
      {[2.5, -2.9].map((x, i) => (
        <group key={i} position={[x, 0.85, 0]}>
          <mesh position={[0, 0, 0]}><cylinderGeometry args={[0.38, 0.42, 0.28, 12]} /><meshStandardMaterial color="#76818c" roughness={0.8} /></mesh>
          {[-0.12, 0.12].map((z) => <mesh key={z} position={[(i ? -1 : 1) * 0.65, 0.05, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.045, 0.05, 1.1, 8]} /><meshStandardMaterial color="#2a2f34" /></mesh>)}
        </group>
      ))}
      <mesh position={[0, 0.0, 0]} scale={[1, 1, 1]}><boxGeometry args={[8.4, 0.03, 1.8]} /><meshStandardMaterial color="#ffffff" transparent opacity={0.55} /></mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const ph = (t * 0.4 + i / 8) % 1;
        return <mesh key={i} position={[-0.9 - ph * 6, 2.1 + ph * 1.5, 0]} scale={S(0.4 + ph * 0.9)}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#25272a" transparent opacity={0.85 * (1 - ph * 0.7)} roughness={1} /></mesh>;
      })}
      {flash > 0.01 && <mesh position={[-4.2, 0.95, 0.7]} scale={S(0.6 * Math.sin(Math.PI * clamp01(flash)))}><circleGeometry args={[1, 16]} /><meshBasicMaterial color="#ff8a1e" /></mesh>}
    </group>
  );
};

const Tank: React.FC<{ s?: number }> = ({ s = 1 }) => (
  <group scale={s}>
    <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[2.4, 0.5, 1.4]} /><meshStandardMaterial color="#5f7a3a" roughness={0.8} /></mesh>
    {[-0.78, 0.78].map((z) => <mesh key={z} position={[0, 0.3, z]}><boxGeometry args={[2.7, 0.55, 0.32]} /><meshStandardMaterial color="#1e1f20" roughness={0.9} /></mesh>)}
    <mesh position={[0, 0.95, 0]} castShadow><cylinderGeometry args={[0.55, 0.62, 0.42, 14]} /><meshStandardMaterial color="#6c8a42" roughness={0.8} /></mesh>
    <mesh position={[1.1, 1.0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.07, 0.07, 1.3, 8]} /><meshStandardMaterial color="#2c2f2a" /></mesh>
  </group>
);

const Boat: React.FC<{ s?: number; ramp?: number; hasTank?: boolean }> = ({ s = 1, ramp = 0, hasTank = false }) => (
  <group scale={s}>
    <mesh position={[0, 0.4, 0]} castShadow><boxGeometry args={[4.4, 0.8, 1.7]} /><meshStandardMaterial color="#7d8791" roughness={0.8} /></mesh>
    <mesh position={[0, 0.82, 0]}><boxGeometry args={[3.8, 0.05, 1.3]} /><meshStandardMaterial color="#22262a" /></mesh>
    <mesh position={[2.35, 0.4 - ramp * 0.1, 0]} rotation={[0, 0, -0.6 * ramp]}><boxGeometry args={[0.15, 0.9, 1.6]} /><meshStandardMaterial color="#5f6870" /></mesh>
    {hasTank && <group position={[-0.3, 0.8, 0]} scale={0.7}><Tank /></group>}
  </group>
);

const Hedgehog: React.FC<{ pos: [number, number, number]; k: number; ry?: number }> = ({ pos, k, ry = 0 }) => (
  <group position={pos} scale={S(pop(k))} rotation={[0, ry, 0]}>
    {[[0, 0, 0], [0, 0, Math.PI / 2], [Math.PI / 2, 0, 0]].map((r, i) => (
      <mesh key={i} position={[0, 0.5, 0]} rotation={[r[0] + 0.6, r[1] + 0.4 * i, r[2] + 0.6]} castShadow><boxGeometry args={[0.14, 1.5, 0.14]} /><meshStandardMaterial color="#1c1e21" roughness={0.8} /></mesh>
    ))}
  </group>
);

const Gull: React.FC<{ pos: [number, number, number]; t: number; ry: number }> = ({ pos, t, ry }) => {
  const fl = Math.sin(t * 22) * 0.7;
  return (
    <group position={pos} rotation={[0, ry, 0]} scale={0.55}>
      <mesh scale={[1, 0.6, 0.6]}><sphereGeometry args={[0.35, 10, 8]} /><meshStandardMaterial color="#f4f5f6" /></mesh>
      <mesh position={[0.3, 0.12, 0]}><sphereGeometry args={[0.15, 8, 8]} /><meshStandardMaterial color="#f4f5f6" /></mesh>
      <mesh position={[0.46, 0.1, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.04, 0.14, 6]} /><meshStandardMaterial color="#f2a63a" /></mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0.05, s * 0.2]} rotation={[s * fl, 0, 0]}>
          <mesh position={[0, 0, s * 0.45]}><boxGeometry args={[0.5, 0.04, 0.9]} /><meshStandardMaterial color="#9aa1a8" /></mesh>
          <mesh position={[-0.05, 0, s * 0.88]}><boxGeometry args={[0.45, 0.045, 0.14]} /><meshStandardMaterial color="#222" /></mesh>
        </group>
      ))}
    </group>
  );
};

const Streak: React.FC<{ a: [number, number, number]; b: [number, number, number]; p: number; col?: string; w?: number }> = ({ a, b, p, col = '#ff6fae', w = 0.07 }) => {
  if (p <= 0.001 || p >= 1) return null;
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const head = A.clone().lerp(B, clamp01(p)), tail = A.clone().lerp(B, clamp01(p - 0.22));
  const mid = head.clone().add(tail).multiplyScalar(0.5);
  const len = head.distanceTo(tail);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), head.clone().sub(tail).normalize());
  return <mesh position={mid} quaternion={q}><boxGeometry args={[len, w, w]} /><meshBasicMaterial color={col} /></mesh>;
};

const Beam: React.FC<{ a: [number, number, number]; b: [number, number, number]; k: number; col?: string; w?: number }> = ({ a, b, k, col = '#ff6fae', w = 0.07 }) => {
  if (k <= 0.001) return null;
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const e = A.clone().lerp(B, clamp01(k));
  const mid = A.clone().add(e).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), e.clone().sub(A).normalize());
  return <mesh position={mid} quaternion={q}><boxGeometry args={[A.distanceTo(e), w, w]} /><meshBasicMaterial color={col} /></mesh>;
};

const makeTools = () => {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#8a6a3f', roughness: 0.8 });
  const steelM = new THREE.MeshStandardMaterial({ color: '#aeb7c0', metalness: 0.8, roughness: 0.35 });
  const black = new THREE.MeshStandardMaterial({ color: '#25282b', metalness: 0.6, roughness: 0.5 });
  const mk = (name: string, build: (grp: THREE.Group) => void) => {
    const grp = new THREE.Group();
    grp.name = name;
    build(grp);
    g.add(grp);
  };
  mk('shovel', (s) => {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.5, 8), wood);
    h.position.y = -0.75;
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), wood);
    grip.position.y = 0.02;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.025), steelM);
    blade.position.y = -1.62;
    s.add(h, grip, blade);
  });
  mk('weld', (w) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.3, 0.09), new THREE.MeshStandardMaterial({ color: '#d1452b', roughness: 0.5 }));
    body.position.y = -0.05;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.28, 8), new THREE.MeshStandardMaterial({ color: '#b87333', metalness: 0.7, roughness: 0.4 }));
    nozzle.position.y = 0.24;
    w.add(body, nozzle);
  });
  mk('hammer', (s) => {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8), wood);
    h.position.y = -0.75;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.16), black);
    head.position.y = -1.5;
    s.add(h, head);
  });
  mk('pick', (s) => {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), wood);
    h.position.y = -0.6;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), black);
    head.position.y = -1.2;
    s.add(h, head);
  });
  return g;
};

type BP = { t: number; cam: CamProps | null; p: Record<string, any> };

export const BunkerScene: React.FC<BP> = ({ t, cam, p }) => {
  const { width, height } = useVideoConfig();
  const c = cam ?? { pos: [4, 3, 16] as [number, number, number], look: [3, 1, 0] as [number, number, number], fov: 40 };
  const g = (k: string, d = 0) => (typeof p[k] === 'number' ? (p[k] as number) : d);
  const H = p.hero ?? {};
  const pit = clamp01(g('pit')), pw = clamp01(g('pw')), cave = clamp01(g('cave')), wave = g('wave');
  const form = clamp01(g('form')), pour = clamp01(g('pour')), bunk = clamp01(g('bunk')), thick = clamp01(g('thick'));
  const sand = clamp01(g('sand')), grass = clamp01(g('grass')), blast = g('blast');
  const lamp = clamp01(g('lamp')), gun = clamp01(g('gun')), crate = clamp01(g('crate')), stove = clamp01(g('stove'));
  const hatch = clamp01(g('hatch')), tunnel = clamp01(g('tunnel')), cartX = g('cartX', 10), cartV = clamp01(g('cartV')), plume = clamp01(g('plume'));
  const tankV = clamp01(g('tankV')), tankX = g('tankX', -20), tankTilt = g('tankTilt'), tankZ = g('tankZ', -6.8), tankY = g('tankY');
  const boatV = clamp01(g('boatV')), boatX = g('boatX', -20), boatZ = g('boatZ', -9), ramp = g('ramp'), boatTank = g('boatTank');
  const boat2X = g('boat2X', -30);
  const xtrap = g('xtrap'), tide = clamp01(g('tide')), poles = g('poles'), mines = g('mines');
  const laser1 = g('laser1'), laser2 = g('laser2'), cone = clamp01(g('cone')), arrow = clamp01(g('arrow')), ghost = clamp01(g('ghost')), ghostRot = g('ghostRot'), rings = g('rings');
  const gullV = clamp01(g('gullV')), cards = clamp01(g('cards')), bread = clamp01(g('bread'));
  const b1 = g('b1'), b2 = g('b2'), b3 = g('b3'), b4 = g('b4'), b5 = g('b5'), blastRub = g('blastRub');
  const tr1 = g('tr1'), tr2 = g('tr2'), tr3 = g('tr3'), f1 = g('f1'), f2 = g('f2'), bul = g('bul'), mg = g('mg');
  const sx = g('smoke', 1), camp = clamp01(g('camp', 1));
  const pitW0 = -3, pitW1 = -0.4, depth = pit * 2.6;
  const shaftR: R = [9.45, 10.25, -1.25, 0.001];
  const tunL = 10.25 + tunnel * 12;
  const rects: R[] = [];
  if (pit > 0.001) rects.push([pitW0, pitW1, -depth, 0.001]);
  if (hatch > 0.01) rects.push(shaftR);
  if (tunnel > 0.01) rects.push([9.45, tunL, -1.9, -0.8]);
  if (tunnel > 0.9) rects.push([21.2, 22.1, -1.9, 0.001]);

  const factory = useHeroFactory();
  const hero = useMemo<Hero | null>(() => (factory ? factory('#2c3f66', { top: '#26335a', bottom: '#6b6f73' }) : null), [factory]);
  const tools = useMemo(() => makeTools(), []);
  const helmet = useMemo(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: '#4e5a32', roughness: 0.75 }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.018, 6, 20), new THREE.MeshStandardMaterial({ color: '#3c4626', roughness: 0.8 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.03;
    const gr = new THREE.Group();
    gr.add(m, rim);
    return gr;
  }, []);
  const toolTip = new THREE.Vector3();
  const toolKind = Math.round(H.tool ?? 0);
  const sp: number = H.sp ?? 1;
  const strikePh = (((t * sp) % 1) + 1) % 1;
  if (hero && H.show !== 0) {
    hero.root.position.set(H.x ?? 1, (H.y ?? 0) + (H.dy ?? 0), H.z ?? 1.2);
    const act = Math.round(H.act ?? 0);
    const rock = act === 10 ? 0.035 * Math.sin(t * 8) : 0;
    hero.root.rotation.set(0, H.rotY ?? 0, (H.tilt ?? 0) + rock);
    if (hero.hat) hero.hat.uniform.value = 1;
    if (act === 5) poseHero(hero, t * 0.7, 0, 0, 0.12);
    else if (act > 0 && act !== 12) actHero(hero, t, act, clamp01(H.k ?? 1), 0, sp);
    else if (act === 12 || (H.walk ?? 0) > 0.5) poseHero(hero, t * (H.walkSp ?? 0.85), H.run ?? 0, 0, 0);
    else standHero(hero, t, 0, 1);
    hero.root.updateMatrixWorld(true);
    const rh = new THREE.Vector3(), lh = new THREE.Vector3(), hp = new THREE.Vector3();
    hero.bones.RightHand.getWorldPosition(rh);
    hero.bones.LeftHand.getWorldPosition(lh);
    hero.bones.Head.getWorldPosition(hp);
    helmet.position.copy(hp).add(new THREE.Vector3(0, 0.1, 0));
    helmet.quaternion.copy(hero.bones.Head.getWorldQuaternion(new THREE.Quaternion()));
    helmet.updateMatrixWorld(true);
    const hq = hero.root.getWorldQuaternion(new THREE.Quaternion());
    const names = ['', 'shovel', 'weld', 'hammer', 'pick'];
    names.forEach((n) => { if (n) tools.getObjectByName(n)!.visible = false; });
    const tk = pop(H.toolK ?? 1);
    if (toolKind > 0) {
      const tg = tools.getObjectByName(names[toolKind])!;
      tg.visible = true;
      if (toolKind === 2) {
        const tgt = new THREE.Vector3(H.tx ?? 5, H.ty ?? 0.3, H.tz ?? 0.5);
        const dir = tgt.clone().sub(rh).normalize();
        tg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        tg.position.copy(rh).addScaledVector(dir, -0.08);
        tg.scale.setScalar(tk);
        toolTip.copy(tgt);
      } else {
        const ph = strikePh;
        const a = ph < 0.4 ? -0.55 + 1.0 * (ph / 0.4) * 0.35 : ph < 0.55 ? -0.4 + 1.2 * ((ph - 0.4) / 0.15) : 0.8 - 1.35 * ((ph - 0.55) / 0.45);
        const dir = new THREE.Vector3(0, -Math.cos(a), Math.sin(a)).applyQuaternion(hq).normalize();
        tg.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
        tg.position.copy(rh).add(lh).multiplyScalar(0.5).addScaledVector(dir, -0.45);
        tg.scale.setScalar(tk);
        toolTip.copy(tg.position).addScaledVector(dir, (toolKind === 1 ? 1.62 : 1.5) * tk);
      }
    }
  }

  const wallT = 0.4 + 0.6 * thick, roofT = 0.5 + 0.7 * thick;
  const bunkS = S(pop(bunk));
  const skyTop = new THREE.Color('#2a7fd4'), skyBot = new THREE.Color('#a9d8f2');
  const seaCol = '#1d9fc2';
  const strikeSoil = toolKind === 1 || toolKind === 4 || toolKind === 3;
  const wm = tide * 2.2;

  const frontMats = useMemo(() => [sandTexture('#e6c487', 0.4), sandTexture('#d2a763', 0.7), sandTexture('#b78845', 0.6), sandTexture('#8f6634', 0.5)].map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 1 })), []);
  const topTex = useMemo(() => { const t = sandTexture('#ebcb8e', 1); t.repeat.set(7, 2); return t; }, []);
  const concTex = useMemo(() => { const t = concreteTexture(); t.repeat.set(2, 2); return t; }, []);
  const concMat = useMemo(() => new THREE.MeshStandardMaterial({ map: concTex, roughness: 0.95 }), [concTex]);
  const plankTex = useMemo(() => plankTexture(), []);
  const plankMat = useMemo(() => new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.95 }), [plankTex]);
  const cloudTex = useMemo(() => cTex(256, 128, (g) => {
    for (let i = 0; i < 14; i++) {
      const x = 40 + hash(i * 3) * 176, y = 50 + hash(i * 5) * 30, r = 22 + hash(i * 7) * 26;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.95)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, y, r, 0, 6.3);
      g.fill();
    }
  }, false), []);
  return (
    <ThreeCanvas width={width} height={height} shadows camera={{ fov: c.fov ?? 40, position: c.pos, near: 0.05, far: 900 }} gl={{ antialias: true }} onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }}>
      <CameraRig {...c} />
      <SkyDome top={new THREE.Color('#2c7fd6')} bottom={new THREE.Color('#bfe0f4')} stars={0} radius={600} />
      {Array.from({ length: 34 }, (_, i) => {
        const a = (i / 34) * Math.PI * 2 + hash(i) * 0.3, r = 220 + hash(i * 3) * 60;
        return (
          <mesh key={'cl' + i} position={[Math.sin(a) * r, 28 + hash(i * 7) * 70, -Math.cos(a) * r - 40]} rotation={[0, -a + Math.PI, 0]} scale={[60 + hash(i * 5) * 60, 14 + hash(i * 9) * 12, 1]}>
            <planeGeometry args={[1, 1]} /><meshBasicMaterial map={cloudTex} transparent depthWrite={false} toneMapped={false} opacity={0.85} />
          </mesh>
        );
      })}
      <Env path="hdr/pedestrian_overpass_1k.hdr" intensity={0.6} />
      <hemisphereLight args={['#dcecff', '#9a8660', 0.38]} />
      <directionalLight color="#fff4d8" intensity={2.3} position={[10, 16, 14]} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-16} shadow-camera-right={26} shadow-camera-top={12} shadow-camera-bottom={-8} shadow-camera-near={1} shadow-camera-far={70} />

      {/* ground: cut-away front face, top pieces, hole walls, back wall */}
      <FrontFace rects={rects} mats={frontMats} />
      <mesh position={[7, -2.1, -1.5]}><planeGeometry args={[38, 4.2]} /><meshStandardMaterial color="#9a8156" roughness={1} /></mesh>
      {rects.map((r, i) => (
        <group key={i}>
          <mesh position={[(r[0] + r[1]) / 2, r[2] + 0.01, 0.75]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[r[1] - r[0], 4.5]} /><meshStandardMaterial color="#a98c58" roughness={1} /></mesh>
          {[r[0], r[1]].map((x, k) => <mesh key={k} position={[x, (r[2] + r[3]) / 2, 0.75]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[4.5, r[3] - r[2]]} /><meshStandardMaterial color="#b4975f" roughness={1} side={THREE.DoubleSide} /></mesh>)}
        </group>
      ))}
      {[[-12, pitW0], [pit > 0.001 ? pitW1 : pitW0, 26]].map((q, i) => (
        <mesh key={i} position={[(q[0] + q[1]) / 2, 0, -2.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[q[1] - q[0], 11]} /><meshStandardMaterial map={topTex} roughness={1} /></mesh>
      ))}
      {pit > 0.001 && <mesh position={[(pitW0 + pitW1) / 2, 0, -4.75]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[pitW1 - pitW0, 6.5]} /><meshStandardMaterial map={topTex} roughness={1} /></mesh>}
      {pit < 0.001 && <mesh position={[(pitW0 + pitW1) / 2, 0, -2.5]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[pitW1 - pitW0, 11]} /><meshStandardMaterial map={topTex} roughness={1} /></mesh>}
      {pit > 0.001 && <mesh position={[(pitW0 + pitW1) / 2, 0, 0.75]} rotation={[-Math.PI / 2, 0, 0]} visible={false}><planeGeometry args={[1, 1]} /></mesh>}

      {/* sea (behind and left) + horizon */}
      <mesh position={[0, -0.5, -45]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[400, 80]} /><meshStandardMaterial color={seaCol} roughness={0.25} metalness={0.1} /></mesh>
      <mesh position={[-60, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[96, 60]} /><meshStandardMaterial color={seaCol} roughness={0.25} /></mesh>
      <mesh position={[-3, -0.2, -8.1]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[30, 1.2]} /><meshStandardMaterial color="#f1f5f4" roughness={0.6} transparent opacity={0.85} /></mesh>

      {/* dune backdrop with grass */}
      <mesh position={[11, 0.6, -9.2]} scale={[9, 3.6, 4.6]}><icosahedronGeometry args={[1, 2]} /><meshStandardMaterial color={SAND[0]} roughness={1} flatShading /></mesh>
      <mesh position={[11, 0.95, -9.2]} scale={[8.5, 3.55, 4.3]}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#6fa84a" roughness={1} flatShading /></mesh>
      <mesh position={[11, 0.55, -9.1]} scale={[9.1, 3.2, 4.7]}><icosahedronGeometry args={[1, 2]} /><meshStandardMaterial color={SAND[0]} roughness={1} flatShading /></mesh>
      {[-4.6, -3.2, 15.5, 17.2, 19.5, -9.5].map((x, i) => (
        <group key={i} position={[x, 0, -3.8 + (i % 3) * 0.7]}>
          <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.08, 0.13, 1.8, 6]} /><meshStandardMaterial color="#7a5a3a" /></mesh>
          {[0, 1, 2, 3, 4].map((k) => <mesh key={k} position={[Math.cos(k * 1.26) * 0.5, 1.8, Math.sin(k * 1.26) * 0.5]} rotation={[Math.sin(k * 1.26) * 0.9, 0, -Math.cos(k * 1.26) * 0.9]}><coneGeometry args={[0.18, 1.1, 4]} /><meshStandardMaterial color="#2f9a4a" /></mesh>)}
        </group>
      ))}

      {/* warships on the horizon */}
      <Ship pos={[-26, -0.4, -48]} s={2.4} t={t} flash={f1} />
      <Ship pos={[-2, -0.4, -60]} s={2.6} t={t + 3} flash={f2} />
      <Ship pos={[-50, -0.4, -40]} s={2.0} t={t + 1.5} />

      {/* hole water, wave, cave-in */}
      {pw > 0.01 && pit > 0.05 && <mesh position={[(pitW0 + pitW1) / 2, -depth + (depth * pw) / 2, 0.75]}><boxGeometry args={[pitW1 - pitW0 - 0.05, Math.max(0.01, depth * pw), 4.4]} /><meshStandardMaterial color="#3aa6d6" transparent opacity={0.6} roughness={0.1} /></mesh>}
      {wave > 0.001 && wave < 1.6 && (
        <group position={[-1.7 + Math.min(wave, 1) * 0.0, 0, -7 + Math.min(wave, 1.2) * 9]}>
          <mesh position={[0, 0.55, 0]} rotation={[0.25, 0, 0]}><boxGeometry args={[10, 1.3, 1.6]} /><meshStandardMaterial color="#3fc3d0" transparent opacity={0.62} roughness={0.2} /></mesh>
          {Array.from({ length: 26 }, (_, i) => {
            const ph = (t * 1.5 + hash(i * 3.3)) % 1;
            return <mesh key={i} position={[-3 + hash(i) * 6, 1 + ph * 1.8, hash(i * 7) * 1.2]} scale={[0.04, S(0.3 * (1 - ph)), 0.04]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#ffffff" /></mesh>;
          })}
        </group>
      )}
      {cave > 0.01 && Array.from({ length: 16 }, (_, i) => {
        const k = clamp01(cave * 1.3 - hash(i) * 0.3);
        return <mesh key={i} position={[(i % 2 ? pitW1 + 0.3 : pitW0 - 0.3) + (i % 2 ? -1 : 1) * k * (0.7 + hash(i * 2) * 0.8), 0.3 - k * (depth * 0.85) * hash(i * 3), 0.2 + (hash(i * 5) - 0.3) * 2.2]} scale={S(0.26 + 0.15 * hash(i * 9))}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={SAND[1]} roughness={1} /></mesh>;
      })}

      {/* tide water covering the beach */}
      {tide > 0.01 && <mesh position={[7, wm / 2 - 0.02, -2.5]}><boxGeometry args={[38, wm, 11]} /><meshStandardMaterial color="#38b6c8" transparent opacity={0.5} roughness={0.1} /></mesh>}

      {/* ---------- bunker ---------- */}
      {form > 0.01 && bunk < 0.01 && (
        <group>
          <mesh position={[10, 0.06, 0]} receiveShadow><boxGeometry args={[5.4, 0.12, 4.4]} /><meshStandardMaterial color="#9b9fa4" roughness={0.9} /></mesh>
          {[[7.3, 0, 0.2, 4.4], [12.7, 0, 0.2, 4.4], [10, -2.2, 5.4, 0.2]].map((q, i) => (
            <mesh key={i} position={[q[0], 1.7 * pop(form), q[1] + (q[1] === 0 ? 0 : q[1])]} scale={[1, S(pop(form)), 1]}><boxGeometry args={[q[2], 3.4, q[3]]} /><primitive object={plankMat} attach="material" /></mesh>
          ))}
          {pour > 0.01 && <mesh position={[10, (3.3 * pour) / 2, 0]}><boxGeometry args={[4.9, S(3.3 * pour), 4.0]} /><primitive object={concMat} attach="material" /></mesh>}
        </group>
      )}
      {bunk > 0.01 && blast < 0.02 && (
        <group position={[10, 0, 0]} scale={bunkS}>
          <mesh position={[0, 0.1, 0]} receiveShadow castShadow><boxGeometry args={[5.4, 0.2, 4.4]} /><primitive object={concMat} attach="material" /></mesh>
          <mesh position={[0, 1.7, -2.0 + wallT / 2]} castShadow receiveShadow><boxGeometry args={[5.4, 3.4, wallT]} /><primitive object={concMat} attach="material" /></mesh>
          <mesh position={[2.7 - wallT / 2, 1.7, 0]} castShadow><boxGeometry args={[wallT, 3.4, 4.4]} /><primitive object={concMat} attach="material" /></mesh>
          <mesh position={[-2.7 + wallT / 2, 0.52, 0]} castShadow><boxGeometry args={[wallT, 0.64, 4.4]} /><primitive object={concMat} attach="material" /></mesh>
          <mesh position={[-2.7 + wallT / 2, 2.4, 0]} castShadow><boxGeometry args={[wallT, 2.0, 4.4]} /><primitive object={concMat} attach="material" /></mesh>
          <mesh position={[0, 3.4 + roofT / 2 - 0.05, 0]} castShadow><boxGeometry args={[5.4, roofT, 4.4]} /><primitive object={concMat} attach="material" /></mesh>
          <mesh position={[-2.6, 1.05, 0]}><planeGeometry args={[0.02, 0.01]} /><meshBasicMaterial color="#cfeaff" /></mesh>
          <mesh position={[0, 1.7, -2.0 + wallT + 0.02]}><planeGeometry args={[5.0, 3.0]} /><meshStandardMaterial color="#3a4a64" roughness={1} /></mesh>
        </group>
      )}
      {blast > 0.02 && bunk > 0.01 && Array.from({ length: 40 }, (_, i) => {
        const a = hash(i * 2.7) * 6.28, v = 2.5 + hash(i * 4.4) * 6, bp = clamp01(blast);
        return <mesh key={i} position={[10 + Math.cos(a) * v * bp * 1.2, 1.5 + Math.abs(Math.sin(a)) * v * bp - 5 * bp * bp * 2.2, (hash(i * 7.1) - 0.5) * 4 * bp]} rotation={[bp * 7 + i, bp * 5, i]} scale={S(0.3 + 0.3 * hash(i))}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#8e9297" roughness={1} /></mesh>;
      })}
      {/* sand over the roof + grass */}
      {sand > 0.01 && bunk > 0.01 && blast < 0.02 && (
        <group position={[10, 3.4 + roofT, -0.2]}>
          <mesh scale={[3.2 * pop(sand), 1.3 * pop(sand), 2.7 * pop(sand)]}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={SAND[0]} roughness={1} flatShading /></mesh>
          {grass > 0.01 && <mesh position={[0, 0.2 * grass, 0]} scale={[3.0 * pop(grass), 1.2 * pop(grass), 2.5 * pop(grass)]}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#6fa84a" roughness={1} flatShading /></mesh>}
        </group>
      )}
      {/* bunker interior */}
      {bunk > 0.5 && blast < 0.02 && (
        <group>
          <mesh position={[10, 2.8, 0]}><sphereGeometry args={[0.13, 12, 12]} /><meshStandardMaterial color="#fff6d0" emissive="#ffe3a0" emissiveIntensity={lamp * 4} /></mesh>
          <mesh position={[10, 3.3, 0]}><cylinderGeometry args={[0.012, 0.012, 1.0, 5]} /><meshStandardMaterial color="#111" /></mesh>
          <pointLight position={[10, 2.5, 1]} color="#ffe2a8" intensity={lamp * 22} distance={9} />
          {crate > 0.01 && <mesh position={[11.5, 0.6 * pop(crate), -0.7]} scale={S(pop(crate))} castShadow><boxGeometry args={[1.0, 1.0, 1.0]} /><meshStandardMaterial color="#b9894f" roughness={0.9} /></mesh>}
          {gun > 0.01 && (
            <group position={[8.6, 0, 0.2]} scale={S(pop(gun))}>
              <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.1, 1.0, 0.1]} /><meshStandardMaterial color="#222" /></mesh>
              <mesh position={[-0.4, 1.0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.07, 0.07, 1.4, 8]} /><meshStandardMaterial color="#17191b" metalness={0.6} /></mesh>
              <mesh position={[0.3, 1.0, 0]}><boxGeometry args={[0.6, 0.28, 0.24]} /><meshStandardMaterial color="#17191b" metalness={0.6} /></mesh>
              {mg > 0.5 && <mesh position={[-1.25, 1.0, 0.05]} scale={S(0.22 + 0.1 * Math.sin(t * 90))}><sphereGeometry args={[1, 8, 8]} /><meshBasicMaterial color="#fff2a8" /></mesh>}
            </group>
          )}
          {stove > 0.01 && (
            <group position={[11.7, 0, 1.2]} scale={S(pop(stove))}>
              <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[0.8, 0.9, 0.7]} /><meshStandardMaterial color="#1d1e20" metalness={0.5} roughness={0.5} /></mesh>
              <mesh position={[0, 0.4, 0.36]}><boxGeometry args={[0.4, 0.4, 0.02]} /><meshStandardMaterial color="#ff8a2a" emissive="#ff6a00" emissiveIntensity={3} /></mesh>
              <mesh position={[0.1, 2.0, -0.1]}><cylinderGeometry args={[0.07, 0.07, 2.4, 8]} /><meshStandardMaterial color="#2a2c2e" metalness={0.5} /></mesh>
              <pointLight position={[0, 0.6, 0.8]} color="#ff8a3a" intensity={10} distance={5} />
            </group>
          )}
          {cards > 0.01 && <mesh position={[9.0, 0.55, 1.1]} rotation={[0, 0.4, 0]} scale={S(pop(cards))}><boxGeometry args={[0.24, 0.07, 0.17]} /><meshStandardMaterial color="#f6f6f2" /></mesh>}
          {bread > 0.01 && <mesh position={[11.5, 1.15, -0.7]} scale={[0.35, 0.18, 0.2]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color="#d79a4a" /></mesh>}
        </group>
      )}
      {plume > 0.01 && Array.from({ length: 14 }, (_, i) => {
        const ph = (t * 0.5 + i / 14) % 1;
        return <mesh key={i} position={[10.1 + 11.7 - 10 + Math.sin(ph * 9 + i) * 0.35, 4.6 + 0.6 + ph * 4.5, -0.1]} scale={S((0.2 + ph * 0.55) * plume)}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#f5f5f5" transparent opacity={0.9 * (1 - ph * 0.6)} /></mesh>;
      })}
      {/* ghost bunker + arrows */}
      {ghost > 0.01 && (
        <group position={[10, 1.7, 0]} rotation={[0, ghostRot, 0]}>
          <mesh><boxGeometry args={[5.4, 3.4, 4.4]} /><meshStandardMaterial color="#e6d29b" transparent opacity={0.45 * ghost} /></mesh>
        </group>
      )}
      {arrow > 0.01 && Array.from({ length: 18 }, (_, i) => {
        const k = i / 17, a = -1.6 + k * 3.1;
        return <mesh key={i} position={[10 + Math.sin(a) * 4.8, 5.4 + Math.cos(a) * 1.4 - 0.9, 2.2]} scale={S(0.14 * arrow)}><sphereGeometry args={[1, 6, 6]} /><meshBasicMaterial color="#ffffff" /></mesh>;
      })}

      {/* tunnel details: posts, rails, cart, lamp */}
      {tunnel > 0.01 && (
        <group>
          {Array.from({ length: Math.floor(tunnel * 12) }, (_, i) => <mesh key={i} position={[10.8 + i * 1.0, -1.35, 2.9]} castShadow><boxGeometry args={[0.12, 1.2, 0.12]} /><meshStandardMaterial color="#b46a2a" /></mesh>)}
          <mesh position={[(9.45 + tunL) / 2, -1.88, 2.5]}><boxGeometry args={[tunL - 9.45, 0.04, 0.5]} /><meshStandardMaterial color="#2a2a2a" /></mesh>
          <mesh position={[tunL - 0.4, -0.9, 2.2]}><sphereGeometry args={[0.07, 8, 8]} /><meshBasicMaterial color="#fff3c0" /></mesh>
          <pointLight position={[tunL - 0.6, -0.9, 2.5]} color="#ffe6a8" intensity={6} distance={7} />
        </group>
      )}
      {cartV > 0.01 && (
        <group position={[cartX, -1.5, 2.2]} scale={S(pop(cartV))}>
          <mesh castShadow><boxGeometry args={[1.2, 0.55, 0.8]} /><meshStandardMaterial color="#6f7f66" /></mesh>
          {[-0.4, 0.4].map((x) => <mesh key={x} position={[x, -0.38, 0.35]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.13, 0.13, 0.05, 10]} /><meshStandardMaterial color="#222" /></mesh>)}
        </group>
      )}
      {/* supply camp */}
      {camp > 0 && (
        <group position={[23.5, 0, -0.3]}>
          <mesh position={[0, 0.9, 0]} castShadow><boxGeometry args={[2.4, 1.8, 2.2]} /><meshStandardMaterial color="#5e7440" roughness={1} /></mesh>
          <mesh position={[0, 2.1, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[2.0, 1.0, 4]} /><meshStandardMaterial color="#6b8348" /></mesh>
          {[-1.9, -1.4, 1.5].map((x, i) => <mesh key={i} position={[x, 0.3, 1.2]}><boxGeometry args={[0.6, 0.5, 0.5]} /><meshStandardMaterial color="#b9894f" /></mesh>)}
          {[0, 1, 2, 3].map((i) => <mesh key={'s' + i} position={[-2.5 + i * 0.7, 0.2, 1.7]} scale={[0.5, 0.22, 0.3]}><sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color="#c8b27a" /></mesh>)}
        </group>
      )}

      {/* hedgehogs / X traps */}
      {[[2.6, 0.9, 0.2], [4.0, 1.7, 0.9], [5.0, 0.6, 1.8], [1.3, 1.7, 2.1], [3.2, 0.5, 1.4], [5.8, 1.4, 0.5], [0.4, 0.8, 1.0], [4.4, 0.2, 2.3], [2.0, 1.0, 2.4], [6.0, 0.7, 2.0]].map((h, i) => (
        <Hedgehog key={i} pos={[h[0] - 0.2, 0, -1.5 + h[2] * 0.9 - (i % 3) * 0.2]} k={i === 0 ? Math.max(clamp01(g('x1')), clamp01(xtrap / 0.8)) : clamp01((xtrap - i) / 0.8)} ry={i} />
      ))}
      {/* poles with mines in the sea */}
      {Array.from({ length: 9 }, (_, i) => {
        const k = clamp01((poles - i) / 0.8), mk = clamp01((mines - i) / 0.8);
        if (k <= 0) return null;
        return (
          <group key={i} position={[-9 + i * 2.3, 0, -10.5 - (i % 2) * 0.4]}>
            <mesh position={[0, 0.8 + (1 - pop(k)) * 3, 0]} castShadow><boxGeometry args={[0.2, 2.8, 0.2]} /><meshStandardMaterial color="#8a5a2a" roughness={1} /></mesh>
            {mk > 0.01 && <mesh position={[0, 2.35, 0]} scale={S(pop(mk))}><cylinderGeometry args={[0.32, 0.32, 0.14, 12]} /><meshStandardMaterial color="#3d5a2a" /></mesh>}
          </group>
        );
      })}

      {/* tank + landing boats */}
      {tankV > 0.01 && <group position={[tankX, 0.05 + tankY, tankZ]} rotation={[0, 0, tankTilt]} scale={S(tankV) * 1.3}><Tank /></group>}
      {boatV > 0.01 && <group position={[boatX, -0.15, boatZ]} scale={S(boatV) * 1.3}><Boat ramp={ramp} hasTank={boatTank > 0.5} /></group>}
      {boat2X > -29 && <group position={[boat2X, -0.15, -11.5]} scale={1.3}><Boat hasTank /></group>}
      {b3 > 0.01 && <mesh visible={false} />}

      {/* sight lines + cone */}
      <Beam a={[7.3, 1.2, 0.2]} b={[-26, 1.0, -48]} k={laser1} />
      <Beam a={[7.3, 1.2, 0.2]} b={[-2, 1.0, -60]} k={laser2} />
      {cone > 0.01 && (
        <mesh position={[3.5, 1.5, -4]} rotation={[0, 0.8, 0]} scale={[1, 1, 1]}>
          <coneGeometry args={[7 * cone, 16 * cone, 24, 1, true]} />
          <meshBasicMaterial color="#ffe28a" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      {rings > 0.01 && [0, 1, 2].map((i) => <mesh key={i} position={[boatX, 0.1, boatZ]} rotation={[-Math.PI / 2, 0, 0]} scale={S(((rings + i * 0.3) % 1) * 4 + 0.5)}><ringGeometry args={[0.95, 1.0, 40]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.6} /></mesh>)}

      {/* shells and explosions */}
      <Streak a={[-26, 4, -48]} b={[-0.5, 0.5, 0.3]} p={tr1} />
      <Streak a={[-2, 5, -60]} b={[9, 1.5, 0.5]} p={tr2} />
      <Streak a={[-26, 4, -48]} b={[10, 2.5, 0.2]} p={tr3} />
      <Burst p={b1} pos={[-0.3, 0.2, 1.0]} s={0.7} seed={1} />
      <Burst p={b2} pos={[10, 1.6, 1.0]} s={1.9} seed={2} debris />
      <Burst p={b3} pos={[boatX, 0.3, -9.2]} s={1.8} seed={3} debris />
      <Burst p={b4} pos={[-2.5, 0.2, -6.5]} s={1.2} seed={4} />
      <Burst p={b5} pos={[5, 0.2, -7]} s={1.4} seed={5} />
      {bul > 0 && Array.from({ length: 4 }, (_, i) => <Streak key={i} a={[-6, 0.9 + i * 0.35, -2 + i * 0.4]} b={[14, 0.9 + i * 0.4, -1.6 + i * 0.5]} p={(bul * 1.6 - i * 0.18) % 1} col="#ffffff" w={0.04} />)}

      {/* soil chips when digging / hammering */}
      {strikeSoil && Array.from({ length: 8 }, (_, i) => {
        const u = (((strikePh - 0.5) % 1) + 1) % 1, life = Math.min(1, u / 0.5);
        const vx = 1 + hash(i * 3.1) * 2, vy = 1.6 + hash(i * 5.7) * 2, vz = (hash(i * 7.3) - 0.5) * 1.2, tt = life * 0.45;
        return <mesh key={'c' + i} position={[toolTip.x + vx * tt, toolTip.y + vy * tt - 4.9 * tt * tt, toolTip.z + vz * tt]} scale={life < 1 ? 0.06 + 0.04 * hash(i) : 0.0001}><sphereGeometry args={[1, 6, 6]} /><meshStandardMaterial color={SAND[1]} /></mesh>;
      })}
      {toolKind === 2 && (
        <group>
          {Array.from({ length: 16 }, (_, i) => {
            const ph = (t * 5 + hash(i * 2.3)) % 1, a = i * 2.4 + t * 3, r = ph * (0.2 + 0.3 * hash(i));
            return <mesh key={'w' + i} position={[toolTip.x + Math.cos(a) * r, toolTip.y + 0.1 * (1 - ph) - 1.4 * ph * ph + 0.3 * ph, toolTip.z + Math.sin(a) * r]} scale={0.03 * (1 - ph) + 0.004}><sphereGeometry args={[1, 6, 6]} /><meshBasicMaterial color="#ffd8a0" /></mesh>;
          })}
          <mesh position={toolTip} scale={0.09 + 0.04 * Math.sin(t * 60)}><sphereGeometry args={[1, 10, 10]} /><meshBasicMaterial color="#f4fbff" /></mesh>
          <pointLight position={[toolTip.x, toolTip.y + 0.1, toolTip.z + 0.3]} color="#bfe0ff" intensity={9 + 5 * Math.sin(t * 55)} distance={6} />
        </group>
      )}
      {gullV > 0.01 && <Gull pos={[g('gx'), g('gy'), g('gz')]} t={t} ry={g('gry')} />}
      {hero && H.show !== 0 && toolKind > 0 && <primitive object={tools} />}
      {hero && H.show !== 0 && <primitive object={helmet} />}
      {hero && H.show !== 0 && <primitive object={hero.root} />}
      <Redraw deps={[hero]} />
      <Post bloom={p.bloom ?? 0.25} bloomThreshold={0.9} />
    </ThreeCanvas>
  );
};
