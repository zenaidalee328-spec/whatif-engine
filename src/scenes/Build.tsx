import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, SkyDome, clamp01, hash } from './common3d';
import { Env, Post, Redraw } from './fx3d';
import { Hero, actHero, poseHero, standHero, useHeroFactory } from './hero';

/*
  "BUILD" diorama: a chunk of earth with a CUT-AWAY front face (the reference-short look), re-skinnable per video via `env`.
  Block x -5..5, y -4.4..0 (surface y=0), z -5..3 (cut plane at z=3, camera looks from +z).
  The story object is a steel water TANK lying along z (radius 1.7, centre cy); the soil cross-section has a circular
  cavity that follows the tank, and an optional trench (notch) that digs down and is refilled.
  params:
    env      field | beach | desert | snow | forest   (sky, ground, soil colours, props)
    tank     0..1  pop-in (scale)          cy   tank centre height (1.7 = standing on the ground, -2.2 = buried)
    pit      0..1  trench depth (0 none, 1 down to the tank bottom)   — dig 0->1, refill 1->0
    hatch    0..1  hatch cut on top (torch sparks, then lid opens when >1: 1..2 = lid opening)
    vent     0..1  vent pipe grows out of the ground
    lamp     0..1  interior lamp,  bed 0..1 (bed + shelf pop in)
    hero     {x,y,z,rotY,walk,show}  the man (suit man) — y absolute, walk 0 idle / 1 walking
    props    0..1 scenery pop-in,  bloom
*/

const ENVS: Record<string, { top: string; sky: [string, string]; soil: [string, string, string]; prop: 'trees' | 'palms' | 'cacti' | 'pines'; sun: string; leaf: string }> = {
  field: { top: '#5fa140', sky: ['#4e8fd8', '#cfe6f7'], soil: ['#6b4a32', '#8a6445', '#5b5047'], prop: 'trees', sun: '#fff1d6', leaf: '#3f8a34' },
  beach: { top: '#e8d49a', sky: ['#3d9be0', '#d8f0fa'], soil: ['#cdb27a', '#b99a62', '#8a7a5c'], prop: 'palms', sun: '#fff4d8', leaf: '#2f9a4a' },
  desert: { top: '#e2b66b', sky: ['#5aa7e6', '#f6e3bd'], soil: ['#c98f4d', '#a9703a', '#7d5a3a'], prop: 'cacti', sun: '#ffe9c0', leaf: '#4a8a3c' },
  snow: { top: '#f1f6fa', sky: ['#7fa8d6', '#e8f1f9'], soil: ['#7a6a5a', '#5f544c', '#4c4c52'], prop: 'pines', sun: '#eaf2ff', leaf: '#2e6a4a' },
  forest: { top: '#3f7f34', sky: ['#5f9fc8', '#c9e2e4'], soil: ['#5a3f2b', '#7a5a3e', '#4d463f'], prop: 'trees', sun: '#f3ffd9', leaf: '#2f6e2c' },
};

const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

const strata = (top: string, soil: [string, string, string]) =>
  canvasTex(512, 256, (g) => {
    // rows: 0..8% grass lip, 8..40% topsoil, 40..75% subsoil, rest rock/clay
    for (let y = 0; y < 256; y++) {
      const f = y / 256;
      g.fillStyle = f < 0.05 ? top : f < 0.4 ? soil[0] : f < 0.75 ? soil[1] : soil[2];
      g.fillRect(0, y, 512, 1);
    }
    for (let i = 0; i < 900; i++) {
      const x = hash(i * 1.7) * 512;
      const y = 14 + hash(i * 3.3) * 240;
      g.fillStyle = `rgba(0,0,0,${0.06 + hash(i) * 0.12})`;
      g.fillRect(x, y, 2 + hash(i * 5) * 6, 1 + hash(i * 7) * 3);
      g.fillStyle = `rgba(255,255,255,${0.04 + hash(i + 9) * 0.07})`;
      g.fillRect(hash(i * 2.2) * 512, 14 + hash(i * 4.1) * 240, 2 + hash(i) * 4, 1 + hash(i) * 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 13, 512, 2);
  });

const topTex = (top: string) =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = top;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = `rgba(${hash(i) > 0.5 ? '255,255,255' : '0,0,0'},${0.04 + hash(i * 3) * 0.07})`;
      g.fillRect(hash(i * 1.3) * 256, hash(i * 2.9) * 256, 1 + hash(i) * 2, 1 + hash(i * 4) * 3);
    }
  });

const pop = (x: number) => {
  const k = clamp01(x);
  const c1 = 1.9;
  return k <= 0 ? 0.0001 : 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};

const Prop: React.FC<{ kind: string; leaf: string; x: number; z: number; s: number; i: number }> = ({ kind, leaf, x, z, s, i }) => {
  const sc = 0.0001 + s * (0.9 + hash(i * 5) * 0.5);
  if (kind === 'cacti')
    return (
      <group position={[x, 0, z]} scale={sc}>
        <mesh position={[0, 0.9, 0]} castShadow><capsuleGeometry args={[0.22, 1.4, 6, 12]} /><meshStandardMaterial color={leaf} roughness={0.8} /></mesh>
        <mesh position={[0.45, 1.1, 0]} castShadow><capsuleGeometry args={[0.13, 0.5, 6, 10]} /><meshStandardMaterial color={leaf} roughness={0.8} /></mesh>
      </group>
    );
  if (kind === 'palms')
    return (
      <group position={[x, 0, z]} scale={sc}>
        <mesh position={[0, 1.2, 0]} rotation={[0, 0, 0.12]} castShadow><cylinderGeometry args={[0.12, 0.2, 2.6, 8]} /><meshStandardMaterial color="#7a5a3a" roughness={0.9} /></mesh>
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <mesh key={k} position={[Math.cos(k * 1.047) * 0.7, 2.55, Math.sin(k * 1.047) * 0.7]} rotation={[Math.sin(k * 1.047) * 0.9, 0, -Math.cos(k * 1.047) * 0.9]} castShadow>
            <coneGeometry args={[0.28, 1.6, 4]} /><meshStandardMaterial color={leaf} roughness={0.7} />
          </mesh>
        ))}
      </group>
    );
  if (kind === 'pines')
    return (
      <group position={[x, 0, z]} scale={sc}>
        <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.12, 0.16, 0.6, 6]} /><meshStandardMaterial color="#5a4030" /></mesh>
        {[0, 1, 2].map((k) => (
          <mesh key={k} position={[0, 0.9 + k * 0.7, 0]} castShadow><coneGeometry args={[0.95 - k * 0.25, 1.1, 8]} /><meshStandardMaterial color={leaf} roughness={0.8} /></mesh>
        ))}
        <mesh position={[0, 2.35, 0]}><coneGeometry args={[0.2, 0.3, 8]} /><meshStandardMaterial color="#f4f8fb" roughness={0.9} /></mesh>
      </group>
    );
  return (
    <group position={[x, 0, z]} scale={sc}>
      <mesh position={[0, 0.7, 0]} castShadow><cylinderGeometry args={[0.16, 0.24, 1.4, 8]} /><meshStandardMaterial color="#6a4a30" roughness={0.9} /></mesh>
      <mesh position={[0, 1.9, 0]} castShadow><icosahedronGeometry args={[1.0, 1]} /><meshStandardMaterial color={leaf} roughness={0.85} flatShading /></mesh>
      <mesh position={[0.5, 1.5, 0.3]} castShadow><icosahedronGeometry args={[0.6, 1]} /><meshStandardMaterial color={leaf} roughness={0.85} flatShading /></mesh>
    </group>
  );
};

type BuildProps = { t: number; cam: CamProps | null; p: Record<string, any> };

export const BuildScene: React.FC<BuildProps> = ({ t, cam, p }) => {
  const { width, height } = useVideoConfig();
  const c = cam ?? { pos: [7, 4.5, 12] as [number, number, number], look: [0, -0.8, 0] as [number, number, number], fov: 38 };
  const env = ENVS[p.env ?? 'field'] ?? ENVS.field;
  const tankS = pop(p.tank ?? 1);
  const cy: number = p.cy ?? 1.7;
  const pit: number = clamp01(p.pit ?? 0);
  const hatch: number = p.hatch ?? 0;
  const vent: number = clamp01(p.vent ?? 0);
  const lamp: number = clamp01(p.lamp ?? 0);
  const bedK = pop(p.bed ?? 0);
  const storm = clamp01(p.storm ?? 0);
  const flash = clamp01(p.flash ?? 0);
  const lidFly = clamp01(p.lidFly ?? 0);
  const water = clamp01(p.water ?? 0);
  const doorK = clamp01(p.door ?? 0);
  const torn = p.tornado ?? { vis: 0, x: 8, z: -14 };
  const skyTop = new THREE.Color(env.sky[0]).lerp(new THREE.Color('#2b323b'), storm * 0.85).lerp(new THREE.Color('#ffffff'), flash * 0.5);
  const skyBot = new THREE.Color(env.sky[1]).lerp(new THREE.Color('#68727d'), storm * 0.85).lerp(new THREE.Color('#ffffff'), flash * 0.6);
  const propK = pop(p.props ?? 1);
  const H = p.hero ?? {};
  const R = 1.7;
  const HW = 1.95;
  const notchBottom = pit > 0 ? -pit * 3.95 : 0; // trench floor (y), 0 = no trench

  const factory = useHeroFactory();
  const hero = useMemo<Hero | null>(() => (factory ? factory('#2c3f66') : null), [factory]);
  if (hero && H.show !== 0) {
    hero.root.position.set(H.x ?? 3.3, (H.y ?? 0) + (H.dy ?? 0), H.z ?? 1.2);
    hero.root.rotation.set(0, H.rotY ?? -0.5, H.tilt ?? 0);
    const act = Math.round(H.act ?? 0);
    if (act === 5) poseHero(hero, t * 0.7, 0, 0, 0.12);
    else if (act > 0) actHero(hero, t, act, clamp01(H.k ?? 1), 1);
    else if ((H.walk ?? 0) > 0.5) poseHero(hero, t * 0.85, 0, 0, 0);
    else standHero(hero, t, 0, 1);
  }

  const uni = useMemo(() => ({ uNB: { value: 0 }, uHW: { value: HW }, uC: { value: new THREE.Vector3(0, 0, R) } }), []);
  uni.uNB.value = notchBottom;
  uni.uC.value.set(0, cy, R * Math.max(0.0001, tankS));

  const patch = (mode: 'front' | 'top') => (shader: any) => {
    shader.uniforms.uNB = uni.uNB;
    shader.uniforms.uHW = uni.uHW;
    shader.uniforms.uC = uni.uC;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const cut =
      mode === 'front'
        ? 'if ((vWP.y > uNB - 0.0 && abs(vWP.x) < uHW && uNB < -0.01) || length(vWP.xy - uC.xy) < uC.z) discard;'
        : 'if (abs(vWP.x) < uHW && uNB < -0.01) discard;';
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float uNB; uniform float uHW; uniform vec3 uC;').replace('void main() {', `void main() {\n${cut}`);
  };

  const strataTex = useMemo(() => strata(env.top, env.soil), [p.env]);
  const grassTex = useMemo(() => topTex(env.top), [p.env]);
  const frontMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: strataTex, roughness: 0.95 });
    m.onBeforeCompile = patch('front');
    m.customProgramCacheKey = () => 'front';
    return m;
  }, [strataTex]);
  const topMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 });
    m.onBeforeCompile = patch('top');
    m.customProgramCacheKey = () => 'top';
    return m;
  }, [grassTex]);

  const trees = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({ x: (i % 2 ? 1 : -1) * (3 + hash(i * 3.1) * 1.5), z: -4.2 + hash(i * 7.7) * 6.2, i })).filter((q) => Math.abs(q.x) > 2.6),
    [],
  );

  const trench = pit > 0.001;
  const wallH = -notchBottom;
  const steel = '#7b8794';
  const hatchOpen = clamp01(hatch - 1);
  const hatchCut = clamp01(hatch);
  const sparkP = hatch > 0 && hatch < 1.05;
  const hatchTop = Math.max(R + 0.4, 0.6 - cy);
  const ventBase = R - 0.2;
  const ventLen = Math.max(0.5, 1.3 - cy - ventBase);

  return (
    <ThreeCanvas width={width} height={height} shadows camera={{ fov: c.fov ?? 38, position: c.pos, near: 0.05, far: 800 }} gl={{ antialias: true }} onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }}>
      <CameraRig {...c} />
      <SkyDome top={skyTop} bottom={skyBot} stars={0} />
      <Env path="hdr/pedestrian_overpass_1k.hdr" intensity={0.55} />
      <hemisphereLight args={[env.sky[1], '#5a4a3a', 0.5 + flash * 2.2]} />
      <directionalLight color={env.sun} intensity={2.4 * (1 - 0.72 * storm) + flash * 3} position={[8, 14, 10]} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-bias={-0.0004} />

      {/* soil block */}
      <mesh position={[0, -2.2, 3]} material={frontMat} receiveShadow><planeGeometry args={[10, 4.4]} /></mesh>
      <mesh position={[0, 0, -1]} rotation={[-Math.PI / 2, 0, 0]} material={topMat} receiveShadow><planeGeometry args={[10, 8]} /></mesh>
      <mesh position={[0, -2.2, -5]} rotation={[0, Math.PI, 0]} receiveShadow><planeGeometry args={[10, 4.4]} /><meshStandardMaterial color={env.soil[1]} roughness={1} side={THREE.DoubleSide} /></mesh>
      <mesh position={[-5, -2.2, -1]} rotation={[0, Math.PI / 2, 0]} receiveShadow><planeGeometry args={[8, 4.4]} /><meshStandardMaterial map={strataTex} roughness={1} /></mesh>
      <mesh position={[5, -2.2, -1]} rotation={[0, -Math.PI / 2, 0]} receiveShadow><planeGeometry args={[8, 4.4]} /><meshStandardMaterial map={strataTex} roughness={1} /></mesh>
      <mesh position={[0, -4.4, -1]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[10, 8]} /><meshStandardMaterial color="#2c241e" /></mesh>

      {/* trench walls + floor */}
      {trench && (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * HW, -wallH / 2, -1]} rotation={[0, s * -Math.PI / 2, 0]} receiveShadow><planeGeometry args={[8, wallH]} /><meshStandardMaterial color={env.soil[0]} roughness={1} /></mesh>
          ))}
          <mesh position={[0, notchBottom + 0.002, -1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[HW * 2, 8]} /><meshStandardMaterial color={env.soil[0]} roughness={1} /></mesh>
        </group>
      )}

      {/* distant terrain behind the diorama */}
      <mesh position={[0, -0.45, -40]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[220, 70]} /><meshStandardMaterial color={new THREE.Color(env.top).multiplyScalar(0.7).lerp(skyBot, 0.35 + storm * 0.2)} roughness={1} /></mesh>
      {(torn.vis ?? 0) > 0.01 && (
        <group position={[torn.x ?? 8, -0.45, torn.z ?? -14]} scale={Math.max(0.001, torn.vis)}>
          {Array.from({ length: 9 }, (_, i) => {
            const r0 = 0.35 + i * 0.5;
            const y = i * 1.05 + 0.5;
            const sway = Math.sin(t * 2 + i * 0.7) * 0.18 * i;
            return (
              <mesh key={i} position={[sway, y, Math.cos(t * 2 + i) * 0.1 * i]} rotation={[0, t * (5 - i * 0.3) + i, 0]}>
                <cylinderGeometry args={[r0 + 0.5, r0, 1.1, 14, 1, true]} />
                <meshStandardMaterial color={i % 2 ? '#5c636b' : '#444b53'} roughness={1} transparent opacity={0.88} side={THREE.DoubleSide} />
              </mesh>
            );
          })}
          {Array.from({ length: 16 }, (_, i) => {
            const a = t * 3.2 + i * 0.9;
            const rr = 1.4 + (i % 5) * 0.55;
            return <mesh key={'d' + i} position={[Math.cos(a) * rr, 0.6 + (i * 0.53) % 7, Math.sin(a) * rr]} scale={0.14 + 0.08 * (i % 3)}><boxGeometry args={[1, 0.6, 1]} /><meshStandardMaterial color="#2c2a28" /></mesh>;
          })}
        </group>
      )}
      {storm > 0.4 &&
        Array.from({ length: 90 }, (_, i) => {
          const ph = (t * 1.7 + hash(i * 1.9)) % 1;
          return <mesh key={'r' + i} position={[-11 + hash(i * 3.3) * 22 + ph * 2.2, 11 - ph * 15, -8 + hash(i * 7.1) * 16]} rotation={[0, 0, 0.18]}><boxGeometry args={[0.025, 0.7, 0.025]} /><meshBasicMaterial color="#cfe3f5" transparent opacity={0.55 * storm} /></mesh>;
        })}

      {/* scenery */}
      {trees.map((q) => <Prop key={q.i} kind={env.prop} leaf={env.leaf} x={q.x} z={q.z} s={propK} i={q.i} />)}

      {/* the tank (axis along z) */}
      <group position={[0, cy, 0]} scale={tankS}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow><cylinderGeometry args={[R, R, 6, 48, 1, true]} /><meshStandardMaterial color={steel} metalness={0.7} roughness={0.42} side={THREE.FrontSide} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[R - 0.07, R - 0.07, 6, 48, 1, true]} /><meshStandardMaterial color="#b9c2cc" metalness={0.2} roughness={0.7} side={THREE.BackSide} /></mesh>
        {[-2.5, -0.8, 0.9, 2.55].map((z) => (
          <mesh key={z} position={[0, 0, z]} castShadow><torusGeometry args={[R + 0.02, 0.06, 8, 48]} /><meshStandardMaterial color="#5f6b78" metalness={0.8} roughness={0.4} /></mesh>
        ))}
        <mesh position={[0, 0, 3.012]}><ringGeometry args={[R - 0.07, R + 0.03, 48]} /><meshStandardMaterial color="#d3dae1" metalness={0.5} roughness={0.35} /></mesh>
        <mesh position={[0, 0, -2.95]}><circleGeometry args={[R - 0.05, 48]} /><meshStandardMaterial color="#8d98a4" metalness={0.3} roughness={0.6} /></mesh>
        {/* interior */}
        <mesh position={[0, -1.0, 0]} receiveShadow><boxGeometry args={[2.9, 0.12, 5.9]} /><meshStandardMaterial color="#6d5a45" roughness={0.9} /></mesh>
        <group scale={bedK}>
          <mesh position={[-0.7, -0.78, -0.5]} castShadow><boxGeometry args={[1.5, 0.3, 2.2]} /><meshStandardMaterial color="#3d5a80" roughness={0.9} /></mesh>
          <mesh position={[-0.7, -0.57, -1.35]} castShadow><boxGeometry args={[0.9, 0.16, 0.45]} /><meshStandardMaterial color="#f1f1ec" roughness={0.9} /></mesh>
          <mesh position={[1.0, -0.55, -2.2]} castShadow><boxGeometry args={[0.9, 0.7, 0.9]} /><meshStandardMaterial color="#b9894f" roughness={0.9} /></mesh>
          <mesh position={[1.1, 0.0, -2.6]}><boxGeometry args={[1.2, 0.08, 0.5]} /><meshStandardMaterial color="#8a6a3f" /></mesh>
        </group>
        <mesh position={[0, R - 0.45, 0]}><sphereGeometry args={[0.1, 12, 12]} /><meshStandardMaterial color="#fff6d0" emissive="#ffd98a" emissiveIntensity={lamp * 4} /></mesh>
        <pointLight position={[0, R - 0.6, 0.8]} color="#ffd9a0" intensity={lamp * 14} distance={8} />

        {/* hatch + pipe on the top */}
        <mesh position={[0, R + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.5 * hatchCut, 32]} /><meshStandardMaterial color="#1a1d21" metalness={0.6} roughness={0.4} /></mesh>
        {hatchCut > 0.99 && (
          <group>
            <mesh position={[0, (R + hatchTop) / 2, 0]}><cylinderGeometry args={[0.55, 0.55, hatchTop - R + 0.04, 24]} /><meshStandardMaterial color="#6a7480" metalness={0.7} roughness={0.4} /></mesh>
            <group position={[-0.55 - lidFly * 6, hatchTop + 0.02 + lidFly * lidFly * 14 - lidFly * 2, -lidFly * 5]} rotation={[lidFly * 9, lidFly * 6, -(hatchOpen * 1.9) * (1 - lidFly) - lidFly * 3]}>
              <mesh position={[0.55, 0.03, 0]} castShadow><cylinderGeometry args={[0.58, 0.58, 0.07, 24]} /><meshStandardMaterial color="#8a95a1" metalness={0.8} roughness={0.35} /></mesh>
            </group>
          </group>
        )}
        {/* sealed airlock door with wheel */}
        {doorK > 0.001 && (
          <group position={[0, hatchTop + 0.08 + (1 - pop(doorK)) * 1.2, 0]} scale={Math.max(0.001, pop(doorK))}>
            <mesh castShadow><cylinderGeometry args={[0.66, 0.66, 0.16, 28]} /><meshStandardMaterial color="#39434d" metalness={0.8} roughness={0.35} /></mesh>
            <mesh position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, doorK * 6]}><torusGeometry args={[0.26, 0.04, 8, 24]} /><meshStandardMaterial color="#c9a227" metalness={0.8} roughness={0.3} /></mesh>
            {[0, 1, 2, 3].map((k) => <mesh key={k} position={[0, 0.16, 0]} rotation={[0, k * 0.785 + doorK * 6, 0]}><boxGeometry args={[0.56, 0.03, 0.03]} /><meshStandardMaterial color="#c9a227" metalness={0.8} roughness={0.3} /></mesh>)}
            <mesh position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.64, 0.035, 8, 40]} /><meshStandardMaterial color="#ff8a2a" emissive="#ff6a00" emissiveIntensity={doorK < 0.98 ? 3.5 : 0.25} /></mesh>
          </group>
        )}
        {/* flood water inside */}
        {water > 0.01 && (() => {
          const h = water * 1.25;
          const half = Math.sqrt(Math.max(0.01, R * R - (-1.0 + h) * (-1.0 + h)));
          return <mesh position={[0, -1.0 + h / 2 + 0.07, 0]}><boxGeometry args={[Math.min(2 * half - 0.12, 3.2), h, 5.8]} /><meshStandardMaterial color="#3f86c9" transparent opacity={0.62} roughness={0.1} /></mesh>;
        })()}
        {/* vent pipe */}
        {vent > 0.001 && (
          <mesh position={[1.0, ventBase + (ventLen * vent) / 2, 0.4]} scale={[1, ventLen * vent, 1]} castShadow><cylinderGeometry args={[0.1, 0.1, 1, 12]} /><meshStandardMaterial color="#c0662f" metalness={0.5} roughness={0.5} /></mesh>
        )}
      </group>

      {/* cutting torch sparks */}
      {sparkP &&
        Array.from({ length: 14 }, (_, i) => {
          const ph = (t * 3 + hash(i * 3)) % 1;
          return (
            <mesh key={i} position={[Math.cos(i * 2.4) * 0.5 * hatchCut + (hash(i) - 0.5) * ph, cy + R + 0.1 + ph * 0.9, Math.sin(i * 2.4) * 0.5 * hatchCut]} scale={0.045 * (1 - ph)}>
              <sphereGeometry args={[1, 6, 6]} /><meshBasicMaterial color="#ffb347" />
            </mesh>
          );
        })}
      {sparkP && <pointLight position={[0, cy + R + 0.6, 0]} color="#ff9a3c" intensity={6 + 4 * Math.sin(t * 40)} distance={5} />}

      {/* air from the vent */}
      {vent > 0.95 &&
        Array.from({ length: 6 }, (_, i) => {
          const ph = (t * 0.7 + i / 6) % 1;
          return (
            <mesh key={i} position={[1.0 + Math.sin(ph * 6 + i) * 0.18, 1.3 + 0.4 + ph * 1.4, 0.4]} scale={0.1 + ph * 0.22}>
              <sphereGeometry args={[1, 10, 10]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.55 * (1 - ph)} depthWrite={false} />
            </mesh>
          );
        })}

      {hero && H.show !== 0 && <primitive object={hero.root} />}
      <Redraw deps={[hero, strataTex, grassTex]} />
      <Post bloom={p.bloom ?? 0.25} bloomThreshold={0.9} />
    </ThreeCanvas>
  );
};
