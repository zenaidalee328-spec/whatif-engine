import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, SkyDome, hash, skyAt } from './common3d';
import { Car } from './Street';
import { Post, Redraw, useGLB } from './fx3d';
import { Aura, MachCone, Puffs, RigSpec, ShockDomes, Trail, makeRig, pose, rigCam, sprayData } from './runner';

/*
  Downtown avenue for "run twice as fast every 2 seconds".
  Avenue along -z: road |x| < 7 (lanes x = ±1.6, ±4.8), sidewalks 7..12, building fronts from |x| = 12.
  Runner starts at z = 0 on the right sidewalk (x = 9) and runs toward -z.
  Speed: v(rt) = v0 * 2^(rt/2) km/h (rt = run time since the walk started). Distance has a closed form.
  params: rt, v0 (km/h, default 5), rig {mode, dist, height, side, fov}, hook (0..1 flash-forward mode),
          trafficSpeed, bloom, aperture, clock
*/
const KMH = 1 / 3.6;
export const runDist = (rt: number, v0 = 5) => (rt <= 0 ? v0 * KMH * rt : v0 * KMH * (2 / Math.LN2) * (Math.pow(2, rt / 2) - 1));
export const runSpeed = (rt: number, v0 = 5) => v0 * Math.pow(2, Math.max(0, rt) / 2);

// ---------- buildings with procedural windows (world-space pattern injected into a standard material) ----------
export const windowMaterial = (() => {
  let m: THREE.MeshStandardMaterial | null = null;
  return () => {
    if (m) return m;
    m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           if (abs(vWN.y) < 0.5) {
             float u = abs(vWN.x) > 0.5 ? vWP.z : vWP.x;
             float fx = fract(u / 2.2); float fy = fract((vWP.y - 0.6) / 3.2);
             float win = step(0.2, fx) * step(fx, 0.8) * step(0.25, fy) * step(fy, 0.85) * step(3.6, vWP.y);
             float shop = step(vWP.y, 3.4) * step(0.6, vWP.y) * step(0.06, fract(u / 6.0)) * step(fract(u / 6.0), 0.94);
             vec3 glass = mix(vec3(0.18,0.24,0.32), vec3(0.55,0.68,0.8), fract(sin(dot(floor(vec2(u/2.2, vWP.y/3.2)), vec2(12.9898,78.233)))*43758.5453) * 0.6);
             diffuseColor.rgb = mix(diffuseColor.rgb, glass, max(win, shop * 0.85));
           }`,
        );
    };
    return m;
  };
})();

type Bld = { x: number; z: number; w: number; d: number; h: number; c: THREE.Color };
export const buildings = (() => {
  const out: Bld[] = [];
  const pal = ['#d9c4a8', '#c9b49a', '#e3d6c2', '#b8a58e', '#cfc6bb', '#d4b89c', '#a9a29a', '#e0cdb4'];
  let k = 0;
  for (const side of [-1, 1]) {
    let z = 80;
    while (z > -900) {
      k++;
      const w = 14 + hash(k) * 16;
      const tall = hash(k + 3);
      out.push({ x: side * (12 + 9), z: z - w / 2, w: w - 0.6, d: 18, h: 14 + tall * tall * 46, c: new THREE.Color(pal[Math.floor(hash(k + 5) * pal.length)]) });
      z -= w + (hash(k + 9) < 0.15 ? 14 : 0); // occasional side street
    }
  }
  // a second row behind for depth
  for (const side of [-1, 1])
    for (let z = 60; z > -900; z -= 22) {
      k++;
      out.push({ x: side * (48 + hash(k) * 10), z, w: 18, d: 18, h: 25 + hash(k + 1) * 60, c: new THREE.Color('#c3b8ab').multiplyScalar(0.85 + hash(k + 2) * 0.25) });
    }
  return out;
})();

export const Buildings: React.FC = () => {
  const inst = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), windowMaterial(), buildings.length);
    const o = new THREE.Object3D();
    buildings.forEach((b, i) => {
      o.position.set(b.x, b.h / 2, b.z);
      o.scale.set(b.d, b.h, b.w);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, b.c);
    });
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }, []);
  return <primitive object={inst} />;
};

export const Trees: React.FC = () => {
  const items = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let z = 60; z > -900; z -= 13) for (const s of [-1, 1]) out.push([s * 10.8, z + hash(z + s) * 3, 0.85 + hash(z * 3 + s) * 0.4]);
    return out;
  }, []);
  const meshes = useMemo(() => {
    const N = items.length;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 8), new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 0.95 }), N);
    // crown = 4 lumpy blobs per tree
    const blobGeo = new THREE.IcosahedronGeometry(1, 2);
    const p = blobGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = 1 + 0.18 * Math.sin(v.x * 7.1) * Math.sin(v.y * 6.3 + 1) * Math.sin(v.z * 5.7 + 2);
      v.multiplyScalar(n);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    blobGeo.computeVertexNormals();
    const crown = new THREE.InstancedMesh(blobGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), N * 4);
    const o = new THREE.Object3D();
    items.forEach(([x, z, s], i) => {
      o.position.set(x, 1.6 * s, z);
      o.rotation.set(0, 0, 0);
      o.scale.set(s, s, s);
      o.updateMatrix();
      trunk.setMatrixAt(i, o.matrix);
      for (let k = 0; k < 4; k++) {
        const a = hash(i * 4 + k) * Math.PI * 2;
        const rr = k === 0 ? 0 : 0.9;
        o.position.set(x + Math.cos(a) * rr * s, (3.9 + (k === 0 ? 0.6 : hash(i + k) * 0.6)) * s, z + Math.sin(a) * rr * s);
        o.rotation.set(hash(i + k * 3), hash(i * 2 + k), 0);
        const sc = (k === 0 ? 1.7 : 1.15 + hash(i * 7 + k) * 0.35) * s;
        o.scale.set(sc, sc * 0.85, sc);
        o.updateMatrix();
        crown.setMatrixAt(i * 4 + k, o.matrix);
        crown.setColorAt(i * 4 + k, new THREE.Color().setHSL(0.24 + hash(i + k * 5) * 0.06, 0.45, 0.2 + hash(i * 3 + k) * 0.09));
      }
    });
    trunk.castShadow = crown.castShadow = true;
    crown.receiveShadow = true;
    return [trunk, crown];
  }, [items]);
  return (
    <>
      <primitive object={meshes[0]} />
      <primitive object={meshes[1]} />
    </>
  );
};

const PEDS = [
  { x: 9.6, z: -14, dir: 1, suit: '#c0567a', skin: '#f0c8a8', hair: '#5a3a20', speed: 1.3 },
  { x: 8.2, z: -30, dir: 1, suit: '#3c6f5a', skin: '#a8714f', hair: '#1a1410', speed: 1.2 },
  { x: -9.2, z: -8, dir: -1, suit: '#8a6a3a', skin: '#d9a27a', hair: '#2a1d16', speed: 1.35 },
  { x: -8.4, z: -26, dir: 1, suit: '#5a6070', skin: '#7a4f35', hair: '#141010', speed: 1.25 },
  { x: 9.0, z: 12, dir: -1, suit: '#d9a23a', skin: '#e8b890', hair: '#8a6a3a', speed: 1.3 },
  { x: -9.6, z: -48, dir: -1, suit: '#e8e4dc', skin: '#c98e64', hair: '#2a1d16', speed: 1.2 },
];
const TRAFFIC = [
  { x: 4.8, z: -40, v: -11, c: '#c0392b' },
  { x: 1.6, z: -10, v: -13, c: '#ecf0f1' },
  { x: 4.8, z: 15, v: -12, c: '#f1c40f' },
  { x: -1.6, z: -70, v: 12, c: '#2e86c1' },
  { x: -4.8, z: -25, v: 10, c: '#27ae60' },
  { x: -1.6, z: -120, v: 13, c: '#1c2a4a' },
  { x: 1.6, z: -95, v: -12, c: '#7a2a2a' },
  { x: -4.8, z: -160, v: 11, c: '#d98a1c' },
];

export type RunCityProps = {
  t: number;
  cam: CamProps | null;
  rt: number;
  v0?: number;
  rig?: RigSpec;
  laneX?: number; // runner x position (sidewalk 9 -> road 2)
  hook?: number; // flash-forward: a streak at hookSpeed passes a fixed camera and throws the cars
  hookSpeed?: number;
  hookT?: number;
  bloom?: number;
  aperture?: number;
  clock?: number;
  terrace?: number; // café tables + chairs on the right sidewalk (z -38..-72) that fly when the runner passes
  shards?: number; // windows burst into glass when the runner passes (hook mode)
  freeze?: number; // world time frozen at this value (peds + traffic)
  runZ?: number; // override runner z
  phase?: number; // override gait phase
  aura?: number;
  trail?: number;
  cone?: number;
  domes?: number[];
  dust?: number;
};

const TERRACE = Array.from({ length: 14 }, (_, i) => ({ x: 8.6 + (i % 2) * 2.0, z: -40 - Math.floor(i / 2) * 4.6 - (i % 2) * 1.5, r: hash(i * 3.3), umb: i % 3 === 0 }));
const SHARDS = Array.from({ length: 1800 }, (_, i) => ({ side: i % 2 ? 1 : -1, z: 80 - hash(i * 1.7) * 600, y: 4 + hash(i * 2.3) * 40, r: hash(i * 5.1), r2: hash(i * 7.9) }));

export const RunCityScene: React.FC<RunCityProps> = ({ t: tReal, cam, rt, v0 = 5, rig, laneX = 9, hook = 0, hookSpeed = 300, hookT = 0, bloom = 0.35, aperture = 0, clock = 16.4, terrace = 0, shards = 0, freeze, runZ, phase: phaseO, aura = 0, trail = 0, cone = 0, domes, dust = 0 }) => {
  const t = freeze ?? tReal;
  const { width, height } = useVideoConfig();
  const gltf = useGLB('models/Xbot.glb');
  const sky = skyAt(clock);
  const rigs = useMemo(() => {
    if (!gltf) return null;
    const runner = makeRig(gltf.scene, gltf.animations, '#2b3a6b', '#e0ac85', '#2a1d16', true);
    const peds = PEDS.map((p) => makeRig(gltf.scene, gltf.animations, p.suit, p.skin, p.hair, false));
    return { runner, peds };
  }, [gltf]);
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#ffe2bc', 3.0);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const sc = l.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -40;
    sc.right = sc.top = 40;
    sc.far = 260;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.02;
    return l;
  }, []);

  // ---------- runner ----------
  const hooking = hook > 0.5;
  const d = runDist(rt, v0);
  const v = runSpeed(rt, v0);
  const rz = runZ ?? (hooking ? -60 + hookSpeed * KMH * hookT : -d);
  const rx = hooking ? 2 : laneX;
  // gait phase: integrate cadence (walk 1.0 cycle/s at 5 km/h, run cadence grows but caps)
  let phase = 0;
  const dt = 1 / 60;
  for (let s = 0; s < Math.max(0, rt); s += dt) {
    const vv = runSpeed(s, v0);
    phase += Math.min(3.2, vv < 9 ? vv / 5 : 1.1 + vv / 30) * dt;
  }
  if (hooking) phase = hookT * 3.2;
  if (phaseO !== undefined) phase = phaseO;
  const runMix = hooking ? 1 : THREE.MathUtils.smoothstep(v, 7, 11);
  if (rigs) {
    pose(rigs.runner, phase, runMix);
    rigs.runner.root.position.set(rx, 0.12, rz);
    rigs.runner.root.rotation.set(0, hooking ? 0 : Math.PI, 0);
    rigs.runner.root.scale.setScalar(1);
    rigs.peds.forEach((r, i) => {
      const p = PEDS[i];
      const tt = t + i * 0.37;
      pose(r, tt * p.speed * 0.75, 0);
      r.root.position.set(p.x, 0.12, p.z + p.dir * -p.speed * t);
      r.root.rotation.set(0, p.dir > 0 ? Math.PI : 0, 0);
    });
  }

  // ---------- camera rig relative to the runner ----------
  let c: CamProps = cam ?? { pos: [rx + 3, 1.6, rz - 5], look: [rx, 1.1, rz], fov: 50 };
  if (rig) c = rigCam(rig as RigSpec, rx, rz);
  const focus = Math.hypot(c.pos[0] - rx, c.pos[1] - 1.1, c.pos[2] - rz);
  const tgt: [number, number, number] = [rx, 0, rz - 10];
  sun.position.set(tgt[0] + 35, 55, tgt[2] + 40);
  sun.target.position.set(...tgt);
  sun.target.updateMatrixWorld();

  return (
    <ThreeCanvas
      width={width}
      height={height}
      shadows
      camera={{ fov: c.fov ?? 50, position: [0, 2, 10], near: 0.05, far: 2500 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <CameraRig {...c} />
      <SkyDome top={sky.top} bottom={sky.bottom} stars={0} radius={2000} />
      <fog attach="fog" args={['#cfd8e4', 120, 900]} />
      <hemisphereLight args={['#dfeaff', '#7a6a58', 1.0]} />
      <ambientLight intensity={0.25} color="#fff1e0" />
      <primitive object={sun} />
      <primitive object={sun.target} />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -400]} receiveShadow>
        <planeGeometry args={[60, 1100]} />
        <meshStandardMaterial color="#3f4248" roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -400]}>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial color="#8a8478" roughness={1} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 9.5, 0.06, -400]} receiveShadow>
          <boxGeometry args={[5, 0.12, 1100]} />
          <meshStandardMaterial color="#b9b3a9" roughness={0.9} />
        </mesh>
      ))}
      {/* lane markings + crosswalks */}
      {Array.from({ length: 160 }).map((_, k) => (
        <React.Fragment key={k}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.2, 0.012, 60 - k * 6]}>
            <planeGeometry args={[0.14, 3]} />
            <meshBasicMaterial color="#e8e4d6" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-3.2, 0.012, 60 - k * 6]}>
            <planeGeometry args={[0.14, 3]} />
            <meshBasicMaterial color="#e8e4d6" />
          </mesh>
        </React.Fragment>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, -400]}>
        <planeGeometry args={[0.32, 1100]} />
        <meshBasicMaterial color="#e6c84a" />
      </mesh>
      {[-30, -110, -190, -270].map((z) =>
        Array.from({ length: 12 }).map((_, k) => (
          <mesh key={`${z}${k}`} rotation={[-Math.PI / 2, 0, 0]} position={[-6.3 + k * 1.15, 0.014, z]}>
            <planeGeometry args={[0.6, 4]} />
            <meshBasicMaterial color="#f2f0ea" />
          </mesh>
        )),
      )}
      <Buildings />
      <Trees />
      {/* traffic: thrown into the air by the wake in the flash-forward */}
      {TRAFFIC.map((k, i) => {
        let z = k.z + k.v * (hooking ? (freeze ?? hookT) : t);
        let y = 0, rx2 = 0, rz2 = 0;
        if (hooking && rz > z) {
          const since = (rz - z) / (hookSpeed * KMH);
          y = Math.max(0, 9 * since - 4.9 * since * since + 6 * since);
          rx2 = since * (3 + hash(i) * 4);
          rz2 = since * (hash(i + 3) - 0.5) * 8;
          z -= since * 6;
        }
        return (
          <group key={i} position={[0, y, 0]} rotation={[0, 0, 0]}>
            <group position={[k.x, 0, z]} rotation={[rx2, 0, rz2]}>
              <Car x={0} z={0} rotY={k.v < 0 ? Math.PI : 0} color={k.c} />
            </group>
          </group>
        );
      })}
      <Car x={5.9} z={-18} rotY={Math.PI} color="#6b6e76" />
      <Car x={-5.9} z={-44} rotY={0} color="#b8b2a8" />
      <Car x={5.9} z={-62} rotY={Math.PI} color="#2d4f9c" />

      {terrace > 0 &&
        TERRACE.map((k, i) => {
          const vms = Math.max(3, v * KMH);
          const s2 = rz < k.z ? (k.z - rz) / vms : 0;
          const dir = k.x > rx ? 1 : -1;
          const y = Math.max(0, (4 + 4 * k.r) * s2 - 4.9 * s2 * s2);
          const pos: [number, number, number] = [k.x + dir * (3 + 4 * k.r) * s2, 0.12 + y, k.z - (3 + 6 * k.r) * s2];
          const rot: [number, number, number] = [s2 * (4 + 6 * k.r), s2 * 3, s2 * (5 * k.r - 2.5)];
          return (
            <group key={i} position={pos} rotation={rot}>
              <mesh position={[0, 0.74, 0]} castShadow>
                <cylinderGeometry args={[0.42, 0.42, 0.04, 20]} />
                <meshStandardMaterial color="#f4f1ea" />
              </mesh>
              <mesh position={[0, 0.37, 0]}>
                <cylinderGeometry args={[0.03, 0.05, 0.74, 8]} />
                <meshStandardMaterial color="#2a2a2a" metalness={0.6} />
              </mesh>
              {[-1, 1].map((cs) => (
                <group key={cs} position={[cs * 0.62, 0, 0]} rotation={[0, (cs * Math.PI) / 2, 0]}>
                  <mesh position={[0, 0.45, 0]} castShadow>
                    <boxGeometry args={[0.42, 0.04, 0.42]} />
                    <meshStandardMaterial color="#8a5a34" />
                  </mesh>
                  <mesh position={[0, 0.72, -0.2]}>
                    <boxGeometry args={[0.42, 0.5, 0.04]} />
                    <meshStandardMaterial color="#8a5a34" />
                  </mesh>
                  <mesh position={[0, 0.22, 0]}>
                    <boxGeometry args={[0.36, 0.44, 0.36]} />
                    <meshStandardMaterial color="#2a2a2a" wireframe />
                  </mesh>
                </group>
              ))}
              {k.umb && (
                <>
                  <mesh position={[0, 1.5, 0]}>
                    <cylinderGeometry args={[0.025, 0.025, 1.6, 6]} />
                    <meshStandardMaterial color="#ddd" />
                  </mesh>
                  <mesh position={[0, 2.25, 0]} castShadow>
                    <coneGeometry args={[1.4, 0.5, 12, 1, true]} />
                    <meshStandardMaterial color={i % 2 ? '#c23b3b' : '#f0e6d2'} side={THREE.DoubleSide} />
                  </mesh>
                </>
              )}
            </group>
          );
        })}
      {shards > 0 && (() => {
        const n = SHARDS.length;
        const pos = new Float32Array(n * 3), a = new Float32Array(n), sz = new Float32Array(n);
        const vel = hookSpeed * KMH;
        SHARDS.forEach((k, i) => {
          const passed = hooking ? rz > k.z : rz < k.z;
          const s2 = passed ? Math.abs(rz - k.z) / vel + 0.02 : 0;
          const y = k.y + (2 + 4 * k.r2) * s2 - 4.9 * s2 * s2;
          pos[i * 3] = k.side * (12.1 - s2 * (5 + 9 * k.r));
          pos[i * 3 + 1] = Math.max(0.1, y);
          pos[i * 3 + 2] = k.z + s2 * (k.r2 - 0.5) * 8;
          a[i] = passed ? shards * (y > 0.2 ? 1 : 0.4) * (0.5 + 0.5 * Math.sin(i + tReal * 30)) : 0;
          sz[i] = 0.25 + 0.35 * k.r;
        });
        return <Puffs data={{ pos, a, s: sz }} color="#e6f4ff" additive />;
      })()}
      {dust > 0 && <Puffs data={sprayData('dust', 1400, tReal, dust, hooking ? -90 : 90, 12, 0.3, 4, [rx, 0, rz])} color="#b8a990" />}
      <Aura pos={[rx, 0.12, rz]} amount={aura} t={tReal} />
      <MachCone pos={[rx, 0.12, rz]} amount={cone} t={tReal} />
      <ShockDomes t={tReal} at={domes ?? []} center={[rx, 0, rz]} speed={90} life={1.4} />
      <Trail from={[rx, 0.95, rz + (hooking ? -0.3 : 0.3)]} len={hooking ? -160 : 160} width={0.8} amount={trail} color="#ffcf8a" vertical />
      {rigs && (
        <>
          <primitive object={rigs.runner.root} />
          {rigs.peds.map((r, i) => (
            <primitive key={i} object={r.root} />
          ))}
        </>
      )}
      {/* light trail behind a very fast runner */}
      {(hooking || v > 120) && (
        <mesh position={[rx, 0.9, rz + 6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.6, 12]} />
          <meshBasicMaterial color={new THREE.Color(3, 2.4, 1.6)} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <Redraw deps={[rigs]} />
      <Post bloom={bloom} focus={focus} aperture={aperture} />
    </ThreeCanvas>
  );
};
