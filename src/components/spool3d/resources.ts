import * as THREE from 'three';
import type { Finish } from '../../shared/types';
import {
  createContactShadowGeometry,
  createContactShadowTexture,
  createCoreGeometry,
  createFilamentGeometry,
  createFlangeGeometry,
  createRimGlowGeometry,
} from './geometries';
import {
  createCoreMaterial,
  createFilamentMaterial,
  createPlasticMaterial,
  createRimGlowMaterial,
  createShadowMaterial,
  normalizeColorHex,
} from './materials';
import { createGlitterTexture, createWindingNormalTexture } from './textures';

export interface SpoolResourcePoolOptions {
  maxFilamentMaterials?: number;
}

/**
 * Pool de recursos Three.js aislado por contexto WebGLRenderer.
 * Evita fugas de listeners 'dispose' entre contextos y la eliminación cruzada de buffers GPU.
 */
export class SpoolResourcePool {
  private flangeGeometry: THREE.BufferGeometry | null = null;
  private coreGeometry: THREE.BufferGeometry | null = null;
  private shadowGeometry: THREE.BufferGeometry | null = null;
  private rimGlowGeometry: THREE.BufferGeometry | null = null;

  private plasticMaterial: THREE.MeshPhysicalMaterial | null = null;
  private coreMaterial: THREE.MeshStandardMaterial | null = null;
  private shadowMaterial: THREE.MeshBasicMaterial | null = null;
  private rimGlowMaterials = new Map<'low' | 'critical', THREE.LineBasicMaterial>();

  private windingTexture: THREE.CanvasTexture | null = null;
  private glitterTexture: THREE.CanvasTexture | null = null;
  private contactShadowTexture: THREE.CanvasTexture | null = null;

  public readonly filamentGeometries = new Map<number, THREE.BufferGeometry>();
  public readonly filamentMaterials = new Map<string, THREE.Material>();
  private readonly maxFilamentMaterials: number;

  constructor(options?: SpoolResourcePoolOptions) {
    this.maxFilamentMaterials = options?.maxFilamentMaterials ?? Infinity;
  }

  public getFlangeGeometry(): THREE.BufferGeometry {
    if (!this.flangeGeometry) this.flangeGeometry = createFlangeGeometry();
    return this.flangeGeometry;
  }

  public getCoreGeometry(): THREE.BufferGeometry {
    if (!this.coreGeometry) this.coreGeometry = createCoreGeometry();
    return this.coreGeometry;
  }

  public getContactShadowGeometry(): THREE.BufferGeometry {
    if (!this.shadowGeometry) this.shadowGeometry = createContactShadowGeometry();
    return this.shadowGeometry;
  }

  public getRimGlowGeometry(): THREE.BufferGeometry {
    if (!this.rimGlowGeometry) this.rimGlowGeometry = createRimGlowGeometry();
    return this.rimGlowGeometry;
  }

  public getPlasticMaterial(): THREE.MeshPhysicalMaterial {
    if (!this.plasticMaterial) this.plasticMaterial = createPlasticMaterial();
    return this.plasticMaterial;
  }

  public getCoreMaterial(): THREE.MeshStandardMaterial {
    if (!this.coreMaterial) this.coreMaterial = createCoreMaterial();
    return this.coreMaterial;
  }

  public getShadowMaterial(): THREE.MeshBasicMaterial {
    if (!this.shadowMaterial) {
      this.shadowMaterial = createShadowMaterial(this.getContactShadowTexture());
    }
    return this.shadowMaterial;
  }

  public getRimGlowMaterial(level: 'low' | 'critical'): THREE.LineBasicMaterial {
    let mat = this.rimGlowMaterials.get(level);
    if (!mat) {
      mat = createRimGlowMaterial(level);
      this.rimGlowMaterials.set(level, mat);
    }
    return mat;
  }

  public getWindingTexture(): THREE.CanvasTexture {
    if (!this.windingTexture) this.windingTexture = createWindingNormalTexture();
    return this.windingTexture;
  }

  public getGlitterTexture(): THREE.CanvasTexture {
    if (!this.glitterTexture) this.glitterTexture = createGlitterTexture();
    return this.glitterTexture;
  }

  public getContactShadowTexture(): THREE.CanvasTexture {
    if (!this.contactShadowTexture) this.contactShadowTexture = createContactShadowTexture();
    return this.contactShadowTexture;
  }

  public getFilamentGeometry(rFill: number, rKey: number): THREE.BufferGeometry {
    let geom = this.filamentGeometries.get(rKey);
    if (!geom) {
      geom = createFilamentGeometry(rFill);
      this.filamentGeometries.set(rKey, geom);
    }
    return geom;
  }

  public getFilamentMaterial(colorHex: string, finish: Finish): THREE.Material {
    const norm = normalizeColorHex(colorHex);
    const key = `${norm}:${finish}`;
    const existing = this.filamentMaterials.get(key);
    if (existing) {
      // Actualizar orden LRU si hay límite de caché
      if (Number.isFinite(this.maxFilamentMaterials)) {
        this.filamentMaterials.delete(key);
        this.filamentMaterials.set(key, existing);
      }
      return existing;
    }

    if (
      Number.isFinite(this.maxFilamentMaterials) &&
      this.filamentMaterials.size >= this.maxFilamentMaterials
    ) {
      const oldestKey = this.filamentMaterials.keys().next().value;
      if (oldestKey !== undefined) {
        const oldestMat = this.filamentMaterials.get(oldestKey);
        oldestMat?.dispose();
        this.filamentMaterials.delete(oldestKey);
      }
    }

    const mat = createFilamentMaterial(
      norm,
      finish,
      this.getWindingTexture(),
      this.getGlitterTexture(),
    );
    this.filamentMaterials.set(key, mat);
    return mat;
  }

  public dispose() {
    this.flangeGeometry?.dispose();
    this.coreGeometry?.dispose();
    this.shadowGeometry?.dispose();
    this.rimGlowGeometry?.dispose();
    this.flangeGeometry = null;
    this.coreGeometry = null;
    this.shadowGeometry = null;
    this.rimGlowGeometry = null;

    for (const geom of this.filamentGeometries.values()) {
      geom.dispose();
    }
    this.filamentGeometries.clear();

    this.plasticMaterial?.dispose();
    this.coreMaterial?.dispose();
    this.shadowMaterial?.dispose();
    this.plasticMaterial = null;
    this.coreMaterial = null;
    this.shadowMaterial = null;

    for (const mat of this.rimGlowMaterials.values()) {
      mat.dispose();
    }
    this.rimGlowMaterials.clear();

    for (const mat of this.filamentMaterials.values()) {
      mat.dispose();
    }
    this.filamentMaterials.clear();

    this.windingTexture?.dispose();
    this.glitterTexture?.dispose();
    this.contactShadowTexture?.dispose();
    this.windingTexture = null;
    this.glitterTexture = null;
    this.contactShadowTexture = null;
  }
}

export function createSpoolResourcePool(options?: SpoolResourcePoolOptions): SpoolResourcePool {
  return new SpoolResourcePool(options);
}

/** Pool persistente para la estantería compartida (SpoolViewerManager) */
export const shelfPool = createSpoolResourcePool();
