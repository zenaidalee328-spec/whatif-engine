import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { CamProps, CameraRig, hash } from './common3d';
import { Env, Post, Redraw, useTex } from './fx3d';
import { Aura, FeetFire, MachCone, Puffs, RigSpec, ShockDomes, Trail, rigCam, sprayData } from './runner';
import { bodyFireData, hatHero, heatHero, poseHero, useHeroFactory } from './hero';
import { useCarFactory } from './cars';

/*
  Land v2 — treadmill world for the fast part. The hero stays at (runX, 0, 0) facing -z; the world scrolls +z by `scroll` m.
  biome: road | water | highway | rails | farm.  Sky: real panorama (Poly Haven kloofendal, CC0) + IBL.
  Physics-driven effects (timeline computes the numbers):
    splash        water-running: a crown splash at every footstep + side sheets (cad = steps/s ... vis = scroll m/s)
    craters 0..1  every footstep smashes the asphalt (the push force exceeds its strength) -> crater + flying chunks
    cone          vapour cone (Prandtl-Glauert condensation) around the body near Mach 1
    domes [t]     sonic-boom shock shells
    heat/fire     stagnation heating: suit glows, shoes burn
*/

type V3 = [number, number, number];
const wrap = (z: number, L: number, ahead: number) => ((((z + ahead) % L) + L) % L) - ahead;

// ---------- procedural ground (world-space noise, scrolls with the world) ----------
const groundMat = (kind: 'grass' | 'asphalt' | 'farm') => {
  const m = new THREE.MeshStandardMaterial({ roughness: kind === 'asphalt' ? 0.82 : 1 });
  const u = { uScroll: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uScroll = u.uScroll;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vW; uniform float uScroll;
         float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
           return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
         float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec2 P = vec2(vW.x, vW.z - uScroll);
         ${
           kind === 'grass'
             ? `float big = fbm(P * 0.012), mid = fbm(P * 0.09), fine = vn(P * 3.1) * 0.6 + vn(P * 11.0) * 0.4;
                vec3 c1 = vec3(0.16, 0.24, 0.07), c2 = vec3(0.30, 0.36, 0.12), c3 = vec3(0.42, 0.40, 0.20);
                vec3 g = mix(c1, c2, smoothstep(0.3, 0.7, mid));
                g = mix(g, c3, smoothstep(0.55, 0.8, big) * 0.7);
                g *= 0.78 + 0.42 * fine;
                diffuseColor.rgb = g;`
             : kind === 'asphalt'
               ? `float n = fbm(P * 0.6) * 0.5 + vn(P * 9.0) * 0.3 + vn(P * 40.0) * 0.2;
                  float patchy = smoothstep(0.55, 0.75, fbm(P * 0.05));
                  diffuseColor.rgb = mix(vec3(0.16, 0.16, 0.17), vec3(0.24, 0.24, 0.25), n) * (1.0 - 0.18 * patchy);`
               : `vec2 q = P / vec2(140.0, 90.0); vec2 id = floor(q); vec2 f = fract(q);
                  float r = hh(id);
                  vec3 a = r < 0.25 ? vec3(0.35, 0.42, 0.14) : r < 0.5 ? vec3(0.58, 0.52, 0.24) : r < 0.75 ? vec3(0.27, 0.33, 0.12) : vec3(0.47, 0.38, 0.24);
                  float rows = 0.85 + 0.15 * sin((r > 0.5 ? P.x : P.y) * 3.0);
                  float edge = smoothstep(0.0, 0.01, f.x) * smoothstep(0.0, 0.01, f.y) * smoothstep(1.0, 0.99, f.x) * smoothstep(1.0, 0.99, f.y);
                  diffuseColor.rgb = mix(vec3(0.22, 0.24, 0.12), a * rows * (0.85 + 0.3 * fbm(P * 0.05)), edge);`
         }`,
      );
  };
  m.customProgramCacheKey = () => 'ground-' + kind;
  return { m, u };
};

// ---------- props ----------
const Jet: React.FC<{ pos: V3 }> = ({ pos }) => {
  const white = <meshStandardMaterial color="#f2f4f7" roughness={0.3} metalness={0.35} />;
  return (
    <group position={pos}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[2, 34, 12, 24]} />
        {white}
      </mesh>
      <mesh position={[0, -0.6, -1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.03, 2.03, 30, 24, 1, true, Math.PI * 0.62, Math.PI * 0.12]} />
        <meshStandardMaterial color="#1f4fa8" roughness={0.4} />
      </mesh>
      {Array.from({ length: 26 }).map((_, i) => (
        <mesh key={i} position={[2.0, 0.55, -14 + i * 1.1]}>
          <boxGeometry args={[0.05, 0.35, 0.28]} />
          <meshStandardMaterial color="#10161f" />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 10.5, -0.9, 1.5]} rotation={[0, s * 0.5, s * 0.05]} castShadow>
            <boxGeometry args={[19, 0.35, 4.8]} />
            {white}
          </mesh>
          <mesh position={[s * 6.5, -2.2, -2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[1.25, 1.1, 5, 20]} />
            <meshStandardMaterial color="#c9ced8" roughness={0.25} metalness={0.7} />
          </mesh>
          <mesh position={[s * 4.2, 0.4, 19]} rotation={[0, s * 0.5, 0]}>
            <boxGeometry args={[7.5, 0.25, 2.8]} />
            {white}
          </mesh>
        </group>
      ))}
      <mesh position={[0, 4.4, 19.5]} rotation={[0.45, 0, 0]}>
        <boxGeometry args={[0.35, 7.5, 4]} />
        <meshStandardMaterial color="#1f4fa8" />
      </mesh>
    </group>
  );
};

const Train: React.FC<{ z: number; x: number }> = ({ z, x }) => {
  const body = useMemo(() => {
    // rounded cross-section extruded along z, with a long tapered nose made from a lathe
    const shape = new THREE.Shape();
    const w = 1.7, h = 3.6, r = 0.7;
    shape.moveTo(-w, 0.3);
    shape.lineTo(-w, h - r);
    shape.quadraticCurveTo(-w, h, -w + r, h);
    shape.lineTo(w - r, h);
    shape.quadraticCurveTo(w, h, w, h - r);
    shape.lineTo(w, 0.3);
    shape.lineTo(-w, 0.3);
    return new THREE.ExtrudeGeometry(shape, { depth: 25, bevelEnabled: false });
  }, []);
  const nose = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      pts.push(new THREE.Vector2(1.75 * Math.pow(Math.sin((u * Math.PI) / 2), 0.7), -9 * (1 - u)));
    }
    const g = new THREE.LatheGeometry(pts, 32);
    g.rotateX(-Math.PI / 2);
    g.scale(1, 1.0, 1);
    return g;
  }, []);
  return (
    <group position={[x, 0.45, z]}>
      {Array.from({ length: 8 }).map((_, i) => (
        <group key={i} position={[0, 0, i * 25.3]}>
          <mesh geometry={body} castShadow>
            <meshStandardMaterial color="#f4f5f7" roughness={0.25} metalness={0.25} />
          </mesh>
          {[-1, 1].map((s) => (
            <React.Fragment key={s}>
              <mesh position={[s * 1.71, 2.55, 12.5]}>
                <boxGeometry args={[0.02, 0.75, 23]} />
                <meshStandardMaterial color="#0d141f" roughness={0.05} metalness={0.9} />
              </mesh>
              <mesh position={[s * 1.71, 1.25, 12.5]}>
                <boxGeometry args={[0.02, 0.24, 25]} />
                <meshStandardMaterial color="#1f5fd1" />
              </mesh>
            </React.Fragment>
          ))}
          <mesh position={[0, 0.25, 12.5]}>
            <boxGeometry args={[3.0, 0.5, 24]} />
            <meshStandardMaterial color="#3a3f47" />
          </mesh>
        </group>
      ))}
      <mesh geometry={nose} position={[0, 2.0, 0]} scale={[1, 0.95, 1]} castShadow>
        <meshStandardMaterial color="#f4f5f7" roughness={0.2} metalness={0.3} />
      </mesh>
    </group>
  );
};

// ---------- scene ----------
export type Land2Props = {
  t: number;
  cam: CamProps | null;
  rig?: RigSpec;
  biome?: 'road' | 'water' | 'highway' | 'rails' | 'farm';
  scroll: number;
  vis?: number; // scroll speed m/s (for footstep effects)
  cad?: number; // gait cycles per second
  hero: { phase: number; run: number; sprint: number; lean: number; hatFly: number; heat: number; show: number; y?: number };
  runX?: number;
  splash?: number;
  craters?: number;
  dust?: number;
  cone?: number;
  domes?: number[];
  fire?: number;
  burn?: number;
  aura?: number;
  trail?: number;
  flames?: number;
  jet?: V3;
  trainZ?: number;
  carRel?: number;
  bloom?: number;
  aperture?: number;
  exposure?: number;
  sunElev?: number;
};

const SKYTEX = 'tex/kloofendal_48d_partly_cloudy.jpg';

export const Land2Scene: React.FC<Land2Props> = (p) => {
  const { t, cam, rig, biome = 'road', scroll, vis = 30, cad = 3, hero: H, runX = 0, bloom = 0.4, aperture = 0, exposure = 1, sunElev = 38 } = p;
  const { width, height } = useVideoConfig();
  const factory = useHeroFactory();
  const carF = useCarFactory();
  const hero = useMemo(() => (factory ? factory() : null), [factory]);
  const skyTex = useTex(SKYTEX);
  const smoke = useTex('tex/smoke1.png');
  const normals = useTex('tex/waternormals.jpg', false);

  const grass = useMemo(() => groundMat('grass'), []);
  const asph = useMemo(() => groundMat('asphalt'), []);
  const farm = useMemo(() => groundMat('farm'), []);
  grass.u.uScroll.value = asph.u.uScroll.value = farm.u.uScroll.value = scroll;

  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - sunElev), THREE.MathUtils.degToRad(150));
  const water = useMemo(() => {
    if (!normals) return null;
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    const w = new Water(new THREE.PlaneGeometry(6000, 6000), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: sunDir.clone(),
      sunColor: 0xffffff,
      waterColor: 0x0e3b4a,
      distortionScale: 2.4,
      fog: true,
    });
    const mat = w.material as THREE.ShaderMaterial;
    mat.uniforms.uScroll = { value: 0 };
    mat.fragmentShader = mat.fragmentShader
      .replace('uniform float time;', 'uniform float time; uniform float uScroll;')
      .replace('getNoise( worldPosition.xz * size )', 'getNoise( (worldPosition.xz - vec2(0.0, uScroll)) * size )');
    mat.uniforms.size.value = 1.6;
    w.rotation.x = -Math.PI / 2;
    return w;
  }, [normals]); // eslint-disable-line react-hooks/exhaustive-deps
  if (water) {
    const u = (water.material as THREE.ShaderMaterial).uniforms;
    u.time.value = t * 0.8;
    u.uScroll.value = scroll;
  }

  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff3e2', 2.4);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const sc = l.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -25;
    sc.right = sc.top = 25;
    sc.far = 250;
    l.shadow.bias = -0.0003;
    l.shadow.normalBias = 0.03;
    return l;
  }, []);
  sun.position.set(runX, 0, -6).addScaledVector(sunDir, 100);
  sun.target.position.set(runX, 0, -6);
  sun.target.updateMatrixWorld();

  if (hero) {
    hero.root.position.set(runX, (H.y ?? 0) + (biome === 'water' ? 0.02 : 0.0), 0);
    hero.root.rotation.set(0, Math.PI, 0);
    poseHero(hero, H.phase, H.run, H.sprint, H.lean);
    hero.root.visible = H.show > 0.5;
    hatHero(hero, H.hatFly);
    heatHero(hero, H.heat, t);
  }

  const c: CamProps = rig ? rigCam(rig, runX, 0) : cam ?? { pos: [runX + 3, 1.5, -5], look: [runX, 1, 0], fov: 45 };
  const focus = Math.hypot(c.pos[0] - runX, c.pos[1] - 1.0, c.pos[2]);
  const camH = c.pos[1];
  const fogFar = Math.max(1400, camH * 14);

  // trees (lumpy crowns), wrapped along the road
  const trees = useMemo(() => {
    const N = 360;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 4, 7), new THREE.MeshStandardMaterial({ color: '#46372a', roughness: 1 }), N);
    const g = new THREE.IcosahedronGeometry(1, 2);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pa, i);
      v.multiplyScalar(1 + 0.2 * Math.sin(v.x * 6.1) * Math.sin(v.y * 5.3 + 1) * Math.sin(v.z * 7.7 + 2));
      pa.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const crown = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.95 }), N * 3);
    trunk.castShadow = crown.castShadow = true;
    for (let i = 0; i < N * 3; i++) crown.setColorAt(i, new THREE.Color().setHSL(0.22 + hash(i * 1.3) * 0.08, 0.42, 0.16 + hash(i * 2.9) * 0.1));
    return { trunk, crown, N };
  }, []);
  {
    const o = new THREE.Object3D();
    const on = biome === 'road' || biome === 'rails' || biome === 'highway' || biome === 'farm';
    const minX = biome === 'highway' ? 24 : biome === 'rails' ? 17 : 8;
    const L = biome === 'farm' ? 3000 : 1000;
    for (let i = 0; i < trees.N; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (minX + Math.pow(hash(i * 1.37), 1.6) * (biome === 'farm' ? 900 : 140));
      const z = wrap(hash(i * 2.91) * L + scroll, L, L * 0.8);
      const s = (0.8 + hash(i * 4.1) * 0.7) * (on ? 1 : 0);
      o.position.set(x, 2 * s, z);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(s);
      o.updateMatrix();
      trees.trunk.setMatrixAt(i, o.matrix);
      for (let k = 0; k < 3; k++) {
        const a = hash(i * 3 + k) * 6.283;
        o.position.set(x + Math.cos(a) * (k ? 1.1 : 0) * s, (5 + (k ? hash(i + k) * 0.8 : 0.9)) * s, z + Math.sin(a) * (k ? 1.1 : 0) * s);
        o.scale.setScalar((k ? 1.5 : 2.1) * s);
        o.updateMatrix();
        trees.crown.setMatrixAt(i * 3 + k, o.matrix);
      }
    }
    trees.trunk.instanceMatrix.needsUpdate = trees.crown.instanceMatrix.needsUpdate = true;
  }

  // lane dashes + poles + sleepers (wrapped)
  const dashes = useMemo(() => new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 3), new THREE.MeshStandardMaterial({ color: '#e6e1d0', roughness: 0.7 }), 420), []);
  {
    const o = new THREE.Object3D();
    const lanes = biome === 'highway' ? [-7.8, -3.9, 3.9, 7.8] : biome === 'road' || biome === 'rails' ? [0] : [];
    let k = 0;
    for (const x of lanes)
      for (let j = 0; j < 100 && k < 420; j++, k++) {
        o.position.set(x, 0.015, wrap(-j * 9 + scroll, 900, 760));
        o.rotation.set(-Math.PI / 2, 0, 0);
        o.scale.setScalar(1);
        o.updateMatrix();
        dashes.setMatrixAt(k, o.matrix);
      }
    for (; k < 420; k++) {
      o.scale.setScalar(0);
      o.updateMatrix();
      dashes.setMatrixAt(k, o.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
  }
  const poles = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.17, 9, 7), new THREE.MeshStandardMaterial({ color: '#5d4a3a', roughness: 1 }), 50);
    m.castShadow = true;
    return m;
  }, []);
  {
    const o = new THREE.Object3D();
    const on = biome === 'road' || biome === 'rails';
    for (let j = 0; j < 50; j++) {
      o.position.set(biome === 'rails' ? -12.6 : 6.4, 4.5, wrap(-j * 38 + scroll, 1900, 1600));
      o.scale.setScalar(on ? 1 : 0);
      o.updateMatrix();
      poles.setMatrixAt(j, o.matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
  }
  const sleepers = useMemo(() => new THREE.InstancedMesh(new THREE.BoxGeometry(3.0, 0.16, 0.28), new THREE.MeshStandardMaterial({ color: '#5a554f', roughness: 1 }), 800), []);
  if (biome === 'rails') {
    const o = new THREE.Object3D();
    for (let j = 0; j < 800; j++) {
      o.position.set(-9, 0.28, wrap(-j * 0.7 + scroll, 560, 470));
      o.updateMatrix();
      sleepers.setMatrixAt(j, o.matrix);
    }
    sleepers.instanceMatrix.needsUpdate = true;
  }

  // highway traffic (same direction, slower: carRel = 1 - vCar/vScroll)
  const carSpecs = useMemo(() => Array.from({ length: 16 }, (_, i) => ({ x: [-9.75, -5.85, -1.95, 1.95, 5.85, 9.75][i % 6], z0: -hash(i * 3.3) * 360, c: ['#7d1a1a', '#e9e9e9', '#1f3a6e', '#222', '#c8b27a', '#5d666d', '#2c5a3a', '#b0b4b8'][i % 8] })), []);
  const carObjs = useMemo(() => (carF && biome === 'highway' ? carSpecs.map((k) => carF(k.c)) : null), [carF, biome, carSpecs]);

  // footstep events (for splashes / craters): last few steps, each now `age` s old, at z = age * vis
  const steps: { age: number; x: number; z: number }[] = [];
  {
    const stepIdx = Math.floor(H.phase * 2);
    for (let k = 0; k < 8; k++) {
      const age = (H.phase * 2 - (stepIdx - k)) / (2 * cad);
      steps.push({ age, x: runX + ((stepIdx - k) % 2 ? 0.14 : -0.14), z: age * vis - 0.2 });
    }
  }
  const splashData = (() => {
    if (!(p.splash ?? 0)) return null;
    const per = 220;
    const n = per * steps.length;
    const pos = new Float32Array(n * 3), a = new Float32Array(n), s = new Float32Array(n);
    steps.forEach((st, si) => {
      for (let k = 0; k < per; k++) {
        const i = si * per + k;
        const h1 = hash(k * 1.7 + si * 13), h2 = hash(k * 2.3 + 5), h3 = hash(k * 3.1 + 7);
        const ang = h1 * Math.PI * 2;
        const vOut = 1.5 + 5 * h2, vUp = 4 + 8 * h3 * (p.splash ?? 1);
        const tt = st.age;
        const y = vUp * tt - 4.9 * tt * tt;
        pos[i * 3] = st.x + Math.cos(ang) * vOut * tt * 1.3;
        pos[i * 3 + 1] = Math.max(0.02, y);
        pos[i * 3 + 2] = st.z + Math.sin(ang) * vOut * tt * 0.5 + 0.0;
        a[i] = y > 0 ? (p.splash ?? 1) * Math.max(0, 1 - tt / 1.3) * 0.8 : 0;
        s[i] = 0.3 + 0.5 * h2;
      }
    });
    return { pos, a, s };
  })();

  const craterOn = (p.craters ?? 0) > 0.01 && biome !== 'water';
  const isWater = biome === 'water';
  return (
    <ThreeCanvas width={width} height={height} shadows camera={{ fov: c.fov ?? 45, position: [0, 2, 10], near: 0.05, far: 12000 }} gl={{ antialias: true }} onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = exposure;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }}>
      <CameraRig {...c} />
      <Env path="hdr/quarry_01_1k.hdr" intensity={0.5} />
      {skyTex && (
        <mesh scale={[-1, 1, 1]} rotation={[0, 2.2, 0]}>
          <sphereGeometry args={[9000, 48, 24]} />
          <meshBasicMaterial map={skyTex} side={THREE.BackSide} fog={false} toneMapped={false} color="#d8dde3" />
        </mesh>
      )}
      <fog attach="fog" args={['#b8c4cf', fogFar * 0.3, fogFar]} />
      <hemisphereLight args={['#dfe9ff', '#5e5a44', 0.35]} />
      <primitive object={sun} />
      <primitive object={sun.target} />

      {isWater && water ? (
        <primitive object={water} />
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={biome === 'farm' ? farm.m : grass.m}>
          <planeGeometry args={[8000, 8000]} />
        </mesh>
      )}
      {isWater &&
        [-1, 1].map((s) => (
          <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[s * 1250, 0.4, 0]} material={grass.m}>
            <planeGeometry args={[2000, 8000]} />
          </mesh>
        ))}
      {(biome === 'road' || biome === 'rails' || biome === 'highway') && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow material={asph.m}>
          <planeGeometry args={[biome === 'highway' ? 26 : 8, 8000]} />
        </mesh>
      )}
      {(biome === 'road' || biome === 'rails' || biome === 'highway') &&
        [-1, 1].map((s) => (
          <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[s * ((biome === 'highway' ? 13 : 4) - 0.35), 0.016, 0]}>
            <planeGeometry args={[0.18, 8000]} />
            <meshStandardMaterial color="#e6e1d0" roughness={0.7} />
          </mesh>
        ))}
      <primitive object={dashes} />
      <primitive object={poles} />
      <primitive object={trees.trunk} />
      <primitive object={trees.crown} />
      {biome === 'rails' && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-9, 0.06, 0]} material={asph.m}>
            <planeGeometry args={[4.4, 8000]} />
          </mesh>
          <primitive object={sleepers} />
          {[-9.72, -8.28].map((x) => (
            <mesh key={x} position={[x, 0.42, 0]}>
              <boxGeometry args={[0.1, 0.16, 8000]} />
              <meshStandardMaterial color="#c3c6cc" metalness={0.85} roughness={0.25} />
            </mesh>
          ))}
          <Train x={-9} z={p.trainZ ?? 0} />
        </>
      )}
      {carObjs &&
        carObjs.map((o, i) => {
          o.root.position.set(carSpecs[i].x, 0.02, wrap(carSpecs[i].z0 + scroll * (p.carRel ?? 1), 420, 330));
          o.root.rotation.set(0, Math.PI, 0);
          return <primitive key={i} object={o.root} />;
        })}
      {p.jet && <Jet pos={p.jet} />}

      {hero && <primitive object={hero.root} />}
      {hero?.hat && <primitive object={hero.hat.flyer} />}

      {/* footstep craters: the asphalt fails under each push */}
      {craterOn &&
        steps.map((st, i) =>
          st.age >= 0 ? (
            <group key={i}>
              <mesh position={[st.x, 0.02, st.z]} rotation={[-Math.PI / 2, 0, hash(i) * 6]}>
                <circleGeometry args={[1.1 * (p.craters ?? 1), 9]} />
                <meshStandardMaterial color="#121212" roughness={1} />
              </mesh>
              <Puffs data={sprayData('sparks', 90, Math.min(0.999, st.age * 0.9), Math.max(0, 1 - st.age / 1.4) * (p.craters ?? 1), 4, 3.2, 1, 0.3, [st.x, 0, st.z], 0)} color="#1d1b19" />
              <Puffs data={sprayData('dust', 30, Math.min(0.999, st.age * 0.5), 0.35 * Math.max(0, 1 - st.age / 2) * (p.craters ?? 1), 4, 1.6, 0.5, 1.4, [st.x, 0, st.z], 0)} color="#5d564d" map={smoke} />
            </group>
          ) : null,
        )}
      {splashData && <Puffs data={splashData} color="#eef6fb" />}
      {(p.splash ?? 0) > 0 && <Puffs data={sprayData('wall', 500, t, (p.splash ?? 0) * 0.5, 14, 1.8, 0.16, 0.5, [runX, 0, 0.6], 1.6)} color="#f1f7fb" map={smoke} />}
      {(p.dust ?? 0) > 0 && <Puffs data={sprayData('dust', 600, t, p.dust!, 60, 6, 0.25, 3, [runX, 0, 0.5], 0.9)} color="#9c907d" map={smoke} />}
      <FeetFire rig={hero ? ({ root: hero.root } as any) : null} amount={p.fire ?? 0} t={t} />
      {(p.fire ?? 0) > 0.3 && <Puffs data={sprayData('sparks', 260, t, p.fire!, 6, 1.8, 1, 0.12, [runX, 0, 0.2], 2.5)} color="#ffb04a" additive />}
      {hero && (p.flames ?? 0) > 0.01 && <Puffs data={bodyFireData(hero, t, p.flames!, new THREE.Vector3(0, 0, 1))} color="#ff7a1e" additive map={smoke} />}
      <Aura pos={[runX, 0, 0]} amount={p.aura ?? 0} t={t} />
      <MachCone pos={[runX, 0, 0]} amount={p.cone ?? 0} t={t} map={smoke} />
      <ShockDomes t={t} at={p.domes ?? []} center={[runX, 0, 0]} speed={80} life={1.1} drift={vis * 0.5} />
      <Trail from={[runX, 0.95, 0.3]} len={140} width={0.9} amount={p.trail ?? 0} color="#ffcf8a" vertical />
      <Trail from={[runX, 0.04, 0.2]} len={110} width={1.3} amount={p.burn ?? 0} color="#ff6a1a" />

      <Redraw deps={[hero, skyTex, water, carObjs]} />
      <Post bloom={bloom} focus={focus} aperture={aperture} bloomThreshold={0.85} />
    </ThreeCanvas>
  );
};
