import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, Person, hash } from './common3d';

// A long supermarket aisle running along -z. Shelves face each other at x = ±AISLE.
// Walkable z range ≈ +10 .. -40. Ceiling at y = 3.6.
const AISLE = 1.45;
const Z0 = 12, Z1 = -42;
const LEVELS = [0.12, 0.52, 0.92, 1.32, 1.72];
const BRAND = ['#c8382f', '#e9a93a', '#2f6fc0', '#f1ede4', '#3a9455', '#6b3fa8', '#e0742c', '#1c2a4a', '#d65c86', '#b9a27a', '#2a9d99', '#8e2a24', '#5a3a26', '#e8d34a'];

type Inst = { m: THREE.Matrix4; c: THREE.Color }[];

const buildShelves = () => {
  const prods: Inst = [];
  const labels: Inst = [];
  const tags: Inst = [];
  const o = new THREE.Object3D();
  let k = 0;
  for (const side of [-1, 1]) {
    const front = AISLE - 0.31; // shelf front edge (|x|)
    for (let li = 0; li < LEVELS.length; li++) {
      const y0 = LEVELS[li] + 0.018;
      let z = Z0;
      let brand = 0;
      let run = 0;
      let bw = 0.15, bh = 0.24;
      while (z > Z1) {
        k++;
        if (run <= 0) {
          brand = Math.floor(hash(k * 3.7 + li * 1.9 + side) * BRAND.length);
          run = 2 + Math.floor(hash(k * 1.3) * 6);
          bw = 0.09 + hash(k * 2.1) * 0.13;
          bh = 0.15 + hash(k * 4.9) * 0.17;
        }
        run--;
        const w = bw, h = bh, d = 0.22;
        if (hash(k * 5.3) > 0.05) {
          o.position.set(side * (front + 0.02 + d / 2), y0 + h / 2, z - w / 2);
          o.rotation.set(0, 0, 0);
          o.scale.set(d, h, w * 0.92);
          o.updateMatrix();
          const col = new THREE.Color(BRAND[brand]).lerp(new THREE.Color('#ffffff'), 0.08 + hash(k) * 0.1);
          prods.push({ m: o.matrix.clone(), c: col });
          // printed label on the front of the pack
          o.position.set(side * (front + 0.015), y0 + h * (0.45 + (brand % 3) * 0.1), z - w / 2);
          o.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
          o.scale.set(w * 0.72, h * 0.32, 1);
          o.updateMatrix();
          labels.push({ m: o.matrix.clone(), c: new THREE.Color(brand % 2 ? '#ffffff' : BRAND[(brand + 5) % BRAND.length]) });
        }
        z -= w;
      }
      // yellow price tags along the shelf edge
      for (let tz = Z0 - 0.4; tz > Z1; tz -= 0.75) {
        o.position.set(side * (front - 0.006), LEVELS[li] - 0.01, tz);
        o.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        o.scale.set(0.08, 0.045, 1);
        o.updateMatrix();
        tags.push({ m: o.matrix.clone(), c: new THREE.Color('#ffe14a') });
      }
    }
  }
  return { prods, labels, tags };
};
let cache: ReturnType<typeof buildShelves> | null = null;

const useInstanced = (items: Inst, geo: THREE.BufferGeometry, mat: THREE.Material) =>
  useMemo(() => {
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      m.setMatrixAt(i, it.m);
      m.setColorAt(i, it.c);
    });
    m.instanceMatrix.needsUpdate = true;
    return m;
  }, [items, geo, mat]);

const tileTex = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const s = 222 + Math.floor(hash(i * 4 + j) * 18);
        g.fillStyle = `rgb(${s},${s - 2},${s - 8})`;
        g.fillRect(i * 64, j * 64, 64, 64);
      }
    g.fillStyle = 'rgba(80,80,80,0.35)';
    for (let i = 0; i <= 4; i++) {
      g.fillRect(i * 64 - 1, 0, 2, 256);
      g.fillRect(0, i * 64 - 1, 256, 2);
    }
    tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 40);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
})();

const signTex = (() => {
  const m = new Map<string, THREE.CanvasTexture>();
  return (text: string, sub: string) => {
    const key = text + '|' + sub;
    if (m.has(key)) return m.get(key)!;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 192;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1b4f9c';
    g.fillRect(0, 0, 512, 192);
    g.fillStyle = '#ffffff';
    g.font = '800 76px Inter, sans-serif';
    g.textAlign = 'center';
    g.fillText(text, 256, 92);
    g.font = '600 38px Inter, sans-serif';
    g.fillStyle = '#ffd84a';
    g.fillText(sub, 256, 152);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    m.set(key, tex);
    return tex;
  };
})();

/** a shopping cart drawn in front of the POV camera */
const PovCart: React.FC<{ cam: CamProps }> = ({ cam }) => {
  const dx = cam.look[0] - cam.pos[0], dz = cam.look[2] - cam.pos[2];
  const yaw = Math.atan2(dx, dz);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const base: [number, number, number] = [cam.pos[0] + fx * 1.15, 0, cam.pos[2] + fz * 1.15];
  return (
    <group position={base} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[0.55, 0.42, 0.85, 6, 4, 9]} />
        <meshStandardMaterial color="#c9ced6" wireframe metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <boxGeometry args={[0.53, 0.01, 0.83]} />
        <meshStandardMaterial color="#9aa1ab" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.02, -0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.022, 0.022, 0.6, 10]} />
        <meshStandardMaterial color="#d23a2a" roughness={0.5} />
      </mesh>
      {/* a few items in the basket */}
      <mesh position={[0.1, 0.68, 0.15]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[0.18, 0.2, 0.12]} />
        <meshStandardMaterial color="#6b3b22" />
      </mesh>
      <mesh position={[-0.12, 0.66, 0.25]}>
        <cylinderGeometry args={[0.05, 0.05, 0.16, 10]} />
        <meshStandardMaterial color="#e8e2d0" />
      </mesh>
    </group>
  );
};

export type SupermarketProps = {
  t: number;
  cam: CamProps;
  glare?: number; // 0..1 lights get harsh
  flicker?: number; // 0..1 a few tubes flicker
  cart?: boolean;
  shoppers?: { x: number; z: number; speed?: number; shirt?: string; rotY?: number }[];
  signs?: { z: number; text: string; sub: string }[];
};

export const SupermarketScene: React.FC<SupermarketProps> = ({ t, cam, glare = 0, flicker = 0, cart = true, shoppers = [], signs }) => {
  const { width, height } = useVideoConfig();
  const data = (cache ??= buildShelves());
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const prodMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }), []);
  const labMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: true }), []);
  const prods = useInstanced(data.prods, box, prodMat);
  const labels = useInstanced(data.labels, plane, labMat);
  const tags = useInstanced(data.tags, plane, labMat);
  const sg = signs ?? [
    { z: 2, text: 'AISLE 7', sub: 'COFFEE · TEA' },
    { z: -14, text: 'AISLE 7', sub: 'ENERGY DRINKS' },
    { z: -30, text: 'AISLE 7', sub: 'SNACKS' },
  ];
  const tubes = useMemo(() => Array.from({ length: 18 }, (_, i) => Z0 - 1.5 - i * 3), []);
  const base = 1.6 + glare * 2.4;
  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: cam.fov ?? 64, position: [0, 1.68, 8], near: 0.05, far: 120 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <CameraRig {...cam} />
      <color attach="background" args={['#101216']} />
      <fog attach="fog" args={['#c9ccc8', 18, 70]} />
      <ambientLight intensity={0.55 + glare * 0.4} color="#f2f6ff" />
      <hemisphereLight args={['#ffffff', '#8a8f86', 0.8 + glare * 0.6]} />
      {[6, -6, -18, -30].map((z) => (
        <pointLight key={z} position={[0, 3.2, z]} intensity={base * 6} distance={16} decay={1.4} color="#f4f8ff" />
      ))}
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, (Z0 + Z1) / 2]}>
        <planeGeometry args={[12, Z0 - Z1 + 10]} />
        <meshStandardMaterial map={tileTex()} roughness={0.28} metalness={0.05} />
      </mesh>
      {/* ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 3.6, (Z0 + Z1) / 2]}>
        <planeGeometry args={[12, Z0 - Z1 + 10]} />
        <meshStandardMaterial color="#cfd2d6" roughness={0.9} />
      </mesh>
      {/* back wall */}
      <mesh position={[0, 1.8, Z1 - 2]}>
        <planeGeometry args={[12, 3.6]} />
        <meshStandardMaterial color="#e2ddd0" />
      </mesh>
      {/* shelving units: back panel, base and shelf boards */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (AISLE + 0.32), 1.05, (Z0 + Z1) / 2]}>
            <boxGeometry args={[0.05, 2.1, Z0 - Z1]} />
            <meshStandardMaterial color="#d9dcdf" roughness={0.6} />
          </mesh>
          {LEVELS.map((y) => (
            <mesh key={y} position={[side * (AISLE + 0.0), y, (Z0 + Z1) / 2]}>
              <boxGeometry args={[0.66, 0.035, Z0 - Z1]} />
              <meshStandardMaterial color="#eef0f2" roughness={0.5} metalness={0.2} />
            </mesh>
          ))}
          <mesh position={[side * (AISLE + 0.0), 0.05, (Z0 + Z1) / 2]}>
            <boxGeometry args={[0.66, 0.1, Z0 - Z1]} />
            <meshStandardMaterial color="#5a6068" />
          </mesh>
          {/* high storage on top */}
          {Array.from({ length: 14 }).map((_, i) => (
            <mesh key={i} position={[side * (AISLE + 0.05), 2.32, Z0 - 2 - i * 3.8]}>
              <boxGeometry args={[0.55, 0.42, 1.2 + hash(i + side * 9) * 1.5]} />
              <meshStandardMaterial color={hash(i * 3 + side) > 0.5 ? '#b58b5a' : '#a77d4d'} roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
      <primitive object={prods} />
      <primitive object={labels} />
      <primitive object={tags} />
      {/* fluorescent tubes */}
      {tubes.map((z, i) => {
        const fl = flicker > 0 && hash(i * 7.7) < 0.3 ? (Math.sin(t * (17 + i * 3)) > 0.2 - flicker ? 1 : 0.15) : 1;
        const b = (1.4 + glare * 2.2) * fl;
        return (
          <mesh key={i} position={[0, 3.55, z]}>
            <boxGeometry args={[0.22, 0.06, 2.2]} />
            <meshBasicMaterial color={new THREE.Color(b, b, b * 1.03)} toneMapped={false} />
          </mesh>
        );
      })}
      {/* hanging aisle signs */}
      {sg.map((s, i) => (
        <group key={i} position={[0, 3.0, s.z]}>
          <mesh>
            <planeGeometry args={[1.5, 0.56]} />
            <meshBasicMaterial map={signTex(s.text, s.sub)} side={THREE.DoubleSide} />
          </mesh>
          {[-0.6, 0.6].map((x) => (
            <mesh key={x} position={[x, 0.32, 0]}>
              <cylinderGeometry args={[0.006, 0.006, 0.6, 4]} />
              <meshBasicMaterial color="#333" />
            </mesh>
          ))}
        </group>
      ))}
      {shoppers.map((s, i) => {
        const z = s.z - (s.speed ?? 0) * t;
        return <Person key={i} pos={[s.x, 0, z]} rotY={s.rotY ?? Math.PI} walk={s.speed ? t * 6.5 + i : undefined} shirt={s.shirt ?? '#4a7a5a'} />;
      })}
      {cart && <PovCart cam={cam} />}
    </ThreeCanvas>
  );
};
