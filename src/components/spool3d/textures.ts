import * as THREE from 'three';

let windingNormalMap: THREE.CanvasTexture | null = null;
let glitterNormalMap: THREE.CanvasTexture | null = null;

/** Genera un mapa de relieve procedural con líneas de bobinado finas y paralelas */
export function getWindingNormalTexture(): THREE.CanvasTexture {
  if (windingNormalMap) return windingNormalMap;

  const width = 512;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgb(128, 128, 255)'; // Normal plana (0, 0, 1)
  ctx.fillRect(0, 0, width, height);

  // Líneas horizontales de relieve para representar hebras de filamento enrolladas
  const strandCount = 72;
  const strandHeight = height / strandCount;

  for (let i = 0; i < strandCount; i++) {
    const y = i * strandHeight;
    const grad = ctx.createLinearGradient(0, y, 0, y + strandHeight);
    grad.addColorStop(0, 'rgb(128, 60, 240)'); // Vector normal apuntando arriba
    grad.addColorStop(0.5, 'rgb(128, 128, 255)'); // Centro plano
    grad.addColorStop(1, 'rgb(128, 195, 240)'); // Vector normal apuntando abajo

    ctx.fillStyle = grad;
    ctx.fillRect(0, y, width, strandHeight);
  }

  windingNormalMap = new THREE.CanvasTexture(canvas);
  windingNormalMap.wrapS = THREE.RepeatWrapping;
  windingNormalMap.wrapT = THREE.RepeatWrapping;
  windingNormalMap.repeat.set(1, 4);
  return windingNormalMap;
}

/** Mapa de ruido con partículas brillantes para acabado glitter */
export function getGlitterTexture(): THREE.CanvasTexture {
  if (glitterNormalMap) return glitterNormalMap;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  for (let i = 0; i < size * size; i++) {
    if (Math.random() > 0.88) {
      const idx = i * 4;
      const nx = Math.floor(Math.random() * 255);
      const ny = Math.floor(Math.random() * 255);
      data[idx] = nx;
      data[idx + 1] = ny;
      data[idx + 2] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  glitterNormalMap = new THREE.CanvasTexture(canvas);
  glitterNormalMap.wrapS = THREE.RepeatWrapping;
  glitterNormalMap.wrapT = THREE.RepeatWrapping;
  glitterNormalMap.repeat.set(3, 3);
  return glitterNormalMap;
}
