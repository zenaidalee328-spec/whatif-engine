import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, Person, SkyDome, hash, skyAt } from './common3d';
import { Car } from './Street';

// City street at night along -z. Road x∈[-4,4], sidewalks |x|∈[4,7] (y=0.15), facades from |x|=7.5.
// Lamp posts at x=±4.6 every 14 m (z = 18 .. -122). Walk the right sidewalk at x≈5.5.
const LAMP_ZS = Array.from({ length: 11 }, (_, i) => 18 - i * 14);

type Facade = { x: number; z: number; len: number; h: number; c: string; side: number };
const buildFacades = () => {
  const out: Facade[] = [];
  const wins: { p: THREE.Vector3; rotY: number; lit: number; warm: number }[] = [];
  for (const side of [-1, 1]) {
    let z = 30;
    let k = side > 0 ? 0 : 500;
    while (z > -140) {
      k++;
      const len = 8 + hash(k) * 8;
      const h = 8 + hash(k + 3) * 18;
      const shade = 0.16 + hash(k + 5) * 0.12;
      out.push({ x: side * 10.5, z: z - len / 2, len: len - 0.4, h, c: new THREE.Color(shade, shade * 0.96, shade * 1.08).getStyle(), side });
      const floors = Math.floor((h - 1.5) / 2.8);
      for (let f = 0; f < floors; f++) {
        const n = Math.floor((len - 1) / 2.2);
        for (let c = 0; c < n; c++) {
          const s = k * 1000 + f * 31 + c;
          wins.push({ p: new THREE.Vector3(side * 7.49, 2.2 + f * 2.8, z - 1.2 - c * 2.2), rotY: side > 0 ? -Math.PI / 2 : Math.PI / 2, lit: hash(s), warm: hash(s + 0.3) });
        }
      }
      z -= len;
    }
  }
  return { out, wins };
};
let cache: ReturnType<typeof buildFacades> | null = null;

let poolTex: THREE.CanvasTexture | null = null;
const pool = () => {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  poolTex = new THREE.CanvasTexture(c);
  return poolTex;
};

/** a lamp post built from stacked segments so it can bend */
const LampPost: React.FC<{ x: number; z: number; side: number; bend: number; t: number; seed: number; on: number }> = ({ x, z, side, bend, t, seed, on }) => {
  const N = 6;
  const segH = 0.85;
  const b = (i: number) => bend * (0.1 * Math.sin(t * 0.9 + seed * 1.7 + i * 0.6) + 0.05 * side);
  let node: React.ReactNode = (
    <group>
      <mesh position={[-side * 0.45, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.9, 6]} />
        <meshStandardMaterial color="#26292f" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[-side * 0.9, -0.05, 0]}>
        <boxGeometry args={[0.36, 0.1, 0.22]} />
        <meshStandardMaterial color="#26292f" />
      </mesh>
      <mesh position={[-side * 0.9, -0.12, 0]}>
        <boxGeometry args={[0.3, 0.05, 0.17]} />
        <meshBasicMaterial color={new THREE.Color(4 * on, 3.1 * on, 1.8 * on)} toneMapped={false} />
      </mesh>
      <mesh position={[-side * 0.9, -0.2, 0]}>
        <sphereGeometry args={[0.55, 16, 12]} />
        <meshBasicMaterial color="#ffb060" transparent opacity={0.22 * on} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh position={[-side * 0.9, -0.2, 0]}>
        <sphereGeometry args={[1.3, 16, 12]} />
        <meshBasicMaterial color="#ff9a40" transparent opacity={0.07 * on} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
  for (let i = N - 1; i >= 0; i--) {
    node = (
      <group position={[0, i === 0 ? 0 : segH, 0]} rotation={[b(i) * 0.4, 0, b(i)]}>
        <mesh position={[0, segH / 2, 0]}>
          <cylinderGeometry args={[0.06 - i * 0.005, 0.07 - i * 0.005, segH, 8]} />
          <meshStandardMaterial color="#5a5e68" metalness={0.4} roughness={0.5} />
        </mesh>
        {i === N - 1 ? <group position={[0, segH, 0]}>{node}</group> : node}
      </group>
    );
  }
  return (
    <group position={[x, 0.15, z]}>
      {node}
      {/* light pool on the ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-side * 0.9, 0.02, 0]}>
        <planeGeometry args={[7, 7]} />
        <meshBasicMaterial map={pool()} color={new THREE.Color(1.0 * on, 0.72 * on, 0.4 * on)} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
};

export type NightStreetProps = {
  t: number;
  cam: CamProps;
  clock?: number;
  bend?: number; // 0..1 lamp posts bend and sway
  flicker?: number; // 0..1 lamps flicker
  shadows?: { x: number; z?: number; follow?: number; opacity?: number; stretch?: number }[]; // follow = distance from camera along z (+ = behind you)
  cars?: { x: number; z: number; speed?: number; color?: string }[];
};

export const NightStreetScene: React.FC<NightStreetProps> = ({ t, cam, clock = 2.5, bend = 0, flicker = 0, shadows = [], cars = [] }) => {
  const { width, height } = useVideoConfig();
  const data = (cache ??= buildFacades());
  const sky = skyAt(clock);
  const winGeo = useMemo(() => new THREE.PlaneGeometry(1.1, 1.3), []);
  const winMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const inst = useMemo(() => {
    const m = new THREE.InstancedMesh(winGeo, winMat, data.wins.length);
    const o = new THREE.Object3D();
    data.wins.forEach((w, i) => {
      o.position.copy(w.p);
      o.rotation.set(0, w.rotY, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      const c = w.lit < 0.22 ? new THREE.Color(1.3, 0.85 + w.warm * 0.2, 0.45 + w.warm * 0.2) : new THREE.Color('#0b0d14');
      m.setColorAt(i, c);
    });
    return m;
  }, [data, winGeo, winMat]);
  const camZ = cam.pos[2];
  // the 4 lamps nearest the camera get real point lights
  const near = [...LAMP_ZS.flatMap((z) => [[4.6, z], [-4.6, z]] as [number, number][])]
    .sort((a, b) => Math.abs(a[1] - camZ + 6) - Math.abs(b[1] - camZ + 6))
    .slice(0, 4);
  const lampOn = (i: number) => (flicker > 0 && hash(i * 5.1) < 0.35 ? (Math.sin(t * (13 + i * 2.3)) > 0.6 - flicker * 1.2 ? 1 : 0.1) : 1);
  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: cam.fov ?? 62, position: [5.5, 1.68, 10], near: 0.05, far: 300 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.15;
      }}
    >
      <CameraRig {...cam} />
      <SkyDome top={sky.top} bottom={sky.bottom} stars={1 - sky.day} />
      <fog attach="fog" args={['#0b0f22', 18, 110]} />
      <ambientLight intensity={0.4} color="#7d8cff" />
      <hemisphereLight args={['#3a4a9a', '#1a1410', 0.35]} />
      {near.map(([x, z], i) => (
        <pointLight key={i} position={[x - Math.sign(x) * 0.9, 4.9, z]} intensity={16} distance={20} decay={1.5} color="#ffbe78" />
      ))}
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -50]}>
        <planeGeometry args={[60, 220]} />
        <meshStandardMaterial color="#1c1e24" roughness={0.55} metalness={0.25} />
      </mesh>
      {[-5.5, 5.5].map((x) => (
        <mesh key={x} position={[x, 0.075, -50]}>
          <boxGeometry args={[3, 0.15, 220]} />
          <meshStandardMaterial color="#4a4a4e" roughness={0.9} />
        </mesh>
      ))}
      {Array.from({ length: 50 }).map((_, k) => (
        <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 25 - k * 4.4]}>
          <planeGeometry args={[0.14, 2.2]} />
          <meshStandardMaterial color="#c9c3a8" />
        </mesh>
      ))}
      {data.out.map((f, i) => (
        <mesh key={i} position={[f.x, f.h / 2, f.z]}>
          <boxGeometry args={[6, f.h, f.len]} />
          <meshStandardMaterial color={f.c} roughness={0.95} />
        </mesh>
      ))}
      <primitive object={inst} />
      {LAMP_ZS.map((z, i) => (
        <React.Fragment key={i}>
          <LampPost x={4.6} z={z} side={1} bend={bend} t={t} seed={i} on={lampOn(i * 2)} />
          <LampPost x={-4.6} z={z - 7} side={-1} bend={bend} t={t} seed={i + 40} on={lampOn(i * 2 + 1)} />
        </React.Fragment>
      ))}
      <Car x={2.5} z={-16} rotY={0} color="#5a6270" />
      <Car x={-2.5} z={-37} rotY={Math.PI} color="#7a2a2a" />
      <Car x={2.5} z={-61} rotY={0} color="#2a3a5a" />
      {cars.map((c, i) => (
        <Car key={i} x={c.x} z={c.z + (c.speed ?? 0) * t} rotY={(c.speed ?? 0) < 0 ? Math.PI : 0} color={c.color ?? '#ddd'} lights={1} />
      ))}
      {shadows.map((s, i) => {
        const z = s.follow !== undefined ? camZ + s.follow : s.z ?? -20;
        return <Person key={i} pos={[s.x, 0.15, z]} rotY={s.follow !== undefined && s.follow > 0 ? Math.PI : 0} dark opacity={s.opacity ?? 0.9} stretch={s.stretch ?? 1.15} headTilt={Math.sin(t * 0.5 + i) * 0.12} />;
      })}
    </ThreeCanvas>
  );
};
