import type { Finish, Roll } from '../shared/types';
import { hexToRgb, isValidHex, normHex } from './roll';

export type LabColor = [number, number, number]; // [L, a, b]

/** Convierte sRGB [0..255] a espacio CIE XYZ (iluminante D65) */
export function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  let sR = r / 255;
  let sG = g / 255;
  let sB = b / 255;

  sR = sR > 0.04045 ? Math.pow((sR + 0.055) / 1.055, 2.4) : sR / 12.92;
  sG = sG > 0.04045 ? Math.pow((sG + 0.055) / 1.055, 2.4) : sG / 12.92;
  sB = sB > 0.04045 ? Math.pow((sB + 0.055) / 1.055, 2.4) : sB / 12.92;

  sR *= 100;
  sG *= 100;
  sB *= 100;

  const x = sR * 0.4124564 + sG * 0.3575761 + sB * 0.1804375;
  const y = sR * 0.2126729 + sG * 0.7151522 + sB * 0.072175;
  const z = sR * 0.0193339 + sG * 0.119192 + sB * 0.9503041;

  return [x, y, z];
}

/** Convierte CIE XYZ a CIELAB L*a*b* (D65: Xn=95.047, Yn=100.0, Zn=108.883) */
export function xyzToLab(x: number, y: number, z: number): LabColor {
  const refX = 95.047;
  const refY = 100.0;
  const refZ = 108.883;

  let vX = x / refX;
  let vY = y / refY;
  let vZ = z / refZ;

  vX = vX > 0.008856 ? Math.pow(vX, 1 / 3) : 7.787 * vX + 16 / 116;
  vY = vY > 0.008856 ? Math.pow(vY, 1 / 3) : 7.787 * vY + 16 / 116;
  vZ = vZ > 0.008856 ? Math.pow(vZ, 1 / 3) : 7.787 * vZ + 16 / 116;

  const L = 116 * vY - 16;
  const a = 500 * (vX - vY);
  const b = 200 * (vY - vZ);

  return [L, a, b];
}

/** Convierte Hex a CIELAB L*a*b* */
export function hexToLab(hex: string): LabColor {
  const [r, g, b] = hexToRgb(hex);
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

/** Calcula la diferencia perceptual CIE76 Delta E entre dos colores Lab */
export function deltaE(lab1: LabColor, lab2: LabColor): number {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** Distancia de color perceptual Delta E entre dos códigos hexadecimales */
export function colorDeltaE(hexA: string, hexB: string): number {
  const labA = hexToLab(isValidHex(hexA) ? normHex(hexA) : '#888888');
  const labB = hexToLab(isValidHex(hexB) ? normHex(hexB) : '#888888');
  return deltaE(labA, labB);
}

export interface MatchSlotResult {
  suggestedRollId?: string;
  suggestedRoll?: Roll;
  confidence: number; // 0..100
  deltaEVal: number;
  insufficientStock: boolean;
  missingGrams: number;
}

/**
 * Sugerencia de rollo por ranura usada según orden de prioridad:
 * 1. Coincidencia previa recordada (brand + material + colorHex)
 * 2. Marca y Material coinciden
 * 3. Acabado (Silk, PLA+, Matte...) coincide
 * 4. Color más cercano medido en CIELAB (Delta E)
 * 5. Rollo "en_uso" antes que "sellado"
 * 6. Rollo con filamento suficiente
 */
export function getSlotMappingKey(brand: string = '', material: string = '', colorHex: string = ''): string {
  return `${brand.trim().toLowerCase()}:::${material.trim().toLowerCase()}:::${normHex(colorHex).toLowerCase()}`;
}

export function matchSlotToRoll(
  slot: {
    materialName?: string;
    brand?: string;
    finish?: string;
    colorHex: string;
    grams: number;
  },
  rolls: Roll[],
  savedMappings?: Record<string, string>,
): MatchSlotResult {
  if (!rolls || rolls.length === 0) {
    return {
      confidence: 0,
      deltaEVal: 999,
      insufficientStock: false,
      missingGrams: 0,
    };
  }

  // 1. Revisar si hay mapeo recordado previo
  const slotKey = getSlotMappingKey(slot.brand, slot.materialName, slot.colorHex);
  if (savedMappings && savedMappings[slotKey]) {
    const remembered = rolls.find((r) => r.id === savedMappings[slotKey] && r.status !== 'empty');
    if (remembered) {
      const missing = Math.max(0, slot.grams - remembered.remainingWeight);
      return {
        suggestedRollId: remembered.id,
        suggestedRoll: remembered,
        confidence: 100,
        deltaEVal: colorDeltaE(slot.colorHex, remembered.colorHex),
        insufficientStock: missing > 0,
        missingGrams: missing,
      };
    }
  }

  const targetMat = (slot.materialName || 'PLA').trim().toUpperCase();
  const targetBrand = (slot.brand || '').trim().toUpperCase();
  const targetFinish = (slot.finish || '').trim().toLowerCase();
  const targetLab = hexToLab(slot.colorHex);

  let bestRoll: Roll | undefined = undefined;
  let bestScore = -Infinity;
  let bestDeltaE = 999;

  for (const r of rolls) {
    if (r.status === 'empty' && r.remainingWeight <= 0) continue;

    let score = 0;
    const rollMat = r.material.toUpperCase();
    const rollBrand = r.brand.toUpperCase();
    const rollFinish = r.finish.toLowerCase();

    // 1. Marca y material
    if (rollMat === targetMat) score += 40;
    else if (targetMat.includes(rollMat) || rollMat.includes(targetMat)) score += 20;

    if (targetBrand && rollBrand === targetBrand) score += 25;

    // 2. Acabado
    if (targetFinish && rollFinish.includes(targetFinish)) score += 15;
    else if (targetFinish.includes('silk') && rollFinish === 'silk') score += 15;
    else if (targetFinish.includes('matte') && rollFinish === 'matte') score += 15;

    // 3. Distancia de color CIELAB
    const rLab = hexToLab(r.colorHex);
    const dE = deltaE(targetLab, rLab);

    // Delta E: < 3 es imperceptible, < 10 excelente, < 25 razonable, > 50 malo
    const colorScore = Math.max(-40, 50 - dE * 1.5);
    score += colorScore;

    // 4. Estado "en_uso" antes que "sellado"
    if (r.status === 'in_use') score += 12;
    else if (r.status === 'dry') score += 8;
    else if (r.status === 'sealed') score += 4;

    // 5. Filamento suficiente
    if (r.remainingWeight >= slot.grams) score += 10;
    else score -= 15;

    if (score > bestScore) {
      bestScore = score;
      bestRoll = r;
      bestDeltaE = dE;
    }
  }

  if (!bestRoll) {
    return {
      confidence: 0,
      deltaEVal: 999,
      insufficientStock: false,
      missingGrams: 0,
    };
  }

  // Confianza 0..100
  const normalizedConfidence = Math.max(0, Math.min(100, Math.round(bestScore)));
  const missing = Math.max(0, slot.grams - bestRoll.remainingWeight);

  return {
    suggestedRollId: bestRoll.id,
    suggestedRoll: bestRoll,
    confidence: normalizedConfidence,
    deltaEVal: Math.round(bestDeltaE * 10) / 10,
    insufficientStock: missing > 0,
    missingGrams: missing,
  };
}
