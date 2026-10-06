import type { GcodeFilamentMatch, GcodeJob, GcodeJobStatus, Roll } from '../shared/types';
import { hexToRgb, isValidHex, normHex, uid, nowIso } from './roll';
import { colorDeltaE, matchSlotToRoll } from './colorMath';

export function parsePrintTimeString(timeStr: string): number {
  if (!timeStr) return 0;
  if (/^\d+$/.test(timeStr.trim())) return parseInt(timeStr.trim(), 10);
  let total = 0;
  const d = timeStr.match(/(\d+)\s*d/);
  const h = timeStr.match(/(\d+)\s*h/);
  const m = timeStr.match(/(\d+)\s*m/);
  const s = timeStr.match(/(\d+)\s*s/);
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

/** Limpia sufijos de Anycubic como _id_0_copy_0 y extensiones .stl/.3mf/.step */
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

/** Extrae metadatos de Anycubic Slicer Next a partir de un string de configuración */
export function parseGcodeSettingsId(raw: string): { brand: string; material: string; finish: string } {
  // Ej: "Anycubic PLA Silk @Anycubic Kobra X 0.4 nozzle"
  const clean = raw.replace(/^"|"$/g, '').trim();
  const beforeAt = clean.split(' @ ')[0] || clean;

  let brand = 'Anycubic';
  if (beforeAt.startsWith('Anycubic')) brand = 'Anycubic';
  else if (beforeAt.startsWith('eSUN')) brand = 'eSUN';
  else if (beforeAt.startsWith('Bambu')) brand = 'Bambu Lab';
  else if (beforeAt.startsWith('Sunlu')) brand = 'SUNLU';
  else if (beforeAt.startsWith('Prusament')) brand = 'Prusament';
  else {
    const parts = beforeAt.split(' ');
    if (parts.length > 1) brand = parts[0];
  }

  let finish = 'glossy';
  const lower = beforeAt.toLowerCase();
  if (lower.includes('silk') || lower.includes('seda')) finish = 'silk';
  else if (lower.includes('matte') || lower.includes('mate')) finish = 'matte';
  else if (lower.includes('glitter') || lower.includes('sparkle')) finish = 'glitter';
  else if (lower.includes('translucent') || lower.includes('transparent')) finish = 'translucent';

  let material = 'PLA';
  if (lower.includes('pla+')) material = 'PLA+';
  else if (lower.includes('petg')) material = 'PETG';
  else if (lower.includes('abs')) material = 'ABS';
  else if (lower.includes('asa')) material = 'ASA';
  else if (lower.includes('tpu')) material = 'TPU';
  else if (lower.includes('pc')) material = 'PC';
  else if (lower.includes('nylon')) material = 'Nylon';

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

/**
 * Valida si un bloque base64 representa un PNG válido (firma 89 50 4E 47 0D 0A 1A 0A)
 */
export function isValidPngBase64(b64: string): boolean {
  if (!b64 || b64.length < 32) return false;
  try {
    const clean = b64.replace(/\s+/g, '');
    // Los primeros 4 bytes de un PNG en Base64 siempre son 'iVBORw0KGgo'
    if (!clean.startsWith('iVBORw0KGgo')) return false;
    // Comprueba si contiene el chunk IEND hacia el final
    const tail = clean.slice(-80);
    return tail.includes('IEND') || tail.length > 10;
  } catch {
    return false;
  }
}

/**
 * Parser de Anycubic Slicer Next 2.0+ (y OrcaSlicer)
 * Maneja archivos .metadata y .gcode directamente.
 */
export function parseGcodeText(
  content: string,
  filename: string,
  filepath: string = '',
  rolls: Roll[] = [],
  savedMappings?: Record<string, string>,
): GcodeJob | null {
  const lines = content.split(/\r?\n/);
  // Escaneamos encabezado y cola si el archivo es largo
  const headLines = lines.slice(0, 500);
  const tailLines = lines.length > 500 ? lines.slice(-500) : [];
  const scanned = lines.length <= 1000 ? lines : [...headLines, ...tailLines];

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
  let dimensions: { x: number; y: number; z: number } | undefined = undefined;

  let thumbnail260B64 = '';
  let thumbnail512B64 = '';

  let inThumbnail260 = false;
  let inThumbnail512 = false;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();

    // Parseo de bloques de miniaturas
    if (l.startsWith('; thumbnail begin 260x260')) {
      inThumbnail260 = true;
      inThumbnail512 = false;
      continue;
    } else if (l.startsWith('; thumbnail begin 512x512')) {
      inThumbnail512 = true;
      inThumbnail260 = false;
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

    if (!l.startsWith(';')) continue;

    // Header info: generated by
    if (l.includes('generated by') && l.includes(' on ')) {
      const match = l.match(/on (\d{4}-\d{2}-\d{2}) at (\d{2}:\d{2}:\d{2})/);
      if (match) {
        slicedAtIso = `${match[1]}T${match[2]}`;
        dateLabel = `${match[1]} ${match[2]}`;
      }
    }

    // source_info JSON
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

    // paint_info JSON
    if (l.startsWith('; paint_info =')) {
      try {
        const jsonStr = l.slice(l.indexOf('['));
        paintInfo = JSON.parse(jsonStr);
      } catch {
        /* ignore */
      }
    }

    // Gramos y dimensiones de filamento
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
    if (cleanL.startsWith('filament_density') && cleanL.includes('=')) {
      densities = cleanL.split('=')[1].split(',').map((s) => parseFloat(s.trim())).filter(Number.isFinite);
    }
    if (cleanL.startsWith('filament_diameter') && cleanL.includes('=')) {
      diameters = cleanL.split('=')[1].split(',').map((s) => parseFloat(s.trim())).filter(Number.isFinite);
    }

    // Colores de filamento
    if (cleanL.match(/^filament_colou?r\s*=/i)) {
      colorsList = cleanL.split('=')[1].split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    } else if (cleanL.match(/^filament_colou?r_info\s*=/i)) {
      filamentColourInfo = cleanL.split('=')[1].split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    } else if (cleanL.match(/^extruder_colou?r\s*=/i)) {
      extruderColorsList = cleanL.split('=')[1].split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    }

    // Tipos de filamento
    if (cleanL.startsWith('filament_type') && cleanL.includes('=')) {
      typesList = cleanL.split('=')[1].split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    }

    // Filament settings ID
    if (cleanL.startsWith('filament_settings_id') && cleanL.includes('=')) {
      settingsIdList = cleanL.split('=')[1].split(';').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    }

    // Cambios de color y capas
    if (l.includes('total filament change') && l.includes('=')) {
      colorChangesCount = parseInt(l.split('=')[1].trim(), 10) || 0;
    }
    if (l.includes('total layers count') && l.includes('=')) {
      totalLayersCount = parseInt(l.split('=')[1].trim(), 10) || 0;
    } else if (l.includes('total layer number:') && totalLayersCount === 0) {
      totalLayersCount = parseInt(l.split(':')[1].trim(), 10) || 0;
    }

    // Tiempo de impresión (estimación normal)
    if (l.includes('estimated printing time (normal mode)') && l.includes('=')) {
      printTimeSeconds = parsePrintTimeString(l.split('=')[1].trim());
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

  // Fallback si falta [g]: cálculo volumétrico por ranura: g = π*(d/2)² * mm/1000 * densidad
  if (gramsList.length === 0 || gramsList.every((g) => g === 0)) {
    if (mmList.length > 0 && mmList.some((mm) => mm > 0)) {
      gramsList = mmList.map((mm, idx) => {
        const d = diameters[idx] || diameters[0] || 1.75;
        const dens = densities[idx] || densities[0] || 1.24;
        const area = Math.PI * Math.pow(d / 2, 2);
        const cm3 = (area * mm) / 1000;
        return Math.round(cm3 * dens * 100) / 100;
      });
    } else if (cm3List.length > 0 && cm3List.some((c) => c > 0)) {
      gramsList = cm3List.map((c, idx) => {
        const dens = densities[idx] || densities[0] || 1.24;
        return Math.round(c * dens * 100) / 100;
      });
    } else if (totalGramsReported > 0) {
      gramsList = [totalGramsReported];
    }
  }

  // Cross-check y detección de "Revisar manualmente"
  let manualReviewRequired = false;
  let manualReviewReason: string | undefined = undefined;

  // 1. Longitud de listas
  if (colorsList.length > 0 && typesList.length > 0 && colorsList.length !== typesList.length) {
    manualReviewRequired = true;
    manualReviewReason = 'Discrepancia en lista de colores y materiales del laminador';
  }

  // 2. Extraer ranuras usadas (donde gramos > 0)
  const usedSlots: GcodeFilamentMatch[] = [];
  const maxSlots = Math.max(gramsList.length, colorsList.length, typesList.length, 1);
  let usedIndexOrder = 0;

  for (let slotIdx = 0; slotIdx < maxSlots; slotIdx++) {
    const g = gramsList[slotIdx] || 0;
    if (g <= 0) continue; // Ranura no usada

    let rawColor = colorsList[slotIdx] ? normHex(colorsList[slotIdx]) : '';
    const isPlaceholder =
      !rawColor ||
      rawColor.toLowerCase() === '#ffffffff' ||
      rawColor.toLowerCase() === '#ffffff' ||
      rawColor.toLowerCase() === '#888888';

    // Si el color en colorsList es placeholder blanco/gris o no existe, resolver color real
    if (isPlaceholder) {
      // Prioridad 1: color real reportado en filament_colour_info
      if (filamentColourInfo.length > 0) {
        const infoCand = filamentColourInfo[usedIndexOrder] || filamentColourInfo[0];
        if (infoCand && normHex(infoCand).toLowerCase() !== '#ffffff') {
          rawColor = normHex(infoCand);
        }
      }
      // Prioridad 2: si es impresión monocroma pero slot 0 tenía el color asignado
      if ((!rawColor || normHex(rawColor).toLowerCase() === '#ffffff') && colorsList[0]) {
        const slot0Cand = normHex(colorsList[0]);
        if (slot0Cand.toLowerCase() !== '#ffffff' && slot0Cand.toLowerCase() !== '#888888') {
          rawColor = slot0Cand;
        }
      }
      // Prioridad 3: extruder_colour
      if ((!rawColor || normHex(rawColor).toLowerCase() === '#ffffff') && extruderColorsList.length > 0) {
        const extCand = extruderColorsList[slotIdx] || extruderColorsList[0];
        if (extCand && normHex(extCand).toLowerCase() !== '#ffffff') {
          rawColor = normHex(extCand);
        }
      }
      // Prioridad 4: paint_info si tiene color no-blanco
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
    const materialName = typesList[slotIdx] || parsedSetting?.material || 'PLA';
    const brand = parsedSetting?.brand || 'Anycubic';
    const finish = parsedSetting?.finish || 'glossy';

    if (!rawColor) {
      manualReviewRequired = true;
      manualReviewReason = `Ranura #${slotIdx + 1} no tiene color definido en el archivo`;
    }

    // Match inteligente contra las bobinas en inventario
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
      suggestedRollId: match.suggestedRollId,
      confidence: match.confidence,
      insufficientStock: match.insufficientStock,
      missingGrams: match.missingGrams,
    });
  }

  // Si no se encontró ninguna ranura con gramos > 0, fallback a 1 ranura genérica
  if (usedSlots.length === 0) {
    let rawColor = colorsList[0] ? normHex(colorsList[0]) : '';
    if (!rawColor || rawColor.toLowerCase() === '#ffffff' || rawColor.toLowerCase() === '#ffffffff') {
      if (filamentColourInfo[0]) rawColor = normHex(filamentColourInfo[0]);
    }
    const hex = rawColor ? normHex(rawColor) : '#888888';
    const mat = typesList[0] || 'PLA';
    const g = totalGramsReported > 0 ? totalGramsReported : 25;
    usedSlots.push({
      slotIndex: 0,
      materialName: mat,
      brand: 'Anycubic',
      finish: 'glossy',
      colorHex: hex,
      gcodeColorHex: hex,
      grams: g,
    });
  }

  // 3. Verificación cruzada con paint_info
  if (paintInfo.length > 0) {
    if (paintInfo.length !== usedSlots.length) {
      manualReviewRequired = true;
      manualReviewReason = `El número de filamentos en paint_info (${paintInfo.length}) no coincide con las ranuras usadas (${usedSlots.length})`;
    }
  }

  const totalGrams = usedSlots.reduce((acc, s) => acc + s.grams, 0);
  const cleanJobName = formatJobName(rawModels, plateIndex, dateLabel);

  // Extraer PID y placa del nombre del archivo o ruta
  let pid: number | undefined = undefined;
  const pidMatch = filename.match(/\.(\d+)\.\d+\.gcode/i) || filepath.match(/#(\d+)#/);
  if (pidMatch) pid = parseInt(pidMatch[1], 10);

  const plateFileMatch = filename.match(/\.\d+\.(\d+)\.gcode/i);
  if (plateFileMatch && plateIndex === 1) {
    plateIndex = parseInt(plateFileMatch[1], 10);
  }

  // Clave de sesión para agrupar versiones repetidas (mismo PID + placa + modelos)
  const modelsKey = rawModels.map(cleanModelName).sort().join('_') || 'plate';
  const sessionKey = `${pid || 'job'}_p${plateIndex}_${modelsKey}`;
  const fileHash = quickHash(content.slice(0, 4000) + content.slice(-4000));

  // Validar miniaturas
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
  };
}
