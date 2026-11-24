import type { GcodeFilamentMatch, GcodeJob, Roll } from '../shared/types';
import { normHex, nowIso } from './roll';
import { matchSlotToRoll } from './colorMath';

const MATERIAL_DENSITY: Record<string, number> = {
  PLA: 1.24,
  'PLA+': 1.24,
  PETG: 1.27,
  ABS: 1.04,
  ASA: 1.07,
  TPU: 1.21,
  Nylon: 1.14,
  PC: 1.20,
  HIPS: 1.04,
  PVA: 1.19,
  'PLA-CF': 1.29,
};

function normalizeMaterialToken(raw: string): string {
  const cleaned = raw.trim().replace(/^"|"$/g, '');
  const upper = cleaned.toUpperCase();
  if (!upper) return 'PLA';
  if (upper.includes('PLA-CF') || upper.includes('CF-PLA') || upper.includes('PLA CF') || upper.includes('CF PLA')) {
    return 'PLA-CF';
  }
  if (upper.includes('PLA+')) return 'PLA+';
  if (upper.includes('PETG')) return 'PETG';
  if (upper.includes('ABS')) return 'ABS';
  if (upper.includes('ASA')) return 'ASA';
  if (upper.includes('TPU') || upper.includes('FLEX')) return 'TPU';
  if (
    upper.includes('NYLON') ||
    upper === 'PA' ||
    upper.startsWith('PA6') ||
    upper.startsWith('PA12') ||
    upper.startsWith('PA-')
  ) {
    return 'Nylon';
  }
  if (upper === 'PC' || upper.includes('POLYCARBONATE') || upper.startsWith('PC-')) return 'PC';
  if (upper.includes('HIPS')) return 'HIPS';
  if (upper.includes('PVA')) return 'PVA';
  if (upper.includes('PLA')) return 'PLA';
  return cleaned;
}

function densityForMaterial(material: string): number {
  const norm = normalizeMaterialToken(material);
  return MATERIAL_DENSITY[norm] || 1.24;
}

export function parsePrintTimeString(timeStr: string): number {
  if (!timeStr) return 0;
  const trimmed = timeStr.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Math.round(parseFloat(trimmed));

  // HH:MM:SS (usado por IdeaMaker y otros laminadores)
  const hms = trimmed.match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  if (hms) {
    return parseInt(hms[1], 10) * 3600 + parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10);
  }

  let total = 0;
  const d = trimmed.match(/(\d+)\s*d/i);
  const h = trimmed.match(/(\d+)\s*h/i);
  const m = trimmed.match(/(\d+)\s*m/i);
  const s = trimmed.match(/(\d+)\s*s/i);
  if (d) total += parseInt(d[1], 10) * 86400;
  if (h) total += parseInt(h[1], 10) * 3600;
  if (m) total += parseInt(m[1], 10) * 60;
  if (s) total += parseInt(s[1], 10);
  return total;
}

export function formatPrintTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Limpia sufijos como _id_0_copy_0 y extensiones .stl/.3mf/.step/.obj */
export function cleanModelName(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/_id_\d+_copy_\d+/gi, '')
    .replace(/\.(stl|3mf|step|obj)$/gi, '')
    .trim();
}

/** Formatea los nombres de modelos en un título legible (ej. "EXTERN, THOMAS") */
export function formatJobName(models: string[], plateIndex: number, dateLabel?: string): string {
  const cleaned = models.map(cleanModelName).filter(Boolean);
  const allGeneric = cleaned.length === 0 || cleaned.every((m) => /^plate_\d+(_\d+)?$/i.test(m));

  if (allGeneric) {
    return `Placa ${plateIndex}${dateLabel ? ` · ${dateLabel}` : ''}`;
  }

  if (cleaned.length <= 3) {
    return cleaned.join(', ');
  }
  return `${cleaned.slice(0, 3).join(', ')} +${cleaned.length - 3} más`;
}

const KNOWN_BRANDS: Array<[RegExp, string]> = [
  [/\banycubic\b/i, 'Anycubic'],
  [/\besun\b/i, 'eSUN'],
  [/\bbambu(?:\s*lab)?\b/i, 'Bambu Lab'],
  [/\bsunlu\b/i, 'SUNLU'],
  [/\bprusament\b/i, 'Prusament'],
  [/\bpolymaker\b/i, 'Polymaker'],
  [/\boverture\b/i, 'Overture'],
  [/\bcreality\b/i, 'Creality'],
  [/\belegoo\b/i, 'Elegoo'],
  [/\bhatchbox\b/i, 'Hatchbox'],
  [/\beryone\b/i, 'Eryone'],
  [/\braise3d\b/i, 'Raise3D'],
  [/\bultimaker\b/i, 'Ultimaker'],
];

const BARE_MATERIALS = new Set([
  'PLA',
  'PLA+',
  'PETG',
  'ABS',
  'ASA',
  'TPU',
  'PC',
  'NYLON',
  'HIPS',
  'PVA',
  'PLA-CF',
  'PA',
  'PA6',
  'PA12',
]);

const MODIFIER_PREFIXES = new Set([
  'SILK',
  'SEDA',
  'MATTE',
  'MATE',
  'GLITTER',
  'SPARKLE',
  'TRANSLUCENT',
  'TRANSPARENT',
  'BASIC',
  'HIGH',
  'RAPID',
  'TOUGH',
  'PRO',
  'PLUS',
  'ECO',
  'HYPER',
  'META',
  'WOOD',
  'MARBLE',
  'RAINBOW',
  'CF',
  'GF',
]);

/** Extrae metadatos de configuración de filamento a partir de un string de perfil */
export function parseGcodeSettingsId(raw: string): { brand: string; material: string; finish: string } {
  const clean = raw.replace(/^"|"$/g, '').trim();
  const beforeAt = clean.split(' @ ')[0] || clean;
  const lower = beforeAt.toLowerCase();

  let brand = 'Genérico';
  for (const [rx, label] of KNOWN_BRANDS) {
    if (rx.test(beforeAt)) {
      brand = label;
      break;
    }
  }
  if (brand === 'Genérico' && !lower.startsWith('generic') && !lower.startsWith('genérico')) {
    const parts = beforeAt.split(/\s+/).filter(Boolean);
    const firstToken = parts[0]?.toUpperCase();
    if (parts.length > 1 && firstToken && !BARE_MATERIALS.has(firstToken) && !MODIFIER_PREFIXES.has(firstToken)) {
      brand = parts[0];
    }
  }

  let finish = 'glossy';
  if (lower.includes('silk') || lower.includes('seda')) finish = 'silk';
  else if (lower.includes('matte') || lower.includes('mate')) finish = 'matte';
  else if (lower.includes('glitter') || lower.includes('sparkle')) finish = 'glitter';
  else if (lower.includes('translucent') || lower.includes('transparent')) finish = 'translucent';

  const material = normalizeMaterialToken(beforeAt);

  return { brand, material, finish };
}

/** Calcula un hash rápido determinista */
export function quickHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Chunk(chunk: string): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < chunk.length; i += 4) {
    const c0 = B64_ALPHABET.indexOf(chunk[i]);
    const c1 = B64_ALPHABET.indexOf(chunk[i + 1]);
    const p2 = chunk[i + 2];
    const p3 = chunk[i + 3];
    const c2 = p2 === '=' ? 0 : B64_ALPHABET.indexOf(p2);
    const c3 = p3 === '=' ? 0 : B64_ALPHABET.indexOf(p3);
    if (c0 < 0 || c1 < 0 || (p2 !== '=' && c2 < 0) || (p3 !== '=' && c3 < 0)) {
      return null;
    }
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    out.push((triple >>> 16) & 0xff);
    if (p2 !== '=') out.push((triple >>> 8) & 0xff);
    if (p3 !== '=') out.push(triple & 0xff);
  }
  return out;
}

/**
 * Valida si un bloque base64 representa un PNG válido (firma 89 50 4E 47 0D 0A 1A 0A y chunk IEND final)
 */
export function isValidPngBase64(b64: string): boolean {
  if (!b64 || b64.length < 32) return false;
  try {
    const clean = b64.replace(/\s+/g, '');
    if (clean.length < 32) return false;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return false;

    const head = decodeBase64Chunk(clean.slice(0, 12));
    if (
      !head ||
      head.length < 8 ||
      head[0] !== 0x89 ||
      head[1] !== 0x50 ||
      head[2] !== 0x4e ||
      head[3] !== 0x47 ||
      head[4] !== 0x0d ||
      head[5] !== 0x0a ||
      head[6] !== 0x1a ||
      head[7] !== 0x0a
    ) {
      return false;
    }

    const tailLen = Math.min(32, Math.floor(clean.length / 4) * 4);
    const tailBytes = decodeBase64Chunk(clean.slice(clean.length - tailLen));
    if (!tailBytes || tailBytes.length < 8) return false;

    const last12 = tailBytes.slice(-12);
    // Chunk IEND: 49 45 4E 44 (+ CRC AE 42 60 82)
    for (let i = 0; i <= last12.length - 8; i++) {
      if (
        last12[i] === 0x49 &&
        last12[i + 1] === 0x45 &&
        last12[i + 2] === 0x4e &&
        last12[i + 3] === 0x44 &&
        last12[i + 4] === 0xae &&
        last12[i + 5] === 0x42 &&
        last12[i + 6] === 0x60 &&
        last12[i + 7] === 0x82
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function parseCuraFilamentUsed(raw: string): number[] {
  // Ejemplos: "12.5m", "12.5m, 3.2m", "12500mm", "15.4" (metros en Cura)
  return raw
    .split(',')
    .map((part) => {
      const s = part.trim().toLowerCase();
      const m = s.match(/([\d.]+)\s*(mm|m)?/);
      if (!m) return 0;
      const val = parseFloat(m[1]);
      if (!Number.isFinite(val) || val <= 0) return 0;
      if (m[2] === 'mm') return val;
      return val * 1000;
    });
}

/**
 * Parser multi-laminador 100% offline.
 * Soporta Anycubic Slicer Next, OrcaSlicer, Bambu Studio, PrusaSlicer, SuperSlicer,
 * Ultimaker Cura, Simplify3D, IdeaMaker, Creality Print (v4 y v5+) y Klipper/Moonraker.
 */
export function parseGcodeText(
  content: string,
  filename: string,
  filepath: string = '',
  rolls: Roll[] = [],
  savedMappings?: Record<string, string>,
): GcodeJob | null {
  const lines = content.split(/\r?\n/);

  let scanned: string[];
  if (lines.length <= 4500) {
    scanned = lines;
  } else {
    let headEnd = 2500;
    let openThumb = false;
    for (let i = 0; i < headEnd; i++) {
      const t = lines[i].trim();
      if (t.startsWith('; thumbnail begin')) openThumb = true;
      else if (t.startsWith('; thumbnail end')) openThumb = false;
    }
    const maxHeadEnd = Math.min(lines.length, 6000);
    while (openThumb && headEnd < maxHeadEnd) {
      if (lines[headEnd].trim().startsWith('; thumbnail end')) openThumb = false;
      headEnd++;
    }
    if (headEnd >= lines.length - 2000) {
      scanned = lines;
    } else {
      scanned = [...lines.slice(0, headEnd), '; __FILOTECA_TAIL_MARKER__', ...lines.slice(-2000)];
    }
  }

  let plateIndex = 1;
  let rawModels: string[] = [];
  let slicedAtIso = new Date().toISOString();
  let dateLabel = '';
  let paintInfo: Array<{ material_type: string; paint_color: [number, number, number]; paint_index: number }> = [];
  let filamentColourInfo: string[] = [];
  let extruderColorsList: string[] = [];

  let gramsList: number[] = [];
  let mmList: number[] = [];
  let cm3List: number[] = [];
  let totalGramsReported = 0;

  let densities: number[] = [];
  let diameters: number[] = [];
  let colorsList: string[] = [];
  let typesList: string[] = [];
  let settingsIdList: string[] = [];

  let colorChangesCount = 0;
  let totalLayersCount = 0;
  let printTimeSeconds = 0;
  let silentTimeSeconds: number | undefined = undefined;
  let sportTimeSeconds: number | undefined = undefined;
  let dimensions: { x: number; y: number; z: number } | undefined = undefined;

  let slicerName: string | undefined = undefined;
  let slicerVersion: string | undefined = undefined;
  let printerModel: string | undefined = undefined;
  let nozzleDiameter: number | undefined = undefined;
  let layerHeight: number | undefined = undefined;
  let infillPercent: number | undefined = undefined;

  // Colectores para formatos multi-línea / bbox
  let minX: number | undefined;
  let maxX: number | undefined;
  let minY: number | undefined;
  let maxY: number | undefined;
  let minZ: number | undefined;
  let maxZ: number | undefined;
  let curaSetting3Raw = '';

  let thumbnail260B64 = '';
  let thumbnail512B64 = '';
  let inThumbnail260 = false;
  let inThumbnail512 = false;

  for (let i = 0; i < scanned.length; i++) {
    const l = scanned[i].trim();

    if (l === '; __FILOTECA_TAIL_MARKER__') {
      inThumbnail260 = false;
      inThumbnail512 = false;
      continue;
    }

    // Parseo de bloques de miniaturas
    if (l.startsWith('; thumbnail begin ')) {
      const dimMatch = l.match(/^; thumbnail begin (\d+)x(\d+)/);
      const width = dimMatch ? parseInt(dimMatch[1], 10) : 260;
      if (width >= 450) {
        inThumbnail512 = true;
        inThumbnail260 = false;
      } else {
        inThumbnail260 = true;
        inThumbnail512 = false;
      }
      continue;
    } else if (l.startsWith('; thumbnail end')) {
      inThumbnail260 = false;
      inThumbnail512 = false;
      continue;
    }

    if (inThumbnail260) {
      if (l.startsWith('; ')) thumbnail260B64 += l.slice(2).trim();
      continue;
    }
    if (inThumbnail512) {
      if (l.startsWith('; ')) thumbnail512B64 += l.slice(2).trim();
      continue;
    }

    if (!l.startsWith(';') && !l.startsWith('EXCLUDE_OBJECT_DEFINE') && !l.startsWith('SET_PRINT_STATS_INFO')) {
      continue;
    }

    // Klipper / Moonraker macro: SET_PRINT_STATS_INFO TOTAL_LAYER=160
    if (l.startsWith('SET_PRINT_STATS_INFO')) {
      const mTotal = l.match(/TOTAL_LAYER=(\d+)/i);
      if (mTotal) {
        const parsed = parseInt(mTotal[1], 10);
        if (parsed > 0) totalLayersCount = parsed;
      }
      continue;
    }

    // Identificación de laminador
    if (l.includes('generated by') && l.includes(' on ')) {
      const genMatch = l.match(
        /;\s*generated by\s+(PrusaSlicer|SuperSlicer|BambuStudio|OrcaSlicer|AnycubicSlicerNext|Creality Print|[\w.-]+)\s+([^\s]+)\s+on\s+(\d{4}-\d{2}-\d{2})\s+at\s+(\d{2}:\d{2}:\d{2})/i,
      );
      if (genMatch) {
        slicerName = genMatch[1];
        slicerVersion = genMatch[2];
        slicedAtIso = `${genMatch[3]}T${genMatch[4]}`;
        dateLabel = `${genMatch[3]} ${genMatch[4]}`;
      } else {
        const match = l.match(/on (\d{4}-\d{2}-\d{2}) at (\d{2}:\d{2}:\d{2})/);
        if (match) {
          slicedAtIso = `${match[1]}T${match[2]}`;
          dateLabel = `${match[1]} ${match[2]}`;
        }
      }
    } else if (/^;\s*Generated with Cura_SteamEngine/i.test(l)) {
      const m = l.match(/Cura_SteamEngine\s+([^\s]+)/i);
      slicerName = 'Cura';
      if (m) slicerVersion = m[1];
    } else if (/^;\s*Generated with Creality[_ ]Print/i.test(l)) {
      const m = l.match(/Creality[_ ]Print\s+V?([\d.]+)/i);
      slicerName = 'Creality Print';
      if (m) slicerVersion = m[1];
    } else if (/^;\s*G-Code generated by Simplify3D/i.test(l)) {
      const m = l.match(/Simplify3D(?:\(R\))?\s+Version\s+([\d.]+)/i);
      slicerName = 'Simplify3D';
      if (m) slicerVersion = m[1];
    } else if (/^;\s*Sliced by ideaMaker/i.test(l)) {
      const m = l.match(/ideaMaker\s+([\d.]+)(?:,\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}))?/i);
      slicerName = 'ideaMaker';
      if (m) {
        slicerVersion = m[1];
        if (m[2] && m[3]) {
          slicedAtIso = `${m[2]}T${m[3]}`;
          dateLabel = `${m[2]} ${m[3]}`;
        }
      }
    }

    // source_info JSON (Anycubic / Orca / Bambu)
    if (l.startsWith('; source_info =') || l.startsWith('; source_info:')) {
      try {
        const jsonStr = l.slice(l.indexOf('{'));
        const obj = JSON.parse(jsonStr);
        if (typeof obj.plate_index === 'number') plateIndex = obj.plate_index;
        if (Array.isArray(obj.models)) {
          rawModels = obj.models.map((m: any) => m.name || '').filter(Boolean);
        }
      } catch {
        /* ignore json error */
      }
    }

    // PrusaSlicer objects_info JSON
    if (l.startsWith('; objects_info =')) {
      try {
        const jsonStr = l.slice(l.indexOf('{'));
        const obj = JSON.parse(jsonStr);
        if (Array.isArray(obj.objects)) {
          for (const item of obj.objects) {
            const cleaned = cleanModelName(String(item?.name || ''));
            if (cleaned && !rawModels.includes(cleaned)) {
              rawModels.push(cleaned);
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    // OrcaSlicer / PrusaSlicer / BambuStudio / Klipper object names
    if (l.startsWith('; printing object ') || l.startsWith('EXCLUDE_OBJECT_DEFINE NAME=')) {
      const m = l.match(/;\s*printing object\s+([^\s]+)/i) || l.match(/EXCLUDE_OBJECT_DEFINE\s+NAME=([^\s]+)/i);
      if (m && m[1]) {
        const cleaned = cleanModelName(m[1]);
        if (cleaned && !rawModels.includes(cleaned)) {
          rawModels.push(cleaned);
        }
      }
    }

    // paint_info JSON
    if (l.startsWith('; paint_info =')) {
      try {
        const jsonStr = l.slice(l.indexOf('['));
        paintInfo = JSON.parse(jsonStr);
      } catch {
        /* ignore */
      }
    }

    // Cura ;SETTING_3 fragments
    if (l.startsWith(';SETTING_3')) {
      curaSetting3Raw += l.replace(/^;SETTING_3\s*/, '');
    }

    // Gramos y dimensiones de filamento (Orca / Anycubic / Prusa / Bambu / Creality v5)
    if (l.includes('total filament used [g]') && l.includes('=')) {
      totalGramsReported = parseFloat(l.split('=')[1]) || 0;
    } else if (l.includes('filament used [g]') && l.includes('=')) {
      const parts = l.split('=')[1].split(',').map((s) => parseFloat(s.trim()));
      if (parts.some((n) => Number.isFinite(n))) gramsList = parts.map((n) => (Number.isFinite(n) ? n : 0));
    } else if (l.includes('filament used [mm]') && l.includes('=')) {
      const parts = l.split('=')[1].split(',').map((s) => parseFloat(s.trim()));
      if (parts.some((n) => Number.isFinite(n))) mmList = parts.map((n) => (Number.isFinite(n) ? n : 0));
    } else if (l.includes('filament used [cm3]') && l.includes('=')) {
      const parts = l.split('=')[1].split(',').map((s) => parseFloat(s.trim()));
      if (parts.some((n) => Number.isFinite(n))) cm3List = parts.map((n) => (Number.isFinite(n) ? n : 0));
    }

    const cleanL = l.replace(/^;\s*/, '');

    // Klipper/Moonraker comentarios
    if (/^slicer\s*[=:]/i.test(cleanL) && !slicerName) {
      slicerName = cleanL.split(/[=:]/).slice(1).join(':').trim();
    } else if (/^slicer_version\s*[=:]/i.test(cleanL) && !slicerVersion) {
      slicerVersion = cleanL.split(/[=:]/).slice(1).join(':').trim();
    } else if (/^estimated_time\s*[=:]/i.test(cleanL) && printTimeSeconds === 0) {
      printTimeSeconds = parsePrintTimeString(cleanL.split(/[=:]/).slice(1).join(':').trim());
    } else if (/^filament_used_mm\s*[=:]/i.test(cleanL)) {
      const parts = cleanL
        .split(/[=:]/)
        .slice(1)
        .join(':')
        .split(',')
        .map((s) => parseFloat(s.trim()));
      if (parts.some((n) => Number.isFinite(n))) mmList = parts.map((n) => (Number.isFinite(n) ? n : 0));
    } else if (/^filament_used_g\s*[=:]/i.test(cleanL)) {
      const parts = cleanL
        .split(/[=:]/)
        .slice(1)
        .join(':')
        .split(',')
        .map((s) => parseFloat(s.trim()));
      if (parts.some((n) => Number.isFinite(n))) gramsList = parts.map((n) => (Number.isFinite(n) ? n : 0));
    } else if (/^total_layer_count\s*[=:]/i.test(cleanL) && totalLayersCount === 0) {
      totalLayersCount = parseInt(cleanL.split(/[=:]/).slice(1).join(':').trim(), 10) || 0;
    }

    // Cura / Creality v4 comentarios
    if (/^TIME:(\d+)/i.test(cleanL)) {
      const m = cleanL.match(/^TIME:(\d+)/i);
      if (m) printTimeSeconds = parseInt(m[1], 10) || printTimeSeconds;
    } else if (/^TIME_ELAPSED:([\d.]+)/i.test(cleanL) && printTimeSeconds === 0) {
      const m = cleanL.match(/^TIME_ELAPSED:([\d.]+)/i);
      if (m) printTimeSeconds = Math.round(parseFloat(m[1])) || 0;
    } else if (/^Filament used:\s*(.+)/i.test(cleanL) && !/^Filament used:\s*[\d.]+\s*$/i.test(cleanL)) {
      // Cura: ";Filament used: 15.73m" o ";Filament used: 15.73m, 2.5m"
      const m = cleanL.match(/^Filament used:\s*(.+)/i);
      if (m) {
        const parsedMm = parseCuraFilamentUsed(m[1]);
        if (parsedMm.some((v) => v > 0) && (mmList.length === 0 || parsedMm.length > 1)) {
          mmList = parsedMm;
        }
      }
    } else if (/^Filament Used:\s*([\d.]+)\s*(mm|m)?$/i.test(cleanL)) {
      // IdeaMaker: ";Filament Used: 12.40" (en metros salvo que diga mm); no sobreescribir ranuras Material#N
      if (mmList.length === 0) {
        const m = cleanL.match(/^Filament Used:\s*([\d.]+)\s*(mm|m)?$/i);
        if (m) {
          const val = parseFloat(m[1]);
          if (Number.isFinite(val) && val > 0) {
            mmList = [m[2]?.toLowerCase() === 'mm' ? val : val * 1000];
          }
        }
      }
    } else if (/^LAYER_COUNT:(\d+)/i.test(cleanL)) {
      totalLayersCount = parseInt(cleanL.split(':')[1].trim(), 10) || totalLayersCount;
    } else if (/^Layer height:\s*([\d.]+)/i.test(cleanL)) {
      const v = parseFloat(cleanL.split(':')[1].trim());
      if (Number.isFinite(v) && v > 0) layerHeight = v;
    } else if (/^Machine Model:\s*(.+)/i.test(cleanL)) {
      printerModel = cleanL.split(':').slice(1).join(':').trim();
    } else if (/^Material Name:\s*(.+)/i.test(cleanL) && typesList.length === 0) {
      const mat = cleanL.split(':').slice(1).join(':').trim();
      if (mat) typesList = [mat];
    } else if (/^NOZZLE_DIAMETER:\s*([\d.]+)/i.test(cleanL)) {
      const v = parseFloat(cleanL.split(':')[1].trim());
      if (Number.isFinite(v) && v > 0) nozzleDiameter = v;
    } else if (/^MINX:([\d.-]+)/i.test(cleanL)) {
      minX = parseFloat(cleanL.split(':')[1]);
    } else if (/^MAXX:([\d.-]+)/i.test(cleanL)) {
      maxX = parseFloat(cleanL.split(':')[1]);
    } else if (/^MINY:([\d.-]+)/i.test(cleanL)) {
      minY = parseFloat(cleanL.split(':')[1]);
    } else if (/^MAXY:([\d.-]+)/i.test(cleanL)) {
      maxY = parseFloat(cleanL.split(':')[1]);
    } else if (/^MINZ:([\d.-]+)/i.test(cleanL)) {
      minZ = parseFloat(cleanL.split(':')[1]);
    } else if (/^MAXZ:([\d.-]+)/i.test(cleanL)) {
      maxZ = parseFloat(cleanL.split(':')[1]);
    }

    // Simplify3D comentarios
    if (/^Build time:\s*(.+)/i.test(cleanL) && printTimeSeconds === 0) {
      printTimeSeconds = parsePrintTimeString(cleanL.split(':').slice(1).join(':').trim());
    } else if (/^Filament length:\s*([\d.]+)\s*mm/i.test(cleanL)) {
      const m = cleanL.match(/^Filament length:\s*([\d.]+)\s*mm/i);
      if (m) mmList = [parseFloat(m[1]) || 0];
    } else if (/^Plastic volume:\s*[\d.]+\s*mm\^3\s*\(([\d.]+)\s*cc\)/i.test(cleanL)) {
      const m = cleanL.match(/\(([\d.]+)\s*cc\)/i);
      if (m) cm3List = [parseFloat(m[1]) || 0];
    } else if (/^Plastic weight:\s*([\d.]+)\s*g/i.test(cleanL)) {
      const m = cleanL.match(/^Plastic weight:\s*([\d.]+)\s*g/i);
      if (m) gramsList = [parseFloat(m[1]) || 0];
    } else if (/^printMaterial,(.+)/i.test(cleanL)) {
      const raw = cleanL.slice('printMaterial,'.length).trim();
      if (raw) typesList = raw.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
    } else if (/^layerHeight,([\d.]+)/i.test(cleanL)) {
      const v = parseFloat(cleanL.slice('layerHeight,'.length));
      if (Number.isFinite(v) && v > 0) layerHeight = v;
    } else if (/^infillPercentage,([\d.]+)/i.test(cleanL)) {
      const v = parseFloat(cleanL.slice('infillPercentage,'.length));
      if (Number.isFinite(v) && v >= 0) infillPercent = v;
    } else if (/^extruderDiameter,([\d.]+)/i.test(cleanL)) {
      const v = parseFloat(cleanL.slice('extruderDiameter,'.length));
      if (Number.isFinite(v) && v > 0) nozzleDiameter = v;
    } else if (/^filamentDiameters,([\d.|,]+)/i.test(cleanL)) {
      diameters = cleanL
        .slice('filamentDiameters,'.length)
        .split(/[|,]/)
        .map((s) => parseFloat(s.trim()))
        .filter(Number.isFinite);
    } else if (/^filamentDensities,([\d.|,]+)/i.test(cleanL)) {
      densities = cleanL
        .slice('filamentDensities,'.length)
        .split(/[|,]/)
        .map((s) => parseFloat(s.trim()))
        .filter(Number.isFinite);
    } else if (/^printerName,(.+)/i.test(cleanL)) {
      printerModel = cleanL.slice('printerName,'.length).trim();
    }

    // IdeaMaker comentarios
    if (/^Print Time:\s*(.+)/i.test(cleanL) && printTimeSeconds === 0) {
      printTimeSeconds = parsePrintTimeString(cleanL.split(':').slice(1).join(':').trim());
    } else if (/^Material#(\d+)\s+Used:\s*([\d.]+)/i.test(cleanL)) {
      const m = cleanL.match(/^Material#(\d+)\s+Used:\s*([\d.]+)\s*(mm|m)?(?:\s*\(([\d.]+)\s*g\))?/i);
      if (m) {
        const idx = Math.max(0, parseInt(m[1], 10) - 1);
        const val = parseFloat(m[2]);
        if (Number.isFinite(val) && val > 0) {
          mmList[idx] = m[3]?.toLowerCase() === 'mm' ? val : val * 1000;
        }
        if (m[4]) {
          const g = parseFloat(m[4]);
          if (Number.isFinite(g) && g > 0) gramsList[idx] = g;
        }
      }
    } else if (/^Material#(\d+)\s+Type:\s*(.+)/i.test(cleanL)) {
      const m = cleanL.match(/^Material#(\d+)\s+Type:\s*(.+)/i);
      if (m) {
        const idx = Math.max(0, parseInt(m[1], 10) - 1);
        typesList[idx] = m[2].trim();
      }
    } else if (/^Material#(\d+)\s+Color:\s*(#[0-9a-fA-F]{6})/i.test(cleanL)) {
      const m = cleanL.match(/^Material#(\d+)\s+Color:\s*(#[0-9a-fA-F]{6})/i);
      if (m) {
        const idx = Math.max(0, parseInt(m[1], 10) - 1);
        colorsList[idx] = m[2].trim();
      }
    } else if (/^Bounding Box:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/i.test(cleanL)) {
      const m = cleanL.match(
        /^Bounding Box:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/i,
      );
      if (m) {
        const vals = m.slice(1, 7).map(parseFloat);
        if (vals.every(Number.isFinite)) {
          dimensions = {
            x: Math.round((vals[1] - vals[0]) * 100) / 100,
            y: Math.round((vals[3] - vals[2]) * 100) / 100,
            z: Math.round((vals[5] - vals[4]) * 100) / 100,
          };
        }
      }
    } else if (/^Infill Density:\s*([\d.]+)%?/i.test(cleanL)) {
      const v = parseFloat(cleanL.split(':')[1]);
      if (Number.isFinite(v) && v >= 0) infillPercent = v;
    } else if (/^Nozzle Diameter:\s*([\d.]+)/i.test(cleanL)) {
      const v = parseFloat(cleanL.split(':')[1]);
      if (Number.isFinite(v) && v > 0) nozzleDiameter = v;
    } else if (/^Printer Type:\s*(.+)/i.test(cleanL)) {
      printerModel = cleanL.split(':').slice(1).join(':').trim();
    } else if (/^Total Layers:\s*(\d+)/i.test(cleanL) && totalLayersCount === 0) {
      totalLayersCount = parseInt(cleanL.split(':')[1].trim(), 10) || 0;
    }

    // Config común estilo Prusa / Orca / Bambu / Anycubic
    if (cleanL.startsWith('filament_density') && (cleanL.includes('=') || cleanL.includes(':'))) {
      const sep = cleanL.includes('=') ? '=' : ':';
      densities = cleanL
        .split(sep)[1]
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter(Number.isFinite);
    }
    if (cleanL.startsWith('filament_diameter') && (cleanL.includes('=') || cleanL.includes(':'))) {
      const sep = cleanL.includes('=') ? '=' : ':';
      diameters = cleanL
        .split(sep)[1]
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter(Number.isFinite);
    }

    // Colores de filamento
    if (cleanL.match(/^filament_colou?r\s*=/i)) {
      colorsList = cleanL
        .split('=')[1]
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (cleanL.match(/^filament_colou?r_info\s*=/i)) {
      filamentColourInfo = cleanL
        .split('=')[1]
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (cleanL.match(/^extruder_colou?r\s*=/i)) {
      extruderColorsList = cleanL
        .split('=')[1]
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Tipos de filamento
    if (cleanL.match(/^filament_type\s*[=:]/i)) {
      const sep = cleanL.includes('=') ? '=' : ':';
      typesList = cleanL
        .split(sep)[1]
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Filament settings ID
    if (cleanL.startsWith('filament_settings_id') && cleanL.includes('=')) {
      settingsIdList = cleanL
        .split('=')[1]
        .split(';')
        .map((s) => s.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    }

    // Metadatos extendidos de impresión (Prusa / Orca / Bambu / Anycubic / Klipper)
    if (/^printer_model\s*=/.test(cleanL)) {
      printerModel = cleanL.split('=')[1].trim().replace(/^"|"$/g, '') || printerModel;
    } else if (/^nozzle_diameter\s*[=:]/.test(cleanL) && nozzleDiameter === undefined) {
      const sep = cleanL.includes('=') ? '=' : ':';
      const v = parseFloat(cleanL.split(sep)[1].split(',')[0].trim());
      if (Number.isFinite(v) && v > 0) nozzleDiameter = v;
    } else if (/^layer_height\s*[=:]/.test(cleanL) && layerHeight === undefined) {
      const sep = cleanL.includes('=') ? '=' : ':';
      const v = parseFloat(cleanL.split(sep)[1].trim());
      if (Number.isFinite(v) && v > 0) layerHeight = v;
    } else if (/^(?:fill_density|sparse_infill_density)\s*=/.test(cleanL) && infillPercent === undefined) {
      const v = parseFloat(cleanL.split('=')[1].replace('%', '').trim());
      if (Number.isFinite(v) && v >= 0) infillPercent = v;
    }

    // Cambios de color y capas
    if (l.includes('total filament change') && l.includes('=')) {
      colorChangesCount = parseInt(l.split('=')[1].trim(), 10) || 0;
    }
    if (l.includes('total layers count') && l.includes('=')) {
      totalLayersCount = parseInt(l.split('=')[1].trim(), 10) || 0;
    } else if (l.includes('total layer number:') && totalLayersCount === 0) {
      totalLayersCount = parseInt(l.split(':')[1].trim(), 10) || 0;
    } else if (/^total_layers\s*=/.test(cleanL) && totalLayersCount === 0) {
      totalLayersCount = parseInt(cleanL.split('=')[1].trim(), 10) || 0;
    }

    // Tiempos de impresión (normal, silencioso, deportivo)
    if (l.includes('estimated printing time (normal mode)') && l.includes('=')) {
      printTimeSeconds = parsePrintTimeString(l.split('=')[1].trim());
    } else if (l.includes('estimated printing time (silent mode)') && l.includes('=')) {
      const sec = parsePrintTimeString(l.split('=')[1].trim());
      if (sec > 0) silentTimeSeconds = sec;
    } else if (l.includes('estimated printing time (sport mode)') && l.includes('=')) {
      const sec = parsePrintTimeString(l.split('=')[1].trim());
      if (sec > 0) sportTimeSeconds = sec;
    } else if (l.includes('print_time =') && printTimeSeconds === 0) {
      printTimeSeconds = parsePrintTimeString(l.split('=')[1].trim());
    }

    // Medidas del modelo (model_size = x,y,z)
    if (l.includes('model_size =')) {
      const parts = l.split('=')[1].split(',').map((s) => parseFloat(s.trim()));
      if (parts.length >= 3 && parts.every(Number.isFinite)) {
        dimensions = { x: parts[0], y: parts[1], z: parts[2] };
      }
    }
  }

  // Fallback de dimensiones Cura MINX..MAXZ
  if (
    !dimensions &&
    minX !== undefined &&
    maxX !== undefined &&
    minY !== undefined &&
    maxY !== undefined &&
    minZ !== undefined &&
    maxZ !== undefined &&
    [minX, maxX, minY, maxY, minZ, maxZ].every(Number.isFinite)
  ) {
    dimensions = {
      x: Math.round((maxX - minX) * 100) / 100,
      y: Math.round((maxY - minY) * 100) / 100,
      z: Math.round((maxZ - minZ) * 100) / 100,
    };
  }

  // Extraer campos útiles de Cura ;SETTING_3 si están presentes
  if (curaSetting3Raw) {
    const infillM = curaSetting3Raw.match(/infill_sparse_density\s*=\s*([\d.]+)/i);
    if (infillM && infillPercent === undefined) {
      const v = parseFloat(infillM[1]);
      if (Number.isFinite(v) && v >= 0) infillPercent = v;
    }
    const nozzleM = curaSetting3Raw.match(/machine_nozzle_size\s*=\s*([\d.]+)/i);
    if (nozzleM && nozzleDiameter === undefined) {
      const v = parseFloat(nozzleM[1]);
      if (Number.isFinite(v) && v > 0) nozzleDiameter = v;
    }
    const layerM = curaSetting3Raw.match(/(?:^|\\n|\s)layer_height\s*=\s*([\d.]+)/i);
    if (layerM && layerHeight === undefined) {
      const v = parseFloat(layerM[1]);
      if (Number.isFinite(v) && v > 0) layerHeight = v;
    }
    const matM = curaSetting3Raw.match(/material_type\s*=\s*([A-Za-z0-9_+-]+)/i);
    if (matM && typesList.length === 0) {
      typesList = [matM[1]];
    }
    const diaM = curaSetting3Raw.match(/material_diameter\s*=\s*([\d.]+)/i);
    if (diaM && diameters.length === 0) {
      const v = parseFloat(diaM[1]);
      if (Number.isFinite(v) && v > 0) diameters = [v];
    }
  }

  // Fallback si falta [g]: cálculo volumétrico por ranura: g = π*(d/2)² * mm/1000 * densidad
  if (gramsList.length === 0 || gramsList.every((g) => g === 0)) {
    if (mmList.length > 0 && mmList.some((mm) => mm > 0)) {
      gramsList = mmList.map((mm, idx) => {
        const d = diameters[idx] || diameters[0] || 1.75;
        const matForSlot = typesList[idx] || typesList[0] || '';
        const dens = densities[idx] || densities[0] || (matForSlot ? densityForMaterial(matForSlot) : 1.24);
        const area = Math.PI * Math.pow(d / 2, 2);
        const cm3 = (area * mm) / 1000;
        return Math.round(cm3 * dens * 100) / 100;
      });
    } else if (cm3List.length > 0 && cm3List.some((c) => c > 0)) {
      gramsList = cm3List.map((c, idx) => {
        const matForSlot = typesList[idx] || typesList[0] || '';
        const dens = densities[idx] || densities[0] || (matForSlot ? densityForMaterial(matForSlot) : 1.24);
        return Math.round(c * dens * 100) / 100;
      });
    } else if (totalGramsReported > 0) {
      gramsList = [totalGramsReported];
    }
  }

  // Cross-check y detección de "Revisar manualmente"
  let manualReviewRequired = false;
  let manualReviewReason: string | undefined = undefined;

  if (colorsList.length > 0 && typesList.length > 0 && colorsList.length !== typesList.length) {
    manualReviewRequired = true;
    manualReviewReason = 'Discrepancia en lista de colores y materiales del laminador';
  }

  // Extraer ranuras usadas (donde gramos > 0)
  const usedSlots: GcodeFilamentMatch[] = [];
  const maxSlots = Math.max(gramsList.length, colorsList.length, typesList.length, 1);
  let usedIndexOrder = 0;

  for (let slotIdx = 0; slotIdx < maxSlots; slotIdx++) {
    const g = gramsList[slotIdx] || 0;
    if (g <= 0) continue;

    let rawColor = colorsList[slotIdx] ? normHex(colorsList[slotIdx]) : '';
    const isPlaceholder =
      !rawColor ||
      rawColor.toLowerCase() === '#ffffffff' ||
      rawColor.toLowerCase() === '#ffffff' ||
      rawColor.toLowerCase() === '#888888';

    if (isPlaceholder) {
      if (filamentColourInfo.length > 0) {
        const infoCand = filamentColourInfo[usedIndexOrder] || filamentColourInfo[0];
        if (infoCand && normHex(infoCand).toLowerCase() !== '#ffffff') {
          rawColor = normHex(infoCand);
        }
      }
      if ((!rawColor || normHex(rawColor).toLowerCase() === '#ffffff') && colorsList[0]) {
        const slot0Cand = normHex(colorsList[0]);
        if (slot0Cand.toLowerCase() !== '#ffffff' && slot0Cand.toLowerCase() !== '#888888') {
          rawColor = slot0Cand;
        }
      }
      if ((!rawColor || normHex(rawColor).toLowerCase() === '#ffffff') && extruderColorsList.length > 0) {
        const extCand = extruderColorsList[slotIdx] || extruderColorsList[0];
        if (extCand && normHex(extCand).toLowerCase() !== '#ffffff') {
          rawColor = normHex(extCand);
        }
      }
      if ((!rawColor || normHex(rawColor).toLowerCase() === '#ffffff') && paintInfo.length > 0) {
        const p = paintInfo[usedIndexOrder] || paintInfo[0];
        if (p && p.paint_color && !(p.paint_color[0] === 255 && p.paint_color[1] === 255 && p.paint_color[2] === 255)) {
          const hexRgb = '#' + p.paint_color.map((c) => c.toString(16).padStart(2, '0')).join('');
          rawColor = normHex(hexRgb);
        }
      }
    }

    usedIndexOrder++;

    const hex = rawColor ? normHex(rawColor) : '#888888';
    const parsedSetting = settingsIdList[slotIdx] ? parseGcodeSettingsId(settingsIdList[slotIdx]) : null;
    const rawType = typesList[slotIdx] ? normalizeMaterialToken(typesList[slotIdx]) : '';
    const materialName = rawType || parsedSetting?.material || 'PLA';
    const brand = parsedSetting?.brand || 'Genérico';
    const finish = parsedSetting?.finish || 'glossy';

    if (!rawColor) {
      manualReviewRequired = true;
      manualReviewReason = `Ranura #${slotIdx + 1} no tiene color definido en el archivo`;
    }

    const d = diameters[slotIdx] || diameters[0] || 1.75;
    const dens = densities[slotIdx] || densities[0] || densityForMaterial(materialName);
    const area = Math.PI * Math.pow(d / 2, 2);
    const volumeCm3 =
      cm3List[slotIdx] && cm3List[slotIdx] > 0
        ? Math.round(cm3List[slotIdx] * 100) / 100
        : Math.round((g / dens) * 100) / 100;
    const lengthMm =
      mmList[slotIdx] && mmList[slotIdx] > 0
        ? Math.round(mmList[slotIdx] * 10) / 10
        : Math.round(((volumeCm3 * 1000) / area) * 10) / 10;

    const match = matchSlotToRoll(
      {
        materialName,
        brand,
        finish,
        colorHex: hex,
        grams: g,
      },
      rolls,
      savedMappings,
    );

    usedSlots.push({
      slotIndex: slotIdx,
      materialName,
      brand,
      finish,
      colorHex: hex,
      gcodeColorHex: hex,
      grams: Math.round(g * 10) / 10,
      lengthMm,
      volumeCm3,
      suggestedRollId: match.suggestedRollId,
      confidence: match.confidence,
      insufficientStock: match.insufficientStock,
      missingGrams: match.missingGrams,
    });
  }

  // Fallback a 1 ranura genérica si no se encontró ninguna con gramos > 0
  if (usedSlots.length === 0) {
    let rawColor = colorsList[0] ? normHex(colorsList[0]) : '';
    if (!rawColor || rawColor.toLowerCase() === '#ffffff' || rawColor.toLowerCase() === '#ffffffff') {
      if (filamentColourInfo[0]) rawColor = normHex(filamentColourInfo[0]);
    }
    const hex = rawColor ? normHex(rawColor) : '#888888';
    const parsedSetting0 = settingsIdList[0] ? parseGcodeSettingsId(settingsIdList[0]) : null;
    const mat = typesList[0] ? normalizeMaterialToken(typesList[0]) : parsedSetting0?.material || 'PLA';
    const brand = parsedSetting0?.brand || 'Genérico';
    const finish = parsedSetting0?.finish || 'glossy';
    const g = totalGramsReported > 0 ? totalGramsReported : 25;
    const d = diameters[0] || 1.75;
    const dens = densities[0] || densityForMaterial(mat);
    const area = Math.PI * Math.pow(d / 2, 2);
    const volumeCm3 = Math.round((g / dens) * 100) / 100;
    const lengthMm = Math.round(((volumeCm3 * 1000) / area) * 10) / 10;

    usedSlots.push({
      slotIndex: 0,
      materialName: mat,
      brand,
      finish,
      colorHex: hex,
      gcodeColorHex: hex,
      grams: g,
      lengthMm,
      volumeCm3,
    });
  }

  // Verificación cruzada con paint_info
  if (paintInfo.length > 0) {
    if (paintInfo.length !== usedSlots.length) {
      manualReviewRequired = true;
      manualReviewReason = `El número de filamentos en paint_info (${paintInfo.length}) no coincide con las ranuras usadas (${usedSlots.length})`;
    }
  }

  const totalGrams = usedSlots.reduce((acc, s) => acc + s.grams, 0);
  const filamentLengthMm = Math.round(usedSlots.reduce((acc, s) => acc + (s.lengthMm || 0), 0) * 10) / 10;
  const filamentVolumeCm3 = Math.round(usedSlots.reduce((acc, s) => acc + (s.volumeCm3 || 0), 0) * 100) / 100;
  const cleanJobName = formatJobName(rawModels, plateIndex, dateLabel);

  // Extraer PID y placa del nombre del archivo o ruta
  let pid: number | undefined = undefined;
  const pidMatch = filename.match(/\.(\d+)\.\d+\.gcode/i) || filepath.match(/#(\d+)#/);
  if (pidMatch) pid = parseInt(pidMatch[1], 10);

  const plateFileMatch = filename.match(/\.\d+\.(\d+)\.gcode/i);
  if (plateFileMatch && plateIndex === 1) {
    plateIndex = parseInt(plateFileMatch[1], 10);
  }

  const modelsKey = rawModels.map(cleanModelName).sort().join('_') || 'plate';
  const sessionKey = `${pid || 'job'}_p${plateIndex}_${modelsKey}`;
  const fileHash = quickHash(content.slice(0, 4000) + content.slice(-4000));

  const validThumbSmall = isValidPngBase64(thumbnail260B64) ? `data:image/png;base64,${thumbnail260B64}` : undefined;
  const validThumbLarge = isValidPngBase64(thumbnail512B64) ? `data:image/png;base64,${thumbnail512B64}` : undefined;

  // Descartar archivos dummy de proyecto .3mf no laminados (0 capas, 0 segundos y sin miniatura válida)
  if (totalLayersCount === 0 && printTimeSeconds === 0 && !validThumbSmall && !validThumbLarge) {
    return null;
  }

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    filename,
    filepath,
    fileHash,
    pid,
    plateIndex,
    sessionKey,
    jobName: cleanJobName,
    modelNames: rawModels.map(cleanModelName),
    slicedAt: slicedAtIso,
    dimensions,
    printTimeSeconds,
    colorChangesCount,
    totalLayersCount,
    thumbnailSmallPath: validThumbSmall,
    thumbnailLargePath: validThumbLarge,
    status: 'unreviewed',
    manualReviewRequired,
    manualReviewReason,
    filaments: usedSlots,
    totalGrams: Math.round(totalGrams * 10) / 10,
    createdAt: nowIso(),
    printedPercent: 100,
    slicerName,
    slicerVersion,
    printerModel,
    nozzleDiameter,
    layerHeight,
    infillPercent,
    silentTimeSeconds,
    sportTimeSeconds,
    filamentLengthMm,
    filamentVolumeCm3,
  };
}
