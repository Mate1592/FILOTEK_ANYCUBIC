import * as THREE from 'three';
import type { Finish } from '../../shared/types';
import type { StockLevel } from '../../lib/roll';
import { SPOOL_CONSTANTS } from './geometries';
import { normalizeColorHex } from './materials';
import { shelfPool, type SpoolResourcePool } from './resources';

export class SpoolObject extends THREE.Group {
  private pool: SpoolResourcePool;
  private frontFlange: THREE.Mesh;
  private backFlange: THREE.Mesh;
  private coreMesh: THREE.Mesh;
  private filamentMesh: THREE.Mesh | null = null;
  private shadowMesh: THREE.Mesh;
  private rimGlow: THREE.LineLoop | null = null;
  private spoolCenter: THREE.Group;

  private currentColor: string = '';
  private currentFinish: Finish = 'glossy';
  private currentRadiusKey: number = -1;
  private currentLevel: StockLevel = 'ok';

  // Base three-quarters resting angle
  public baseRotX = THREE.MathUtils.degToRad(10);
  public baseRotY = THREE.MathUtils.degToRad(32);

  constructor(pool: SpoolResourcePool = shelfPool) {
    super();
    this.pool = pool;

    this.spoolCenter = new THREE.Group();
    this.add(this.spoolCenter);

    const { WIDTH, FLANGE_THICKNESS, R_MAX } = SPOOL_CONSTANTS;
    const flangeGeom = pool.getFlangeGeometry();
    const plasticMat = pool.getPlasticMaterial();

    // Disco frontal
    this.frontFlange = new THREE.Mesh(flangeGeom, plasticMat);
    this.frontFlange.position.z = WIDTH / 2 + FLANGE_THICKNESS / 2;
    this.spoolCenter.add(this.frontFlange);

    // Disco trasero
    this.backFlange = new THREE.Mesh(flangeGeom, plasticMat);
    this.backFlange.position.z = -(WIDTH / 2 + FLANGE_THICKNESS / 2);
    this.spoolCenter.add(this.backFlange);

    // Núcleo cilíndrico de cartón
    const coreGeom = pool.getCoreGeometry();
    const coreMat = pool.getCoreMaterial();
    this.coreMesh = new THREE.Mesh(coreGeom, coreMat);
    this.spoolCenter.add(this.coreMesh);

    // Sombra de contacto en el plano inferior
    const shadowGeom = pool.getContactShadowGeometry();
    const shadowMat = pool.getShadowMaterial();
    this.shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
    this.shadowMesh.position.y = -R_MAX - 0.04;
    this.add(this.shadowMesh);

    // Aplicar ángulo de reposo de tres cuartos
    this.spoolCenter.rotation.x = this.baseRotX;
    this.spoolCenter.rotation.y = this.baseRotY;
  }

  public update(
    colorHex: string,
    finish: Finish,
    fraction: number,
    level: StockLevel,
    spinAngle: number = 0,
    tiltX: number = 0,
    tiltY: number = 0,
    _glowPulse: number = 1.0,
  ) {
    const { R_CORE, R_MAX } = SPOOL_CONSTANTS;
    const f = Math.max(0, Math.min(1, fraction));
    const normColor = normalizeColorHex(colorHex);

    // Cuantización del radio exterior en pasos de 0.01 (~54 geometrías máx.)
    const rRaw = Math.sqrt(R_CORE * R_CORE + f * (R_MAX * 0.95 * R_MAX * 0.95 - R_CORE * R_CORE));
    const rClamped = Math.max(rRaw, R_CORE + 0.015);
    const rKey = f > 0.005 && level !== 'empty' ? Math.round(rClamped * 100) : 0;

    const colorOrFinishChanged = normColor !== this.currentColor || finish !== this.currentFinish;

    if (rKey !== this.currentRadiusKey) {
      this.currentRadiusKey = rKey;
      this.currentColor = normColor;
      this.currentFinish = finish;

      if (rKey === 0) {
        if (this.filamentMesh) {
          this.spoolCenter.remove(this.filamentMesh);
          this.filamentMesh = null;
        }
      } else {
        const filGeom = this.pool.getFilamentGeometry(rKey / 100, rKey);
        const filMat = this.pool.getFilamentMaterial(normColor, finish);
        if (this.filamentMesh) {
          this.filamentMesh.geometry = filGeom;
          this.filamentMesh.material = filMat;
        } else {
          this.filamentMesh = new THREE.Mesh(filGeom, filMat);
          this.spoolCenter.add(this.filamentMesh);
        }
      }
    } else if (colorOrFinishChanged) {
      this.currentColor = normColor;
      this.currentFinish = finish;
      if (this.filamentMesh) {
        this.filamentMesh.material = this.pool.getFilamentMaterial(normColor, finish);
      }
    }

    // Anillo estático indicador de bajo stock / crítico (sin pulso continuo en WebGL)
    if (level !== this.currentLevel) {
      this.currentLevel = level;
      if (level === 'low' || level === 'critical') {
        const glowGeom = this.pool.getRimGlowGeometry();
        const glowMat = this.pool.getRimGlowMaterial(level);
        if (this.rimGlow) {
          this.rimGlow.material = glowMat;
        } else {
          this.rimGlow = new THREE.LineLoop(glowGeom, glowMat);
          this.spoolCenter.add(this.rimGlow);
        }
      } else if (this.rimGlow) {
        this.spoolCenter.remove(this.rimGlow);
        this.rimGlow = null;
      }
    }

    // Orientación: ángulo de reposo de tres cuartos + tilt de cursor
    this.spoolCenter.rotation.x = this.baseRotX + tiltX;
    this.spoolCenter.rotation.y = this.baseRotY + tiltY;

    // Giro sobre el eje axial (Z)
    this.frontFlange.rotation.z = spinAngle;
    this.backFlange.rotation.z = spinAngle;
    this.coreMesh.rotation.z = spinAngle;
    if (this.filamentMesh) {
      this.filamentMesh.rotation.z = spinAngle;
    }
  }

  public dispose() {
    // Los recursos compartidos pertenecen al SpoolResourcePool y NO se destruyen por instancia.
    if (this.filamentMesh) {
      this.spoolCenter.remove(this.filamentMesh);
      this.filamentMesh = null;
    }
    if (this.rimGlow) {
      this.spoolCenter.remove(this.rimGlow);
      this.rimGlow = null;
    }
  }
}
