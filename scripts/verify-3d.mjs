import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const screenshotDir = path.resolve('screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function verify3D() {
  console.log('--- Verificando Bobina 3D en Filoteca ---');
  const testUserData = path.resolve('.verify-3d-userdata');
  if (fs.existsSync(testUserData)) {
    fs.rmSync(testUserData, { recursive: true, force: true });
  }

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      FILOTECA_USERDATA: testUserData,
    },
  });

  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForLoadState('domcontentloaded');

    console.log('Esperando carga de las bobinas...');
    await page.waitForSelector('[role="button"][aria-label*="Bobina"]', { timeout: 10000 });
    await page.waitForTimeout(1000); // Dar 1s para que WebGL dibuje las bobinas 3D

    // Captura 1: Estantería principal con bobinas 3D
    const shelfShot = path.join(screenshotDir, '01-shelf-3d.png');
    await page.screenshot({ path: shelfShot });
    console.log(`Captura 1 guardada: ${shelfShot}`);

    // Probar hover en la primera bobina para activar tilt 3D y giro
    const firstCard = (await page.$$('[role="button"][aria-label*="Bobina"]'))[0];
    await firstCard.hover();
    await page.waitForTimeout(600);

    const hoverShot = path.join(screenshotDir, '02-spool-hover-3d.png');
    await page.screenshot({ path: hoverShot });
    console.log(`Captura 2 guardada (Hover 3D): ${hoverShot}`);

    // Clic en la bobina para abrir el modal de detalle con la bobina interactiva grande
    await firstCard.click();
    await page.waitForSelector('canvas', { timeout: 5000 });
    await page.waitForTimeout(800);

    const modalShot = path.join(screenshotDir, '03-modal-interactive-3d.png');
    await page.screenshot({ path: modalShot });
    console.log(`Captura 3 guardada (Modal 3D interactivo): ${modalShot}`);

    // Probar arrastrar la bobina 3D en el modal
    const modalCanvas = await page.$('canvas.cursor-grab');
    if (modalCanvas) {
      const box = await modalCanvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(400);

        const dragShot = path.join(screenshotDir, '04-modal-dragged-3d.png');
        await page.screenshot({ path: dragShot });
        console.log(`Captura 4 guardada (Tras arrastre 3D): ${dragShot}`);
      }
    }

    console.log('--- Verificación 3D completada con éxito ---');
  } finally {
    await app.close();
    if (fs.existsSync(testUserData)) {
      fs.rmSync(testUserData, { recursive: true, force: true });
    }
    process.exit(0);
  }
}

verify3D().catch((e) => {
  console.error('Fallo en verificación 3D:', e);
  process.exit(1);
});
