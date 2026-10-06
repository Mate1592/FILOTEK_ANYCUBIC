import * as THREE from 'three';
import type { Finish } from '../../shared/types';
import type { StockLevel } from '../../lib/roll';
import {
  SPOOL_CONSTANTS,
  getFlangeGeometry,
  getCoreGeometry,
  getContactShadowGeometry,
  createFilamentGeometry,
} from './geometries';
import {
  getPlasticMaterial,
  getCoreMaterial,
  getShadowMaterial,
  createFilamentMaterial,
} from './materials';

export class SpoolObject extends THREE.Group {
  private frontFlange: THREE.Mesh;
  private backFlange: THREE.Mesh;
  private coreMesh: THREE.Mesh;
  private filamentMesh: THREE.Mesh | null = null;
  private shadowMesh: THREE.Mesh;
  private rimGlow: THREE.LineLoop | null = null;
  private spoolCenter: THREE.Group;

  private currentColor: string = '';
  private currentFinish: Finish = 'glossy';
  private currentFraction: number = -1;
  private currentLevel: StockLevel = 'ok';

  // Base three-quarters resting angle
  public baseRotX = THREE.MathUtils.degToRad(10);
  public baseRotY = THREE.MathUtils.degToRad(32);

  constructor() {
    super();

    this.spoolCenter = new THREE.Group();
    this.add(this.spoolCenter);

    const { WIDTH, FLANGE_THICKNESS, R_MAX } = SPOOL_CONSTANTS;
    const flangeGeom = getFlangeGeometry();
    const plasticMat = getPlasticMaterial();

    // Disco frontal
    this.frontFlange = new THREE.Mesh(flangeGeom, plasticMat);
    this.frontFlange.position.z = WIDTH / 2 + FLANGE_THICKNESS / 2;
    this.spoolCenter.add(this.frontFlange);

    // Disco trasero
    this.backFlange = new THREE.Mesh(flangeGeom, plasticMat);
    this.backFlange.position.z = -(WIDTH / 2 + FLANGE_THICKNESS / 2);
    this.spoolCenter.add(this.backFlange);

    // Núcleo cilíndrico de cartón
    const coreGeom = getCoreGeometry();
    const coreMat = getCoreMaterial();
    this.coreMesh = new THREE.Mesh(coreGeom, coreMat);
    this.spoolCenter.add(this.coreMesh);

    // Sombra de contacto en el plano inferior
    const shadowGeom = getContactShadowGeometry();
    const shadowMat = getShadowMaterial();
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
    glowPulse: number = 1.0,
  ) {
    const { R_CORE, R_MAX } = SPOOL_CONSTANTS;
    const f = Math.max(0, Math.min(1, fraction));

    // Si cambió el material o color
    if (colorHex !== this.currentColor || finish !== this.currentFinish) {
      this.currentColor = colorHex;
      this.currentFinish = finish;
      if (this.filamentMesh) {
        if (Array.isArray(this.filamentMesh.material)) {
          this.filamentMesh.material.forEach((m) => m.dispose());
        } else {
          this.filamentMesh.material.dispose();
        }
        this.filamentMesh.material = createFilamentMaterial(colorHex, finish);
      }
    }

    // Si cambió la fracción restante, recalcular la geometría de bobinado
    if (Math.abs(f - this.currentFraction) > 0.003 || !this.filamentMesh) {
      this.currentFraction = f;

      if (this.filamentMesh) {
        this.spoolCenter.remove(this.filamentMesh);
        this.filamentMesh.geometry.dispose();
        this.filamentMesh = null;
      }

      // Si no está agotado, construir la capa de filamento
      if (f > 0.005 && level !== 'empty') {
        // Cálculo cuadrático del radio: R = sqrt(r_core² + f*(R_max² - r_core²))
        const rFill = Math.sqrt(R_CORE * R_CORE + f * (R_MAX * 0.95 * R_MAX * 0.95 - R_CORE * R_CORE));
        const filGeom = createFilamentGeometry(Math.max(rFill, R_CORE + 0.015));
        const filMat = createFilamentMaterial(this.currentColor, this.currentFinish);
        this.filamentMesh = new THREE.Mesh(filGeom, filMat);
        this.spoolCenter.add(this.filamentMesh);
      }
    }

    // Gestionar el anillo de resplandor para bajo stock / crítico
    if (level !== this.currentLevel) {
      this.currentLevel = level;
      if (this.rimGlow) {
        this.spoolCenter.remove(this.rimGlow);
        this.rimGlow.geometry.dispose();
        (this.rimGlow.material as THREE.Material).dispose();
        this.rimGlow = null;
      }

      if (level === 'low' || level === 'critical') {
        const glowColor = level === 'critical' ? 0xff4d36 : 0xf5a623;
        const pts: THREE.Vector3[] = [];
        const segs = 48;
        for (let i = 0; i < segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * (R_MAX + 0.02), Math.sin(a) * (R_MAX + 0.02), SPOOL_CONSTANTS.WIDTH / 2 + 0.02));
        }
        const glowGeom = new THREE.BufferGeometry().setFromPoints(pts);
        const glowMat = new THREE.LineBasicMaterial({
          color: glowColor,
          linewidth: 2,
          transparent: true,
          opacity: 0.8,
        });
        this.rimGlow = new THREE.LineLoop(glowGeom, glowMat);
        this.spoolCenter.add(this.rimGlow);
      }
    }

    if (this.rimGlow) {
      (this.rimGlow.material as THREE.LineBasicMaterial).opacity = 0.4 + 0.5 * glowPulse;
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
    if (this.filamentMesh) {
      this.filamentMesh.geometry.dispose();
      if (Array.isArray(this.filamentMesh.material)) {
        this.filamentMesh.material.forEach((m) => m.dispose());
      } else {
        this.filamentMesh.material.dispose();
      }
    }
    if (this.rimGlow) {
      this.rimGlow.geometry.dispose();
      (this.rimGlow.material as THREE.Material).dispose();
    }
  }
}
