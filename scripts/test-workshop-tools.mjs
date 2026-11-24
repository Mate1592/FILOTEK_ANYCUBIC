import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

import { MATERIALS } from '../src/shared/types.ts';
import {
  MATERIAL_PRESETS,
  SPOOL_TARE_PRESETS,
  getMaterialPreset,
  getMaterialDensity,
  gramsToCm3,
  cm3ToGrams,
  gramsToMeters,
  metersToGrams,
  estimateNetFromTare,
} from '../src/lib/filamentMath.ts';
import {
  calculatePrintQuote,
  formatQuoteText,
  formatQuoteHtml,
} from '../src/lib/printCalculator.ts';
import { fmtMoney } from '../src/lib/roll.ts';
import { parseGcodeText } from '../src/lib/gcodeParser.ts';
import { extractGcodeText, extractGcodePlatesFrom3mf } from '../electron/gcode.ts';

console.log('🧪 Corriendo suite de herramientas de taller 3D (filamentMath, printCalculator, multi-slicer, .3mf)...\n');

// -------------------------------------------------------------
// Grupo 1: filamentMath.ts
// -------------------------------------------------------------
console.log('▶ Grupo 1: filamentMath.ts (presets, conversiones y tara)...');
{
  assert.equal(Object.keys(MATERIAL_PRESETS).length, MATERIALS.length, 'Debe cubrir los 12 materiales');
  for (const mat of MATERIALS) {
    const preset = MATERIAL_PRESETS[mat];
    assert(preset, `Falta preset para ${mat}`);
    assert(preset.densityGcm3 > 0.8 && preset.densityGcm3 < 2.0, `Densidad inválida para ${mat}`);
    assert(preset.nozzleTempRange[0] < preset.nozzleTempRange[1], `Rango boquilla inválido en ${mat}`);
    assert(preset.bedTempRange[0] <= preset.bedTempRange[1], `Rango cama inválido en ${mat}`);
    assert(preset.dryingTempC > 0 && preset.dryingHours > 0, `Datos de secado inválidos en ${mat}`);
    assert(preset.notes.es && preset.notes.en && preset.notes.pt, `Faltan notas ES/EN/PT en ${mat}`);
  }

  assert.equal(getMaterialPreset('  petg ').material, 'PETG');
  assert.equal(getMaterialPreset('PA12').material, 'Nylon');
  assert.equal(getMaterialPreset('PA6-CF').material, 'Nylon');
  assert.equal(getMaterialPreset('PA12-GF').material, 'Nylon');
  assert.equal(getMaterialPreset('CF PLA').material, 'PLA-CF');
  assert.equal(getMaterialPreset('desconocido_xyz').material, 'Otro');
  assert.equal(getMaterialDensity('ABS'), 1.04);
  assert.equal(getMaterialDensity('PLA-CF'), 1.29);

  // Round-trip 1.75 mm y 2.85 mm
  const m175 = gramsToMeters(1000, 1.75, 1.24);
  assert(Math.abs(m175 - 335.28) < 0.2, `1000g PLA 1.75mm esperado ~335.28m, obtenido ${m175}`);
  assert(Math.abs(metersToGrams(m175, 1.75, 1.24) - 1000) < 1e-6);

  const m285 = gramsToMeters(1000, 2.85, 1.24);
  assert(Math.abs(m285 - 126.42) < 0.2, `1000g PLA 2.85mm esperado ~126.42m, obtenido ${m285}`);
  assert(Math.abs(metersToGrams(m285, 2.85, 1.24) - 1000) < 1e-6);

  const cm3 = gramsToCm3(127, 1.27);
  assert(Math.abs(cm3 - 100) < 1e-9);
  assert(Math.abs(cm3ToGrams(cm3, 1.27) - 127) < 1e-9);

  // Edge cases
  for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(gramsToMeters(bad, 1.75, 1.24), 0);
    assert.equal(metersToGrams(bad, 1.75, 1.24), 0);
    assert.equal(gramsToCm3(bad, 1.24), 0);
    assert.equal(cm3ToGrams(bad, 1.24), 0);
  }
  assert.equal(gramsToMeters(100, 0, 1.24), 0);
  assert.equal(gramsToMeters(100, 1.75, -1), 0);
  assert.equal(gramsToMeters(100, 1e-200, 1.24), 0, 'Subnormal underflow debe retornar 0 finito');
  assert.equal(gramsToMeters(1e308, 1.75, 0.01), 0, 'Overflow debe retornar 0 finito');

  // Tara
  const normal = estimateNetFromTare(750, 250, 1000);
  assert.equal(normal.netGrams, 500);
  assert.equal(normal.remainingPct, 50);
  assert.equal(normal.isBelowTare, false);
  assert.equal(normal.exceedsCapacity, false);

  const below = estimateNetFromTare(180, 250, 1000);
  assert.equal(below.netGrams, 0);
  assert.equal(below.isBelowTare, true);

  const over = estimateNetFromTare(1300, 220, 1000);
  assert.equal(over.netGrams, 1080);
  assert.equal(over.remainingPct, 100);
  assert.equal(over.exceedsCapacity, true);

  assert(SPOOL_TARE_PRESETS.length >= 8);
  for (const p of SPOOL_TARE_PRESETS) {
    assert(p.tareGrams > 0 && p.capacityGrams > 0);
    assert(p.label.es && p.label.en && p.label.pt);
  }
  console.log('  ✓ filamentMath.ts verificado al 100%.');
}

// -------------------------------------------------------------
// Grupo 2: printCalculator.ts
// -------------------------------------------------------------
console.log('▶ Grupo 2: printCalculator.ts (costos, margen/markup, lote, override, ES/EN/PT, XSS)...');
{
  const quoteInput = {
    jobName: 'Soporte VESA',
    materials: [
      { name: 'PLA Negro', grams: 100, spoolPrice: 90000, spoolWeightGrams: 1000, wastePct: 10 }, // 110g * 90 = 9900
      { name: 'PETG Blanco', grams: 20, costPerGram: 120, wasteGrams: 5 }, // 25g * 120 = 3000
    ],
    printTimeSeconds: 14400, // 4h
    printerWattage: 150,     // 0.6 kWh
    electricityRatePerKwh: 850, // 510
    machineHourlyRate: 2500, // 10000
    laborHourlyRate: 20000,
    setupMinutes: 15,        // 0.25h -> 5000
    postProcessMinutes: 15,  // 0.25h * 2 units -> 10000
    postProcessPerUnit: true,
    flatFee: 1590,
    failurePct: 10,
    profitPct: 50,
    pricingMode: 'margin',
    taxPct: 19,
    batchUnits: 2,
  };

  const res = calculatePrintQuote(quoteInput);
  assert.equal(res.batchUnits, 2);
  assert.equal(res.printHours, 4);
  assert(Math.abs(res.energyKwh - 0.6) < 1e-9);
  assert(Math.abs(res.materialCost - 12900) < 1e-6);
  assert(Math.abs(res.electricityCost - 510) < 1e-6);
  assert(Math.abs(res.machineCost - 10000) < 1e-6);
  assert(Math.abs(res.laborCost - 15000) < 1e-6);
  assert(Math.abs(res.flatFeeCost - 1590) < 1e-6);
  assert(Math.abs(res.directCost - 40000) < 1e-6);
  assert(Math.abs(res.failureBufferCost - 4000) < 1e-6);
  assert(Math.abs(res.productionCost - 44000) < 1e-6);
  // Margin 50% doubles productionCost
  assert(Math.abs(res.subtotalBeforeTax - 88000) < 1e-6);
  assert(Math.abs(res.profitAmount - 44000) < 1e-6);
  assert(Math.abs(res.taxAmount - 88000 * 0.19) < 1e-6);
  assert(Math.abs(res.unitTotalWithTax * 2 - res.totalWithTax) < 1e-9);

  const shareSum =
    res.shares.materialPct +
    res.shares.electricityPct +
    res.shares.machinePct +
    res.shares.laborPct +
    res.shares.flatFeePct +
    res.shares.failurePct;
  assert(Math.abs(shareSum - 100) < 1e-9);

  // Amortization + 100% margin clamp + zero input safety
  const amortRes = calculatePrintQuote({
    materials: [],
    printHours: 2,
    printerWattage: 100,
    electricityRatePerKwh: 500,
    machinePrice: 1000000,
    machineLifespanHours: 2000,
    maintenancePerHour: 100,
    preferMachineAmortization: true,
    pricingMode: 'margin',
    profitPct: 100, // clamp to 99.9
  });
  assert.equal(amortRes.effectiveMachineHourlyRate, 600);
  assert(Number.isFinite(amortRes.totalWithTax) && amortRes.totalWithTax > 0);

  const zeroRes = calculatePrintQuote({
    materials: [],
    printerWattage: 0,
    electricityRatePerKwh: 0,
  });
  assert.equal(zeroRes.productionCost, 0);
  assert.equal(zeroRes.shares.materialPct, 0);

  // Override targetTotalPrice below cost
  const belowCostRes = calculatePrintQuote({
    ...quoteInput,
    targetTotalPrice: 30000,
    targetPriceIncludesTax: true,
  });
  assert.equal(belowCostRes.isPriceOverridden, true);
  assert.equal(belowCostRes.isBelowCost, true);

  // Fallback printTimeSeconds negativo -> printHours & guarda overflow extremo 1e308
  const negTimeRes = calculatePrintQuote({
    materials: [{ name: 'PLA', grams: 100, costPerGram: 50 }],
    printTimeSeconds: -5,
    printHours: 3,
    printerWattage: 100,
    electricityRatePerKwh: 500,
    machineHourlyRate: 1000,
  });
  assert.equal(negTimeRes.printHours, 3, 'printTimeSeconds negativo debe caer a printHours');

  const extremeRes = calculatePrintQuote({
    materials: [{ name: 'Huge', grams: 1e308, costPerGram: 100 }],
    printerWattage: 100,
    electricityRatePerKwh: 500,
    failurePct: 0,
  });
  assert(Number.isFinite(extremeRes.productionCost), 'productionCost debe ser finito ante overflow 1e308');
  assert(Number.isFinite(extremeRes.totalWithTax), 'totalWithTax debe ser finito ante overflow 1e308');
  assert(Number.isFinite(extremeRes.shares.materialPct), 'shares debe ser finito ante overflow 1e308');

  // Multi-language & multi-currency + XSS & offline HTML
  for (const lang of ['es', 'en', 'pt']) {
    for (const cur of ['COP', 'USD', 'EUR', 'BRL']) {
      const txt = formatQuoteText(quoteInput, res, {
        lang,
        currency: cur,
        formatMoney: (n) => fmtMoney(n, cur),
        workshopName: 'Taller <script>alert("xss")</script> & Co',
        clientName: 'Cliente "VIP"',
        notes: 'Entrega <img src=x onerror=alert(1)>',
      });
      assert(txt.length > 50);

      const html = formatQuoteHtml(quoteInput, res, {
        lang,
        currency: cur,
        formatMoney: (n) => fmtMoney(n, cur),
        workshopName: 'Taller <script>alert("xss")</script> & Co',
        clientName: 'Cliente "VIP"',
        notes: 'Entrega <img src=x onerror=alert(1)>',
      });
      assert(!html.includes('<script>'), 'XSS: <script> debe estar escapado en HTML');
      assert(!html.includes('<img '), 'XSS: <img debe estar escapado en HTML');
      assert(html.includes('&lt;script&gt;'), 'HTML debe contener payload escapado');
      assert(!/https?:\/\/|\/\/cdn/i.test(html), 'HTML de cotización debe ser 100% offline');
    }
  }
  console.log('  ✓ printCalculator.ts verificado (cálculos, ES/EN/PT, COP/USD/EUR/BRL, XSS, 100% offline).');
}

// -------------------------------------------------------------
// Grupo 3: Multi-Slicer & .3mf ZIP Central-Directory en memoria
// -------------------------------------------------------------
console.log('▶ Grupo 3: Multi-slicer y .3mf Central-Directory en memoria...');
{
  const fixturesDir = path.resolve('test-fixtures');
  for (const fx of [
    'cura_benchy.gcode',
    'simplify3d_bracket.gcode',
    'ideamaker_housing.gcode',
    'creality_v4_print.gcode',
    'prusaslicer_cover.gcode',
    'klipper_macro_part.gcode',
  ]) {
    const raw = fs.readFileSync(path.join(fixturesDir, fx), 'utf8');
    const job = parseGcodeText(raw, fx);
    assert(job !== null, `Fixture ${fx} debe parsearse correctamente`);
    assert(job.filaments.length >= 1 && job.totalGrams > 0, `Fixture ${fx} debe tener gramos > 0`);
  }

  // Construcción sintética de .3mf con bit-3 (compSize=0 en cabecera local)
  function buildSyntheticBit3Zip(entries) {
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
      lh.writeUInt16LE(0x0808, 6); // bit 3 + utf8
      lh.writeUInt16LE(8, 8);
      lh.writeUInt16LE(nameBuf.length, 26);

      const dd = Buffer.alloc(16);
      dd.writeUInt32LE(0x08074b50, 0);
      dd.writeUInt32LE(comp.length, 8);
      dd.writeUInt32LE(raw.length, 12);

      locals.push(lh, nameBuf, comp, dd);

      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4);
      cd.writeUInt16LE(20, 6);
      cd.writeUInt16LE(0x0808, 8);
      cd.writeUInt16LE(8, 10);
      cd.writeUInt32LE(comp.length, 20);
      cd.writeUInt32LE(raw.length, 24);
      cd.writeUInt16LE(nameBuf.length, 28);
      cd.writeUInt32LE(offset, 42);
      cds.push(cd, nameBuf);

      offset += lh.length + nameBuf.length + comp.length + dd.length;
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

  const synthBuf = buildSyntheticBit3Zip([
    { name: 'Metadata/slice_info.config', content: '<config><plate><metadata key="index" value="1"/><object name="TestPart"/></plate><plate><metadata key="index" value="2"/><object name="SecondPart"/></plate></config>' },
    { name: 'Metadata/plate_1.gcode', content: '; total layers count = 50\n; estimated printing time (normal mode) = 30m 0s\n; filament used [g] = 12.0\n' },
    { name: 'Metadata/plate_2.gcode', content: '; total layers count = 40\n; estimated printing time (normal mode) = 20m 0s\n; filament used [g] = 9.5\n' },
  ]);

  const plates = extractGcodePlatesFrom3mf(synthBuf);
  assert.equal(plates.length, 2);
  assert.equal(plates[0].plateIndex, 1);
  assert.equal(plates[1].plateIndex, 2);
  assert(plates[0].sliceInfoXml?.includes('TestPart'));
  assert(extractGcodeText(synthBuf).includes('; filament used [g] = 12.0'));

  console.log('  ✓ Multi-slicer y .3mf Central-Directory verificados.');
}

console.log('\n🎉 ¡TODAS LAS PRUEBAS DE HERRAMIENTAS DE TALLER PASARON EXITOSAMENTE!\n');
