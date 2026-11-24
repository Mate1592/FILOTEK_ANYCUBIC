import * as THREE from 'three';
import type { Finish } from '../../shared/types';
import { getWindingNormalTexture, getGlitterTexture } from './textures';
import { getContactShadowTexture } from './geometries';

let plasticMaterial: THREE.MeshPhysicalMaterial | null = null;
let coreMaterial: THREE.MeshStandardMaterial | null = null;
let shadowMaterial: THREE.MeshBasicMaterial | null = null;

export function createPlasticMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#5c6676'), // Titanio técnico satinado para estructura delgada de panal
    roughness: 0.30,
    metalness: 0.26,
    clearcoat: 0.85,
    clearcoatRoughness: 0.10,
  });
}

export function getPlasticMaterial(): THREE.MeshPhysicalMaterial {
  if (plasticMaterial) return plasticMaterial;
  plasticMaterial = createPlasticMaterial();
  return plasticMaterial;
}

export function createCoreMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c68b50'), // Cartón kraft marrón cálido visible por el centro
    roughness: 0.78,
    metalness: 0.02,
  });
}

export function getCoreMaterial(): THREE.MeshStandardMaterial {
  if (coreMaterial) return coreMaterial;
  coreMaterial = createCoreMaterial();
  return coreMaterial;
}

export function createShadowMaterial(shadowTexture: THREE.Texture = getContactShadowTexture()): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
}

export function getShadowMaterial(): THREE.MeshBasicMaterial {
  if (shadowMaterial) return shadowMaterial;
  shadowMaterial = createShadowMaterial();
  return shadowMaterial;
}

export function createRimGlowMaterial(level: 'low' | 'critical'): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: level === 'critical' ? 0xff4d36 : 0xf5a623,
    linewidth: 2,
    transparent: true,
    opacity: level === 'critical' ? 0.85 : 0.65,
  });
}

export function normalizeColorHex(colorHex: string): string {
  const trimmed = colorHex.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed.toLowerCase() : '#5c6068';
}

/**
 * Crea o actualiza el material PBR del filamento enrollado
 * según el color hexadecimal y el acabado (mate, brillante, seda, translúcido, glitter).
 */
export function createFilamentMaterial(
  colorHex: string,
  finish: Finish,
  windingMap: THREE.Texture = getWindingNormalTexture(),
  glitterMap: THREE.Texture = getGlitterTexture(),
): THREE.Material {
  const color = new THREE.Color(normalizeColorHex(colorHex));

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
        normalMap: glitterMap,
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
