import type { Language, Material } from '../shared/types';
import { MATERIALS } from '../shared/types';

export type HygroscopicLevel = 'low' | 'medium' | 'high';
export type SpoolType = 'plastic' | 'cardboard' | 'reusable';

export interface MaterialPreset {
  material: Material;
  densityGcm3: number;
  nozzleTempRange: [number, number];
  bedTempRange: [number, number];
  dryingTempC: number;
  dryingHours: number;
  requiresEnclosure: boolean;
  requiresHardenedNozzle: boolean;
  hygroscopicLevel: HygroscopicLevel;
  notes: Record<Language, string>;
}

export interface SpoolTarePreset {
  id: string;
  brand: string;
  spoolType: SpoolType;
  tareGrams: number;
  capacityGrams: number;
  label: Record<Language, string>;
}

export interface NetFromTareResult {
  grossGrams: number;
  tareGrams: number;
  netGrams: number;
  remainingPct: number | null;
  isBelowTare: boolean;
  exceedsCapacity: boolean;
}

export const MATERIAL_PRESETS: Record<Material, MaterialPreset> = {
  PLA: {
    material: 'PLA',
    densityGcm3: 1.24,
    nozzleTempRange: [195, 220],
    bedTempRange: [50, 65],
    dryingTempC: 45,
    dryingHours: 4,
    requiresEnclosure: false,
    requiresHardenedNozzle: false,
    hygroscopicLevel: 'low',
    notes: {
      es: 'Fácil de imprimir con ventilación de capa al 100%. Almacenar seco si supera varios meses.',
      en: 'Easy to print with 100% part cooling. Store dry for long-term shelf life.',
      pt: 'Fácil de imprimir com ventilação de camada a 100%. Armazenar seco em longos períodos.',
    },
  },
  'PLA+': {
    material: 'PLA+',
    densityGcm3: 1.24,
    nozzleTempRange: [205, 230],
    bedTempRange: [55, 65],
    dryingTempC: 50,
    dryingHours: 4,
    requiresEnclosure: false,
    requiresHardenedNozzle: false,
    hygroscopicLevel: 'low',
    notes: {
      es: 'Mayor tenacidad que el PLA estándar. Mantener buena ventilación de capa para voladizos.',
      en: 'Higher toughness than standard PLA. Keep strong part cooling for overhangs.',
      pt: 'Maior tenacidade que o PLA padrão. Manter boa ventilação de camada para balanços.',
    },
  },
  PETG: {
    material: 'PETG',
    densityGcm3: 1.27,
    nozzleTempRange: [230, 250],
    bedTempRange: [70, 85],
    dryingTempC: 65,
    dryingHours: 5,
    requiresEnclosure: false,
    requiresHardenedNozzle: false,
    hygroscopicLevel: 'medium',
    notes: {
      es: 'Secar ante aparición de hilos o burbujas. Usar laca o lámina texturizada para evitar sobre-adhesión en PEI liso.',
      en: 'Dry if stringing or popping occurs. Use a textured sheet or release agent on smooth PEI.',
      pt: 'Secar se surgirem fios ou bolhas. Usar chapa texturizada ou desmoldante em PEI liso.',
    },
  },
  ABS: {
    material: 'ABS',
    densityGcm3: 1.04,
    nozzleTempRange: [240, 260],
    bedTempRange: [95, 110],
    dryingTempC: 80,
    dryingHours: 4,
    requiresEnclosure: true,
    requiresHardenedNozzle: false,
    hygroscopicLevel: 'low',
    notes: {
      es: 'Requiere cámara cerrada, mínima ventilación de capa y extracción/ventilación del área de trabajo.',
      en: 'Requires an enclosure, minimal part cooling, and proper room ventilation.',
      pt: 'Requer câmara fechada, ventilação mínima na peça e boa ventilação do ambiente.',
    },
  },
  ASA: {
    material: 'ASA',
    densityGcm3: 1.07,
    nozzleTempRange: [240, 260],
    bedTempRange: [90, 110],
    dryingTempC: 80,
    dryingHours: 4,
    requiresEnclosure: true,
    requiresHardenedNozzle: false,
    hygroscopicLevel: 'low',
    notes: {
      es: 'Resistente a rayos UV y exterior. Imprimir en cámara cerrada y ventilar el recinto.',
      en: 'UV- and weather-resistant for outdoor parts. Print enclosed with workspace ventilation.',
      pt: 'Resistente a UV e intempéries. Imprimir em câmara fechada com ventilação do local.',
    },
  },
  TPU: {
    material: 'TPU',
    densityGcm3: 1.21,
    nozzleTempRange: [210, 230],
    bedTempRange: [40, 60],
    dryingTempC: 55,
    dryingHours: 6,
    requiresEnclosure: false,
    requiresHardenedNozzle: false,
    hygroscopicLevel: 'high',
    notes: {
      es: 'Muy higroscópico; imprimir lento (20–40 mm/s) preferiblemente con extrusor directo y pocas retracciones.',
      en: 'Highly hygroscopic; print slowly (20–40 mm/s), ideally on direct-drive with low retraction.',
      pt: 'Muito higroscópico; imprimir devagar (20–40 mm/s), de preferência em extrusora direta.',
    },
  },
  Nylon: {
    material: 'Nylon',
    densityGcm3: 1.14,
    nozzleTempRange: [250, 270],
    bedTempRange: [70, 90],
    dryingTempC: 75,
    dryingHours: 10,
    requiresEnclosure: true,
    requiresHardenedNozzle: false,
    hygroscopicLevel: 'high',
    notes: {
      es: 'Absorbe humedad rápidamente; imprimir directamente desde caja seca y guardar con desecante.',
      en: 'Absorbs moisture rapidly; print directly from a dry box and store with desiccant.',
      pt: 'Absorve umidade rápido; imprimir direto de caixa seca e guardar com sílica gel.',
    },
  },
  PC: {
    material: 'PC',
    densityGcm3: 1.20,
    nozzleTempRange: [260, 290],
    bedTempRange: [100, 120],
    dryingTempC: 80,
    dryingHours: 8,
    requiresEnclosure: true,
    requiresHardenedNozzle: false,
    hygroscopicLevel: 'high',
    notes: {
      es: 'Requiere hotend totalmente metálico, cámara caliente y adherente específico para evitar warping.',
      en: 'Needs an all-metal hotend, heated enclosure, and bed adhesive to prevent warping.',
      pt: 'Exige hotend totalmente metálico, câmara aquecida e adesivo de mesa contra empenamento.',
    },
  },
  HIPS: {
    material: 'HIPS',
    densityGcm3: 1.04,
    nozzleTempRange: [230, 250],
    bedTempRange: [90, 110],
    dryingTempC: 70,
    dryingHours: 4,
    requiresEnclosure: true,
    requiresHardenedNozzle: false,
    hygroscopicLevel: 'low',
    notes: {
      es: 'Útil como soporte soluble en D-limoneno para ABS. Imprimir en cámara cerrada con ventilación.',
      en: 'Commonly used as D-limonene-soluble support for ABS. Print enclosed with ventilation.',
      pt: 'Útil como suporte solúvel em D-limoneno para ABS. Imprimir em câmara fechada e ventilada.',
    },
  },
  PVA: {
    material: 'PVA',
    densityGcm3: 1.19,
    nozzleTempRange: [185, 205],
    bedTempRange: [45, 60],
    dryingTempC: 45,
    dryingHours: 6,
    requiresEnclosure: false,
    requiresHardenedNozzle: false,
    hygroscopicLevel: 'high',
    notes: {
      es: 'Soporte soluble en agua; muy sensible a la humedad. Sellar inmediatamente tras imprimir.',
      en: 'Water-soluble support material; extremely moisture-sensitive. Seal right after printing.',
      pt: 'Suporte solúvel em água; muito sensível à umidade. Selar imediatamente após o uso.',
    },
  },
  'PLA-CF': {
    material: 'PLA-CF',
    densityGcm3: 1.29,
    nozzleTempRange: [210, 230],
    bedTempRange: [50, 65],
    dryingTempC: 50,
    dryingHours: 5,
    requiresEnclosure: false,
    requiresHardenedNozzle: true,
    hygroscopicLevel: 'medium',
    notes: {
      es: 'Abrasivo: usar boquilla de acero endurecido (>= 0.4 mm) para evitar desgaste y atascos.',
      en: 'Abrasive: use a hardened steel nozzle (>= 0.4 mm) to prevent wear and clogs.',
      pt: 'Abrasivo: usar bico de aço temperado (>= 0,4 mm) para evitar desgaste e entupimentos.',
    },
  },
  Otro: {
    material: 'Otro',
    densityGcm3: 1.24,
    nozzleTempRange: [200, 230],
    bedTempRange: [50, 70],
    dryingTempC: 50,
    dryingHours: 4,
    requiresEnclosure: false,
    requiresHardenedNozzle: false,
    hygroscopicLevel: 'low',
    notes: {
      es: 'Valores de referencia genéricos. Revisar la ficha técnica del fabricante antes de secar o laminar.',
      en: 'Generic baseline values. Check the manufacturer datasheet before drying or slicing.',
      pt: 'Valores de referência genéricos. Consulte a ficha técnica do fabricante antes de secar ou fatiar.',
    },
  },
};

export const SPOOL_TARE_PRESETS: readonly SpoolTarePreset[] = [
  {
    id: 'bambu-reusable',
    brand: 'Bambu Lab',
    spoolType: 'reusable',
    tareGrams: 250,
    capacityGrams: 1000,
    label: {
      es: 'Bambu Lab Reutilizable (~250 g)',
      en: 'Bambu Lab Reusable (~250 g)',
      pt: 'Bambu Lab Reutilizável (~250 g)',
    },
  },
  {
    id: 'anycubic-plastic',
    brand: 'Anycubic',
    spoolType: 'plastic',
    tareGrams: 220,
    capacityGrams: 1000,
    label: {
      es: 'Anycubic Plástico (~220 g)',
      en: 'Anycubic Plastic (~220 g)',
      pt: 'Anycubic Plástico (~220 g)',
    },
  },
  {
    id: 'anycubic-cardboard',
    brand: 'Anycubic',
    spoolType: 'cardboard',
    tareGrams: 140,
    capacityGrams: 1000,
    label: {
      es: 'Anycubic Cartón (~140 g)',
      en: 'Anycubic Cardboard (~140 g)',
      pt: 'Anycubic Papelão (~140 g)',
    },
  },
  {
    id: 'sunlu-plastic',
    brand: 'SUNLU',
    spoolType: 'plastic',
    tareGrams: 200,
    capacityGrams: 1000,
    label: {
      es: 'SUNLU Plástico (~200 g)',
      en: 'SUNLU Plastic (~200 g)',
      pt: 'SUNLU Plástico (~200 g)',
    },
  },
  {
    id: 'esun-plastic',
    brand: 'eSUN',
    spoolType: 'plastic',
    tareGrams: 230,
    capacityGrams: 1000,
    label: {
      es: 'eSUN Plástico (~230 g)',
      en: 'eSUN Plastic (~230 g)',
      pt: 'eSUN Plástico (~230 g)',
    },
  },
  {
    id: 'esun-cardboard',
    brand: 'eSUN',
    spoolType: 'cardboard',
    tareGrams: 150,
    capacityGrams: 1000,
    label: {
      es: 'eSUN Cartón (~150 g)',
      en: 'eSUN Cardboard (~150 g)',
      pt: 'eSUN Papelão (~150 g)',
    },
  },
  {
    id: 'prusament',
    brand: 'Prusament',
    spoolType: 'plastic',
    tareGrams: 201,
    capacityGrams: 1000,
    label: {
      es: 'Prusament (~201 g)',
      en: 'Prusament (~201 g)',
      pt: 'Prusament (~201 g)',
    },
  },
  {
    id: 'polymaker-cardboard',
    brand: 'Polymaker',
    spoolType: 'cardboard',
    tareGrams: 140,
    capacityGrams: 1000,
    label: {
      es: 'Polymaker Cartón (~140 g)',
      en: 'Polymaker Cardboard (~140 g)',
      pt: 'Polymaker Papelão (~140 g)',
    },
  },
  {
    id: 'elegoo-cardboard',
    brand: 'Elegoo',
    spoolType: 'cardboard',
    tareGrams: 165,
    capacityGrams: 1000,
    label: {
      es: 'Elegoo Cartón (~165 g)',
      en: 'Elegoo Cardboard (~165 g)',
      pt: 'Elegoo Papelão (~165 g)',
    },
  },
  {
    id: 'generic-plastic-1kg',
    brand: 'Genérico',
    spoolType: 'plastic',
    tareGrams: 220,
    capacityGrams: 1000,
    label: {
      es: 'Genérico 1 kg Plástico (~220 g)',
      en: 'Generic 1 kg Plastic (~220 g)',
      pt: 'Genérico 1 kg Plástico (~220 g)',
    },
  },
  {
    id: 'generic-cardboard-1kg',
    brand: 'Genérico',
    spoolType: 'cardboard',
    tareGrams: 150,
    capacityGrams: 1000,
    label: {
      es: 'Genérico 1 kg Cartón (~150 g)',
      en: 'Generic 1 kg Cardboard (~150 g)',
      pt: 'Genérico 1 kg Papelão (~150 g)',
    },
  },
];

function isPos(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

export function getMaterialPreset(material: Material | string): MaterialPreset {
  if (typeof material === 'string') {
    const trimmed = material.trim();
    if (Object.prototype.hasOwnProperty.call(MATERIAL_PRESETS, trimmed)) {
      return MATERIAL_PRESETS[trimmed as Material];
    }
    const upper = trimmed.toUpperCase();
    for (const m of MATERIALS) {
      if (m.toUpperCase() === upper) {
        return MATERIAL_PRESETS[m];
      }
    }
    if (
      upper === 'PA' ||
      upper.startsWith('PA6') ||
      upper.startsWith('PA12') ||
      upper.startsWith('PA-') ||
      upper.includes('NYLON')
    ) {
      return MATERIAL_PRESETS.Nylon;
    }
    if (upper === 'POLYCARBONATE' || upper.startsWith('PC-') || upper.startsWith('PC ')) {
      return MATERIAL_PRESETS.PC;
    }
    if (upper === 'CF-PLA' || upper === 'CF PLA' || upper === 'PLA CF' || upper.includes('PLA-CF')) {
      return MATERIAL_PRESETS['PLA-CF'];
    }
    if (upper.includes('PETG')) return MATERIAL_PRESETS.PETG;
    if (upper.includes('PLA+')) return MATERIAL_PRESETS['PLA+'];
    if (upper.includes('PLA')) return MATERIAL_PRESETS.PLA;
    if (upper.includes('ABS')) return MATERIAL_PRESETS.ABS;
    if (upper.includes('ASA')) return MATERIAL_PRESETS.ASA;
    if (upper.includes('TPU') || upper.includes('FLEX')) return MATERIAL_PRESETS.TPU;
    if (upper.includes('HIPS')) return MATERIAL_PRESETS.HIPS;
    if (upper.includes('PVA')) return MATERIAL_PRESETS.PVA;
  }
  return MATERIAL_PRESETS.Otro;
}

export function getMaterialDensity(material: Material | string): number {
  return getMaterialPreset(material).densityGcm3;
}

export function gramsToCm3(grams: number, densityGcm3: number = 1.24): number {
  if (!isPos(grams) || !isPos(densityGcm3)) return 0;
  const res = grams / densityGcm3;
  return Number.isFinite(res) ? res : 0;
}

export function cm3ToGrams(cm3: number, densityGcm3: number = 1.24): number {
  if (!isPos(cm3) || !isPos(densityGcm3)) return 0;
  const res = cm3 * densityGcm3;
  return Number.isFinite(res) ? res : 0;
}

export function gramsToMeters(grams: number, diameterMm: number = 1.75, densityGcm3: number = 1.24): number {
  if (!isPos(grams) || !isPos(diameterMm) || !isPos(densityGcm3)) return 0;
  const areaMm2 = Math.PI * (diameterMm / 2) ** 2;
  const res = grams / densityGcm3 / areaMm2;
  return Number.isFinite(res) ? res : 0;
}

export function metersToGrams(meters: number, diameterMm: number = 1.75, densityGcm3: number = 1.24): number {
  if (!isPos(meters) || !isPos(diameterMm) || !isPos(densityGcm3)) return 0;
  const areaMm2 = Math.PI * (diameterMm / 2) ** 2;
  const res = meters * areaMm2 * densityGcm3;
  return Number.isFinite(res) ? res : 0;
}

export function estimateNetFromTare(
  grossGrams: number,
  tareGrams: number,
  spoolCapacityGrams?: number,
): NetFromTareResult {
  const gross = Number.isFinite(grossGrams) ? Math.max(0, grossGrams) : 0;
  const tare = Number.isFinite(tareGrams) ? Math.max(0, tareGrams) : 0;
  const isBelowTare = tare > 0 && gross < tare;
  const netGrams = Math.max(0, gross - tare);

  if (spoolCapacityGrams !== undefined && isPos(spoolCapacityGrams)) {
    const exceedsCapacity = netGrams > spoolCapacityGrams;
    const remainingPct = Math.min(100, Math.max(0, (netGrams / spoolCapacityGrams) * 100));
    return {
      grossGrams: gross,
      tareGrams: tare,
      netGrams,
      remainingPct,
      isBelowTare,
      exceedsCapacity,
    };
  }

  return {
    grossGrams: gross,
    tareGrams: tare,
    netGrams,
    remainingPct: null,
    isBelowTare,
    exceedsCapacity: false,
  };
}
