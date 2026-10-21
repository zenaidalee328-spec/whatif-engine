import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, Person, hash, skyAt } from './common3d';

// Meeting room: x∈[-3.5,3.5], z∈[-5,3], height 2.8. Long table along z (x=0, z -3.6..1.6, top y=0.76).
// POV seat at the near end: eye ≈ [0, 1.2, 2.3] looking at the screen on the back wall (z=-5).
const SEATS: { x: number; z: number; side: number }[] = [
  { x: -1.05, z: -3.0, side: -1 }, { x: -1.05, z: -1.8, side: -1 }, { x: -1.05, z: -0.6, side: -1 }, { x: -1.05, z: 0.6, side: -1 },
  { x: 1.05, z: -3.0, side: 1 }, { x: 1.05, z: -1.8, side: 1 }, { x: 1.05, z: -0.6, side: 1 }, { x: 1.05, z: 0.6, side: 1 },
];
const LOOKS = [
  { shirt: '#3c6fd8', skin: '#d9a27a', hair: '#2a1d16' },
  { shirt: '#e8e6e0', skin: '#a8714f', hair: '#1a1410' },
  { shirt: '#2e9d6a', skin: '#f0c8a8', hair: '#6a4a2a' },
  { shirt: '#5a5f6b', skin: '#7a4f35', hair: '#141010' },
  { shirt: '#c0567a', skin: '#e8b890', hair: '#3a2416' },
  { shirt: '#22344f', skin: '#d9a27a', hair: '#8a6a3a' },
  { shirt: '#d9a23a', skin: '#b07850', hair: '#1a1410' },
  { shirt: '#8b4fd1', skin: '#f0c8a8', hair: '#2a1d16' },
];

const chartTex = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f4f6fa';
    g.fillRect(0, 0, 640, 360);
    g.fillStyle = '#1b2a4a';
    g.font = '800 34px Inter, sans-serif';
    g.fillText('Q3 REVIEW', 36, 56);
    g.fillStyle = '#8a93a6';
    g.font = '500 20px Inter, sans-serif';
    g.fillText('Weekly numbers', 36, 86);
    const bars = [0.42, 0.55, 0.5, 0.68, 0.61, 0.8, 0.74];
    bars.forEach((b, i) => {
      g.fillStyle = i === 5 ? '#ff7a45' : '#3c6fd8';
      g.fillRect(60 + i * 78, 320 - b * 200, 46, b * 200);
    });
    g.strokeStyle = '#c9cfdb';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(40, 321);
    g.lineTo(610, 321);
    g.stroke();
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
})();

const Box: React.FC<{ p: [number, number, number]; s: [number, number, number]; c: string; r?: number; m?: number }> = ({ p, s, c, r = 0.8, m = 0 }) => (
  <mesh position={p}>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} roughness={r} metalness={m} />
  </mesh>
);

export type MeetingProps = {
  t: number;
  cam: CamProps;
  clock?: number;
  stare?: number; // 0..1 coworkers turn their heads to look at you
  spill?: number; // 0..1 your mug tips over
  talk?: number; // 0..1 presenter gestures
};

export const MeetingScene: React.FC<MeetingProps> = ({ t, cam, clock = 19, stare = 0, spill = 0, talk = 1 }) => {
  const { width, height } = useVideoConfig();
  const sky = skyAt(clock);
  const win = sky.top.clone().lerp(sky.bottom, 0.6);
  const city = useMemo(() => Array.from({ length: 16 }, (_, i) => ({ z: -4.6 + i * 0.5, h: 0.3 + hash(i * 7) * 1.1 })), []);
  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: cam.fov ?? 58, position: [0, 1.2, 2.3], near: 0.03, far: 80 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
    >
      <CameraRig {...cam} />
      <color attach="background" args={['#0a0b10']} />
      <ambientLight intensity={0.45} color="#f4f2ec" />
      <hemisphereLight args={['#ffffff', '#5a5450', 0.6]} />
      <pointLight position={[0, 2.6, -1]} intensity={4} distance={10} decay={1.3} color="#fff5e6" />
      <pointLight position={[0, 2.6, 2]} intensity={2} distance={7} decay={1.4} color="#fff5e6" />
      {/* floor, ceiling, walls */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -1]}>
        <planeGeometry args={[7, 8]} />
        <meshStandardMaterial color="#59606b" roughness={1} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 2.8, -1]}>
        <planeGeometry args={[7, 8]} />
        <meshStandardMaterial color="#e6e4df" />
      </mesh>
      <mesh position={[0, 1.4, -5]}>
        <planeGeometry args={[7, 2.8]} />
        <meshStandardMaterial color="#d7d4cc" />
      </mesh>
      <mesh position={[-3.5, 1.4, -1]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[8, 2.8]} />
        <meshStandardMaterial color="#cfd3d6" />
      </mesh>
      <mesh position={[0, 1.4, 3]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[7, 2.8]} />
        <meshStandardMaterial color="#d7d4cc" />
      </mesh>
      {/* window wall (x=+3.5) with dusk sky and a skyline */}
      <mesh position={[3.5, 1.45, -1]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[8, 2.2]} />
        <meshBasicMaterial color={win} toneMapped={false} />
      </mesh>
      {city.map((b, i) => (
        <mesh key={i} position={[3.49, 0.35 + b.h / 2, b.z]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.48, b.h]} />
          <meshBasicMaterial color="#1a1d2a" />
        </mesh>
      ))}
      {[-4.2, -2.6, -1.0, 0.6, 2.2].map((z) => (
        <Box key={z} p={[3.46, 1.45, z]} s={[0.06, 2.2, 0.06]} c="#3a3d44" />
      ))}
      <Box p={[3.46, 0.32, -1]} s={[0.08, 0.64, 8]} c="#c9c6bf" />
      {/* ceiling panels */}
      {[-3, -1, 1].map((z) => (
        <mesh key={z} position={[0, 2.79, z]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.2, 0.6]} />
          <meshBasicMaterial color={new THREE.Color(1.5, 1.48, 1.4)} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* screen */}
      <Box p={[0, 1.55, -4.96]} s={[2.1, 1.22, 0.05]} c="#15171c" />
      <mesh position={[0, 1.55, -4.93]}>
        <planeGeometry args={[2.0, 1.12]} />
        <meshBasicMaterial map={chartTex()} toneMapped={false} />
      </mesh>
      {/* table */}
      <Box p={[0, 0.74, -1.0]} s={[1.5, 0.05, 5.2]} c="#5b4232" r={0.45} />
      <Box p={[0, 0.37, -2.6]} s={[0.12, 0.72, 0.5]} c="#2a2a2e" />
      <Box p={[0, 0.37, 0.6]} s={[0.12, 0.72, 0.5]} c="#2a2a2e" />
      {/* laptops + papers */}
      {SEATS.map((s, i) => (
        <group key={i} position={[s.side * 0.5, 0.77, s.z]} rotation={[0, s.side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          {i % 3 !== 1 ? (
            <>
              <Box p={[0, 0.01, 0]} s={[0.34, 0.02, 0.24]} c="#b9bdc4" m={0.5} r={0.3} />
              <group position={[0, 0.0, -0.12]} rotation={[-0.3, 0, 0]}>
                <Box p={[0, 0.12, 0]} s={[0.34, 0.24, 0.015]} c="#b9bdc4" m={0.5} r={0.3} />
              </group>
            </>
          ) : (
            <Box p={[0, 0.005, 0]} s={[0.22, 0.01, 0.3]} c="#f4f2ec" />
          )}
        </group>
      ))}
      {/* chairs + coworkers */}
      {SEATS.map((s, i) => {
        const rotY = s.side < 0 ? Math.PI / 2 : -Math.PI / 2;
        const look = LOOKS[i];
        // head turns toward the POV end (+z) when they stare
        const turn = (s.side < 0 ? -1 : 1) * stare * (0.7 + 0.3 * hash(i)) + Math.sin(t * 0.6 + i) * 0.08 * (1 - stare);
        return (
          <group key={i}>
            <group position={[s.x - s.side * 0.12, 0, s.z]} rotation={[0, rotY, 0]}>
              <Box p={[0, 0.45, 0]} s={[0.48, 0.08, 0.46]} c="#1f2329" />
              <Box p={[0, 0.82, -0.24]} s={[0.46, 0.66, 0.07]} c="#1f2329" />
            </group>
            <Person pos={[s.x, 0, s.z]} rotY={rotY} pose="sit" {...look} headTurn={turn} headTilt={stare * -0.05} armR={0.9} armL={0.9} breathe={Math.sin(t * 1.5 + i)} />
          </group>
        );
      })}
      {/* presenter */}
      <Person pos={[-1.75, 0, -4.2]} rotY={0.35} shirt="#f2f2f2" pants="#22252c" skin="#c98e64" hair="#1a1410" armR={talk * (0.9 + Math.sin(t * 2.2) * 0.35)} elbowR={0.4} headTurn={stare * 0.25 + Math.sin(t * 0.8) * 0.15 * (1 - stare)} />
      {/* your mug (tips over with `spill`) */}
      <group position={[0.28, 0.765, 1.25]} rotation={[-spill * 1.45, 0, 0]}>
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.045, 0.04, 0.12, 16]} />
          <meshStandardMaterial color="#f4f1ea" roughness={0.4} />
        </mesh>
        <mesh position={[0.055, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.028, 0.009, 6, 12]} />
          <meshStandardMaterial color="#f4f1ea" />
        </mesh>
      </group>
      {spill > 0.6 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.28, 0.768, 1.08 - (spill - 0.6) * 0.2]}>
          <circleGeometry args={[0.04 + (spill - 0.6) * 0.35, 20]} />
          <meshStandardMaterial color="#3a1e0e" roughness={0.1} metalness={0.2} />
        </mesh>
      )}
    </ThreeCanvas>
  );
};
