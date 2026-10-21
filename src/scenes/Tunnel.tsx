import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, hash } from './common3d';
import { Post, Redraw, useTex } from './fx3d';
import { useThree } from '@react-three/fiber';
import { floatHero, heatHero, useHeroFactory } from './hero';
import { Puffs } from './runner';
import { fallAt, tempAt } from '../engine/fall';

/*
  Inside the pole-to-pole tunnel. The hero floats at the origin (free fall = weightless), the tunnel walls stream upward.
  Tunnel radius 3.5 m, axis = y. A wall fragment at height y is at depth  uDepth + (-y)/1000 km.
  Walls show what is really around you at that depth (North Pole start):
    0 - 4.26 km    Arctic Ocean behind a glass tube: sunlit teal -> twilight -> black with bioluminescence
    4.26 - 4.8 km  seabed sediments (layered silt)
    4.8 - 11 km    oceanic crust: pillow basalt -> sheeted dykes -> gabbro
    11 - 410 km    upper mantle peridotite (olive-green olivine)
    410 - 660 km   transition zone (wadsleyite / ringwoodite: blue-violet crystals)
    660 - 2,891 km lower mantle (bridgmanite + ferropericlase, brown) ; D'' last 200 km
    2,891 - 5,150  outer core: LIQUID iron-nickel flowing behind the wall
    5,150 - 6,371  inner core: solid iron crystals
  Every wall above ~525 °C (Draper point) glows with its blackbody colour (temperature from engine/fall.ts).
  params: s (story seconds since the jump; keyframes), view below|above|side|close, lights, sky
*/

const wallVert = `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const wallFrag = `
uniform float uDepth;     // km at y = 0 (the hero)
uniform float uBlur;      // motion stretch (metres of wall per frame)
uniform float uTime;
uniform float uLegDir;    // +1 going down (walls move up), -1 coming up
uniform float uSouth;     // 1 = far side (South Pole: 2,835 m ice sheet, continental crust)
uniform float uHaze;      // air in the tunnel (problem #1 chapter)
uniform float uFlip;      // +1 northern half (surface is +y), -1 southern half (surface is -y; you keep falling feet-first)
varying vec3 vW; varying vec3 vN;
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.07; a*=0.5; } return s; }
// temperature (C) vs depth (km) — same anchors as engine/fall.ts
float tempAt(float d){
  if (uSouth > 0.5 && d < 100.0) {
    if (d < -0.135) return mix(-49.0, -12.0, (d + 2.835) / 2.7);
    if (d < 38.0) return mix(-12.0, 600.0, (d + 0.135) / 38.135);
    return mix(600.0, 1300.0, (d - 38.0) / 62.0);
  }
  if (d < 4.26) return mix(-1.5, 0.0, d/4.26);
  if (d < 6.0) return mix(0.0, 60.0, (d-4.26)/1.74);
  if (d < 11.0) return mix(60.0, 250.0, (d-6.0)/5.0);
  if (d < 30.0) return mix(250.0, 600.0, (d-11.0)/19.0);
  if (d < 100.0) return mix(600.0, 1300.0, (d-30.0)/70.0);
  if (d < 410.0) return mix(1300.0, 1532.0, (d-100.0)/310.0);
  if (d < 660.0) return mix(1532.0, 1680.0, (d-410.0)/250.0);
  if (d < 2800.0) return mix(1680.0, 2257.0, (d-660.0)/2140.0);
  if (d < 2891.0) return mix(2257.0, 3700.0, (d-2800.0)/91.0);
  if (d < 5150.0) return mix(3700.0, 5230.0, (d-2891.0)/2259.0);
  return mix(5230.0, 5300.0, (d-5150.0)/1221.0);
}
// blackbody colour (normalised) for temperature in K  (fit to CIE 1931 -> sRGB)
vec3 bb(float K){
  float t = K / 100.0; vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp(1.292936 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
  c.g = t <= 66.0 ? clamp(0.3900816 * log(t) - 0.6318414, 0.0, 1.0) : clamp(1.129890 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432068 * log(t - 10.0) - 1.1962541, 0.0, 1.0));
  return c;
}
void main(){
  float y = vW.y;
  float depth = uDepth - uFlip * y / 1000.0;       // km
  if (depth < (uSouth > 0.5 ? -2.835 : 0.0)) discard;   // above the surface: open sky
  float ang = atan(vW.z, vW.x);
  float u = ang * 3.5;                              // metres around the wall
  float Y = depth * 1000.0;                         // metres, fixed to the rock
  // motion blur = streaks: stretch the rock pattern along the direction of travel
  float stretch = 1.0 + uBlur * 0.6;
  vec2 P = vec2(u * 0.6, Y * 0.6 / stretch);
  float n = fbm(P);
  float nf = vn(vec2(u * 3.0, Y * 3.0 / stretch));
  float dn = fbm(P + vec2(0.04, 0.0)) - n;              // fake relief for lighting
  float relief = clamp(0.8 + 6.0 * dn / stretch, 0.4, 1.4);
  vec3 col; float rough = 1.0;
  if (uSouth > 0.5 && depth < -0.135) {
    // Antarctic ice sheet: blue glacial ice with dark annual layers and bubbles
    float layer = 0.5 + 0.5 * sin(Y * 0.9 + vn(vec2(u * 0.2, Y * 0.05)) * 6.0);
    col = mix(vec3(0.42, 0.62, 0.78), vec3(0.62, 0.8, 0.92), layer) * (0.75 + 0.35 * n);
    col += vec3(0.9) * step(0.993, hh(floor(vec2(u * 6.0, Y * 6.0 / stretch))));
  } else if (uSouth > 0.5 && depth < 38.0) {
    // continental crust: granite & gneiss (pink feldspar, grey quartz, black mica), banded
    float band = vn(vec2(u * 0.15, Y * 0.35 / stretch));
    col = mix(vec3(0.5, 0.4, 0.38), vec3(0.62, 0.5, 0.46), step(0.5, nf));
    col = mix(col, vec3(0.12, 0.11, 0.1), step(0.82, vn(vec2(u * 6.0, Y * 6.0 / stretch)))) * (0.75 + 0.35 * band);
  } else if (depth < 4.26) {
    // ocean behind glass: light dies with depth (euphotic ~200 m, aphotic below 1,000 m)
    float sun = exp(-depth * 1000.0 / 70.0);
    col = mix(vec3(0.0, 0.01, 0.025), vec3(0.05, 0.35, 0.42), sun);
    col += vec3(0.4, 0.8, 1.0) * sun * 0.6 * pow(vn(vec2(u * 0.8 + uTime * 0.3, Y * 0.05)), 6.0);   // caustic shafts
    float bio = step(0.995, hh(floor(vec2(u * 2.0, Y * 0.5)))) * smoothstep(0.3, 1.0, depth);   // bioluminescence
    col += vec3(0.2, 0.7, 1.0) * bio * (0.5 + 0.5 * sin(uTime * 6.0 + Y));
    col *= 0.6 + 0.4 * n;
  } else if (depth < 4.8) {
    float band = vn(vec2(0.0, Y * 0.8)) * 0.5 + vn(vec2(u * 0.1, Y * 4.0)) * 0.3;
    col = mix(vec3(0.32, 0.27, 0.2), vec3(0.48, 0.42, 0.33), band) * (0.75 + 0.3 * n);
  } else if (depth < 11.0) {
    float k = smoothstep(4.8, 6.5, depth);               // pillow basalt -> dykes/gabbro
    vec3 basalt = vec3(0.09, 0.09, 0.1) * (0.7 + 0.6 * n);
    vec3 gabbro = mix(vec3(0.16, 0.17, 0.15), vec3(0.35, 0.35, 0.32), step(0.55, nf)) * (0.8 + 0.3 * n);
    col = mix(basalt, gabbro, k);
  } else if (depth < 410.0) {
    // peridotite: olive green olivine with dark pyroxene
    col = mix(vec3(0.16, 0.2, 0.08), vec3(0.32, 0.4, 0.14), smoothstep(0.35, 0.75, nf)) * (0.7 + 0.5 * n);
  } else if (depth < 660.0) {
    // transition zone: ringwoodite is blue-violet
    col = mix(vec3(0.12, 0.12, 0.3), vec3(0.3, 0.25, 0.6), smoothstep(0.4, 0.8, nf)) * (0.7 + 0.5 * n);
  } else if (depth < 2891.0) {
    col = mix(vec3(0.22, 0.16, 0.1), vec3(0.36, 0.26, 0.16), smoothstep(0.3, 0.8, nf)) * (0.7 + 0.5 * n);
  } else if (depth < 5150.0) {
    // liquid iron flowing (convection): moving noise
    float flow = fbm(vec2(u * 0.3 + uTime * 0.4, Y * 0.3 / stretch - uTime * 0.6));
    n = flow;
    rough = 0.25;
  } else {
    // solid iron crystals: faceted
    vec2 cell = floor(vec2(u, Y) * 1.3);
    col = vec3(0.6) * (0.75 + 0.35 * hh(cell));
  }
  // tunnel lights: a bright ring every 50 m (only matters where the rock is cool)
  float ring = smoothstep(0.992 - min(0.3, uBlur * 0.002), 1.0, cos(Y / 50.0 * 6.2831853));
  ring *= 1.0 / (1.0 + uBlur * 0.02);
  vec3 lit = col * relief;
  bool water = uSouth < 0.5 && depth < 4.26;
  vec3 outc = lit * (water ? 0.75 : uSouth > 0.5 && depth < -0.135 ? 0.6 : uSouth > 0.5 && depth < 38.0 ? 0.8 : 2.6) + vec3(1.0, 0.95, 0.85) * ring * 1.4;
  // incandescence (Draper point 525 C): blackbody colour, brightness rising steeply with T
  float T = tempAt(depth);
  float glow = smoothstep(480.0, 700.0, T) * 0.6 + smoothstep(800.0, 2300.0, T) * 0.25 + smoothstep(2300.0, 5300.0, T) * 0.35;
  vec3 hot = bb(T + 273.15);
  float tex = depth >= 2891.0 ? (0.25 + 1.5 * pow(n, 1.6)) : (0.4 + 1.0 * n) * relief;
  vec3 hc = mix(hot, hot * vec3(1.0, 0.6, 0.28), smoothstep(2300.0, 5300.0, T));  // keep the core warm yellow, not grey
  outc = mix(outc, hc * glow * tex * 1.3, clamp(glow, 0.0, 1.0));
  // thick air: everything fades into a murky haze with distance
  outc = mix(outc, vec3(0.55, 0.52, 0.48) * 0.5, uHaze * (1.0 - exp(-abs(y) / mix(400.0, 12.0, uHaze))));
  gl_FragColor = vec4(outc, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const Exposure: React.FC<{ value: number }> = ({ value }) => {
  const gl = useThree((st) => st.gl);
  gl.toneMappingExposure = value;
  return null;
};

export type TunnelProps = { t: number; cam: CamProps | null; s: number; view?: string; bloom?: number; exposure?: number; heroScale?: number; depthKm?: number; speedKmh?: number; haze?: number; panic?: number };

export const TunnelScene: React.FC<TunnelProps> = ({ t, cam, s, view = 'below', bloom = 0.6, exposure = 1, depthKm, speedKmh, haze = 0, panic }) => {
  const { width, height } = useVideoConfig();
  const factory = useHeroFactory();
  const hero = useMemo(() => (factory ? factory() : null), [factory]);
  const smoke = useTex('tex/smoke1.png');
  const st0 = fallAt(s);
  const st = { ...st0, depth: depthKm ?? st0.depth, v: speedKmh ?? st0.v };
  const south = st.leg === 1;
  const st2 = fallAt(s + 1 / 30);
  // direction of motion along the axis: dist grows -> moving toward the South Pole -> hero moves -y (feet first)
  const goingDown = depthKm !== undefined ? true : st2.dist >= st0.dist;
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: wallVert, fragmentShader: wallFrag, side: THREE.BackSide, uniforms: { uDepth: { value: 0 }, uBlur: { value: 0 }, uTime: { value: 0 }, uLegDir: { value: 1 }, uSouth: { value: 0 }, uHaze: { value: 0 }, uFlip: { value: 1 } } }), []);
  // on the way down depth grows (walls move up); on the way back up the far side mirrors it
  mat.uniforms.uDepth.value = st.depth;
  mat.uniforms.uSouth.value = south ? 1 : 0;
  mat.uniforms.uFlip.value = south ? -1 : 1;
  mat.uniforms.uHaze.value = haze;
  const vms = st.v / 3.6;
  mat.uniforms.uBlur.value = Math.min(400, vms / 30); // metres of rock sweeping past per frame
  mat.uniforms.uTime.value = t;

  if (hero) {
    hero.root.position.set(0, -0.9, 0);
    hero.root.rotation.set(0.05, t * 0.08, 0);
    floatHero(hero, t, panic ?? (st.depth < 0.05 && !south ? 1 : 0));
    heatHero(hero, 0, t);
  }

  const T = south && st.depth < 100 ? Math.max(-49, -12 + (st.depth / 38) * 612) : tempAt(st.depth);
  const glowK = Math.min(1, Math.max(0, (T - 525) / 3000));
  // light on the hero: tunnel lights (white) where cool, wall glow colour where hot
  const glowCol = new THREE.Color().setHSL(0.07 + 0.06 * glowK, 1, 0.5 + 0.35 * glowK);
  const sea = !south && st.depth < 4.26;
  const mouth = south ? (st.depth + 2.835) : st.depth; // km below the open sky

  let c: CamProps = cam ?? { pos: [0, -7, 1.2], look: [0, 0, 0], fov: 60 };
  if (!cam) {
    if (view === 'above') c = { pos: [0.4, 4.2, 0.9], look: [0, -30, 0], fov: 62 };
    if (view === 'side') c = { pos: [2.6, -0.4, 1.4], look: [0, -0.5, 0], fov: 55 };
    if (view === 'close') c = { pos: [0.3, -0.2, 1.9], look: [0, 0.3, 0], fov: 40 };
  }

  // streaking dust / embers rising past
  const n = 220;
  const pos = new Float32Array(n * 3), a = new Float32Array(n), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 1.7), h2 = hash(i * 3.1), h3 = hash(i * 5.3);
    const r = 0.8 + h2 * 2.5, th = h1 * 6.283;
    const y = ((h3 * 60 + (goingDown ? 1 : -1) * Math.min(vms, 300) * t * 0.6) % 60 + 60) % 60 - 30;
    pos[i * 3] = Math.cos(th) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(th) * r;
    a[i] = (sea ? 0.25 : 0.5) * (0.4 + 0.6 * h2);
    sz[i] = 0.03 + 0.05 * h1;
  }

  return (
    <ThreeCanvas width={width} height={height} camera={{ fov: c.fov ?? 60, position: [0, -6, 1], near: 0.05, far: 3000 }} gl={{ antialias: true }} onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = exposure;
    }}>
      <CameraRig {...c} />
      <Exposure value={exposure / (1 + 1.0 * glowK)} />
      <color attach="background" args={['#000000']} />
      <mesh material={mat}>
        <cylinderGeometry args={[3.5, 3.5, 2400, 96, 1, true]} />
      </mesh>
      {/* the sky disc at the tunnel mouth */}
      {mouth < 3.2 && (
        <mesh position={[0, (south ? -1 : 1) * (mouth * 1000 - 0.5), 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[3.5, 48]} />
          <meshBasicMaterial color={new THREE.Color(1.0, 1.1, 1.25)} toneMapped={false} />
        </mesh>
      )}
      <ambientLight intensity={sea ? 0.25 : 0.12} color={sea ? '#6fb4c8' : '#ffffff'} />
      <pointLight position={[0, 2.5, 1.5]} intensity={sea ? 14 : 10 * (1 - glowK) + 2} distance={14} color="#fff3e0" />
      <hemisphereLight args={[glowCol, glowCol, 0.2 + 2.6 * glowK]} />
      <pointLight position={[2.2, -1, 0]} intensity={30 * glowK} distance={10} color={glowCol} />
      <pointLight position={[-2.2, -1, 0]} intensity={30 * glowK} distance={10} color={glowCol} />
      {hero && <primitive object={hero.root} />}
      <Puffs data={{ pos, a, s: sz }} color={sea ? '#bfe8ff' : glowK > 0.1 ? '#ffd9a0' : '#cfcfcf'} additive map={smoke} />
      <Redraw deps={[hero, smoke]} />
      <Post bloom={bloom * (1 - 0.75 * glowK)} bloomThreshold={0.85} />
    </ThreeCanvas>
  );
};
