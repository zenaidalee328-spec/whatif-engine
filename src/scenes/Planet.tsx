import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, SkyDome, hash } from './common3d';
import { fbm } from './noise';
import LAND from '../data/land-110m.json';

/*
  Earth from space (radius R = 10, centre at origin, north pole +y).
  lat/lon -> (cos lat cos lon, sin lat, -cos lat sin lon) * R  (matches three.js sphere UVs).
  params: faults 0..1 (plate boundaries light up and flicker), quake 0..1 (surface jitter), clouds 0..1, spin (deg)
*/
const R = 10;
const ll = (lon: number, lat: number, r = R) => {
  const a = (lat * Math.PI) / 180, o = (lon * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(a) * Math.cos(o) * r, Math.sin(a) * r, -Math.cos(a) * Math.sin(o) * r);
};

// approximate major plate boundaries (lon, lat)
const BOUNDARIES: [number, number][][] = [
  [[165, 52], [175, 51], [-175, 51], [-165, 53], [-155, 57], [-148, 60]],
  [[-148, 60], [-137, 58], [-131, 53], [-127, 49], [-125, 44], [-124, 40], [-122, 37], [-118, 34], [-115, 32], [-110, 26], [-106, 22]],
  [[-106, 20], [-102, 17], [-97, 15], [-92, 14], [-87, 12], [-84, 9]],
  [[-80, 2], [-81, -5], [-77, -12], [-72, -18], [-71, -25], [-72, -33], [-74, -40], [-75, -47], [-76, -53]],
  [[160, 52], [155, 47], [146, 42], [142, 37], [141, 33], [138, 30]],
  [[142, 30], [143, 24], [145, 17], [147, 12]],
  [[127, 8], [126, 2], [120, -8], [112, -10], [104, -8], [97, 0], [94, 6], [93, 13]],
  [[147, -5], [155, -6], [162, -11], [168, -15], [174, -18], [-174, -15]],
  [[-174, -15], [-175, -22], [-178, -30], [178, -37], [176, -40], [172, -44], [167, -47]],
  [[-20, 70], [-30, 60], [-30, 50], [-35, 40], [-42, 30], [-46, 20], [-40, 10], [-25, 0], [-15, -10], [-13, -20], [-12, -30], [-15, -40], [-10, -50]],
  [[-10, 36], [0, 37], [10, 38], [20, 38], [28, 36], [35, 37], [45, 37], [52, 32], [60, 30], [70, 32], [75, 34], [82, 30], [90, 28], [97, 27], [95, 20], [94, 13]],
  [[40, 15], [43, 12], [40, 8], [37, 3], [36, -3], [34, -8], [35, -15]],
  [[58, 15], [62, 5], [68, -5], [70, -15], [66, -25], [57, -30], [45, -38], [30, -45], [10, -52]],
  [[70, -25], [75, -35], [90, -45], [110, -50], [130, -55], [150, -60]],
  [[-108, 20], [-105, 10], [-102, 0], [-110, -15], [-112, -30], [-115, -45], [-120, -55]],
];

const faultPoints = (() => {
  const pts: number[] = [];
  const seeds: number[] = [];
  for (const line of BOUNDARIES) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = ll(line[i][0], line[i][1], 1).normalize();
      const b = ll(line[i + 1][0], line[i + 1][1], 1).normalize();
      const ang = a.angleTo(b);
      const n = Math.max(2, Math.ceil(ang / ((0.6 * Math.PI) / 180)));
      for (let k = 0; k < n; k++) {
        const v = a.clone().lerp(b, k / n).normalize().multiplyScalar(R * 1.004);
        pts.push(v.x, v.y, v.z);
        seeds.push(hash(pts.length));
      }
    }
  }
  return { pts: new Float32Array(pts), seeds };
})();

let tex: { map: THREE.CanvasTexture; clouds: THREE.CanvasTexture } | null = null;
const earthTex = () => {
  if (tex) return tex;
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const sea = g.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#16304f');
  sea.addColorStop(0.5, '#0f3f6e');
  sea.addColorStop(1, '#16304f');
  g.fillStyle = sea;
  g.fillRect(0, 0, W, H);
  const X = (lon: number) => ((lon + 180) / 360) * W;
  const Y = (lat: number) => ((90 - lat) / 180) * H;
  // land
  g.fillStyle = '#4f6b3a';
  for (const ring of LAND as number[][][]) {
    g.beginPath();
    ring.forEach(([lon, lat], i) => (i ? g.lineTo(X(lon), Y(lat)) : g.moveTo(X(lon), Y(lat))));
    g.closePath();
    g.fill();
  }
  // tint land by latitude (deserts, forests, tundra) using the pixels
  const img = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y / H) * 180;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const isLand = img.data[i + 1] > 90 && img.data[i + 2] < 80;
      const lon = (x / W) * 360 - 180;
      const n = fbm(lon * 0.05, lat * 0.05, 3.7, 4);
      if (isLand) {
        const dry = Math.abs(lat) > 12 && Math.abs(lat) < 35 ? 0.7 : 0.15;
        const k = Math.min(1, Math.max(0, dry + (n - 0.5) * 0.8));
        img.data[i] = 80 + k * 110;
        img.data[i + 1] = 105 + k * 60;
        img.data[i + 2] = 58 + k * 40;
      } else {
        img.data[i] += (n - 0.5) * 12;
        img.data[i + 2] += (n - 0.5) * 16;
      }
      const iceLat = isLand ? (lat > 0 ? 66 : 64) : lat > 0 ? 80 : 66;
      if (Math.abs(lat) > iceLat - n * 8) {
        const k = Math.min(1, (Math.abs(lat) - (iceLat - n * 8)) / 4);
        img.data[i] = img.data[i] * (1 - k) + 228 * k;
        img.data[i + 1] = img.data[i + 1] * (1 - k) + 234 * k;
        img.data[i + 2] = img.data[i + 2] * (1 - k) + 242 * k;
      }
    }
  }
  g.putImageData(img, 0, 0);
  // clouds
  const cc = document.createElement('canvas');
  cc.width = 1024;
  cc.height = 512;
  const cg = cc.getContext('2d')!;
  const ci = cg.createImageData(1024, 512);
  for (let y = 0; y < 512; y++) {
    const lat = (0.5 - y / 512) * Math.PI;
    for (let x = 0; x < 1024; x++) {
      const lon = (x / 1024) * Math.PI * 2;
      const n = fbm(Math.cos(lat) * Math.cos(lon) * 3 + 5, Math.sin(lat) * 3, Math.cos(lat) * Math.sin(lon) * 3, 5);
      const a = Math.max(0, Math.min(1, (n - 0.52) * 3.2));
      const i = (y * 1024 + x) * 4;
      ci.data[i] = ci.data[i + 1] = ci.data[i + 2] = 255;
      ci.data[i + 3] = a * 230;
    }
  }
  cg.putImageData(ci, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const clouds = new THREE.CanvasTexture(cc);
  tex = { map, clouds };
  return tex;
};

let glow: THREE.CanvasTexture | null = null;
const glowMap = () => {
  if (glow) return glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,170,90,0.9)');
  gr.addColorStop(1, 'rgba(255,60,20,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  return glow;
};

const atmoVert = `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const atmoFrag = `varying vec3 vN; varying vec3 vV; void main(){ float d = abs(dot(normalize(vN), normalize(vV))); float f = pow(1.0 - d, 3.0); gl_FragColor = vec4(0.35,0.62,1.0, f*0.85); }`;

export type PlanetProps = {
  t: number; cam: CamProps; faults?: number; quake?: number; clouds?: number; spin?: number;
  ring?: number; ringArc?: number; ringHead?: number; ringA?: [number, number]; ringB?: [number, number]; ringNormal?: [number, number, number]; ringR?: number; ringW?: number;
  iss?: [number, number, number]; moon?: number;
};

/** glowing great-circle trail: through lon/lat A and B (earth frame) or around a world-frame normal */
const RING_N = 2000;
const Ring: React.FC<{ t: number; amount: number; arc: number; head: number; A?: [number, number]; B?: [number, number]; normal?: [number, number, number]; r: number; w?: number }> = ({ t, amount, arc, head, A, B, normal, r, w = 1 }) => {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RING_N * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(RING_N * 3), 3));
    return g;
  }, []);
  let e1: THREE.Vector3, e2: THREE.Vector3;
  if (normal) {
    const n = new THREE.Vector3(...normal).normalize();
    e1 = new THREE.Vector3(0, 1, 0).cross(n);
    if (e1.lengthSq() < 1e-4) e1 = new THREE.Vector3(1, 0, 0);
    e1.normalize();
    e2 = n.clone().cross(e1).normalize();
  } else {
    const a = ll(A![0], A![1], 1), b = ll(B![0], B![1], 1);
    const n = a.clone().cross(b).normalize();
    e1 = a.clone().normalize();
    e2 = n.clone().cross(e1).normalize();
  }
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
  const hd = ((head % 360) + 360) % 360;
  let hp = new THREE.Vector3();
  for (let i = 0; i < RING_N; i++) {
    const th = (i / RING_N) * Math.PI * 2;
    const p = e1.clone().multiplyScalar(Math.cos(th)).add(e2.clone().multiplyScalar(Math.sin(th))).multiplyScalar(r);
    pos.setXYZ(i, p.x, p.y, p.z);
    const deg = (i / RING_N) * 360;
    const behind = (hd - deg + 360) % 360;
    const lit = arc >= 0.999 ? 1 : behind < arc * 360 ? Math.pow(1 - behind / (arc * 360), 0.7) : 0;
    const fl = 0.8 + 0.2 * Math.sin(t * 40 + i * 0.37);
    const k = amount * lit * fl;
    col.setXYZ(i, k * 1.0, k * (0.55 + 0.35 * lit), k * 0.25 * lit);
    if (Math.abs(deg - hd) < 360 / RING_N) hp = p;
  }
  pos.needsUpdate = col.needsUpdate = true;
  return (
    <>
      <points geometry={geo}>
        <pointsMaterial size={r * 0.012 * w} map={glowMap()} vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>
      <points geometry={geo}>
        <pointsMaterial size={r * 0.05 * w} map={glowMap()} vertexColors transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>
      {arc < 0.999 && amount > 0.01 && (
        <sprite position={hp} scale={[r * 0.12 * w, r * 0.12 * w, 1]}>
          <spriteMaterial map={glowMap()} color="#fff2d0" transparent opacity={amount} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
      )}
    </>
  );
};

/** stylised space station (~0.14 units long), truss along x */
const ISS: React.FC<{ pos: [number, number, number] }> = ({ pos }) => (
  <group position={pos} rotation={[0.2, 0.5, 0.1]} scale={0.0025}>
    <mesh>
      <boxGeometry args={[60, 2, 2]} />
      <meshStandardMaterial color="#c9ccd2" metalness={0.6} roughness={0.4} />
    </mesh>
    {[-1, 1].map((s) =>
      [-1, 1].map((u) =>
        [0, 1].map((w) => (
          <mesh key={`${s}${u}${w}`} position={[s * (20 + w * 8), u * 9, 0]}>
            <boxGeometry args={[6, 16, 0.3]} />
            <meshStandardMaterial color="#d8a64a" metalness={0.7} roughness={0.25} emissive="#3a2508" />
          </mesh>
        )),
      ),
    )}
    {[[0, 0, 4, 14], [0, 0, -6, 10], [3, 0, 2, 6]].map(([x, y, z, l], i) => (
      <mesh key={i} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2, 2, l, 16]} />
        <meshStandardMaterial color="#e6e8ec" metalness={0.4} roughness={0.5} />
      </mesh>
    ))}
    {[-1, 1].map((s) => (
      <mesh key={s} position={[s * 6, 0, 2]}>
        <boxGeometry args={[3, 0.2, 10]} />
        <meshStandardMaterial color="#f0f0f0" />
      </mesh>
    ))}
  </group>
);

let moonTex: THREE.CanvasTexture | null = null;
const moonMap = () => {
  if (moonTex) return moonTex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8d8a85';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    const x = hash(i) * 512, y = hash(i + 0.5) * 512, r = Math.pow(hash(i + 0.2), 3) * 26 + 1;
    g.fillStyle = `rgba(40,38,36,${0.15 + hash(i + 0.7) * 0.25})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(220,216,208,0.35)';
    g.lineWidth = Math.max(0.6, r * 0.15);
    g.beginPath();
    g.arc(x - r * 0.1, y - r * 0.1, r, Math.PI * 0.9, Math.PI * 1.7);
    g.stroke();
  }
  moonTex = new THREE.CanvasTexture(c);
  moonTex.wrapS = moonTex.wrapT = THREE.RepeatWrapping;
  moonTex.repeat.set(8, 4);
  return moonTex;
};

export const PlanetScene: React.FC<PlanetProps> = ({ t, cam, faults = 0, quake = 0, clouds = 1, spin = 0, ring = 0, ringArc = 0.25, ringHead = 0, ringA = [2.35, 48.85], ringB = [-74, 40.7], ringNormal, ringR = 10.06, ringW = 1, iss, moon = 0 }) => {
  const { width, height } = useVideoConfig();
  const tx = earthTex();
  const atmo = useMemo(() => new THREE.ShaderMaterial({ vertexShader: atmoVert, fragmentShader: atmoFrag, transparent: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide, depthWrite: false }), []);
  const geo = useMemo(() => {
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(faultPoints.pts, 3));
    gg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(faultPoints.pts.length), 3));
    return gg;
  }, []);
  const col = geo.attributes.color as THREE.BufferAttribute;
  faultPoints.seeds.forEach((s, i) => {
    const fl = 0.55 + 0.45 * Math.sin(t * (9 + s * 14) + s * 50);
    const k = faults * fl;
    col.setXYZ(i, k, k * (0.55 + 0.3 * s), k * 0.25);
  });
  col.needsUpdate = true;
  const j = quake * 0.03;
  const shake: [number, number, number] = [Math.sin(t * 41) * j, Math.sin(t * 37 + 1) * j, Math.sin(t * 43 + 2) * j];
  return (
    <ThreeCanvas width={width} height={height} camera={{ fov: cam.fov ?? 40, position: [0, 0, 40], near: iss ? 0.004 : 0.1, far: 2000 }} gl={{ antialias: true }} onCreated={({ gl }) => (gl.toneMapping = THREE.ACESFilmicToneMapping)}>
      <CameraRig {...cam} />
      <SkyDome top={new THREE.Color('#010208')} bottom={new THREE.Color('#03040c')} stars={1.4} radius={900} />
      <ambientLight intensity={0.05} />
      <directionalLight position={[60, 20, 40]} intensity={2.6} color="#fff6ea" />
      <group rotation={[0.41, (spin * Math.PI) / 180, 0]} position={shake}>
        <mesh>
          <sphereGeometry args={[R, 128, 64]} />
          <meshStandardMaterial map={tx.map} roughness={0.85} metalness={0} />
        </mesh>
        <mesh rotation={[0, t * 0.01, 0]}>
          <sphereGeometry args={[R * 1.012, 96, 48]} />
          <meshStandardMaterial map={tx.clouds} transparent opacity={clouds * 0.85} depthWrite={false} />
        </mesh>
        {ring > 0 && !ringNormal && <Ring t={t} amount={ring} arc={ringArc} head={ringHead} A={ringA} B={ringB} r={ringR} w={ringW} />}
        <points geometry={geo}>
          <pointsMaterial size={0.32} map={glowMap()} vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
        </points>
        <points geometry={geo}>
          <pointsMaterial size={1.1} map={glowMap()} vertexColors transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
        </points>
      </group>
      <mesh material={atmo}>
        <sphereGeometry args={[R * 1.025, 96, 48]} />
      </mesh>
      {ring > 0 && ringNormal && <Ring t={t} amount={ring} arc={ringArc} head={ringHead} normal={ringNormal} r={ringR} w={ringW} />}
      {iss && <ISS pos={iss} />}
      {moon > 0 && (
        <mesh position={[0, -60.5, 150]} rotation={[0.3, 0, 0]}>
          <sphereGeometry args={[60, 128, 64]} />
          <meshStandardMaterial map={moonMap()} bumpMap={moonMap()} bumpScale={0.6} roughness={1} />
        </mesh>
      )}
    </ThreeCanvas>
  );
};
