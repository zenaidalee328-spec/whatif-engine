import React, { useMemo } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/* The runner (Mixamo Xbot painted as a bearded man in a navy suit + red tie) and his speed effects. */
// ---------- animated characters ----------
const JOINTS = 'Beta_Joints_MAT';
export type Rig = { root: THREE.Object3D; mixer: THREE.AnimationMixer; walk: THREE.AnimationAction; run: THREE.AnimationAction };
export const makeRig = (src: THREE.Object3D, clips: THREE.AnimationClip[], suit: string, skin: string, hair: string, tie: boolean): Rig => {
  const root = cloneSkinned(src);
  const suitC = new THREE.Color(suit), skinC = new THREE.Color(skin), jointC = new THREE.Color(suit).multiplyScalar(0.75);
  const hairC = new THREE.Color(hair), eyeC = new THREE.Color('#141010');
  const beardOn = tie;
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;
    const isJoint = (o.material as THREE.Material).name === JOINTS;
    // per-vertex colours from the bind (T) pose: head/neck and hands are skin, the rest is the suit
    const g = (o.geometry as THREE.BufferGeometry).clone();
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const isSkin = (y > 1.47 && Math.abs(x) < 0.16) || Math.abs(x) > 0.69;
      // painted features on the egg head (bind pose, metres): hair cap, beard, eyes
      const isHair = y > 1.6 && Math.abs(x) < 0.16 && (y > 1.755 - Math.max(0, -z) * 0.9 || (z < -0.02 && y > 1.62));
      const isBeard = beardOn && y > 1.545 && y < 1.625 && z > 0.0 && Math.abs(x) < 0.085 && !(y > 1.6 && Math.abs(x) < 0.022 && z > 0.07);
      const isEye = y > 1.685 && y < 1.712 && z > 0.06 && Math.abs(Math.abs(x) - 0.034) < 0.013;
      const c = isEye ? eyeC : isHair || isBeard ? hairC : isSkin ? skinC : isJoint ? jointC : suitC;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.geometry = g;
    o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.02 });
  });
  if (tie) {
    const spine = root.getObjectByName('mixamorigSpine2');
    if (spine) {
      const collar = new THREE.Mesh(new THREE.BoxGeometry(11, 16, 1.5), new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.6 }));
      collar.position.set(0, 6, 10.4);
      spine.add(collar);
      const t = new THREE.Mesh(new THREE.BoxGeometry(4.5, 24, 2), new THREE.MeshStandardMaterial({ color: '#c0262d', roughness: 0.5 }));
      t.position.set(0, 3, 11.4);
      spine.add(t);
    }
  }
  const mixer = new THREE.AnimationMixer(root);
  const walk = mixer.clipAction(clips.find((c) => c.name === 'walk')!);
  const run = mixer.clipAction(clips.find((c) => c.name === 'run')!);
  walk.play();
  run.play();
  return { root, mixer, walk, run };
};
/** pose a rig: phase in cycles (integrated), runMix 0..1 */
export const pose = (r: Rig, phase: number, runMix: number) => {
  r.walk.setEffectiveWeight(1 - runMix);
  r.run.setEffectiveWeight(runMix);
  const wd = r.walk.getClip().duration, rd = r.run.getClip().duration;
  r.walk.time = (phase % 1) * wd;
  r.run.time = (phase % 1) * rd;
  r.mixer.update(0);
};


/** gait phase (cycles) for a speed profile: walk cadence ~1/s at 5 km/h, run cadence grows and caps */
export const gaitPhase = (rt: number, speedAt: (s: number) => number) => {
  let phase = 0;
  const dt = 1 / 60;
  for (let s = 0; s < Math.max(0, rt); s += dt) {
    const vv = speedAt(s);
    phase += Math.min(3.2, vv < 9 ? vv / 5 : 1.1 + vv / 30) * dt;
  }
  return phase;
};

let glowTex: THREE.CanvasTexture | null = null;
export const glowMap = () => {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,210,140,0.85)');
  gr.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
};

/** fire at both feet (amount 0..1) with a short burning trail behind */
export const FeetFire: React.FC<{ rig: Rig | null; amount: number; t: number; trailDir?: [number, number, number] }> = ({ rig, amount, t, trailDir = [0, 0, 1] }) => {
  const pts = useMemo(() => new Float32Array(3 * 2 * 9), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    return g;
  }, [pts]);
  if (!rig || amount <= 0.01) return null;
  rig.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  ['LeftFoot', 'RightFoot'].forEach((n, fi) => {
    (rig.root.getObjectByName('mixamorig' + n) ?? rig.root.getObjectByName(n))?.getWorldPosition(v);
    for (let k = 0; k < 9; k++) {
      const i = (fi * 9 + k) * 3;
      const jitter = Math.sin(t * 40 + k * 7 + fi) * 0.04;
      pts[i] = v.x + trailDir[0] * k * 0.18 + jitter;
      pts[i + 1] = Math.max(0.05, v.y - 0.05 + k * 0.02 + Math.abs(jitter));
      pts[i + 2] = v.z + trailDir[2] * k * 0.18;
    }
  });
  (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  return (
    <points geometry={geo}>
      <pointsMaterial size={0.55} map={glowMap()} color="#ffb060" transparent opacity={amount} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
    </points>
  );
};

/** glowing plasma shell around the runner (amount 0..1) */
export const Aura: React.FC<{ pos: [number, number, number]; amount: number; t: number; color?: string }> = ({ pos, amount, t, color = '#ffd8a0' }) => {
  if (amount <= 0.01) return null;
  return (
    <group position={pos}>
      <sprite position={[0, 1, 0]} scale={[2.0 * (0.8 + amount * 0.5), 2.6 * (0.8 + amount * 0.5), 1]}>
        <spriteMaterial map={glowMap()} color={color} transparent opacity={0.16 * amount} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
    </group>
  );
};

// ---------------------------------------------------------------- camera rig shared by the run scenes
export type RigSpec = { mode: 'front' | 'low' | 'side' | 'rear' | 'aerial' | 'top' | 'up'; dist?: number; height?: number; side?: number; fov?: number; ahead?: number; look?: number };
/** camera relative to a runner at (rx, ?, rz) running toward -z */
export const rigCam = (rig: RigSpec, rx: number, rz: number) => {
  const D = rig.dist ?? 4, H = rig.height ?? 1.5, S = rig.side ?? 0, A = rig.ahead ?? 0, L = rig.look ?? 1.05;
  switch (rig.mode) {
    case 'front': return { pos: [rx + S, H, rz - D] as V3, look: [rx, L, rz - A] as V3, fov: rig.fov ?? 45 };
    case 'low': return { pos: [rx + S, H, rz - D] as V3, look: [rx, L - 0.1, rz + 2] as V3, fov: rig.fov ?? 55 };
    case 'side': return { pos: [rx - D, H, rz - S] as V3, look: [rx, L, rz - S - 0.5 - A] as V3, fov: rig.fov ?? 40 };
    case 'rear': return { pos: [rx + S, H, rz + D] as V3, look: [rx, L + 0.15, rz - 8 - A] as V3, fov: rig.fov ?? 55 };
    case 'aerial': return { pos: [rx + S, H, rz + D] as V3, look: [rx, 0, rz - A] as V3, fov: rig.fov ?? 50 };
    case 'top': return { pos: [rx + S, H, rz + D] as V3, look: [rx + S * 0.98, 0, rz + D * 0.98 - 0.01 - A] as V3, fov: rig.fov ?? 50 };
    case 'up': return { pos: [rx + S, H, rz - D] as V3, look: [rx + S * 0.3, H + (rig.look ?? 30), rz - D - A] as V3, fov: rig.fov ?? 60 };
  }
};
type V3 = [number, number, number];

// ---------------------------------------------------------------- soft particles with per-point size + alpha
let puffTex: THREE.CanvasTexture | null = null;
const puffMap = () => {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
};
const puffVert = `attribute float aA; attribute float aS; varying float vA; uniform float uScale;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = min(400.0, aS*uScale / max(0.1,-mv.z)); gl_Position = projectionMatrix*mv; vA = aA; }`;
const puffFrag = `uniform sampler2D map; uniform vec3 color; varying float vA;
void main(){ vec4 tx = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, tx.a*vA); if (gl_FragColor.a < 0.004) discard; }`;

export type PuffData = { pos: Float32Array; a: Float32Array; s: Float32Array };
export const Puffs: React.FC<{ data: PuffData; color: string; additive?: boolean; map?: THREE.Texture | null }> = ({ data, color, additive, map }) => {
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: puffVert, fragmentShader: puffFrag, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { map: { value: puffMap() }, color: { value: new THREE.Color(color) }, uScale: { value: 1400 } } }),
    [additive], // eslint-disable-line react-hooks/exhaustive-deps
  );
  mat.uniforms.color.value.set(color);
  mat.uniforms.map.value = map ?? puffMap();
  geo.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
  geo.setAttribute('aA', new THREE.BufferAttribute(data.a, 1));
  geo.setAttribute('aS', new THREE.BufferAttribute(data.s, 1));
  geo.computeBoundingSphere();
  return <points geometry={geo} material={mat} frustumCulled={false} />;
};

const hh = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/**
 * Spray / dust behind a runner at `origin` moving toward -z.
 * kind: 'wall' = two walls of water thrown sideways, 'tail' = rooster tail straight up behind,
 *       'dust' = billowing ground cloud, 'sparks' = embers
 */
export const sprayData = (kind: 'wall' | 'tail' | 'dust' | 'sparks', n: number, t: number, amount: number, len: number, height: number, spread: number, size: number, origin: V3 = [0, 0, 0], rate = 1.2): PuffData => {
  const pos = new Float32Array(n * 3), a = new Float32Array(n), s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r1 = hh(i * 1.31), r2 = hh(i * 2.17 + 4), r3 = hh(i * 3.7 + 9);
    const u = (r1 + t * rate * (0.7 + 0.6 * r2)) % 1;
    const side = i % 2 ? 1 : -1;
    let x = 0, y = 0, z = u * len;
    if (kind === 'wall') {
      x = side * (0.6 + u * len * spread * (0.75 + 0.5 * r2));
      y = height * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.6) * (0.15 + 0.85 * r3);
      z = u * len * (0.9 + 0.2 * r3);
    } else if (kind === 'tail') {
      x = (r2 - 0.5) * (0.4 + u * len * spread);
      y = height * 4 * u * (1 - u) * (0.4 + 0.6 * r3);
    } else if (kind === 'dust') {
      x = side * r2 * (0.5 + u * len * spread);
      y = height * Math.sqrt(u) * r3;
    } else {
      x = (r2 - 0.5) * 1.2 * (1 + u * 6);
      y = 0.2 + u * height * r3;
      z = u * len * r3;
    }
    pos[i * 3] = origin[0] + x;
    pos[i * 3 + 1] = origin[1] + Math.max(0, y);
    pos[i * 3 + 2] = origin[2] + z;
    const fade = kind === 'sparks' ? 1 - u : Math.min(1, u * 8) * (1 - u);
    a[i] = amount * fade * (kind === 'dust' ? 0.5 : kind === 'sparks' ? 1 : 0.22);
    s[i] = size * (kind === 'dust' ? 0.5 + u * 1.6 : 0.6 + 0.8 * r3) * (kind === 'wall' ? 0.7 + u : 1);
  }
  return { pos, a, s };
};

// ---------------------------------------------------------------- glowing streak behind the runner
let trailTex: THREE.CanvasTexture | null = null;
const trailMap = () => {
  if (trailTex) return trailTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  // across (x): bright core; along (y): fades out toward the tail (top = runner)
  for (let y = 0; y < 256; y++) {
    const along = Math.pow(1 - y / 255, 1.6);
    const gr = g.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, `rgba(255,255,255,${along})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, y, 64, 1);
  }
  trailTex = new THREE.CanvasTexture(c);
  return trailTex;
};
/** flat glowing ribbon from `from` back along +z for `len` metres (vertical = facing camera sideways) */
export const Trail: React.FC<{ from: V3; len: number; width: number; amount: number; color?: string; vertical?: boolean }> = ({ from, len, width, amount, color = '#ffb36b', vertical }) => {
  if (amount <= 0.01) return null;
  const col = new THREE.Color(color).multiplyScalar(2.2);
  return (
    <group position={[from[0], from[1], from[2] + len / 2]} rotation={vertical ? [0, Math.PI / 2, 0] : [-Math.PI / 2, 0, 0]}>
      {[1, 3.5].map((k, i) => (
        <mesh key={i} rotation={vertical ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
          <planeGeometry args={vertical ? [len, width * k] : [width * k, len]} />
          <meshBasicMaterial map={trailMap()} color={i ? col.clone().multiplyScalar(0.5) : col} transparent opacity={amount * (i ? 0.5 : 1)} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
};

// ---------------------------------------------------------------- shock dome + Mach cone (fresnel shells)
const shellVert = `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const shellFrag = `uniform vec3 color; uniform float amount; varying vec3 vN; varying vec3 vV; void main(){ float d = abs(dot(normalize(vN), normalize(vV))); float f = pow(1.0 - d, 2.5); gl_FragColor = vec4(color, (f*0.9 + 0.06)*amount); }`;
const shellMat = (color: string) => new THREE.ShaderMaterial({ vertexShader: shellVert, fragmentShader: shellFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { color: { value: new THREE.Color(color) }, amount: { value: 0 } } });

/** expanding half-sphere shock waves; each starts at `at` (local seconds) */
export const ShockDomes: React.FC<{ t: number; at: number[]; center: V3; speed?: number; life?: number; color?: string; drift?: number }> = ({ t, at, center, speed = 60, life = 1.2, color = '#ffffff', drift = 0 }) => {
  const mats = useMemo(() => at.map(() => shellMat(color)), [at.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {at.map((a, i) => {
        const u = t - a;
        if (u < 0 || u > life) return null;
        mats[i].uniforms.amount.value = Math.pow(1 - u / life, 1.5);
        const r = 0.5 + speed * u;
        return (
          <group key={i}>
            <mesh position={[center[0], center[1], center[2] + drift * u]} scale={[r, r * 0.8, r]} material={mats[i]}>
              <sphereGeometry args={[1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            <mesh position={[center[0], 0.08, center[2] + drift * u]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[r * 0.92, r, 96]} />
              <meshBasicMaterial color="#fff6e6" transparent opacity={0.7 * (1 - u / life)} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}
    </>
  );
};

/** vapour cone (condensation shell) around a transonic runner: soft puffs on a cone opening backward from the chest */
const CONE_N = 900;
export const MachCone: React.FC<{ pos: V3; amount: number; t: number; scale?: number; map?: THREE.Texture | null }> = ({ pos, amount, t, scale = 1, map }) => {
  if (amount <= 0.01) return null;
  const P = new Float32Array(CONE_N * 3), A = new Float32Array(CONE_N), S = new Float32Array(CONE_N);
  for (let i = 0; i < CONE_N; i++) {
    const h1 = hh(i * 1.13), h2 = hh(i * 2.71 + 3), h3 = hh(i * 4.37 + 1);
    const z = Math.pow(h1, 0.7) * 2.6; // distance behind the apex (m)
    const r = (0.25 + z * 0.62) * (0.92 + 0.16 * Math.sin(t * 40 + i));
    const th = h2 * Math.PI * 2 + t * 0.5;
    P[i * 3] = pos[0] + Math.cos(th) * r * scale;
    P[i * 3 + 1] = pos[1] + 1.15 + Math.sin(th) * r * 0.9 * scale;
    P[i * 3 + 2] = pos[2] - 0.35 + z * scale;
    const rim = Math.exp(-Math.pow((z - 1.6) / 0.7, 2)); // densest ring like a Prandtl-Glauert disc
    A[i] = amount * (0.02 + 0.16 * rim) * (0.6 + 0.4 * h3);
    S[i] = (0.12 + 0.22 * h3) * scale;
  }
  return <Puffs data={{ pos: P, a: A, s: S }} color="#ffffff" map={map} />;
};
