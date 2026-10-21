import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, SkyDome } from './common3d';
import { Post, Redraw, useTex } from './fx3d';
import { fallAt } from '../engine/fall';

/*
  Earth cut in half along the polar axis (north up). Radius 10 units = 6,371 km.
  Cut face shows the PREM layers at TRUE scale:
    inner core 1,221.5 km | outer core 3,480 km | 660 km | 410 km | crust (a hairline: ~0.2% of the radius)
  The tunnel is the vertical axis; a glowing dot marks the faller (from engine/fall.ts).
  params: s (story seconds), labels 0..1, spin (deg), cut 0..1 (how open), trail 0..1, mark (layer index to highlight, -1 none)
*/
const R = 10;
const fr = (km: number) => (km / 6371) * R;

const faceFrag = `
uniform float uTime; uniform float uHi;
varying vec2 vP;
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
void main(){
  float r = length(vP) / ${R.toFixed(1)};       // 0..1 of Earth radius
  if (r > 1.0) discard;
  float ang = atan(vP.y, vP.x);
  float n = fbm(vP * 1.3 + vec2(0.0, uTime * 0.05));
  vec3 c; float id;
  if (r < ${(1221.5 / 6371).toFixed(5)}) { c = mix(vec3(0.95, 0.85, 0.6), vec3(1.0, 0.92, 0.72), n) * 0.85; id = 6.0; }
  else if (r < ${(3480 / 6371).toFixed(5)}) {
    float swirl = fbm(vec2(ang * 3.0 + uTime * 0.15, r * 9.0 - uTime * 0.1));
    c = mix(vec3(1.0, 0.55, 0.08), vec3(1.0, 0.8, 0.3), swirl); id = 5.0;
  }
  else if (r < ${(5711 / 6371).toFixed(5)}) {
    float plume = fbm(vec2(ang * 5.0, r * 6.0 - uTime * 0.03));
    c = mix(vec3(0.72, 0.22, 0.05), vec3(0.9, 0.38, 0.08), plume) * mix(1.15, 0.8, (r - 0.546) / 0.35); id = 4.0;
  }
  else if (r < ${(5961 / 6371).toFixed(5)}) { c = mix(vec3(0.55, 0.15, 0.06), vec3(0.62, 0.2, 0.1), n); id = 3.0; }
  else if (r < ${((6371 - 11) / 6371).toFixed(5)}) { c = mix(vec3(0.42, 0.13, 0.06), vec3(0.5, 0.18, 0.08), n); id = 2.0; }
  else { c = vec3(0.35, 0.3, 0.26); id = 1.0; }
  // thin boundary lines
  float e = 0.0025;
  for (int k = 0; k < 4; k++) {
    float b = k == 0 ? ${(1221.5 / 6371).toFixed(5)} : k == 1 ? ${(3480 / 6371).toFixed(5)} : k == 2 ? ${(5711 / 6371).toFixed(5)} : ${(5961 / 6371).toFixed(5)};
    c *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, e, abs(r - b)));
  }
  if (uHi > 0.5) c *= abs(id - uHi) < 0.5 ? 1.25 : 0.45;
  gl_FragColor = vec4(c, 1.0);
}`;

const atmoVert = `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const atmoFrag = `varying vec3 vN; varying vec3 vV; void main(){ float d = abs(dot(normalize(vN), normalize(vV))); float f = pow(1.0 - d, 3.0); gl_FragColor = vec4(0.35,0.62,1.0, f*0.8); }`;

const LABELS: [string, string, number][] = [
  ['INNER CORE', 'solid iron · 5,200 °C', 600],
  ['OUTER CORE', 'liquid iron', 2350],
  ['LOWER MANTLE', 'hot solid rock', 4600],
  ['TRANSITION ZONE', '410 – 660 km deep', 5836],
  ['CRUST', 'thinner than an apple skin, to scale', 6365],
];
const labelTex = (a: string, b: string) => {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 200;
  const g = c.getContext('2d')!;
  g.font = '600 70px Inter, DejaVu Sans, sans-serif';
  g.fillStyle = 'white';
  g.shadowColor = 'rgba(0,0,0,0.8)';
  g.shadowBlur = 12;
  g.fillText(a, 10, 80);
  g.font = 'italic 46px Georgia, DejaVu Serif, serif';
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillText(b, 10, 150);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

export type EarthCutProps = { t: number; cam: CamProps | null; s?: number; labels?: number; spin?: number; trail?: number; mark?: number; dot?: number };

export const EarthCutScene: React.FC<EarthCutProps> = ({ t, cam, s = 0, labels = 0, spin = 0, trail = 1, mark = -1, dot = 1 }) => {
  const { width, height } = useVideoConfig();
  const day = useTex('tex/earth_day_4096.jpg');
  const clouds = useTex('tex/earth_clouds_2048.png');
  const glow = useTex('tex/smoke1.png');
  const clip = useMemo(() => [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)], []);
  const face = useMemo(() => new THREE.ShaderMaterial({ vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`, fragmentShader: faceFrag, uniforms: { uTime: { value: 0 }, uHi: { value: -1 } }, side: THREE.DoubleSide }), []);
  face.uniforms.uTime.value = t;
  face.uniforms.uHi.value = mark;
  const atmo = useMemo(() => new THREE.ShaderMaterial({ vertexShader: atmoVert, fragmentShader: atmoFrag, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)] }), []);
  const labelTexs = useMemo(() => LABELS.map(([a, b]) => labelTex(a, b)), []);

  const st = fallAt(s);
  const y = R - (st.dist / 12742) * 2 * R;
  const yStart = R;
  const c: CamProps = cam ?? { pos: [0, 0, 34], look: [0, 0, 0], fov: 40 };

  return (
    <ThreeCanvas width={width} height={height} camera={{ fov: c.fov ?? 40, position: [0, 0, 34], near: 0.05, far: 3000 }} gl={{ antialias: true, localClippingEnabled: true }} onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.localClippingEnabled = true;
    }}>
      <CameraRig {...c} />
      <SkyDome top={new THREE.Color('#010208')} bottom={new THREE.Color('#02030a')} stars={1.4} radius={900} />
      <ambientLight intensity={0.12} />
      <directionalLight position={[30, 15, 40]} intensity={2.4} color="#fff6ea" />
      <group rotation={[0, (spin * Math.PI) / 180, 0]}>
        <mesh>
          <sphereGeometry args={[R, 128, 64]} />
          <meshStandardMaterial map={day} roughness={0.85} clippingPlanes={clip} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[0, t * 0.01, 0]}>
          <sphereGeometry args={[R * 1.01, 96, 48]} />
          <meshStandardMaterial map={clouds} transparent opacity={0.5} depthWrite={false} clippingPlanes={clip} />
        </mesh>
      </group>
      <mesh material={atmo}>
        <sphereGeometry args={[R * 1.025, 96, 48]} />
      </mesh>
      {/* cut face with the layers (true scale) */}
      <mesh material={face} position={[0, 0, 0.001]}>
        <circleGeometry args={[R, 256]} />
      </mesh>
      {/* the tunnel: pole to pole */}
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[0.05, 2 * R]} />
        <meshBasicMaterial color={new THREE.Color(1.6, 1.8, 2.0)} toneMapped={false} transparent opacity={0.55} />
      </mesh>
      {trail > 0 && (
        <mesh position={[0, (yStart + y) / 2, 0.03]}>
          <planeGeometry args={[0.12, Math.max(0.001, yStart - y)]} />
          <meshBasicMaterial color={new THREE.Color(0.6, 1.6, 2.4)} toneMapped={false} transparent opacity={0.8 * trail} />
        </mesh>
      )}
      {dot > 0 && (
        <>
          <mesh position={[0, y, 0.05]}>
            <circleGeometry args={[0.14, 24]} />
            <meshBasicMaterial color={new THREE.Color(2.5, 3, 3.5)} toneMapped={false} />
          </mesh>
          <sprite position={[0, y, 0.06]} scale={[1.6, 1.6, 1]}>
            <spriteMaterial map={glow} color={new THREE.Color(0.5, 1.2, 2.0)} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
          </sprite>
        </>
      )}
      {labels > 0 &&
        LABELS.map(([, , km], i) => {
          const rr = fr(km);
          const ang = 0.55 - i * 0.28; // fan the labels out on the right
          const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
          const lx = R * 1.18, ly = 6 - i * 3;
          return (
            <group key={i}>
              <mesh position={[(px + lx) / 2, (py + ly) / 2, 0.05]} rotation={[0, 0, Math.atan2(ly - py, lx - px)]}>
                <planeGeometry args={[Math.hypot(lx - px, ly - py), 0.03]} />
                <meshBasicMaterial color="white" transparent opacity={0.7 * labels} />
              </mesh>
              <mesh position={[px, py, 0.06]}>
                <circleGeometry args={[0.1, 16]} />
                <meshBasicMaterial color="white" transparent opacity={labels} />
              </mesh>
              <mesh position={[lx + 4.2, ly, 0.05]}>
                <planeGeometry args={[8, 1.56]} />
                <meshBasicMaterial map={labelTexs[i]} transparent opacity={labels} depthWrite={false} />
              </mesh>
            </group>
          );
        })}
      <Redraw deps={[day, clouds]} />
      <Post bloom={0.5} bloomThreshold={0.85} />
    </ThreeCanvas>
  );
};
