import * as THREE from 'three';
import { SpoolObject } from './SpoolObject';
import { shelfPool } from './resources';
import type { Finish } from '../../shared/types';
import type { StockLevel } from '../../lib/roll';

export interface SpoolViewItem {
  id: string;
  element: HTMLElement;
  colorHex: string;
  finish: Finish;
  fraction: number;
  level: StockLevel;
  animateLayout: boolean;
  spinAngle: number;
  tiltX: number;
  tiltY: number;
  isHovered: boolean;
  isVisible: boolean;
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

/** Duración típica de las transiciones CSS / motion de las tarjetas. */
const HOVER_SETTLE_MS = 450;
const LAYOUT_SETTLE_MS = 480;
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
 * (giro en hover limitado a 30 fps). En reposo la GPU queda completamente inactiva (0 draws/s).
 *
 * - Redibujado parcial: con preserveDrawingBuffer, una bobina en hover
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
  private dirtyAll = true;
  private dirtyItems = new Set<string>();
  private layoutAnimUntil = 0;
  private lastRenderTime = 0;
  private reduceMotion = false;
  private reduceMotionQuery: MediaQueryList | null = null;

  private intersectionObserver: IntersectionObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private elToItem = new WeakMap<Element, SpoolViewItem>();
  private elToScrollParent = new WeakMap<Element, Element>();
  private observedContainers = new Map<Element, number>();

  constructor() {
    this.scene = new THREE.Scene();

    // Cámara con ángulo y distancia óptima para encuadrar la bobina
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    this.camera.position.set(0, 0.35, 4.4);
    this.camera.lookAt(0, -0.05, 0);

    // Iluminación de estudio equilibrada de 3 puntos (menor costo de shaders por píxel)
    const hemiLight = new THREE.HemisphereLight(0xf4f7ff, 0x9aa3b2, 2.1);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffaea, 2.7);
    keyLight.position.set(2.5, 4.2, 4.5);
    this.scene.add(keyLight);

    const rimFillLight = new THREE.DirectionalLight(0xdde8ff, 2.1);
    rimFillLight.position.set(-3.5, 3.0, -2.5);
    this.scene.add(rimFillLight);
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

      if (typeof IntersectionObserver !== 'undefined') {
        this.intersectionObserver = new IntersectionObserver(
          (entries) => {
            let needsSchedule = false;
            for (const entry of entries) {
              const item = this.elToItem.get(entry.target);
              if (!item) continue;
              const wasVisible = item.isVisible;
              item.isVisible = entry.isIntersecting;
              if (entry.isIntersecting && (!wasVisible || !item.lastRect)) {
                this.dirtyItems.add(item.id);
                needsSchedule = true;
              } else if (!entry.isIntersecting) {
                item.lastRect = null;
              }
            }
            if (needsSchedule) this.schedule(false);
          },
          { root: null, rootMargin: '80px 0px', threshold: 0 },
        );
      }

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver((entries) => {
          if (entries.length > 0 && this.items.size > 0) {
            this.requestFull(120);
          }
        });
      }

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

  private observeElement(item: SpoolViewItem, element: HTMLElement) {
    this.elToItem.set(element, item);
    this.intersectionObserver?.observe(element);
    this.resizeObserver?.observe(element);

    const scrollParent = element.closest('.overflow-y-auto');
    if (scrollParent) {
      this.elToScrollParent.set(element, scrollParent);
      const count = this.observedContainers.get(scrollParent) ?? 0;
      this.observedContainers.set(scrollParent, count + 1);
      if (count === 0) {
        this.resizeObserver?.observe(scrollParent);
      }
    }
  }

  private unobserveElement(element: HTMLElement) {
    this.intersectionObserver?.unobserve(element);
    this.resizeObserver?.unobserve(element);
    this.elToItem.delete(element);

    const scrollParent = this.elToScrollParent.get(element) ?? element.closest('.overflow-y-auto');
    this.elToScrollParent.delete(element);
    if (scrollParent) {
      const count = this.observedContainers.get(scrollParent);
      if (count === undefined) return;
      if (count <= 1) {
        this.observedContainers.delete(scrollParent);
        this.resizeObserver?.unobserve(scrollParent);
      } else {
        this.observedContainers.set(scrollParent, count - 1);
      }
    }
  }

  // ------------------------------------------------------------------ API pública

  public notifyLayout(holdMs = 120) {
    if (!this.renderer || this.items.size === 0) return;
    this.requestFull(holdMs);
  }

  public register(
    id: string,
    element: HTMLElement,
    colorHex: string,
    finish: Finish,
    fraction: number,
    level: StockLevel,
    animateLayout = true,
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
        animateLayout,
        spinAngle: 0,
        tiltX: 0,
        tiltY: 0,
        isHovered: false,
        isVisible: true,
        spoolObject: new SpoolObject(shelfPool),
        lastRect: null,
        animUntil: 0,
      };
      this.items.set(id, item);
      this.observeElement(item, element);
    } else {
      if (item.element !== element) {
        this.unobserveElement(item.element);
        item.element = element;
        this.observeElement(item, element);
      }
      item.colorHex = colorHex;
      item.finish = finish;
      item.fraction = fraction;
      item.level = level;
      item.animateLayout = animateLayout;
      item.isVisible = true;
    }

    if (this.canvas) this.canvas.style.display = 'block';
    this.dirtyItems.add(id);
    if (animateLayout && this.items.size <= 60) {
      // Listas pequeñas usan transición de entrada Framer Motion
      this.requestFull(LAYOUT_SETTLE_MS);
    } else {
      this.schedule(false);
    }
    return item;
  }

  public updateItem(
    id: string,
    props: Partial<Pick<SpoolViewItem, 'colorHex' | 'finish' | 'fraction' | 'level' | 'tiltX' | 'tiltY' | 'isHovered' | 'spinAngle' | 'animateLayout'>>,
  ) {
    const item = this.items.get(id);
    if (!item) return;

    let changed = false;
    let visualChanged = false;
    for (const key of Object.keys(props) as (keyof typeof props)[]) {
      if (item[key] !== props[key]) {
        changed = true;
        if (key !== 'animateLayout') {
          visualChanged = true;
        }
      }
    }
    if (!changed) return;

    const hoverChanged = props.isHovered !== undefined && props.isHovered !== item.isHovered;
    Object.assign(item, props);
    if (!visualChanged) return;

    // Solo si el hover cambia de estado extendemos el settle time de transiciones CSS
    if (hoverChanged) {
      item.animUntil = performance.now() + HOVER_SETTLE_MS;
    }
    this.dirtyItems.add(id);
    this.schedule(hoverChanged);
  }

  public unregister(id: string) {
    const item = this.items.get(id);
    const wasAnimated = item?.animateLayout ?? true;
    if (item) {
      this.unobserveElement(item.element);
      if (item.lastRect && this.renderer && !this.dirtyAll) {
        this.clearRect(item.lastRect);
      }
      item.spoolObject.dispose();
      this.items.delete(id);
      this.dirtyItems.delete(id);
    }
    if (this.items.size === 0) {
      this.shutdown();
    } else if (wasAnimated && this.items.size <= 60) {
      // Al desaparecer una tarjeta en listas con animación de layout, el resto se reacomoda.
      this.requestFull(LAYOUT_SETTLE_MS);
    } else {
      this.requestFull(0);
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

  private shutdown() {
    if (this.animTimer !== null) {
      clearTimeout(this.animTimer);
      this.animTimer = null;
    }
    this.lastRenderTime = 0;
    this.layoutAnimUntil = 0;
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

  private drawItem(item: SpoolViewItem, rect: ViewRect) {
    item.spoolObject.update(
      item.colorHex,
      item.finish,
      item.fraction,
      item.level,
      item.spinAngle,
      item.tiltX,
      item.tiltY,
      1.0,
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
        this.unobserveElement(item.element);
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

    let hasContinuous = false; // giro en hover o transición en curso

    if (full) {
      const r = this.renderer;
      r.setScissor(0, 0, winW, winH);
      r.setViewport(0, 0, winW, winH);
      r.clear();
    }

    for (const item of this.items.values()) {
      if (!item.isVisible) {
        item.lastRect = null;
        continue;
      }

      const spinning = item.isHovered && !this.reduceMotion;
      const settling = now < item.animUntil;

      if (spinning) item.spinAngle += 0.018 * (dt / 16.7);

      const needsDraw = full || spinning || settling || this.dirtyItems.has(item.id);
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
      this.drawItem(item, rect);

      if (spinning || settling) hasContinuous = true;
    }

    this.dirtyAll = false;
    this.dirtyItems.clear();

    if (layoutAnimating || hasContinuous) {
      this.schedule(false);
    } else {
      // Reposo total: sin frames pendientes, la GPU queda libre.
      this.lastRenderTime = 0;
    }
  };
}

export const spoolViewer = new SpoolViewerManager();
