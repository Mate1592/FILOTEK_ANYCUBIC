import React, { useState } from 'react';
import {
  Moon,
  Sun,
  Monitor,
  Database,
  Download,
  Upload,
  FolderOpen,
  RefreshCw,
  Trash2,
  Check,
  AlertTriangle,
  Info,
  Sliders,
  DollarSign,
  ShieldCheck,
  Truck,
  Clock,
  Printer,
  Terminal,
  Copy,
} from 'lucide-react';
import type { ExportBundle, ThemePref } from '../../shared/types';
import { useStore } from '../../store/useStore';
import { api, isDesktop } from '../../lib/api';
import { rollsToCsv, parseRollsCsv } from '../../lib/export';
import { sanitizeRoll, todayIso } from '../../lib/roll';

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const rolls = useStore((s) => s.rolls);
  const usage = useStore((s) => s.usage);
  const shopping = useStore((s) => s.shopping);
  const toast = useStore((s) => s.toast);
  const clearSeed = useStore((s) => s.clearSeed);
  const loadSeed = useStore((s) => s.loadSeed);
  const replaceAll = useStore((s) => s.replaceAll);
  const mergeRolls = useStore((s) => s.mergeRolls);

  const [dbPath, setDbPath] = useState<string>('');
  const [detectedProcesses, setDetectedProcesses] = useState<string[]>([]);
  const [scanningProcesses, setScanningProcesses] = useState<boolean>(false);

  React.useEffect(() => {
    api.db.path().then(setDbPath);
  }, []);

  const handleBackup = async () => {
    const res = await api.backup.create();
    if (res.ok && res.data) {
      toast({
        kind: 'success',
        title: 'Copia de seguridad guardada',
        body: `Archivo guardado en: ${res.data}`,
      });
    }
  };

  const handleRestore = async () => {
    const res = await api.backup.restore();
    if (res.ok && res.data) {
      toast({
        kind: 'success',
        title: 'Copia de seguridad restaurada',
        body: 'La base de datos se ha restablecido correctamente.',
      });
      useStore.getState().load();
    } else if (!res.ok) {
      toast({
        kind: 'error',
        title: 'Error al restaurar',
        body: res.error,
      });
    }
  };

  const handleExportJson = async () => {
    const orders = useStore.getState().orders;
    const gcodeJobs = useStore.getState().gcodeJobs;
    const bundle: ExportBundle = {
      app: 'filoteca',
      version: 2,
      exportedAt: new Date().toISOString(),
      rolls,
      usage,
      shopping,
      orders,
      gcodeJobs,
    };
    const jsonStr = JSON.stringify(bundle, null, 2);
    const dateStr = todayIso();
    const res = await api.file.save(jsonStr, `filoteca-export-${dateStr}.json`, [
      { name: 'Filoteca JSON', extensions: ['json'] },
    ]);
    if (res.ok && res.data) {
      toast({ kind: 'success', title: 'Exportación completada', body: res.data });
    }
  };

  const handleExportCsv = async () => {
    const csvStr = rollsToCsv(rolls);
    const dateStr = todayIso();
    const res = await api.file.save(csvStr, `filoteca-rollos-${dateStr}.csv`, [
      { name: 'CSV Filamento', extensions: ['csv'] },
    ]);
    if (res.ok && res.data) {
      toast({ kind: 'success', title: 'CSV exportado', body: res.data });
    }
  };

  const handleImportFile = async () => {
    const res = await api.file.open([
      { name: 'Archivos compatibles (JSON, CSV)', extensions: ['json', 'csv'] },
    ]);
    if (!res.ok || !res.data) return;

    const { name, content } = res.data;
    try {
      if (name.endsWith('.json')) {
        const parsed = JSON.parse(content);
        if (parsed.rolls && Array.isArray(parsed.rolls)) {
          await mergeRolls(parsed.rolls, parsed.usage || []);
          toast({
            kind: 'success',
            title: 'Importación exitosa',
            body: `Se incorporaron ${parsed.rolls.length} rollos desde el archivo JSON.`,
          });
        } else {
          throw new Error('Formato JSON no reconocido.');
        }
      } else if (name.endsWith('.csv')) {
        const parsed = parseRollsCsv(content);
        if (parsed.length > 0) {
          await mergeRolls(parsed, []);
          toast({
            kind: 'success',
            title: 'Importación CSV exitosa',
            body: `Se agregaron ${parsed.length} rollos desde el archivo CSV.`,
          });
        } else {
          throw new Error('No se encontraron filas válidas en el CSV.');
        }
      }
    } catch (e) {
      toast({
        kind: 'error',
        title: 'Error de importación',
        body: (e as Error).message,
      });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-4xl mx-auto workbench-bg">
      {/* Header */}
      <div>
        <span className="text-xs font-mono text-muted uppercase tracking-wider block">
          Configuración general
        </span>
        <h2 className="font-display font-bold text-2xl text-text">
          Ajustes de Taller
        </h2>
      </div>

      {/* Theme selection */}
      <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-3">
        <label className="label">Tema de interfaz</label>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ['system', 'Sistema', Monitor],
              ['dark', 'Modo Oscuro', Moon],
              ['light', 'Modo Claro', Sun],
            ] as [ThemePref, string, any][]
          ).map(([t, label, Icon]) => (
            <button
              key={t}
              type="button"
              onClick={() => setSetting('theme', t)}
              className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                settings.theme === t
                  ? 'bg-accent/15 border-accent text-accent-text font-bold shadow-xs'
                  : 'bg-surface-2 border-line text-muted hover:text-text'
              }`}
            >
              <Icon size={18} />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stock thresholds */}
      <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-text font-bold text-sm">
          <Sliders size={16} className="text-accent-text" />
          <span>Umbrales de Alerta de Filamento</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl bg-surface-2/60 border border-line">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-warn-text flex items-center gap-1.5">
                <AlertTriangle size={14} />
                <span>Bajo Stock (Reserva)</span>
              </span>
              <span className="font-mono text-xs font-bold text-text">
                {settings.lowThreshold}%
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="40"
              step="5"
              value={settings.lowThreshold}
              onChange={(e) => setSetting('lowThreshold', parseInt(e.target.value))}
              className="w-full accent-warn cursor-pointer"
            />
            <span className="text-[11px] text-faint block mt-1">
              La bobina muestra aro ámbar y capa delgada al alcanzar este porcentaje.
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-2/60 border border-line">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-crit-text flex items-center gap-1.5">
                <AlertTriangle size={14} />
                <span>Stock Crítico</span>
              </span>
              <span className="font-mono text-xs font-bold text-text">
                {settings.criticalThreshold}%
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="20"
              step="1"
              value={settings.criticalThreshold}
              onChange={(e) => setSetting('criticalThreshold', parseInt(e.target.value))}
              className="w-full accent-crit cursor-pointer"
            />
            <span className="text-[11px] text-faint block mt-1">
              Pulso activo y advertencia marcada para evitar impresiones fallidas.
            </span>
          </div>
        </div>
      </div>

      {/* Reabastecimiento */}
      <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-text font-bold text-sm">
          <Truck size={16} className="text-accent-text" />
          <span>Tiempos de Reabastecimiento (Global)</span>
        </div>

        <p className="text-xs text-muted leading-relaxed">
          Configuración por defecto para calcular fechas límite de compra y predecir cuándo pedir antes de que se agote el stock. Se puede personalizar por producto en la pestaña Reabastecimiento.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl bg-surface-2/60 border border-line space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text flex items-center gap-1.5">
                <Clock size={14} className="text-muted" />
                <span>Tiempo de entrega típico</span>
              </span>
              <span className="font-mono text-xs font-bold text-accent-text">
                {settings.defaultDeliveryDays ?? 6} días
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={settings.defaultDeliveryDays ?? 6}
              onChange={(e) => setSetting('defaultDeliveryDays', parseInt(e.target.value))}
              className="w-full accent-accent cursor-pointer"
            />
            <span className="text-[11px] text-faint block">
              Días que tarda en llegar un pedido desde que lo compras (6 días por defecto).
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-2/60 border border-line space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-ok" />
                <span>Margen de seguridad</span>
              </span>
              <span className="font-mono text-xs font-bold text-ok">
                {settings.defaultSafetyMarginDays ?? 2} días
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="15"
              step="1"
              value={settings.defaultSafetyMarginDays ?? 2}
              onChange={(e) => setSetting('defaultSafetyMarginDays', parseInt(e.target.value))}
              className="w-full accent-ok cursor-pointer"
            />
            <span className="text-[11px] text-faint block">
              Días de holgura preventiva ante retrasos de paquetería (2 días por defecto).
            </span>
          </div>
        </div>
      </div>

      {/* Anycubic Slicer Next / Slicer Integration */}
      <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-text font-bold text-sm">
            <Printer size={16} className="text-accent-text" />
            <span>Conectar con Anycubic Slicer Next (y otros laminadores)</span>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-accent-text text-[10px] font-mono uppercase tracking-wider font-bold">
            Automático
          </span>
        </div>

        <p className="text-xs text-muted leading-relaxed">
          Registra tus consumos de filamento automáticamente desde el laminador al terminar de cortar la pieza, sin tener que anotar los gramos a mano.
        </p>

        {/* Modo Acompañante */}
        <div className="p-4 rounded-xl bg-surface-2/60 border border-line space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-bold text-text">Modo Acompañante (Slicer Companion)</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.companionModeEnabled !== false}
                onChange={(e) => setSetting('companionModeEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-surface-3 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
            </label>
          </div>

          <p className="text-xs text-muted leading-relaxed">
            Filoteca detecta cuando abres tu laminador y se prepara en segundo plano sin robar el foco de Windows. Al cerrar el laminador, te pregunta qué archivos mandaste a imprimir para descontarlos en 1 clic.
          </p>

          <div className="space-y-3 pt-2 border-t border-line/60">
            <div>
              <span className="text-xs font-medium text-text block mb-1">Nombre del proceso ejecutable del laminador:</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.companionSlicerExe || 'AnycubicSlicerNext.exe'}
                  onChange={(e) => setSetting('companionSlicerExe', e.target.value)}
                  placeholder="AnycubicSlicerNext.exe"
                  className="field flex-1 font-mono text-xs text-text bg-surface-1"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setScanningProcesses(true);
                    try {
                      const res = await api.companion.listProcesses();
                      if (res.ok && res.data.length > 0) {
                        setDetectedProcesses(res.data);
                        toast({
                          kind: 'success',
                          title: 'Procesos encontrados',
                          body: `Se detectaron: ${res.data.join(', ')}`,
                        });
                      } else {
                        toast({
                          kind: 'info',
                          title: 'Ningún laminador abierto',
                          body: 'Abre Anycubic Slicer Next u OrcaSlicer para detectarlo.',
                        });
                      }
                    } finally {
                      setScanningProcesses(false);
                    }
                  }}
                  disabled={scanningProcesses}
                  className="px-3 py-2 rounded-xl bg-surface-3 hover:bg-surface-2 border border-line text-xs font-semibold text-text shrink-0 cursor-pointer transition-colors"
                >
                  {scanningProcesses ? 'Buscando...' : 'Detectar procesos'}
                </button>
              </div>

              {detectedProcesses.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-faint">Detectados:</span>
                  {detectedProcesses.map((proc) => (
                    <button
                      key={proc}
                      type="button"
                      onClick={() => setSetting('companionSlicerExe', proc)}
                      className="px-2 py-0.5 rounded-lg bg-accent/15 text-accent-text border border-accent/30 text-[11px] font-mono hover:bg-accent/25 transition-all cursor-pointer"
                    >
                      {proc}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Opciones del modo acompañante */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={settings.companionAutoOpen !== false}
                  onChange={(e) => setSetting('companionAutoOpen', e.target.checked)}
                  className="mt-0.5 rounded border-line text-accent focus:ring-accent"
                />
                <div>
                  <span className="font-semibold text-text block">Abrir en segundo plano</span>
                  <span className="text-faint text-[11px]">Se inicia silenciosamente sin robar el foco de Windows.</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={settings.companionPromptOnExit !== false}
                  onChange={(e) => setSetting('companionPromptOnExit', e.target.checked)}
                  className="mt-0.5 rounded border-line text-accent focus:ring-accent"
                />
                <div>
                  <span className="font-semibold text-text block">Preguntar al cerrar</span>
                  <span className="text-faint text-[11px]">Muestra modal con los archivos laminados para confirmar.</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Ingestión nativa y carpeta vigilada */}
        <div className="p-4 rounded-xl bg-surface-2/60 border border-line space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <FolderOpen size={14} className="text-accent-text" />
              <span>Vigilancia automática en tiempo real</span>
            </span>
            <span className="text-[10px] font-mono text-ok flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <Check size={12} /> Anycubic Temp Activo
            </span>
          </div>
          <p className="text-xs text-muted">
            Filoteca vigila recursivamente <code className="text-accent-text font-mono text-[11px]">%LOCALAPPDATA%\Temp\anycubicslicer_model\</code> en segundo plano. Si usas OrcaSlicer o una carpeta personalizada, puedes configurarla abajo:
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              readOnly
              value={settings.watchedGcodeFolder || ''}
              placeholder="Ninguna carpeta seleccionada"
              className="field flex-1 font-mono text-xs text-muted bg-surface-1 select-all"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const res = await api.file.selectFolder();
                  if (res && res.ok && res.data) {
                    await setSetting('watchedGcodeFolder', res.data);
                    toast({
                      kind: 'success',
                      title: 'Carpeta vigilada configurada',
                      body: `Se vigilará: ${res.data}`,
                    });
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-surface-3 hover:bg-surface-2 border border-line text-xs font-semibold text-text flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
              >
                <FolderOpen size={14} className="text-muted" />
                <span>Examinar...</span>
              </button>
              {settings.watchedGcodeFolder && (
                <button
                  type="button"
                  onClick={async () => {
                    await setSetting('watchedGcodeFolder', '');
                    toast({
                      kind: 'info',
                      title: 'Carpeta vigilada desactivada',
                      body: 'Ya no se vigilarán archivos exportados.',
                    });
                  }}
                  className="px-3 py-2 rounded-xl bg-surface-3 hover:bg-crit-soft hover:text-crit-text border border-line text-xs text-muted transition-colors cursor-pointer"
                  title="Desactivar vigilancia"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Option 2: Post-processing script (The cleanest) */}
        <div className="p-4 rounded-xl bg-surface-2/60 border border-line space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Terminal size={14} className="text-accent-text" />
              <span>2. Post-processing script en el Slicer (Recomendado)</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent/20 text-accent-text font-bold">
              Directo
            </span>
          </div>

          <p className="text-xs text-muted leading-relaxed">
            Llama a Filoteca al terminar de exportar en <strong>Anycubic Slicer Next</strong>, <strong>OrcaSlicer</strong>, <strong>Bambu Studio</strong> o <strong>PrusaSlicer</strong>.
          </p>

          <ol className="text-xs text-muted space-y-1.5 list-decimal list-inside pl-1">
            <li>Abre Anycubic Slicer Next y entra en <strong>Ajustes de impresión</strong> (Print Settings).</li>
            <li>En la pestaña <strong>Opciones de salida</strong> (Output options), busca el campo <strong>Post-processing scripts</strong>.</li>
            <li>Pega exactamente la siguiente línea:</li>
          </ol>

          <div className="relative group">
            <pre className="p-3 rounded-xl bg-surface-1 border border-line font-mono text-[11px] text-accent-text overflow-x-auto whitespace-pre-wrap select-all">
              filoteca.exe --importar-gcode "[output_filepath]"
            </pre>
            <button
              type="button"
              onClick={() => {
                const cmd = `filoteca.exe --importar-gcode "[output_filepath]"`;
                navigator.clipboard.writeText(cmd);
                toast({
                  kind: 'success',
                  title: 'Comando copiado',
                  body: 'Pégalo en Ajustes de impresión → Opciones de salida → Post-processing scripts.',
                });
              }}
              className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-accent hover:text-accent-ink border border-line text-[11px] font-medium flex items-center gap-1 text-muted transition-all cursor-pointer shadow-xs"
            >
              <Copy size={12} />
              <span>Copiar</span>
            </button>
          </div>
          <span className="text-[11px] text-faint block">
            Nota: Si usas la versión instalada en Windows, también puedes usar la ruta completa: <code className="font-mono text-muted">%LOCALAPPDATA%\Programs\filoteca\Filoteca.exe --importar-gcode "[output_filepath]"</code>
          </span>
        </div>

        {/* Option 3: Drag & Drop */}
        <div className="p-3.5 rounded-xl bg-surface-2/40 border border-line flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">🎯</span>
            <span className="text-muted">
              <strong>Arrastrar y soltar:</strong> En cualquier momento puedes arrastrar un archivo <code className="font-mono text-text">.gcode</code> o <code className="font-mono text-text">.3mf</code> directamente sobre la ventana de Filoteca.
            </span>
          </div>
        </div>

        {/* Auto-log toggle */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <span className="text-xs font-bold text-text block">Descuento automático silencioso</span>
            <span className="text-[11px] text-faint block">
              Si está desactivado, siempre se muestra el diálogo para que confirmes la bobina o marques como pendiente.
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.autoLogGcode}
              onChange={(e) => setSetting('autoLogGcode', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-3 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </div>
      </div>

      {/* Currency */}
      <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-text font-bold text-sm">
          <DollarSign size={16} className="text-ok" />
          <span>Moneda e importes</span>
        </div>

        <p className="text-xs text-muted">
          Por defecto se usa formato de pesos colombianos (COP), sin decimales para precios completos ($ 89.900) y un decimal para costo por gramo ($ 89,9/g).
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {['COP', 'USD', 'EUR', 'MXN', 'ARS', '$'].map((curr) => (
            <button
              key={curr}
              type="button"
              onClick={() => setSetting('currency', curr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all ${
                settings.currency === curr
                  ? 'bg-accent text-accent-ink border-accent-strong shadow-xs'
                  : 'bg-surface-2 text-muted border-line hover:text-text'
              }`}
            >
              {curr === 'COP' ? 'COP (Colombia)' : curr}
            </button>
          ))}
          <input
            type="text"
            maxLength={6}
            value={settings.currency}
            onChange={(e) => setSetting('currency', e.target.value.toUpperCase())}
            className="field font-mono text-xs max-w-[90px] text-center"
            placeholder="Otro"
          />
        </div>
      </div>

      {/* Database Backup & Restore */}
      <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-text font-bold text-sm">
          <Database size={16} className="text-accent-text" />
          <span>Base de datos local (SQLite 100% Offline)</span>
        </div>

        <p className="text-xs text-muted leading-relaxed">
          Tus datos se guardan en un archivo SQLite local en tu equipo, sin servidores externos ni cuentas.
        </p>

        {dbPath && (
          <div className="p-3 rounded-xl bg-surface-2/60 border border-line flex items-center justify-between text-xs">
            <div className="truncate mr-2">
              <span className="text-faint block text-[10px] uppercase font-mono">Archivo de base de datos</span>
              <span className="font-mono text-text select-all">{dbPath}</span>
            </div>
            {isDesktop && (
              <button
                type="button"
                onClick={() => api.win.openDataFolder()}
                className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-3 transition-colors shrink-0"
                title="Abrir carpeta de datos"
              >
                <FolderOpen size={16} />
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleBackup}
            className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-text border border-line font-medium text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <Download size={14} className="text-muted" />
            <span>Crear copia de seguridad (.db)</span>
          </button>

          <button
            type="button"
            onClick={handleRestore}
            className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-text border border-line font-medium text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <Upload size={14} className="text-muted" />
            <span>Restaurar copia de seguridad (.db)</span>
          </button>
        </div>
      </div>

      {/* Import & Export JSON / CSV */}
      <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-text font-bold text-sm">
          <Download size={16} className="text-accent-text" />
          <span>Importar y Exportar datos</span>
        </div>

        <p className="text-xs text-muted">
          Comparte o sincroniza tu inventario en formatos abiertos JSON o CSV para hojas de cálculo.
        </p>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleExportJson}
            className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-text border border-line font-medium text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <Download size={14} className="text-muted" />
            <span>Exportar JSON completo</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-text border border-line font-medium text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <Download size={14} className="text-muted" />
            <span>Exportar rollos a CSV</span>
          </button>

          <button
            type="button"
            onClick={handleImportFile}
            className="px-4 py-2 rounded-xl bg-accent text-accent-ink hover:bg-accent-strong font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <Upload size={14} />
            <span>Importar archivo (JSON / CSV)</span>
          </button>
        </div>
      </div>

      {/* Seed Data Management */}
      <div className="p-5 rounded-2xl bg-surface-1 border border-line shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-text font-bold text-sm">
          <RefreshCw size={16} className="text-muted" />
          <span>Datos de ejemplo de taller</span>
        </div>

        <p className="text-xs text-muted">
          Los 15 rollos de demostración incluyen bobinas con varios niveles de llenado, colores y acabados.
        </p>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => loadSeed()}
            className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-text border border-line font-medium text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw size={14} className="text-muted" />
            <span>Recargar rollos de ejemplo</span>
          </button>

          <button
            type="button"
            onClick={() => clearSeed()}
            className="px-4 py-2 rounded-xl bg-crit-soft text-crit-text hover:bg-crit/20 border border-crit/20 font-medium text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <Trash2 size={14} />
            <span>Borrar rollos de ejemplo</span>
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <div className="pt-2 text-center text-xs text-faint font-mono">
        Filoteca v1.0.0 · Software de taller para impresión 3D · 100% Offline
      </div>
    </div>
  );
}
