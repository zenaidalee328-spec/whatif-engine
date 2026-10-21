import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { continueRender, delayRender, staticFile } from 'remotion';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Load a GLB from public/ once; Remotion waits for it (delayRender). */
const cache = new Map<string, Promise<GLTF>>();
export const useGLB = (path: string): GLTF | null => {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [handle] = useState(() => delayRender(`load ${path}`, { timeoutInMilliseconds: 120000 }));
  useEffect(() => {
    if (!cache.has(path)) {
      const l = new GLTFLoader();
      const d = new DRACOLoader();
      d.setDecoderPath(staticFile('draco/'));
      l.setDRACOLoader(d);
      cache.set(path, l.loadAsync(staticFile(path)));
    }
    cache.get(path)!.then((g) => setGltf(g));
  }, [path, handle]);
  useEffect(() => {
    // release Remotion only after React committed the loaded asset and <Redraw> re-rendered the canvas
    if (!gltf) return;
    const id = setTimeout(() => continueRender(handle), 60);
    return () => clearTimeout(id);
  }, [gltf, handle]);
  return gltf;
};

/**
 * Cinematic post-processing inside a ThreeCanvas: bloom + depth of field + filmic output.
 * focus = distance (m) from camera to the sharp plane; aperture ~0.0002..0.002; bloom 0..1.5
 */
export const Post: React.FC<{ bloom?: number; bloomRadius?: number; bloomThreshold?: number; focus?: number; aperture?: number; maxblur?: number }> = ({
  bloom = 0.45,
  bloomRadius = 0.6,
  bloomThreshold = 0.82,
  focus = 6,
  aperture = 0,
  maxblur = 0.008,
}) => {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const b = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), bloom, bloomRadius, bloomThreshold);
    c.addPass(b);
    const k = new BokehPass(scene, camera, { focus, aperture, maxblur });
    c.addPass(k);
    c.addPass(new OutputPass());
    (c as any).__bloom = b;
    (c as any).__bokeh = k;
    return c;
  }, [gl, scene, camera]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => composer.setSize(size.width, size.height), [composer, size]);
  const b = (composer as any).__bloom as UnrealBloomPass;
  b.strength = bloom;
  b.radius = bloomRadius;
  b.threshold = bloomThreshold;
  const k = (composer as any).__bokeh as BokehPass;
  k.enabled = aperture > 0;
  const u = (k as any).uniforms;
  u.focus.value = focus;
  u.aperture.value = aperture;
  u.maxblur.value = maxblur;
  useFrame(() => {
    composer.render();
  }, 1);
  return null;
};

/** Load an HDR equirect from public/ and set it as scene.environment (image-based lighting) and optionally background. */
const hdrCache = new Map<string, Promise<THREE.DataTexture>>();
export const Env: React.FC<{ path: string; background?: boolean; intensity?: number; rotation?: number }> = ({ path, background = false, intensity = 1, rotation = 0 }) => {
  const { gl, scene } = useThree();
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [handle] = useState(() => delayRender(`hdr ${path}`, { timeoutInMilliseconds: 120000 }));
  useEffect(() => {
    if (!hdrCache.has(path)) hdrCache.set(path, new RGBELoader().loadAsync(staticFile(path)));
    hdrCache.get(path)!.then((hdr) => {
      const pm = new THREE.PMREMGenerator(gl);
      const env = pm.fromEquirectangular(hdr).texture;
      pm.dispose();
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      setTex(background ? hdr : env);
      scene.environment = env;
    });
  }, [path, gl, scene, handle, background]);
  const advance = useThree((s) => s.advance);
  useLayoutEffect(() => {
    if (!tex) return;
    advance(performance.now());
    const id = setTimeout(() => continueRender(handle), 60);
    return () => clearTimeout(id);
  }, [tex, advance, handle]);
  scene.environmentIntensity = intensity;
  (scene as any).environmentRotation?.set(0, rotation, 0);
  if (background && tex) {
    scene.background = tex;
    (scene as any).backgroundRotation?.set(0, rotation, 0);
  }
  return null;
};

/** Load a texture from public/ (Remotion waits). */
const texCache = new Map<string, Promise<THREE.Texture>>();
export const useTex = (path: string, srgb = true): THREE.Texture | null => {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [handle] = useState(() => delayRender(`tex ${path}`, { timeoutInMilliseconds: 120000 }));
  useEffect(() => {
    if (!texCache.has(path)) texCache.set(path, new THREE.TextureLoader().loadAsync(staticFile(path)));
    texCache.get(path)!.then((t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      setTex(t);
    });
  }, [path, handle, srgb]);
  useEffect(() => {
    if (!tex) return;
    const id = setTimeout(() => continueRender(handle), 60);
    return () => clearTimeout(id);
  }, [tex, handle]);
  return tex;
};

/** Put inside a ThreeCanvas: re-renders the canvas when async assets (deps) arrive.
 *  Remotion only advances R3F on frame changes, so without this a model that loads after the frame's
 *  render would be missing from that frame. */
export const Redraw: React.FC<{ deps: unknown[] }> = ({ deps }) => {
  const advance = useThree((s) => s.advance);
  useLayoutEffect(() => {
    advance(performance.now());
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};
