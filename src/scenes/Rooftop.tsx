import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { CamProps, CameraRig, clamp01, hash, mixHex } from './common3d';
import { Env, Post, Redraw, useTex } from './fx3d';
import { Hero, standHero, useHeroFactory } from './hero';
import { facadeMat } from './City2';

/*
  Rooftop bar at dusk, 28 m above a 120 m wide river; a downtown skyline on the far bank (realistic v2).
  Deck y=0, x -12..12, z -8 (parapet, facing the river) .. 10. Fire pit (1.5,0,-1). Bar counter x≈-8.6, z -2..6.
  Red-brick neighbour x>12.5. River y=-28, z -22..-142 (three.js Water). Far bank skyline z -170..-350.
  Everything outside the roof sits in a "world" group so the roof can fall: sink (m) lifts the world, tilt (rad) tips it.
  params: fire 0..1, lights 0..1, flicker 0..1, clutch 0..1 (hands to heads, staggered), river 0..1 (0 water, ~0.4 boiling into mist,
          1 gone: mud bed), haze 0..1 (sepia dust), dusk 0..1, glass 0..1 (panes + drinking glasses turn to dust),
          crumble 0..1 (concrete buildings collapse into dust clouds, steel-frame towers are stripped to their skeletons),
          sink (m), tilt (rad), fireZ + fireball 0..1 (hydrogen fire front), spark 0..1 (ignition), debris 0..1, bloom, focus, aperture.
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
  canvasTex(512, 512, (g) => {
    for (let i = 0; i < 32; i++) {
      const l = 26 + hash(i * 3.1) * 16;
      g.fillStyle = `hsl(${20 + hash(i) * 8},34%,${l}%)`;
      g.fillRect(0, i * 16, 512, 15);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(0,0,0,${0.05 + hash(i * 40 + k) * 0.08})`;
        g.fillRect(hash(i * 7 + k) * 512, i * 16 + hash(k) * 14, 30 + hash(k * 3) * 60, 1);
      }
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(0, i * 16 + 15, 512, 1);
      g.fillRect((hash(i) * 512) | 0, i * 16, 1, 15);
    }
  }, [5, 7]);

const brickTex = () =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = '#5a2a22';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 8; x++) {
        g.fillStyle = `hsl(8,${45 + hash(x * 7 + y) * 15}%,${26 + hash(x + y * 9) * 9}%)`;
        g.fillRect(x * 32 + (y % 2) * 16, y * 8, 30, 7);
      }
  }, [3, 6]);

// steel skeleton left standing when a tower's concrete and glass are gone: only beams on a 7 m x 3.4 m grid
const frameMat = (() => {
  let m: THREE.MeshStandardMaterial | null = null;
  return () => {
    if (m) return m;
    m = new THREE.MeshStandardMaterial({ color: '#3a3836', roughness: 0.6, metalness: 0.7, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 wp4 = vec4(transformed, 1.0); vec3 wn3 = objectNormal;
          #ifdef USE_INSTANCING
            wp4 = instanceMatrix * wp4; wn3 = mat3(instanceMatrix) * wn3;
          #endif
          vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * wn3);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float u = abs(vWN.x) > 0.5 ? vWP.z : vWP.x;
          if (abs(vWN.y) > 0.5) u = vWP.x + vWP.z;
          float col = step(fract(u / 7.0), 0.06);
          float flo = step(fract((vWP.y + 28.0) / 3.4), 0.09);
          if (col + flo < 0.5) discard;`);
    };
    return m;
  };
})();

type Guest = { pos: [number, number, number]; rotY: number; suit: string; lag: number };
const GUESTS: Guest[] = [
  { pos: [-0.6, 0, -7.3], rotY: Math.PI, suit: '#1f2a44', lag: 0 },
  { pos: [0.5, 0, -7.2], rotY: Math.PI + 0.3, suit: '#4a4a52', lag: 0.15 },
  { pos: [0.0, 0, -0.4], rotY: 1.9, suit: '#6b2a2a', lag: 0.1 },
  { pos: [3.2, 0, -0.7], rotY: -1.6, suit: '#2f3f6a', lag: 0.25 },
  { pos: [1.0, 0, 0.9], rotY: Math.PI, suit: '#7a7468', lag: 0.05 },
  { pos: [2.3, 0, 1.0], rotY: Math.PI - 0.3, suit: '#3a2a22', lag: 0.3 },
  { pos: [-4.0, 0, 1.5], rotY: 0.6, suit: '#5a5248', lag: 0.2 },
  { pos: [-2.6, 0, 1.0], rotY: -1.2, suit: '#22324a', lag: 0.35 },
  { pos: [5.5, 0, 3.0], rotY: 2.6, suit: '#4a2a3a', lag: 0.12 },
  { pos: [6.6, 0, 2.2], rotY: -2.4, suit: '#2a3a2a', lag: 0.28 },
  { pos: [-5.5, 0, -7.1], rotY: Math.PI, suit: '#3a3a46', lag: 0.18 },
  { pos: [6.0, 0, -7.0], rotY: Math.PI - 0.2, suit: '#5a4a32', lag: 0.22 },
  { pos: [8.0, 0, 6.5], rotY: -2.8, suit: '#6b2a2a', lag: 0.08 },
  { pos: [-1.5, 0, 6.0], rotY: 2.9, suit: '#2f3f6a', lag: 0.32 },
  { pos: [-9.9, 0, 3.0], rotY: Math.PI / 2, suit: '#1a1a1e', lag: 0.2 }, // bartender
];

const RUNS: [THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(-11, 3.4, -7.6), new THREE.Vector3(12.4, 4.2, -6.5)],
  [new THREE.Vector3(-11, 3.4, -7.6), new THREE.Vector3(12.4, 5.0, 2.0)],
  [new THREE.Vector3(-11, 3.4, 3.0), new THREE.Vector3(12.4, 4.6, -2.5)],
  [new THREE.Vector3(-11, 3.4, 3.0), new THREE.Vector3(12.4, 4.2, 8.0)],
  [new THREE.Vector3(12.4, 6.2, -7.5), new THREE.Vector3(12.4, 6.2, 9.5)],
];
const sagPoint = (a: THREE.Vector3, b: THREE.Vector3, u: number, sag: number) => a.clone().lerp(b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0));

// far-bank towers; ~35 % are steel-frame (they keep a skeleton), the rest are concrete (they come down)
type Tower = { x: number; z: number; w: number; d: number; h: number; steel: boolean; delay: number; topple: number };
const TOWERS: Tower[] = (() => {
  const out: Tower[] = [];
  for (let i = 0; i < 150; i++) {
    const row = i % 5;
    const x = -260 + hash(i * 1.7) * 520;
    const z = -172 - row * 36 - hash(i * 2.3) * 20;
    const central = Math.exp(-((x / 95) ** 2));
    const h = 14 + hash(i * 4.1) ** 2 * 26 + central * hash(i * 5.3) * 60 + row * 5;
    out.push({ x, z, w: 12 + hash(i * 6.7) * 16, d: 12 + hash(i) * 10, h, steel: h > 45 && hash(i * 9.1) < 0.7, delay: hash(i * 3.7) * 0.45, topple: hash(i * 8.1) < 0.3 ? (hash(i * 2.9) - 0.5) * 0.7 : 0 });
  }
  // a row on our own bank behind the roof
  for (let i = 0; i < 30; i++) {
    const x = -120 + hash(i * 11.1) * 240;
    out.push({ x, z: 45 + hash(i * 3.3) * 60, w: 14 + hash(i) * 12, d: 14, h: 40 + hash(i * 2.2) * 50, steel: hash(i * 4.4) < 0.4, delay: hash(i * 5.5) * 0.45, topple: 0 });
  }
  return out;
})();

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
  sink?: number;
  tilt?: number;
  fireZ?: number;
  fireball?: number;
  spark?: number;
  debris?: number;
};

export const RooftopScene: React.FC<RooftopProps> = ({
  t, cam, fire = 1, lights = 1, flicker = 0, clutch = 0, river = 0, haze = 0, dusk = 0, bloom = 0.5, focus = 8, aperture = 0,
  glass = 0, crumble = 0, sink = 0, tilt = 0, fireZ = -110, fireball = 0, spark = 0, debris = 0,
}) => {
  const { width, height } = useVideoConfig();
  const c = cam ?? { pos: [0, 1.7, 6] as [number, number, number], look: [0, 1.4, -8] as [number, number, number], fov: 50 };

  const deckTex = useMemo(planks, []);
  const brick = useMemo(brickTex, []);
  const smokeTex = useTex('tex/smoke1.png');
  const normals = useTex('tex/waternormals.jpg', false);
  const factory = useHeroFactory();
  const people = useMemo(() => (factory ? GUESTS.map((g) => factory(g.suit)) : null), [factory]);

  // --- sky: physical sky, sun just above the skyline behind the river ---
  const sunElev = 4 - 3 * dusk;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - sunElev), Math.PI + 0.6);
  const sky = useMemo(() => {
    const s = new Sky();
    s.scale.setScalar(4000);
    const u = s.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 2.4;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.86;
    s.material.fragmentShader = s.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * 0.5, 1.0 );');
    return s;
  }, []);
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  const sepia = mixHex('#c9a27a', '#8a6a4a', dusk);
  const fogCol = mixHex('#b9a3a6', sepia.getStyle(), haze);

  // --- river: real reflective water that boils into mist and is gone ---
  const water = useMemo(() => {
    if (!normals) return null;
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    const w = new Water(new THREE.PlaneGeometry(900, 120), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: sunDir.clone(),
      sunColor: 0xffc89a,
      waterColor: 0x1b2f3a,
      distortionScale: 2.2,
      fog: true,
      alpha: 1,
    });
    w.rotation.x = -Math.PI / 2;
    (w.material as THREE.ShaderMaterial).transparent = true;
    (w.material as THREE.ShaderMaterial).uniforms.size.value = 2.2;
    return w;
  }, [normals]); // eslint-disable-line react-hooks/exhaustive-deps
  const boil = clamp01((river - 0.08) / 0.4); // 0..1 boiling
  const gone = clamp01((river - 0.55) / 0.4); // 0..1 drained
  if (water) {
    const u = (water.material as THREE.ShaderMaterial).uniforms;
    u.time.value = t * (0.6 + 6 * boil);
    u.distortionScale.value = 2.2 + 30 * boil;
    u.waterColor.value.set(mixHex('#1b2f3a', '#cfd6d8', boil * 0.8));
    u.alpha.value = 1 - gone;
    u.sunDirection.value.copy(sunDir);
    water.position.set(0, -28 - 3 * gone, -82);
    water.visible = gone < 0.99;
  }

  // --- skyline instances (facade + steel skeleton), rebuilt every frame from `crumble` ---
  const towers = useMemo(() => {
    const pal = ['#cdb9a0', '#bfa88f', '#d8cbb8', '#a99683', '#c4bdb3', '#c7a98d', '#9d968e', '#d4c0a5', '#b5674f', '#8e8a86'];
    const fac = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), facadeMat(), TOWERS.length);
    const frm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat(), TOWERS.length);
    TOWERS.forEach((b, i) => fac.setColorAt(i, new THREE.Color(pal[Math.floor(hash(i * 7.7) * pal.length)])));
    fac.frustumCulled = frm.frustumCulled = false;
    return { fac, frm };
  }, []);
  {
    const o = new THREE.Object3D();
    TOWERS.forEach((b, i) => {
      const k = clamp01((crumble - b.delay) / 0.5);
      // concrete: the top comes down into its own dust (pancake), some lean and topple; steel: cladding drops off, frame stays
      const left = b.steel ? 1 - k : 1 - k * 0.92;
      const hh = Math.max(0.01, b.h * left);
      const lean = b.topple * k * k;
      o.position.set(b.x + Math.sin(lean) * hh * 0.5, -28 + Math.cos(lean) * hh / 2, b.z);
      o.rotation.set(0, 0, -lean);
      o.scale.set(b.w, hh, b.d);
      o.updateMatrix();
      towers.fac.setMatrixAt(i, o.matrix);
      o.position.set(b.x, -28 + b.h / 2, b.z);
      o.rotation.set(0, 0, 0);
      o.scale.set(b.steel && k > 0 ? b.w : 0.0001, b.steel && k > 0 ? b.h : 0.0001, b.d);
      o.updateMatrix();
      towers.frm.setMatrixAt(i, o.matrix);
    });
    towers.fac.instanceMatrix.needsUpdate = true;
    towers.frm.instanceMatrix.needsUpdate = true;
  }

  const dustMats = useMemo(() => [0, 1, 2, 3].map((i) => new THREE.SpriteMaterial({ color: ['#a89276', '#8f7d68', '#c2ae92', '#d9d2c6'][i], transparent: true, depthWrite: false })), []);
  const puffMats = useMemo(() => [0, 1, 2].map((i) => new THREE.SpriteMaterial({ color: ['#ff6a14', '#ffa63c', '#ffe1a0'][i], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })), []);
  const smokeDark = useMemo(() => new THREE.SpriteMaterial({ color: '#3a2a20', transparent: true, depthWrite: false }), []);
  if (smokeTex) [...dustMats, ...puffMats, smokeDark].forEach((m) => (m.map = smokeTex));
  const spr = (m: THREE.SpriteMaterial, op: number) => {
    const x = m.clone();
    x.opacity = op;
    return x;
  };

  const bulbs = useMemo(() => {
    const out: { p: THREE.Vector3; id: number }[] = [];
    let id = 0;
    RUNS.forEach(([a, b]) => {
      const n = Math.round(a.distanceTo(b) / 0.9);
      for (let i = 1; i < n; i++) out.push({ p: sagPoint(a, b, i / n, 0.9), id: id++ });
    });
    return out;
  }, []);
  const wires = useMemo(() => RUNS.map(([a, b]) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, (_, i) => sagPoint(a, b, i / 23, 0.9))), new THREE.LineBasicMaterial({ color: '#1a1a1a' }))), []);
  const bulbOn = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffdca0', toneMapped: false }), []);
  const bulbOff = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b6258', roughness: 0.6 }), []);
  bulbOn.color.set('#ffdca0').multiplyScalar(0.6 + 1.6 * lights);

  if (people)
    people.forEach((h: Hero, i) => {
      const g = GUESTS[i];
      h.root.position.set(g.pos[0], g.pos[1], g.pos[2]);
      h.root.rotation.set(0, g.rotY, 0);
      standHero(h, t, clamp01((clutch - g.lag * 0.6) / 0.45), i * 1.7);
    });

  const flame = (i: number) => Math.max(0.001, fire * (0.75 + 0.25 * Math.sin(t * 17 + i * 2.1) * Math.sin(t * 7.3 + i)));

  return (
    <ThreeCanvas width={width} height={height} shadows camera={{ fov: c.fov ?? 50, position: c.pos, near: 0.05, far: 5000 }} gl={{ antialias: true }} onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }}>
      <CameraRig {...c} />
      <Env path="hdr/pedestrian_overpass_1k.hdr" intensity={0.3 * (1 - 0.5 * dusk) * (1 - 0.4 * haze)} />
      <primitive object={sky} />
      {/* dust veil over the sky */}
      {haze > 0 && (
        <mesh>
          <sphereGeometry args={[1500, 24, 16]} />
          <meshBasicMaterial color={sepia} side={THREE.BackSide} transparent opacity={0.85 * haze} fog={false} depthWrite={false} />
        </mesh>
      )}
      <fog attach="fog" args={[fogCol.getStyle(), 30 - 22 * haze, 900 - 760 * haze]} />
      <hemisphereLight args={['#c8b6e0', '#5a4038', 0.45 * (1 - 0.4 * dusk)]} />
      <directionalLight position={sunDir.clone().multiplyScalar(120).toArray()} intensity={2.2 * (1 - 0.6 * dusk) * (1 - 0.5 * haze)} color="#ffb07a" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} shadow-bias={-0.0004} />

      {/* ================= THE ROOF (camera frame) ================= */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1]} receiveShadow>
        <planeGeometry args={[25, 19]} />
        <meshStandardMaterial map={deckTex} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.5, -8.1]} castShadow receiveShadow>
        <boxGeometry args={[25, 1.0, 0.35]} />
        <meshStandardMaterial color="#4a4650" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.07, -8.1]}>
        <boxGeometry args={[25, 0.06, 0.12]} />
        <meshStandardMaterial color="#9aa0aa" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[-12.4, 0.5, 1]} receiveShadow>
        <boxGeometry args={[0.35, 1.0, 19]} />
        <meshStandardMaterial color="#4a4650" roughness={0.9} />
      </mesh>
      <mesh position={[0, -14.2, 1]}>
        <boxGeometry args={[25, 28, 19]} />
        <meshStandardMaterial color="#5a4a44" roughness={0.9} />
      </mesh>
      <mesh position={[-2, 1.6, 11.2]} castShadow receiveShadow>
        <boxGeometry args={[9, 3.2, 2.2]} />
        <meshStandardMaterial color="#6d5f5a" roughness={0.9} />
      </mesh>
      <mesh position={[-2.5, 1.1, 10.08]}>
        <planeGeometry args={[1.1, 2.2]} />
        <meshStandardMaterial color="#2a2226" emissive="#ffb35c" emissiveIntensity={0.15 * lights} />
      </mesh>

      {/* red-brick neighbour with real glass panes */}
      <mesh position={[19, 8, 1]} castShadow receiveShadow>
        <boxGeometry args={[13, 16, 19]} />
        <meshStandardMaterial map={brick} roughness={0.9} />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => {
        const fl = Math.floor(i / 6), col = i % 6;
        const lit = hash(i * 3.3) < 0.45;
        const y = 2.2 + fl * 3.4, z = -6 + col * 2.9;
        return (
          <group key={i}>
            <mesh position={[12.48, y, z]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[1.1, 1.7]} />
              <meshStandardMaterial color={lit ? '#ffd79a' : '#141820'} emissive={lit ? '#ffb85c' : '#000'} emissiveIntensity={lit ? 0.7 * lights : 0} />
            </mesh>
            {glass < 0.35 && (
              <mesh position={[12.4, y, z]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[1.12, 1.72]} />
                <meshStandardMaterial color="#cfe3f0" transparent opacity={0.4 * (1 - glass / 0.35)} metalness={0.9} roughness={0.03} />
              </mesh>
            )}
            {glass > 0 && glass < 1 && <sprite position={[12.0 - glass * 0.6, y - glass * glass * 6, z]} scale={[0.8 + glass * 1.2, 1.0 + glass * 1.6, 1]} material={spr(dustMats[3], 0.45 * Math.sin(Math.PI * glass))} />}
          </group>
        );
      })}

      {/* bar */}
      <mesh position={[-8.6, 0.55, 2]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 1.1, 8]} />
        <meshStandardMaterial color="#4a1818" roughness={0.6} />
      </mesh>
      <mesh position={[-8.6, 1.13, 2]}>
        <boxGeometry args={[1.25, 0.07, 8.2]} />
        <meshStandardMaterial color="#d9d4cc" roughness={0.25} metalness={0.1} />
      </mesh>
      <mesh position={[-11.6, 1.6, 2]}>
        <boxGeometry args={[0.4, 3.2, 8]} />
        <meshStandardMaterial color="#2a2226" />
      </mesh>
      {Array.from({ length: 18 }, (_, i) => (
        <mesh key={i} position={[-11.3, 1.4 + (i % 2) * 0.7, -1.4 + Math.floor(i / 2) * 0.8]} scale={[1, 1 - clamp01(glass * 3) * 0.999, 1]}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 8]} />
          <meshStandardMaterial color={['#4d7a3a', '#a8c8d8', '#8a4b20'][i % 3]} transparent opacity={0.85} roughness={0.08} metalness={0.2} />
        </mesh>
      ))}

      {/* high tables + drinking glasses */}
      {[[-3.3, 0.7], [6.0, 2.7], [-6.0, -5.0], [4.5, -6.0]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.53, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 1.06, 8]} />
            <meshStandardMaterial color="#555b66" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 1.07, 0]} castShadow>
            <cylinderGeometry args={[0.42, 0.42, 0.05, 24]} />
            <meshStandardMaterial color="#8a6a48" roughness={0.45} />
          </mesh>
          {[-0.15, 0.15].map((gx) => (
            <group key={gx} position={[gx, 1.16, 0.05]}>
              {glass < 0.33 && (
                <mesh>
                  <cylinderGeometry args={[0.04, 0.035, 0.14, 16, 1, true]} />
                  <meshStandardMaterial color="#e8eef2" transparent opacity={0.35 * (1 - glass * 3)} roughness={0.02} metalness={0.3} side={THREE.DoubleSide} />
                </mesh>
              )}
              {glass < 0.5 && (
                <mesh position={[0, -0.02 - glass * 0.1, 0]}>
                  <cylinderGeometry args={[0.036, 0.033, 0.08, 16]} />
                  <meshStandardMaterial color="#c8762a" transparent opacity={0.85 * (1 - glass * 2)} roughness={0.1} />
                </mesh>
              )}
            </group>
          ))}
        </group>
      ))}

      {/* fire pit */}
      <group position={[1.5, 0, -1.0]}>
        <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.7, 0.45, 0.95]} />
          <meshStandardMaterial color="#9a9690" roughness={0.95} />
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
                <coneGeometry args={[0.11, hgt, 8, 1, true]} />
                <meshBasicMaterial color="#ff7a1f" toneMapped={false} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, hgt * 0.32, 0]}>
                <coneGeometry args={[0.06, hgt * 0.6, 8, 1, true]} />
                <meshBasicMaterial color="#ffd38a" toneMapped={false} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        })}
        {fire > 0.01 && <sprite position={[0, 0.85, 0]} scale={[1.8 * fire, 1.6 * fire, 1]} material={spr(puffMats[1], 0.35 * fire)} />}
        <pointLight position={[0, 0.9, 0]} intensity={14 * fire} distance={9} color="#ff9a4a" />
      </group>

      {/* guests */}
      {people && people.map((h, i) => <primitive key={i} object={h.root} />)}

      {/* string lights */}
      {wires.map((l, i) => <primitive key={i} object={l} />)}
      {[[-11, -7.6], [-11, 3]].map(([x, z], i) => (
        <mesh key={i} position={[x, 1.75, z]}>
          <cylinderGeometry args={[0.05, 0.06, 3.5, 8]} />
          <meshStandardMaterial color="#6a6560" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {bulbs.map((b) => {
        const off = flicker > 0 && hash(b.id * 7.7 + Math.floor(t * 6) * 0.37) < flicker;
        return (
          <mesh key={b.id} position={b.p} material={lights > 0.02 && !off ? bulbOn : bulbOff}>
            <sphereGeometry args={[0.07, 10, 8]} />
          </mesh>
        );
      })}

      {/* ================= THE WORLD (moves when the roof falls) ================= */}
      <group position={[0, sink, -8]} rotation={[-tilt, 0, 0]}>
        <group position={[0, 0, 8]}>
          {/* river */}
          {water && <primitive object={water} />}
          {/* mist from the boiling-off river */}
          {boil > 0 &&
            Array.from({ length: 70 }, (_, i) => {
              const life = Math.sin(Math.PI * clamp01(boil * 1.2 - hash(i * 3.3) * 0.2)) * (1 - gone * 0.6);
              if (life <= 0.01) return null;
              const rise = (6 + 26 * hash(i * 2.2)) * boil;
              const sc = 10 + 22 * hash(i * 4.4) * (0.5 + boil);
              return <sprite key={'m' + i} position={[(hash(i * 5.1) - 0.5) * 320, -27 + rise, -26 - hash(i * 7.3) * 112]} scale={[sc, sc * 0.75, 1]} material={spr(dustMats[3], 0.55 * life)} />;
            })}
          {/* exposed riverbed */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -30.8, -82]} receiveShadow>
            <planeGeometry args={[900, 120]} />
            <meshStandardMaterial color="#4a3826" roughness={1} />
          </mesh>
          {gone > 0 &&
            Array.from({ length: 160 }, (_, i) => (
              <mesh key={'rb' + i} position={[(hash(i * 3.9) - 0.5) * 300, -30.75, -24 - hash(i * 6.1) * 116]} rotation={[0, hash(i * 2) * 3, 0]} scale={[1.5 + hash(i * 5) * 4, 0.12 + hash(i * 7) * 0.2, 1 + hash(i * 8) * 3]}>
                <dodecahedronGeometry args={[0.6, 0]} />
                <meshStandardMaterial color={i % 4 ? '#3e2e20' : '#6a5844'} roughness={0.9} metalness={0} />
              </mesh>
            ))}
          {[[-30, -48], [24, -95]].map(([x, z], i) => (
            <group key={i} position={[x, -27.6 - 3.0 * gone, z]} rotation={[0, 0.4 + i, gone * 0.3 * (i ? 1 : -1)]}>
              <mesh castShadow>
                <boxGeometry args={[7, 1.2, 2.4]} />
                <meshStandardMaterial color={i ? '#d8d2c8' : '#6a2420'} roughness={0.5} />
              </mesh>
              <mesh position={[-0.8, 1.1, 0]}>
                <boxGeometry args={[2.6, 1.1, 1.8]} />
                <meshStandardMaterial color="#e8e4dc" roughness={0.4} />
              </mesh>
            </group>
          ))}
          {/* embankments + far bank ground */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -27.8, -14]}>
            <planeGeometry args={[800, 16]} />
            <meshStandardMaterial color="#2f4a2c" roughness={1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -27.8, -262]}>
            <planeGeometry args={[1200, 240]} />
            <meshStandardMaterial color="#5b5f66" roughness={1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -27.8, 80]}>
            <planeGeometry args={[800, 140]} />
            <meshStandardMaterial color="#5b5f66" roughness={1} />
          </mesh>
          {/* skyline */}
          <primitive object={towers.fac} />
          <primitive object={towers.frm} />
          {/* collapse dust: rolling clouds at the base, curtains pouring off the towers */}
          {crumble > 0 &&
            TOWERS.map((b, i) => {
              const k = clamp01((crumble - b.delay) / 0.5);
              if (k <= 0) return null;
              const base = Math.min(1, k * 2);
              const sc = b.w * (1.0 + 2.6 * k);
              return (
                <group key={'d' + i}>
                  <sprite position={[b.x, -28 + sc * 0.3, b.z + b.d * 0.6]} scale={[sc, sc * 0.7, 1]} material={spr(dustMats[i % 3], 0.75 * base)} />
                  <sprite position={[b.x + b.w * 0.5, -28 + b.h * (0.35 + 0.3 * (1 - k)), b.z + b.d * 0.6]} scale={[b.w * 0.9, b.h * 0.8, 1]} material={spr(dustMats[2], 0.45 * Math.sin(Math.PI * k))} />
                </group>
              );
            })}
          {/* our own building's dust pouring past as the roof drops */}
          {sink > 0.5 &&
            Array.from({ length: 24 }, (_, i) => (
              <sprite key={'s' + i} position={[(hash(i * 2.1) - 0.5) * 40, -28 + hash(i * 3.3) * 28 - sink * 0.3, -9 - hash(i * 5.5) * 6]} scale={[12, 9, 1]} material={spr(dustMats[i % 3], Math.min(0.7, sink * 0.08))} />
            ))}
          {/* ignition + hydrogen fire front rolling toward the camera */}
          {spark > 0 && (
            <group position={[0, -16, -60]}>
              <mesh>
                <sphereGeometry args={[0.6 + 1.6 * spark, 16, 12]} />
                <meshBasicMaterial color="#fff4dc" toneMapped={false} />
              </mesh>
              <sprite scale={[16 * spark, 16 * spark, 1]} material={spr(puffMats[2], 0.9)} />
              <pointLight intensity={4000 * spark} distance={220} color="#ffd9a0" />
            </group>
          )}
          {fireball > 0 &&
            Array.from({ length: 110 }, (_, i) => {
              const hot = i % 4 !== 3;
              const sc = 10 + 20 * hash(i * 4.4) + 6 * Math.sin(t * 3 + i);
              const x = (hash(i * 1.3) - 0.5) * 240;
              const y = -26 + hash(i * 7.7) ** 0.7 * (40 + 55 * fireball) + Math.sin(t * 1.5 + i) * 2;
              const z = fireZ - hash(i * 9.9) * 45 + Math.sin(t * 2 + i) * 3;
              return <sprite key={'f' + i} position={[x, y, z]} scale={[sc, sc, 1]} material={hot ? spr(puffMats[i % 3], clamp01(fireball * 1.4) * (0.35 + 0.4 * hash(i * 2.9))) : spr(smokeDark, 0.6 * clamp01(fireball * 1.4))} />;
            })}
          {fireball > 0 && <pointLight position={[0, 6, fireZ + 8]} intensity={9000 * fireball} distance={280} color="#ff9a4a" />}
        </group>
      </group>

      {/* rocks thrown at the lens (camera space-ish, ignore the roof motion) */}
      {debris > 0 &&
        Array.from({ length: 46 }, (_, i) => {
          const f = (hash(i * 6.6) + t * (0.35 + hash(i) * 0.35)) % 1;
          const z = THREE.MathUtils.lerp(fireZ, c.pos[2] + 2, f);
          const x = c.pos[0] + (hash(i * 2.7) - 0.5) * 30 * (1 - f) + (hash(i * 3.1) - 0.5) * 3;
          const y = c.pos[1] + (hash(i * 4.9) - 0.5) * 18 * (1 - f) + 6 * Math.sin(Math.PI * f) * (hash(i) - 0.3);
          return (
            <mesh key={'r' + i} position={[x, y, z]} rotation={[t * 3 + i, t * 2 + i, 0]} scale={debris * (0.15 + hash(i * 8.8) * 0.4)}>
              <dodecahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color="#2a1a12" roughness={1} flatShading />
            </mesh>
          );
        })}

      <Redraw deps={[deckTex, smokeTex, normals, people]} />
      <Post bloom={bloom} bloomThreshold={0.85} focus={focus} aperture={aperture} maxblur={0.01} />
    </ThreeCanvas>
  );
};
