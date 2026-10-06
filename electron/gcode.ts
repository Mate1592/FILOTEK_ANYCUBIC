import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { GcodeJob, Roll } from '../src/shared/types';
import { parseGcodeText } from '../src/lib/gcodeParser';

/** Extrae texto de un buffer, soportando ZIP/3MF de forma nativa sin dependencias */
export function extractGcodeText(buf: Buffer): string {
  // Verificamos si empieza por firma ZIP PK\x03\x04
  if (buf.length > 30 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    let offset = 0;
    while (offset < buf.length - 30) {
      if (buf[offset] === 0x50 && buf[offset + 1] === 0x4b && buf[offset + 2] === 0x03 && buf[offset + 3] === 0x04) {
        const method = buf.readUInt16LE(offset + 8);
        const compSize = buf.readUInt32LE(offset + 18);
        const nameLen = buf.readUInt16LE(offset + 26);
        const extraLen = buf.readUInt16LE(offset + 28);
        const fileName = buf.toString('utf8', offset + 30, offset + 30 + nameLen);
        const dataStart = offset + 30 + nameLen + extraLen;

        const isGcode =
          fileName.toLowerCase().endsWith('.gcode') ||
          fileName.toLowerCase().endsWith('.gcode.metadata') ||
          fileName.toLowerCase().includes('plate_') ||
          fileName.toLowerCase().includes('metadata/');

        if (isGcode && dataStart + compSize <= buf.length) {
          const slice = buf.subarray(dataStart, dataStart + compSize);
          try {
            if (method === 0) return slice.toString('utf8');
            if (method === 8) return zlib.inflateRawSync(slice).toString('utf8');
          } catch {
            // Continúa buscando
          }
        }
        offset = dataStart + compSize;
      } else {
        offset++;
      }
    }
  }
  return buf.toString('utf8');
}

/**
 * Lee de forma segura un archivo .metadata o .gcode desde el disco.
 * Para archivos .gcode grandes, lee únicamente los primeros 64 KB y los últimos 64 KB.
 */
export function safeReadGcodeFile(filePath: string): string {
  // 1. Si existe un .metadata al lado, preferirlo siempre
  if (!filePath.toLowerCase().endsWith('.metadata')) {
    const metaCandidate = `${filePath}.metadata`;
    if (fs.existsSync(metaCandidate)) {
      return fs.readFileSync(metaCandidate, 'utf8');
    }
  }

  const stat = fs.statSync(filePath);
  // Si es menor a 150 KB, leer completo
  if (stat.size <= 150 * 1024) {
    const buf = fs.readFileSync(filePath);
    return extractGcodeText(buf);
  }

  // Si es un archivo ZIP / 3MF, intentar leer completo si no excede 20 MB
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    if (header[0] === 0x50 && header[1] === 0x4b) {
      // Es un archivo ZIP / 3MF
      const fullBuf = fs.readFileSync(filePath);
      return extractGcodeText(fullBuf);
    }

    // Es un G-code plano grande: leemos 64 KB del inicio y 64 KB del final
    const CHUNK_SIZE = 64 * 1024;
    const headBuf = Buffer.alloc(CHUNK_SIZE);
    const headBytes = fs.readSync(fd, headBuf, 0, CHUNK_SIZE, 0);

    const tailPos = Math.max(0, stat.size - CHUNK_SIZE);
    const tailBuf = Buffer.alloc(CHUNK_SIZE);
    const tailBytes = fs.readSync(fd, tailBuf, 0, CHUNK_SIZE, tailPos);

    return headBuf.subarray(0, headBytes).toString('utf8') + '\n\n' + tailBuf.subarray(0, tailBytes).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Parsea un archivo de Anycubic Slicer Next desde el disco,
 * extrae y guarda miniaturas como archivos PNG en thumbnails/ (no en base64 en la BD)
 * y retorna el GcodeJob completo.
 */
export function parseGcodeFileFromDisk(
  filePath: string,
  thumbnailsDir?: string,
  rolls: Roll[] = [],
  savedMappings?: Record<string, string>,
): GcodeJob | null {
  try {
    if (!fs.existsSync(filePath)) return null;

    // Si pasaron un archivo .gcode y existe su .metadata correspondiente, usar el .metadata
    let targetPath = filePath;
    if (!filePath.toLowerCase().endsWith('.metadata')) {
      const cand = `${filePath}.metadata`;
      if (fs.existsSync(cand)) {
        targetPath = cand;
      }
    }

    const content = safeReadGcodeFile(targetPath);
    const filename = path.basename(filePath);
    const job = parseGcodeText(content, filename, filePath, rolls, savedMappings);
    if (!job) return null;

    // Guardar miniaturas en disco si se configuró carpeta de datos
    if (thumbnailsDir) {
      if (!fs.existsSync(thumbnailsDir)) {
        fs.mkdirSync(thumbnailsDir, { recursive: true });
      }

      // Guardar miniatura pequeña (260x260)
      if (job.thumbnailSmallPath && job.thumbnailSmallPath.startsWith('data:image/png;base64,')) {
        const b64 = job.thumbnailSmallPath.replace('data:image/png;base64,', '');
        const p260 = path.join(thumbnailsDir, `${job.id}_260.png`);
        fs.writeFileSync(p260, Buffer.from(b64, 'base64'));
        job.thumbnailSmallPath = p260;
      } else {
        // Fallback a archivos plate_N.png o plate_N_small.png en el mismo directorio si existen
        const dir = path.dirname(targetPath);
        const fallbackCand = path.join(dir, `plate_${job.plateIndex}_small.png`);
        const fallbackCand2 = path.join(dir, `plate_${job.plateIndex}.png`);
        if (fs.existsSync(fallbackCand)) {
          const dest = path.join(thumbnailsDir, `${job.id}_260.png`);
          fs.copyFileSync(fallbackCand, dest);
          job.thumbnailSmallPath = dest;
        } else if (fs.existsSync(fallbackCand2)) {
          const dest = path.join(thumbnailsDir, `${job.id}_260.png`);
          fs.copyFileSync(fallbackCand2, dest);
          job.thumbnailSmallPath = dest;
        }
      }

      // Guardar miniatura grande (512x512)
      if (job.thumbnailLargePath && job.thumbnailLargePath.startsWith('data:image/png;base64,')) {
        const b64 = job.thumbnailLargePath.replace('data:image/png;base64,', '');
        const p512 = path.join(thumbnailsDir, `${job.id}_512.png`);
        fs.writeFileSync(p512, Buffer.from(b64, 'base64'));
        job.thumbnailLargePath = p512;
      } else {
        const dir = path.dirname(targetPath);
        const fallbackTop = path.join(dir, `top_${job.plateIndex}.png`);
        const fallbackPlate = path.join(dir, `plate_${job.plateIndex}.png`);
        if (fs.existsSync(fallbackTop)) {
          const dest = path.join(thumbnailsDir, `${job.id}_512.png`);
          fs.copyFileSync(fallbackTop, dest);
          job.thumbnailLargePath = dest;
        } else if (fs.existsSync(fallbackPlate)) {
          const dest = path.join(thumbnailsDir, `${job.id}_512.png`);
          fs.copyFileSync(fallbackPlate, dest);
          job.thumbnailLargePath = dest;
        }
      }
    }

    return job;
  } catch (err) {
    console.error('[gcode] Error parseando archivo en disco:', filePath, err);
    return null;
  }
}
