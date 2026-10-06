import { useStore } from '../store/useStore';
import type { Language } from '../shared/types';

export const TRANSLATIONS = {
  es: {
    // Navegación
    tabShelf: 'Estantería',
    tabStats: 'Estadísticas',
    tabReplenish: 'Reabastecimiento',
    tabShopping: 'Compras',
    tabInbox: 'Bandeja',
    tabSettings: 'Ajustes',

    // Acciones principales
    newRoll: 'Nuevo rollo',
    searchPlaceholder: 'Buscar bobina (color, marca, material)...',
    lowStock: 'Bajo stock',
    allStock: 'Todos',
    filters: 'Filtros',
    sortBy: 'Ordenar',
    remaining: 'Restante',
    name: 'Nombre',
    price: 'Precio',
    date: 'Fecha',

    // Ajustes
    settingsTitle: 'Ajustes de Filoteca',
    languageLabel: 'Idioma de la interfaz',
    languageDesc: 'Selecciona el idioma principal de Filoteca.',
    repeatTourLabel: 'Tour de bienvenida',
    repeatTourDesc: 'Vuelve a ver la guía interactiva inicial de funciones.',
    repeatTourButton: 'Reiniciar tour',

    // Tour de Bienvenida
    tourStep1Title: 'Elige tu idioma',
    tourStep1Subtitle: 'Selecciona cómo prefieres interactuar con Filoteca.',
    tourStep1Desc: 'Puedes cambiar el idioma en cualquier momento desde los Ajustes.',

    tourStep2Title: 'Moneda y Apariencia',
    tourStep2Subtitle: 'Configura la moneda de tu taller y el tema visual.',
    tourStep2Currency: 'Moneda principal',
    tourStep2Theme: 'Tema visual',
    tourThemeDark: 'Modo Oscuro',
    tourThemeLight: 'Modo Claro',
    tourThemeSystem: 'Sistema',

    tourStep3Title: 'Estantería y Bobinas 3D',
    tourStep3Subtitle: 'Física paramétrica real y renderizado eficiente.',
    tourStep3Desc1: 'Cada rollo se modela en 3D reflejando el radio real de filamento restante calculado por volumen auténtico.',
    tourStep3Desc2: 'Celosía hexagonal ultraligera con renderizado bajo demanda a 30 FPS para un consumo mínimo de energía.',

    tourStep4Title: 'Companion de Laminador',
    tourStep4Subtitle: 'Ingesta silenciosa para Anycubic Slicer y OrcaSlicer.',
    tourStep4Desc1: 'Filoteca nunca descuenta filamento a espaldas tuyas. Detecta tus impresiones y te consulta al cerrar el laminador.',
    tourStep4Desc2: 'Algoritmo colorimétrico CIELAB para emparejar automáticamente cada ranura con tu stock real.',

    tourStep5Title: 'Apoyar el Proyecto',
    tourStep5Subtitle: 'Filoteca es 100% gratuita, sin publicidad y de código abierto.',
    tourStep5Desc: 'Si esta herramienta te ayuda a optimizar tu taller 3D y ahorrar filamento, considera hacer un aporte voluntario para apoyar el desarrollo continuo.',
    donateWompi: 'Colombia (Wompi / PSE / Nequi / Bancolombia)',
    donatePayPal: 'Internacional (PayPal)',
    developedBy: 'Desarrollado por TermuxX solutions',
    settingsSupportTitle: 'Apoyar a Filoteca',
    settingsSupportDesc: 'Filoteca es mantenida de forma independiente para la comunidad maker. Tu aporte voluntario nos ayuda a mantenerla actualizada y libre de publicidad.',

    tourBtnNext: 'Siguiente',
    tourBtnBack: 'Atrás',
    tourBtnSkip: 'Omitir',
    tourBtnFinish: '¡Comenzar en el taller!',
  },
  en: {
    // Navigation
    tabShelf: 'Shelf',
    tabStats: 'Statistics',
    tabReplenish: 'Restock',
    tabShopping: 'Shopping',
    tabInbox: 'Slicer Tray',
    tabSettings: 'Settings',

    // Main actions
    newRoll: 'New spool',
    searchPlaceholder: 'Search spool (color, brand, material)...',
    lowStock: 'Low stock',
    allStock: 'All',
    filters: 'Filters',
    sortBy: 'Sort by',
    remaining: 'Remaining',
    name: 'Name',
    price: 'Price',
    date: 'Date',

    // Settings
    settingsTitle: 'Filoteca Settings',
    languageLabel: 'Interface Language',
    languageDesc: 'Choose the primary language for Filoteca.',
    repeatTourLabel: 'Welcome Tour',
    repeatTourDesc: 'Replay the interactive onboarding guide.',
    repeatTourButton: 'Restart tour',

    // Onboarding Tour
    tourStep1Title: 'Choose your language',
    tourStep1Subtitle: 'Select how you prefer to use Filoteca.',
    tourStep1Desc: 'You can switch the language at any time in Settings.',

    tourStep2Title: 'Currency & Appearance',
    tourStep2Subtitle: 'Set up your workshop currency and visual theme.',
    tourStep2Currency: 'Primary currency',
    tourStep2Theme: 'Theme appearance',
    tourThemeDark: 'Dark Mode',
    tourThemeLight: 'Light Mode',
    tourThemeSystem: 'System',

    tourStep3Title: '3D Shelf & Parametric Spools',
    tourStep3Subtitle: 'Physical volume tracking with efficient rendering.',
    tourStep3Desc1: 'Every spool is rendered in 3D reflecting the authentic filament radius calculated by true volume physics.',
    tourStep3Desc2: 'Lightweight honeycomb lattice with on-demand 30 FPS rendering for near-zero idle GPU usage.',

    tourStep4Title: 'Slicer Companion',
    tourStep4Subtitle: 'Silent ingestion for Anycubic Slicer and OrcaSlicer.',
    tourStep4Desc1: 'Filoteca never deducts filament without confirmation. It monitors your slicer and prompts you when ready.',
    tourStep4Desc2: 'CIELAB colorimetric math to automatically match slicer slots to your actual inventory.',

    tourStep5Title: 'Support the Project',
    tourStep5Subtitle: 'Filoteca is 100% free, ad-free, and open source.',
    tourStep5Desc: 'If this tool helps your 3D printing workshop save time and filament, consider making a voluntary contribution to support continuous development.',
    donateWompi: 'Colombia (Wompi / PSE / Nequi / Cards)',
    donatePayPal: 'International (PayPal)',
    developedBy: 'Developed by TermuxX solutions',
    settingsSupportTitle: 'Support Filoteca',
    settingsSupportDesc: 'Filoteca is independently maintained for the maker community. Your voluntary support helps keep it up to date and ad-free.',

    tourBtnNext: 'Next',
    tourBtnBack: 'Back',
    tourBtnSkip: 'Skip',
    tourBtnFinish: 'Get Started!',
  },
  pt: {
    // Navegação
    tabShelf: 'Estante',
    tabStats: 'Estatísticas',
    tabReplenish: 'Reabastecimento',
    tabShopping: 'Compras',
    tabInbox: 'Bandeja',
    tabSettings: 'Ajustes',

    // Ações principais
    newRoll: 'Novo carretel',
    searchPlaceholder: 'Buscar carretel (cor, marca, material)...',
    lowStock: 'Estoque baixo',
    allStock: 'Todos',
    filters: 'Filtros',
    sortBy: 'Ordenar',
    remaining: 'Restante',
    name: 'Nome',
    price: 'Preço',
    date: 'Data',

    // Ajustes
    settingsTitle: 'Configurações do Filoteca',
    languageLabel: 'Idioma da interface',
    languageDesc: 'Escolha o idioma principal do Filoteca.',
    repeatTourLabel: 'Tour de boas-vindas',
    repeatTourDesc: 'Reveja o guia interativo inicial de funções.',
    repeatTourButton: 'Reiniciar tour',

    // Tour de Boas-vindas
    tourStep1Title: 'Escolha seu idioma',
    tourStep1Subtitle: 'Selecione como prefere interagir com o Filoteca.',
    tourStep1Desc: 'Você pode alterar o idioma a qualquer momento nos Ajustes.',

    tourStep2Title: 'Moeda e Aparência',
    tourStep2Subtitle: 'Configure a moeda da sua oficina e o tema visual.',
    tourStep2Currency: 'Moeda principal',
    tourStep2Theme: 'Tema visual',
    tourThemeDark: 'Modo Escuro',
    tourThemeLight: 'Modo Claro',
    tourThemeSystem: 'Sistema',

    tourStep3Title: 'Estante e Carretéis 3D',
    tourStep3Subtitle: 'Física paramétrica real e renderização eficiente.',
    tourStep3Desc1: 'Cada carretel é modelado em 3D refletindo o raio real de filamento restante calculado por volume autêntico.',
    tourStep3Desc2: 'Estrutura hexagonal leve com renderização sob demanda a 30 FPS para consumo mínimo de energia.',

    tourStep4Title: 'Companion de Fatiador',
    tourStep4Subtitle: 'Captura silenciosa para Anycubic Slicer e OrcaSlicer.',
    tourStep4Desc1: 'O Filoteca nunca desconta filamento sem confirmação. Ele detecta suas impressões e pergunta ao fechar o fatiador.',
    tourStep4Desc2: 'Algoritmo colorimétrico CIELAB para emparelhar automaticamente cada slot com seu estoque real.',

    tourStep5Title: 'Apoiar o Projeto',
    tourStep5Subtitle: 'O Filoteca é 100% gratuito, sem anúncios e de código aberto.',
    tourStep5Desc: 'Se esta ferramenta ajuda sua oficina 3D a economizar tempo e filamento, considere fazer uma contribuição voluntária para apoiar o desenvolvimento contínuo.',
    donateWompi: 'Colômbia (Wompi / PSE / Nequi / Cartões)',
    donatePayPal: 'Internacional (PayPal)',
    developedBy: 'Desenvolvido por TermuxX solutions',
    settingsSupportTitle: 'Apoiar o Filoteca',
    settingsSupportDesc: 'O Filoteca é mantido de forma independente para a comunidade maker. Seu apoio voluntário ajuda a mantê-lo atualizado e livre de anúncios.',

    tourBtnNext: 'Avançar',
    tourBtnBack: 'Voltar',
    tourBtnSkip: 'Pular',
    tourBtnFinish: 'Começar na oficina!',
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.es;

export function t(key: TranslationKey, lang: Language = 'es'): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.es;
  return dict[key] || TRANSLATIONS.es[key] || key;
}

export function useI18n() {
  const lang = useStore((s) => s.settings.language || 'es');
  return {
    lang,
    t: (key: TranslationKey) => t(key, lang),
  };
}
