import type { Language } from '../shared/types';

export type PricingMode = 'markup' | 'margin';

export interface PrintQuoteMaterialItem {
  id?: string;
  name: string;
  rollId?: string;
  grams: number;
  /** Costo directo por gramo; si se omite, se calcula con spoolPrice / spoolWeightGrams. */
  costPerGram?: number;
  spoolPrice?: number;
  spoolWeightGrams?: number;
  /** Gramos planos adicionales de purga/desperdicio. */
  wasteGrams?: number;
  /** Porcentaje adicional de purga/desperdicio sobre `grams` (ej. 5 = +5%). */
  wastePct?: number;
}

export interface PrintQuoteInput {
  jobName?: string;
  materials: PrintQuoteMaterialItem[];

  // Tiempo (prefiere printTimeSeconds si es finito >= 0; fallback a printHours)
  printTimeSeconds?: number;
  printHours?: number;

  // Energía
  printerWattage: number;
  electricityRatePerKwh: number;

  // Costo de máquina: tarifa por hora directa o amortización
  machineHourlyRate?: number;
  machinePrice?: number;
  machineLifespanHours?: number;
  maintenancePerHour?: number;
  preferMachineAmortization?: boolean;

  // Mano de obra y costos fijos
  laborHourlyRate?: number;
  setupMinutes?: number;
  postProcessMinutes?: number;
  postProcessPerUnit?: boolean;
  flatFee?: number;

  // Riesgo, ganancia, impuestos, lote y precio objetivo
  failurePct?: number;
  profitPct?: number;
  pricingMode?: PricingMode;
  taxPct?: number;
  batchUnits?: number;
  targetUnitPrice?: number;
  targetTotalPrice?: number;
  targetPriceIncludesTax?: boolean;
}

export interface PrintQuoteMaterialBreakdown {
  name: string;
  rollId?: string;
  baseGrams: number;
  wasteGrams: number;
  effectiveGrams: number;
  costPerGram: number;
  cost: number;
}

export interface PrintQuoteShares {
  materialPct: number;
  electricityPct: number;
  machinePct: number;
  laborPct: number;
  flatFeePct: number;
  failurePct: number;
}

export interface PrintQuoteResult {
  batchUnits: number;
  printHours: number;
  energyKwh: number;
  effectiveMachineHourlyRate: number;

  baseMaterialGrams: number;
  wasteMaterialGrams: number;
  totalMaterialGrams: number;
  materialBreakdown: PrintQuoteMaterialBreakdown[];

  materialCost: number;
  electricityCost: number;
  machineCost: number;
  laborCost: number;
  flatFeeCost: number;
  directCost: number;
  failureBufferCost: number;
  productionCost: number;

  pricingMode: PricingMode;
  profitAmount: number;
  effectiveMarkupPct: number;
  effectiveMarginPct: number;
  isPriceOverridden: boolean;
  isBelowCost: boolean;

  subtotalBeforeTax: number;
  taxAmount: number;
  totalWithTax: number;

  unitProductionCost: number;
  unitSubtotalBeforeTax: number;
  unitTotalWithTax: number;

  shares: PrintQuoteShares;
}

export interface QuoteFormatOptions {
  lang: Language;
  currency: string;
  formatMoney: (n: number) => string;
  workshopName?: string;
  clientName?: string;
  notes?: string;
  quoteDate?: string;
}

function fin(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function nn(v: unknown): number {
  return Math.max(0, fin(v, 0));
}

export function calculatePrintQuote(input: PrintQuoteInput): PrintQuoteResult {
  const batchUnits = Math.max(1, Math.round(fin(input.batchUnits, 1)));
  const printHours =
    input.printTimeSeconds !== undefined && Number.isFinite(input.printTimeSeconds) && input.printTimeSeconds >= 0
      ? input.printTimeSeconds / 3600
      : nn(input.printHours);

  // Materiales
  const materialBreakdown: PrintQuoteMaterialBreakdown[] = [];
  let baseMaterialGrams = 0;
  let wasteMaterialGrams = 0;
  let totalMaterialGrams = 0;
  let materialCost = 0;

  for (const item of input.materials ?? []) {
    const baseGrams = nn(item.grams);
    const wasteGrams = fin(nn(item.wasteGrams) + baseGrams * (nn(item.wastePct) / 100), 0);
    const effectiveGrams = fin(baseGrams + wasteGrams, 0);

    let cpg = 0;
    if (item.costPerGram !== undefined && Number.isFinite(item.costPerGram)) {
      cpg = Math.max(0, item.costPerGram);
    } else if (nn(item.spoolPrice) > 0) {
      const spoolWeight = nn(item.spoolWeightGrams) > 0 ? nn(item.spoolWeightGrams) : 1000;
      cpg = fin(nn(item.spoolPrice) / spoolWeight, 0);
    }

    const cost = fin(effectiveGrams * cpg, 0);
    materialBreakdown.push({
      name: item.name,
      rollId: item.rollId,
      baseGrams,
      wasteGrams,
      effectiveGrams,
      costPerGram: cpg,
      cost,
    });

    baseMaterialGrams = fin(baseMaterialGrams + baseGrams, 0);
    wasteMaterialGrams = fin(wasteMaterialGrams + wasteGrams, 0);
    totalMaterialGrams = fin(totalMaterialGrams + effectiveGrams, 0);
    materialCost = fin(materialCost + cost, 0);
  }

  // Energía eléctrica
  const energyKwh = fin((nn(input.printerWattage) * printHours) / 1000, 0);
  const electricityCost = fin(energyKwh * nn(input.electricityRatePerKwh), 0);

  // Máquina (tarifa por hora o amortización)
  const hasAmortization = nn(input.machinePrice) > 0 && nn(input.machineLifespanHours) > 0;
  let effectiveMachineHourlyRate = 0;
  if ((input.preferMachineAmortization === true || input.machineHourlyRate === undefined) && hasAmortization) {
    effectiveMachineHourlyRate = fin(
      nn(input.machinePrice) / nn(input.machineLifespanHours) + nn(input.maintenancePerHour),
      0,
    );
  } else {
    effectiveMachineHourlyRate = nn(input.machineHourlyRate);
  }
  const machineCost = fin(effectiveMachineHourlyRate * printHours, 0);

  // Mano de obra y cargos fijos
  const setupMinutes = nn(input.setupMinutes);
  const postMinutes = fin(nn(input.postProcessMinutes) * (input.postProcessPerUnit ? batchUnits : 1), 0);
  const laborCost = fin(((setupMinutes + postMinutes) / 60) * nn(input.laborHourlyRate), 0);
  const flatFeeCost = nn(input.flatFee);

  // Costos directos y de producción
  const directCost = fin(materialCost + electricityCost + machineCost + laborCost + flatFeeCost, 0);
  const failureBufferCost = fin(directCost * (nn(input.failurePct) / 100), 0);
  const productionCost = fin(directCost + failureBufferCost, 0);

  // Utilidad, override e impuestos
  const pricingMode: PricingMode = input.pricingMode === 'margin' ? 'margin' : 'markup';
  const taxRate = nn(input.taxPct) / 100;

  const hasTargetTotal =
    input.targetTotalPrice !== undefined && Number.isFinite(input.targetTotalPrice) && input.targetTotalPrice >= 0;
  const hasTargetUnit =
    input.targetUnitPrice !== undefined && Number.isFinite(input.targetUnitPrice) && input.targetUnitPrice >= 0;
  const isPriceOverridden = hasTargetTotal || hasTargetUnit;

  let subtotalBeforeTax = 0;
  let taxAmount = 0;
  let totalWithTax = 0;
  let profitAmount = 0;

  if (isPriceOverridden) {
    const targetTotal = fin(hasTargetTotal ? input.targetTotalPrice! : input.targetUnitPrice! * batchUnits, 0);
    const includesTax = input.targetPriceIncludesTax !== false;
    if (includesTax) {
      totalWithTax = targetTotal;
      subtotalBeforeTax = fin(taxRate > 0 ? totalWithTax / (1 + taxRate) : totalWithTax, 0);
      taxAmount = fin(totalWithTax - subtotalBeforeTax, 0);
    } else {
      subtotalBeforeTax = targetTotal;
      taxAmount = fin(subtotalBeforeTax * taxRate, 0);
      totalWithTax = fin(subtotalBeforeTax + taxAmount, 0);
    }
    profitAmount = fin(subtotalBeforeTax - productionCost, 0);
  } else {
    const pct = nn(input.profitPct);
    if (pricingMode === 'margin') {
      const safeMarginPct = Math.min(pct, 99.9);
      subtotalBeforeTax = fin(productionCost > 0 ? productionCost / (1 - safeMarginPct / 100) : 0, 0);
      profitAmount = fin(subtotalBeforeTax - productionCost, 0);
    } else {
      profitAmount = fin(productionCost * (pct / 100), 0);
      subtotalBeforeTax = fin(productionCost + profitAmount, 0);
    }
    taxAmount = fin(subtotalBeforeTax * taxRate, 0);
    totalWithTax = fin(subtotalBeforeTax + taxAmount, 0);
  }

  const effectiveMarkupPct = fin(productionCost > 0 ? (profitAmount / productionCost) * 100 : 0, 0);
  const effectiveMarginPct = fin(subtotalBeforeTax > 0 ? (profitAmount / subtotalBeforeTax) * 100 : 0, 0);
  const isBelowCost = profitAmount < -1e-9;

  const unitProductionCost = fin(productionCost / batchUnits, 0);
  const unitSubtotalBeforeTax = fin(subtotalBeforeTax / batchUnits, 0);
  const unitTotalWithTax = fin(totalWithTax / batchUnits, 0);

  const shares: PrintQuoteShares =
    productionCost > 0
      ? {
          materialPct: fin((materialCost / productionCost) * 100, 0),
          electricityPct: fin((electricityCost / productionCost) * 100, 0),
          machinePct: fin((machineCost / productionCost) * 100, 0),
          laborPct: fin((laborCost / productionCost) * 100, 0),
          flatFeePct: fin((flatFeeCost / productionCost) * 100, 0),
          failurePct: fin((failureBufferCost / productionCost) * 100, 0),
        }
      : {
          materialPct: 0,
          electricityPct: 0,
          machinePct: 0,
          laborPct: 0,
          flatFeePct: 0,
          failurePct: 0,
        };

  return {
    batchUnits,
    printHours,
    energyKwh,
    effectiveMachineHourlyRate,
    baseMaterialGrams,
    wasteMaterialGrams,
    totalMaterialGrams,
    materialBreakdown,
    materialCost,
    electricityCost,
    machineCost,
    laborCost,
    flatFeeCost,
    directCost,
    failureBufferCost,
    productionCost,
    pricingMode,
    profitAmount,
    effectiveMarkupPct,
    effectiveMarginPct,
    isPriceOverridden,
    isBelowCost,
    subtotalBeforeTax,
    taxAmount,
    totalWithTax,
    unitProductionCost,
    unitSubtotalBeforeTax,
    unitTotalWithTax,
    shares,
  };
}

interface QuoteLabels {
  quoteTitle: string;
  project: string;
  untitled: string;
  date: string;
  client: string;
  currency: string;
  units: string;
  printTime: string;
  totalFilament: string;
  materials: string;
  gramsUnit: string;
  costBreakdown: string;
  materialCost: string;
  electricityCost: string;
  machineCost: string;
  laborCost: string;
  flatFeeCost: string;
  failureBuffer: string;
  productionCost: string;
  profit: string;
  subtotal: string;
  tax: string;
  total: string;
  unitPrice: string;
  notes: string;
}

const QUOTE_LABELS: Record<Language, QuoteLabels> = {
  es: {
    quoteTitle: 'Cotización de Impresión 3D',
    project: 'Proyecto',
    untitled: 'Impresión 3D',
    date: 'Fecha',
    client: 'Cliente',
    currency: 'Moneda',
    units: 'Unidades',
    printTime: 'Tiempo estimado',
    totalFilament: 'Filamento total',
    materials: 'Materiales',
    gramsUnit: 'g',
    costBreakdown: 'Desglose de costos',
    materialCost: 'Filamento',
    electricityCost: 'Energía eléctrica',
    machineCost: 'Uso de máquina',
    laborCost: 'Mano de obra',
    flatFeeCost: 'Insumos / cargo fijo',
    failureBuffer: 'Margen de desperdicio/fallo',
    productionCost: 'Costo de producción',
    profit: 'Margen / ganancia',
    subtotal: 'Subtotal',
    tax: 'Impuestos',
    total: 'Total',
    unitPrice: 'Precio por unidad',
    notes: 'Notas',
  },
  en: {
    quoteTitle: '3D Print Quote',
    project: 'Project',
    untitled: '3D Print',
    date: 'Date',
    client: 'Client',
    currency: 'Currency',
    units: 'Units',
    printTime: 'Print time',
    totalFilament: 'Total filament',
    materials: 'Materials',
    gramsUnit: 'g',
    costBreakdown: 'Cost breakdown',
    materialCost: 'Filament',
    electricityCost: 'Electricity',
    machineCost: 'Machine time',
    laborCost: 'Labor',
    flatFeeCost: 'Hardware / flat fee',
    failureBuffer: 'Failure buffer',
    productionCost: 'Production cost',
    profit: 'Profit',
    subtotal: 'Subtotal',
    tax: 'Tax',
    total: 'Total',
    unitPrice: 'Unit price',
    notes: 'Notes',
  },
  pt: {
    quoteTitle: 'Orçamento de Impressão 3D',
    project: 'Projeto',
    untitled: 'Impressão 3D',
    date: 'Data',
    client: 'Cliente',
    currency: 'Moeda',
    units: 'Unidades',
    printTime: 'Tempo estimado',
    totalFilament: 'Filamento total',
    materials: 'Materiais',
    gramsUnit: 'g',
    costBreakdown: 'Detalhamento de custos',
    materialCost: 'Filamento',
    electricityCost: 'Energia elétrica',
    machineCost: 'Uso da máquina',
    laborCost: 'Mão de obra',
    flatFeeCost: 'Insumos / taxa fixa',
    failureBuffer: 'Margem de falha/desperdício',
    productionCost: 'Custo de produção',
    profit: 'Lucro',
    subtotal: 'Subtotal',
    tax: 'Impostos',
    total: 'Total',
    unitPrice: 'Preço unitário',
    notes: 'Observações',
  },
};

function formatDurationHours(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatQuoteText(
  input: PrintQuoteInput,
  result: PrintQuoteResult,
  opts: QuoteFormatOptions,
): string {
  const labels = QUOTE_LABELS[opts.lang] || QUOTE_LABELS.es;
  const workshop = opts.workshopName?.trim() || 'Filoteca';
  const jobTitle = input.jobName?.trim() || labels.untitled;
  const dateText = opts.quoteDate?.trim() || new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`${workshop} — ${labels.quoteTitle}`);
  lines.push(`${labels.project}: ${jobTitle}`);
  lines.push(`${labels.date}: ${dateText}`);
  if (opts.clientName?.trim()) {
    lines.push(`${labels.client}: ${opts.clientName.trim()}`);
  }
  lines.push(`${labels.currency}: ${opts.currency}`);
  lines.push(`${labels.units}: ${result.batchUnits}`);
  lines.push(`${labels.printTime}: ${formatDurationHours(result.printHours)}`);
  lines.push(`${labels.totalFilament}: ${result.totalMaterialGrams.toFixed(1)} ${labels.gramsUnit}`);

  if (result.materialBreakdown.length > 0) {
    lines.push('');
    lines.push(`${labels.materials}:`);
    for (const m of result.materialBreakdown) {
      lines.push(
        `  - ${m.name}: ${m.effectiveGrams.toFixed(1)} ${labels.gramsUnit} (${opts.formatMoney(m.cost)})`,
      );
    }
  }

  lines.push('');
  lines.push(`${labels.productionCost}: ${opts.formatMoney(result.productionCost)}`);
  lines.push(`${labels.subtotal}: ${opts.formatMoney(result.subtotalBeforeTax)}`);
  if (result.taxAmount > 0) {
    lines.push(`${labels.tax}: ${opts.formatMoney(result.taxAmount)}`);
  }
  lines.push(`${labels.total}: ${opts.formatMoney(result.totalWithTax)}`);
  if (result.batchUnits > 1) {
    lines.push(`${labels.unitPrice}: ${opts.formatMoney(result.unitTotalWithTax)}`);
  }

  if (opts.notes?.trim()) {
    lines.push('');
    lines.push(`${labels.notes}: ${opts.notes.trim()}`);
  }

  return lines.join('\n');
}

export function formatQuoteHtml(
  input: PrintQuoteInput,
  result: PrintQuoteResult,
  opts: QuoteFormatOptions,
): string {
  const labels = QUOTE_LABELS[opts.lang] || QUOTE_LABELS.es;
  const langAttr = opts.lang === 'en' || opts.lang === 'pt' ? opts.lang : 'es';
  const workshop = escapeHtml(opts.workshopName?.trim() || 'Filoteca');
  const jobTitle = escapeHtml(input.jobName?.trim() || labels.untitled);
  const dateText = escapeHtml(opts.quoteDate?.trim() || new Date().toISOString().slice(0, 10));
  const currency = escapeHtml(opts.currency);
  const clientRow = opts.clientName?.trim()
    ? `<div><span class="meta-label">${escapeHtml(labels.client)}:</span> ${escapeHtml(opts.clientName.trim())}</div>`
    : '';
  const notesBlock = opts.notes?.trim()
    ? `<section class="notes"><h2>${escapeHtml(labels.notes)}</h2><p>${escapeHtml(opts.notes.trim())}</p></section>`
    : '';

  const materialRows = result.materialBreakdown
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.name)}</td><td class="num">${escapeHtml(m.effectiveGrams.toFixed(1))} ${escapeHtml(labels.gramsUnit)}</td><td class="num">${escapeHtml(opts.formatMoney(m.cost))}</td></tr>`,
    )
    .join('');

  const taxRow =
    result.taxAmount > 0
      ? `<tr><td>${escapeHtml(labels.tax)}</td><td class="num">${escapeHtml(opts.formatMoney(result.taxAmount))}</td></tr>`
      : '';

  const unitRow =
    result.batchUnits > 1
      ? `<tr class="unit-row"><td>${escapeHtml(labels.unitPrice)}</td><td class="num">${escapeHtml(opts.formatMoney(result.unitTotalWithTax))}</td></tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="${langAttr}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${workshop} — ${escapeHtml(labels.quoteTitle)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      color: #18181b;
      background: #f4f4f5;
      line-height: 1.5;
    }
    .sheet {
      max-width: 720px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e4e4e7;
      border-radius: 12px;
      padding: 28px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      border-bottom: 2px solid #f4f4f5;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    h1 { margin: 0 0 4px 0; font-size: 20px; }
    .subtitle { color: #52525b; font-size: 13px; }
    .meta { font-size: 13px; color: #3f3f46; text-align: right; }
    .meta-label { color: #71717a; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .stat {
      background: #fafafa;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .stat-label { font-size: 11px; text-transform: uppercase; color: #71717a; letter-spacing: 0.04em; }
    .stat-val { font-size: 16px; font-weight: 600; margin-top: 2px; }
    h2 { font-size: 14px; margin: 18px 0 8px 0; color: #27272a; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #f4f4f5; text-align: left; }
    th { font-size: 12px; color: #71717a; font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #18181b; border-bottom: none; padding-top: 12px; }
    .unit-row td { font-weight: 600; color: #3f3f46; border-bottom: none; }
    .notes { margin-top: 20px; padding: 12px; background: #fafafa; border-radius: 8px; font-size: 13px; }
    .notes p { margin: 4px 0 0 0; white-space: pre-wrap; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .sheet { border: none; border-radius: 0; padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header>
      <div>
        <h1>${workshop}</h1>
        <div class="subtitle">${escapeHtml(labels.quoteTitle)} — ${jobTitle}</div>
      </div>
      <div class="meta">
        <div><span class="meta-label">${escapeHtml(labels.date)}:</span> ${dateText}</div>
        <div><span class="meta-label">${escapeHtml(labels.currency)}:</span> ${currency}</div>
        ${clientRow}
      </div>
    </header>

    <section class="summary-grid">
      <div class="stat">
        <div class="stat-label">${escapeHtml(labels.units)}</div>
        <div class="stat-val">${result.batchUnits}</div>
      </div>
      <div class="stat">
        <div class="stat-label">${escapeHtml(labels.printTime)}</div>
        <div class="stat-val">${escapeHtml(formatDurationHours(result.printHours))}</div>
      </div>
      <div class="stat">
        <div class="stat-label">${escapeHtml(labels.totalFilament)}</div>
        <div class="stat-val">${escapeHtml(result.totalMaterialGrams.toFixed(1))} ${escapeHtml(labels.gramsUnit)}</div>
      </div>
    </section>

    ${
      materialRows
        ? `<section>
      <h2>${escapeHtml(labels.materials)}</h2>
      <table>
        <thead>
          <tr><th>${escapeHtml(labels.materials)}</th><th class="num">${escapeHtml(labels.totalFilament)}</th><th class="num">${escapeHtml(labels.materialCost)}</th></tr>
        </thead>
        <tbody>${materialRows}</tbody>
      </table>
    </section>`
        : ''
    }

    <section>
      <h2>${escapeHtml(labels.costBreakdown)}</h2>
      <table>
        <tbody>
          <tr><td>${escapeHtml(labels.materialCost)}</td><td class="num">${escapeHtml(opts.formatMoney(result.materialCost))}</td></tr>
          <tr><td>${escapeHtml(labels.electricityCost)}</td><td class="num">${escapeHtml(opts.formatMoney(result.electricityCost))}</td></tr>
          <tr><td>${escapeHtml(labels.machineCost)}</td><td class="num">${escapeHtml(opts.formatMoney(result.machineCost))}</td></tr>
          <tr><td>${escapeHtml(labels.laborCost)}</td><td class="num">${escapeHtml(opts.formatMoney(result.laborCost))}</td></tr>
          <tr><td>${escapeHtml(labels.flatFeeCost)}</td><td class="num">${escapeHtml(opts.formatMoney(result.flatFeeCost))}</td></tr>
          <tr><td>${escapeHtml(labels.failureBuffer)}</td><td class="num">${escapeHtml(opts.formatMoney(result.failureBufferCost))}</td></tr>
          <tr><td><strong>${escapeHtml(labels.productionCost)}</strong></td><td class="num"><strong>${escapeHtml(opts.formatMoney(result.productionCost))}</strong></td></tr>
          <tr><td>${escapeHtml(labels.profit)}</td><td class="num">${escapeHtml(opts.formatMoney(result.profitAmount))}</td></tr>
          <tr><td>${escapeHtml(labels.subtotal)}</td><td class="num">${escapeHtml(opts.formatMoney(result.subtotalBeforeTax))}</td></tr>
          ${taxRow}
          <tr class="total-row"><td>${escapeHtml(labels.total)}</td><td class="num">${escapeHtml(opts.formatMoney(result.totalWithTax))}</td></tr>
          ${unitRow}
        </tbody>
      </table>
    </section>

    ${notesBlock}
  </main>
</body>
</html>`;
}
