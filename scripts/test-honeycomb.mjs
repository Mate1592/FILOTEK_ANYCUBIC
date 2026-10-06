import * as THREE from 'three';

const R_MAX = 1.0;
const R_HOLE = 0.15;
const R_HUB = 0.44;
const FLANGE_THICKNESS = 0.034;

function createHoneycombFlange() {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, R_MAX, 0, Math.PI * 2, false);

  const centerHole = new THREE.Path();
  centerHole.absarc(0, 0, R_HOLE, 0, Math.PI * 2, true);
  shape.holes.push(centerHole);

  const hexRadius = 0.086;
  const wallThickness = 0.009; // Thinner walls!
  const holeRadius = hexRadius - wallThickness / 2;

  const dx = Math.sqrt(3) * hexRadius;
  const dy = 1.5 * hexRadius;
  const rIn = R_HUB + 0.012;
  const rOut = R_MAX - 0.055;

  let hexCount = 0;
  const maxI = Math.ceil(R_MAX / dy);
  const maxJ = Math.ceil(R_MAX / dx) + 1;

  for (let row = -maxI; row <= maxI; row++) {
    const cy = row * dy;
    const xOffset = Math.abs(row) % 2 === 1 ? dx / 2 : 0;
    for (let col = -maxJ; col <= maxJ; col++) {
      const cx = col * dx + xOffset;
      const distCenter = Math.sqrt(cx * cx + cy * cy);
      if (distCenter > rOut + hexRadius || distCenter < rIn - hexRadius) continue;

      if (Math.abs(cx) < 0.16 && cy > 0.56 && cy < 0.86) continue;
      if (Math.abs(cx) < 0.13 && cy < -0.62 && cy > -0.86) continue;

      let allInside = true;
      const vertices = [];
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
      if (allInside && vertices.length === 6) {
        const hexPath = new THREE.Path();
        hexPath.moveTo(vertices[0].x, vertices[0].y);
        for (let k = 1; k < 6; k++) {
          hexPath.lineTo(vertices[k].x, vertices[k].y);
        }
        hexPath.closePath();
        shape.holes.push(hexPath);
        hexCount++;
      }
    }
  }

  console.log(`Generated ${hexCount} honeycomb holes with wallThickness=${wallThickness}.`);

  const extrudeSettings = {
    depth: FLANGE_THICKNESS,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.0035,
    bevelThickness: 0.0035,
    curveSegments: 36,
  };

  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geom.center();
  console.log('Geometry vertices:', geom.attributes.position.count);
  return geom;
}

const geom = createHoneycombFlange();
console.log('Success! Honeycomb flange generated cleanly.');
