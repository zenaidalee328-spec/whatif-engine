import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLB } from './fx3d';

/** Realistic car (models/car.glb, draco) cloned per instance with its own body colour. Faces +z, ~4.5 m long. */
export const useCarFactory = () => {
  const g = useGLB('models/car.glb');
  return useMemo(() => {
    if (!g) return null;
    return (color: string) => {
      const c = g.scene.clone(true);
      c.traverse((o: any) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        const name = (o.material as THREE.Material).name;
        if (name === 'Body_Color') {
          const m = (o.material as THREE.MeshPhysicalMaterial).clone();
          m.color.set(color);
          (m as any).clearcoat = 1;
          (m as any).clearcoatRoughness = 0.05;
          m.metalness = 0.6;
          m.roughness = 0.35;
          o.material = m;
        }
        if (name === 'Ferrari_Yellow' || name === '_0098_DodgerBlue') {
          const m = (o.material as THREE.MeshStandardMaterial).clone();
          m.color.set(color).multiplyScalar(0.8);
          o.material = m;
        }
      });
      const wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => c.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
      return { root: c, wheels };
    };
  }, [g]);
};
