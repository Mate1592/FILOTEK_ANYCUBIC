import type { ExportBundle, Roll, UsageEntry } from '../shared/types';
import { sanitizeRoll, todayIso } from './roll';

export function rollsToCsv(rolls: Roll[]): string {
  const headers = [
    'Marca',
    'Material',
    'Color',
    'Hex',
    'Acabado',
    'Diametro',
    'PesoInicial_g',
    'PesoRestante_g',
    'Precio',
    'FechaCompra',
    'Ubicacion',
    'TempBoquillaMin',
    'TempBoquillaMax',
    'TempCamaMin',
    'TempCamaMax',
    'Estado',
    'Notas',
  ];

  const escape = (val: string | number | undefined) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = rolls.map((r) => [
    escape(r.brand),
    escape(r.material),
    escape(r.colorName),
    escape(r.colorHex),
    escape(r.finish),
    escape(r.diameter),
    escape(r.initialWeight),
    escape(r.remainingWeight),
    escape(r.price),
    escape(r.purchaseDate),
    escape(r.location),
    escape(r.nozzleTemp.min),
    escape(r.nozzleTemp.max),
    escape(r.bedTemp.min),
    escape(r.bedTemp.max),
    escape(r.status),
    escape(r.notes),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

export function parseRollsCsv(csvText: string): Roll[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];

  // Parse simple CSV with quotes
  const parseLine = (line: string): string[] => {
    const res: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        res.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    res.push(cur.trim());
    return res;
  };

  const rolls: Roll[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length < 5) continue;
    try {
      rolls.push(
        sanitizeRoll({
          brand: cols[0],
          material: cols[1] as any,
          colorName: cols[2],
          colorHex: cols[3],
          finish: cols[4] as any,
          diameter: (parseFloat(cols[5]) >= 2.5 ? 2.85 : 1.75) as 1.75 | 2.85,
          initialWeight: parseFloat(cols[6]) || 1000,
          remainingWeight: parseFloat(cols[7]) || 1000,
          price: parseFloat(cols[8]) || 0,
          purchaseDate: cols[9] || todayIso(),
          location: cols[10] || '',
          nozzleTemp: {
            min: parseInt(cols[11]) || 200,
            max: parseInt(cols[12]) || 220,
          },
          bedTemp: {
            min: parseInt(cols[13]) || 50,
            max: parseInt(cols[14]) || 60,
          },
          status: (cols[15] as any) || 'in_use',
          notes: cols[16] || '',
        }),
      );
    } catch {
      // saltar fila malformada
    }
  }
  return rolls;
}
