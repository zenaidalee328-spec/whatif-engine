import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, Person, SkyDome, hash, skyAt } from './common3d';
import { Car } from './Street';

// City bus interior. Bus is static: x∈[-1.25,1.25], z∈[-6,6] (front at -z), floor y=0, ceiling y=2.3.
// The outside world scrolls past along +z at `speed` m/s. Seat eye height ≈ 1.2.
const SEAT_ZS = [-4.2, -3.35, -2.5, -1.65, -0.8, 0.05, 0.9, 1.75, 2.6, 3.45];
const SHIRTS = ['#e2483d', '#3c6fd8', '#2e9d6a', '#8b4fd1', '#d9a23a', '#4a4a55', '#c0567a'];

const Box: React.FC<{ p: [number, number, number]; s: [number, number, number]; c: string; r?: number; m?: number }> = ({ p, s, c, r = 0.8, m = 0 }) => (
  <mesh position={p}>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} roughness={r} metalness={m} flatShading />
  </mesh>
);

const Seat: React.FC<{ x: number; z: number }> = ({ x, z }) => (
  <group position={[x, 0, z]}>
    <Box p={[0, 0.44, 0]} s={[0.42, 0.1, 0.44]} c="#2d4f9c" />
    <Box p={[0, 0.78, 0.2]} s={[0.42, 0.62, 0.08]} c="#2d4f9c" />
    <Box p={[0, 0.22, 0]} s={[0.06, 0.44, 0.06]} c="#666" m={0.6} r={0.4} />
    <Box p={[0, 1.1, 0.22]} s={[0.4, 0.05, 0.05]} c="#f2c230" />
  </group>
);

export type BusProps = {
  t: number;
  cam: CamProps;
  clock?: number;
  speed?: number;
  passengers?: number[]; // seat indices: 0..19 left side (row*2, +1 = aisle), 20..39 right side (20+row*2 = aisle, +1 = window)
};

export const BusScene: React.FC<BusProps> = ({ t, cam, clock = 8.2, speed = 9, passengers = [1, 4, 7, 9, 20, 23, 27, 36] }) => {
  const { width, height } = useVideoConfig();
  const sky = skyAt(clock);
  const outside = useMemo(() => {
    const b: { x: number; z0: number; w: number; h: number; d: number; c: string; tree: boolean }[] = [];
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const tree = hash(i * 3.3) < 0.3;
      b.push({
        x: side * (tree ? 6.5 : 11 + hash(i) * 4),
        z0: i * 9.2,
        w: 6 + hash(i + 1) * 4,
        h: tree ? 0 : 6 + hash(i + 2) * 16,
        d: 6 + hash(i + 4) * 3,
        c: ['#c9b9a3', '#a7b4c4', '#d6c7b0', '#9aa0a8', '#c49a86', '#b8c2b0'][Math.floor(hash(i + 7) * 6)],
        tree,
      });
    }
    return b;
  }, []);
  const LOOP = 26 * 9.2;
  const wrap = (z0: number) => (((z0 + speed * t) % LOOP) + LOOP) % LOOP - LOOP * 0.6;
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.3, depthWrite: false }), []);
  const seats: [number, number][] = [];
  SEAT_ZS.forEach((z) => {
    seats.push([-0.95, z], [-0.5, z]);
  });
  SEAT_ZS.forEach((z) => {
    seats.push([0.5, z], [0.95, z]);
  });

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: cam.fov ?? 62, position: [0.95, 1.2, 1.0], near: 0.03, far: 400 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
    >
      <CameraRig {...cam} />
      <SkyDome top={sky.top} bottom={sky.bottom} stars={1 - sky.day} />
      <fog attach="fog" args={[sky.bottom.getStyle(), 30, 140]} />
      <hemisphereLight args={[sky.top, '#5a5a48', 0.7 + 0.4 * sky.day]} />
      <ambientLight intensity={0.35} color="#fff2e0" />
      <directionalLight position={[-20, 25, -10]} intensity={2.2 * sky.day + 0.2} color="#ffe6c4" />
      <pointLight position={[0, 2.1, 0]} intensity={2.2} distance={8} decay={1.5} color="#fff6e8" />

      {/* outside world */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#6f8a55" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.8, -0.59, 0]}>
        <planeGeometry args={[9, 400]} />
        <meshStandardMaterial color="#3d4045" roughness={0.95} />
      </mesh>
      {[-6.6, 3.0].map((x) => (
        <mesh key={x} position={[x, -0.52, 0]}>
          <boxGeometry args={[2.4, 0.16, 400]} />
          <meshStandardMaterial color="#b6b2aa" />
        </mesh>
      ))}
      {outside.map((o, i) => {
        const z = wrap(o.z0);
        return o.tree ? (
          <group key={i} position={[o.x, -0.6, z]}>
            <mesh position={[0, 1.2, 0]}>
              <cylinderGeometry args={[0.15, 0.2, 2.4, 6]} />
              <meshStandardMaterial color="#6b4a32" flatShading />
            </mesh>
            <mesh position={[0, 3.2, 0]}>
              <icosahedronGeometry args={[1.5, 0]} />
              <meshStandardMaterial color="#4f8f45" flatShading />
            </mesh>
          </group>
        ) : (
          <mesh key={i} position={[o.x + Math.sign(o.x) * o.d / 2, -0.6 + o.h / 2, z]}>
            <boxGeometry args={[o.d, o.h, o.w]} />
            <meshStandardMaterial color={o.c} roughness={0.9} flatShading />
          </mesh>
        );
      })}
      {Array.from({ length: 4 }).map((_, i) => (
        <Car key={i} x={-4.2} z={((i * 55 + t * (speed + 11)) % 220) - 140} rotY={0} color={['#c0392b', '#ecf0f1', '#2e86c1', '#f1c40f'][i]} />
      ))}

      {/* bus body */}
      <group>
        <Box p={[0, -0.05, 0]} s={[2.5, 0.1, 12]} c="#4a4d55" />
        <Box p={[0, 2.35, 0]} s={[2.5, 0.1, 12]} c="#e9e7e2" />
        {[-1.25, 1.25].map((x) => (
          <group key={x}>
            <Box p={[x, 0.45, 0]} s={[0.06, 0.9, 12]} c="#d9d6cf" />
            <Box p={[x, 2.12, 0]} s={[0.06, 0.45, 12]} c="#d9d6cf" />
            <mesh position={[x, 1.4, 0]} rotation={[0, Math.PI / 2, 0]} material={glass}>
              <planeGeometry args={[12, 1.0]} />
            </mesh>
            {Array.from({ length: 7 }).map((_, i) => (
              <Box key={i} p={[x, 1.4, -6 + i * 2]} s={[0.07, 1.0, 0.08]} c="#3a3d44" />
            ))}
          </group>
        ))}
        {/* windshield + back */}
        <mesh position={[0, 1.35, -6]} material={glass}>
          <planeGeometry args={[2.5, 1.5]} />
        </mesh>
        <Box p={[0, 0.3, -6]} s={[2.5, 0.6, 0.06]} c="#d9d6cf" />
        <Box p={[0, 1.15, 6]} s={[2.5, 2.3, 0.06]} c="#d9d6cf" />
        {/* aisle floor stripe */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
          <planeGeometry args={[0.55, 12]} />
          <meshStandardMaterial color="#6b6e76" />
        </mesh>
        {/* ceiling light strips */}
        {[-0.55, 0.55].map((x) => (
          <mesh key={x} position={[x, 2.29, 0]}>
            <boxGeometry args={[0.12, 0.02, 11]} />
            <meshBasicMaterial color={new THREE.Color(1.6, 1.55, 1.4)} toneMapped={false} />
          </mesh>
        ))}
        {/* yellow poles + rails */}
        {[-4.6, -2.9, -1.2, 0.5, 2.2, 3.9].map((z, i) => (
          <mesh key={i} position={[i % 2 ? 0.27 : -0.27, 1.15, z]}>
            <cylinderGeometry args={[0.025, 0.025, 2.3, 8]} />
            <meshStandardMaterial color="#f2c230" roughness={0.4} metalness={0.3} />
          </mesh>
        ))}
        {[-0.3, 0.3].map((x) => (
          <mesh key={x} position={[x, 1.95, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 11, 8]} />
            <meshStandardMaterial color="#c9ccd2" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        {/* driver area + route sign */}
        <Box p={[-0.8, 0.6, -5.4]} s={[0.8, 1.2, 0.6]} c="#3a3d44" />
        <mesh position={[0, 2.12, -5.92]}>
          <planeGeometry args={[1.4, 0.24]} />
          <meshBasicMaterial color={new THREE.Color(1.6, 0.8, 0.1)} toneMapped={false} />
        </mesh>
        {seats.map(([x, z], i) => (
          <Seat key={i} x={x} z={z} />
        ))}
        {passengers.map((si, i) => {
          const s = seats[si];
          if (!s) return null;
          return (
            <Person
              key={i}
              pos={[s[0], 0, s[1] - 0.08]}
              rotY={Math.PI}
              pose="sit"
              shirt={SHIRTS[i % SHIRTS.length]}
              hair={i % 3 ? '#2a1d16' : '#5a3a20'}
              skin={['#d9a27a', '#a8714f', '#f0c8a8', '#7a4f35'][i % 4]}
              headTilt={Math.sin(t * 0.7 + i) * 0.05}
              headTurn={Math.sin(t * 0.3 + i * 2) * 0.3}
            />
          );
        })}
      </group>
    </ThreeCanvas>
  );
};
