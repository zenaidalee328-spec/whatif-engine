import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { CamProps, CameraRig, hash } from './common3d';
import { Env, Post, Redraw, useTex } from './fx3d';
import { buildings, Trees } from './RunCity';
import { Puffs, RigSpec, ShockDomes, Trail, rigCam, sprayData } from './runner';
import { Hero, bodyFireData, hatHero, heatHero, poseHero, useHeroFactory } from './hero';
import { useCarFactory } from './cars';
import { MachCone, Aura, FeetFire } from './runner';

/*
  City v2 — photoreal-ish downtown avenue for the run.
  Avenue along -z: road |x| < 7 (lanes ±1.6, ±4.8), sidewalks 7..12 (y 0.12), facades from |x| = 12.
  The HERO state comes from the timeline (generator does the physics): heroZ, heroX, phase, run, sprint, lean, hatFly, heat.
  Effects:
    wind 0..1        papers/leaves sucked into the wake
    shock {v}        windows burst as the hero passes (v = hero speed m/s, for timing)
    blasts [{t,x,z,e}]  footstep explosions (e = tons of TNT -> size), throw nearby cars, leave craters
    doppler 0..1     relativistic look: ahead blue-violet & squeezed, behind red (done in post)
*/

// ---------- facades: reflective glass windows, floor ledges, shop fronts ----------
export const facadeMat = (() => {
  let m: THREE.MeshStandardMaterial | null = null;
  return () => {
    if (m) return m;
    m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 });
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
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; float gWin = 0.0; float gLit = 0.0;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           if (abs(vWN.y) < 0.5) {
             float u = abs(vWN.x) > 0.5 ? vWP.z : vWP.x;
             vec2 cell = floor(vec2(u / 2.6, (vWP.y - 0.4) / 3.4));
             float fx = fract(u / 2.6), fy = fract((vWP.y - 0.4) / 3.4);
             float win = step(0.16, fx) * step(fx, 0.84) * step(0.22, fy) * step(fy, 0.88) * step(4.2, vWP.y);
             float mull = 1.0 - step(0.485, fx) * step(fx, 0.515);
             win *= mull;
             float ledge = step(fy, 0.06) * step(4.0, vWP.y);
             float shop = step(vWP.y, 3.6) * step(0.5, vWP.y) * step(0.05, fract(u / 7.0)) * step(fract(u / 7.0), 0.95);
             float n = h21(floor(vWP.xz * 3.0) + floor(vWP.y * 3.0));
             diffuseColor.rgb *= 0.92 + 0.12 * n;
             diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62, ledge);
             gWin = max(win, shop);
             gLit = step(0.93, h21(cell + floor(vWP.x * 0.05))) * win + shop * 0.35;
             diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.07, 0.09), gWin);
           } else {
             diffuseColor.rgb *= 0.55;
           }`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, gWin);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.95, gWin);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.78, 0.5) * gLit * 0.6;');
    };
    return m;
  };
})();

const Facades: React.FC = () => {
  const inst = useMemo(() => {
    const pal = ['#cdb9a0', '#bfa88f', '#d8cbb8', '#a99683', '#c4bdb3', '#c7a98d', '#9d968e', '#d4c0a5', '#b5674f', '#8e5a45'];
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), facadeMat(), buildings.length);
    const o = new THREE.Object3D();
    buildings.forEach((b, i) => {
      o.position.set(b.x, b.h / 2, b.z);
      o.scale.set(b.d, b.h, b.w);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, new THREE.Color(pal[Math.floor(hash(i * 7.7) * pal.length)]));
    });
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }, []);
  return <primitive object={inst} />;
};

// ---------- street furniture ----------
const Furniture: React.FC = () => {
  const items = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let z = 40; z > -700; z -= 26) {
      for (const s of [-1, 1]) {
        out.push(
          <group key={`l${z}${s}`} position={[s * 7.6, 0.12, z]}>
            <mesh position={[0, 3.2, 0]} castShadow>
              <cylinderGeometry args={[0.07, 0.1, 6.4, 8]} />
              <meshStandardMaterial color="#2b2f33" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[-s * 0.7, 6.3, 0]}>
              <boxGeometry args={[1.5, 0.08, 0.12]} />
              <meshStandardMaterial color="#2b2f33" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[-s * 1.35, 6.2, 0]}>
              <boxGeometry args={[0.5, 0.14, 0.26]} />
              <meshStandardMaterial color="#e8e2d0" emissive="#fff2d6" emissiveIntensity={0.2} />
            </mesh>
          </group>,
        );
      }
    }
    return out;
  }, []);
  return <>{items}</>;
};

// ---------- papers / leaves pulled into the wake (relative to the hero) ----------
const PAPERS = Array.from({ length: 70 }, (_, i) => ({ a: hash(i * 3.1), b: hash(i * 5.7), c: hash(i * 9.3), leaf: i % 3 === 0 }));
const Papers: React.FC<{ t: number; amount: number; at: [number, number, number] }> = ({ t, amount, at }) => {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.21, 0.29), new THREE.MeshStandardMaterial({ color: '#f3f1ea', side: THREE.DoubleSide, roughness: 0.9 }), PAPERS.length);
    PAPERS.forEach((p, i) => m.setColorAt(i, new THREE.Color(p.leaf ? (p.b > 0.5 ? '#c98b2e' : '#8a5a22') : '#f4f2ec')));
    m.castShadow = true;
    return m;
  }, []);
  const o = new THREE.Object3D();
  PAPERS.forEach((p, i) => {
    const u = (p.a + t * (0.6 + p.b * 0.8)) % 1; // life along the wake
    const back = 1 + u * 14;
    const swirl = Math.sin(t * 6 + i) * (0.4 + u * 1.6);
    o.position.set(at[0] + (p.b - 0.5) * 3 * u + swirl * 0.5, 0.15 + u * (1.2 + p.c * 2.5) * Math.abs(Math.sin(u * 3 + p.c * 6)), at[2] + back);
    o.rotation.set(t * (4 + p.a * 9), t * (3 + p.b * 7), t * (2 + p.c * 5));
    o.scale.setScalar(amount > 0.01 ? (p.leaf ? 0.6 : 1) * Math.min(1, amount * 2) : 0);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return <primitive object={mesh} />;
};

// ---------- footstep blasts ----------
export type Blast = { t: number; x: number; z: number; e: number }; // e = tons TNT
const blastR = (e: number) => 3.2 * Math.cbrt(Math.max(0.01, e)); // fireball/visual radius (m), scaled like explosions (∝ E^1/3)

const Blasts: React.FC<{ t: number; list: Blast[]; smoke: THREE.Texture | null }> = ({ t, list, smoke }) => {
  const live = list.filter((b) => t >= b.t - 0.001 && t < b.t + 4);
  return (
    <>
      {list.map((b, i) =>
        t >= b.t ? (
          <group key={`c${i}`} position={[b.x, 0.03, b.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh receiveShadow>
              <circleGeometry args={[blastR(b.e) * 0.42, 28]} />
              <meshStandardMaterial color="#14120f" roughness={1} />
            </mesh>
            <mesh position={[0, 0, 0.01]}>
              <ringGeometry args={[blastR(b.e) * 0.42, blastR(b.e) * 0.62, 28]} />
              <meshStandardMaterial color="#4a443c" roughness={1} />
            </mesh>
          </group>
        ) : null,
      )}
      {live.map((b, i) => {
        const s = t - b.t;
        const R = blastR(b.e);
        const n = 90;
        // fireball: hot puffs expanding + rising, cooling from white to orange, then gone
        const fpos = new Float32Array(n * 3), fa = new Float32Array(n), fs = new Float32Array(n);
        const spos = new Float32Array(n * 3), sa = new Float32Array(n), ss = new Float32Array(n);
        for (let k = 0; k < n; k++) {
          const h1 = hash(k * 1.3 + i), h2 = hash(k * 2.1 + i), h3 = hash(k * 3.7 + i);
          const th = h1 * Math.PI * 2, ph = Math.acos(h2), rr = R * (0.25 + 0.75 * Math.cbrt(h3));
          const grow = 1 - Math.exp(-s * 9);
          const dx = Math.cos(th) * Math.sin(ph), dy = Math.cos(ph), dz = Math.sin(th) * Math.sin(ph);
          fpos[k * 3] = b.x + dx * rr * grow;
          fpos[k * 3 + 1] = Math.max(0.3, dy * rr * grow * 0.9 + s * R * 0.5);
          fpos[k * 3 + 2] = b.z + dz * rr * grow;
          fa[k] = Math.max(0, 1 - s / (0.45 + 0.3 * h1)) * 0.95;
          fs[k] = R * (0.7 + 0.6 * h2) * (0.5 + grow);
          // smoke: slower, rises into a column + cap, lingers
          const sg = 1 - Math.exp(-s * 2.2);
          spos[k * 3] = b.x + dx * rr * 1.2 * sg;
          spos[k * 3 + 1] = Math.max(0.5, dy * rr * 0.8 * sg + s * R * 0.9 * (0.4 + 0.6 * h3));
          spos[k * 3 + 2] = b.z + dz * rr * 1.2 * sg;
          sa[k] = Math.min(1, s * 4) * Math.max(0, 1 - s / 4) * 0.75;
          ss[k] = R * (1.0 + 0.8 * h1) * (0.6 + sg);
        }
        const ring = Math.min(1, s / 0.6);
        const fc = s < 0.08 ? '#fff0c8' : s < 0.2 ? '#ffb347' : s < 0.4 ? '#f2701c' : '#8a3a14';
        return (
          <group key={`b${i}`}>
            {s < 0.06 && (
              <sprite position={[b.x, R * 0.4, b.z]} scale={[R * 1.6, R * 1.6, 1]}>
                <spriteMaterial map={smoke} color={new THREE.Color(2.2, 1.8, 1.2)} transparent opacity={0.7 * (1 - s / 0.06)} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
              </sprite>
            )}
            <Puffs data={{ pos: spos, a: sa, s: ss }} color="#2b2724" map={smoke} />
            <Puffs data={{ pos: fpos, a: fa, s: fs }} color={fc} map={smoke} />
            <Puffs data={sprayData('dust', 160, ring * 0.999 + i * 0.13, 0.45 * Math.max(0, 1 - s / 2.5), R * 3.0 * ring + 0.1, R * 0.45, 1.2, R * 0.7, [b.x, 0, b.z - R * 1.5 * ring], 0)} color="#6a5c4c" map={smoke} />
            <Puffs data={sprayData('sparks', 140, Math.min(0.999, s * 0.7) + i * 0.07, Math.max(0, 1 - s / 1.6), R * 2.5, R * 2.2, 1, 0.35, [b.x, 0, b.z - R], 0)} color="#1c1714" />
          </group>
        );
      })}
    </>
  );
};

// ---------- scene ----------
export type CarSpec = { x: number; z: number; v?: number; c: string; rot?: number };
export type City2Props = {
  t: number;
  cam: CamProps | null;
  rig?: RigSpec;
  hero: { x: number; z: number; rotY: number; phase: number; run: number; sprint: number; lean: number; hatFly: number; heat: number; show: number; y?: number };
  freeze?: number;
  wind?: number;
  shockV?: number; // m/s: windows burst as the hero passes
  blasts?: Blast[];
  cars?: CarSpec[];
  peds?: number;
  sunElev?: number;
  sunAz?: number;
  bloom?: number;
  aperture?: number;
  exposure?: number;
  aura?: number;
  cone?: number;
  trail?: number;
  fire?: number;
  flames?: number;
  domes?: number[];
  dust?: number;
};

const PEDS = [
  { x: 9.8, z: -16, dir: 1, suit: '#5a3a2a', speed: 1.3 },
  { x: 10.6, z: -34, dir: -1, suit: '#3c4f3a', speed: 1.2 },
  { x: -9.2, z: -8, dir: -1, suit: '#6b6258', speed: 1.35 },
  { x: -10.2, z: -26, dir: 1, suit: '#2a2a2e', speed: 1.25 },
  { x: 10.3, z: 8, dir: -1, suit: '#7a3030', speed: 1.3 },
  { x: -9.6, z: -52, dir: -1, suit: '#4a4a6a', speed: 1.2 },
];
const SHARDS = Array.from({ length: 4000 }, (_, i) => ({ side: i % 2 ? 1 : -1, z: 60 - hash(i * 1.7) * 560, y: 4.5 + hash(i * 2.3) * 36, r: hash(i * 5.1), r2: hash(i * 7.9) }));

export const City2Scene: React.FC<City2Props> = (p) => {
  const { t: tReal, cam, rig, hero: H, freeze, wind = 0, shockV = 0, blasts = [], cars = [], peds = 1, sunElev = 40, sunAz = 140, bloom = 0.35, aperture = 0, exposure = 1 } = p;
  const t = freeze ?? tReal;
  const { width, height } = useVideoConfig();
  const factory = useHeroFactory();
  const carF = useCarFactory();
  const smoke = useTex('tex/smoke1.png');
  const heroes = useMemo(() => (factory ? { me: factory(), peds: PEDS.map((q) => factory(q.suit)) } : null), [factory]);
  const carObjs = useMemo(() => (carF ? cars.map((c) => carF(c.c)) : null), [carF, cars.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const sky = useMemo(() => {
    const s = new Sky();
    s.scale.setScalar(4000);
    const u = s.material.uniforms;
    u.turbidity.value = 2.2;
    u.rayleigh.value = 2.2;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;
    s.material.fragmentShader = s.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * 0.42, 1.0 );');
    return s;
  }, []);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - sunElev), THREE.MathUtils.degToRad(sunAz));
  sky.material.uniforms.sunPosition.value.copy(sunDir);

  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff0dc', 2.6);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const sc = l.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -30;
    sc.right = sc.top = 30;
    sc.far = 300;
    l.shadow.bias = -0.0003;
    l.shadow.normalBias = 0.03;
    return l;
  }, []);

  // hero
  if (heroes) {
    const me: Hero = heroes.me;
    me.root.position.set(H.x, (H.y ?? 0) + 0.12, H.z);
    me.root.rotation.set(0, H.rotY, 0);
    poseHero(me, H.phase, H.run, H.sprint, H.lean);
    me.root.visible = H.show > 0.5;
    hatHero(me, H.hatFly);
    heatHero(me, H.heat, tReal);
    heroes.peds.forEach((r, i) => {
      const q = PEDS[i];
      const tt = t + i * 0.37;
      poseHero(r, tt * q.speed * 0.72, 0);
      r.root.position.set(q.x, 0.12, q.z + q.dir * -q.speed * t);
      r.root.rotation.set(0, q.dir > 0 ? Math.PI : 0, 0);
      r.root.visible = peds > 0.5;
    });
  }

  // camera
  let c: CamProps = cam ?? { pos: [H.x + 3, 1.6, H.z - 5], look: [H.x, 1.1, H.z], fov: 50 };
  if (rig) c = rigCam(rig, H.x, H.z);
  const focus = Math.hypot(c.pos[0] - H.x, c.pos[1] - 1.1, c.pos[2] - H.z);
  const tgt = new THREE.Vector3(H.x, 0, H.z - 8);
  sun.position.copy(tgt).addScaledVector(sunDir, 120);
  sun.target.position.copy(tgt);
  sun.target.updateMatrixWorld();

  // cars: thrown by nearby blasts
  const carState = cars.map((k) => {
    let x = k.x, z = k.z + (k.v ?? 0) * t, y = 0, rx = 0, rz = 0, ry = k.rot ?? ((k.v ?? 0) < 0 ? Math.PI : 0);
    for (const b of blasts) {
      const s = tReal - b.t;
      if (s <= 0) continue;
      const dx = x - b.x, dz = z - b.z;
      const r = Math.hypot(dx, dz);
      const R = blastR(b.e) * 2.2;
      if (r > R) continue;
      const k2 = (1 - r / R);
      const vUp = 6 + 14 * k2, vOut = 4 + 12 * k2;
      y += Math.max(0, vUp * s - 4.9 * s * s);
      x += (dx / (r || 1)) * vOut * Math.min(s, 1.5);
      z += (dz / (r || 1)) * vOut * Math.min(s, 1.5);
      rx += s * 3 * k2 * (hash(r) > 0.5 ? 1 : -1);
      rz += s * 2.2 * k2;
    }
    return { x, y, z, rx, ry, rz };
  });

  return (
    <ThreeCanvas width={width} height={height} shadows camera={{ fov: c.fov ?? 50, position: [0, 2, 10], near: 0.05, far: 5000 }} gl={{ antialias: true }} onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = exposure;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }}>
      <CameraRig {...c} />
      <Env path="hdr/pedestrian_overpass_1k.hdr" intensity={0.55} />
      <primitive object={sky} />
      <fog attach="fog" args={['#b9c6d6', 250, 1800]} />
      <hemisphereLight args={['#dfe9ff', '#6b5f52', 0.45]} />
      <primitive object={sun} />
      <primitive object={sun.target} />

      {/* asphalt, sidewalks, curbs, markings */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -300]} receiveShadow>
        <planeGeometry args={[14, 900]} />
        <meshStandardMaterial color="#34363a" roughness={0.88} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -300]}>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial color="#77736b" roughness={1} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 9.5, 0.06, -300]} receiveShadow>
            <boxGeometry args={[5, 0.12, 900]} />
            <meshStandardMaterial color="#a8a39b" roughness={0.92} />
          </mesh>
          <mesh position={[s * 7.05, 0.07, -300]} receiveShadow>
            <boxGeometry args={[0.18, 0.15, 900]} />
            <meshStandardMaterial color="#cfcac0" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 150 }).map((_, k) => (
        <React.Fragment key={k}>
          {[-3.2, 3.2].map((x) => (
            <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.012, 60 - k * 6]}>
              <planeGeometry args={[0.14, 3]} />
              <meshStandardMaterial color="#d9d5c8" roughness={0.7} />
            </mesh>
          ))}
        </React.Fragment>
      ))}
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.011, -300]}>
          <planeGeometry args={[0.12, 900]} />
          <meshStandardMaterial color="#d8b941" roughness={0.7} />
        </mesh>
      ))}
      {[-30, -110, -190, -270, -350].map((z) =>
        Array.from({ length: 12 }).map((_, k) => (
          <mesh key={`${z}${k}`} rotation={[-Math.PI / 2, 0, 0]} position={[-6.3 + k * 1.15, 0.014, z]}>
            <planeGeometry args={[0.6, 4]} />
            <meshStandardMaterial color="#e6e3db" roughness={0.7} />
          </mesh>
        )),
      )}
      <Facades />
      <Trees />
      <Furniture />

      {carObjs &&
        carObjs.map((o, i) => {
          const s = carState[i];
          o.root.position.set(s.x, s.y, s.z);
          o.root.rotation.set(s.rx, s.ry, s.rz);
          return <primitive key={i} object={o.root} />;
        })}

      {heroes && (
        <>
          <primitive object={heroes.me.root} />
          {heroes.me.hat && <primitive object={heroes.me.hat.flyer} />}
          {heroes.peds.map((r, i) => (
            <primitive key={i} object={r.root} />
          ))}
        </>
      )}

      {wind > 0.01 && <Papers t={tReal} amount={wind} at={[H.x, 0, H.z]} />}

      {/* windows burst when the hero's shock passes (hero runs toward -z) */}
      {shockV > 0 &&
        (() => {
          const n = SHARDS.length;
          const pos = new Float32Array(n * 3), a = new Float32Array(n), sz = new Float32Array(n);
          SHARDS.forEach((k, i) => {
            const passed = H.z < k.z;
            const s2 = passed ? (k.z - H.z) / shockV : 0;
            const y = k.y + (1 + 3 * k.r2) * s2 - 4.9 * s2 * s2;
            pos[i * 3] = k.side * (12.05 - s2 * (4 + 9 * k.r));
            pos[i * 3 + 1] = Math.max(0.15, y);
            pos[i * 3 + 2] = k.z + s2 * (k.r2 - 0.5) * 6;
            a[i] = passed ? (y > 0.3 ? 1 : 0.5) * (0.55 + 0.45 * Math.sin(i * 1.7 + tReal * 25)) : 0;
            sz[i] = 0.35 + 0.5 * k.r;
          });
          return <Puffs data={{ pos, a, s: sz }} color="#e8f6ff" additive />;
        })()}

      <Blasts t={tReal} list={blasts} smoke={smoke} />
      {(p.dust ?? 0) > 0 && <Puffs data={sprayData('dust', 1400, tReal, p.dust!, 70, 9, 0.28, 3.5, [H.x, 0, H.z])} color="#a89b86" />}
      {heroes && (p.flames ?? 0) > 0.01 && <Puffs data={bodyFireData(heroes.me, tReal, p.flames!, new THREE.Vector3(0, 0, 1))} color="#ff7a1e" additive map={smoke} />}
      <Aura pos={[H.x, 0.12, H.z]} amount={p.aura ?? 0} t={tReal} />
      <MachCone pos={[H.x, 0.12, H.z]} amount={p.cone ?? 0} t={tReal} map={smoke} />
      <ShockDomes t={tReal} at={p.domes ?? []} center={[H.x, 0, H.z]} speed={90} life={1.4} />
      <Trail from={[H.x, 0.95, H.z + 0.3]} len={160} width={0.8} amount={p.trail ?? 0} color="#ffcf8a" vertical />
      {heroes && <FeetFire rig={{ root: heroes.me.root } as any} amount={p.fire ?? 0} t={tReal} />}

      <Redraw deps={[heroes, carObjs]} />
      <Post bloom={bloom} focus={focus} aperture={aperture} bloomThreshold={0.85} />
    </ThreeCanvas>
  );
};
