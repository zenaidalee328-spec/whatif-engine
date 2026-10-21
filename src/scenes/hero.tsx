import { useMemo } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGLB } from './fx3d';

/*
  The hero: a realistic bearded man (models/man.glb, Mixamo-compatible bone names without prefix)
  driven by the Mixamo walk/run clips of models/Xbot.glb, retargeted at load time in WORLD space:
  1. pose the target's rest so every limb points the same way as the source's rest (bone-direction alignment);
  2. per sampled frame: Wt = Ws(t) * Rs^-1 * Rt   (world rotations), then convert to local quaternions.
  Clips: walk, run, sprint (run with exaggerated amplitude). All baked once and cached.
*/

const BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];
const CHILD: Record<string, string> = {
  Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandMiddle1',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandMiddle1',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', LeftToeBase: 'LeftToe_End',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase', RightToeBase: 'RightToe_End',
};
const SRC = (n: string) => 'mixamorig' + n;

const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

const qPow = (q: THREE.Quaternion, k: number) => {
  // q^k for a unit quaternion (k may be > 1 to exaggerate)
  const w = THREE.MathUtils.clamp(q.w, -1, 1);
  const ang = 2 * Math.acos(Math.abs(w));
  if (ang < 1e-6) return new THREE.Quaternion();
  const s = Math.sqrt(1 - w * w) * Math.sign(w || 1);
  const axis = new THREE.Vector3(q.x / s, q.y / s, q.z / s).normalize();
  return new THREE.Quaternion().setFromAxisAngle(axis, ang * k);
};

type Baked = { clips: Record<string, THREE.AnimationClip>; restLocal: Record<string, THREE.Quaternion> };
let bakedCache: Baked | null = null;

const bake = (man: THREE.Object3D, bot: THREE.Object3D, botClips: THREE.AnimationClip[]): Baked => {
  const tgt = cloneSkinned(man);
  const src = cloneSkinned(bot);
  tgt.updateMatrixWorld(true);
  src.updateMatrixWorld(true);
  const T: Record<string, THREE.Object3D> = {}, S: Record<string, THREE.Object3D> = {};
  for (const n of BONES) {
    T[n] = tgt.getObjectByName(n)!;
    S[n] = src.getObjectByName(SRC(n))!;
  }
  // 1. align target rest directions to source rest directions (parents first)
  for (const n of BONES) {
    const c = CHILD[n];
    const tc = tgt.getObjectByName(c), sc = src.getObjectByName(SRC(c));
    if (!tc || !sc || n === 'Hips') continue;
    tgt.updateMatrixWorld(true);
    const dt = wp(tc).sub(wp(T[n])).normalize();
    const ds = wp(sc).sub(wp(S[n])).normalize();
    const swing = new THREE.Quaternion().setFromUnitVectors(dt, ds); // world-space
    const parentW = wq(T[n].parent!);
    const boneW = wq(T[n]);
    const newW = swing.multiply(boneW);
    T[n].quaternion.copy(parentW.invert().multiply(newW));
  }
  tgt.updateMatrixWorld(true);
  const Rt: Record<string, THREE.Quaternion> = {}, Rs: Record<string, THREE.Quaternion> = {};
  const restLocal: Record<string, THREE.Quaternion> = {};
  for (const n of BONES) {
    Rt[n] = wq(T[n]);
    Rs[n] = wq(S[n]);
    restLocal[n] = T[n].quaternion.clone();
  }
  const hipT0 = wp(T.Hips), hipS0 = wp(S.Hips);
  const legT = wp(T.Hips).y - wp(T.LeftFoot).y, legS = wp(S.Hips).y - wp(S.LeftFoot).y;
  const scale = legT / legS;
  const armatureW = wq(T.Hips.parent!);

  const mixer = new THREE.AnimationMixer(src);
  const clips: Record<string, THREE.AnimationClip> = {};
  const make = (name: string, srcName: string, amp: number) => {
    const clip = botClips.find((c) => c.name === srcName)!;
    const action = mixer.clipAction(clip);
    action.play();
    const N = Math.max(2, Math.round(clip.duration * 30));
    const times: number[] = [];
    const vals: Record<string, number[]> = {};
    BONES.forEach((n) => (vals[n] = []));
    const hipPos: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * clip.duration;
      times.push(t);
      action.time = t;
      mixer.update(0);
      src.updateMatrixWorld(true);
      const W: Record<string, THREE.Quaternion> = {};
      for (const n of BONES) {
        const ws = wq(S[n]);
        W[n] = ws.multiply(Rs[n].clone().invert()).multiply(Rt[n]);
        const pw = n === 'Hips' ? armatureW.clone() : W[BONES.find((b) => T[b] === T[n].parent) ?? ''] ?? wq(T[n].parent!);
        let local = pw.clone().invert().multiply(W[n]);
        if (amp !== 1 && n !== 'Hips') local = restLocal[n].clone().multiply(qPow(restLocal[n].clone().invert().multiply(local), amp));
        vals[n].push(local.x, local.y, local.z, local.w);
      }
      const d = wp(S.Hips).sub(hipS0).multiplyScalar(scale);
      hipPos.push(hipT0.x, hipT0.y + d.y * (amp > 1 ? 1.25 : 1), hipT0.z);
    }
    action.stop();
    const tracks: THREE.KeyframeTrack[] = BONES.map((n) => new THREE.QuaternionKeyframeTrack(`${T[n].name}.quaternion`, times, vals[n]));
    tracks.push(new THREE.VectorKeyframeTrack(`${T.Hips.name}.position`, times, hipPos));
    clips[name] = new THREE.AnimationClip(name, clip.duration, tracks);
  };
  make('walk', 'walk', 1);
  make('run', 'run', 1);
  make('sprint', 'run', 1.3);
  return { clips, restLocal };
};

// the model's peach tweed suit -> dark navy wool (keeps the purple vest, white shirt and tie)
const SUIT = new THREE.Color('#222b44');
const HAT_GLSL = `bool isHat(vec3 p) { float r = length(vec2(p.x, p.z - 0.01)); return p.y > 1.745 || (p.y > 1.665 && r > 0.118); }`;

type HeatU = { uHeat: { value: number }; uTime: { value: number } };
/**
 * One shader patch per hero material:
 *  - suit recolor (peach tweed -> navy) for the outfit
 *  - hat split (0 all, 1 hair only, 2 hat only) for the headwear
 *  - heat: 0..0.5 smoulder (charring + glowing embers + hot rim), 0.5..1 white-hot plasma
 */
const patchMat = (m: THREE.MeshStandardMaterial, heat: HeatU, opts: { suit?: { tint: THREE.Color; all: boolean }; hat?: { value: number } }) => {
  const key = `hero-${opts.suit ? 'suit' + opts.suit.all : ''}-${opts.hat ? 'hat' : ''}`;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHeat = heat.uHeat;
    sh.uniforms.uTime = heat.uTime;
    if (opts.suit) sh.uniforms.uTint = { value: opts.suit.tint };
    if (opts.hat) sh.uniforms.uHatMode = opts.hat;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    let f = sh.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vBind; uniform float uHeat; uniform float uTime; uniform vec3 uTint; uniform float uHatMode;
       ${HAT_GLSL}
       float hh3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
       float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
         return mix(mix(mix(hh3(i), hh3(i+vec3(1,0,0)), f.x), mix(hh3(i+vec3(0,1,0)), hh3(i+vec3(1,1,0)), f.x), f.y),
                    mix(mix(hh3(i+vec3(0,0,1)), hh3(i+vec3(1,0,1)), f.x), mix(hh3(i+vec3(0,1,1)), hh3(i+vec3(1,1,1)), f.x), f.y), f.z); }`,
    );
    if (opts.hat) f = f.replace('void main() {', 'void main() {\n if (uHatMode > 0.5 && uHatMode < 1.5 && isHat(vBind)) discard;\n if (uHatMode > 1.5 && !isHat(vBind)) discard;');
    if (opts.suit)
      f = f.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         {
           vec3 c = diffuseColor.rgb;
           float l = dot(c, vec3(0.299, 0.587, 0.114));
           float d = c.r - c.g;
           float peach = smoothstep(-0.03, 0.03, d) * (1.0 - smoothstep(0.3, 0.42, d)) * smoothstep(0.04, -0.02, c.b - c.g) * smoothstep(0.05, 0.12, l);
           diffuseColor.rgb = mix(c, uTint * (0.75 + 1.1 * l), ${opts.suit.all ? '1.0' : 'peach'});
         }`,
      );
    f = f
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float hA = clamp(uHeat * 2.0, 0.0, 1.0), hB = clamp(uHeat * 2.0 - 1.0, 0.0, 1.0);
         float nE = vn3(vBind * 38.0 + vec3(0.0, -uTime * 2.0, 0.0)) * 0.6 + vn3(vBind * 90.0 + uTime) * 0.4;
         diffuseColor.rgb *= 1.0 - 0.75 * hA * smoothstep(0.35, 0.75, nE);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         {
           float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
           float flick = 0.75 + 0.25 * sin(uTime * 37.0 + vBind.y * 20.0);
           vec3 hot = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.8, 0.55), hB);
           totalEmissiveRadiance += hot * hA * (1.6 * fr + 3.0 * pow(smoothstep(0.55, 0.9, nE), 2.0)) * flick;
           totalEmissiveRadiance += vec3(1.0, 0.9, 0.75) * (hB * hB * 5.0 + hB * fr * 6.0);
         }`,
      );
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => key;
};

export type Hero = {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  acts: Record<'walk' | 'run' | 'sprint', THREE.AnimationAction>;
  bones: Record<string, THREE.Object3D>;
  mats: THREE.MeshStandardMaterial[];
  hat: { flyer: THREE.Mesh; skinned: THREE.SkinnedMesh; boneIndex: number; uniform: { value: number } } | null;
  heat: HeatU;
};

export const makeHero = (man: THREE.Object3D, baked: Baked, suit = SUIT): Hero => {
  const root = cloneSkinned(man);
  let headwear: THREE.Object3D | null = null;
  const mats: THREE.MeshStandardMaterial[] = [];
  const heat: HeatU = { uHeat: { value: 0 }, uTime: { value: 0 } };
  const hatMode = { value: 0 };
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    const m = (o.material as THREE.MeshStandardMaterial).clone();
    const isSuit = m.name === 'Wolf3D_Outfit_Top' || m.name === 'Wolf3D_Outfit_Bottom';
    if (o.name === 'Wolf3D_Headwear') headwear = o;
    patchMat(m, heat, { suit: isSuit ? { tint: suit, all: m.name === 'Wolf3D_Outfit_Bottom' } : undefined, hat: o.name === 'Wolf3D_Headwear' ? hatMode : undefined });
    o.material = m;
    mats.push(m);
  });
  let hat: Hero['hat'] = null;
  if (headwear) {
    const sk = headwear as THREE.SkinnedMesh;
    const mode = hatMode;
    const fm = (sk.material as THREE.MeshStandardMaterial).clone();
    patchMat(fm, heat, { hat: { value: 2 } });
    const flyer = new THREE.Mesh(sk.geometry, fm);
    flyer.matrixAutoUpdate = false;
    flyer.visible = false;
    flyer.frustumCulled = false;
    flyer.castShadow = true;
    const boneIndex = sk.skeleton.bones.findIndex((b) => b.name === 'Head');
    hat = { flyer, skinned: sk, boneIndex, uniform: mode };
  }
  const mixer = new THREE.AnimationMixer(root);
  const acts = {
    walk: mixer.clipAction(baked.clips.walk),
    run: mixer.clipAction(baked.clips.run),
    sprint: mixer.clipAction(baked.clips.sprint),
  };
  Object.values(acts).forEach((a) => a.play());
  const bones: Record<string, THREE.Object3D> = {};
  BONES.forEach((n) => (bones[n] = root.getObjectByName(n)!));
  return { root, mixer, acts, bones, mats, hat, heat };
};

/**
 * phase = gait cycles; run 0..1 walk->run; sprint 0..1 run->sprint; lean (rad) forward tilt of the torso
 */
export const poseHero = (h: Hero, phase: number, run: number, sprint = 0, lean = 0) => {
  const w = { walk: 1 - run, run: run * (1 - sprint), sprint: run * sprint };
  (Object.keys(h.acts) as (keyof typeof w)[]).forEach((k) => {
    const a = h.acts[k];
    if (!a.isRunning()) a.play();
    a.setEffectiveWeight(w[k]);
    a.time = (((phase % 1) + 1) % 1) * a.getClip().duration;
  });
  h.mixer.update(0);
  if (lean) {
    // pitch the torso forward about the hero's own lateral axis (world space), head counter-rotates
    h.root.updateMatrixWorld(true);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(wq(h.root));
    const tilt = (b: THREE.Object3D, a: number) => {
      const pw = wq(b.parent!);
      const r = new THREE.Quaternion().setFromAxisAngle(side, a);
      b.quaternion.copy(pw.clone().invert().multiply(r).multiply(pw).multiply(b.quaternion));
      b.updateMatrixWorld(true);
    };
    tilt(h.bones.Spine, lean * 0.5);
    tilt(h.bones.Spine1, lean * 0.3);
    tilt(h.bones.Neck, -lean * 0.55);
  }
};

/**
 * hat state: fly < 0 -> on the head; fly >= 0 -> seconds since the wind took it.
 * The flying hat starts from the head's current transform and tumbles back/up in hero space.
 * Add hero.hat.flyer to the scene (world space).
 */
export const hatHero = (h: Hero, fly: number, back = 9, up = 2.5) => {
  if (!h.hat) return;
  const { flyer, skinned, boneIndex, uniform } = h.hat;
  if (fly < 0) {
    uniform.value = 0;
    flyer.visible = false;
    return;
  }
  uniform.value = 1;
  flyer.visible = true;
  h.root.updateMatrixWorld(true);
  const head = skinned.skeleton.bones[boneIndex];
  const attach = head.matrixWorld.clone().multiply(skinned.skeleton.boneInverses[boneIndex]);
  // pivot at the hat (~1.76 m in bind space)
  const piv = new THREE.Vector3(0, 1.76, 0);
  const s = fly;
  const local = new THREE.Vector3(Math.sin(s * 3) * 0.3, up * s - 4.9 * s * s * 0.35, back * s); // hero space: +z = behind (hero faces +z in model space -> flip)
  const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-s * 9, s * 4, s * 2));
  const heroQ = h.root.getWorldQuaternion(new THREE.Quaternion());
  const off = local.clone().multiplyScalar(-1).setY(local.y).applyQuaternion(heroQ);
  const m = new THREE.Matrix4()
    .makeTranslation(off.x, off.y, off.z)
    .multiply(attach)
    .multiply(new THREE.Matrix4().makeTranslation(piv.x, piv.y, piv.z))
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rq))
    .multiply(new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z));
  flyer.matrix.copy(m);
  flyer.matrixWorldNeedsUpdate = true;
};

/**
 * Free-fall float pose (no air -> nothing pushes the limbs; a relaxed, arms-out drift).
 * Starts from the aligned T-pose and rotates limbs in world space about the hero's own axes.
 */
export const floatHero = (h: Hero, t: number, panic = 0) => {
  const rest = bakedCache?.restLocal;
  if (!rest) return;
  h.mixer.stopAllAction();
  for (const n of BONES) if (rest[n]) h.bones[n].quaternion.copy(rest[n]);
  h.root.updateMatrixWorld(true);
  const rq = wq(h.root);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rq);
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(rq);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rq);
  const rot = (b: THREE.Object3D, axis: THREE.Vector3, a: number) => {
    const pw = wq(b.parent!);
    const r = new THREE.Quaternion().setFromAxisAngle(axis, a);
    b.quaternion.copy(pw.clone().invert().multiply(r).multiply(pw).multiply(b.quaternion));
    b.updateMatrixWorld(true);
  };
  const w1 = Math.sin(t * 1.3), w2 = Math.sin(t * 0.9 + 1), w3 = Math.sin(t * 1.7 + 2);
  const flap = panic * Math.sin(t * 9);
  rot(h.bones.LeftArm, fwd, -0.55 + 0.12 * w1 + 0.35 * flap);
  rot(h.bones.RightArm, fwd, 0.55 - 0.12 * w2 - 0.35 * flap);
  rot(h.bones.LeftForeArm, up, 0.35 + 0.1 * w2);
  rot(h.bones.RightForeArm, up, -0.35 - 0.1 * w1);
  rot(h.bones.LeftUpLeg, fwd, -0.1 - 0.05 * w3);
  rot(h.bones.RightUpLeg, fwd, 0.1 + 0.05 * w1);
  rot(h.bones.LeftUpLeg, side, -0.15 + 0.08 * w2);
  rot(h.bones.RightUpLeg, side, 0.1 - 0.08 * w3);
  rot(h.bones.LeftLeg, side, 0.35 + 0.1 * w1);
  rot(h.bones.RightLeg, side, 0.25 + 0.1 * w3);
  rot(h.bones.Spine, side, 0.06 * w2);
  rot(h.bones.Neck, side, -0.1 + 0.05 * w3);
};

/** glow the hero (meteor stage): 0 = normal, 1 = white-hot */
export const heatHero = (h: Hero, heat: number, t = 0) => {
  h.heat.uHeat.value = heat;
  h.heat.uTime.value = t;
};

/** flames streaming back off the body (world space), amount 0..1 */
const FIRE_BONES = ['Spine', 'Spine1', 'Spine2', 'Neck', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'Hips', 'LeftFoot', 'RightFoot'];
export const bodyFireData = (h: Hero, t: number, amount: number, back: THREE.Vector3, per = 26) => {
  const n = FIRE_BONES.length * per;
  const pos = new Float32Array(n * 3), a = new Float32Array(n), s = new Float32Array(n);
  h.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  FIRE_BONES.forEach((name, bi) => {
    h.bones[name] ? h.bones[name].getWorldPosition(v) : h.root.getObjectByName(name)?.getWorldPosition(v);
    for (let k = 0; k < per; k++) {
      const i = bi * per + k;
      const r1 = Math.sin(i * 12.9898) * 43758.5453, r2 = Math.sin(i * 78.233) * 12345.678;
      const h1 = r1 - Math.floor(r1), h2 = r2 - Math.floor(r2);
      const u = (h1 + t * (2.2 + h2 * 1.6)) % 1;
      pos[i * 3] = v.x + back.x * u * 1.4 + (h2 - 0.5) * 0.25;
      pos[i * 3 + 1] = v.y + u * 0.45 + (h1 - 0.5) * 0.15;
      pos[i * 3 + 2] = v.z + back.z * u * 1.4 + (h1 - 0.5) * 0.25;
      a[i] = amount * (1 - u) * (0.5 + 0.5 * h2);
      s[i] = (0.22 + 0.25 * h1) * (1 - 0.4 * u);
    }
  });
  return { pos, a, s };
};

/** loads man + animation source, bakes clips once; returns a factory */
export const useHeroFactory = () => {
  const man = useGLB('models/man.glb');
  const bot = useGLB('models/Xbot.glb');
  return useMemo(() => {
    if (!man || !bot) return null;
    if (!bakedCache) bakedCache = bake(man.scene, bot.scene, bot.animations);
    const b = bakedCache;
    return (suit?: string) => makeHero(man.scene, b, suit ? new THREE.Color(suit) : SUIT);
  }, [man, bot]);
};
