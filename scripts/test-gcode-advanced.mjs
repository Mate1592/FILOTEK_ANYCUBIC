import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Import our TypeScript modules using tsx/node ESM
import { parseGcodeText, formatPrintTime, cleanModelName, formatJobName, isValidPngBase64 } from '../src/lib/gcodeParser.ts';
import { colorDeltaE, hexToLab, matchSlotToRoll, getSlotMappingKey } from '../src/lib/colorMath.ts';

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

console.log('\n🎉 ¡TODAS LAS PRUEBAS AVANZADAS PASARON EXITOSAMENTE (11/11)!\n');
