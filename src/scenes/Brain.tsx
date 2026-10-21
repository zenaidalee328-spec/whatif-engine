import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, hash, smooth } from './common3d';
import { fbm } from './noise';

// a point-cloud brain; a few "neurons" blink offline while the rest stay awake
const buildBrain = () => {
  const pts: number[] = [];
  const seeds: number[] = [];
  let k = 0;
  const add = (x: number, y: number, z: number) => {
    pts.push(x, y, z);
    seeds.push(hash(k++));
  };
  let tries = 0;
  while (pts.length / 3 < 7000 && tries < 200000) {
    tries++;
    const u = hash(tries * 3.1) * 2 - 1, v = hash(tries * 7.7) * 2 - 1, w = hash(tries * 1.3) * 2 - 1;
    // hemispheres: ellipsoid, keep points near the surface, wrinkled with noise
    const side = u < 0 ? -1 : 1;
    const x = u * 0.68, y = v * 0.78, z = w * 1.1;
    const cx = side * 0.34;
    const r = Math.hypot((x - cx) / 0.66, y / 0.78, z / 1.1);
    const wr = 0.06 * (fbm(x * 6, y * 6, z * 6, 3) - 0.5);
    if (r > 0.82 + wr && r < 0.98 + wr && Math.abs(x) > 0.035 && y > -0.55) add(x, y + 0.1, z);
  }
  // cerebellum + stem
  for (let i = 0; i < 900; i++) {
    const a = hash(i * 9.1) * Math.PI * 2, b = hash(i * 4.3) * Math.PI;
    add(Math.cos(a) * Math.sin(b) * 0.5, -0.5 + Math.cos(b) * 0.22, -0.72 + Math.sin(a) * Math.sin(b) * 0.3);
  }
  for (let i = 0; i < 300; i++) {
    const a = hash(i * 2.9) * Math.PI * 2;
    add(Math.cos(a) * 0.12, -0.6 - hash(i * 5.5) * 0.6, -0.35 + Math.sin(a) * 0.12);
  }
  return { pos: new Float32Array(pts), seeds };
};
let cache: ReturnType<typeof buildBrain> | null = null;

export const BrainScene: React.FC<{ t: number; offline: number; cam?: CamProps }> = ({ t, offline, cam }) => {
  const { width, height } = useVideoConfig();
  const data = (cache ??= buildBrain());
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(data.pos.length), 3));
    return g;
  }, [data]);
  const col = geo.attributes.color as THREE.BufferAttribute;
  const awake = new THREE.Color('#7fe3ff');
  const dim = new THREE.Color('#1a2440');
  const tmp = new THREE.Color();
  data.seeds.forEach((s, i) => {
    // each point twinkles; a subset blinks fully offline in short windows
    const tw = 0.75 + 0.25 * Math.sin(t * (2 + s * 5) + s * 40);
    const wave = Math.sin(t * (0.6 + s * 0.9) + s * 100);
    const off = offline * smooth(0.82, 0.9, wave);
    tmp.copy(awake).multiplyScalar(tw).lerp(dim, off);
    col.setXYZ(i, tmp.r, tmp.g, tmp.b);
  });
  col.needsUpdate = true;

  const ang = t * 0.12 + 0.6;
  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: 38, position: [0, 0, 4], near: 0.1, far: 50 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
    >
      {cam ? <CameraRig {...cam} /> : <CameraRig pos={[Math.sin(ang) * 3.6, 0.7 + Math.sin(t * 0.2) * 0.2, Math.cos(ang) * 3.6]} look={[0, -0.05, 0]} fov={38} />}
      <color attach="background" args={['#03050c']} />
      <points geometry={geo}>
        <pointsMaterial size={0.028} vertexColors sizeAttenuation transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      <points geometry={geo}>
        <pointsMaterial size={0.09} vertexColors sizeAttenuation transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </ThreeCanvas>
  );
};
