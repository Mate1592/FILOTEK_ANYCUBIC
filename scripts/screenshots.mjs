/**
 * Screenshot Gallery Script — Filoteca v1.0.1
 * Takes high-quality screenshots of every section for README & social media.
 */
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const OUT = path.resolve('docs/screenshots/gallery');
const USERDATA = path.resolve('.screenshot-userdata');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function dismissModals(page) {
  // Force-close any overlay modals (onboarding, companion prompt, etc.)
  for (let i = 0; i < 5; i++) {
    const overlay = await page.$('div.fixed.inset-0.z-50');
    if (!overlay) break;
    // Try clicking close buttons inside the overlay
    const closeBtn = await overlay.$('button[aria-label="Cerrar"]');
    if (closeBtn) {
      await closeBtn.click();
      await sleep(300);
      continue;
    }
    // Try "Saltar" / "Omitir" / skip buttons
    const skipBtn = await overlay.$('button:has-text("Saltar")') 
      || await overlay.$('button:has-text("Omitir")')
      || await overlay.$('button:has-text("Cerrar")')
      || await overlay.$('button:has-text("Skip")');
    if (skipBtn) {
      await skipBtn.click();
      await sleep(300);
      continue;
    }
    // Escape key as fallback
    await page.keyboard.press('Escape');
    await sleep(300);
  }
  await sleep(200);
}

async function run() {
  // Clean up
  if (fs.existsSync(USERDATA)) fs.rmSync(USERDATA, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  console.log('🚀 Launching Filoteca...');
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, FILOTECA_USERDATA: USERDATA },
  });

  try {
    const page = await app.firstWindow();
    page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

    // Wait for full load
    await page.waitForLoadState('domcontentloaded');
    console.log('✅ App loaded');

    // Wait for shelf spools to render
    await page.waitForSelector('[role="button"][aria-label*="Bobina"]', { timeout: 15000 });
    await sleep(2000); // Let 3D/SVG animations settle

    // Aggressively dismiss all modals
    await dismissModals(page);

    // ═══════════════════════════════════════════════
    // 1. SHELF VIEW — Light Mode
    // ═══════════════════════════════════════════════
    console.log('📸 1/10 — Shelf (Light Mode)');
    await page.screenshot({ path: path.join(OUT, '01-shelf-light.png'), fullPage: false });

    // ═══════════════════════════════════════════════
    // Switch to Dark Mode via Settings
    // ═══════════════════════════════════════════════
    console.log('🌙 Switching to Dark Mode...');
    await dismissModals(page);
    const settingsNav = await page.$('span:text("Ajustes")');
    if (settingsNav) {
      await settingsNav.click({ force: true });
    } else {
      await page.click('text=Ajustes', { force: true });
    }
    await sleep(1000);
    await dismissModals(page);
    
    // Try to find and click dark mode
    try {
      await page.waitForSelector('text=Modo Oscuro', { timeout: 3000 });
      await page.click('text=Modo Oscuro', { force: true });
      await sleep(500);
      console.log('  ✅ Dark mode enabled');
    } catch {
      console.log('  ⚠️ Could not find dark mode button, continuing...');
    }

    // ═══════════════════════════════════════════════
    // 2. SETTINGS VIEW (Dark Mode)
    // ═══════════════════════════════════════════════
    console.log('📸 2/10 — Settings');
    await page.screenshot({ path: path.join(OUT, '02-settings.png'), fullPage: false });

    // ═══════════════════════════════════════════════
    // 3. SHELF VIEW — Dark Mode
    // ═══════════════════════════════════════════════
    console.log('📸 3/10 — Shelf (Dark Mode)');
    await page.click('text=Estantería', { force: true });
    await sleep(1000);
    await dismissModals(page);
    await page.waitForSelector('[role="button"][aria-label*="Bobina"]', { timeout: 5000 });
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, '03-shelf-dark.png'), fullPage: false });

    // ═══════════════════════════════════════════════
    // 4. SPOOL DETAIL MODAL (click first spool)
    // ═══════════════════════════════════════════════
    console.log('📸 4/10 — Spool Detail Modal');
    const cards = await page.$$('[role="button"][aria-label*="Bobina"]');
    if (cards.length > 0) {
      await cards[0].click();
      await sleep(2000); // Wait for modal + 3D to render
      await page.screenshot({ path: path.join(OUT, '04-spool-detail.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await sleep(500);
    }

    // ═══════════════════════════════════════════════
    // 5. SECOND SPOOL (different color/material)
    // ═══════════════════════════════════════════════
    console.log('📸 5/10 — Second Spool Detail');
    const cards2 = await page.$$('[role="button"][aria-label*="Bobina"]');
    if (cards2.length > 2) {
      await cards2[2].click();
      await sleep(2000);
      await page.screenshot({ path: path.join(OUT, '05-spool-detail-2.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await sleep(500);
    }

    // ═══════════════════════════════════════════════
    // 6. ADD ROLL MODAL
    // ═══════════════════════════════════════════════
    console.log('📸 6/10 — Add Roll Modal');
    const addBtn = await page.$('button:has-text("Nuevo rollo")');
    if (addBtn) {
      await addBtn.click({ force: true });
      await sleep(1000);
      await page.screenshot({ path: path.join(OUT, '06-add-roll.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await sleep(500);
    }

    // ═══════════════════════════════════════════════
    // 7. STATISTICS VIEW
    // ═══════════════════════════════════════════════
    console.log('📸 7/10 — Statistics');
    await dismissModals(page);
    await page.click('text=Estadísticas', { force: true });
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, '07-statistics.png'), fullPage: false });

    // ═══════════════════════════════════════════════
    // 8. REPLENISHMENT VIEW
    // ═══════════════════════════════════════════════
    console.log('📸 8/10 — Replenishment');
    await page.click('text=Reabastecimiento', { force: true });
    await sleep(1000);
    await page.screenshot({ path: path.join(OUT, '08-replenishment.png'), fullPage: false });

    // ═══════════════════════════════════════════════
    // 9. SHOPPING LIST VIEW
    // ═══════════════════════════════════════════════
    console.log('📸 9/10 — Shopping List');
    await page.click('text=Compras', { force: true });
    await sleep(800);
    await page.screenshot({ path: path.join(OUT, '09-shopping.png'), fullPage: false });

    // ═══════════════════════════════════════════════
    // 10. COMPANION / SLICER TRAY
    // ═══════════════════════════════════════════════
    console.log('📸 10/10 — Slicer Companion Tray');
    await page.click('text=Bandeja', { force: true });
    await sleep(800);
    await page.screenshot({ path: path.join(OUT, '10-companion-tray.png'), fullPage: false });

    console.log(`\n✅ Gallery complete! ${fs.readdirSync(OUT).length} screenshots saved to:\n   ${OUT}`);
  } finally {
    await app.close();
    if (fs.existsSync(USERDATA)) fs.rmSync(USERDATA, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('❌ Screenshot script failed:', err.message);
  process.exit(1);
});
