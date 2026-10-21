import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, SkyDome, hash, skyAt } from './common3d';

type Bld = { x: number; z: number; w: number; d: number; h: number; col: string };
type Win = { pos: THREE.Vector3; rotY: number; off: number; warm: number };

const N = 13, SP = 3.2;
const buildCity = () => {
  const blds: Bld[] = [];
  const wins: Win[] = [];
  let k = 0;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      k++;
      const x = (i - (N - 1) / 2) * SP, z = (j - (N - 1) / 2) * SP;
      const dc = Math.hypot(x, z);
      const w = 1.8 + hash(k) * 0.7, d = 1.8 + hash(k + 99) * 0.7;
      let h = 2 + hash(k + 7) * 6 + Math.max(0, 9 - dc * 0.35) * hash(k + 3);
      const mid = (N - 1) / 2;
      if (i === mid && j === mid) h = 14.2; // the hero building
      else if (Math.abs(i - mid) <= 1 && j > mid) h = Math.min(h, 1.2 + hash(k + 11) * 1.5); // low plaza in front
      const shade = 0.35 + hash(k + 5) * 0.3;
      blds.push({ x, z, w, d, h, col: new THREE.Color(shade, shade * 0.97, shade * 1.03).getStyle() });
      const floors = Math.floor((h - 0.4) / 0.5);
      // windows on the +z and +x faces (the camera sides)
      for (let f = 0; f < floors; f++) {
        const y = 0.45 + f * 0.5;
        const nz = Math.floor((w - 0.3) / 0.42);
        for (let c = 0; c < nz; c++) {
          const wx = x - w / 2 + 0.3 + c * 0.42 + 0.06;
          const s = k * 1000 + f * 37 + c;
          wins.push({ pos: new THREE.Vector3(wx, y, z + d / 2 + 0.01), rotY: 0, off: hash(s), warm: hash(s + 0.5) });
        }
        const nx = Math.floor((d - 0.3) / 0.42);
        for (let c = 0; c < nx; c++) {
          const wz = z - d / 2 + 0.3 + c * 0.42 + 0.06;
          const s = k * 1000 + f * 37 + c + 500;
          wins.push({ pos: new THREE.Vector3(x + w / 2 + 0.01, y, wz), rotY: Math.PI / 2, off: hash(s), warm: hash(s + 0.5) });
        }
      }
    }
  return { blds, wins };
};

let cityCache: ReturnType<typeof buildCity> | null = null;
const getCity = () => (cityCache ??= buildCity());

// the hero window: building at the centre, +z face, 4th floor
export const HERO = new THREE.Vector3(0.12, 0.45 + 12 * 0.5, 0);

export const CityScene: React.FC<{
  clock: number; // hour of day
  lightsOff: number; // 0 = typical night lights, 1 = every window dark
  hero: number; // 0..1 brightness of your window
  cam: CamProps;
}> = ({ clock, lightsOff, hero, cam }) => {
  const { width, height } = useVideoConfig();
  const { blds, wins } = getCity();
  const sky = skyAt(clock);
  const night = 1 - sky.day;
  const centre = blds[Math.floor((N * N) / 2)];
  const heroPos = new THREE.Vector3(centre.x + 0.12, HERO.y, centre.z + centre.d / 2 + 0.02);

  const winGeo = useMemo(() => new THREE.PlaneGeometry(0.3, 0.32), []);
  const winMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const inst = useMemo(() => {
    const m = new THREE.InstancedMesh(winGeo, winMat, wins.length);
    const o = new THREE.Object3D();
    wins.forEach((w, i) => {
      o.position.copy(w.pos);
      o.rotation.set(0, w.rotY, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, new THREE.Color());
    });
    m.instanceMatrix.needsUpdate = true;
    return m;
  }, [wins, winGeo, winMat]);

  const dayCol = new THREE.Color('#9fb7d0');
  const darkCol = new THREE.Color('#0d1018');
  const tmp = new THREE.Color();
  wins.forEach((w, i) => {
    // ~55% of windows lit at typical night, they switch off as lightsOff grows
    const litNight = w.off < 0.55 * (1 - lightsOff) ? 1 : 0;
    const warmC = tmp.setRGB(1.0, 0.72 + w.warm * 0.2, 0.38 + w.warm * 0.25);
    const nightC = litNight ? warmC.clone().multiplyScalar(1.15) : darkCol.clone();
    const c = dayCol.clone().multiplyScalar(0.55 + w.warm * 0.35).lerp(nightC, night);
    inst.setColorAt(i, c);
  });
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

  const bldMat = useMemo(() => blds.map((b) => new THREE.MeshStandardMaterial({ color: b.col, roughness: 0.9, flatShading: true })), [blds]);
  bldMat.forEach((m, i) => m.color.set(blds[i].col).multiplyScalar(0.35 + 0.65 * sky.day + 0.25 * night));

  return (
    <ThreeCanvas
      width={width}
      height={height}
      shadows
      camera={{ fov: cam.fov ?? 45, position: [20, 14, 26], near: 0.1, far: 400 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <CameraRig pos={cam.pos} look={cam.look} fov={cam.fov ?? 45} roll={cam.roll} />
      <SkyDome top={sky.top} bottom={sky.bottom} stars={night} />
      <fog attach="fog" args={[sky.bottom.getStyle(), 30, 90]} />
      <hemisphereLight args={[sky.day > 0.5 ? sky.top : new THREE.Color('#5d6fb8'), '#262a33', 0.55 + 0.3 * sky.day]} />
      <directionalLight
        position={[-30, 25, 20]}
        intensity={2.4 * sky.day + 0.7 * night}
        color={sky.day > 0.5 ? '#ffe2b8' : '#7c8cff'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0005}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={sky.day > 0.5 ? '#4a4f57' : '#14161c'} roughness={1} />
      </mesh>
      {blds.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} material={bldMat[i]} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
        </mesh>
      ))}
      <primitive object={inst} />
      {/* your window */}
      {hero > 0 && (
        <group position={heroPos}>
          <mesh position={[0, 0, 0.012]}>
            <planeGeometry args={[0.32, 0.34]} />
            <meshBasicMaterial color={new THREE.Color(1.6, 1.2, 0.7)} toneMapped={false} transparent opacity={hero} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <planeGeometry args={[1.4, 1.4]} />
            <meshBasicMaterial
              color="#ffbb66"
              transparent
              opacity={0.28 * hero}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              alphaMap={glowTex()}
            />
          </mesh>
        </group>
      )}
    </ThreeCanvas>
  );
};

export const heroWindowPos = () => {
  const { blds } = getCity();
  const c = blds[Math.floor((N * N) / 2)];
  return new THREE.Vector3(c.x + 0.12, HERO.y, c.z + c.d / 2 + 0.02);
};

let glow: THREE.CanvasTexture | null = null;
const glowTex = () => {
  if (glow) return glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, '#000000');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  glow = new THREE.CanvasTexture(c);
  return glow;
};
