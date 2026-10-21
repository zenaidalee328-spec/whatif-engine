import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, SkyDome, hash } from './common3d';
import { Car } from './Street';
import { Post, Redraw, useGLB } from './fx3d';
import { Aura, FeetFire, MachCone, Puffs, RigSpec, ShockDomes, Trail, makeRig, pose, rigCam, sprayData } from './runner';

/*
  Treadmill world for the fast part of the run: the runner stays near the origin (x = runX, z = 0) facing -z,
  and the world scrolls toward +z by `scroll` metres (keyframe it linearly; it is a VISUAL speed, capped).
  biome: road | forest | water | ocean | highway | rails | farm
*/

type V3 = [number, number, number];
const wrap = (z: number, L: number, ahead: number) => ((((z + ahead) % L) + L) % L) - ahead;

const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rep: [number, number]) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(rep[0], rep[1]);
  tx.anisotropy = 8;
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
};
const speckle = (g: CanvasRenderingContext2D, w: number, h: number, base: string, cols: string[], n: number, r: number) => {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i % cols.length];
    g.globalAlpha = 0.25 + hash(i * 1.7) * 0.5;
    g.fillRect(hash(i) * w, hash(i + 0.3) * h, r * (0.5 + hash(i + 0.7)), r * (0.5 + hash(i + 0.9)));
  }
  g.globalAlpha = 1;
};
const TEX: Record<string, THREE.CanvasTexture> = {};
const tex = (k: 'grass' | 'asphalt' | 'farm' | 'gravel') => {
  if (TEX[k]) return TEX[k];
  if (k === 'grass') TEX[k] = canvasTex(256, 256, (g) => speckle(g, 256, 256, '#6d8f3e', ['#5c7d33', '#7fa04a', '#86a356', '#4f6e2c', '#9aae5c'], 2600, 5), [400, 400]);
  if (k === 'asphalt') TEX[k] = canvasTex(256, 256, (g) => speckle(g, 256, 256, '#4a4b4f', ['#3e3f43', '#5a5b60', '#36373a', '#626368'], 5000, 2.2), [3, 600]);
  if (k === 'gravel') TEX[k] = canvasTex(128, 128, (g) => speckle(g, 128, 128, '#8a8073', ['#776e62', '#9a8f80', '#6a6156'], 1500, 2), [2, 600]);
  if (k === 'farm')
    TEX[k] = canvasTex(1024, 1024, (g) => {
      const pal = ['#7f9a3e', '#a8a24e', '#c9b25f', '#6a8a36', '#8f7a4a', '#b9a05a', '#5f7d34', '#9fae58', '#d4c27a'];
      g.fillStyle = '#6b6a3e';
      g.fillRect(0, 0, 1024, 1024);
      let k2 = 0;
      for (let x = 0; x < 1024; ) {
        const w = 60 + hash(k2++) * 140;
        for (let y = 0; y < 1024; ) {
          const h = 50 + hash(k2++) * 160;
          g.fillStyle = pal[Math.floor(hash(k2++) * pal.length)];
          g.fillRect(x + 2, y + 2, w - 4, h - 4);
          g.globalAlpha = 0.18;
          g.fillStyle = '#000';
          for (let s = 0; s < h; s += 6) g.fillRect(x + 2, y + s, w - 4, 1.5); // furrows
          g.globalAlpha = 1;
          y += h;
        }
        x += w;
      }
    }, [6, 6]);
  return TEX[k];
};

// ---------------------------------------------------------------- water (shader with waves, sky fresnel, sun glint, foam wake)
const waterVert = `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const waterFrag = `
uniform float uT; uniform float uScroll; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uFog; uniform float uFogFar;
uniform vec3 uSunDir; uniform float uWake; uniform float uSplit; uniform float uChop;
varying vec3 vW;
float H(vec2 p){
  float h = 0.0;
  h += 0.35*sin(dot(p, vec2(0.08, 0.05)) + uT*1.1);
  h += 0.22*sin(dot(p, vec2(-0.13, 0.11)) + uT*1.6);
  h += 0.12*sin(dot(p, vec2(0.31, -0.22)) + uT*2.3);
  h += 0.07*sin(dot(p, vec2(-0.55, -0.47)) + uT*3.1);
  h += 0.04*sin(dot(p, vec2(1.1, 0.8)) + uT*4.7);
  h += 0.025*sin(dot(p, vec2(-1.9, 1.4)) + uT*6.1);
  return h*uChop;
}
void main(){
  vec2 p = vec2(vW.x, vW.z - uScroll);
  float e = 0.15;
  float hx = H(p+vec2(e,0.0)) - H(p-vec2(e,0.0));
  float hz = H(p+vec2(0.0,e)) - H(p-vec2(0.0,e));
  vec3 n = normalize(vec3(-hx/(2.0*e), 1.0, -hz/(2.0*e)));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.04 + 0.96*pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 base = mix(uDeep, uShallow, clamp(n.y*0.0 + 0.3 + 0.5*H(p*0.5), 0.0, 1.0));
  vec3 col = mix(base, uSky, fres);
  vec3 R = reflect(-V, n);
  col += vec3(1.0,0.92,0.8) * pow(max(dot(R, normalize(uSunDir)), 0.0), 180.0) * 2.5;
  // V-shaped foam wake + a trench right behind the runner (z > 0)
  float z = vW.z;
  if (z > 0.0) {
    float ax = abs(vW.x);
    float edge = z*0.32 + 0.6;
    float w = 0.5 + z*0.05;
    float foam = (1.0 - smoothstep(0.0, w, abs(ax - edge))) * exp(-z*0.004);
    float n2 = fract(sin(dot(floor(vec2(vW.x*3.0, (vW.z - uScroll)*3.0)), vec2(12.9898,78.233)))*43758.5453);
    col = mix(col, vec3(0.95,0.97,1.0), uWake*foam*(0.6+0.4*n2));
    float trench = 1.0 - smoothstep(edge*0.35, edge*0.8, ax);
    col = mix(col, uDeep*0.35, uSplit*trench*smoothstep(0.0, 6.0, z));
    col = mix(col, vec3(0.9,0.95,1.0), uSplit*(1.0 - smoothstep(0.0, 1.2, abs(ax - edge*0.8)))*0.8);
  }
  float d = length(cameraPosition - vW);
  col = mix(col, uFog, smoothstep(uFogFar*0.25, uFogFar, d));
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- props
const Jet: React.FC<{ pos: V3 }> = ({ pos }) => (
  <group position={pos} rotation={[0, 0, 0]}>
    {/* fuselage along z, nose toward -z */}
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[2, 2, 36, 24]} />
      <meshStandardMaterial color="#eef1f5" roughness={0.35} metalness={0.3} />
    </mesh>
    <mesh position={[0, 0, -18]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 0.85]}>
      <sphereGeometry args={[2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#eef1f5" roughness={0.35} metalness={0.3} />
    </mesh>
    <mesh position={[0, 0.3, 21]} rotation={[Math.PI / 2, 0, 0]}>
      <coneGeometry args={[2, 7, 24]} />
      <meshStandardMaterial color="#eef1f5" roughness={0.35} metalness={0.3} />
    </mesh>
    <mesh position={[0, -0.6, -1]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[2.02, 2.02, 33, 24, 1, true, Math.PI * 0.62, Math.PI * 0.12]} />
      <meshStandardMaterial color="#1f4fa8" roughness={0.4} />
    </mesh>
    {/* wings */}
    {[-1, 1].map((s) => (
      <group key={s}>
        <mesh position={[s * 11, -0.9, 1.5]} rotation={[0, s * 0.45, 0]}>
          <boxGeometry args={[20, 0.4, 5]} />
          <meshStandardMaterial color="#dfe3ea" roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[s * 7, -2.1, -1.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.1, 1.0, 4.5, 16]} />
          <meshStandardMaterial color="#c9ced8" roughness={0.3} metalness={0.5} />
        </mesh>
        <mesh position={[s * 4.5, 0.4, 20]} rotation={[0, s * 0.5, 0]}>
          <boxGeometry args={[8, 0.3, 3]} />
          <meshStandardMaterial color="#dfe3ea" />
        </mesh>
      </group>
    ))}
    <mesh position={[0, 4.5, 20.5]} rotation={[0.5, 0, 0]}>
      <boxGeometry args={[0.4, 8, 4]} />
      <meshStandardMaterial color="#1f4fa8" />
    </mesh>
    {/* contrails */}
    {[-7, 7].map((x) => (
      <mesh key={x} position={[x, -2.1, 60]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.2, 0.5, 120, 12, 1, true]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    ))}
  </group>
);

const TrainCar: React.FC<{ z: number; nose?: boolean }> = ({ z, nose }) => (
  <group position={[0, 0, z]}>
    <mesh position={[0, 2.1, 12.5]} castShadow>
      <boxGeometry args={[3.4, 3.4, 24.6]} />
      <meshStandardMaterial color="#f3f4f6" roughness={0.3} metalness={0.2} />
    </mesh>
    {[-1, 1].map((s) => (
      <React.Fragment key={s}>
        <mesh position={[s * 1.71, 2.6, 12.5]}>
          <boxGeometry args={[0.02, 0.7, 23]} />
          <meshStandardMaterial color="#1b2638" roughness={0.1} metalness={0.6} />
        </mesh>
        <mesh position={[s * 1.71, 1.45, 12.5]}>
          <boxGeometry args={[0.02, 0.22, 24.6]} />
          <meshStandardMaterial color="#1f5fd1" />
        </mesh>
      </React.Fragment>
    ))}
    {nose && (
      <mesh position={[0, 1.9, 0.2]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.7, 7, 1.6]}>
        <sphereGeometry args={[1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.25} metalness={0.25} />
      </mesh>
    )}
  </group>
);

// ---------------------------------------------------------------- scene
export type RunLandProps = {
  t: number;
  cam: CamProps | null;
  biome?: string;
  scroll: number; // metres the world has moved toward +z
  phase: number; // gait cycles
  runMix?: number;
  runX?: number;
  rig?: RigSpec;
  sky?: 'day' | 'golden' | 'dusk' | 'high';
  fire?: number;
  aura?: number;
  trail?: number;
  trailLen?: number;
  burn?: number; // burning streak on the ground behind
  cone?: number;
  spray?: number;
  sprayH?: number;
  dust?: number;
  bend?: number;
  domes?: number[];
  wake?: number;
  split?: number;
  jet?: V3;
  trainZ?: number;
  carRel?: number;
  bloom?: number;
  aperture?: number;
  runner?: number;
  trailW?: number;
};

const SKY = {
  day: { top: '#3f7fd4', bottom: '#cfe2f2', fog: '#c9dcec', sun: '#fff1dc', hemi: 1.0 },
  golden: { top: '#3b6db8', bottom: '#f3c98f', fog: '#e9c99e', sun: '#ffd09a', hemi: 0.8 },
  dusk: { top: '#1d2b55', bottom: '#e0805a', fog: '#b9786a', sun: '#ff9a62', hemi: 0.55 },
  high: { top: '#0b2a6b', bottom: '#8fb6e2', fog: '#a9c4e4', sun: '#ffffff', hemi: 1.0 },
};

export const RunLandScene: React.FC<RunLandProps> = (p) => {
  const { t, cam, biome = 'road', scroll, phase, runMix = 1, runX = 0, rig, sky = 'day', bloom = 0.4, aperture = 0, runner = 1 } = p;
  const { width, height } = useVideoConfig();
  const gltf = useGLB('models/Xbot.glb');
  const sk = SKY[sky];
  const R = useMemo(() => (gltf ? makeRig(gltf.scene, gltf.animations, '#2b3a6b', '#e0ac85', '#2a1d16', true) : null), [gltf]);
  if (R) {
    pose(R, phase, runMix);
    R.root.position.set(runX, biome === 'water' || biome === 'ocean' ? 0.05 : 0.02, 0);
    R.root.rotation.set(0, Math.PI, 0);
    R.root.visible = runner > 0.5;
  }
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff1dc', 3.0);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const sc = l.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -30;
    sc.right = sc.top = 30;
    sc.far = 200;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.02;
    return l;
  }, []);
  sun.color.set(sk.sun);
  sun.position.set(runX + 40, 60, -30);
  sun.target.position.set(runX, 0, -5);
  sun.target.updateMatrixWorld();

  const c: CamProps = rig ? rigCam(rig, runX, 0) : cam ?? { pos: [runX + 3, 1.5, -5], look: [runX, 1, 0], fov: 45 };
  const focus = Math.hypot(c.pos[0] - runX, c.pos[1] - 1.1, c.pos[2]);
  const camH = c.pos[1];
  const fogFar = Math.max(900, camH * 12);

  const water = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: waterVert,
        fragmentShader: waterFrag,
        uniforms: {
          uT: { value: 0 }, uScroll: { value: 0 }, uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
          uFogFar: { value: 1000 }, uSunDir: { value: new THREE.Vector3(0.5, 0.6, -0.4) }, uWake: { value: 0 }, uSplit: { value: 0 }, uChop: { value: 1 },
        },
      }),
    [],
  );
  const isWater = biome === 'water' || biome === 'ocean';
  if (isWater) {
    const u = water.uniforms;
    u.uT.value = t;
    u.uScroll.value = scroll;
    u.uDeep.value.set(biome === 'ocean' ? '#0b2f4f' : '#1d4a55');
    u.uShallow.value.set(biome === 'ocean' ? '#14507a' : '#2f6a6a');
    u.uSky.value.set(sk.bottom);
    u.uFog.value.set(sk.fog);
    u.uFogFar.value = fogFar * 1.2;
    u.uWake.value = p.wake ?? 0;
    u.uSplit.value = p.split ?? 0;
    u.uChop.value = biome === 'ocean' ? 1.6 : 0.5;
  }

  // ground textures scroll with the world
  const grass = tex('grass');
  grass.offset.y = scroll / 10; // repeat 400 over 4000 m -> 10 m per tile
  const asph = tex('asphalt');
  const roadW = biome === 'highway' ? 26 : 8;
  asph.offset.y = scroll / (4000 / 600);
  const farm = tex('farm');
  farm.offset.y = scroll / (6000 / 6);

  // instanced trees (wrapped); 'bend' tilts trees behind the runner outward
  const trees = useMemo(() => {
    const N = 900;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 3.4, 6), new THREE.MeshStandardMaterial({ color: '#5a4030', flatShading: true }), N);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 6.5, 7), new THREE.MeshStandardMaterial({ color: '#3f6e2e', flatShading: true }), N);
    const crown2 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.3, 0), new THREE.MeshStandardMaterial({ color: '#5a8a3a', flatShading: true }), N);
    trunk.castShadow = crown.castShadow = crown2.castShadow = true;
    for (let i = 0; i < N; i++) {
      crown.setColorAt(i, new THREE.Color('#3f6e2e').multiplyScalar(0.75 + hash(i + 7) * 0.5));
      crown2.setColorAt(i, new THREE.Color('#5a8a3a').multiplyScalar(0.75 + hash(i + 9) * 0.5));
    }
    return { trunk, crown, crown2, N };
  }, []);
  {
    const o = new THREE.Object3D();
    const dense = biome === 'forest';
    const nUse = biome === 'road' || biome === 'rails' || biome === 'highway' ? 260 : dense ? trees.N : biome === 'farm' ? 500 : 0;
    const L = dense ? 600 : biome === 'farm' ? 3000 : 900;
    for (let i = 0; i < trees.N; i++) {
      if (i >= nUse) {
        o.scale.setScalar(0);
        o.updateMatrix();
        trees.trunk.setMatrixAt(i, o.matrix);
        trees.crown.setMatrixAt(i, o.matrix);
        trees.crown2.setMatrixAt(i, o.matrix);
        continue;
      }
      const side = i % 2 ? 1 : -1;
      const minX = biome === 'highway' ? 22 : biome === 'rails' ? 16 : 7.5;
      const x = side * (minX + (dense ? Math.pow(hash(i * 1.3), 1.4) * 70 : biome === 'farm' ? hash(i * 1.3) * 1200 : 6 + hash(i * 1.3) * 60));
      const z = wrap(hash(i * 2.9) * L + scroll, L, L * 0.8);
      const s = 0.7 + hash(i * 4.1) * 0.6;
      // shock passes the tree when it is behind the runner
      const k = (p.bend ?? 0) * THREE.MathUtils.smoothstep(z, -2, 10) * Math.max(0.25, 1 - Math.abs(x) / 90);
      const tilt = k * 1.25;
      o.position.set(x, 0, z);
      o.rotation.set(-k * 0.35, 0, -side * tilt);
      o.scale.set(s, s, s);
      o.updateMatrix();
      const base = o.matrix.clone();
      const put = (m: THREE.InstancedMesh, y: number, hide = false) => {
        const loc = new THREE.Matrix4().makeTranslation(0, y, 0);
        if (hide) loc.scale(new THREE.Vector3(0, 0, 0));
        m.setMatrixAt(i, base.clone().multiply(loc));
      };
      const conifer = dense ? hash(i * 5.5) < 0.65 : hash(i * 5.5) < 0.3;
      put(trees.trunk, 1.7);
      put(trees.crown, 5.6, !conifer);
      put(trees.crown2, 4.6, conifer);
    }
    trees.trunk.instanceMatrix.needsUpdate = trees.crown.instanceMatrix.needsUpdate = trees.crown2.instanceMatrix.needsUpdate = true;
  }

  // dashes / poles / sleepers (wrapped)
  const dashes = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 3), new THREE.MeshBasicMaterial({ color: '#efe9d6' }), 400);
    return m;
  }, []);
  {
    const o = new THREE.Object3D();
    const lanes = biome === 'highway' ? [-7.8, -3.9, 3.9, 7.8] : biome === 'farm' || isWater ? [] : [0];
    let k = 0;
    for (const x of lanes)
      for (let j = 0; j < 80 && k < 400; j++, k++) {
        o.position.set(x, 0.02, wrap(-j * 9 + scroll, 720, 600));
        o.rotation.set(-Math.PI / 2, 0, 0);
        o.scale.setScalar(1);
        o.updateMatrix();
        dashes.setMatrixAt(k, o.matrix);
      }
    for (; k < 400; k++) {
      o.scale.setScalar(0);
      o.updateMatrix();
      dashes.setMatrixAt(k, o.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
  }
  const poles = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.15, 9, 6), new THREE.MeshStandardMaterial({ color: '#6b5240' }), 40);
    m.castShadow = true;
    return m;
  }, []);
  {
    const o = new THREE.Object3D();
    const on = biome === 'road' || biome === 'rails' || biome === 'forest';
    for (let j = 0; j < 40; j++) {
      o.position.set(biome === 'rails' ? -13.5 : 6.2, 4.5, wrap(-j * 35 + scroll, 1400, 1200));
      o.scale.setScalar(on ? 1 : 0);
      o.updateMatrix();
      poles.setMatrixAt(j, o.matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
  }
  const sleepers = useMemo(() => new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: '#5d5750' }), 700), []);
  if (biome === 'rails') {
    const o = new THREE.Object3D();
    for (let j = 0; j < 700; j++) {
      o.position.set(-9, 0.25, wrap(-j * 0.75 + scroll, 525, 450));
      o.updateMatrix();
      sleepers.setMatrixAt(j, o.matrix);
    }
    sleepers.instanceMatrix.needsUpdate = true;
  }

  // highway traffic: same direction, moving forward much slower than the runner (carRel = 1 - vCar/vRunner)
  const cars = useMemo(() => Array.from({ length: 36 }, (_, i) => ({ x: [-9.7, -5.85, -1.95, 1.95, 5.85, 9.7][i % 6], z0: -hash(i * 3.3) * 600, c: ['#c0392b', '#ecf0f1', '#2e86c1', '#1c2a4a', '#f1c40f', '#7a7f87', '#27ae60', '#e8e4dc'][i % 8] })), []);

  // water spray / dust / sparks
  const spray = p.spray ?? 0;
  const sprayH = p.sprayH ?? 4;
  const walls = spray > 0.01 ? sprayData('wall', 900, t, spray, 18 + sprayH * 6, sprayH, 0.35, 0.9 + sprayH * 0.12, [runX, 0, 0.3], 1.5) : null;
  const tail = spray > 0.01 ? sprayData('tail', 350, t, spray, 10 + sprayH * 3, sprayH * 1.3, 0.12, 0.7 + sprayH * 0.1, [runX, 0, 0.3], 1.8) : null;
  const dust = (p.dust ?? 0) > 0.01 ? sprayData('dust', 1200, t, p.dust!, 60, 7, 0.25, 2.6, [runX, 0, 0.4], 0.9) : null;
  const sparks = (p.fire ?? 0) > 0.3 ? sprayData('sparks', 300, t, p.fire!, 5, 1.6, 1, 0.12, [runX, 0, 0.2], 2.5) : null;

  const trail = p.trail ?? 0;
  return (
    <ThreeCanvas width={width} height={height} shadows camera={{ fov: c.fov ?? 45, position: [0, 2, 10], near: 0.05, far: 9000 }} gl={{ antialias: true }} onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.05;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }}>
      <CameraRig {...c} />
      <SkyDome top={new THREE.Color(sk.top)} bottom={new THREE.Color(sk.bottom)} stars={0} radius={8000} />
      <fog attach="fog" args={[sk.fog, fogFar * 0.25, fogFar]} />
      <hemisphereLight args={['#dfeaff', '#6a6a50', sk.hemi]} />
      <ambientLight intensity={0.2} />
      <primitive object={sun} />
      <primitive object={sun.target} />

      {/* ground */}
      {isWater ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={water}>
          <planeGeometry args={[12000, 12000, 1, 1]} />
        </mesh>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={biome === 'farm' ? [6000, 6000] : [4000, 4000]} />
          <meshStandardMaterial map={biome === 'farm' ? farm : grass} roughness={1} />
        </mesh>
      )}
      {biome === 'water' &&
        [-1, 1].map((s) => (
          <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[s * 1060, 0.3, 0]}>
            <planeGeometry args={[2000, 12000]} />
            <meshStandardMaterial map={grass} roughness={1} />
          </mesh>
        ))}
      {!isWater && biome !== 'farm' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
          <planeGeometry args={[roadW, 4000]} />
          <meshStandardMaterial map={asph} roughness={0.9} />
        </mesh>
      )}
      {biome === 'farm' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <planeGeometry args={[5, 6000]} />
          <meshStandardMaterial map={tex('gravel')} roughness={1} />
        </mesh>
      )}
      {!isWater && biome !== 'farm' &&
        [-1, 1].map((s) => (
          <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[s * (roadW / 2 - 0.35), 0.02, 0]}>
            <planeGeometry args={[0.18, 4000]} />
            <meshBasicMaterial color="#efe9d6" />
          </mesh>
        ))}
      <primitive object={dashes} />
      <primitive object={poles} />
      <primitive object={trees.trunk} />
      <primitive object={trees.crown} />
      <primitive object={trees.crown2} />
      {biome === 'rails' && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-9, 0.05, 0]}>
            <planeGeometry args={[4.6, 4000]} />
            <meshStandardMaterial map={tex('gravel')} roughness={1} />
          </mesh>
          <primitive object={sleepers} />
          {[-9.72, -8.28].map((x) => (
            <mesh key={x} position={[x, 0.42, 0]}>
              <boxGeometry args={[0.1, 0.16, 4000]} />
              <meshStandardMaterial color="#b9bcc2" metalness={0.8} roughness={0.3} />
            </mesh>
          ))}
          <group position={[-9, 0.4, p.trainZ ?? 0]}>
            {Array.from({ length: 8 }).map((_, i) => (
              <TrainCar key={i} z={i * 25.4} nose={i === 0} />
            ))}
          </group>
        </>
      )}
      {biome === 'highway' &&
        cars.map((k, i) => (
          <Car key={i} x={k.x} z={wrap(k.z0 + scroll * (p.carRel ?? 1), 700, 560)} rotY={Math.PI} color={k.c} />
        ))}
      {/* distant hills */}
      {Array.from({ length: 28 }).map((_, i) => {
        const a = (i / 28) * Math.PI * 2;
        const r = 3800 + hash(i) * 600;
        return (
          <mesh key={i} position={[Math.cos(a) * r, -40, Math.sin(a) * r]} scale={[700 + hash(i + 1) * 600, 260 + hash(i + 2) * 420, 500]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color={biome === 'ocean' ? sk.fog : '#6f8a6a'} roughness={1} fog />
          </mesh>
        );
      })}
      {p.jet && <Jet pos={p.jet} />}

      {R && <primitive object={R.root} />}
      <FeetFire rig={R} amount={p.fire ?? 0} t={t} />
      <Aura pos={[runX, 0, 0]} amount={p.aura ?? 0} t={t} />
      <MachCone pos={[runX, 0, 0]} amount={p.cone ?? 0} t={t} />
      <ShockDomes t={t} at={p.domes ?? []} center={[runX, 0, 0]} speed={70} life={1.1} drift={30} />
      <Trail from={[runX, 0.95, 0.3]} len={p.trailLen ?? 120} width={0.9 * (p.trailW ?? 1)} amount={trail} color="#ffcf8a" vertical />
      <Trail from={[runX, 0.04, 0.2]} len={(p.trailLen ?? 120) * 0.8} width={1.4 * (p.trailW ?? 1)} amount={p.burn ?? 0} color="#ff6a1a" />
      {walls && <Puffs data={walls} color="#eef6ff" />}
      {tail && <Puffs data={tail} color="#f4f9ff" />}
      {dust && <Puffs data={dust} color="#b9a183" />}
      {sparks && <Puffs data={sparks} color="#ffb04a" additive />}
      <Redraw deps={[R]} />
      <Post bloom={bloom} focus={focus} aperture={aperture} />
    </ThreeCanvas>
  );
};
