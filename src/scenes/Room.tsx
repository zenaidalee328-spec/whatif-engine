import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CamProps, CameraRig, Person, PersonProps, hash, skyAt } from './common3d';

// Room: 6 wide (x -3..3), 3 tall, 5 deep (z -2.5..2.5). Camera looks from +z.
export type RoomProps = {
  t: number; // seconds, drives animations
  variant: 'bed' | 'office' | 'kitchen';
  clock: number; // clock hour 0..24 shown on the wall clock + window sky
  lamp: number; // 0..1 lamp brightness
  warp?: number; // wall/floor bending 0..1
  crawl?: number; // floor pattern crawl 0..1
  red?: number; // red mood light 0..1
  shadow?: number; // shadow figure opacity 0..1
  shadowStretch?: number;
  cam: CamProps;
  people: PersonProps[];
  cup?: { held: boolean; drop: number }; // drop: seconds since release (<0 = still held)
  ball?: { y: number; x: number; z: number } | null;
  fridgeOpen?: number;
  exposure?: number;
  digital?: boolean; // red LED alarm clock on the nightstand (bed variant), shows `clock`
};

const floorTexture = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d')!;
    // wooden planks
    for (let i = 0; i < 8; i++) {
      const shade = 120 + Math.floor(hash(i) * 40);
      g.fillStyle = `rgb(${shade + 30},${shade - 5},${shade - 45})`;
      g.fillRect(0, i * 64, 512, 64);
      g.fillStyle = 'rgba(40,20,5,0.55)';
      g.fillRect(0, i * 64, 512, 3);
      const off = Math.floor(hash(i + 20) * 512);
      g.fillRect(off, i * 64, 3, 64);
      for (let k = 0; k < 10; k++) {
        g.fillStyle = `rgba(60,30,10,${0.08 + hash(i * 10 + k) * 0.1})`;
        g.fillRect(0, i * 64 + 6 + k * 6, 512, 1);
      }
    }
    tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
})();

// a plane whose vertices wobble along its normal (for "the edges start to bend")
const WarpPlane: React.FC<{
  size: [number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  warp: number;
  t: number;
  seed: number;
  map?: THREE.Texture;
}> = ({ size, position, rotation, color, warp, t, seed, map }) => {
  const geo = useMemo(() => new THREE.PlaneGeometry(size[0], size[1], 48, 24), [size]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1];
    const z =
      warp *
      (0.14 * Math.sin(x * 1.7 + t * 1.1 + seed) * Math.sin(y * 1.3 - t * 0.8 + seed * 2) +
        0.05 * Math.sin(x * 4.1 - t * 2.3 + seed));
    p.setZ(i, z);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return (
    <mesh geometry={geo} position={position} rotation={rotation} receiveShadow>
      <meshStandardMaterial color={color} map={map} roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
};

const WallClock: React.FC<{ hour: number; pos: [number, number, number] }> = ({ hour, pos }) => {
  const h12 = hour % 12;
  const hourA = -(h12 / 12) * Math.PI * 2;
  const minA = -((hour % 1) * Math.PI * 2);
  return (
    <group position={pos}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 0.06, 32]} />
        <meshStandardMaterial color="#e9e4da" roughness={0.6} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.005]}>
        <torusGeometry args={[0.34, 0.03, 8, 32]} />
        <meshStandardMaterial color="#2a2a30" />
      </mesh>
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.sin(a) * 0.27, Math.cos(a) * 0.27, 0.035]}>
            <boxGeometry args={[0.02, 0.05, 0.01]} />
            <meshBasicMaterial color="#2a2a30" />
          </mesh>
        );
      })}
      <group rotation={[0, 0, hourA]} position={[0, 0, 0.045]}>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.035, 0.17, 0.01]} />
          <meshBasicMaterial color="#141418" />
        </mesh>
      </group>
      <group rotation={[0, 0, minA]} position={[0, 0, 0.055]}>
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.022, 0.25, 0.01]} />
          <meshBasicMaterial color="#141418" />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.06]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color="#c33" />
      </mesh>
    </group>
  );
};

const Box: React.FC<{ p: [number, number, number]; s: [number, number, number]; c: string; r?: number }> = ({ p, s, c, r = 0.8 }) => (
  <mesh position={p} castShadow receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} roughness={r} flatShading />
  </mesh>
);

export const RoomScene: React.FC<RoomProps> = (props) => {
  const { width, height } = useVideoConfig();
  const { t, variant, clock, lamp, warp = 0, crawl = 0, red = 0, shadow = 0, cam } = props;
  const sky = skyAt(clock);
  const floorTex = floorTexture();
  floorTex.offset.set(crawl * Math.sin(t * 0.7) * 0.06, crawl * t * 0.05);
  floorTex.rotation = crawl * 0.04 * Math.sin(t * 0.5);

  const windowCol = sky.top.clone().lerp(sky.bottom, 0.5);
  const sunI = sky.day;
  const moonI = 1 - sky.day;

  const wallCol = new THREE.Color('#c9c3d6').lerp(new THREE.Color('#8a3a44'), red * 0.6).getStyle();
  const lampI = lamp * 2.2;
  const redI = red * 3.0;

  return (
    <ThreeCanvas
      width={width}
      height={height}
      shadows
      camera={{ fov: cam.fov ?? 50, position: [0, 1.6, 4.5], near: 0.05, far: 80 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = props.exposure ?? 1.0;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <CameraRig pos={cam.pos} look={cam.look} fov={cam.fov ?? 50} roll={cam.roll} />
      <color attach="background" args={['#05060a']} />
      <ambientLight intensity={0.08 + 0.25 * sunI} color={moonI > 0.5 ? '#6d7fc8' : '#fff1de'} />
      <hemisphereLight args={['#8d9cff', '#3a2a22', 0.18 * moonI + 0.35 * sunI]} />
      {/* light through the window */}
      <directionalLight
        position={[-1.4, 3.2, -6]}
        intensity={0.55 * moonI + 2.2 * sunI}
        color={sunI > 0.5 ? '#ffd9a8' : '#7f93ff'}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-bias={-0.0006}
      />
      <pointLight position={[-0.35, 1.25, -2.0]} intensity={lampI} distance={7} decay={1.6} color="#ffb766" />
      {red > 0 && <pointLight position={[-2.2, 0.6, -1.6]} intensity={redI} distance={7} decay={1.4} color="#ff2638" />}
      {variant === 'kitchen' && (props.fridgeOpen ?? 0) > 0 && (
        <pointLight position={[-2.0, 1.2, -1.4]} intensity={2.6 * (props.fridgeOpen ?? 0)} distance={4} decay={1.5} color="#e4f2ff" />
      )}
      {variant === 'office' && <pointLight position={[0, 2.8, 0]} intensity={2.2} distance={9} decay={1.2} color="#f4f6ff" />}

      {/* shell */}
      <WarpPlane size={[6, 5]} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} color="#b38a62" warp={warp * 0.6} t={t} seed={1} map={floorTex} />
      <WarpPlane size={[6, 3]} position={[0, 1.5, -2.5]} rotation={[0, 0, 0]} color={wallCol} warp={warp} t={t} seed={2} />
      <WarpPlane size={[5, 3]} position={[-3, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} color={wallCol} warp={warp} t={t} seed={3} />
      <WarpPlane size={[5, 3]} position={[3, 1.5, 0]} rotation={[0, -Math.PI / 2, 0]} color={wallCol} warp={warp} t={t} seed={4} />
      <mesh position={[0, 3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 5]} />
        <meshStandardMaterial color="#d8d3e0" side={THREE.DoubleSide} />
      </mesh>
      {/* skirting */}
      <Box p={[0, 0.05, -2.48]} s={[6, 0.1, 0.03]} c="#efe9e0" />

      {/* window on back wall */}
      <group position={[-1.5, 1.75, -2.47]}>
        <mesh>
          <planeGeometry args={[1.3, 1.1]} />
          <meshBasicMaterial color={windowCol} toneMapped={false} />
        </mesh>
        {moonI > 0.3 && (
          <mesh position={[0.32, 0.26, 0.01]}>
            <circleGeometry args={[0.08, 20]} />
            <meshBasicMaterial color="#f4f1e2" transparent opacity={moonI} toneMapped={false} />
          </mesh>
        )}
        {[[-0.67, 0, 0.06, 1.16], [0.67, 0, 0.06, 1.16], [0, 0.57, 1.4, 0.06], [0, -0.57, 1.4, 0.06], [0, 0, 0.04, 1.1], [0, 0, 1.3, 0.04]].map(
          ([x, y, w, h], i) => (
            <mesh key={i} position={[x, y, 0.02]}>
              <boxGeometry args={[w, h, 0.05]} />
              <meshStandardMaterial color="#f2eee6" />
            </mesh>
          ),
        )}
      </group>

      <WallClock hour={clock} pos={[1.15, 2.25, -2.44]} />

      {variant === 'bed' && (
        <group>
          {/* bed */}
          <Box p={[0.9, 0.22, -1.35]} s={[1.6, 0.44, 2.2]} c="#5d4636" />
          <Box p={[0.9, 0.5, -1.35]} s={[1.5, 0.16, 2.1]} c="#eeeef4" r={1} />
          <Box p={[0.9, 0.74, -1.0]} s={[1.54, 0.3, 1.4]} c="#4d5f9e" r={1} />
          <Box p={[0.9, 0.68, -2.12]} s={[0.9, 0.16, 0.42]} c="#f6f6fa" r={1} />
          <Box p={[0.9, 0.75, -2.46]} s={[1.6, 0.9, 0.08]} c="#4a372a" />
          {/* nightstand + lamp */}
          <Box p={[-0.35, 0.3, -2.1]} s={[0.55, 0.6, 0.5]} c="#6b4f3a" />
          <mesh position={[-0.35, 0.72, -2.1]}>
            <cylinderGeometry args={[0.05, 0.08, 0.24, 10]} />
            <meshStandardMaterial color="#d9cbb5" />
          </mesh>
          <mesh position={[-0.35, 0.95, -2.1]}>
            <cylinderGeometry args={[0.13, 0.2, 0.24, 14, 1, true]} />
            <meshStandardMaterial color="#f3dcb0" emissive="#ffb766" emissiveIntensity={lamp * 0.9} side={THREE.DoubleSide} />
          </mesh>
          {/* rug */}
          <mesh position={[0.2, 0.012, 0.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[1.0, 32]} />
            <meshStandardMaterial color="#6b3e52" roughness={1} />
          </mesh>
        </group>
      )}

      {variant === 'office' && (
        <group>
          <Box p={[0.3, 0.74, -1.6]} s={[1.8, 0.06, 0.8]} c="#d9d2c4" />
          {[[-0.5, -1.95], [1.1, -1.95], [-0.5, -1.25], [1.1, -1.25]].map(([x, z], i) => (
            <Box key={i} p={[x, 0.36, z]} s={[0.06, 0.72, 0.06]} c="#444" />
          ))}
          <Box p={[0.3, 1.1, -1.85]} s={[0.9, 0.55, 0.05]} c="#1b1e26" />
          <mesh position={[0.3, 1.1, -1.82]}>
            <planeGeometry args={[0.82, 0.47]} />
            <meshBasicMaterial color="#5b8de0" toneMapped={false} />
          </mesh>
          <Box p={[0.3, 0.8, -1.85]} s={[0.08, 0.1, 0.08]} c="#333" />
          <mesh position={[0.95, 0.83, -1.45]}>
            <cylinderGeometry args={[0.05, 0.045, 0.12, 12]} />
            <meshStandardMaterial color="#f2f2f2" />
          </mesh>
          <Box p={[-2.6, 1.0, -1.8]} s={[0.6, 2.0, 0.5]} c="#8a8f99" />
        </group>
      )}

      {variant === 'kitchen' && (
        <group>
          {/* fridge */}
          <Box p={[-2.25, 1.0, -1.9]} s={[0.9, 2.0, 0.8]} c="#e8ecf0" r={0.4} />
          <group position={[-1.8, 1.0, -1.5]} rotation={[0, -(props.fridgeOpen ?? 0) * 1.6, 0]}>
            <Box p={[-0.45, 0, 0.02]} s={[0.9, 1.96, 0.06]} c="#dfe4ea" r={0.4} />
          </group>
          <mesh position={[-2.25, 1.0, -1.49]}>
            <planeGeometry args={[0.8, 1.9]} />
            <meshBasicMaterial color="#cfe6ff" toneMapped={false} transparent opacity={0.35 * (props.fridgeOpen ?? 0)} />
          </mesh>
          {/* counter */}
          <Box p={[1.0, 0.45, -2.15]} s={[3.6, 0.9, 0.65]} c="#7a6a5a" />
          <Box p={[1.0, 0.92, -2.15]} s={[3.7, 0.06, 0.7]} c="#d8d4cc" r={0.3} />
          {[0.2, 0.5, 0.8].map((x, i) => (
            <mesh key={i} position={[x + 0.6, 0.98, -2.05]}>
              <cylinderGeometry args={[0.06, 0.06, 0.1, 10]} />
              <meshStandardMaterial color={['#e85d4a', '#f2c14e', '#5aa96a'][i]} />
            </mesh>
          ))}
          {/* table */}
          <Box p={[0.6, 0.72, 0.2]} s={[1.2, 0.05, 0.8]} c="#a07a52" />
          <Box p={[0.6, 0.36, 0.2]} s={[0.1, 0.7, 0.1]} c="#5a4632" />
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0.25 + i * 0.18, 0.77, 0.15 + (i % 2) * 0.2]} rotation={[0, i, 0]}>
              <boxGeometry args={[0.12, 0.04, 0.09]} />
              <meshStandardMaterial color={['#c94', '#e8d6a8', '#b33', '#d8b25a', '#ece6dc'][i]} />
            </mesh>
          ))}
        </group>
      )}

      {variant === 'bed' && props.digital && <DigitalClock hour={clock} />}

      {/* shadow figure in the back-left corner */}
      {shadow > 0 && (
        <Person
          pos={[-2.45, 0, -2.0]}
          rotY={0.6}
          dark
          opacity={shadow}
          stretch={props.shadowStretch ?? 1}
          headTilt={Math.sin(t * 0.7) * 0.15}
        />
      )}

      {props.people.map((pp, i) => (
        <Person key={i} {...pp} />
      ))}

      {props.cup && <Cup {...props.cup} />}
      {props.ball && (
        <mesh position={[props.ball.x, props.ball.y, props.ball.z]} castShadow>
          <sphereGeometry args={[0.07, 14, 12]} />
          <meshStandardMaterial color="#ff5b3a" roughness={0.5} />
        </mesh>
      )}
    </ThreeCanvas>
  );
};

// cup: held in the sitting person's right hand, then falls and bounces
const Cup: React.FC<{ held: boolean; drop: number }> = ({ drop }) => {
  const start: [number, number, number] = [0.68, 0.86, -0.12];
  let y = start[1], z = start[2], rot = 0;
  if (drop > 0) {
    const g = 9.8;
    const tImpact = Math.sqrt((2 * (start[1] - 0.06)) / g);
    if (drop < tImpact) {
      y = start[1] - 0.5 * g * drop * drop;
      rot = drop * 4;
      z = start[2] + drop * 0.6;
    } else {
      const u = drop - tImpact;
      const bounce = Math.max(0, 0.25 * Math.exp(-u * 3) * Math.abs(Math.sin(u * 9)));
      y = 0.06 + bounce;
      rot = Math.PI / 2 + Math.min(u, 0.6) * 1.5;
      z = start[2] + tImpact * 0.6 + Math.min(u, 0.8) * 0.4;
    }
  }
  return (
    <group position={[start[0], y, z]} rotation={[rot, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.055, 0.045, 0.12, 16]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.4} />
      </mesh>
      <mesh position={[0.065, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.03, 0.01, 6, 12]} />
        <meshStandardMaterial color="#f4f1ea" />
      </mesh>
    </group>
  );
};

// bedside LED alarm clock: on the nightstand, facing the bed (+x)
const DigitalClock: React.FC<{ hour: number }> = ({ hour }) => {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 112;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { c, t };
  }, []);
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  const g = tex.c.getContext('2d')!;
  g.fillStyle = '#060303';
  g.fillRect(0, 0, 256, 112);
  g.fillStyle = '#ff2a1a';
  g.font = '700 88px Inter, sans-serif';
  g.textAlign = 'center';
  g.fillText(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 128, 88);
  tex.t.needsUpdate = true;
  return (
    <group position={[-0.2, 0.66, -1.98]} rotation={[0, Math.PI / 2 - 0.35, 0]}>
      <mesh>
        <boxGeometry args={[0.24, 0.11, 0.09]} />
        <meshStandardMaterial color="#141418" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.046]}>
        <planeGeometry args={[0.21, 0.09]} />
        <meshBasicMaterial map={tex.t} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0, 0.12]} intensity={0.25} distance={0.9} decay={1.5} color="#ff3020" />
    </group>
  );
};
