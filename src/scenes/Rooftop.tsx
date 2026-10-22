import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, Person, SkyDome, clamp01, hash, mixHex } from './common3d';
import { Env, Post, Redraw, useTex } from './fx3d';

/*
  Rooftop bar at dusk, ~28 m above a river; a downtown skyline on the far bank. Original low-poly look.
  Deck y=0, x -12..12, z -8 (parapet, facing the river) .. 10. Fire pit (1.5,0,-1). Bar counter x≈-8.5, z -2..6.
  Red-brick neighbour x>12.5. River y=-28, z -22..-68. Far bank skyline z -72..-240.
  params: fire 0..1 (flames), lights 0..1 (string bulbs), flicker 0..1 (bulbs drop out at random),
          clutch 0..1 (people press hands to their heads, staggered), river 0..1 (water froths white -> drains, brown bed shows),
          haze 0..1 (sepia dust), dusk 0..1 (sky darkness), bloom, focus (m), aperture,
          glass 0..1 (window panes + drinking glasses turn to falling dust), crumble 0..1 (far-bank skyline collapses into dust),
          fireZ (z of the hydrogen fire front) + fireball 0..1, spark 0..1 (ignition point over the river), debris 0..1 (rocks thrown at the lens).
*/

const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
};

const planks = () =>
  canvasTex(256, 256, (g) => {
    for (let i = 0; i < 16; i++) {
      const l = 30 + hash(i * 3.1) * 22;
      g.fillStyle = `hsl(22,38%,${l}%)`;
      g.fillRect(0, i * 16, 256, 15);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, i * 16 + 15, 256, 1);
      g.fillRect((hash(i) * 256) | 0, i * 16, 1, 15);
    }
  }, [6, 8]);

const windowsTex = (seed: number, lit: number) =>
  canvasTex(64, 128, (g) => {
    g.fillStyle = '#d6d6dc';
    g.fillRect(0, 0, 64, 128);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 4; x++) {
        const r = hash(seed * 97 + y * 13 + x);
        g.fillStyle = r < lit ? '#f6d9a6' : r < 0.75 ? '#8d97ab' : '#a6afc0';
        g.fillRect(x * 16 + 3, y * 16 + 3, 10, 11);
      }
  });

const brickTex = () =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = '#8d2a1c';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 8; x++) {
        g.fillStyle = `hsl(8,${55 + hash(x * 7 + y) * 15}%,${30 + hash(x + y * 9) * 8}%)`;
        g.fillRect(x * 32 + (y % 2) * 16, y * 8, 30, 7);
      }
  }, [3, 6]);

type Guest = { pos: [number, number, number]; rotY: number; shirt: string; pants: string; hair: string; skin: string; pose: 'stand' | 'sit'; lag: number };
const SHIRTS = ['#d23b3b', '#f2f2ee', '#2f5fd0', '#1f2a44', '#e7a6b8', '#3c8a5a', '#f0c94a', '#7a4fb0'];
const HAIRS = ['#2a1d16', '#e6c36a', '#5a3a22', '#d9d9d9', '#121212'];
const SKINS = ['#d9a27a', '#f0c8a8', '#a8724e', '#6e4630'];
const GUESTS: Guest[] = [
  // the woman at the railing (first shot), and her neighbour
  { pos: [-0.6, 0, -7.3], rotY: Math.PI, shirt: '#1f2a44', pants: '#3a3a46', hair: '#e6c36a', skin: '#f0c8a8', pose: 'stand', lag: 0 },
  { pos: [0.5, 0, -7.2], rotY: Math.PI + 0.3, shirt: '#2d2d36', pants: '#8f96a8', hair: '#d9d9d9', skin: '#d9a27a', pose: 'stand', lag: 0.15 },
  // around the fire pit
  { pos: [0.0, 0, -0.2], rotY: 1.9, shirt: '#d23b3b', pants: '#c9b28f', hair: '#5a3a22', skin: '#d9a27a', pose: 'sit', lag: 0.1 },
  { pos: [3.3, 0, -0.6], rotY: -1.6, shirt: '#2f5fd0', pants: '#1f2a44', hair: '#d9d9d9', skin: '#f0c8a8', pose: 'sit', lag: 0.25 },
  { pos: [1.0, 0, 0.9], rotY: Math.PI, shirt: '#f2f2ee', pants: '#6b5a48', hair: '#121212', skin: '#a8724e', pose: 'stand', lag: 0.05 },
  { pos: [2.3, 0, 1.0], rotY: Math.PI - 0.3, shirt: '#d23b3b', pants: '#3a4a7a', hair: '#2a1d16', skin: '#f0c8a8', pose: 'stand', lag: 0.3 },
  // high tables
  { pos: [-4.0, 0, 1.5], rotY: 0.6, shirt: '#f2f2ee', pants: '#9a8f80', hair: '#2a1d16', skin: '#f0c8a8', pose: 'stand', lag: 0.2 },
  { pos: [-2.6, 0, 1.0], rotY: -1.2, shirt: '#2f5fd0', pants: '#1f2a44', hair: '#5a3a22', skin: '#d9a27a', pose: 'stand', lag: 0.35 },
  { pos: [5.5, 0, 3.0], rotY: 2.6, shirt: '#e7a6b8', pants: '#2b3242', hair: '#121212', skin: '#6e4630', pose: 'stand', lag: 0.12 },
  { pos: [6.6, 0, 2.2], rotY: -2.4, shirt: '#3c8a5a', pants: '#2b3242', hair: '#e6c36a', skin: '#f0c8a8', pose: 'stand', lag: 0.28 },
  // far side, along the parapet and back wall
  { pos: [-5.5, 0, -7.1], rotY: Math.PI, shirt: '#7a4fb0', pants: '#2b3242', hair: '#2a1d16', skin: '#a8724e', pose: 'stand', lag: 0.18 },
  { pos: [6.0, 0, -7.0], rotY: Math.PI - 0.2, shirt: '#f0c94a', pants: '#3a3a46', hair: '#5a3a22', skin: '#d9a27a', pose: 'stand', lag: 0.22 },
  { pos: [8.0, 0, 6.5], rotY: -2.8, shirt: '#d23b3b', pants: '#2b3242', hair: '#121212', skin: '#f0c8a8', pose: 'stand', lag: 0.08 },
  { pos: [-1.5, 0, 6.0], rotY: 2.9, shirt: '#2f5fd0', pants: '#c9b28f', hair: '#e6c36a', skin: '#d9a27a', pose: 'stand', lag: 0.32 },
];

// string-light runs: [from, to] (sagging catenary), bulbs every ~0.9 m
const RUNS: [THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(-11, 3.4, -7.6), new THREE.Vector3(12.4, 4.2, -6.5)],
  [new THREE.Vector3(-11, 3.4, -7.6), new THREE.Vector3(12.4, 5.0, 2.0)],
  [new THREE.Vector3(-11, 3.4, 3.0), new THREE.Vector3(12.4, 4.6, -2.5)],
  [new THREE.Vector3(-11, 3.4, 3.0), new THREE.Vector3(12.4, 4.2, 8.0)],
  [new THREE.Vector3(12.4, 6.2, -7.5), new THREE.Vector3(12.4, 6.2, 9.5)],
];
const sagPoint = (a: THREE.Vector3, b: THREE.Vector3, u: number, sag: number) => a.clone().lerp(b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0));

export type RooftopProps = {
  t: number;
  cam: CamProps | null;
  fire?: number;
  lights?: number;
  flicker?: number;
  clutch?: number;
  river?: number;
  haze?: number;
  dusk?: number;
  bloom?: number;
  focus?: number;
  aperture?: number;
  glass?: number;
  crumble?: number;
  fireZ?: number;
  fireball?: number;
  spark?: number;
  debris?: number;
};

export const RooftopScene: React.FC<RooftopProps> = ({ t, cam, fire = 1, lights = 1, flicker = 0, clutch = 0, river = 0, haze = 0, dusk = 0, bloom = 0.55, focus = 8, aperture = 0, glass = 0, crumble = 0, fireZ = -110, fireball = 0, spark = 0, debris = 0 }) => {
  const smokeTex = useTex('tex/smoke1.png');
  const puffMats = useMemo(
    () => [0, 1, 2].map((i) => new THREE.SpriteMaterial({ color: ['#ff7a1f', '#ffb347', '#ffe0a0'][i], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })),
    [],
  );
  const dustMat = useMemo(() => new THREE.SpriteMaterial({ color: '#b5946c', transparent: true, depthWrite: false }), []);
  if (smokeTex) {
    puffMats.forEach((m) => (m.map = smokeTex));
    dustMat.map = smokeTex;
  }
  const { width, height } = useVideoConfig();
  const c = cam ?? { pos: [0, 1.7, 6] as [number, number, number], look: [0, 1.4, -8] as [number, number, number], fov: 50 };

  const deckTex = useMemo(planks, []);
  const brick = useMemo(brickTex, []);
  const skyline = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number; h: number; mat: THREE.MeshStandardMaterial }[] = [];
    const texs = [0, 1, 2, 3, 4, 5].map((i) => windowsTex(i + 1, 0.22 + 0.06 * i));
    for (let i = 0; i < 170; i++) {
      const row = i % 5;
      const x = i >= 120 ? -120 + hash(i * 1.7) * 240 : -170 + hash(i * 1.7) * 340;
      const z = -105 - row * 32 - hash(i * 2.3) * 18;
      const central = Math.exp(-((x / 80) ** 2));
      const h = 12 + hash(i * 4.1) ** 2 * 26 + central * hash(i * 5.3) * 55 + row * 5;
      const w = 9 + hash(i * 6.7) * 16;
      const map = texs[i % texs.length].clone();
      map.needsUpdate = true;
      map.repeat.set(Math.max(1, Math.round(w / 12)), Math.max(1, Math.round(h / 24)));
      const tint = ['#d8dbe3', '#c9ccd6', '#e6dccd', '#b9c3d6', '#d0c4bd'][i % 5];
      out.push({ x, z: i >= 120 ? 60 + (z + 105) * -0.6 : z, w, d: 10 + hash(i) * 10, h: i >= 120 ? h * 0.8 + 20 : h, mat: new THREE.MeshStandardMaterial({ map, color: tint, roughness: 0.7, emissive: '#ffcf8a', emissiveIntensity: 0.0, flatShading: true }) });
    }
    return out;
  }, []);
  const bulbs = useMemo(() => {
    const out: { p: THREE.Vector3; id: number }[] = [];
    let id = 0;
    RUNS.forEach(([a, b]) => {
      const n = Math.round(a.distanceTo(b) / 0.9);
      for (let i = 1; i < n; i++) out.push({ p: sagPoint(a, b, i / n, 0.9), id: id++ });
    });
    return out;
  }, []);
  const wires = useMemo(
    () =>
      RUNS.map(([a, b]) => {
        const pts = Array.from({ length: 24 }, (_, i) => sagPoint(a, b, i / 23, 0.9));
        return new THREE.BufferGeometry().setFromPoints(pts);
      }),
    [],
  );
  const bulbOn = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffdca0', toneMapped: false }), []);
  const bulbOff = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b6258', roughness: 0.6 }), []);
  bulbOn.color.set('#ffdca0').multiplyScalar(0.6 + 1.6 * lights);

  // sky: dusk, darker with `dusk`, sepia with `haze`
  const top = mixHex(mixHex('#6d5f98', '#2a2850', dusk).getStyle(), '#7a5a3a', haze);
  const bottom = mixHex(mixHex('#f3b9a2', '#b46a6a', dusk).getStyle(), '#c49a6c', haze);
  const fogCol = mixHex('#c9a9b8', '#b08a62', haze);

  const wHot = clamp01(river * 2); // froth
  const wDry = clamp01(river * 2 - 1); // drained
  const waterCol = mixHex(mixHex('#56637a', '#e9eef2', wHot).getStyle(), '#6a5034', wDry);

  const flame = (i: number) => {
    const f = fire * (0.75 + 0.25 * Math.sin(t * 17 + i * 2.1) * Math.sin(t * 7.3 + i));
    return Math.max(0.001, f);
  };

  return (
    <ThreeCanvas width={width} height={height} shadows camera={{ fov: c.fov ?? 50, position: c.pos, near: 0.05, far: 2000 }} gl={{ antialias: true }} onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }}>
      <CameraRig {...c} />
      <Env path="hdr/pedestrian_overpass_1k.hdr" intensity={0.35 * (1 - 0.5 * dusk)} />
      <SkyDome top={top} bottom={bottom} stars={0} radius={1500} />
      <fog attach="fog" args={[fogCol.getStyle(), 40 - 30 * haze, 330 - 250 * haze]} />
      <hemisphereLight args={['#c8b6e0', '#5a4038', 0.55 * (1 - 0.4 * dusk)]} />
      <directionalLight position={[-60, 30, -120]} intensity={1.6 * (1 - 0.6 * dusk)} color="#ffb48a" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} />

      {/* deck */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1]} receiveShadow>
        <planeGeometry args={[25, 19]} />
        <meshStandardMaterial map={deckTex} roughness={0.85} />
      </mesh>
      {/* parapet + rail facing the river, and side walls */}
      <mesh position={[0, 0.5, -8.1]} castShadow receiveShadow>
        <boxGeometry args={[25, 1.0, 0.35]} />
        <meshStandardMaterial color="#3c3842" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.07, -8.1]}>
        <boxGeometry args={[25, 0.06, 0.12]} />
        <meshStandardMaterial color="#9aa0aa" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[-12.4, 0.5, 1]} receiveShadow>
        <boxGeometry args={[0.35, 1.0, 19]} />
        <meshStandardMaterial color="#3c3842" roughness={0.9} />
      </mesh>
      {/* the building we stand on, falling away below the parapet */}
      <mesh position={[0, -14.2, 1]}>
        <boxGeometry args={[25, 28, 19]} />
        <meshStandardMaterial color="#4a3a36" roughness={0.9} />
      </mesh>

      {/* stair / elevator house at the back of the deck */}
      <mesh position={[-2, 1.6, 11.2]} castShadow receiveShadow>
        <boxGeometry args={[9, 3.2, 2.2]} />
        <meshStandardMaterial color="#6d5f5a" roughness={0.9} />
      </mesh>
      <mesh position={[-2.5, 1.1, 10.08]}>
        <planeGeometry args={[1.1, 2.2]} />
        <meshStandardMaterial color="#2a2226" emissive="#ffb35c" emissiveIntensity={0.15 * lights} />
      </mesh>

      {/* red-brick neighbour */}
      <mesh position={[19, 8, 1]} castShadow receiveShadow>
        <boxGeometry args={[13, 16, 19]} />
        <meshStandardMaterial map={brick} roughness={0.9} />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => {
        const fl = Math.floor(i / 6), col = i % 6;
        const lit = hash(i * 3.3) < 0.45;
        return (
          <group key={i}>
            <mesh position={[12.48, 2.2 + fl * 3.4, -6 + col * 2.9]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[1.1, 1.7]} />
              <meshStandardMaterial color={lit ? '#ffd79a' : '#141820'} emissive={lit ? '#ffb85c' : '#000'} emissiveIntensity={lit ? 0.8 * lights : 0} />
            </mesh>
            {glass < 0.35 && (
              <mesh position={[12.4, 2.2 + fl * 3.4, -6 + col * 2.9]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[1.12, 1.72]} />
                <meshStandardMaterial color="#cfe3f0" transparent opacity={0.35 * (1 - glass / 0.35)} metalness={0.6} roughness={0.05} />
              </mesh>
            )}
            {glass > 0 && glass < 1 &&
              Array.from({ length: 10 }, (_, j) => (
                <mesh key={j} position={[12.3 - glass * hash(i * 10 + j) * 0.8, 2.2 + fl * 3.4 + (hash(i * 31 + j) - 0.5) * 1.5 - glass * glass * 7, -6 + col * 2.9 + (hash(i * 17 + j) - 0.5) * 1.0]}>
                  <boxGeometry args={[0.05, 0.05, 0.05]} />
                  <meshBasicMaterial color="#e8eef2" transparent opacity={Math.sin(Math.PI * glass)} />
                </mesh>
              ))}
          </group>
        );
      })}

      {/* bar counter + shelves + bartender */}
      <mesh position={[-8.6, 0.55, 2]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 1.1, 8]} />
        <meshStandardMaterial color="#5a1c1c" roughness={0.7} />
      </mesh>
      <mesh position={[-8.6, 1.13, 2]}>
        <boxGeometry args={[1.25, 0.07, 8.2]} />
        <meshStandardMaterial color="#d9d4cc" roughness={0.4} />
      </mesh>
      <mesh position={[-11.6, 1.6, 2]}>
        <boxGeometry args={[0.4, 3.2, 8]} />
        <meshStandardMaterial color="#2a2226" />
      </mesh>
      {Array.from({ length: 18 }, (_, i) => (
        <mesh key={i} position={[-11.3, 1.4 + (i % 2) * 0.7, -1.4 + Math.floor(i / 2) * 0.8]}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 6]} />
          <meshStandardMaterial color={['#4d7a3a', '#a8c8d8', '#8a4b20'][i % 3]} transparent opacity={0.85} roughness={0.2} />
        </mesh>
      ))}
      <Person pos={[-9.9, 0, 3]} rotY={Math.PI / 2} shirt="#1c1c22" pants="#1c1c22" hair="#121212" clutch={clamp01(clutch * 1.4 - 0.2)} />

      {/* high tables */}
      {[[-3.3, 0.7], [6.0, 2.7], [-6.0, -5.0], [4.5, -6.0]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.53, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 1.06, 6]} />
            <meshStandardMaterial color="#555b66" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 1.07, 0]} castShadow>
            <cylinderGeometry args={[0.42, 0.42, 0.05, 16]} />
            <meshStandardMaterial color="#c9a77a" roughness={0.6} />
          </mesh>
          {[-0.15, 0.15].map((gx) => (
            <mesh key={gx} position={[gx, 1.16, 0.05]}>
              <cylinderGeometry args={[0.04, 0.035, 0.13, 8]} />
              <meshStandardMaterial color="#e8eef2" transparent opacity={0.5 * (1 - clamp01(glass * 3))} roughness={0.1} />
            </mesh>
          ))}
        </group>
      ))}

      {/* fire pit */}
      <group position={[1.5, 0, -1.0]}>
        <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.7, 0.45, 0.95]} />
          <meshStandardMaterial color="#b9b6b0" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.451, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.45, 0.72]} />
          <meshStandardMaterial color="#1a1c2a" roughness={0.5} emissive="#ff5a1a" emissiveIntensity={0.25 * fire} />
        </mesh>
        {Array.from({ length: 9 }, (_, i) => {
          const f = flame(i);
          const x = -0.55 + (i / 8) * 1.1 + Math.sin(t * 5 + i) * 0.02;
          const hgt = 0.35 + 0.35 * hash(i * 4.4) + 0.12 * Math.sin(t * 11 + i * 1.7);
          return (
            <group key={i} position={[x, 0.46, (hash(i * 9.1) - 0.5) * 0.35]} rotation={[0, 0, Math.sin(t * 6 + i * 2) * 0.12]} scale={[1, f, 1]}>
              <mesh position={[0, hgt / 2, 0]}>
                <coneGeometry args={[0.11, hgt, 6, 1, true]} />
                <meshBasicMaterial color="#ff7a1f" toneMapped={false} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, hgt * 0.32, 0]}>
                <coneGeometry args={[0.06, hgt * 0.6, 6, 1, true]} />
                <meshBasicMaterial color="#ffd38a" toneMapped={false} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        })}
        <mesh position={[0, 0.75, 0]} scale={[1, Math.max(0.001, fire), 1]}>
          <sphereGeometry args={[0.75, 12, 8]} />
          <meshBasicMaterial color="#ff8a3a" toneMapped={false} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <pointLight position={[0, 0.9, 0]} intensity={14 * fire} distance={9} color="#ff9a4a" />
      </group>

      {/* guests */}
      {GUESTS.map((g, i) => {
        const cl = clamp01((clutch - g.lag * 0.6) / 0.45);
        const sway = Math.sin(t * 1.3 + i) * 0.04 * (1 - cl);
        return <Person key={i} pos={g.pos} rotY={g.rotY + sway} pose={g.pose} shirt={g.shirt} pants={g.pants} hair={g.hair} skin={g.skin} breathe={0.5 + 0.5 * Math.sin(t * 2 + i)} clutch={cl} armR={g.pose === 'stand' && i % 3 === 0 ? 0.5 : 0} elbowR={g.pose === 'stand' && i % 3 === 0 ? 1.2 : 0} />;
      })}

      {/* string lights */}
      {wires.map((g, i) => (
        <primitive key={i} object={new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#1a1a1a' }))} />
      ))}
      {[[-11, -7.6], [-11, 3]].map(([x, z], i) => (
        <mesh key={i} position={[x, 1.75, z]}>
          <cylinderGeometry args={[0.05, 0.06, 3.5, 6]} />
          <meshStandardMaterial color="#6a6560" />
        </mesh>
      ))}
      {bulbs.map((b) => {
        const off = flicker > 0 && hash(b.id * 7.7 + Math.floor(t * 6) * 0.37) < flicker;
        return (
          <mesh key={b.id} position={b.p} material={lights > 0.02 && !off ? bulbOn : bulbOff}>
            <sphereGeometry args={[0.07, 8, 6]} />
          </mesh>
        );
      })}

      {/* ignition point + hydrogen fire front rolling toward the camera */}
      {spark > 0 && (
        <group position={[0, -16, -60]}>
          <mesh>
            <sphereGeometry args={[0.6 + 1.6 * spark, 12, 10]} />
            <meshBasicMaterial color="#fff4dc" toneMapped={false} />
          </mesh>
          <sprite scale={[14 * spark, 14 * spark, 1]} material={puffMats[2]} />
          <pointLight intensity={4000 * spark} distance={200} color="#ffd9a0" />
        </group>
      )}
      {fireball > 0 &&
        Array.from({ length: 90 }, (_, i) => {
          const m = puffMats[i % 3].clone();
          m.opacity = clamp01(fireball * 1.4) * (0.35 + 0.4 * hash(i * 2.9));
          const sc = 9 + 18 * hash(i * 4.4) + 6 * Math.sin(t * 3 + i);
          const x = (hash(i * 1.3) - 0.5) * 220;
          const y = -26 + hash(i * 7.7) ** 0.7 * (40 + 50 * fireball);
          const z = fireZ - hash(i * 9.9) * 40 + Math.sin(t * 2 + i) * 3;
          return <sprite key={i} position={[x, y, z]} scale={[sc, sc, 1]} material={m} />;
        })}
      {fireball > 0 && <pointLight position={[0, 6, fireZ + 8]} intensity={9000 * fireball} distance={260} color="#ff9a4a" />}
      {debris > 0 &&
        Array.from({ length: 46 }, (_, i) => {
          const f = (hash(i * 6.6) + t * (0.35 + hash(i) * 0.35)) % 1;
          const z = THREE.MathUtils.lerp(fireZ, c.pos[2] + 2, f);
          const x = c.pos[0] + (hash(i * 2.7) - 0.5) * 30 * (1 - f) + (hash(i * 3.1) - 0.5) * 3;
          const y = c.pos[1] + (hash(i * 4.9) - 0.5) * 18 * (1 - f) + 6 * Math.sin(Math.PI * f) * (hash(i) - 0.3);
          return (
            <mesh key={i} position={[x, y, z]} rotation={[t * 3 + i, t * 2 + i, 0]} scale={debris * (0.15 + hash(i * 8.8) * 0.4)}>
              <icosahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color="#2a1a12" roughness={1} flatShading />
            </mesh>
          );
        })}

      {/* river + far bank */}
      {river < 0.98 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -28 - 2.5 * wDry, -45]}>
          <planeGeometry args={[600, 46]} />
          <meshStandardMaterial color={waterCol} metalness={0.55 - 0.5 * wDry} roughness={0.25 + 0.6 * Math.max(wHot * 0.6, wDry)} transparent opacity={1 - wDry} />
        </mesh>
      )}
      {/* the water turning to gas: violent spray thrown up, then falling back as mud */}
      {river > 0.02 && river < 0.95 &&
        Array.from({ length: 160 }, (_, i) => {
          const u = clamp01(river / 0.9);
          const up = (8 + hash(i * 2.2) * 22) * Math.sin(Math.PI * u);
          return (
            <mesh key={i} position={[(hash(i * 5.1) - 0.5) * 160, -28 + up, -24 - hash(i * 7.3) * 42]}>
              <icosahedronGeometry args={[0.25 + hash(i) * 0.6, 0]} />
              <meshStandardMaterial color={mixHex('#e9eef2', '#6a5034', u)} transparent opacity={0.85 * Math.sin(Math.PI * u)} />
            </mesh>
          );
        })}
      {river > 0.05 && (
        <mesh position={[0, -28 + 12 * river, -45]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[600, 50]} />
          <meshBasicMaterial color="#f4f1ea" transparent opacity={0.12 * Math.sin(Math.PI * Math.min(1, river))} depthWrite={false} />
        </mesh>
      )}
      {/* exposed riverbed: boulders, mud ridges, stranded debris */}
      {wDry > 0 &&
        Array.from({ length: 120 }, (_, i) => (
          <mesh key={'rb' + i} position={[(hash(i * 3.9) - 0.5) * 220, -28.55, -23 - hash(i * 6.1) * 44]} rotation={[hash(i) * 3, hash(i * 2) * 3, 0]} scale={[1 + hash(i * 5) * 2.5, 0.35 + hash(i * 7) * 0.6, 1 + hash(i * 8) * 2]}>
            <icosahedronGeometry args={[0.6, 0]} />
            <meshStandardMaterial color={i % 4 ? '#4a3626' : '#6e5a44'} roughness={1} flatShading />
          </mesh>
        ))}
      {wDry > 0 &&
        Array.from({ length: 14 }, (_, i) => (
          <mesh key={'mr' + i} position={[(hash(i * 9.3) - 0.5) * 200, -28.5, -26 - i * 3]} rotation={[-Math.PI / 2, 0, hash(i) * 0.3]}>
            <planeGeometry args={[60 + hash(i * 4) * 80, 0.8]} />
            <meshStandardMaterial color="#3a2a1c" roughness={1} />
          </mesh>
        ))}
      {[[-30, -35], [24, -52]].map(([x, z], i) => (
        <group key={i} position={[x, -27.6 - 2.6 * wDry, z]} rotation={[0, 0.4 + i, wDry * 0.25 * (i ? 1 : -1)]}>
          <mesh>
            <boxGeometry args={[7, 1.2, 2.4]} />
            <meshStandardMaterial color={i ? '#d8d2c8' : '#7a2a24'} roughness={0.7} />
          </mesh>
          <mesh position={[-0.8, 1.1, 0]}>
            <boxGeometry args={[2.6, 1.1, 1.8]} />
            <meshStandardMaterial color="#e8e4dc" roughness={0.6} />
          </mesh>
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -28.6, -45]}>
        <planeGeometry args={[600, 46]} />
        <meshStandardMaterial color="#5c4630" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -27.8, -14]}>
        <planeGeometry args={[600, 16]} />
        <meshStandardMaterial color="#2f4a2c" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -27.8, -160]}>
        <planeGeometry args={[600, 190]} />
        <meshStandardMaterial color="#6b6f78" roughness={1} />
      </mesh>
      {skyline.map((b, i) => {
        const k = clamp01((crumble - hash(i * 3.7) * 0.5) / 0.5);
        const sink = b.h * 0.75 * k * k;
        return (
          <mesh key={i} position={[b.x, -28 + b.h / 2 - sink, b.z]} rotation={[0, 0, (hash(i * 8.1) - 0.5) * 0.25 * k]} material={b.mat}>
            <boxGeometry args={[b.w, b.h, b.d]} />
          </mesh>
        );
      })}
      {/* collapse dust */}
      {crumble > 0 &&
        skyline.map((b, i) => {
          if (i % 2) return null;
          const k = clamp01((crumble - hash(i * 3.7) * 0.5) / 0.5);
          if (k <= 0) return null;
          const m = dustMat.clone();
          m.opacity = 0.55 * Math.min(1, k * 3);
          const sc = b.w * (1.2 + 2.2 * k);
          return <sprite key={'d' + i} position={[b.x, -28 + sc * 0.35, b.z + 6]} scale={[sc, sc * 0.7, 1]} material={m} />;
        })}

      <Redraw deps={[deckTex, smokeTex]} />
      <Post bloom={bloom} bloomThreshold={0.85} focus={focus} aperture={aperture} maxblur={0.01} />
    </ThreeCanvas>
  );
};
