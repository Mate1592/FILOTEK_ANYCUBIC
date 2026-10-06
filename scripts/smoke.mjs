import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

async function runSmokeTest() {
  console.log('--- Iniciando Smoke Test de Filoteca ---');
  const appPath = path.resolve('.');
  const testUserData = path.resolve('.smoke-userdata');
  if (fs.existsSync(testUserData)) {
    fs.rmSync(testUserData, { recursive: true, force: true });
  }

  console.log('Lanzando aplicación Electron...');
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      FILOTECA_USERDATA: testUserData,
    },
  });

  try {
    const page = await app.firstWindow();
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.error('PAGE ERROR:', err));
    console.log('Ventana principal obtenida. Esperando carga...');
    await page.waitForLoadState('domcontentloaded');

    // Comprobar título de ventana
    const title = await page.title();
    console.log(`Título de la ventana: "${title}"`);
    if (!title.includes('Filoteca')) {
      throw new Error(`Título inesperado: ${title}`);
    }

    // Esperar a que la estantería cargue las tarjetas
    console.log('Esperando carga de las bobinas de taller...');
    await page.waitForSelector('[role="button"][aria-label*="Bobina"]', { timeout: 10000 });
    const cards = await page.$$('[role="button"][aria-label*="Bobina"]');
    console.log(`Cantidad de bobinas cargadas: ${cards.length}`);
    if (cards.length < 10) {
      throw new Error(`Se esperaban al menos 10 bobinas, pero hay ${cards.length}`);
    }

    // Verificar presencia de bobinas SVG
    const spools = await page.$$('svg[aria-label]');
    console.log(`Elementos SVG de bobinas encontrados: ${spools.length}`);

    // Probar interacción: Menú desplegable (3 puntos) por encima del 3D
    console.log('Probando apertura del menú desplegable (3 puntos)...');
    await cards[0].hover();
    const menuBtn = await cards[0].$('button[aria-label="Opciones rápidas"]');
    if (menuBtn) {
      await menuBtn.click();
      await page.waitForSelector('text=Duplicar rollo', { timeout: 3000 });
      await page.waitForTimeout(400);
      fs.mkdirSync('screenshots', { recursive: true });
      await page.screenshot({ path: 'screenshots/dropdown-menu-fixed.png' });
      console.log('Menú desplegable verificado sobre el canvas 3D y guardado en screenshots/dropdown-menu-fixed.png');
      await page.click('body', { position: { x: 20, y: 20 } });
      await page.waitForTimeout(300);
    }

    // Probar modal de añadir rollo con chips de Anycubic y Sunlu
    console.log('Probando apertura de modal con fabricantes Anycubic y Sunlu...');
    const addRollBtn = await page.$('button:has-text("Añadir rollo")');
    if (addRollBtn) {
      await addRollBtn.click();
      await page.waitForSelector('button:has-text("Anycubic")', { timeout: 4000 });
      await page.waitForSelector('button:has-text("Sunlu")', { timeout: 4000 });
      await page.screenshot({ path: 'screenshots/modal-anycubic-sunlu.png' });
      console.log('Chips de Anycubic y Sunlu verificados.');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Probar interacción: Clic en la primera bobina para abrir el detalle
    console.log('Probando apertura de modal de detalle...');
    await cards[0].click();
    await page.waitForSelector('text=Historial de impresiones', { timeout: 5000 });
    console.log('Modal de detalle abierto correctamente con historial.');

    // Cerrar modal con tecla Escape
    console.log('Probando cierre de modal con tecla Escape...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Navegar a la pestaña de Estadísticas
    console.log('Navegando a la vista de Estadísticas...');
    await page.click('text=Estadísticas');
    await page.waitForSelector('text=Distribución por Material', { timeout: 5000 });
    await page.waitForSelector('text=Treemap de inventario', { timeout: 5000 });
    console.log('Gráficos de estadísticas (Donuts y Treemap) renderizados correctamente.');

    // Navegar a la pestaña de Reabastecimiento
    console.log('Navegando a la vista de Reabastecimiento...');
    await page.click('text=Reabastecimiento');
    await page.waitForSelector('text=Reabastecimiento predictivo', { timeout: 6000 });
    await page.waitForTimeout(600);
    fs.mkdirSync('screenshots', { recursive: true });
    await page.screenshot({ path: 'screenshots/reabastecimiento.png' });
    console.log('Vista de reabastecimiento verificada y captura guardada.');

    // Navegar a la pestaña de Compras
    console.log('Navegando a la vista de Compras...');
    await page.click('text=Compras');
    await page.waitForSelector('text=Lista de Compras de Filamento', { timeout: 5000 });
    console.log('Vista de compras y sugerencias automáticas verificada.');

    // Navegar a la pestaña de Bandeja
    console.log('Navegando a la vista de Bandeja de laminados...');
    await page.click('text=Bandeja');
    await page.waitForSelector('text=Bandeja de laminados', { timeout: 5000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'screenshots/bandeja-laminados.png' });
    console.log('Vista de Bandeja de laminados verificada y captura guardada.');

    // Navegar a la pestaña de Ajustes
    console.log('Navegando a la vista de Ajustes...');
    await page.click('text=Ajustes');
    await page.waitForSelector('text=Ajustes de Taller', { timeout: 5000 });
    await page.waitForSelector('text=Modo Acompañante', { timeout: 5000 });
    await page.waitForSelector('text=Conectar con Anycubic Slicer Next', { timeout: 5000 });
    await page.waitForSelector('text=Tiempos de Reabastecimiento (Global)', { timeout: 5000 });
    await page.screenshot({ path: 'screenshots/settings-slicer.png' });
    console.log('Vista de configuración, reabastecimiento y Anycubic Slicer Next verificada.');

    // Activar Modo Oscuro para verificar visibilidad nocturna
    const darkModeBtn = await page.$('button:has-text("Modo Oscuro")');
    if (darkModeBtn) {
      await darkModeBtn.click();
      await page.waitForTimeout(300);
      console.log('Modo Oscuro activado para validación de contraste.');
    }

    // Volver a la estantería en Modo Oscuro (versión nocturna)
    await page.click('text=Estantería');
    await page.waitForSelector('[role="button"][aria-label*="Bobina"]', { timeout: 5000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'screenshots/shelf-3d-nocturno.png' });
    console.log('Estantería 3D en versión nocturna guardada en screenshots/shelf-3d-nocturno.png.');
    await page.screenshot({ path: 'screenshots/shelf-3d-cop.png' });

    // Probar descuento rápido (-10g)
    console.log('Probando botón de descuento rápido (-10g)...');
    const quickMinusBtn = await page.$('button[title="Descontar 10g"]');
    if (quickMinusBtn) {
      await quickMinusBtn.click();
      await page.waitForSelector('text=−10 g de', { timeout: 4000 });
      console.log('Descuento de 10g registrado con notificación toast.');
    }

    console.log('--- ¡Todos los tests de verificación pasaron con éxito! ---');
  } finally {
    console.log('Cerrando aplicación...');
    await app.close();
    if (fs.existsSync(testUserData)) {
      fs.rmSync(testUserData, { recursive: true, force: true });
    }
  }
}

runSmokeTest().catch((err) => {
  console.error('Smoke test falló:', err);
  process.exit(1);
});
