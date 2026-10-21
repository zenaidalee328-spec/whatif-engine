import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, Person, SkyDome, hash, skyAt } from './common3d';
import { Car } from './Street';
import { CityBlocks, Dust, Glow, HOUSES, Hills, RoofHouses, Scaffold, Skyline, contactPoints } from './FrictionExtras';

/*
  Golden-hour city for "What if friction disappeared".
  Everything that moves is a function of `pt` = physical seconds since friction vanished
  (pt < 0: normal world; 0..5: no friction; > 5: friction is back and things skid to a stop).
  Main street along z: road |x| < 5, sidewalks |x| 5..8.5 (y 0.15), shop fronts from |x| = 8.5.
  Cross street (flat) along x at z ∈ [-28, -12], crosswalk at z = -10.5.
  The main street climbs a hill beyond z = -120 (8°): parked cars there slide down.
*/
const SLOPE = (8 * Math.PI) / 180;
const G = 9.81;
const HILL_Z = -120;
const groundY = (z: number) => (z < HILL_Z ? (HILL_Z - z) * Math.tan(SLOPE) : 0);
const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
/** velocity v0 that friction can no longer change, then skids (decel 7 m/s²) once friction is back at pt = 5 */
const glide = (pt: number, v0: number) => {
  if (pt <= 5) return v0 * pt;
  const u = Math.min(pt - 5, Math.abs(v0) / 7);
  return v0 * 5 + Math.sign(v0) * (Math.abs(v0) * u - 3.5 * u * u);
};

type Bld = { x: number; z: number; w: number; h: number; d: number; col: string; awning: string; side: number; y: number };
const PAL = ['#d9b38c', '#c98f6b', '#e3cfa8', '#b9a48e', '#d7a07a', '#c4b7a6', '#a86f58', '#e0c29a'];
const AWN = ['#c0392b', '#1f6f5c', '#2d4f9c', '#d98a1c', '#6b3fa8', '#8e2a24'];
const buildCity = () => {
  const out: Bld[] = [];
  let k = 0;
  // left side: terraced houses with tiled roofs live in FrictionExtras; right side z 15..-1: construction site
  const taken = (side: number, za: number, zb: number) =>
    side < 0 ? HOUSES.some((h) => za > h.z - h.w / 2 - 0.5 && zb < h.z + h.w / 2 + 0.5) : za > -1.5 && zb < 15.5;
  const row = (side: number, z0: number, z1: number) => {
    let z = z0;
    while (z > z1) {
      k++;
      const w = 7 + hash(k) * 6;
      const zc = z - w / 2;
      if (taken(side, z, z - w)) {
        z -= w;
        continue;
      }
      out.push({ x: side * (8.5 + 4), z: zc, w: w - 0.3, h: 7 + hash(k + 3) * 10, d: 8, col: PAL[Math.floor(hash(k + 5) * PAL.length)], awning: AWN[Math.floor(hash(k + 9) * AWN.length)], side, y: groundY(zc) });
      z -= w;
    }
  };
  row(1, 40, -12);
  row(-1, 40, -12);
  row(1, -28, -230);
  row(-1, -28, -230);
  // cross street fronts (facing the cross street)
  for (const zs of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      for (const xs of [-1, 1]) {
        k++;
        const x = xs * (20 + i * 9);
        out.push({ x, z: zs > 0 ? -12 + 4 + 0.01 : -28 - 4, w: 8.6, h: 6 + hash(k) * 9, d: 8, col: PAL[Math.floor(hash(k + 2) * PAL.length)], awning: '', side: 0, y: 0 });
      }
    }
  }
  return out;
};
let cityCache: Bld[] | null = null;

const Box: React.FC<{ p: [number, number, number]; s: [number, number, number]; c: string; r?: number; m?: number; e?: string; ei?: number; rot?: [number, number, number] }> = ({ p, s, c, r = 0.85, m = 0, e, ei = 0, rot }) => (
  <mesh position={p} rotation={rot} castShadow receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} roughness={r} metalness={m} emissive={e ?? '#000'} emissiveIntensity={ei} flatShading />
  </mesh>
);

const Building: React.FC<{ b: Bld }> = ({ b }) => {
  const front = b.side !== 0; // faces main street
  return (
    <group position={[b.x, b.y, b.z]}>
      <Box p={[0, b.h / 2, 0]} s={front ? [b.d, b.h, b.w] : [b.w, b.h, b.d]} c={b.col} />
      {front && (
        <>
          {/* shop window + awning on the street face */}
          <mesh position={[-b.side * (b.d / 2 + 0.02), 1.5, 0]} rotation={[0, -b.side * Math.PI / 2, 0]}>
            <planeGeometry args={[b.w * 0.75, 2.2]} />
            <meshStandardMaterial color="#9cc3d8" emissive="#ffcf8a" emissiveIntensity={0.25} roughness={0.15} metalness={0.4} />
          </mesh>
          <Box p={[-b.side * (b.d / 2 + 0.7), 3.0, 0]} s={[1.5, 0.12, b.w * 0.8]} c={b.awning} rot={[0, 0, b.side * 0.35]} />
          {Array.from({ length: Math.max(1, Math.floor((b.h - 4) / 2.6)) }).map((_, f) =>
            [-1, 0, 1].map((c) => (
              <mesh key={`${f}${c}`} position={[-b.side * (b.d / 2 + 0.02), 4.8 + f * 2.6, c * b.w * 0.28]} rotation={[0, -b.side * Math.PI / 2, 0]}>
                <planeGeometry args={[1.1, 1.3]} />
                <meshStandardMaterial color="#54708a" emissive="#ffb35c" emissiveIntensity={hash(f * 7 + c + b.w) > 0.7 ? 0.6 : 0} roughness={0.2} metalness={0.3} />
              </mesh>
            )),
          )}
        </>
      )}
    </group>
  );
};

/** a person whose legs slip apart and who topples (fall: 0..1, back or front), placed at feet */
const Faller: React.FC<{ x: number; y: number; z: number; rotY: number; spread: number; fall: number; dir: 1 | -1; walk?: number; shirt: string; skin?: string; hair?: string; pants?: string; arms?: number; legsOnly?: boolean; shoes?: string }> = (p) => (
  <group position={[p.x, p.y - 0.88 * (1 - Math.cos(p.spread)) * (1 - p.fall), p.z]} rotation={[0, p.rotY, 0]}>
    <group rotation={[p.dir * -p.fall * (Math.PI / 2) * 0.97, 0, 0]} position={[0, p.fall * 0.12, 0]}>
      <Person
        pos={[0, 0, 0]}
        walk={p.spread > 0.01 ? undefined : p.walk}
        legSpread={p.spread > 0.01 ? p.spread : undefined}
        shirt={p.shirt}
        skin={p.skin}
        hair={p.hair}
        pants={p.pants}
        armR={p.arms ?? 0}
        armL={p.arms ?? 0}
        legsOnly={p.legsOnly}
        shoes={p.shoes}
      />
    </group>
  </group>
);

/** your hand holding a phone, drawn in front of the camera; the phone free-falls once friction is gone */
const PovHand: React.FC<{ cam: CamProps; drop: number; screen: THREE.Texture }> = ({ cam, drop, screen }) => {
  const f = new THREE.Vector3(cam.look[0] - cam.pos[0], cam.look[1] - cam.pos[1], cam.look[2] - cam.pos[2]).normalize();
  const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const u = new THREE.Vector3().crossVectors(r, f).normalize();
  const base = new THREE.Vector3(...cam.pos).addScaledVector(f, 0.4).addScaledVector(r, 0.05).addScaledVector(u, -0.17);
  const m = new THREE.Matrix4().makeBasis(r, u, f.clone().negate());
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const e = new THREE.Euler().setFromQuaternion(q);
  const fallY = drop > 0 ? 0.5 * G * drop * drop : 0;
  const skin = '#d6a07a';
  // phone: tilted back toward the face, slides down out of the grip
  return (
    <>
      <group position={base} rotation={e}>
        <group rotation={[0.45, 0, 0]}>
          {/* palm + thumb + fingers wrapping the right edge */}
          <mesh position={[0.02, -0.05, -0.016]} scale={[1, 1.15, 0.45]}>
            <sphereGeometry args={[0.042, 14, 12]} />
            <meshStandardMaterial color={skin} roughness={0.65} />
          </mesh>
          <mesh position={[-0.04, -0.03, 0.006]} rotation={[0.2, 0, -0.75]}>
            <capsuleGeometry args={[0.0105, 0.04, 4, 10]} />
            <meshStandardMaterial color={skin} roughness={0.65} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0.043, 0.012 - i * 0.021 - drop * 0.015, 0.004]} rotation={[0, -0.2, 0.15 + drop * 1.6]}>
              <capsuleGeometry args={[0.0085 - i * 0.0006, 0.024, 4, 10]} />
              <meshStandardMaterial color={skin} roughness={0.65} />
            </mesh>
          ))}
          {/* wrist/sleeve */}
          <mesh position={[0.025, -0.115, -0.03]} rotation={[0.25, 0, 0]}>
            <cylinderGeometry args={[0.024, 0.026, 0.08, 12]} />
            <meshStandardMaterial color={skin} roughness={0.65} />
          </mesh>
          <mesh position={[0.03, -0.19, -0.05]} rotation={[0.25, 0, 0]}>
            <cylinderGeometry args={[0.034, 0.04, 0.1, 12]} />
            <meshStandardMaterial color="#2b3f5c" roughness={0.9} />
          </mesh>
        </group>
      </group>
      {/* the phone (world space so it can fall straight down) */}
      <group position={[base.x, base.y - fallY, base.z]} rotation={e}>
        <group rotation={[0.45 + drop * 2.2, drop * 0.8, drop * 0.5]} position={[0, 0.03, 0]}>
          <mesh>
            <boxGeometry args={[0.072, 0.15, 0.008]} />
            <meshStandardMaterial color="#111215" roughness={0.3} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.0045]}>
            <planeGeometry args={[0.066, 0.142]} />
            <meshBasicMaterial map={screen} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </>
  );
};

const makeScreen = () => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 540;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3f4f7';
  g.fillRect(0, 0, 256, 540);
  g.fillStyle = '#1b2a4a';
  g.fillRect(0, 0, 256, 70);
  g.fillStyle = '#fff';
  g.font = '700 26px Inter, sans-serif';
  g.fillText('Maya', 24, 46);
  const bubble = (y: number, w: number, me: boolean, text: string) => {
    g.fillStyle = me ? '#3c6fd8' : '#dfe3ea';
    const x = me ? 256 - w - 14 : 14;
    g.beginPath();
    g.roundRect(x, y, w, 44, 18);
    g.fill();
    g.fillStyle = me ? '#fff' : '#1b2a4a';
    g.font = '500 20px Inter, sans-serif';
    g.fillText(text, x + 14, y + 29);
  };
  bubble(100, 170, false, 'where are you??');
  bubble(160, 190, true, 'crossing now :)');
  bubble(220, 130, false, 'hurry!');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

export type FrictionCityProps = {
  t: number;
  cam: CamProps;
  pt: number; // physical seconds since friction vanished
  clock?: number;
  me?: { x: number; z: number; spread: number; fall: number; show: boolean };
  hand?: boolean;
  glow?: number; // 0..1 'friction vision': every place friction was working lights up
  dust?: number; // 0..1 dust clouds over the damage
};

export const FrictionCityScene: React.FC<FrictionCityProps> = ({ t, cam, pt, clock = 17.6, me, hand = false, glow = 0, dust = 0 }) => {
  const { width, height } = useVideoConfig();
  const sky = skyAt(clock);
  const city = (cityCache ??= buildCity());
  const screen = useMemo(makeScreen, []);
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#ffd6a8', 2.9);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const sc = l.shadow.camera as THREE.OrthographicCamera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.far = 150;
    l.shadow.bias = -0.0006;
    return l;
  }, []);
  const tgt: [number, number, number] = [cam.pos[0] + (cam.look[0] - cam.pos[0]) * 0.5, 0, cam.pos[2] + (cam.look[2] - cam.pos[2]) * 0.5];
  sun.position.set(tgt[0] + 28, 38, tgt[2] + 22);
  sun.target.position.set(...tgt);
  sun.target.updateMatrixWorld();

  const p = pt;
  const free = p >= 0 && p <= 5; // frictionless window
  // ---------- cars ----------
  // C1: braking for the crosswalk in lane x=+2.5 (heading -z); friction gone at 6 m/s, can't stop.
  const c1z = p < 0 ? -4 + (p < -2.667 ? 26.667 + 14 * (-2.667 - p) : 6 * -p + 1.5 * p * p) : -4 - glide(p, 6);
  // C2: turning right into the cross street (arc R=6 around (8.5,-16)), then glides straight while spinning.
  const R = 6, w2 = 3.2 / R, phi0 = 1.25;
  let c2: [number, number, number];
  if (p < 0) {
    const phi = phi0 + w2 * p;
    c2 = phi < 0 ? [2.5, -16 - phi * R, Math.PI] : [8.5 - R * Math.cos(phi), -16 - R * Math.sin(phi), Math.PI - phi];
  } else {
    const d = glide(p, 3.2);
    const spin = p <= 5 ? w2 * p : w2 * 5 + w2 * Math.min(p - 5, 0.5) * 0.5;
    c2 = [8.5 - R * Math.cos(phi0) + Math.sin(phi0) * d, -16 - R * Math.sin(phi0) - Math.cos(phi0) * d, Math.PI - phi0 - spin];
  }
  // C3: pulling away from the far stop line (lane x=-2.5, heading +z): only 1.5 m/s when friction vanished.
  const c3z = p < -0.6 ? -31 : p < 0 ? -31 + 1.25 * (p + 0.6) * (p + 0.6) : -31 + 0.45 + glide(p, 1.5);
  // C4: oncoming at 13 m/s (lane x=-2.5)
  const c4z = -45 + (p < 0 ? 13 * p : glide(p, 13));
  // hill: parked cars and bins slide down at g·sin(8°)
  const hillSlide = (z0: number) => {
    if (p <= 0) return z0;
    const a = G * Math.sin(SLOPE);
    if (p <= 5) return z0 + 0.5 * a * p * p;
    const v = a * 5;
    const u = Math.min(p - 5, v / 7);
    return z0 + 0.5 * a * 25 + v * u - 3.5 * u * u;
  };
  const hillCars = [
    { x: 3.9, z0: -138, col: '#e8e6e0' },
    { x: -3.9, z0: -150, col: '#2e86c1' },
    { x: 3.9, z0: -164, col: '#7a2a2a' },
    { x: -3.9, z0: -178, col: '#f1c40f' },
  ];
  // ---------- people ----------
  const pz1 = -16 + 1.4 * Math.min(p, 5) + (p > 5 ? 0.3 * Math.min(1, p - 5) : 0);
  const fall1 = p <= 0 ? 0 : smooth(0.25, 1.35, p);
  const spread1 = p <= 0 ? 0 : Math.min(1.25, 2.4 * p);
  const pz3 = -2 - 3 * Math.min(p, 5) - (p > 5 ? 0.6 * Math.min(1, p - 5) : 0);
  const fall3 = p <= 0 ? 0 : smooth(0.15, 1.0, p);
  // ---------- sign + basket ----------
  const unscrew = Math.min(1, Math.max(0, p) / 2.7);
  const signT = Math.max(0, p - 2.7);
  const signY = Math.max(0.35, 3.4 - 0.5 * G * signT * signT);
  const signTilt = Math.min(1.3, signT * 2.2);
  const knotT = Math.max(0, p - 3.2);
  const basketY = Math.max(0.35, 2.15 - 0.5 * G * knotT * knotT);

  return (
    <ThreeCanvas
      width={width}
      height={height}
      shadows
      camera={{ fov: cam.fov ?? 62, position: [6, 1.68, 6], near: 0.03, far: 1200 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <CameraRig {...cam} />
      <SkyDome top={sky.top} bottom={sky.bottom} stars={1 - sky.day} radius={1000} />
      <fog attach="fog" args={[sky.bottom.getStyle(), 140, 900]} />
      <hemisphereLight args={['#ffe2c0', '#6a5a4a', 0.95]} />
      <ambientLight intensity={0.25} color="#ffe6cc" />
      <primitive object={sun} />
      <primitive object={sun.target} />

      {/* ground: road, cross street, hill */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, -40]} receiveShadow>
        <planeGeometry args={[300, 200]} />
        <meshStandardMaterial color="#3a3c41" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2 + SLOPE, 0, 0]} position={[0, groundY(-180) - 0.01, -180]} receiveShadow>
        <planeGeometry args={[60, 121.2]} />
        <meshStandardMaterial color="#3a3c41" roughness={0.9} />
      </mesh>
      {/* sidewalks (flat part, split by the cross street) */}
      {[-1, 1].map((s) => (
        <React.Fragment key={s}>
          <Box p={[s * 6.75, 0.075, 14]} s={[3.5, 0.15, 52]} c="#b8b2a7" />
          <Box p={[s * 6.75, 0.075, -74]} s={[3.5, 0.15, 92]} c="#b8b2a7" />
          <mesh rotation={[-Math.PI / 2 + SLOPE, 0, 0]} position={[s * 6.75, groundY(-180) + 0.15, -180]} receiveShadow>
            <planeGeometry args={[3.5, 121.2]} />
            <meshStandardMaterial color="#b8b2a7" roughness={0.9} />
          </mesh>
        </React.Fragment>
      ))}
      {/* lane dashes + crosswalk + stop lines */}
      {Array.from({ length: 30 }).map((_, k) => {
        const z = 38 - k * 4.4;
        if (z < -12 && z > -28) return null;
        return (
          <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, z]}>
            <planeGeometry args={[0.15, 2.2]} />
            <meshStandardMaterial color="#e8e2c8" />
          </mesh>
        );
      })}
      {Array.from({ length: 10 }).map((_, k) => (
        <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[-4.4 + k * 0.98, 0.012, -10.5]}>
          <planeGeometry args={[0.55, 3]} />
          <meshStandardMaterial color="#f2f0ea" />
        </mesh>
      ))}
      {/* traffic lights */}
      {[[5.4, -12.4, 0], [-5.4, -27.6, Math.PI]].map(([x, z, r], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
          <Box p={[0, 1.8, 0]} s={[0.12, 3.6, 0.12]} c="#2a2c31" m={0.5} />
          <Box p={[0, 3.9, 0.12]} s={[0.35, 0.95, 0.3]} c="#1b1c20" />
          {[0.28, 0, -0.28].map((dy, j) => (
            <mesh key={j} position={[0, 3.9 + dy, 0.28]}>
              <circleGeometry args={[0.1, 16]} />
              <meshBasicMaterial color={j === 0 ? new THREE.Color(3, 0.3, 0.2) : '#2a2a2a'} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      {city.map((b, i) => (
        <Building key={i} b={b} />
      ))}
      {/* street trees */}
      {[[-7.6, 24], [-7.6, 6], [-7.6, -40], [7.6, -46], [-7.6, -62], [7.6, -78], [-7.6, -95]].map(([x, z], i) => (
        <group key={i} position={[x, 0.15 + groundY(z), z]}>
          <mesh position={[0, 1.2, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.16, 2.4, 6]} />
            <meshStandardMaterial color="#5a4030" flatShading />
          </mesh>
          <mesh position={[0, 3.1, 0]} castShadow>
            <icosahedronGeometry args={[1.25, 0]} />
            <meshStandardMaterial color="#5f8f3e" flatShading />
          </mesh>
        </group>
      ))}

      {/* café: table with a cup that never moves */}
      <group position={[7.1, 0.15, -6]}>
        <Box p={[0, 0.72, 0]} s={[0.04, 0.04, 0.04]} c="#333" />
        <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.38, 0.38, 0.03, 24]} />
          <meshStandardMaterial color="#e8e4dc" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.37, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.72, 8]} />
          <meshStandardMaterial color="#2a2c31" metalness={0.6} />
        </mesh>
        <mesh position={[0.08, 0.8, 0.05]} castShadow>
          <cylinderGeometry args={[0.04, 0.034, 0.09, 16]} />
          <meshStandardMaterial color="#f7f4ee" roughness={0.3} />
        </mesh>
        <mesh position={[0.08, 0.758, 0.05]}>
          <cylinderGeometry args={[0.065, 0.065, 0.008, 20]} />
          <meshStandardMaterial color="#f7f4ee" roughness={0.3} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[0, 0, s * 0.62]}>
            <Box p={[0, 0.45, 0]} s={[0.42, 0.04, 0.42]} c="#3b3f46" m={0.4} />
            <Box p={[0, 0.72, s * 0.2]} s={[0.42, 0.5, 0.04]} c="#3b3f46" m={0.4} />
          </group>
        ))}
      </group>

      {/* hanging sign: screws back out, then it drops */}
      <group position={[8.45, signY, -9]} rotation={[signTilt * 0.6, 0, signTilt]}>
        <Box p={[0.04, 0, 0]} s={[0.06, 0.32, 0.22]} c="#2a2c31" m={0.5} />
        {[0.09, -0.09].map((dy) => (
          <mesh key={dy} position={[0.08 + unscrew * 0.07, dy, 0]} rotation={[unscrew * 40, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.012, 0.08, 8]} />
            <meshStandardMaterial color="#c9ccd2" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
        <Box p={[-0.5, 0.1, 0]} s={[1.0, 0.05, 0.05]} c="#2a2c31" m={0.5} />
        <group position={[-0.62, -0.32, 0]}>
          <Box p={[0, 0, 0]} s={[0.05, 0.62, 0.95]} c="#1f6f5c" e="#1f6f5c" ei={0.2} />
          <mesh position={[0.03, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.8, 0.42]} />
            <meshBasicMaterial map={useCafeTex()} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </group>

      {/* hanging basket on a knotted rope */}
      <group position={[7.9, 0, -12.2]}>
        <mesh position={[0, 2.95 - (knotT > 0 ? 0.25 : 0), 0]}>
          <cylinderGeometry args={[0.008, 0.008, knotT > 0 ? 0.3 : 0.75, 4]} />
          <meshStandardMaterial color="#c9b38a" />
        </mesh>
        <mesh position={[0, 2.55, 0]} visible={knotT <= 0}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial color="#c9b38a" />
        </mesh>
        <group position={[0, basketY, 0]} rotation={[knotT * 1.5, 0, knotT * 0.8]}>
          <mesh>
            <sphereGeometry args={[0.24, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
            <meshStandardMaterial color="#8a5a32" side={THREE.DoubleSide} flatShading />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <icosahedronGeometry args={[0.24, 0]} />
            <meshStandardMaterial color="#d6405a" flatShading />
          </mesh>
        </group>
      </group>

      {/* cars */}
      <Car x={2.5} z={c1z} rotY={Math.PI} color="#c0392b" />
      <Car x={c2[0]} z={c2[1]} rotY={c2[2]} color="#ecf0f1" />
      <Car x={-2.5} z={c3z} rotY={0} color="#2e86c1" />
      <Car x={-2.5} z={c4z} rotY={0} color="#27ae60" lights={0.4} />
      <Car x={3.9} z={12} rotY={Math.PI} color="#6b6e76" />
      <Car x={-3.9} z={22} rotY={0} color="#d98a1c" />
      {hillCars.map((h, i) => {
        const z = hillSlide(h.z0);
        return (
          <group key={i} position={[h.x, groundY(z), z]} rotation={[SLOPE, 0, 0]}>
            <Car x={0} z={0} rotY={Math.PI} color={h.col} />
          </group>
        );
      })}
      {[-130, -146, -160].map((z0, i) => {
        const z = hillSlide(z0);
        return (
          <group key={i} position={[5.4, groundY(z) + 0.15, z]} rotation={[SLOPE, i, 0]}>
            <Box p={[0, 0.5, 0]} s={[0.6, 1.0, 0.6]} c={['#2e6b3a', '#2d4f9c', '#5a5f6b'][i]} />
          </group>
        );
      })}

      <RoofHouses pt={p} />
      <Scaffold pt={p} />
      <Hills pt={p} />
      <Skyline pt={p} t={t} />
      <CityBlocks />
      <Dust amount={dust} t={t} />
      {glow > 0.01 && (() => {
        const cp = contactPoints(p);
        const tyres: number[] = [];
        const addCar = (x: number, z: number, yaw: number) => {
          for (const [lx, lz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
            tyres.push(x + lx * Math.cos(yaw) + lz * Math.sin(yaw), 0.05, z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
          }
        };
        addCar(2.5, c1z, Math.PI);
        addCar(c2[0], c2[1], c2[2]);
        addCar(-2.5, c3z, 0);
        addCar(-2.5, c4z, 0);
        addCar(3.9, 12, Math.PI);
        addCar(-3.9, 22, 0);
        const feet = [7.3, 0.2, pz1, -6.8, 0.2, pz3, 7.9, 0.2, -6.6, -6.4, 0.2, -11.2, -6.9, 0.2, -11.8];
        return (
          <>
            <Glow points={[...cp.near, ...tyres, ...feet]} size={0.7} amount={glow} />
            <Glow points={cp.far} size={9} amount={glow * 0.9} />
          </>
        );
      })()}

      {/* people */}
      <Faller x={7.3} y={0.15} z={pz1} rotY={0} spread={spread1} fall={fall1} dir={1} walk={p < 0 ? t * 6.5 : undefined} shirt="#3c6fd8" arms={fall1 * 2.2} />
      <Faller x={-6.8} y={0.15} z={pz3} rotY={Math.PI} spread={p > 0 ? Math.min(1.1, 2 * p) : 0} fall={fall3} dir={-1} walk={p < 0 ? t * 10 : undefined} shirt="#e2483d" pants="#22252c" skin="#a8714f" arms={fall3 * 2.5} />
      <Person pos={[7.9, 0.15, -6.6]} rotY={-Math.PI / 2} shirt="#8b4fd1" skin="#f0c8a8" hair="#5a3a20" armR={free ? 0.5 + Math.sin(t * 3) * 0.2 : 0.1} armL={free ? 0.6 : 0.1} />
      <Person pos={[-6.4, 0.15, -11.2]} rotY={Math.PI / 2} shirt="#2e9d6a" skin="#d9a27a" />
      <Person pos={[-6.9, 0.15, -11.8]} rotY={Math.PI / 2 + 0.3} shirt="#d9a23a" skin="#7a4f35" hair="#141010" />

      {/* you */}
      {me?.show && <Faller x={me.x} y={0.15} z={me.z} rotY={Math.PI} spread={me.spread} fall={me.fall} dir={1} shirt="#2b3f5c" pants="#4a6a9a" shoes="#f2f2f0" legsOnly />}
      {hand && <PovHand cam={cam} drop={Math.max(0, p)} screen={screen} />}
    </ThreeCanvas>
  );
};

let cafeTex: THREE.CanvasTexture | null = null;
function useCafeTex() {
  if (cafeTex) return cafeTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 136;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f6f5c';
  g.fillRect(0, 0, 256, 136);
  g.fillStyle = '#f4ead6';
  g.font = '800 64px Inter, sans-serif';
  g.textAlign = 'center';
  g.fillText('CAFÉ', 128, 90);
  cafeTex = new THREE.CanvasTexture(c);
  cafeTex.colorSpace = THREE.SRGBColorSpace;
  return cafeTex;
}
