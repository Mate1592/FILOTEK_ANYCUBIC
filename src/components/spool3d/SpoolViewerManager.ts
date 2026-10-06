import * as THREE from 'three';
import { SpoolObject } from './SpoolObject';
import type { Finish } from '../../shared/types';
import type { StockLevel } from '../../lib/roll';

export interface SpoolViewItem {
  id: string;
  element: HTMLElement;
  colorHex: string;
  finish: Finish;
  fraction: number;
  level: StockLevel;
  spinAngle: number;
  tiltX: number;
  tiltY: number;
  isHovered: boolean;
  spoolObject: SpoolObject;
  /** Último rectángulo dibujado (coordenadas WebGL, px CSS). null = no dibujado. */
  lastRect: ViewRect | null;
  /** Mientras now < animUntil, la bobina se sigue redibujando (transiciones CSS de hover). */
  animUntil: number;
}

interface ViewRect {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

/** Intervalo del pulso de bajo stock (~15 fps): suficiente para un brillo suave. */
const PULSE_INTERVAL_MS = 66;
/** Sondeo ligero de cambios de layout (filtros, orden, apertura de paneles). */
const LAYOUT_POLL_MS = 300;
/** Duración típica de las transiciones CSS / motion de las tarjetas. */
const HOVER_SETTLE_MS = 450;
const LAYOUT_SETTLE_MS = 600;
const MAX_DPR = 1.5;

/**
 * Tasa de refresco objetivo para animaciones continuas (giro en hover, transiciones): 30 fps (~33ms).
 * Esto evita saturar GPU y CPU en monitores de 120Hz, 144Hz o 240Hz, manteniendo una fluidez suave.
 */
const TARGET_ANIM_FPS = 30;
const MIN_FRAME_INTERVAL_MS = 1000 / TARGET_ANIM_FPS; // ~33.33ms

const sameRect = (a: ViewRect | null, b: ViewRect | null) =>
  !!a && !!b && a.left === b.left && a.bottom === b.bottom && a.width === b.width && a.height === b.height;

/**
 * Renderer WebGL único y compartido para todas las bobinas de la estantería.
 *
 * Render BAJO DEMANDA con límite de 30 FPS para animaciones:
 * no existe un bucle permanente. Solo se dibuja cuando algo cambia
 * (scroll, resize, layout, hover, props) o mientras hay una animación activa
 * (giro en hover limitado a 30 fps, pulso de bajo stock a 15 fps). En reposo la GPU queda inactiva.
 *
 * - Redibujado parcial: con preserveDrawingBuffer, una bobina en hover o pulsando
 *   solo limpia y redibuja su propio rectángulo, no toda la pantalla.
 * - Redibujado completo: solo en scroll/resize/cambios de layout.
 */
class SpoolViewerManager {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private items: Map<string, SpoolViewItem> = new Map();
  public webglSupported = true;

  private frameRequested = false;
  private animTimer: ReturnType<typeof setTimeout> | null = null;
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private dirtyAll = true;
  private dirtyItems = new Set<string>();
  private layoutAnimUntil = 0;
  private lastRenderTime = 0;
  private lastPulseTime = 0;
  private pulseTime = 0;
  private reduceMotion = false;
  private reduceMotionQuery: MediaQueryList | null = null;

  constructor() {
    this.scene = new THREE.Scene();

    // Cámara con ángulo y distancia óptima para encuadrar la bobina
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    this.camera.position.set(0, 0.35, 4.4);
    this.camera.lookAt(0, -0.05, 0);

    // Iluminación de estudio de taller con realce de colores y bordes
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    this.scene.add(ambientLight);

    // Luz principal cenital suave
    const keyLight = new THREE.DirectionalLight(0xfffaea, 2.4);
    keyLight.position.set(3, 5, 4);
    this.scene.add(keyLight);

    // Luz de relleno lateral
    const fillLight = new THREE.DirectionalLight(0xdde8ff, 1.6);
    fillLight.position.set(-4, 2, -2);
    this.scene.add(fillLight);

    // Luz de contorno superior / rim para destacar el panal y la curva del filamento
    const topRimLight = new THREE.DirectionalLight(0xf0f5ff, 1.9);
    topRimLight.position.set(-2, 4, -3);
    this.scene.add(topRimLight);

    // Luz de borde inferior
    const bottomRimLight = new THREE.DirectionalLight(0xffffff, 1.2);
    bottomRimLight.position.set(0, -3, -3);
    this.scene.add(bottomRimLight);

    // Luz frontal directa para iluminar el interior de los alvéolos y saturar el color del filamento
    const frontLight = new THREE.DirectionalLight(0xffffff, 1.3);
    frontLight.position.set(0.5, 0.8, 4.2);
    this.scene.add(frontLight);
  }

  public init() {
    if (this.canvas || typeof window === 'undefined') return;

    try {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'spool-shared-canvas';
      this.canvas.style.position = 'fixed';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.width = '100vw';
      this.canvas.style.height = '100vh';
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.zIndex = '1';
      this.canvas.style.display = 'none';
      document.body.appendChild(this.canvas);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        // Necesario para redibujar solo el rectángulo de una bobina sin borrar el resto.
        preserveDrawingBuffer: true,
        powerPreference: 'default',
      });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.setScissorTest(true);

      this.reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reduceMotion = this.reduceMotionQuery.matches;
      this.reduceMotionQuery.addEventListener('change', this.onReduceMotionChange);

      window.addEventListener('resize', this.onResize);
      window.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    } catch (e) {
      console.warn('[SpoolViewerManager] WebGL no disponible, usando fallback SVG:', e);
      this.webglSupported = false;
    }
  }

  // ------------------------------------------------------------------ eventos

  private onResize = () => {
    if (!this.renderer || !this.canvas) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.requestFull(LAYOUT_SETTLE_MS);
  };

  private onScroll = () => {
    // Al hacer scroll todas las bobinas se desplazan: redibujado completo en el próximo frame.
    this.requestFull(120);
  };

  private onVisibilityChange = () => {
    if (!document.hidden) this.requestFull();
  };

  private onReduceMotionChange = (e: MediaQueryListEvent) => {
    this.reduceMotion = e.matches;
    this.requestFull();
  };

  // ------------------------------------------------------------------ API pública

  public register(
    id: string,
    element: HTMLElement,
    colorHex: string,
    finish: Finish,
    fraction: number,
    level: StockLevel,
  ): SpoolViewItem {
    this.init();

    let item = this.items.get(id);
    if (!item) {
      item = {
        id,
        element,
        colorHex,
        finish,
        fraction,
        level,
        spinAngle: 0,
        tiltX: 0,
        tiltY: 0,
        isHovered: false,
        spoolObject: new SpoolObject(),
        lastRect: null,
        animUntil: 0,
      };
      this.items.set(id, item);
    } else {
      item.element = element;
      item.colorHex = colorHex;
      item.finish = finish;
      item.fraction = fraction;
      item.level = level;
    }

    if (this.canvas) this.canvas.style.display = 'block';
    this.startLayoutPoll();
    // Las tarjetas entran con animación de layout: mantener redibujado completo un momento.
    this.requestFull(LAYOUT_SETTLE_MS + 400);
    return item;
  }

  public updateItem(
    id: string,
    props: Partial<Pick<SpoolViewItem, 'colorHex' | 'finish' | 'fraction' | 'level' | 'tiltX' | 'tiltY' | 'isHovered' | 'spinAngle'>>,
  ) {
    const item = this.items.get(id);
    if (!item) return;

    let changed = false;
    for (const key of Object.keys(props) as (keyof typeof props)[]) {
      if (item[key] !== props[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    const hoverChanged = props.isHovered !== undefined && props.isHovered !== item.isHovered;
    Object.assign(item, props);

    // Solo si el hover cambia de estado extendemos el settle time de transiciones CSS
    if (hoverChanged) {
      item.animUntil = performance.now() + HOVER_SETTLE_MS;
    }
    this.dirtyItems.add(id);
    this.schedule(hoverChanged);
  }

  public unregister(id: string) {
    const item = this.items.get(id);
    if (item) {
      item.spoolObject.dispose();
      this.items.delete(id);
      this.dirtyItems.delete(id);
    }
    if (this.items.size === 0) {
      this.shutdown();
    } else {
      // Al desaparecer una tarjeta, el resto se reacomoda (layout animation).
      this.requestFull(LAYOUT_SETTLE_MS);
    }
  }

  // ------------------------------------------------------------------ planificación

  private requestFull(holdMs = 0) {
    this.dirtyAll = true;
    if (holdMs > 0) {
      this.layoutAnimUntil = Math.max(this.layoutAnimUntil, performance.now() + holdMs);
    }
    this.schedule(true);
  }

  private schedule(immediate = false) {
    if (!this.renderer || this.items.size === 0) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    if (immediate) {
      if (this.animTimer !== null) {
        clearTimeout(this.animTimer);
        this.animTimer = null;
      }
      if (!this.frameRequested) {
        this.frameRequested = true;
        requestAnimationFrame(this.frame);
      }
      return;
    }

    if (this.frameRequested || this.animTimer !== null) return;

    const now = performance.now();
    const elapsed = now - this.lastRenderTime;
    const remaining = Math.max(0, MIN_FRAME_INTERVAL_MS - elapsed);

    if (remaining > 4) {
      this.animTimer = setTimeout(() => {
        this.animTimer = null;
        if (this.frameRequested || !this.renderer || this.items.size === 0) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        this.frameRequested = true;
        requestAnimationFrame(this.frame);
      }, remaining);
    } else {
      this.frameRequested = true;
      requestAnimationFrame(this.frame);
    }
  }

  private schedulePulse(delay: number) {
    if (this.pulseTimer !== null) return;
    this.pulseTimer = setTimeout(() => {
      this.pulseTimer = null;
      this.schedule(true);
    }, Math.max(0, delay));
  }

  /** Sondeo de baja frecuencia para detectar cambios de posición sin re-render de React (filtros, paneles). */
  private startLayoutPoll() {
    if (this.pollTimer !== null) return;
    this.pollTimer = setInterval(() => {
      if (document.hidden || this.items.size === 0 || this.frameRequested) return;
      const winH = window.innerHeight;
      const winW = window.innerWidth;
      for (const item of this.items.values()) {
        if (!item.element.isConnected) {
          this.requestFull(LAYOUT_SETTLE_MS);
          return;
        }
        const rect = this.computeRect(item, winW, winH);
        if (!sameRect(rect, item.lastRect) && (rect || item.lastRect)) {
          this.requestFull(LAYOUT_SETTLE_MS);
          return;
        }
      }
    }, LAYOUT_POLL_MS);
  }

  private shutdown() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.pulseTimer !== null) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }
    if (this.animTimer !== null) {
      clearTimeout(this.animTimer);
      this.animTimer = null;
    }
    this.lastRenderTime = 0;
    if (this.renderer && this.canvas) {
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      this.renderer.setScissor(0, 0, winW, winH);
      this.renderer.setViewport(0, 0, winW, winH);
      this.renderer.clear();
      this.canvas.style.display = 'none';
    }
  }

  // ------------------------------------------------------------------ render

  /** Rectángulo visible de la bobina en coordenadas WebGL, o null si está fuera de pantalla / oculta. */
  private computeRect(item: SpoolViewItem, winW: number, winH: number): ViewRect | null {
    if (!item.element.isConnected || item.element.offsetParent === null) return null;
    const r = item.element.getBoundingClientRect();
    if (r.bottom < 0 || r.top > winH || r.right < 0 || r.left > winW || r.width === 0 || r.height === 0) {
      return null;
    }
    return {
      left: Math.round(r.left),
      bottom: Math.round(winH - r.bottom),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }

  private clearRect(rect: ViewRect) {
    // Margen de 1 px para no dejar restos del antialiasing en los bordes.
    const x = rect.left - 1;
    const y = rect.bottom - 1;
    const w = rect.width + 2;
    const h = rect.height + 2;
    this.renderer!.setScissor(x, y, w, h);
    this.renderer!.setViewport(x, y, w, h);
    this.renderer!.clear();
  }

  private drawItem(item: SpoolViewItem, rect: ViewRect, pulse: number) {
    item.spoolObject.update(
      item.colorHex,
      item.finish,
      item.fraction,
      item.level,
      item.spinAngle,
      item.tiltX,
      item.tiltY,
      pulse,
    );

    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();

    this.renderer!.setViewport(rect.left, rect.bottom, rect.width, rect.height);
    this.renderer!.setScissor(rect.left, rect.bottom, rect.width, rect.height);

    this.scene.add(item.spoolObject);
    this.renderer!.render(this.scene, this.camera);
    this.scene.remove(item.spoolObject);
    item.lastRect = rect;
  }

  private frame = (now: number) => {
    this.frameRequested = false;
    if (this.animTimer !== null) {
      clearTimeout(this.animTimer);
      this.animTimer = null;
    }
    if (!this.renderer) return;

    // Limpia elementos desmontados del DOM
    for (const [id, item] of this.items) {
      if (!item.element.isConnected) {
        item.spoolObject.dispose();
        this.items.delete(id);
        this.dirtyItems.delete(id);
        this.dirtyAll = true;
      }
    }
    if (this.items.size === 0) {
      this.shutdown();
      return;
    }

    const dt = this.lastRenderTime ? Math.min(now - this.lastRenderTime, 100) : MIN_FRAME_INTERVAL_MS;
    this.lastRenderTime = now;

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const layoutAnimating = now < this.layoutAnimUntil;
    const full = this.dirtyAll || layoutAnimating;

    // Pulso de bajo stock (limitado a ~15 fps)
    const pulseDue = !this.reduceMotion && now - this.lastPulseTime >= PULSE_INTERVAL_MS - 6;
    if (pulseDue) {
      this.pulseTime += 0.04 * ((now - (this.lastPulseTime || now - PULSE_INTERVAL_MS)) / 16.7);
      this.lastPulseTime = now;
    }
    const pulse = this.reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(this.pulseTime * 3);

    let hasContinuous = false; // giro en hover o transición en curso
    let hasPulse = false;

    if (full) {
      const r = this.renderer;
      r.setScissor(0, 0, winW, winH);
      r.setViewport(0, 0, winW, winH);
      r.clear();
    }

    for (const item of this.items.values()) {
      const spinning = item.isHovered && !this.reduceMotion;
      const settling = now < item.animUntil;
      const pulsing = item.level === 'low' || item.level === 'critical';

      if (spinning) item.spinAngle += 0.018 * (dt / 16.7);

      const needsDraw =
        full || spinning || settling || this.dirtyItems.has(item.id) || (pulsing && pulseDue && !this.reduceMotion);
      if (!needsDraw) continue;

      const rect = this.computeRect(item, winW, winH);

      if (!full && item.lastRect && !sameRect(rect, item.lastRect)) {
        // La tarjeta se movió (hover/tilt): borrar la posición anterior.
        this.clearRect(item.lastRect);
      }

      if (!rect) {
        item.lastRect = null;
        continue;
      }

      if (!full) this.clearRect(rect);
      this.drawItem(item, rect, pulse);

      if (spinning || settling) hasContinuous = true;
    }

    // ¿Queda alguna bobina visible con pulso de bajo stock? (independiente de si se dibujó en este frame)
    if (!this.reduceMotion) {
      for (const item of this.items.values()) {
        if (item.lastRect && (item.level === 'low' || item.level === 'critical')) {
          hasPulse = true;
          break;
        }
      }
    }

    this.dirtyAll = false;
    this.dirtyItems.clear();

    if (layoutAnimating || hasContinuous) {
      this.schedule(false);
    } else if (hasPulse) {
      this.lastRenderTime = 0;
      this.schedulePulse(PULSE_INTERVAL_MS - (performance.now() - this.lastPulseTime));
    } else {
      // Reposo total: sin frames pendientes, la GPU queda libre.
      this.lastRenderTime = 0;
    }
  };
}

export const spoolViewer = new SpoolViewerManager();
