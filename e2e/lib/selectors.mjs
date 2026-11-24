export function normalizeNbsp(s) {
  return String(s ?? '').replace(/\u00a0/g, ' ').trim();
}

export function fieldByLabel(
  root,
  labelRegex,
  controlSelector = 'input, select, textarea',
  ancestorDepth = 1,
) {
  return root
    .locator('label', { hasText: labelRegex })
    .locator(`xpath=ancestor::div[${ancestorDepth}]`)
    .locator(controlSelector)
    .first();
}

export const SEL = {
  TitleBar: {
    header: (page) => page.locator('header').first(),
    navTab: (page, key) => {
      const patterns = {
        shelf: /(Estantería|Shelf|Estante)/i,
        stats: /(Estadísticas|Statistics|Estatísticas)/i,
        replenish: /(Reabastecimiento|Restock|Reabastecimento)/i,
        shopping: /(Compras|Shopping)/i,
        inbox: /(Bandeja|Slicer Tray)/i,
        tools: /(Herramientas|Tools|Ferramentas)/i,
        settings: /(Ajustes|Settings|Configurações)/i,
      };
      const rx = patterns[key];
      if (!rx) throw new Error(`Unknown TitleBar navTab key: ${key}`);
      return page
        .locator(`[data-testid="tab-${key}"]`)
        .or(page.locator('header nav button').filter({ hasText: rx }));
    },
    inboxBadge: (page) => SEL.TitleBar.navTab(page, 'inbox').locator('span').nth(1),
    searchInput: (page) =>
      page
        .locator('header input[type="text"]')
        .or(page.getByPlaceholder(/(Buscar bobina|Search spool|Buscar carretel)/i)),
    newRollBtn: (page) => page.locator('header button[title*="Ctrl+N"]'),
  },

  OnboardingModal: {
    modal: (page) =>
      page.locator('div.fixed.inset-0.z-50').filter({ hasText: /Filoteca · \d \/ 5/ }),
    stepCounter: (page) =>
      SEL.OnboardingModal.modal(page).locator('span', { hasText: /Filoteca · \d \/ 5/ }),
    skipBtn: (page) =>
      SEL.OnboardingModal.modal(page).getByRole('button', { name: /^(Omitir|Skip|Pular)$/i }),
    langBtn: (page, lang) => {
      const rx = {
        es: /Español/i,
        en: /English/i,
        pt: /Portugu[eê]s/i,
      }[lang];
      if (!rx) throw new Error(`Unknown language: ${lang}`);
      return SEL.OnboardingModal.modal(page).getByRole('button', { name: rx });
    },
    currencyBtn: (page, code) =>
      SEL.OnboardingModal.modal(page).getByRole('button', {
        name: new RegExp(`\\b${code}\\b`, 'i'),
      }),
    themeBtn: (page, theme) => {
      const rx = {
        dark: /(Modo Oscuro|Dark Mode|Modo Escuro)/i,
        light: /(Modo Claro|Light Mode|Modo Claro)/i,
        system: /(Sistema|System)/i,
      }[theme];
      if (!rx) throw new Error(`Unknown theme: ${theme}`);
      return SEL.OnboardingModal.modal(page).getByRole('button', { name: rx });
    },
    donateWompiBtn: (page) =>
      SEL.OnboardingModal.modal(page).getByRole('button', { name: /Wompi/i }),
    donatePayPalBtn: (page) =>
      SEL.OnboardingModal.modal(page).getByRole('button', { name: /PayPal/i }),
    developerCredit: (page) =>
      SEL.OnboardingModal.modal(page).getByText(/TermuxX solutions/i),
    backBtn: (page) =>
      SEL.OnboardingModal.modal(page).getByRole('button', { name: /(Atrás|Back|Voltar)/i }),
    nextBtn: (page) =>
      SEL.OnboardingModal.modal(page).getByRole('button', { name: /(Siguiente|Next|Avan[cç]ar)/i }),
    finishBtn: (page) =>
      SEL.OnboardingModal.modal(page).getByRole('button', {
        name: /(¡Comenzar en el taller!|Get Started!|Come[cç]ar na oficina!)/i,
      }),
  },

  ShelfView: {
    lowStockToggle: (page) =>
      page.getByRole('button', { name: /(Bajo stock|Low stock|Estoque baixo)/i }),
    filtersToggle: (page) =>
      page.getByRole('button', { name: /(Filtros|Filters)/i }),
    resetFiltersBtn: (page) =>
      page.getByRole('button', { name: /(Restablecer|Reset)/i }),
    resultsCount: (page) =>
      page.locator('span', { hasText: /\d+ (de|of) \d+ (rollos|spools|carret[eé]is)/i }),
    sortBtn: (page, key) => {
      const rx = {
        remaining: /^(Restante|Remaining)/i,
        name: /^(Nombre|Name|Nome)/i,
        price: /^(Precio|Price|Pre[cç]o)/i,
        date: /^(Fecha|Date|Data)/i,
      }[key];
      if (!rx) throw new Error(`Unknown sortBtn key: ${key}`);
      return page.getByRole('button', { name: rx });
    },
    materialPill: (page, mat) =>
      page
        .locator('span', { hasText: /^Material:$/i })
        .locator('xpath=..')
        .getByRole('button', { name: mat, exact: true }),
    brandPill: (page, brand) =>
      page
        .locator('span', { hasText: /^(Marca|Brand):$/i })
        .locator('xpath=..')
        .getByRole('button', { name: brand, exact: true }),
    emptyAddBtn: (page) =>
      page.getByRole('button', { name: /\+ Añadir mi primer rollo|\+ Add/i }),
    emptyLoadSeedBtn: (page) =>
      page.getByRole('button', { name: /Cargar 15 rollos de ejemplo|Load/i }),
  },

  SpoolCard: {
    allCards: (page) => page.locator('[role="button"][aria-label^="Bobina "]'),
    cardByName: (page, colorOrText) =>
      page.locator('[role="button"][aria-label^="Bobina "]').filter({ hasText: colorOrText }),
    cardPrice: (card) => card.locator('div.font-mono.text-\\[11px\\].font-medium.text-text'),
    cardQuickMenuBtn: (card) =>
      card.getByRole('button', { name: /(Opciones rápidas|Quick options)/i }),
    portalMenu: (page) =>
      page
        .locator('body > div:not(#root).rounded-xl')
        .filter({ has: page.getByRole('button', { name: /^(Duplicar rollo|Duplicate)/i }) }),
    portalMenuItem: (page, action) => {
      const rx = {
        edit: /^(Editar|Edit)$/i,
        duplicate: /^(Duplicar rollo|Duplicate)/i,
        markEmpty: /^(Marcar agotado|Mark empty)/i,
        delete: /^(Eliminar|Delete)$/i,
      }[action];
      if (!rx) throw new Error(`Unknown portalMenuItem action: ${action}`);
      return SEL.SpoolCard.portalMenu(page).getByRole('button', { name: rx });
    },
    cardQuickUseBtn: (card, amount) =>
      card.getByRole('button', {
        name: amount === 'Otro' ? /(Otro|Other|Outro)/i : amount,
        exact: amount !== 'Otro',
      }),
    cardBackupBadge: (card) =>
      card.locator('span[title*="respaldado"]').or(card.getByText(/Respaldado/i)),
    cardCriticalBadge: (card) => card.locator('span[title*="Stock crítico"]'),
    cardLowBadge: (card) => card.locator('span[title*="Stock bajo"]'),
  },

  RollEditorModal: {
    form: (page) =>
      page.locator('form').filter({
        has: page.getByRole('button', {
          name: /(Crear rollo|Guardar cambios|Guardar recompra|Create|Save)/i,
        }),
      }),
    brandInput: (f) => f.getByPlaceholder(/Bambu Lab, Prusament/i),
    brandPill: (f, b) => f.getByRole('button', { name: b, exact: true }),
    materialSelect: (f) => fieldByLabel(f, /^Material$/i, 'select', 1),
    colorNameInput: (f) => f.getByPlaceholder(/Galaxy Black, Blanco seda/i),
    finishSelect: (f) => fieldByLabel(f, /Acabado del material|Finish/i, 'select', 1),
    colorHexInput: (f) => f.getByPlaceholder('#RRGGBB'),
    diameterBtn: (f, mm) => f.getByRole('button', { name: mm, exact: true }),
    initialWeightInput: (f) =>
      fieldByLabel(f, /Peso inicial neto|Initial weight/i, 'input[type="number"]', 1),
    remainingWeightInput: (f) =>
      fieldByLabel(f, /Peso restante|Remaining weight/i, 'input[type="number"]', 2),
    fullWeightBtn: (f) => f.getByRole('button', { name: /^(Lleno|Full|Cheio)$/i }),
    priceInput: (f) => f.getByPlaceholder(/89900 o 89\.900/i),
    purchaseDateInput: (f) => f.locator('input[type="date"]'),
    locationInput: (f) => f.getByPlaceholder(/Estante A · 1, Caja seca/i),
    storeInput: (f) => f.getByPlaceholder(/Amazon, MercadoLibre/i),
    productUrlInput: (f) => f.getByPlaceholder('https://tienda.com/producto'),
    shippingInput: (f) => fieldByLabel(f, /^Envío|Shipping/i, 'input', 1),
    taxInput: (f) => fieldByLabel(f, /^Impuestos|Tax/i, 'input', 1),
    deliveryDaysInput: (f) =>
      fieldByLabel(f, /Tiempo entrega|Delivery days/i, 'input[type="number"]', 1),
    statusBtn: (f, label) => f.getByRole('button', { name: new RegExp(`^(${label})$`, 'i') }),
    notesTextarea: (f) => f.locator('textarea'),
    cancelBtn: (f) => f.getByRole('button', { name: /^(Cancelar|Cancel)$/i }),
    submitBtn: (f) => f.locator('button[type="submit"]'),
  },

  RollDetailModal: {
    modal: (page) =>
      page
        .locator('div.fixed.inset-0.z-50')
        .filter({ hasText: /(Historial de impresiones|Print history)/i }),
    editBtn: (d) => d.locator('button[title="Editar datos del rollo"]'),
    duplicateBtn: (d) => d.locator('button[title="Duplicar para recompra"]'),
    deleteBtn: (d) => d.locator('button[title="Eliminar rollo"]'),
    closeBtn: (d) => d.locator('button[title="Cerrar (Esc)"]'),
    logPrintBtn: (d) =>
      d.getByRole('button', { name: /Registrar impresión \(descontar gramos\)/i }),
    statusBtn: (d, statusLabel) =>
      d.getByRole('button', { name: new RegExp(`^${statusLabel}$`, 'i') }),
    changeLocationBtn: (d) => d.getByRole('button', { name: /^(Cambiar|Change|Alterar)$/i }),
    locationInput: (d) => d.getByPlaceholder(/Estante A, Caja seca 2/i),
    saveLocationBtn: (d) => d.getByRole('button', { name: /^(Guardar|Save|Salvar)$/i }),
    undoUsageBtns: (d) => d.locator('button[title="Deshacer este consumo"]'),
  },

  QuickUseModal: {
    modal: (page) =>
      page
        .locator('div.fixed.inset-0.z-50')
        .filter({ hasText: /Registrar consumo de filamento/i }),
    gramsInput: (q) => q.locator('input[type="number"]'),
    presetBtn: (q, grams) => q.getByRole('button', { name: `${grams}g`, exact: true }),
    allBtn: (q) => q.getByRole('button', { name: /^Todo \(/i }),
    noteInput: (q) => q.getByPlaceholder(/Maceta hexagonal/i),
    cancelBtn: (q) => q.getByRole('button', { name: /^(Cancelar|Cancel)$/i }),
    submitBtn: (q) => q.locator('button[type="submit"]'),
  },

  StatsView: {
    kpiCard: (page, titleRegex) =>
      page
        .locator('div.rounded-2xl')
        .filter({ has: page.locator('span', { hasText: titleRegex }) })
        .first(),
    kpiTotalRolls: (page) =>
      SEL.StatsView.kpiCard(page, /Bobinas en taller|Spools in workshop/i),
    kpiAvailableGrams: (page) =>
      SEL.StatsView.kpiCard(page, /Filamento disponible|Available filament/i),
    kpiInventoryValue: (page) =>
      SEL.StatsView.kpiCard(page, /Valor del inventario|Inventory value/i),
    kpiAvgCostPerGram: (page) =>
      SEL.StatsView.kpiCard(page, /Costo medio \/ gramo|Avg cost/i),
    kpiValueText: (card) => card.locator('div.text-xl.font-mono.font-bold'),
  },

  ReplenishmentView: {
    tab: (page, nameRegex) => page.getByRole('button', { name: nameRegex }),
    timesBtn: (card) =>
      card.locator('button[title="Configurar entrega y margen de este producto"]'),
    markOrderedBtn: (card) => card.getByRole('button', { name: /Marcar como pedido/i }),
    addToListBtn: (card) => card.getByRole('button', { name: /A lista/i }),
    arrivedBtn: (card) => card.getByRole('button', { name: /¡Sí, ya llegó!/i }),
    orderDialog: (page) =>
      page.locator('div.fixed.inset-0.z-50').filter({ hasText: /Marcar como pedido/i }),
    orderDaysInput: (d) => d.locator('input[type="number"]'),
    orderSaveBtn: (d) => d.getByRole('button', { name: /Guardar pedido/i }),
    manualRateInput: (card) => card.getByPlaceholder('150'),
    manualRateSaveBtn: (card) => card.getByRole('button', { name: /^Guardar$/i }),
  },

  ShoppingView: {
    pendingCount: (page) => page.locator('div', { hasText: /^\d+ pendientes?$/i }),
    suggestionButtons: (page) =>
      page
        .locator('div.rounded-2xl')
        .filter({ has: page.locator('h3', { hasText: /Sugerencias automáticas por bajo stock/i }) })
        .last()
        .getByRole('button'),
    customInput: (page) => page.getByPlaceholder(/¿Qué filamento necesitas comprar\?/i),
    customMaterialSelect: (page) =>
      page
        .locator('form')
        .filter({ has: page.getByPlaceholder(/¿Qué filamento necesitas comprar\?/i) })
        .locator('select'),
    customAddBtn: (page) =>
      page
        .locator('form')
        .filter({ has: page.getByPlaceholder(/¿Qué filamento necesitas comprar\?/i) })
        .getByRole('button', { name: /^(Añadir|Add|Adicionar)$/i }),
    rowByText: (page, label) =>
      page.locator('div.rounded-2xl.border.justify-between').filter({ hasText: label }).first(),
    rowToggleDoneBtn: (row) => row.locator('button').first(),
    rowReceiveBtn: (row) =>
      row.locator('button[title="Añade una nueva bobina sellada a la estantería"]'),
    rowDeleteBtn: (row) => row.locator('button').last(),
  },

  InboxView: {
    drawer: (page) =>
      page
        .locator('div.rounded-2xl')
        .filter({ hasText: /Bandeja de laminados/i })
        .filter({ has: page.getByRole('button', { name: /Revisar en Bandeja/i }) })
        .last(),
    drawerReviewBtn: (page) => page.getByRole('button', { name: /Revisar en Bandeja/i }),
    inboxHeading: (page) => page.locator('h1', { hasText: /Bandeja de laminados/i }),
    statusTab: (page, labelRegex) => page.getByRole('button', { name: labelRegex }),
    selectAllBtn: (page) =>
      page.getByRole('button', {
        name: /(Seleccionar todos los pendientes|Deseleccionar todos)/i,
      }),
    batchPrintBtn: (page) =>
      page.getByRole('button', { name: /Registrar seleccionados como impresos/i }),
    batchDiscardBtn: (page) =>
      page.getByRole('button', { name: /Descartar seleccionados/i }),
    jobCard: (page, nameOrText) =>
      page
        .locator('div.rounded-2xl')
        .filter({ hasText: nameOrText })
        .filter({ has: page.getByRole('button', { name: /(Lo imprimí|Re-imprimir)/i }) })
        .first(),
    slotGramsInput: (card, idx = 0) =>
      card.locator('input[title="Gramos requeridos para este slot"]').nth(idx),
    slotRollSelect: (card, idx = 0) => card.locator('select').nth(idx),
    printBtn: (card) => card.getByRole('button', { name: /^Lo imprimí$/i }),
    partialFailBtn: (card) => card.getByRole('button', { name: /Falló \/ parcial/i }),
    discardBtn: (card) => card.getByRole('button', { name: /No lo imprimí/i }),
    reprintBtn: (card) => card.getByRole('button', { name: /Re-imprimir/i }),
    failedModal: (page) =>
      page
        .locator('div.fixed.inset-0.z-50')
        .filter({ hasText: /Impresión fallida o parcial/i }),
    failedPercentRange: (m) => m.locator('input[type="range"]'),
    failedConfirmBtn: (m) =>
      m.getByRole('button', { name: /Confirmar descuento parcial/i }),
    companionModal: (page) =>
      page
        .locator('div.fixed.inset-0.z-50')
        .filter({ hasText: /¿Qué imprimiste en esta sesión\?/i }),
  },

  SettingsView: {
    themeBtn: (page, theme) => {
      const rx = {
        system: /^(Sistema|System)$/i,
        dark: /^(Modo Oscuro|Dark Mode|Modo Escuro)$/i,
        light: /^(Modo Claro|Light Mode|Modo Claro)$/i,
      }[theme];
      if (!rx) throw new Error(`Unknown theme: ${theme}`);
      return page
        .locator('div.rounded-2xl')
        .filter({ hasText: /Tema de interfaz|Tema da interface|Interface Theme/i })
        .getByRole('button', { name: rx });
    },
    langBtn: (page, lang) => {
      const rx = {
        es: /Español/i,
        en: /English/i,
        pt: /Portugu[eê]s/i,
      }[lang];
      if (!rx) throw new Error(`Unknown language: ${lang}`);
      return page
        .locator('div.rounded-2xl')
        .filter({ hasText: /Idioma de la interfaz|Language/i })
        .getByRole('button', { name: rx });
    },
    repeatTourBtn: (page) =>
      page.getByRole('button', { name: /(Repetir tour|Reiniciar tour|Restart tour)/i }),
    currencySection: (page) =>
      page.locator('div.rounded-2xl').filter({ hasText: /Moneda e importes|Currency/i }),
    currencyPill: (page, code) =>
      page.locator(`[data-testid="settings-currency-${code}"]`).or(
        SEL.SettingsView.currencySection(page).getByRole('button', {
          name:
            code === 'COP'
              ? /^COP/i
              : new RegExp(`^${code === '$' ? '\\$' : code}$`, 'i'),
        }),
      ),
    currencyCustomInput: (page) =>
      SEL.SettingsView.currencySection(page).locator('input[type="text"]'),
    watchedFolderInput: (page) =>
      page.getByPlaceholder(/Ninguna carpeta seleccionada/i),
    watchedFolderBrowseBtn: (page) =>
      page.getByRole('button', { name: /Examinar\.\.\./i }),
    watchedFolderClearBtn: (page) =>
      page.locator('button[title="Desactivar vigilancia"]'),
    dbSection: (page) =>
      page.locator('div.rounded-2xl').filter({ hasText: /Base de datos local/i }),
    dbPathValue: (page) =>
      SEL.SettingsView.dbSection(page).locator('span.font-mono.text-text.select-all'),
    backupDbBtn: (page) =>
      page.getByRole('button', { name: /Crear copia de seguridad \(\.db\)/i }),
    restoreDbBtn: (page) =>
      page.getByRole('button', { name: /Restaurar copia de seguridad \(\.db\)/i }),
    exportJsonBtn: (page) =>
      page.getByRole('button', { name: /Exportar JSON completo/i }),
    exportCsvBtn: (page) =>
      page.getByRole('button', { name: /Exportar rollos a CSV/i }),
    importFileBtn: (page) =>
      page.getByRole('button', { name: /Importar archivo \(JSON \/ CSV\)/i }),
    reloadSeedBtn: (page) =>
      page.getByRole('button', { name: /Recargar rollos de ejemplo/i }),
    clearSeedBtn: (page) =>
      page.getByRole('button', { name: /Borrar rollos de ejemplo/i }),
    donateWompiBtn: (page) => page.getByRole('button', { name: /Wompi/i }),
    donatePayPalBtn: (page) => page.getByRole('button', { name: /PayPal/i }),
    versionFooter: (page) =>
      page
        .locator('[data-testid="settings-version-footer"]')
        .or(page.locator('div.font-mono', { hasText: /Filoteca v\d+\.\d+\.\d+.*100% Offline/i })),
  },

  Toasts: {
    toastContainer: (page) => page.locator('div.fixed.bottom-4.right-4.z-50'),
    toastByTitle: (page, titleRegex) =>
      SEL.Toasts.toastContainer(page)
        .locator('div.pointer-events-auto')
        .filter({ has: page.locator('h4', { hasText: titleRegex }) }),
    toastUndoBtn: (page) =>
      SEL.Toasts.toastContainer(page).getByRole('button', {
        name: /^(Deshacer|Undo|Desfazer)$/i,
      }),
    toastActionBtn: (toast, labelRegex) => toast.getByRole('button', { name: labelRegex }),
  },

  ToolsView: {
    toolsTabQuote: (page) =>
      page
        .locator('[data-testid="tools-tab-quote"]')
        .or(page.getByRole('button', { name: /(Cotizador|Quote|Orçamento|Calculadora)/i }))
        .or(page.getByRole('tab', { name: /(Cotizador|Quote|Orçamento|Calculadora)/i })),
    toolsTabBatch: (page) =>
      page
        .locator('[data-testid="tools-tab-batch"]')
        .or(page.getByRole('button', { name: /(Lotes|Batch|Lote)/i }))
        .or(page.getByRole('tab', { name: /(Lotes|Batch|Lote)/i })),
    toolsTabMath: (page) =>
      page
        .locator('[data-testid="tools-tab-math"]')
        .or(page.getByRole('button', { name: /(Matemática|Math|Tara|Tare|Secado|Drying)/i }))
        .or(page.getByRole('tab', { name: /(Matemática|Math|Tara|Tare|Secado|Drying)/i })),
    quoteAddSpoolBtn: (page) =>
      page
        .locator('[data-testid="quote-add-spool"]')
        .or(page.getByRole('button', { name: /(Añadir bobina|Add spool|Adicionar carretel)/i })),
    quoteCopyBtn: (page) =>
      page
        .locator('[data-testid="quote-copy-btn"]')
        .or(page.getByRole('button', { name: /(Copiar cotización|Copy quote|Copiar orçamento)/i })),
    quoteSaveBtn: (page) =>
      page
        .locator('[data-testid="quote-save-btn"]')
        .or(page.getByRole('button', { name: /(Guardar|Exportar|Save|Salvar)/i })),
    quoteTotalOutput: (page) => page.locator('[data-testid="quote-total-output"]'),
    batchSelectFilesBtn: (page) =>
      page
        .locator('[data-testid="batch-select-files-btn"]')
        .or(page.getByRole('button', { name: /(Seleccionar archivos|Select files|Selecionar arquivos)/i })),
    batchSendQuoteBtn: (page) =>
      page
        .locator('[data-testid="batch-send-quote-btn"]')
        .or(page.getByRole('button', { name: /(Enviar a Cotizador|Send to Quote|Enviar para Orçamento)/i })),
    batchSendInboxBtn: (page) =>
      page
        .locator('[data-testid="batch-send-inbox-btn"]')
        .or(page.getByRole('button', { name: /(Enviar a Bandeja|Send to Tray|Enviar para Bandeja)/i })),
    tareGrossInput: (page) => page.locator('[data-testid="tare-gross-input"]'),
    tareEmptyInput: (page) => page.locator('[data-testid="tare-empty-input"]'),
    tareApplyRollBtn: (page) =>
      page
        .locator('[data-testid="tare-apply-roll-btn"]')
        .or(page.getByRole('button', { name: /(Aplicar al rollo|Apply to spool|Aplicar ao carretel)/i })),
  },
};
