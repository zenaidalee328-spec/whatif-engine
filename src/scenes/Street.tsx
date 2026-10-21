import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, Person, SkyDome, hash, skyAt } from './common3d';

// A low-poly suburban street running along -z. Road x in [-3.5, 3.5], sidewalks to |x| = 6.
const HOUSE_COLS = ['#e8d5b5', '#c9dbe8', '#e8c4b8', '#d6e3c8', '#f0e6d2', '#d9cbe6'];
const ROOF_COLS = ['#8a3b32', '#4a4f63', '#6b4a35', '#3e5a4a'];

const House: React.FC<{ x: number; z: number; i: number; side: number }> = ({ x, z, i, side }) => {
  const w = 6 + hash(i) * 2.5, d = 6 + hash(i + 3) * 2, h = 3.2 + hash(i + 5) * 2.4;
  const c = HOUSE_COLS[Math.floor(hash(i + 9) * HOUSE_COLS.length)];
  const r = ROOF_COLS[Math.floor(hash(i + 11) * ROOF_COLS.length)];
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[d, h, w]} />
        <meshStandardMaterial color={c} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 1.1, 0]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.01, d * 0.78, 2.2, 4, 1]} />
        <meshStandardMaterial color={r} flatShading />
      </mesh>
      {/* door + windows facing the street */}
      <mesh position={[-side * (d / 2 + 0.01), 1.0, 0]} rotation={[0, -side * Math.PI / 2, 0]}>
        <planeGeometry args={[1.0, 2.0]} />
        <meshStandardMaterial color="#5a3b2a" />
      </mesh>
      {[-1.8, 1.8].map((wz) => (
        <mesh key={wz} position={[-side * (d / 2 + 0.01), 2.0, wz]} rotation={[0, -side * Math.PI / 2, 0]}>
          <planeGeometry args={[1.1, 1.0]} />
          <meshStandardMaterial color="#a9c7e0" roughness={0.2} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
};

const Tree: React.FC<{ x: number; z: number; s: number }> = ({ x, z, s }) => (
  <group position={[x, 0, z]} scale={s}>
    <mesh position={[0, 1.0, 0]} castShadow>
      <cylinderGeometry args={[0.12, 0.16, 2.0, 6]} />
      <meshStandardMaterial color="#6b4a32" flatShading />
    </mesh>
    <mesh position={[0, 2.6, 0]} castShadow>
      <icosahedronGeometry args={[1.2, 0]} />
      <meshStandardMaterial color="#4f8f45" flatShading />
    </mesh>
  </group>
);

export const Car: React.FC<{ x: number; z: number; rotY: number; color: string; lights?: number }> = ({ x, z, rotY, color, lights = 0 }) => (
  <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
    <mesh position={[0, 0.55, 0]} castShadow>
      <boxGeometry args={[1.8, 0.7, 4.2]} />
      <meshStandardMaterial color={color} flatShading roughness={0.4} metalness={0.3} />
    </mesh>
    <mesh position={[0, 1.15, -0.2]} castShadow>
      <boxGeometry args={[1.6, 0.55, 2.2]} />
      <meshStandardMaterial color="#26303d" roughness={0.2} metalness={0.4} />
    </mesh>
    {[[-0.8, 1.4], [0.8, 1.4], [-0.8, -1.4], [0.8, -1.4]].map(([wx, wz], i) => (
      <mesh key={i} position={[wx, 0.32, wz]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.32, 0.32, 0.25, 12]} />
        <meshStandardMaterial color="#141414" />
      </mesh>
    ))}
    {[-0.6, 0.6].map((lx) => (
      <mesh key={lx} position={[lx, 0.62, 2.11]}>
        <planeGeometry args={[0.38, 0.18]} />
        <meshBasicMaterial color={new THREE.Color(1 + lights * 2, 1 + lights * 2, 0.85 + lights)} toneMapped={false} />
      </mesh>
    ))}
  </group>
);

export const StreetScene: React.FC<{
  clock: number;
  cam: CamProps;
  cars: { x: number; z: number; rotY: number; color: string; lights?: number }[];
  walkers: { x: number; z: number; rotY: number; phase: number; shirt: string }[];
}> = ({ clock, cam, cars, walkers }) => {
  const { width, height } = useVideoConfig();
  const sky = skyAt(clock);
  const houses = useMemo(() => {
    const out: { x: number; z: number; i: number; side: number }[] = [];
    for (let k = 0; k < 18; k++) {
      out.push({ x: 12.5, z: 10 - k * 10, i: k * 2, side: 1 });
      out.push({ x: -12.5, z: 6 - k * 10, i: k * 2 + 1, side: -1 });
    }
    return out;
  }, []);
  return (
    <ThreeCanvas
      width={width}
      height={height}
      shadows
      camera={{ fov: cam.fov ?? 62, position: [4, 1.7, 8], near: 0.05, far: 400 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <CameraRig pos={cam.pos} look={cam.look} fov={cam.fov ?? 62} roll={cam.roll} />
      <SkyDome top={sky.top} bottom={sky.bottom} stars={1 - sky.day} />
      <fog attach="fog" args={[sky.bottom.getStyle(), 40, 160]} />
      <hemisphereLight args={[sky.top, '#5a5a48', 0.6]} />
      <directionalLight
        position={[25, 30, 15]}
        intensity={2.6 * sky.day + 0.3}
        color="#ffe6c4"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0005}
      />
      {/* ground: grass, road, sidewalks */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#6f9a55" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -60]} receiveShadow>
        <planeGeometry args={[7, 260]} />
        <meshStandardMaterial color="#3a3d42" roughness={0.95} />
      </mesh>
      {[-4.75, 4.75].map((x) => (
        <mesh key={x} position={[x, 0.08, -60]} receiveShadow>
          <boxGeometry args={[2.5, 0.16, 260]} />
          <meshStandardMaterial color="#b9b6ae" roughness={0.95} />
        </mesh>
      ))}
      {/* lane dashes */}
      {Array.from({ length: 60 }).map((_, k) => (
        <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 20 - k * 4.4]}>
          <planeGeometry args={[0.15, 2.2]} />
          <meshStandardMaterial color="#e8e2c8" />
        </mesh>
      ))}
      {/* crosswalk at z = -40 */}
      {Array.from({ length: 8 }).map((_, k) => (
        <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[-3.06 + k * 0.875, 0.025, -40]}>
          <planeGeometry args={[0.5, 3.2]} />
          <meshStandardMaterial color="#f2f0ea" />
        </mesh>
      ))}
      {houses.map((h, i) => (
        <House key={i} {...h} />
      ))}
      {Array.from({ length: 20 }).map((_, k) => (
        <React.Fragment key={k}>
          <Tree x={7.2} z={14 - k * 9 + hash(k) * 2} s={0.9 + hash(k + 1) * 0.4} />
          <Tree x={-7.2} z={9 - k * 9 + hash(k + 40) * 2} s={0.9 + hash(k + 41) * 0.4} />
        </React.Fragment>
      ))}
      {/* parked cars */}
      <Car x={2.6} z={-14} rotY={0} color="#c0392b" />
      <Car x={-2.6} z={-24} rotY={Math.PI} color="#2e86c1" />
      <Car x={2.6} z={-58} rotY={0} color="#f1c40f" />
      {cars.map((c, i) => (
        <Car key={i} {...c} />
      ))}
      {walkers.map((w, i) => (
        <Person key={i} pos={[w.x, 0.16, w.z]} rotY={w.rotY} walk={w.phase} shirt={w.shirt} />
      ))}
    </ThreeCanvas>
  );
};
