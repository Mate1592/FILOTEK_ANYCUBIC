import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const userData = path.resolve('.perf-userdata');
if (fs.existsSync(userData)) fs.rmSync(userData, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function gpuPercentForPids(pids) {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -SampleInterval 2 -MaxSamples 2).CounterSamples | Select-Object InstanceName, CookedValue | ConvertTo-Json"`,
      { encoding: 'utf8' },
    );
    const rows = JSON.parse(out);
    let total = 0;
    for (const r of rows) {
      const m = /pid_(\d+)_/.exec(r.InstanceName);
      if (m && pids.includes(Number(m[1]))) total += r.CookedValue;
    }
    return total / 2; // 2 muestras
  } catch (e) {
    return NaN;
  }
}

const app = await electron.launch({ args: ['.'], env: { ...process.env, FILOTECA_USERDATA: userData } });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('[role="button"][aria-label*="Bobina"]', { timeout: 15000 });
  await page.setViewportSize?.({ width: 1600, height: 1000 }).catch(() => {});

  // Instrumentar draw calls WebGL y frames de rAF
  await page.evaluate(() => {
    window.__draws = 0;
    window.__rafs = 0;
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const fn of ['drawElements', 'drawArrays']) {
        const orig = P[fn];
        P[fn] = function (...a) { window.__draws++; return orig.apply(this, a); };
      }
    }
    const origRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => origRaf((t) => { window.__rafs++; cb(t); });
  });

  // Dejar asentar animaciones de entrada
  await sleep(2500);

  const measure = async (label, ms) => {
    await page.evaluate(() => { window.__draws = 0; window.__rafs = 0; });
    await sleep(ms);
    const r = await page.evaluate(() => ({ draws: window.__draws, rafs: window.__rafs }));
    console.log(`${label}: ${(r.draws / (ms / 1000)).toFixed(0)} draws/s, ${(r.rafs / (ms / 1000)).toFixed(1)} rAF/s`);
    return r;
  };

  const lowVisible = await page.evaluate(() =>
    document.querySelectorAll('[title^="Stock bajo"], [title^="Stock crítico"]').length,
  );
  console.log(`Insignias de bajo/crítico en DOM: ${lowVisible}`);

  await measure('Reposo (estantería)', 3000);

  // Electron: PIDs de todos los procesos de la app
  const pids = await app.evaluate(({ app }) => app.getAppMetrics().map((m) => m.pid));
  console.log(`GPU 3D en reposo (contador Windows, todos los procesos Filoteca): ${gpuPercentForPids(pids).toFixed(1)} %`);

  // Hover sobre una tarjeta
  const card = (await page.$$('[role="button"][aria-label*="Bobina"]'))[1];
  await card.hover();
  await sleep(300);
  await measure('Hover (giro de 1 bobina)', 2000);
  await page.mouse.move(5, 5);
  await sleep(800);
  await measure('Tras salir del hover', 2000);

  // Scroll
  await page.mouse.move(800, 600);
  await page.mouse.wheel(0, 600);
  await sleep(1200);
  await measure('Reposo tras scroll', 2000);

  await page.screenshot({ path: 'screenshots/perf-after-scroll.png' });
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
