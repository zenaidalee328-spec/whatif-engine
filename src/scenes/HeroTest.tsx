import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig } from 'remotion';
import { CameraRig } from './common3d';
import { Env, Post, Redraw, useGLB } from './fx3d';
import { hatHero, poseHero, useHeroFactory } from './hero';

export const HeroTestScene: React.FC<{ t: number; p: Record<string, any> }> = ({ t, p }) => {
  const { width, height } = useVideoConfig();
  const factory = useHeroFactory();
  const man = useGLB('models/man.glb');
  const hero = useMemo(() => (factory ? factory() : null), [factory]);
  if (hero) {
    if (!p.noPose) poseHero(hero, p.phase ?? t, p.run ?? 1, p.sprint ?? 0, p.lean ?? 0);
    hero.root.rotation.y = p.rotY ?? 0;
    hatHero(hero, p.hatFly ?? -1);
    hero.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(hero.root);
    const hp = new THREE.Vector3(); hero.bones.Hips.getWorldPosition(hp);
    console.log('HERO', JSON.stringify(bb.min), JSON.stringify(bb.max), JSON.stringify(hp), hero.mats.length, Object.entries(hero.bones).map(([k,b]) => k + ':' + b.quaternion.toArray().map((x) => x.toFixed(2)).join(',')).join(' | '));
  }
  const a = (p.camDeg ?? 30) * Math.PI / 180, d = p.camDist ?? 3.2;
  return (
    <ThreeCanvas width={width} height={height} shadows camera={{ fov: 35, position: [0, 1, 3], near: 0.05, far: 500 }} gl={{ antialias: true }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.shadowMap.type = THREE.PCFSoftShadowMap; }}>
      <CameraRig pos={[Math.sin(a) * d, p.camH ?? 1.1, Math.cos(a) * d]} look={[0, p.lookY ?? 0.95, 0]} fov={p.fov ?? 35} />
      {!p.noEnv && <Env path={p.hdr ?? 'hdr/venice_sunset_1k.hdr'} background />}
      <directionalLight position={[3, 6, 2]} intensity={1.5} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#777" roughness={0.9} />
      </mesh>
      {hero && <primitive object={hero.root} />}
      {hero?.hat && <primitive object={hero.hat.flyer} />}
      {p.raw && man && <primitive object={man.scene} position={[0.5, 0, 0]} />}
      <Redraw deps={[hero]} />
      {!p.noPost && <Post bloom={0.3} />}
    </ThreeCanvas>
  );
};
