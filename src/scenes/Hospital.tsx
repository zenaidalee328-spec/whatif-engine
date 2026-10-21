import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig } from './common3d';

// Hospital room: x∈[-2.5,2.5], z∈[-3,3], height 2.8. Bed along z at x=0, head at z=-2.4, foot at z=-0.3.
// POV lying in the bed: eye ≈ [0, 1.0, -2.0], looking toward the foot (+z). Monitor on the right (x≈+0.95, z≈-1.9).
const Box: React.FC<{ p: [number, number, number]; s: [number, number, number]; c: string; r?: number; m?: number }> = ({ p, s, c, r = 0.8, m = 0 }) => (
  <mesh position={p}>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} roughness={r} metalness={m} />
  </mesh>
);

const useEcg = () =>
  useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 320;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { c, tex };
  }, []);

const beat = (u: number) => {
  // one heartbeat shape over u∈[0,1)
  if (u < 0.1) return 0.08 * Math.sin((u / 0.1) * Math.PI);
  if (u < 0.16) return 0;
  if (u < 0.19) return -0.15 * ((u - 0.16) / 0.03);
  if (u < 0.22) return -0.15 + 1.15 * ((u - 0.19) / 0.03);
  if (u < 0.26) return 1 - 1.35 * ((u - 0.22) / 0.04);
  if (u < 0.29) return -0.35 + 0.35 * ((u - 0.26) / 0.03);
  if (u < 0.45) return 0;
  if (u < 0.6) return 0.2 * Math.sin(((u - 0.45) / 0.15) * Math.PI);
  return 0;
};

export type HospitalProps = { t: number; cam: CamProps; bpm?: number; temp?: number /* omit to hide */; dim?: number; flicker?: number };

export const HospitalScene: React.FC<HospitalProps> = ({ t, cam, bpm = 96, temp, dim = 0, flicker = 0 }) => {
  const { width, height } = useVideoConfig();
  const ecg = useEcg();
  // draw the monitor
  const g = ecg.c.getContext('2d')!;
  g.fillStyle = '#050a08';
  g.fillRect(0, 0, 512, 320);
  g.strokeStyle = '#2bff8a';
  g.lineWidth = 3;
  g.beginPath();
  const span = 4; // seconds across the screen
  for (let x = 0; x <= 512; x += 2) {
    const ts = t - span + (x / 512) * span;
    const u = ((ts * bpm) / 60) % 1;
    const y = 130 - beat((u + 1) % 1) * 85;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.fillStyle = '#2bff8a';
  g.font = '800 64px Inter, sans-serif';
  g.fillText(`${Math.round(bpm)}`, 24, 290);
  g.font = '600 22px Inter, sans-serif';
  g.fillText('HR', 24, 222);
  if (temp !== undefined) {
    g.fillStyle = '#6fc8ff';
    g.fillText('TEMP', 280, 222);
    g.font = '800 64px Inter, sans-serif';
    g.fillText(`${temp.toFixed(1)}°`, 280, 290);
  }
  ecg.tex.needsUpdate = true;

  const fl = flicker > 0 && Math.sin(t * 23) > 1 - flicker * 0.6 ? 0.35 : 1;
  const L = (1 - dim * 0.65) * fl;
  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: cam.fov ?? 60, position: [0, 1.0, -2.0], near: 0.03, far: 60 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
    >
      <CameraRig {...cam} />
      <color attach="background" args={['#05060a']} />
      <ambientLight intensity={0.35 * L + 0.05} color="#e8f4f0" />
      <hemisphereLight args={['#ffffff', '#7a8a84', 0.55 * L]} />
      <pointLight position={[0, 2.7, -0.5]} intensity={5 * L} distance={9} decay={1.4} color="#f2fbff" />
      <pointLight position={[0.8, 1.45, -1.45]} intensity={0.6} distance={2} decay={1.5} color="#2bff8a" />
      {/* shell */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5, 6]} />
        <meshStandardMaterial color="#b9c2bf" roughness={0.6} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 2.8, 0]}>
        <planeGeometry args={[5, 6]} />
        <meshStandardMaterial color="#e9ece9" />
      </mesh>
      {[
        { p: [0, 1.4, -3] as [number, number, number], r: 0 },
        { p: [0, 1.4, 3] as [number, number, number], r: Math.PI },
        { p: [-2.5, 1.4, 0] as [number, number, number], r: Math.PI / 2 },
        { p: [2.5, 1.4, 0] as [number, number, number], r: -Math.PI / 2 },
      ].map((w, i) => (
        <mesh key={i} position={w.p} rotation={[0, w.r, 0]}>
          <planeGeometry args={[i < 2 ? 5 : 6, 2.8]} />
          <meshStandardMaterial color="#d3e0da" roughness={0.9} />
        </mesh>
      ))}
      {/* ceiling lights */}
      {[-1.4, 0.6, 2.2].map((z) => (
        <mesh key={z} position={[0, 2.79, z]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.6, 1.2]} />
          <meshBasicMaterial color={new THREE.Color(1.5 * L, 1.55 * L, 1.55 * L)} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* curtain rail + curtain (left) */}
      <Box p={[-1.3, 2.7, 0]} s={[0.04, 0.04, 5]} c="#9aa3a8" m={0.6} />
      {Array.from({ length: 14 }).map((_, i) => (
        <mesh key={i} position={[-1.3 + Math.sin(i * 1.3) * 0.05, 1.55, -1.2 + i * 0.22]}>
          <boxGeometry args={[0.05, 2.25, 0.2]} />
          <meshStandardMaterial color="#9fc6c2" roughness={1} />
        </mesh>
      ))}
      {/* bed */}
      <Box p={[0, 0.45, -1.35]} s={[1.0, 0.25, 2.2]} c="#c9ced3" m={0.3} r={0.5} />
      <Box p={[0, 0.66, -1.35]} s={[0.92, 0.16, 2.1]} c="#f3f5f6" r={1} />
      <Box p={[0, 0.78, -1.0]} s={[0.96, 0.14, 1.4]} c="#8db7cf" r={1} />
      <mesh position={[0.05, 0.86, -0.55]} scale={[1, 0.4, 1]}>
        <sphereGeometry args={[0.18, 10, 8]} />
        <meshStandardMaterial color="#8db7cf" roughness={1} />
      </mesh>
      <mesh position={[-0.2, 0.86, -0.55]} scale={[1, 0.4, 1]}>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshStandardMaterial color="#8db7cf" roughness={1} />
      </mesh>
      <Box p={[0, 0.85, -0.22]} s={[1.02, 0.5, 0.05]} c="#b9c0c6" m={0.4} r={0.4} />
      {[-0.52, 0.52].map((x) => (
        <Box key={x} p={[x, 0.9, -1.2]} s={[0.03, 0.12, 1.2]} c="#aab2b8" m={0.6} r={0.3} />
      ))}
      {/* monitor on a stand (right of the head) */}
      <Box p={[0.95, 0.62, -1.3]} s={[0.05, 1.24, 0.05]} c="#5a6066" m={0.5} />
      <group position={[0.95, 1.45, -1.3]} rotation={[0, -2.2, 0]}>
        <Box p={[0, 0, -0.03]} s={[0.52, 0.36, 0.06]} c="#2a2e33" />
        <mesh position={[0, 0, 0.001]}>
          <planeGeometry args={[0.46, 0.29]} />
          <meshBasicMaterial map={ecg.tex} toneMapped={false} />
        </mesh>
      </group>
      {/* IV pole (left) */}
      <Box p={[-0.8, 1.0, -1.7]} s={[0.03, 2.0, 0.03]} c="#9aa3a8" m={0.7} r={0.3} />
      <mesh position={[-0.8, 1.75, -1.62]}>
        <boxGeometry args={[0.16, 0.24, 0.05]} />
        <meshStandardMaterial color="#e6f4ff" transparent opacity={0.7} roughness={0.1} />
      </mesh>
      <mesh position={[-0.45, 1.3, -1.75]} rotation={[0, 0, -0.9]}>
        <cylinderGeometry args={[0.005, 0.005, 1.0, 4]} />
        <meshBasicMaterial color="#d8e4ea" />
      </mesh>
      {/* far wall: door, clock, window */}
      <Box p={[1.4, 1.05, 2.97]} s={[0.95, 2.1, 0.05]} c="#8a9aa6" />
      <mesh position={[-0.6, 2.2, 2.96]} rotation={[0, Math.PI, 0]}>
        <circleGeometry args={[0.18, 24]} />
        <meshStandardMaterial color="#f4f4f0" />
      </mesh>
      <mesh position={[-1.4, 1.5, 2.96]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.0, 0.9]} />
        <meshBasicMaterial color="#141c38" />
      </mesh>
      <Box p={[0.2, 1.6, 2.95]} s={[0.7, 0.42, 0.04]} c="#15171c" />
    </ThreeCanvas>
  );
};
