import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';

export type CamProps = { pos: [number, number, number]; look: [number, number, number]; fov?: number; roll?: number };
export const CameraRig: React.FC<CamProps> = ({ pos, look, fov, roll = 0 }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.position.set(pos[0], pos[1], pos[2]);
  camera.lookAt(look[0], look[1], look[2]);
  if (roll) camera.rotateZ(roll);
  if (fov && camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  return null;
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
export const mixHex = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), clamp01(t));
export const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// sky colours for a given clock hour (0..24)
export const skyAt = (hour: number) => {
  const h = ((hour % 24) + 24) % 24;
  // keyframes: [hour, top, bottom]
  const K: [number, string, string][] = [
    [0, '#060a1c', '#101a3a'],
    [4.5, '#070b1e', '#141c3e'],
    [5.6, '#27306a', '#ff9a62'],
    [6.6, '#5d8fd6', '#ffd2a0'],
    [8, '#4f93e6', '#cfe6ff'],
    [16.5, '#4f93e6', '#cfe6ff'],
    [18.6, '#3a3f80', '#ff8a52'],
    [19.6, '#121638', '#3a2c5a'],
    [21, '#060a1c', '#101a3a'],
    [24, '#060a1c', '#101a3a'],
  ];
  for (let i = 1; i < K.length; i++) {
    if (h <= K[i][0]) {
      const u = (h - K[i - 1][0]) / (K[i][0] - K[i - 1][0]);
      return {
        top: mixHex(K[i - 1][1], K[i][1], u),
        bottom: mixHex(K[i - 1][2], K[i][2], u),
        day: smooth(5.4, 7.2, h) * (1 - smooth(18.2, 19.8, h)),
      };
    }
  }
  return { top: new THREE.Color(K[0][1]), bottom: new THREE.Color(K[0][2]), day: 0 };
};

const skyVert = /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const skyFrag = /* glsl */ `
  varying vec3 vDir; uniform vec3 uTop; uniform vec3 uBottom; uniform float uStars;
  float hsh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
  void main(){
    float h = clamp(vDir.y*1.6, 0.0, 1.0);
    vec3 col = mix(uBottom, uTop, pow(h, 0.65));
    vec3 q = floor(vDir*380.0);
    col += vec3(step(0.9972, hsh(q))) * uStars * smoothstep(0.05, 0.3, vDir.y);
    gl_FragColor = vec4(col, 1.0);
  }`;

export const SkyDome: React.FC<{ top: THREE.Color; bottom: THREE.Color; stars: number; radius?: number }> = ({
  top,
  bottom,
  stars,
  radius = 200,
}) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uStars: { value: 0 } },
      }),
    [],
  );
  mat.uniforms.uTop.value.copy(top);
  mat.uniforms.uBottom.value.copy(bottom);
  mat.uniforms.uStars.value = stars;
  return (
    <mesh material={mat}>
      <sphereGeometry args={[radius, 32, 24]} />
    </mesh>
  );
};

// ---------- original low-poly character ----------
export type Pose = 'stand' | 'sit' | 'lie';
export type PersonProps = {
  pos?: [number, number, number];
  rotY?: number;
  pose?: Pose;
  shirt?: string;
  pants?: string;
  skin?: string;
  hair?: string;
  armR?: number; // right shoulder pitch (radians, + = forward/up)
  armL?: number;
  elbowR?: number;
  headTilt?: number;
  headTurn?: number;
  breathe?: number; // 0..1 phase amount
  dark?: boolean; // silhouette (shadow figure)
  opacity?: number;
  stretch?: number;
  eyesClosed?: boolean;
  thin?: number; // 1 = normal, <1 thinner
  walk?: number; // walk-cycle phase in radians (stand pose only)
  legSpread?: number; // legs forced apart (radians): right leg forward, left back (slipping, splits)
  legsOnly?: boolean; // draw only the legs (POV: your own legs below the camera)
  shoes?: string;
  clutch?: number; // 0..1 both hands pressed to the head (ears popping, dizziness, panic)
};

const Limb: React.FC<{ len: number; r: number; color: string; mat?: THREE.Material }> = ({ len, r, color, mat }) => (
  <mesh position={[0, -len / 2, 0]} castShadow material={mat}>
    <capsuleGeometry args={[r, len - 2 * r, 4, 8]} />
    {!mat && <meshStandardMaterial color={color} flatShading roughness={0.85} />}
  </mesh>
);

export const Person: React.FC<PersonProps> = ({
  pos = [0, 0, 0],
  rotY = 0,
  pose = 'stand',
  shirt = '#3c6fd8',
  pants = '#2b3242',
  skin = '#d9a27a',
  hair = '#2a1d16',
  armR = 0,
  armL = 0,
  elbowR = 0,
  headTilt = 0,
  headTurn = 0,
  breathe = 0,
  dark = false,
  opacity = 1,
  stretch = 1,
  eyesClosed = false,
  thin = 1,
  walk,
  legSpread,
  legsOnly = false,
  shoes = '#1c1c22',
  clutch = 0,
}) => {
  const darkMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#030305', transparent: true, opacity: 1, depthWrite: false }),
    [],
  );
  darkMat.opacity = opacity;
  const m = dark ? darkMat : undefined;
  const chest = (1 + breathe * 0.04) * thin;
  // pose transforms
  const hipY = pose === 'sit' ? 0.5 : 0.88;
  const thighRot = pose === 'sit' ? -Math.PI / 2 : 0;
  const shinRot = pose === 'sit' ? Math.PI / 2 : 0;
  const body = (
    <group>
      {/* legs */}
      {[-0.1, 0.1].map((x) => (
        <group key={x} position={[x, hipY, 0]} rotation={[thighRot + (legSpread !== undefined ? (x > 0 ? -1 : 1) * legSpread : walk !== undefined ? Math.sin(walk + (x > 0 ? 0 : Math.PI)) * 0.45 : 0), 0, (legSpread ?? 0) * (x > 0 ? -0.15 : 0.15)]}>
          <Limb len={0.46} r={0.075} color={pants} mat={m} />
          <group position={[0, -0.44, 0]} rotation={[shinRot, 0, 0]}>
            <Limb len={0.46} r={0.065} color={pants} mat={m} />
            <mesh position={[0, -0.46, 0.06]} castShadow material={m}>
              <boxGeometry args={[0.12, 0.07, 0.22]} />
              {!m && <meshStandardMaterial color={shoes} flatShading />}
            </mesh>
          </group>
        </group>
      ))}
      {/* torso */}
      {!legsOnly && (
      <group position={[0, hipY, 0]} scale={[chest, stretch, chest]}>
        <mesh position={[0, 0.3, 0]} castShadow material={m}>
          <capsuleGeometry args={[0.2, 0.36, 4, 10]} />
          {!m && <meshStandardMaterial color={shirt} flatShading roughness={0.9} />}
        </mesh>
        {/* arms */}
        <group position={[0.27, 0.5, 0]} rotation={[(-armR + (walk !== undefined ? Math.sin(walk + Math.PI) * 0.4 : 0)) * (1 - clutch) - 0.35 * clutch, 0, -0.08 + 2.33 * clutch]}>
          <Limb len={0.32} r={0.055} color={shirt} mat={m} />
          <group position={[0, -0.3, 0]} rotation={[-elbowR * (1 - clutch), 0, 1.95 * clutch]}>
            <Limb len={0.3} r={0.048} color={skin} mat={m} />
          </group>
        </group>
        <group position={[-0.27, 0.5, 0]} rotation={[(-armL + (walk !== undefined ? Math.sin(walk) * 0.4 : 0)) * (1 - clutch) - 0.35 * clutch, 0, 0.08 - 2.33 * clutch]}>
          <Limb len={0.32} r={0.055} color={shirt} mat={m} />
          <group position={[0, -0.3, 0]} rotation={[0, 0, -1.95 * clutch]}>
            <Limb len={0.3} r={0.048} color={skin} mat={m} />
          </group>
        </group>
        {/* head */}
        <group position={[0, 0.78, 0]} rotation={[headTilt + 0.25 * clutch, headTurn, 0]}>
          <mesh castShadow material={m}>
            <sphereGeometry args={[0.15, 14, 12]} />
            {!m && <meshStandardMaterial color={skin} flatShading roughness={0.8} />}
          </mesh>
          {!dark && (
            <mesh position={[0, 0.045, -0.02]} scale={[1.05, 0.8, 1.08]}>
              <sphereGeometry args={[0.15, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={hair} flatShading roughness={1} />
            </mesh>
          )}
          {!dark && (
            <>
              {[0.055, -0.055].map((ex) => (
                <mesh key={ex} position={[ex, 0.0, 0.138]} scale={eyesClosed ? [1.4, 0.25, 0.6] : [1, 1, 1]}>
                  <sphereGeometry args={[0.02, 6, 6]} />
                  <meshBasicMaterial color="#141414" />
                </mesh>
              ))}
            </>
          )}
        </group>
      </group>
      )}
    </group>
  );
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      {pose === 'lie' ? (
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0.95]}>
          {body}
        </group>
      ) : (
        body
      )}
    </group>
  );
};
