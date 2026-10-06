import * as THREE from 'three';
import type { Finish } from '../../shared/types';
import type { StockLevel } from '../../lib/roll';
import { getWindingNormalTexture, getGlitterTexture } from './textures';
import { getContactShadowTexture } from './geometries';

let plasticMaterial: THREE.MeshPhysicalMaterial | null = null;
let coreMaterial: THREE.MeshStandardMaterial | null = null;
let shadowMaterial: THREE.MeshBasicMaterial | null = null;

export function getPlasticMaterial(): THREE.MeshPhysicalMaterial {
  if (plasticMaterial) return plasticMaterial;
  plasticMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#5c6676'), // Titanio técnico satinado para estructura delgada de panal
    roughness: 0.30,
    metalness: 0.26,
    clearcoat: 0.85,
    clearcoatRoughness: 0.10,
  });
  return plasticMaterial;
}

export function getCoreMaterial(): THREE.MeshStandardMaterial {
  if (coreMaterial) return coreMaterial;
  coreMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c68b50'), // Cartón kraft marrón cálido visible por el centro
    roughness: 0.78,
    metalness: 0.02,
  });
  return coreMaterial;
}

export function getShadowMaterial(): THREE.MeshBasicMaterial {
  if (shadowMaterial) return shadowMaterial;
  shadowMaterial = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  return shadowMaterial;
}

/**
 * Crea o actualiza el material PBR del filamento enrollado
 * según el color hexadecimal y el acabado (mate, brillante, seda, translúcido, glitter).
 */
export function createFilamentMaterial(colorHex: string, finish: Finish): THREE.Material {
  const color = new THREE.Color(colorHex);
  const windingMap = getWindingNormalTexture();

  const lum = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
  const isDark = lum < 0.18;
  // Tinte emisivo sutil para realzar la saturación y fidelidad del color en modo oscuro
  const emissive = color.clone().multiplyScalar(isDark ? 0.04 : 0.13);

  switch (finish) {
    case 'matte':
      return new THREE.MeshStandardMaterial({
        color,
        emissive,
        roughness: isDark ? 0.78 : 0.85,
        metalness: 0.02,
        normalMap: windingMap,
        normalScale: new THREE.Vector2(0.65, 0.65),
      });

    case 'silk':
      return new THREE.MeshPhysicalMaterial({
        color,
        emissive,
        roughness: 0.26,
        metalness: 0.08,
        sheen: 1.0,
        sheenRoughness: 0.22,
        sheenColor: color.clone().offsetHSL(0, -0.1, 0.3),
        normalMap: windingMap,
        normalScale: new THREE.Vector2(0.7, 0.7),
      });

    case 'translucent':
      // Sin `transmission`: en three.js obliga a una pasada extra de render a pantalla completa
      // por cada bobina. Transparencia alfa + clearcoat da un aspecto casi idéntico a este tamaño.
      return new THREE.MeshPhysicalMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.1),
        transparent: true,
        opacity: 0.78,
        roughness: 0.2,
        clearcoat: 0.8,
        clearcoatRoughness: 0.1,
        normalMap: windingMap,
        normalScale: new THREE.Vector2(0.45, 0.45),
      });

    case 'glitter':
      return new THREE.MeshStandardMaterial({
        color,
        emissive,
        roughness: 0.32,
        metalness: 0.48,
        normalMap: getGlitterTexture(),
        normalScale: new THREE.Vector2(0.85, 0.85),
      });

    case 'glossy':
    default:
      return new THREE.MeshPhysicalMaterial({
        color,
        emissive,
        roughness: 0.14,
        metalness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        normalMap: windingMap,
        normalScale: new THREE.Vector2(0.8, 0.8),
      });
  }
}
