import * as THREE from 'three';

let cachedWindingCanvas: HTMLCanvasElement | null = null;
let cachedGlitterCanvas: HTMLCanvasElement | null = null;
let windingNormalMap: THREE.CanvasTexture | null = null;
let glitterNormalMap: THREE.CanvasTexture | null = null;

/** Genera y cachea globalmente el canvas 2D del mapa de relieve de bobinado */
export function getWindingNormalCanvas(): HTMLCanvasElement {
  if (cachedWindingCanvas) return cachedWindingCanvas;

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

  cachedWindingCanvas = canvas;
  return canvas;
}

/** Genera y cachea globalmente el canvas 2D de ruido glitter */
export function getGlitterCanvas(): HTMLCanvasElement {
  if (cachedGlitterCanvas) return cachedGlitterCanvas;

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
  cachedGlitterCanvas = canvas;
  return canvas;
}

/** Crea una instancia aislada de CanvasTexture para el mapa de bobinado */
export function createWindingNormalTexture(): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(getWindingNormalCanvas());
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  return tex;
}

/** Crea una instancia aislada de CanvasTexture para acabado glitter */
export function createGlitterTexture(): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(getGlitterCanvas());
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/** Genera un mapa de relieve procedural con líneas de bobinado finas y paralelas */
export function getWindingNormalTexture(): THREE.CanvasTexture {
  if (windingNormalMap) return windingNormalMap;
  windingNormalMap = createWindingNormalTexture();
  return windingNormalMap;
}

/** Mapa de ruido con partículas brillantes para acabado glitter */
export function getGlitterTexture(): THREE.CanvasTexture {
  if (glitterNormalMap) return glitterNormalMap;
  glitterNormalMap = createGlitterTexture();
  return glitterNormalMap;
}
