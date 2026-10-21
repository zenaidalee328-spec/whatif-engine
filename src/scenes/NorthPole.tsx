import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { CamProps, CameraRig } from './common3d';
import { Env, Post, Redraw } from './fx3d';
import { floatHero, poseHero, useHeroFactory } from './hero';

/*
  North Pole, polar summer (sun ~20° high all day). Drifting Arctic sea ice ~2 m thick over 4,261 m of ocean.
  The tunnel mouth: a 7 m steel-rimmed shaft at the origin, going straight down.
  Hero: walks to the rim (heroWalk 0..1 along -z from z=6 to the edge at z=3.6), then steps off: fall seconds `drop` >= 0.
  params: walk (0..1), drop (seconds since stepping off, <0 = not yet), sunElev, bloom
*/
const iceFrag = (base: string) => base;
void iceFrag;

const iceMat = () => {
  const m = new THREE.MeshStandardMaterial({ color: '#f2f6fa', roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;\nfloat hh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }\nfloat vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x), f.y); }')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec2 q = (modelMatrix * vec4(position, 1.0)).xz;
         // pressure ridges + wind-sculpted sastrugi, flat near the shaft
         float ridge = pow(1.0 - abs(sin(q.x * 0.035 + vn(q * 0.02) * 4.0)), 8.0) * 2.2;
         float sas = vn(q * 0.6) * 0.12 + vn(q * 2.5) * 0.04;
         float keep = smoothstep(9.0, 30.0, length(q));
         transformed.z += (ridge * keep + sas) ;`,
      )
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;\nfloat hh2(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.92 + 0.08 * hh2(floor(vW.xz * 8.0));\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.86, 0.95), 0.25 * smoothstep(0.0, 1.0, vW.y));');
  };
  return m;
};

export type NorthPoleProps = { t: number; cam: CamProps | null; walk?: number; drop?: number; sunElev?: number; bloom?: number; showHero?: number };

export const NorthPoleScene: React.FC<NorthPoleProps> = ({ t, cam, walk = 0, drop = -1, sunElev = 18, bloom = 0.35, showHero = 1 }) => {
  const { width, height } = useVideoConfig();
  const factory = useHeroFactory();
  const hero = useMemo(() => (factory ? factory() : null), [factory]);
  const ice = useMemo(() => iceMat(), []);
  const sky = useMemo(() => {
    const s = new Sky();
    s.scale.setScalar(5000);
    const u = s.material.uniforms;
    u.turbidity.value = 1.2;
    u.rayleigh.value = 3.0;
    u.mieCoefficient.value = 0.003;
    u.mieDirectionalG.value = 0.85;
    s.material.fragmentShader = s.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * 0.42, 1.0 );');
    return s;
  }, []);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - sunElev), THREE.MathUtils.degToRad(210));
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff4e4', 2.6);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const sc = l.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -20;
    sc.right = sc.top = 20;
    sc.far = 200;
    l.shadow.bias = -0.0004;
    return l;
  }, []);
  sun.position.copy(sunDir).multiplyScalar(80);

  if (hero) {
    if (drop < 0) {
      const z = 7 - walk * 3.2; // edge of the shaft at z = 3.5
      hero.root.position.set(0.3, 0, z);
      hero.root.rotation.set(0, Math.PI, 0);
      poseHero(hero, walk * 3.2, 0, 0, 0);
    } else {
      // stepped off: drifts forward to the axis while free-falling (g = 9.83 m/s^2)
      const k = Math.min(1, drop / 0.6);
      hero.root.position.set(0.3 * (1 - k), -0.5 * 9.83 * drop * drop, 3.6 - 3.0 * k);
      hero.root.rotation.set(0.15 * k, Math.PI, 0);
      floatHero(hero, t, Math.min(1, drop * 2));
    }
  }
  const c: CamProps = cam ?? { pos: [6, 3, 12], look: [0, 0.5, 2], fov: 45 };

  return (
    <ThreeCanvas width={width} height={height} shadows camera={{ fov: c.fov ?? 45, position: [6, 3, 12], near: 0.05, far: 8000 }} gl={{ antialias: true }} onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }}>
      <CameraRig {...c} />
      <Env path="hdr/quarry_01_1k.hdr" intensity={0.4} />
      <primitive object={sky} />
      <fog attach="fog" args={['#c4d3e3', 600, 6000]} />
      <hemisphereLight args={['#cfe2ff', '#e8eef5', 0.6]} />
      <primitive object={sun} />
      {/* sea ice with a round hole */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={ice}>
        <ringGeometry args={[3.5, 3000, 220, 260]} />
      </mesh>
      {/* steel rim + shaft lining + lights going down */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]} castShadow>
        <torusGeometry args={[3.6, 0.16, 16, 96]} />
        <meshStandardMaterial color="#c9ced6" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0, -60, 0]}>
        <cylinderGeometry args={[3.5, 3.5, 120, 64, 1, true]} />
        <meshStandardMaterial color="#1c232a" side={THREE.BackSide} roughness={0.6} metalness={0.2} />
      </mesh>
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} position={[0, -4 - i * 10, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[3.45, 0.05, 6, 64]} />
          <meshBasicMaterial color={new THREE.Color(1.6, 1.6, 1.5)} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, -121, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.5, 48]} />
        <meshBasicMaterial color="#000" />
      </mesh>
      {hero && showHero > 0.5 && <primitive object={hero.root} />}
      <Redraw deps={[hero]} />
      <Post bloom={bloom} bloomThreshold={0.88} />
    </ThreeCanvas>
  );
};
