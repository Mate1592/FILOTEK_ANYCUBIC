import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

// Import our TypeScript modules using tsx/node ESM
import {
  parseGcodeText,
  parseGcodeSettingsId,
  formatPrintTime,
  cleanModelName,
  formatJobName,
  isValidPngBase64,
} from '../src/lib/gcodeParser.ts';
import { colorDeltaE, hexToLab, matchSlotToRoll, getSlotMappingKey } from '../src/lib/colorMath.ts';
import {
  extractGcodeText,
  extractGcodePlatesFrom3mf,
  parseGcodePlatesFromDisk,
  parseGcodeFileFromDisk,
  safeReadGcodeFile,
} from '../electron/gcode.ts';

console.log('🧪 Corriendo suite de pruebas avanzadas G-code / CIELAB / Anycubic Kobra X...\n');

const fixturesDir = path.resolve('test-fixtures');

// -------------------------------------------------------------
// Test 1: CIELAB Delta E y conversiones de color
// -------------------------------------------------------------
console.log('▶ Test 1: Delta E (CIELAB) y conversión de color...');
{
  const white = '#ffffff';
  const black = '#000000';
  const labWhite = hexToLab(white);
  const labBlack = hexToLab(black);

  assert(Math.abs(labWhite[0] - 100) < 0.1, 'Luminancia de blanco debe ser ~100');
  assert(Math.abs(labBlack[0] - 0) < 0.1, 'Luminancia de negro debe ser ~0');

  const distWhiteBlack = colorDeltaE(white, black);
  assert(distWhiteBlack > 90, `Distancia entre blanco y negro debe ser > 90, obtenida: ${distWhiteBlack}`);

  const identicalDist = colorDeltaE('#10b981', '#10b981');
  assert.equal(identicalDist, 0, 'Distancia entre colores idénticos debe ser 0');

  const emerald1 = '#10b981';
  const emerald2 = '#059669';
  const distSimilar = colorDeltaE(emerald1, emerald2);
  assert(distSimilar > 0 && distSimilar < 20, `Distancia entre tonos similares debe ser baja (<20), obtenida: ${distSimilar}`);

  console.log(`  ✓ Delta E blanco-negro: ${distWhiteBlack.toFixed(1)}, tonos similares: ${distSimilar.toFixed(1)}`);
}

// -------------------------------------------------------------
// Test 2: matchSlotToRoll (prioridad de mapeo, coincidencia, stock)
// -------------------------------------------------------------
console.log('▶ Test 2: Algoritmo de asignación de bobinas (matchSlotToRoll)...');
{
  const mockRolls = [
    {
      id: 'roll-orange-1',
      brand: 'Anycubic',
      material: 'PLA',
      finish: 'glossy',
      colorHex: '#F2754E',
      colorName: 'Anycubic Naranja Fuego',
      remainingWeight: 500,
      initialWeight: 1000,
      status: 'in_use',
    },
    {
      id: 'roll-orange-low',
      brand: 'Anycubic',
      material: 'PLA',
      finish: 'glossy',
      colorHex: '#F2754E',
      colorName: 'Anycubic Naranja Agotándose',
      remainingWeight: 20,
      initialWeight: 1000,
      status: 'in_use',
    },
    {
      id: 'roll-green-1',
      brand: 'eSUN',
      material: 'PETG',
      finish: 'glossy',
      colorHex: '#10B981',
      colorName: 'eSUN Verde Pino',
      remainingWeight: 800,
      initialWeight: 1000,
      status: 'in_use',
    },
  ];

  // Caso 1: Coincidencia exacta con stock suficiente
  const match1 = matchSlotToRoll(
    { materialName: 'PLA', brand: 'Anycubic', finish: 'glossy', colorHex: '#F2754E', grams: 50 },
    mockRolls,
  );
  assert.equal(match1.suggestedRollId, 'roll-orange-1');
  assert(match1.confidence >= 80, `Confianza debe ser >= 80, obtenida: ${match1.confidence}`);
  assert.equal(match1.insufficientStock, false);

  // Caso 2: Stock insuficiente cuando solo hay una bobina pequeña
  const matchLow = matchSlotToRoll(
    { materialName: 'PLA', brand: 'Anycubic', finish: 'glossy', colorHex: '#F2754E', grams: 50 },
    [mockRolls[1]], // solo la de 20g
  );
  assert.equal(matchLow.suggestedRollId, 'roll-orange-low');
  assert.equal(matchLow.insufficientStock, true);
  assert.equal(matchLow.missingGrams, 30);

  // Caso 3: Mapeo recordado por usuario
  const key = getSlotMappingKey('Anycubic', 'PLA', '#F2754E');
  const savedMappings = {
    [key]: 'roll-green-1',
  };
  const matchSaved = matchSlotToRoll(
    { materialName: 'PLA', brand: 'Anycubic', finish: 'glossy', colorHex: '#F2754E', grams: 10 },
    mockRolls,
    savedMappings,
  );
  assert.equal(matchSaved.suggestedRollId, 'roll-green-1');
  assert(matchSaved.confidence >= 80, `Confianza de mapeo guardado debe ser >= 80, obtenida: ${matchSaved.confidence}`);

  console.log('  ✓ Algoritmo de asignación responde correctamente con exactitud, stock y memoria.');
}

// -------------------------------------------------------------
// Test 3: Fixture 1 - multicolor_real.metadata (Anycubic Kobra X real)
// -------------------------------------------------------------
console.log('▶ Test 3: multicolor_real.metadata...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'multicolor_real.metadata'), 'utf8');
  const job = parseGcodeText(raw, '.21552.2.gcode.metadata', 'C:/Temp/anycubic/Metadata/.21552.2.gcode.metadata');

  assert.equal(job.pid, 21552);
  assert.equal(job.plateIndex, 2);
  assert(job.filaments.length >= 2, `Debe haber al menos 2 ranuras usadas, encontradas: ${job.filaments.length}`);
  assert(job.totalGrams > 0, `Total gramos debe ser > 0, obtenido: ${job.totalGrams}`);
  assert(job.thumbnailSmallPath?.startsWith('data:image/png;base64,'), 'Debe tener miniatura 260x260 válida');
  assert.equal(job.status, 'unreviewed');
  assert.equal(job.manualReviewRequired, false, 'No debe requerir revisión manual');

  console.log(`  ✓ Job Name: "${job.jobName}", Ranuras activas: ${job.filaments.length}, Gramos: ${job.totalGrams}g`);
}

// -------------------------------------------------------------
// Test 4: Fixture 2 - single_color_real.metadata
// -------------------------------------------------------------
console.log('▶ Test 4: single_color_real.metadata...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'single_color_real.metadata'), 'utf8');
  const job = parseGcodeText(raw, 'plate_1.gcode', 'C:/Gcodes/plate_1.gcode');

  assert.equal(job.filaments.length, 1);
  assert.equal(job.filaments[0].grams, 46.9);
  assert.equal(job.filaments[0].materialName, 'PLA');
  assert.equal(job.filaments[0].colorHex.toLowerCase(), '#f2754e');
  assert.equal(job.printTimeSeconds, 4963); // 1h 22m 43s = 3600 + 1320 + 43 = 4963
  assert.equal(job.totalLayersCount, 110);
  assert(job.dimensions && job.dimensions.x === 120.5 && job.dimensions.z === 24.2);
  assert(job.thumbnailSmallPath?.startsWith('data:image/png;base64,'));
  assert.equal(job.jobName, 'Placa 1 · 2026-10-05 10:31:06');

  console.log(`  ✓ Nombre limpio: "${job.jobName}", Tiempo: ${formatPrintTime(job.printTimeSeconds)}, Capas: ${job.totalLayersCount}`);
}

// -------------------------------------------------------------
// Test 5: Fixture 3 - non_consecutive_slots.metadata (Ranuras no consecutivas)
// -------------------------------------------------------------
console.log('▶ Test 5: non_consecutive_slots.metadata...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'non_consecutive_slots.metadata'), 'utf8');
  const job = parseGcodeText(raw, '.21552.3.gcode.metadata');

  // 5 slots configurados en el slicer, pero solo slot 1 y slot 4 tienen gramos > 0
  assert.equal(job.filaments.length, 2, 'Solo debe incluir ranuras con gramos > 0');
  assert.equal(job.filaments[0].slotIndex, 1);
  assert.equal(job.filaments[0].grams, 15.2);
  assert.equal(job.filaments[1].slotIndex, 4);
  assert.equal(job.filaments[1].grams, 32.5);
  assert.equal(job.totalGrams, 47.7);

  console.log(`  ✓ Ranuras filtradas correctamente: Slots #${job.filaments[0].slotIndex + 1} (${job.filaments[0].grams}g) y #${job.filaments[1].slotIndex + 1} (${job.filaments[1].grams}g)`);
}

// -------------------------------------------------------------
// Test 6: Fixture 4 - mismatched_lengths.metadata (Discrepancia de arrays)
// -------------------------------------------------------------
console.log('▶ Test 6: mismatched_lengths.metadata (manualReviewRequired)...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'mismatched_lengths.metadata'), 'utf8');
  const job = parseGcodeText(raw, 'corrupted_arrays.gcode.metadata');

  assert.equal(job.manualReviewRequired, true, 'Debe marcarse para revisión manual');
  assert(job.manualReviewReason?.includes('Discrepancia'), `Motivo esperado, obtenido: ${job.manualReviewReason}`);

  console.log(`  ✓ Bandera manualReviewRequired activada con razón: "${job.manualReviewReason}"`);
}

// -------------------------------------------------------------
// Test 7: Fixture 5 - missing_grams_fallback.metadata (Cálculo volumétrico)
// -------------------------------------------------------------
console.log('▶ Test 7: missing_grams_fallback.metadata (Fórmula volumétrica)...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'missing_grams_fallback.metadata'), 'utf8');
  const job = parseGcodeText(raw, 'fallback.gcode.metadata');

  // mm = 15737.29, d = 1.75, densidad = 1.24
  // area = pi * (1.75/2)^2 = 2.40528
  // cm3 = 2.40528 * 15737.29 / 1000 = 37.8526
  // g = 37.8526 * 1.24 = 46.937g -> redondeado a 46.9g
  assert.equal(job.filaments.length, 2);
  assert(Math.abs(job.filaments[0].grams - 46.9) <= 0.2, `Ranura 0 gramos por volumen debe ser ~46.9g, obtenido: ${job.filaments[0].grams}`);
  assert(Math.abs(job.filaments[1].grams - 13.0) <= 0.2, `Ranura 1 gramos por volumen debe ser ~13.0g, obtenido: ${job.filaments[1].grams}`);

  console.log(`  ✓ Fallback volumétrico exitoso: Slot 0 = ${job.filaments[0].grams}g, Slot 1 = ${job.filaments[1].grams}g`);
}

// -------------------------------------------------------------
// Test 8: Fixture 6 - corrupt_thumbnail.metadata
// -------------------------------------------------------------
console.log('▶ Test 8: corrupt_thumbnail.metadata (Validación PNG Base64)...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'corrupt_thumbnail.metadata'), 'utf8');
  const job = parseGcodeText(raw, 'corrupt_thumb.metadata');

  assert.equal(job.thumbnailSmallPath, undefined, 'Miniatura corrupta debe ser descartada limpiamente');
  assert.equal(isValidPngBase64('EstaNoEsUnaImagenPNGValidaBase64'), false);

  console.log('  ✓ Miniatura corrupta ignorada sin provocar excepción.');
}

// -------------------------------------------------------------
// Test 9: Fixture 7 - dot_filename_plate.metadata (.21552.58.gcode.metadata)
// -------------------------------------------------------------
console.log('▶ Test 9: dot_filename_plate.metadata (.21552.58.gcode.metadata)...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'dot_filename_plate.metadata'), 'utf8');
  const job = parseGcodeText(raw, '.21552.58.gcode.metadata', 'C:/Temp/anycubic/Metadata/.21552.58.gcode.metadata');

  assert.equal(job.pid, 21552, 'PID debe ser 21552');
  assert.equal(job.plateIndex, 58, 'PlateIndex debe ser 58');
  assert(job.sessionKey.startsWith('21552_p58_'), `sessionKey debe empezar por 21552_p58_, obtenido: ${job.sessionKey}`);
  assert.equal(job.filaments.length, 2);
  assert.equal(job.filaments[0].grams, 34.5);
  assert.equal(job.filaments[1].grams, 18.2);
  assert.equal(job.jobName, 'Grip_Left, Grip_Right');

  console.log(`  ✓ Placa ${job.plateIndex}, PID ${job.pid}, SessionKey: ${job.sessionKey}, Modelos: "${job.jobName}"`);
}

// -------------------------------------------------------------
// Test 10: Resolución de color real cuando el slot es placeholder (#FFFFFFFF -> #3E55AB)
// -------------------------------------------------------------
console.log('▶ Test 10: Resolución de color real (placeholder blanco -> filament_colour_info azul)...');
{
  const rawMetadata = `
; generated by AnycubicSlicerNext 2.0.0.3 on 2026-10-05 at 19:09:14
; total layer number: 25
; filament used [g] = 0.00, 7.05
; total filament used [g] = 7.05
; filament_colour = #3E55AB;#FFFFFFFF
; filament_colour_info = #3E55AB
; estimated printing time (normal mode) = 22m 12s
; model_size = 32.81,152.53,5.00
; source_info: {"models":[{"name":"Letras_3D_id_0_copy_0"}],"plate_index":2}
`;

  const job = parseGcodeText(rawMetadata, '.9740.1.gcode.metadata');
  assert(job !== null, 'El trabajo con capas y tiempo debe ser reconocido');
  assert.equal(job.filaments.length, 1);
  assert.equal(job.filaments[0].slotIndex, 1);
  assert.equal(job.filaments[0].colorHex.toLowerCase(), '#3e55ab', 'El color debe resolverse a Azul (#3e55ab)');
  assert.equal(job.manualReviewRequired, false, 'No debe exigir revisión manual cuando el color se resolvió exitosamente');

  console.log(`  ✓ Color resuelto automáticamente: ${job.filaments[0].colorHex} (Azul), Revisión requerida: ${job.manualReviewRequired}`);
}

// -------------------------------------------------------------
// Test 11: Descarte de archivos de proyecto vacíos / no laminados (0 capas, 0 seg)
// -------------------------------------------------------------
console.log('▶ Test 11: Descarte de archivos dummy / no laminados (.3mf sin capas)...');
{
  const dummyRaw = `
; dummy project cache
; total layer number: 0
; print_time = 0s
`;
  const dummyJob = parseGcodeText(dummyRaw, '.3mf');
  assert.equal(dummyJob, null, 'Archivos con 0 capas y 0 tiempo deben ser descartados (retornar null)');
  console.log('  ✓ Archivo no laminado descartado correctamente (retorna null)');
}

// -------------------------------------------------------------
// Test 12: Ingesta nativa de OrcaSlicer (300x300, EXCLUDE_OBJECT_DEFINE, filament slots)
// -------------------------------------------------------------
console.log('▶ Test 12: Ingesta nativa de OrcaSlicer 2.x...');
{
  const orcaGcode = `
; generated by OrcaSlicer 2.5.0 on 2026-11-08 at 20:43:32
; total layer number: 292
; filament_density: 1.24,1.24
; filament_diameter: 1.75,1.75
; max_z_height: 58.40
; filament: 2
; thumbnail begin 300x300 120
; iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
; thumbnail end
EXCLUDE_OBJECT_DEFINE NAME=Tea_Planter_id_0_copy_0 CENTER=112.5,112.5
; filament_colour = #000000;#FFFFFF
; filament_settings_id = "PLA+ ANYCUBIC";"PLA+ ANYCUBIC"
; filament_type = PLA;PLA
; filament used [g] = 0.00, 45.79
; total filament used [g] = 45.79
; total layers count = 292
; estimated printing time (normal mode) = 2h 40m 51s
`;
  const orcaJob = parseGcodeText(orcaGcode, '.19760.1.gcode');
  assert(orcaJob !== null, 'El trabajo de OrcaSlicer debe ser parseado exitosamente');
  assert.equal(orcaJob.jobName, 'Tea_Planter', 'El nombre del trabajo debe ser Tea_Planter');
  assert.equal(orcaJob.totalGrams, 45.8, 'Gramos totales debe ser 45.8');
  assert.equal(orcaJob.totalLayersCount, 292, 'Total capas debe ser 292');
  assert.equal(orcaJob.printTimeSeconds, 9651, 'Tiempo de impresión debe ser 9651s');
  assert(orcaJob.thumbnailSmallPath?.startsWith('data:image/png;base64,'), 'Miniatura 300x300 debe ser extraída');
  console.log('  ✓ Trabajo de OrcaSlicer parseado con éxito (Tea_Planter, 45.8g, 2h 40m, miniatura 300x300)');
}

// -------------------------------------------------------------
// Test 13: extractGcodeText en .3mf con descriptores de datos bit-3 (compSize=0 en cabecera local)
// -------------------------------------------------------------
console.log('▶ Test 13: extractGcodeText en multi_plate_bit3.3mf (bit-3 + omitir XML)...');
{
  const buf = fs.readFileSync(path.join(fixturesDir, 'multi_plate_bit3.3mf'));
  const text = extractGcodeText(buf);
  assert(text.includes('; generated by OrcaSlicer 2.3.0'), 'Debe extraer el G-code de plate_1 y no model_settings.config XML');
  assert(!text.includes('<config>'), 'No debe devolver XML crudo de Metadata/model_settings.config');
  console.log('  ✓ extractGcodeText resolvió bit-3 data descriptors via Directorio Central.');
}

// -------------------------------------------------------------
// Test 14: extractGcodePlatesFrom3mf + parseGcodePlatesFromDisk en .3mf multi-placa
// -------------------------------------------------------------
console.log('▶ Test 14: Parseo multi-placa .3mf (placas, slice_info, json, miniaturas PNG)...');
{
  const archivePath = path.join(fixturesDir, 'multi_plate_bit3.3mf');
  const buf = fs.readFileSync(archivePath);
  const rawPlates = extractGcodePlatesFrom3mf(buf);
  assert.equal(rawPlates.length, 2, 'Debe extraer 2 placas del archivo .3mf');
  assert.equal(rawPlates[0].plateIndex, 1);
  assert.equal(rawPlates[1].plateIndex, 2);
  assert(rawPlates[0].sliceInfoXml?.includes('Gear_Base'), 'Debe incluir slice_info.config');
  assert(rawPlates[1].thumbnailBuf && rawPlates[1].thumbnailBuf.length > 10, 'Debe extraer PNG de placa 2');

  const tmpThumbs = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-3mf-test-'));
  try {
    const jobs = parseGcodePlatesFromDisk(archivePath, tmpThumbs);
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0].plateIndex, 1);
    assert.equal(jobs[0].jobName, 'Gear_Base');
    assert.equal(jobs[0].filaments[0].materialName, 'PLA');
    assert.equal(jobs[0].filaments[0].grams, 22.5);
    assert(jobs[0].thumbnailSmallPath && fs.existsSync(jobs[0].thumbnailSmallPath), 'Miniatura placa 1 escrita en disco');

    assert.equal(jobs[1].plateIndex, 2);
    assert.equal(jobs[1].jobName, 'Gear_Lid');
    assert.equal(jobs[1].filaments[0].materialName, 'PETG');
    assert.equal(jobs[1].filaments[0].grams, 18.4);
    assert(jobs[1].thumbnailSmallPath && fs.existsSync(jobs[1].thumbnailSmallPath), 'Miniatura placa 2 escrita en disco');

    const primary = parseGcodeFileFromDisk(archivePath, tmpThumbs);
    assert(primary !== null);
    assert.equal(primary.plates?.length, 2, 'parseGcodeFileFromDisk debe exponer .plates en .3mf multi-placa');
    // Verificar que no hay referencias circulares al serializar
    const serialized = JSON.stringify(primary);
    assert(serialized.includes('Gear_Lid'));
  } finally {
    fs.rmSync(tmpThumbs, { recursive: true, force: true });
  }
  console.log('  ✓ Multi-placa .3mf verificado (2 placas, modelos, miniaturas y JSON sin ciclos).');
}

// -------------------------------------------------------------
// Test 15: Ultimaker Cura 5.6 (cura_benchy.gcode)
// -------------------------------------------------------------
console.log('▶ Test 15: Ultimaker Cura 5.6 (cura_benchy.gcode)...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'cura_benchy.gcode'), 'utf8');
  const job = parseGcodeText(raw, 'cura_benchy.gcode');
  assert(job !== null);
  assert.equal(job.slicerName, 'Cura');
  assert.equal(job.slicerVersion, '5.6.0');
  assert.equal(job.printTimeSeconds, 5120);
  assert.equal(job.totalLayersCount, 240);
  assert.equal(job.layerHeight, 0.2);
  assert.equal(job.nozzleDiameter, 0.4);
  assert.equal(job.infillPercent, 20);
  assert.equal(job.filaments[0].brand, 'Genérico', 'Marca desconocida debe caer a Genérico, no Anycubic');
  assert.equal(job.filaments[0].materialName, 'PLA');
  assert(Math.abs(job.filaments[0].grams - 37.3) <= 0.3, `Esperado ~37.3g para 12.5m PLA, obtenido ${job.filaments[0].grams}`);
  assert.deepEqual(job.dimensions, { x: 60, y: 31, z: 48 });
  console.log(`  ✓ Cura parseado: ${job.filaments[0].grams}g, ${job.slicerName} ${job.slicerVersion}, brand=${job.filaments[0].brand}`);
}

// -------------------------------------------------------------
// Test 16: Simplify3D 5.1 (simplify3d_bracket.gcode)
// -------------------------------------------------------------
console.log('▶ Test 16: Simplify3D 5.1 (simplify3d_bracket.gcode)...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'simplify3d_bracket.gcode'), 'utf8');
  const job = parseGcodeText(raw, 'simplify3d_bracket.gcode');
  assert(job !== null);
  assert.equal(job.slicerName, 'Simplify3D');
  assert.equal(job.slicerVersion, '5.1.2');
  assert.equal(job.printerModel, 'Prusa MK3S+');
  assert.equal(job.infillPercent, 25);
  assert.equal(job.nozzleDiameter, 0.4);
  assert.equal(job.layerHeight, 0.2);
  assert.equal(job.printTimeSeconds, 5400);
  assert.equal(job.filaments[0].materialName, 'PETG');
  assert.equal(job.filaments[0].brand, 'Genérico');
  assert.equal(job.filaments[0].grams, 56.3);
  console.log(`  ✓ Simplify3D parseado: ${job.filaments[0].grams}g ${job.filaments[0].materialName}, ${job.printTimeSeconds}s`);
}

// -------------------------------------------------------------
// Test 17: IdeaMaker 4.3 (ideamaker_housing.gcode)
// -------------------------------------------------------------
console.log('▶ Test 17: IdeaMaker 4.3 (ideamaker_housing.gcode)...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'ideamaker_housing.gcode'), 'utf8');
  const job = parseGcodeText(raw, 'ideamaker_housing.gcode');
  assert(job !== null);
  assert.equal(job.slicerName, 'ideaMaker');
  assert.equal(job.slicerVersion, '4.3.2');
  assert.equal(job.printerModel, 'Raise3D E2');
  assert.equal(job.printTimeSeconds, 7800); // 02:10:00
  assert.equal(job.totalLayersCount, 175);
  assert.equal(job.infillPercent, 18);
  assert.equal(job.nozzleDiameter, 0.4);
  assert.equal(job.filaments[0].materialName, 'ABS');
  assert.equal(job.filaments[0].colorHex.toLowerCase(), '#1e293b');
  assert.deepEqual(job.dimensions, { x: 120.5, y: 80.5, z: 35 });
  console.log(`  ✓ IdeaMaker parseado: ${job.filaments[0].grams}g ABS, tiempo=${job.printTimeSeconds}s`);
}

// -------------------------------------------------------------
// Test 18: Creality Print v4 & v5+
// -------------------------------------------------------------
console.log('▶ Test 18: Creality Print v4 (creality_v4_print.gcode) & v5+...');
{
  const rawV4 = fs.readFileSync(path.join(fixturesDir, 'creality_v4_print.gcode'), 'utf8');
  const jobV4 = parseGcodeText(rawV4, 'creality_v4_print.gcode');
  assert(jobV4 !== null);
  assert.equal(jobV4.slicerName, 'Creality Print');
  assert.equal(jobV4.slicerVersion, '4.3.8');
  assert.equal(jobV4.printerModel, 'Creality Ender-3 V3 SE');
  assert.equal(jobV4.filaments[0].materialName, 'PLA+');
  assert.equal(jobV4.printTimeSeconds, 3600);

  const rawV5 = `
; generated by Creality Print 5.1.4 on 2026-10-21 at 12:00:00
; printer_model = Creality K1C
; nozzle_diameter = 0.4
; layer_height = 0.2
; sparse_infill_density = 15%
; filament_type = PETG
; filament_colour = #22C55E
; filament used [g] = 31.25
; total layers count = 150
; estimated printing time (normal mode) = 1h 5m 0s
`;
  const jobV5 = parseGcodeText(rawV5, 'k1c_part.gcode');
  assert(jobV5 !== null);
  assert.equal(jobV5.slicerName, 'Creality Print');
  assert.equal(jobV5.slicerVersion, '5.1.4');
  assert.equal(jobV5.printerModel, 'Creality K1C');
  assert.equal(jobV5.infillPercent, 15);
  assert.equal(jobV5.filaments[0].materialName, 'PETG');
  console.log('  ✓ Creality Print v4 y v5+ verificados.');
}

// -------------------------------------------------------------
// Test 19: PrusaSlicer 2.8 (prusaslicer_cover.gcode)
// -------------------------------------------------------------
console.log('▶ Test 19: PrusaSlicer 2.8 (prusaslicer_cover.gcode)...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'prusaslicer_cover.gcode'), 'utf8');
  const job = parseGcodeText(raw, 'prusaslicer_cover.gcode');
  assert(job !== null);
  assert.equal(job.slicerName, 'PrusaSlicer');
  assert.equal(job.slicerVersion, '2.8.1');
  assert.equal(job.jobName, 'Relay_Cover');
  assert.equal(job.filaments[0].brand, 'Prusament');
  assert.equal(job.printerModel, 'MK4');
  assert.equal(job.infillPercent, 20);
  assert.equal(job.silentTimeSeconds, 6300);
  assert.equal(job.printTimeSeconds, 4350);
  console.log(`  ✓ PrusaSlicer parseado: ${job.jobName}, marca=${job.filaments[0].brand}, silent=${job.silentTimeSeconds}s`);
}

// -------------------------------------------------------------
// Test 20: Klipper / Moonraker (klipper_macro_part.gcode)
// -------------------------------------------------------------
console.log('▶ Test 20: Klipper / Moonraker (klipper_macro_part.gcode)...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'klipper_macro_part.gcode'), 'utf8');
  const job = parseGcodeText(raw, 'klipper_macro_part.gcode');
  assert(job !== null);
  assert.equal(job.totalLayersCount, 160, 'Debe leer TOTAL_LAYER=160 e ignorar CURRENT_LAYER');
  assert.equal(job.jobName, 'Voron_Bracket');
  assert.equal(job.filaments[0].materialName, 'ASA');
  // 11200 mm, d=1.75 => cm3 = 26.939, densidad ASA = 1.07 => 28.82g
  assert(Math.abs(job.filaments[0].grams - 28.8) <= 0.2, `Esperado ~28.8g con densidad ASA 1.07, obtenido ${job.filaments[0].grams}`);
  console.log(`  ✓ Klipper parseado: ${job.totalLayersCount} capas, ${job.filaments[0].grams}g ASA.`);
}

// -------------------------------------------------------------
// Test 21: Ventana head/tail (scanned) en archivo > 5,000 líneas
// -------------------------------------------------------------
console.log('▶ Test 21: Ventana head/tail en archivo grande (> 5,000 líneas)...');
{
  const filler = Array.from({ length: 5200 }, (_, i) => `G1 X${(i % 100) + 10} Y20 E0.05`).join('\n');
  const bigGcode = `; generated by OrcaSlicer 2.3.0 on 2026-10-22 at 08:00:00
; thumbnail begin 260x260 120
; iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
; thumbnail end
${filler}
; filament used [g] = 42.10
; filament_type = PLA
; filament_colour = #10B981
; total layers count = 210
; estimated printing time (normal mode) = 2h 0m 0s
`;
  const job = parseGcodeText(bigGcode, 'large_part.gcode');
  assert(job !== null);
  assert(job.thumbnailSmallPath?.startsWith('data:image/png;base64,'), 'Debe conservar la miniatura en cabecera');
  assert.equal(job.totalLayersCount, 210, 'Debe leer metadatos en la cola');
  assert.equal(job.printTimeSeconds, 7200);
  assert.equal(job.filaments[0].grams, 42.1);
  console.log('  ✓ Archivo > 5,000 líneas procesado correctamente con ventana head+tail.');
}

// -------------------------------------------------------------
// Test 22: Campos extendidos en multicolor_real.metadata
// -------------------------------------------------------------
console.log('▶ Test 22: Campos extendidos (silent/sport, slicer, lengthMm, volumeCm3) en multicolor_real.metadata...');
{
  const raw = fs.readFileSync(path.join(fixturesDir, 'multicolor_real.metadata'), 'utf8');
  const job = parseGcodeText(raw, '.21552.2.gcode.metadata');
  assert(job !== null);
  assert.equal(job.slicerName, 'AnycubicSlicerNext');
  assert.equal(job.slicerVersion, '2.0.0.3');
  assert.equal(job.silentTimeSeconds, 5314); // 1h 28m 34s
  assert.equal(job.sportTimeSeconds, 2797);  // 46m 37s
  assert(job.filamentLengthMm && job.filamentLengthMm > 5000, 'filamentLengthMm debe acumular ranuras');
  assert(job.filamentVolumeCm3 && job.filamentVolumeCm3 > 10, 'filamentVolumeCm3 debe acumular ranuras');
  assert(job.filaments[0].lengthMm && job.filaments[0].volumeCm3, 'Cada ranura debe tener lengthMm y volumeCm3');
  console.log(`  ✓ Campos extendidos verificados: ${job.slicerName} ${job.slicerVersion}, silent=${job.silentTimeSeconds}s, sport=${job.sportTimeSeconds}s`);
}

// -------------------------------------------------------------
// Test 23: Regresión miniatura 512x512 en líneas 2450..3100 (5,001 líneas) + rechazo PNG truncado
// -------------------------------------------------------------
console.log('▶ Test 23: Miniatura 512x512 cruzando línea 3001 en 5,001 líneas + isValidPngBase64 estricto...');
{
  // Construir PNG base64 válido de ~650 líneas (2450..3100)
  const rawPrefix = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAA';
  const fillerChunk = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // 72 chars = 54 bytes
  const thumbLines = [rawPrefix];
  for (let i = 0; i < 647; i++) {
    thumbLines.push(fillerChunk);
  }
  thumbLines.push('AAAASUVORK5CYII=');

  // Construir archivo de 5,001 líneas donde thumbnail begin está en la línea 2450 y end en 3100
  const preLines = [
    '; generated by OrcaSlicer 2.3.0 on 2026-10-25 at 10:00:00',
    '; total layer number: 120',
  ];
  while (preLines.length < 2449) {
    preLines.push(`G1 X10 Y${preLines.length % 100} E0.01`);
  }
  const block = [
    '; thumbnail begin 512x512 46800',
    ...thumbLines.map((l) => `; ${l}`),
    '; thumbnail end',
  ];
  const combined = [...preLines, ...block];
  while (combined.length < 4996) {
    combined.push(`G1 X20 Y${combined.length % 100} E0.01`);
  }
  combined.push(
    '; filament used [g] = 19.80',
    '; filament_type = PLA',
    '; filament_colour = #3B82F6',
    '; total layers count = 120',
    '; estimated printing time (normal mode) = 1h 15m 0s',
  );
  assert.equal(combined.length, 5001, `El archivo de prueba debe tener exactamente 5001 líneas, tiene ${combined.length}`);

  const job = parseGcodeText(combined.join('\n'), 'thumb_5001.gcode');
  assert(job !== null);
  assert(job.thumbnailLargePath?.endsWith('AAAASUVORK5CYII='), 'La miniatura 512x512 completa no debe truncarse');
  assert.equal(job.totalLayersCount, 120);
  assert.equal(job.filaments[0].grams, 19.8);

  // PNG truncado sin chunk IEND debe ser rechazado
  assert.equal(isValidPngBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9Q'), false);
  assert.equal(isValidPngBase64('iVBORw0KGgoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), false);
  console.log('  ✓ Miniatura de 5,001 líneas conservada intacta y PNG truncado rechazado.');
}

// -------------------------------------------------------------
// Test 24: Regresión IdeaMaker dual-extruder (footer Filament Used no sobreescribe Material#1/#2)
// -------------------------------------------------------------
console.log('▶ Test 24: IdeaMaker dual-extruder preserva 2 ranuras tras footer ;Filament Used:...');
{
  const ideaDual = `;Sliced by ideaMaker 4.3.2, 2026-10-10 14:00:00
;Printer Type: Raise3D E2
;Total Layers: 140
;Material#1 Type: PLA
;Material#1 Color: #EF4444
;Material#1 Used: 10.00
;Material#2 Type: PETG
;Material#2 Color: #3B82F6
;Material#2 Used: 5.00
G28
G1 X10 Y10 E1.0
;Print Time: 01:30:00
;Filament Used: 15.00
`;
  const job = parseGcodeText(ideaDual, 'ideamaker_dual.gcode');
  assert(job !== null);
  assert.equal(job.filaments.length, 2, 'Debe preservar las 2 ranuras de IdeaMaker');
  assert.equal(job.filaments[0].materialName, 'PLA');
  assert.equal(job.filaments[1].materialName, 'PETG');
  assert(job.filaments[0].lengthMm && Math.abs(job.filaments[0].lengthMm - 10000) < 1);
  assert(job.filaments[1].lengthMm && Math.abs(job.filaments[1].lengthMm - 5000) < 1);
  console.log('  ✓ IdeaMaker dual-extruder preservó ambas ranuras (PLA 10m + PETG 5m).');
}

// -------------------------------------------------------------
// Test 25: Regresión .3mf deduplicación plate_N.gcode + plate_N.gcode.metadata & XML atributos invertidos
// -------------------------------------------------------------
console.log('▶ Test 25: Deduplicación .3mf (.metadata preferido), slice_info invertido y corrupto .3mf...');
{
  function buildZip(entries) {
    const locals = [];
    const cds = [];
    let offset = 0;
    for (const e of entries) {
      const nameBuf = Buffer.from(e.name, 'utf8');
      const raw = Buffer.from(e.content, 'utf8');
      const comp = zlib.deflateRawSync(raw);
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(20, 4);
      lh.writeUInt16LE(0x0800, 6);
      lh.writeUInt16LE(8, 8);
      lh.writeUInt32LE(comp.length, 18);
      lh.writeUInt32LE(raw.length, 22);
      lh.writeUInt16LE(nameBuf.length, 26);
      locals.push(lh, nameBuf, comp);

      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4);
      cd.writeUInt16LE(20, 6);
      cd.writeUInt16LE(0x0800, 8);
      cd.writeUInt16LE(8, 10);
      cd.writeUInt32LE(comp.length, 20);
      cd.writeUInt32LE(raw.length, 24);
      cd.writeUInt16LE(nameBuf.length, 28);
      cd.writeUInt32LE(offset, 42);
      cds.push(cd, nameBuf);
      offset += lh.length + nameBuf.length + comp.length;
    }
    const cdBuf = Buffer.concat(cds);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cdBuf, eocd]);
  }

  const dupZip = buildZip([
    {
      name: 'Metadata/slice_info.config',
      content: '<config><plate><metadata value="1" key="index"/><metadata value="2400" key="prediction"/><object name="DupPart"/></plate></config>',
    },
    {
      name: 'Metadata/plate_1.gcode',
      content: '; total layers count = 50\n; filament used [g] = 10.0\n; marker = GCODE_PLAIN\n',
    },
    {
      name: 'Metadata/plate_1.gcode.metadata',
      content: '; total layers count = 50\n; filament used [g] = 10.0\n; marker = META_PREFERRED\n',
    },
  ]);

  const plates = extractGcodePlatesFrom3mf(dupZip);
  assert.equal(plates.length, 1, 'Debe deduplicar por plateIndex');
  assert(plates[0].text.includes('META_PREFERRED'), 'Debe preferir .gcode.metadata sobre .gcode');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filoteca-dup-3mf-'));
  try {
    const dupPath = path.join(tmpDir, 'dup.3mf');
    fs.writeFileSync(dupPath, dupZip);
    const jobs = parseGcodePlatesFromDisk(dupPath);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].printTimeSeconds, 2400, 'Debe leer prediction incluso con value antes de key');

    const bad3mf = path.join(tmpDir, 'corrupt.3mf');
    fs.writeFileSync(bad3mf, Buffer.from('NOT_A_ZIP_FILE_12345', 'utf8'));
    assert.equal(safeReadGcodeFile(bad3mf), '', 'safeReadGcodeFile debe devolver "" para .3mf corrupto sin PK');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log('  ✓ Deduplicación .3mf, XML con atributos en cualquier orden y guarda .3mf corrupto verificados.');
}

// -------------------------------------------------------------
// Test 26: Regresión parseGcodeSettingsId (modificadores de acabado no son marcas)
// -------------------------------------------------------------
console.log('▶ Test 26: parseGcodeSettingsId no promueve modificadores (Silk/Matte/CF) como marca...');
{
  const silk = parseGcodeSettingsId('Silk PLA');
  assert.equal(silk.brand, 'Genérico');
  assert.equal(silk.material, 'PLA');
  assert.equal(silk.finish, 'silk');

  const matte = parseGcodeSettingsId('Matte PETG');
  assert.equal(matte.brand, 'Genérico');
  assert.equal(matte.material, 'PETG');
  assert.equal(matte.finish, 'matte');

  const anycubic = parseGcodeSettingsId('PLA+ ANYCUBIC');
  assert.equal(anycubic.brand, 'Anycubic');
  assert.equal(anycubic.material, 'PLA+');

  const prusa = parseGcodeSettingsId('Prusament PETG @MK4');
  assert.equal(prusa.brand, 'Prusament');
  assert.equal(prusa.material, 'PETG');

  console.log('  ✓ Prefijos de acabado y marcas conocidas resueltos correctamente.');
}

console.log('\n🎉 ¡TODAS LAS PRUEBAS AVANZADAS PASARON EXITOSAMENTE (26/26)!\n');
