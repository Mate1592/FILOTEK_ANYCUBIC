import * as THREE from 'three';

export const SPOOL_CONSTANTS = {
  R_MAX: 1.0, // Radio exterior del disco lateral
  R_CORE: 0.40, // Radio del núcleo de cartón kraft
  R_HUB: 0.20, // Buje / collar central sólido reducido para máxima visibilidad del núcleo y bobinado
  R_HOLE: 0.15, // Agujero para portabobinas
  WIDTH: 0.48, // Distancia entre discos laterales (ancho del bobinado)
  FLANGE_THICKNESS: 0.034, // Grosor del disco de plástico
};

let cachedFlangeGeometry: THREE.BufferGeometry | null = null;
let cachedCoreGeometry: THREE.BufferGeometry | null = null;
let cachedContactShadowGeometry: THREE.BufferGeometry | null = null;

/**
 * Geometría de disco lateral con celosía hexagonal (panal / honeycomb)
 * inspirada en carretes ligeros reutilizables (Bambu Lab / MasterSpool).
 * Permite apreciar nítidamente el bobinado interior y el espacio restante
 * tanto en temas claros como en temas oscuros / modo nocturno.
 */
export function getFlangeGeometry(): THREE.BufferGeometry {
  if (cachedFlangeGeometry) return cachedFlangeGeometry;

  const { R_MAX, R_HOLE, FLANGE_THICKNESS } = SPOOL_CONSTANTS;
  const shape = new THREE.Shape();

  // Contorno exterior circular del disco
  shape.absarc(0, 0, R_MAX, 0, Math.PI * 2, false);

  // Agujero central para el eje portabobinas de la impresora
  const centerHole = new THREE.Path();
  centerHole.absarc(0, 0, R_HOLE, 0, Math.PI * 2, true);
  shape.holes.push(centerHole);

  // Red de celdas hexagonales (Honeycomb lattice) con paredes delgadas y área abierta maximizada
  const hexRadius = 0.078;
  const wallThickness = 0.007; // Paredes muy finas para máxima visibilidad del color del filamento
  const holeRadius = hexRadius - wallThickness / 2;

  const dx = Math.sqrt(3) * hexRadius; // Paso horizontal
  const dy = 1.5 * hexRadius; // Paso vertical
  const rIn = 0.21; // Collar central fino pegado al agujero portabobinas (0.15)
  const rOut = R_MAX - 0.024; // Borde circular exterior estrecho (panal hasta casi el borde exterior)

  const maxI = Math.ceil(R_MAX / dy);
  const maxJ = Math.ceil(R_MAX / dx) + 1;

  for (let row = -maxI; row <= maxI; row++) {
    const cy = row * dy;
    const xOffset = Math.abs(row) % 2 === 1 ? dx / 2 : 0;

    for (let col = -maxJ; col <= maxJ; col++) {
      const cx = col * dx + xOffset;
      const distCenter = Math.sqrt(cx * cx + cy * cy);

      // Descarte rápido fuera del anillo anular
      if (distCenter > rOut + hexRadius || distCenter < rIn - hexRadius) continue;

      // Calcular los 6 vértices del hexágono regular
      let allInside = true;
      const vertices: { x: number; y: number }[] = [];

      for (let k = 0; k < 6; k++) {
        const angle = (k * Math.PI) / 3 + Math.PI / 6;
        const vx = cx + holeRadius * Math.cos(angle);
        const vy = cy + holeRadius * Math.sin(angle);
        const rV = Math.sqrt(vx * vx + vy * vy);

        if (rV < rIn || rV > rOut) {
          allInside = false;
          break;
        }
        vertices.push({ x: vx, y: vy });
      }

      // Si todos los vértices están dentro de la corona, crear el orificio hexagonal
      if (allInside && vertices.length === 6) {
        const hexPath = new THREE.Path();
        hexPath.moveTo(vertices[0].x, vertices[0].y);
        for (let k = 1; k < 6; k++) {
          hexPath.lineTo(vertices[k].x, vertices[k].y);
        }
        hexPath.closePath();
        shape.holes.push(hexPath);
      }
    }
  }

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: FLANGE_THICKNESS,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 24,
  };

  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geom.center(); // Centrar en Z para posicionamiento exacto
  cachedFlangeGeometry = geom;
  return geom;
}

/** Geometría del cilindro central de cartón kraft */
export function getCoreGeometry(): THREE.BufferGeometry {
  if (cachedCoreGeometry) return cachedCoreGeometry;

  const { R_CORE, WIDTH } = SPOOL_CONSTANTS;
  const geom = new THREE.CylinderGeometry(R_CORE, R_CORE, WIDTH, 32, 1, true);
  // Rotar el cilindro para que el eje axial coincida con Z
  geom.rotateX(Math.PI / 2);
  cachedCoreGeometry = geom;
  return geom;
}

/** Plano para sombra de contacto en el piso */
export function getContactShadowGeometry(): THREE.BufferGeometry {
  if (cachedContactShadowGeometry) return cachedContactShadowGeometry;
  const geom = new THREE.PlaneGeometry(2.4, 2.4);
  geom.rotateX(-Math.PI / 2);
  cachedContactShadowGeometry = geom;
  return geom;
}

/**
 * Genera la geometría del cilindro anular de filamento según el radio exterior actual.
 * El radio exterior se calcula por volumen cuadrático.
 */
export function createFilamentGeometry(rFill: number): THREE.BufferGeometry {
  const { R_CORE, WIDTH } = SPOOL_CONSTANTS;
  const segments = 32;
  const halfW = WIDTH * 0.495; // Ligeramente menor para no solapar con los discos

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Anillo exterior (superficie del bobinado visible)
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    // Vértice frontal
    positions.push(cos * rFill, sin * rFill, halfW);
    normals.push(cos, sin, 0);
    uvs.push(i / segments, 1);

    // Vértice trasero
    positions.push(cos * rFill, sin * rFill, -halfW);
    normals.push(cos, sin, 0);
    uvs.push(i / segments, 0);
  }

  for (let i = 0; i < segments; i++) {
    const i2 = i * 2;
    indices.push(i2, i2 + 1, i2 + 2);
    indices.push(i2 + 1, i2 + 3, i2 + 2);
  }

  // Caras laterales visibles a través de las ventanas de los discos (Z = halfW y Z = -halfW)
  const offsetFront = positions.length / 3;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    // Borde exterior
    positions.push(cos * rFill, sin * rFill, halfW);
    normals.push(0, 0, 1);
    uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);

    // Borde interior
    positions.push(cos * R_CORE, sin * R_CORE, halfW);
    normals.push(0, 0, 1);
    uvs.push(0.5 + cos * 0.5 * (R_CORE / rFill), 0.5 + sin * 0.5 * (R_CORE / rFill));
  }

  for (let i = 0; i < segments; i++) {
    const i2 = offsetFront + i * 2;
    indices.push(i2, i2 + 2, i2 + 1);
    indices.push(i2 + 1, i2 + 2, i2 + 3);
  }

  // Cara trasera
  const offsetBack = positions.length / 3;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    positions.push(cos * rFill, sin * rFill, -halfW);
    normals.push(0, 0, -1);
    uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);

    positions.push(cos * R_CORE, sin * R_CORE, -halfW);
    normals.push(0, 0, -1);
    uvs.push(0.5 + cos * 0.5 * (R_CORE / rFill), 0.5 + sin * 0.5 * (R_CORE / rFill));
  }

  for (let i = 0; i < segments; i++) {
    const i2 = offsetBack + i * 2;
    indices.push(i2, i2 + 1, i2 + 2);
    indices.push(i2 + 1, i2 + 3, i2 + 2);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}

/** Textura suave para sombra de contacto en el piso */
let contactShadowTexture: THREE.CanvasTexture | null = null;
export function getContactShadowTexture(): THREE.CanvasTexture {
  if (contactShadowTexture) return contactShadowTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.3)');
  grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.08)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  contactShadowTexture = new THREE.CanvasTexture(canvas);
  return contactShadowTexture;
}
