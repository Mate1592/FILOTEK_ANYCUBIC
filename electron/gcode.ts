import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { GcodeJob, Roll } from '../src/shared/types';
import { cleanModelName, formatJobName, parseGcodeText } from '../src/lib/gcodeParser';

const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024; // 150 MB

export interface ZipCdEntry {
  fileName: string;
  method: number;
  compSize: number;
  uncompSize: number;
  localHeaderOffset: number;
}

export interface Extracted3mfPlate {
  plateIndex: number;
  text: string;
  sliceInfoXml?: string;
  plateJson?: string;
  thumbnailBuf?: Buffer;
  thumbnailLargeBuf?: Buffer;
}

function findZipEocd(buf: Buffer): number {
  if (buf.length < 22) return -1;
  const minPos = Math.max(0, buf.length - 22 - 65535);
  let fallbackPos = -1;
  for (let pos = buf.length - 22; pos >= minPos; pos--) {
    if (buf.readUInt32LE(pos) === 0x06054b50) {
      const commentLen = buf.readUInt16LE(pos + 20);
      if (pos + 22 + commentLen === buf.length) {
        return pos;
      }
      if (fallbackPos === -1 && pos + 22 + commentLen <= buf.length) {
        fallbackPos = pos;
      }
    }
  }
  return fallbackPos;
}

/** Lee el Directorio Central de un archivo ZIP/3MF sin dependencias externas */
export function readZipCentralDirectory(buf: Buffer): ZipCdEntry[] {
  const eocdPos = findZipEocd(buf);
  if (eocdPos < 0) return [];

  let totalEntries = buf.readUInt16LE(eocdPos + 10);
  let cdSize = buf.readUInt32LE(eocdPos + 12);
  let cdOffset = buf.readUInt32LE(eocdPos + 16);

  // Soporte básico de ZIP64 EOCD Locator (0x07064b50) y EOCD64 (0x06064b50)
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || totalEntries === 0xffff) {
    const locPos = eocdPos - 20;
    if (locPos >= 0 && buf.readUInt32LE(locPos) === 0x07064b50) {
      const eocd64Pos = Number(buf.readBigUInt64LE(locPos + 8));
      if (
        Number.isSafeInteger(eocd64Pos) &&
        eocd64Pos >= 0 &&
        eocd64Pos + 56 <= buf.length &&
        buf.readUInt32LE(eocd64Pos) === 0x06064b50
      ) {
        totalEntries = Number(buf.readBigUInt64LE(eocd64Pos + 32));
        cdSize = Number(buf.readBigUInt64LE(eocd64Pos + 40));
        cdOffset = Number(buf.readBigUInt64LE(eocd64Pos + 48));
      }
    }
  }

  if (!Number.isSafeInteger(cdOffset) || cdOffset < 0 || cdOffset >= buf.length) {
    return [];
  }

  const entries: ZipCdEntry[] = [];
  let cursor = cdOffset;
  const maxCursor = Number.isSafeInteger(cdSize) && cdSize > 0 ? Math.min(buf.length, cdOffset + cdSize) : buf.length;

  for (let i = 0; i < totalEntries && cursor + 46 <= maxCursor; i++) {
    if (buf.readUInt32LE(cursor) !== 0x02014b50) break;

    const flags = buf.readUInt16LE(cursor + 8);
    const method = buf.readUInt16LE(cursor + 10);
    let compSize = buf.readUInt32LE(cursor + 20);
    let uncompSize = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    let localHeaderOffset = buf.readUInt32LE(cursor + 42);

    const nextCursor = cursor + 46 + nameLen + extraLen + commentLen;
    if (nextCursor > buf.length) break;

    // Resolver campos ZIP64 en Extra Field (ID 0x0001) si aplica
    if (uncompSize === 0xffffffff || compSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      let exPos = cursor + 46 + nameLen;
      const exEnd = exPos + extraLen;
      while (exPos + 4 <= exEnd) {
        const headerId = buf.readUInt16LE(exPos);
        const dataSize = buf.readUInt16LE(exPos + 2);
        const dataStart = exPos + 4;
        if (headerId === 0x0001 && dataStart + dataSize <= exEnd) {
          let fieldPtr = dataStart;
          if (uncompSize === 0xffffffff && fieldPtr + 8 <= dataStart + dataSize) {
            uncompSize = Number(buf.readBigUInt64LE(fieldPtr));
            fieldPtr += 8;
          }
          if (compSize === 0xffffffff && fieldPtr + 8 <= dataStart + dataSize) {
            compSize = Number(buf.readBigUInt64LE(fieldPtr));
            fieldPtr += 8;
          }
          if (localHeaderOffset === 0xffffffff && fieldPtr + 8 <= dataStart + dataSize) {
            localHeaderOffset = Number(buf.readBigUInt64LE(fieldPtr));
          }
          break;
        }
        exPos += 4 + dataSize;
      }
    }

    const encoding = flags & 0x0800 ? 'utf8' : 'latin1';
    const fileName = buf.toString(encoding, cursor + 46, cursor + 46 + nameLen).replace(/\\/g, '/');
    entries.push({
      fileName,
      method,
      compSize,
      uncompSize,
      localHeaderOffset,
    });

    cursor = nextCursor;
  }

  return entries;
}

/** Extrae e infla una entrada específica usando el offset del Directorio Central */
export function extractZipEntry(buf: Buffer, entry: ZipCdEntry): Buffer | null {
  const off = entry.localHeaderOffset;
  if (!Number.isSafeInteger(off) || off < 0 || off + 30 > buf.length) return null;
  if (buf.readUInt32LE(off) !== 0x04034b50) return null;

  const lNameLen = buf.readUInt16LE(off + 26);
  const lExtraLen = buf.readUInt16LE(off + 28);
  const dataStart = off + 30 + lNameLen + lExtraLen;
  const dataEnd = dataStart + entry.compSize;

  if (dataStart < 0 || dataEnd < dataStart || dataEnd > buf.length) return null;

  const raw = buf.subarray(dataStart, dataEnd);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) {
    try {
      return zlib.inflateRawSync(raw, { maxOutputLength: 200 * 1024 * 1024 });
    } catch {
      return null;
    }
  }
  return null;
}

interface SliceInfoPlate {
  index: number;
  prediction?: number;
  thumbnailFile?: string;
  topFile?: string;
  objectNames: string[];
}

function parseSliceInfoXml(xml: string): Map<number, SliceInfoPlate> {
  const map = new Map<number, SliceInfoPlate>();
  if (!xml) return map;

  const plateRx = /<plate\b[^>]*>([\s\S]*?)<\/plate>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = plateRx.exec(xml)) !== null) {
    const block = pm[1];
    const metaMap: Record<string, string> = {};
    const metaRx = /<metadata\b([^>]*)\/?>/gi;
    let mm: RegExpExecArray | null;
    while ((mm = metaRx.exec(block)) !== null) {
      const attrs = mm[1];
      const keyM = attrs.match(/\bkey\s*=\s*["']([^"']+)["']/i);
      const valM = attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i);
      if (keyM && valM) {
        metaMap[keyM[1].toLowerCase()] = valM[1];
      }
    }

    const plateIdx = metaMap.index && /^\d+$/.test(metaMap.index) ? parseInt(metaMap.index, 10) : map.size + 1;
    const prediction =
      metaMap.prediction && /^\d+$/.test(metaMap.prediction) ? parseInt(metaMap.prediction, 10) : undefined;
    const thumbFile = metaMap.thumbnail_file || undefined;
    const topFile = metaMap.top_file || undefined;

    const objectNames: string[] = [];
    const objRx = /<object\b([^>]*)\/?>/gi;
    let om: RegExpExecArray | null;
    while ((om = objRx.exec(block)) !== null) {
      const attrs = om[1];
      if (/skipped\s*=\s*"true"/i.test(attrs)) continue;
      const nameM = attrs.match(/\bname\s*=\s*"([^"]+)"/i);
      if (nameM && nameM[1]) {
        const cleaned = cleanModelName(nameM[1]);
        if (cleaned && !objectNames.includes(cleaned)) {
          objectNames.push(cleaned);
        }
      }
    }

    map.set(plateIdx, {
      index: plateIdx,
      prediction,
      thumbnailFile: thumbFile?.replace(/\\/g, '/').replace(/^\/+/, ''),
      topFile: topFile?.replace(/\\/g, '/').replace(/^\/+/, ''),
      objectNames,
    });
  }
  return map;
}

/** Extrae todas las placas laminadas de un archivo .3mf usando el Directorio Central */
export function extractGcodePlatesFrom3mf(buf: Buffer): Extracted3mfPlate[] {
  const entries = readZipCentralDirectory(buf);
  if (entries.length === 0) return [];

  const byLowerName = new Map<string, ZipCdEntry>();
  for (const entry of entries) {
    byLowerName.set(entry.fileName.toLowerCase(), entry);
  }

  const sliceInfoEntry = byLowerName.get('metadata/slice_info.config');
  const sliceInfoBuf = sliceInfoEntry ? extractZipEntry(buf, sliceInfoEntry) : null;
  const sliceInfoXml = sliceInfoBuf ? sliceInfoBuf.toString('utf8') : undefined;
  const sliceInfoMap = sliceInfoXml ? parseSliceInfoXml(sliceInfoXml) : new Map<number, SliceInfoPlate>();

  const plateByIndex = new Map<number, { plateIndex: number; entry: ZipCdEntry; isMeta: boolean }>();
  for (const entry of entries) {
    const lower = entry.fileName.toLowerCase();
    if (lower.startsWith('__macosx/')) continue;
    const m = lower.match(/^metadata\/plate_(\d+)\.gcode(\.metadata)?$/i);
    if (m) {
      const plateIndex = parseInt(m[1], 10);
      const isMeta = Boolean(m[2]);
      const existing = plateByIndex.get(plateIndex);
      if (!existing || (isMeta && !existing.isMeta)) {
        plateByIndex.set(plateIndex, { plateIndex, entry, isMeta });
      }
    }
  }
  const plateCandidates: Array<{ plateIndex: number; entry: ZipCdEntry }> = Array.from(plateByIndex.values()).map(
    ({ plateIndex, entry }) => ({ plateIndex, entry }),
  );

  // Fallback a cualquier .gcode / .gcode.metadata si no sigue metadata/plate_N.gcode
  if (plateCandidates.length === 0) {
    const fallbackByIndex = new Map<number, { plateIndex: number; entry: ZipCdEntry; isMeta: boolean }>();
    const fallbackEntries = entries
      .filter((e) => {
        const lower = e.fileName.toLowerCase();
        return !lower.startsWith('__macosx/') && (lower.endsWith('.gcode') || lower.endsWith('.gcode.metadata'));
      })
      .sort((a, b) => a.fileName.localeCompare(b.fileName));

    fallbackEntries.forEach((entry, idx) => {
      const lower = entry.fileName.toLowerCase();
      const m = entry.fileName.match(/plate_(\d+)/i);
      const plateIndex = m ? parseInt(m[1], 10) : idx + 1;
      const isMeta = lower.endsWith('.gcode.metadata');
      const existing = fallbackByIndex.get(plateIndex);
      if (!existing || (isMeta && !existing.isMeta)) {
        fallbackByIndex.set(plateIndex, { plateIndex, entry, isMeta });
      }
    });
    for (const { plateIndex, entry } of fallbackByIndex.values()) {
      plateCandidates.push({ plateIndex, entry });
    }
  }

  if (plateCandidates.length === 0) return [];

  plateCandidates.sort((a, b) => a.plateIndex - b.plateIndex);

  const results: Extracted3mfPlate[] = [];
  for (const cand of plateCandidates) {
    const gBuf = extractZipEntry(buf, cand.entry);
    if (!gBuf) continue;
    const text = gBuf.toString('utf8');

    const jsonEntry = byLowerName.get(`metadata/plate_${cand.plateIndex}.json`);
    const jsonBuf = jsonEntry ? extractZipEntry(buf, jsonEntry) : null;
    const plateJson = jsonBuf ? jsonBuf.toString('utf8') : undefined;

    const info = sliceInfoMap.get(cand.plateIndex);

    const smallEntry =
      byLowerName.get(`metadata/plate_${cand.plateIndex}_small.png`) ||
      (info?.thumbnailFile ? byLowerName.get(info.thumbnailFile.toLowerCase()) : undefined) ||
      byLowerName.get(`metadata/plate_${cand.plateIndex}.png`);
    const thumbnailBuf = smallEntry ? extractZipEntry(buf, smallEntry) ?? undefined : undefined;

    const largeEntry =
      byLowerName.get(`metadata/top_${cand.plateIndex}.png`) ||
      (info?.topFile ? byLowerName.get(info.topFile.toLowerCase()) : undefined) ||
      byLowerName.get(`metadata/plate_${cand.plateIndex}.png`);
    const thumbnailLargeBuf = largeEntry ? extractZipEntry(buf, largeEntry) ?? undefined : undefined;

    results.push({
      plateIndex: cand.plateIndex,
      text,
      sliceInfoXml,
      plateJson,
      thumbnailBuf,
      thumbnailLargeBuf,
    });
  }

  return results;
}

function isZipBuffer(buf: Buffer): boolean {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return true;
  }
  return findZipEocd(buf) >= 0;
}

/** Extrae texto de un buffer, soportando ZIP/3MF mediante Directorio Central sin dependencias */
export function extractGcodeText(buf: Buffer): string {
  if (isZipBuffer(buf)) {
    const plates = extractGcodePlatesFrom3mf(buf);
    return plates[0]?.text ?? '';
  }
  return buf.toString('utf8');
}

/**
 * Lee de forma segura un archivo .metadata, .3mf o .gcode desde el disco.
 * Para archivos .gcode planos grandes, lee los primeros 128 KB y los últimos 128 KB.
 */
export function safeReadGcodeFile(filePath: string): string {
  // 1. Si existe un .metadata al lado, preferirlo siempre
  if (!filePath.toLowerCase().endsWith('.metadata')) {
    const metaCandidate = `${filePath}.metadata`;
    if (fs.existsSync(metaCandidate)) {
      return fs.readFileSync(metaCandidate, 'utf8');
    }
  }

  const is3mfPath = filePath.toLowerCase().endsWith('.3mf');
  const stat = fs.statSync(filePath);
  if (stat.size <= 150 * 1024) {
    const buf = fs.readFileSync(filePath);
    if (is3mfPath && !isZipBuffer(buf)) return '';
    return extractGcodeText(buf);
  }

  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    if (is3mfPath || (header[0] === 0x50 && header[1] === 0x4b)) {
      if (stat.size > MAX_ARCHIVE_BYTES) {
        return '';
      }
      const fullBuf = fs.readFileSync(filePath);
      if (is3mfPath && !isZipBuffer(fullBuf)) return '';
      return extractGcodeText(fullBuf);
    }

    // Es un G-code plano grande: leemos 128 KB del inicio y 128 KB del final
    const CHUNK_SIZE = 128 * 1024;
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

function persistThumbnailsForJob(
  job: GcodeJob,
  targetPath: string,
  thumbnailsDir?: string,
  zipThumbSmall?: Buffer,
  zipThumbLarge?: Buffer,
): void {
  if (!thumbnailsDir) return;
  if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
  }

  // Miniatura pequeña (260x260)
  if (job.thumbnailSmallPath && job.thumbnailSmallPath.startsWith('data:image/png;base64,')) {
    const b64 = job.thumbnailSmallPath.replace('data:image/png;base64,', '');
    const p260 = path.join(thumbnailsDir, `${job.id}_260.png`);
    fs.writeFileSync(p260, Buffer.from(b64, 'base64'));
    job.thumbnailSmallPath = p260;
  } else if (zipThumbSmall && zipThumbSmall.length > 0) {
    const p260 = path.join(thumbnailsDir, `${job.id}_260.png`);
    fs.writeFileSync(p260, zipThumbSmall);
    job.thumbnailSmallPath = p260;
  } else {
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

  // Miniatura grande (512x512)
  if (job.thumbnailLargePath && job.thumbnailLargePath.startsWith('data:image/png;base64,')) {
    const b64 = job.thumbnailLargePath.replace('data:image/png;base64,', '');
    const p512 = path.join(thumbnailsDir, `${job.id}_512.png`);
    fs.writeFileSync(p512, Buffer.from(b64, 'base64'));
    job.thumbnailLargePath = p512;
  } else if (zipThumbLarge && zipThumbLarge.length > 0) {
    const p512 = path.join(thumbnailsDir, `${job.id}_512.png`);
    fs.writeFileSync(p512, zipThumbLarge);
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

/**
 * Parsea todas las placas de un archivo `.3mf`, `.gcode` o `.gcode.metadata` en disco.
 * Para `.3mf` multi-placa retorna un `GcodeJob` por cada placa laminada encontrada.
 */
export function parseGcodePlatesFromDisk(
  filePath: string,
  thumbnailsDir?: string,
  rolls: Roll[] = [],
  savedMappings?: Record<string, string>,
): GcodeJob[] {
  try {
    if (!fs.existsSync(filePath)) return [];

    // Si existe un .metadata al lado para un .gcode plano, preferirlo
    let targetPath = filePath;
    if (!filePath.toLowerCase().endsWith('.metadata') && !filePath.toLowerCase().endsWith('.3mf')) {
      const cand = `${filePath}.metadata`;
      if (fs.existsSync(cand)) {
        targetPath = cand;
      }
    }

    const stat = fs.statSync(targetPath);
    const filename = path.basename(filePath);

    // Detectar si el archivo es ZIP / .3mf
    let isArchive = targetPath.toLowerCase().endsWith('.3mf');
    if (!isArchive && stat.size >= 4) {
      const fd = fs.openSync(targetPath, 'r');
      try {
        const hdr = Buffer.alloc(4);
        fs.readSync(fd, hdr, 0, 4, 0);
        if (hdr[0] === 0x50 && hdr[1] === 0x4b) {
          isArchive = true;
        }
      } finally {
        fs.closeSync(fd);
      }
    }

    if (isArchive) {
      if (stat.size > MAX_ARCHIVE_BYTES) return [];
      const buf = fs.readFileSync(targetPath);
      const plates = extractGcodePlatesFrom3mf(buf);
      if (plates.length === 0) return [];

      const sliceInfoMap = plates[0]?.sliceInfoXml
        ? parseSliceInfoXml(plates[0].sliceInfoXml)
        : new Map<number, SliceInfoPlate>();

      const jobs: GcodeJob[] = [];
      for (const plate of plates) {
        const job = parseGcodeText(plate.text, filename, filePath, rolls, savedMappings);
        if (!job) continue;

        job.plateIndex = plate.plateIndex;
        const sliceInfo = sliceInfoMap.get(plate.plateIndex);
        if (job.printTimeSeconds === 0 && sliceInfo?.prediction) {
          job.printTimeSeconds = sliceInfo.prediction;
        }

        // Enriquecer nombres de modelos desde plate_N.json o slice_info.config si faltan
        if (!job.modelNames || job.modelNames.length === 0) {
          if (plate.plateJson) {
            try {
              const data = JSON.parse(plate.plateJson);
              if (Array.isArray(data.bbox_objects)) {
                const names = data.bbox_objects.map((o: any) => cleanModelName(String(o?.name || ''))).filter(Boolean);
                if (names.length > 0) {
                  job.modelNames = names;
                }
              }
            } catch {
              /* ignore */
            }
          }
          if ((!job.modelNames || job.modelNames.length === 0) && sliceInfo && sliceInfo.objectNames.length > 0) {
            job.modelNames = sliceInfo.objectNames;
          }
        }

        const dateLabel = job.slicedAt ? job.slicedAt.replace('T', ' ').slice(0, 19) : undefined;
        job.jobName = formatJobName(job.modelNames || [], job.plateIndex, dateLabel);
        const modelsKey = (job.modelNames || []).map(cleanModelName).sort().join('_') || 'plate';
        job.sessionKey = `${job.pid || 'job'}_p${job.plateIndex}_${modelsKey}`;

        persistThumbnailsForJob(job, targetPath, thumbnailsDir, plate.thumbnailBuf, plate.thumbnailLargeBuf);
        jobs.push(job);
      }

      return jobs;
    }

    // Archivo plano .gcode / .metadata
    const content = safeReadGcodeFile(targetPath);
    const job = parseGcodeText(content, filename, filePath, rolls, savedMappings);
    if (!job) return [];

    persistThumbnailsForJob(job, targetPath, thumbnailsDir);

    // Si no se detectaron nombres de modelos en el gcode, buscar en plate_N.json o origin.txt
    if (!job.modelNames || job.modelNames.length === 0) {
      const dir = path.dirname(targetPath);
      const plateJsonPath = path.join(dir, `plate_${job.plateIndex}.json`);
      if (fs.existsSync(plateJsonPath)) {
        try {
          const raw = fs.readFileSync(plateJsonPath, 'utf8');
          const data = JSON.parse(raw);
          if (Array.isArray(data.bbox_objects)) {
            const names = data.bbox_objects.map((o: any) => o.name).filter(Boolean);
            if (names.length > 0) {
              job.modelNames = names;
              job.jobName = formatJobName(names, job.plateIndex, job.slicedAt?.replace('T', ' '));
            }
          }
        } catch {
          /* ignore */
        }
      }

      if (!job.modelNames || job.modelNames.length === 0) {
        const parentDir = path.dirname(dir);
        const originTxtPath = path.join(parentDir, 'origin.txt');
        if (fs.existsSync(originTxtPath)) {
          try {
            const raw = fs.readFileSync(originTxtPath, 'utf8').trim();
            if (raw) {
              const base = path.basename(raw).replace(/\.[^/.]+$/, '');
              if (base) {
                job.modelNames = [base];
                job.jobName = formatJobName([base], job.plateIndex, job.slicedAt?.replace('T', ' '));
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
    }

    return [job];
  } catch (err) {
    console.error('[gcode] Error parseando archivo en disco:', filePath, err);
    return [];
  }
}

/**
 * Parsea un archivo de laminador (.gcode, .metadata, .3mf) desde el disco,
 * extrae y guarda miniaturas como archivos PNG en thumbnails/
 * y retorna el GcodeJob principal (con `plates` poblado si el .3mf tiene varias placas).
 */
export function parseGcodeFileFromDisk(
  filePath: string,
  thumbnailsDir?: string,
  rolls: Roll[] = [],
  savedMappings?: Record<string, string>,
): GcodeJob | null {
  const plates = parseGcodePlatesFromDisk(filePath, thumbnailsDir, rolls, savedMappings);
  if (plates.length === 0) return null;
  const primary = plates[0];
  if (plates.length > 1) {
    primary.plates = plates.map((p) => ({ ...p }));
  }
  return primary;
}
