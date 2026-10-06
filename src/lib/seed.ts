import type { Roll, UsageEntry, GcodeJob } from '../shared/types';
import { seeded } from './roll';

type SeedSpec = Omit<Roll, 'id' | 'createdAt' | 'updatedAt' | 'seed'> & { daysAgo: number };

const SPECS: SeedSpec[] = [
  { brand: 'Anycubic', material: 'PLA+', finish: 'glossy', colorName: 'Negro Clásico', colorHex: '#1f2023', diameter: 1.75, initialWeight: 1000, remainingWeight: 750, price: 68900, purchaseDate: '', daysAgo: 25, location: 'A MANO', nozzleTemp: { min: 195, max: 215 }, bedTemp: { min: 50, max: 60 }, notes: 'Carrete diario de alta velocidad Anycubic.', status: 'in_use', store: 'Anycubic Store', productUrl: 'https://store.anycubic.com', deliveryDays: 4, shippingCost: 8000 },
  { brand: 'Anycubic', material: 'PLA+', finish: 'glossy', colorName: 'Azul Real', colorHex: '#3E55AB', diameter: 1.75, initialWeight: 1000, remainingWeight: 840, price: 68900, purchaseDate: '', daysAgo: 15, location: 'Estante A · 1', nozzleTemp: { min: 195, max: 215 }, bedTemp: { min: 50, max: 60 }, notes: 'Anycubic High Speed PLA+. Detectado en Anycubic Slicer.', status: 'in_use', store: 'Anycubic Store', productUrl: 'https://store.anycubic.com', deliveryDays: 4, shippingCost: 8000 },
  { brand: 'Sunlu', material: 'PLA', finish: 'silk', colorName: 'Oro seda', colorHex: '#d6a93c', diameter: 1.75, initialWeight: 1000, remainingWeight: 724, price: 74900, purchaseDate: '', daysAgo: 55, location: 'Estante B · 1', nozzleTemp: { min: 200, max: 220 }, bedTemp: { min: 50, max: 60 }, notes: 'Trofeos, figuras, cosas que deben verse brillantes.', status: 'in_use', store: 'Sunlu Store', productUrl: 'https://www.sunlu.com', deliveryDays: 3, shippingCost: 9000 },
  { brand: 'Bambu Lab', material: 'PLA', finish: 'glossy', colorName: 'Negro carbón', colorHex: '#1f2023', diameter: 1.75, initialWeight: 1000, remainingWeight: 868, price: 89900, purchaseDate: '', daysAgo: 40, location: 'Estante A · 2', nozzleTemp: { min: 190, max: 230 }, bedTemp: { min: 45, max: 65 }, notes: 'El comodín. Siempre tiene que haber uno.', status: 'in_use', store: 'Bambu Lab Store', productUrl: 'https://store.bambulab.com', deliveryDays: 6, shippingCost: 12000 },
  { brand: 'Prusament', material: 'PLA', finish: 'glitter', colorName: 'Galaxy Black', colorHex: '#2c2b36', diameter: 1.75, initialWeight: 1000, remainingWeight: 642, price: 139000, purchaseDate: '', daysAgo: 70, location: 'Estante A · 2', nozzleTemp: { min: 205, max: 225 }, bedTemp: { min: 50, max: 60 }, notes: 'Brilla como el cielo nocturno. Ideal para piezas decorativas.', status: 'in_use', store: 'Prusa Research', productUrl: 'https://www.prusa3d.com', deliveryDays: 8, shippingCost: 25000 },
  { brand: 'eSun', material: 'PETG', finish: 'translucent', colorName: 'Azul cristal', colorHex: '#2f86d6', diameter: 1.75, initialWeight: 1000, remainingWeight: 476, price: 78000, purchaseDate: '', daysAgo: 85, location: 'Estante A · 2', nozzleTemp: { min: 230, max: 250 }, bedTemp: { min: 70, max: 80 }, notes: 'Lámparas y difusores.', status: 'in_use', store: 'Amazon', productUrl: 'https://www.amazon.com', deliveryDays: 5, shippingCost: 0 },
  { brand: 'Polymaker', material: 'PLA', finish: 'matte', colorName: 'Rojo lava', colorHex: '#c8372d', diameter: 1.75, initialWeight: 1000, remainingWeight: 146, price: 98000, purchaseDate: '', daysAgo: 95, location: 'Junto a la impresora', nozzleTemp: { min: 190, max: 230 }, bedTemp: { min: 25, max: 60 }, notes: 'PolyTerra. Acabado mate precioso.', status: 'in_use', store: 'Amazon', productUrl: 'https://www.amazon.com', deliveryDays: 6, shippingCost: 10000 },
  { brand: 'Overture', material: 'PETG', finish: 'glossy', colorName: 'Blanco nube', colorHex: '#efeee8', diameter: 1.75, initialWeight: 1000, remainingWeight: 1000, price: 82000, purchaseDate: '', daysAgo: 6, location: 'Caja seca', nozzleTemp: { min: 230, max: 250 }, bedTemp: { min: 70, max: 85 }, notes: '', status: 'sealed', store: 'Amazon', productUrl: 'https://www.amazon.com', deliveryDays: 6, shippingCost: 0 },
  { brand: 'Elegoo', material: 'PLA+', finish: 'glossy', colorName: 'Naranja calabaza', colorHex: '#f0731d', diameter: 1.75, initialWeight: 1000, remainingWeight: 68, price: 69900, purchaseDate: '', daysAgo: 110, location: 'Junto a la impresora', nozzleTemp: { min: 205, max: 230 }, bedTemp: { min: 55, max: 65 }, notes: 'Se acaba. Ya lo sabemos. No hace falta que nos lo recuerde… pero lo hará.', status: 'in_use', store: 'Amazon', productUrl: 'https://www.amazon.com', deliveryDays: 5, shippingCost: 0 },
  { brand: 'Polymaker', material: 'ASA', finish: 'matte', colorName: 'Gris galaxia', colorHex: '#6b7079', diameter: 1.75, initialWeight: 1000, remainingWeight: 334, price: 125000, purchaseDate: '', daysAgo: 120, location: 'Estante B · 2', nozzleTemp: { min: 240, max: 260 }, bedTemp: { min: 90, max: 105 }, notes: 'Piezas de exterior. Imprimir con cámara cerrada.', status: 'dry', store: '3D Market Colombia', productUrl: 'https://www.3dmarket.co', deliveryDays: 4, shippingCost: 14000 },
  { brand: 'NinjaTek', material: 'TPU', finish: 'translucent', colorName: 'Verde neón', colorHex: '#6fdc3a', diameter: 1.75, initialWeight: 500, remainingWeight: 412, price: 115000, purchaseDate: '', daysAgo: 60, location: 'Caja seca', nozzleTemp: { min: 225, max: 235 }, bedTemp: { min: 40, max: 50 }, notes: 'Imprimir lento (20 mm/s). Retracción mínima.', status: 'in_use', store: 'MatterHackers', productUrl: 'https://www.matterhackers.com', deliveryDays: 7, shippingCost: 18000 },
  { brand: 'Bambu Lab', material: 'PLA', finish: 'matte', colorName: 'Rosa chicle', colorHex: '#f19ebf', diameter: 1.75, initialWeight: 1000, remainingWeight: 921, price: 92000, purchaseDate: '', daysAgo: 20, location: 'Estante A · 2', nozzleTemp: { min: 190, max: 230 }, bedTemp: { min: 45, max: 65 }, notes: '', status: 'in_use', store: 'Bambu Lab Store', productUrl: 'https://store.bambulab.com', deliveryDays: 6, shippingCost: 12000 },
  { brand: 'Hatchbox', material: 'ABS', finish: 'glossy', colorName: 'Azul real', colorHex: '#2246b4', diameter: 1.75, initialWeight: 1000, remainingWeight: 0, price: 79000, purchaseDate: '', daysAgo: 160, location: 'Estante B · 2', nozzleTemp: { min: 230, max: 250 }, bedTemp: { min: 95, max: 110 }, notes: 'Descansa en paz. Fue un gran carrete.', status: 'empty', store: 'Amazon', productUrl: 'https://www.amazon.com', deliveryDays: 5, shippingCost: 0 },
  { brand: 'eSun', material: 'PLA-CF', finish: 'matte', colorName: 'Fibra negra', colorHex: '#2a2b2e', diameter: 1.75, initialWeight: 1000, remainingWeight: 262, price: 119000, purchaseDate: '', daysAgo: 100, location: 'Caja seca', nozzleTemp: { min: 210, max: 230 }, bedTemp: { min: 50, max: 65 }, notes: 'Boquilla de acero endurecido obligatoria.', status: 'in_use', store: 'MercadoLibre', productUrl: 'https://www.mercadolibre.com.co', deliveryDays: 3, shippingCost: 11000 },
  { brand: 'Sunlu', material: 'PLA', finish: 'silk', colorName: 'Cobre seda', colorHex: '#b8683a', diameter: 1.75, initialWeight: 1000, remainingWeight: 178, price: 76000, purchaseDate: '', daysAgo: 90, location: 'Estante B · 1', nozzleTemp: { min: 200, max: 220 }, bedTemp: { min: 50, max: 60 }, notes: '', status: 'in_use', store: 'Amazon', productUrl: 'https://www.amazon.com', deliveryDays: 6, shippingCost: 0 },
  { brand: 'Prusament', material: 'PC', finish: 'translucent', colorName: 'Natural', colorHex: '#e4dfcf', diameter: 1.75, initialWeight: 970, remainingWeight: 806, price: 159000, purchaseDate: '', daysAgo: 75, location: 'Caja seca', nozzleTemp: { min: 270, max: 280 }, bedTemp: { min: 105, max: 115 }, notes: 'PC Blend. Secado 4 h a 70 °C antes de usar.', status: 'dry', store: 'Prusa Research', productUrl: 'https://www.prusa3d.com', deliveryDays: 8, shippingCost: 25000 },
  { brand: 'Ultimaker', material: 'PLA', finish: 'glossy', colorName: 'Turquesa glaciar', colorHex: '#2fbfb9', diameter: 2.85, initialWeight: 750, remainingWeight: 590, price: 135000, purchaseDate: '', daysAgo: 45, location: 'Estante C · 1', nozzleTemp: { min: 200, max: 215 }, bedTemp: { min: 55, max: 65 }, notes: 'Para la impresora vieja de 2.85 mm.', status: 'in_use', store: 'MakerBot / Ultimaker', productUrl: 'https://www.ultimaker.com', deliveryDays: 7, shippingCost: 15000 },
];

const NOTES = ['Soporte de auriculares', 'Maceta', 'Calibración', 'Engranajes', 'Figura', 'Caja organizadora', 'Repuesto', 'Llavero', 'Prototipo', 'Clip de cables', ''];

export function buildSeed(): { rolls: Roll[]; usage: UsageEntry[]; gcodeJobs: GcodeJob[] } {
  const rand = seeded('filoteca-seed');
  const now = Date.now();
  const day = 86400000;
  const rolls: Roll[] = [];
  const usage: UsageEntry[] = [];

  SPECS.forEach((s, i) => {
    const id = `seed-${String(i + 1).padStart(2, '0')}`;
    const bought = new Date(now - s.daysAgo * day);
    const { daysAgo, ...spec } = s;
    rolls.push({
      ...spec,
      id,
      purchaseDate: bought.toISOString().slice(0, 10),
      createdAt: bought.toISOString(),
      updatedAt: new Date(now - rand() * 3 * day).toISOString(),
      seed: true,
    });

    // Historial coherente: la suma de usos = inicial - restante.
    let toUse = s.initialWeight - s.remainingWeight;
    if (toUse <= 0) return;
    const sessions = Math.max(2, Math.round(toUse / (40 + rand() * 60)));
    const weights = Array.from({ length: sessions }, () => 0.4 + rand());
    const total = weights.reduce((a, b) => a + b, 0);
    const span = Math.max(3, daysAgo - 1);
    weights.forEach((w, k) => {
      const g = k === sessions - 1 ? toUse : Math.max(1, Math.round((s.initialWeight - s.remainingWeight) * (w / total)));
      toUse -= g;
      if (g <= 0) return;
      // más uso reciente (curva sesgada al presente)
      const t = (k + rand() * 0.8) / sessions;
      const at = new Date(now - (1 - t) * span * day - rand() * day * 0.5);
      usage.push({ id: `${id}-u${k}`, rollId: id, grams: g, at: at.toISOString(), note: NOTES[Math.floor(rand() * NOTES.length)] });
    });
  });

  usage.sort((a, b) => a.at.localeCompare(b.at));

  const gcodeJobs = [
    {
      id: 'seed-job-01',
      filename: '.21552.2.gcode',
      filepath: 'anycubicslicer_model/Metadata/.21552.2.gcode.metadata',
      fileHash: 'seed-job-hash-01',
      pid: 21552,
      plateIndex: 2,
      sessionKey: '21552_p2_EXTERN_THOMAS_EDUADRO',
      jobName: 'EXTERN, THOMAS, EDUADRO',
      modelNames: ['EXTERN', 'THOMAS', 'EDUADRO'],
      slicedAt: new Date(now - 1800000).toISOString(),
      dimensions: { x: 86.2, y: 63.7, z: 3.6 },
      printTimeSeconds: 3180, // 53m
      colorChangesCount: 6,
      totalLayersCount: 22,
      status: 'unreviewed' as const,
      manualReviewRequired: false,
      totalGrams: 15.1,
      createdAt: new Date(now - 1800000).toISOString(),
      filaments: [
        {
          slotIndex: 0,
          materialName: 'PLA',
          brand: 'Anycubic',
          finish: 'glossy',
          colorHex: '#F2754E',
          gcodeColorHex: '#F2754E',
          grams: 2.1,
          suggestedRollId: 'seed-07',
          confidence: 85,
        },
        {
          slotIndex: 1,
          materialName: 'PLA',
          brand: 'Anycubic',
          finish: 'glossy',
          colorHex: '#3E55AB',
          gcodeColorHex: '#3E55AB',
          grams: 13.0,
          suggestedRollId: 'seed-02',
          confidence: 98,
        },
      ],
    },
  ];

  return { rolls, usage, gcodeJobs };
}
