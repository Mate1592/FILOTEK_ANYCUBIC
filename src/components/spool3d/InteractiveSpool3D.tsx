import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SpoolObject } from './SpoolObject';
import type { Finish } from '../../shared/types';
import type { StockLevel } from '../../lib/roll';

interface InteractiveSpool3DProps {
  color: string;
  finish: Finish;
  fraction: number;
  level: StockLevel;
  className?: string;
}

export function InteractiveSpool3D({
  color,
  finish,
  fraction,
  level,
  className = '',
}: InteractiveSpool3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const rotVelRef = useRef({ x: 0, y: 0 });
  const rotCurrentRef = useRef({
    x: THREE.MathUtils.degToRad(10),
    y: THREE.MathUtils.degToRad(32),
  });
  const invalidateRef = useRef<(immediate?: boolean) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0.25, 4.3);
    camera.lookAt(0, -0.05, 0);

    // Luces de taller calibradas para modo oscuro y claro
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const keyLight = new THREE.DirectionalLight(0xfffaea, 2.4);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xdde8ff, 1.6);
    fillLight.position.set(-4, 2, -2);
    scene.add(fillLight);
    const topRimLight = new THREE.DirectionalLight(0xf0f5ff, 1.9);
    topRimLight.position.set(-2, 4, -3);
    scene.add(topRimLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.2);
    rimLight.position.set(0, -3, -3);
    scene.add(rimLight);
    const frontLight = new THREE.DirectionalLight(0xffffff, 1.3);
    frontLight.position.set(0.5, 0.8, 4.2);
    scene.add(frontLight);

    const spool = new SpoolObject();
    scene.add(spool);

    let running = true;
    let frameRequested = false;
    let pulseTimer: ReturnType<typeof setTimeout> | null = null;
    let pulseTime = 0;
    const isPulsing = level === 'low' || level === 'critical';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      invalidate();
    };

    const TARGET_FPS = 30;
    const FRAME_MS = 1000 / TARGET_FPS;
    let lastRenderTime = 0;
    let animTimeout: ReturnType<typeof setTimeout> | null = null;

    const renderFrame = () => {
      frameRequested = false;
      if (animTimeout !== null) {
        clearTimeout(animTimeout);
        animTimeout = null;
      }
      if (!running) return;
      lastRenderTime = performance.now();

      const pulse = isPulsing && !reduceMotion ? 0.5 + 0.5 * Math.sin(pulseTime * 3) : 1;

      // Inercia si no se está arrastrando
      if (!isDraggingRef.current) {
        rotCurrentRef.current.x += rotVelRef.current.x;
        rotCurrentRef.current.y += rotVelRef.current.y;
        rotVelRef.current.x *= 0.92;
        rotVelRef.current.y *= 0.92;
        if (Math.abs(rotVelRef.current.x) < 1e-4) rotVelRef.current.x = 0;
        if (Math.abs(rotVelRef.current.y) < 1e-4) rotVelRef.current.y = 0;
      }

      // Actualizar el spool con los ángulos interactivos
      spool.baseRotX = rotCurrentRef.current.x;
      spool.baseRotY = rotCurrentRef.current.y;
      spool.update(color, finish, fraction, level, 0, 0, 0, pulse);
      renderer.render(scene, camera);

      // Render bajo demanda: continuar solo mientras haya movimiento
      const moving = !isDraggingRef.current && (rotVelRef.current.x !== 0 || rotVelRef.current.y !== 0);
      if (moving) {
        invalidate(false);
      } else if (isPulsing && !reduceMotion && pulseTimer === null) {
        pulseTimer = setTimeout(() => {
          pulseTimer = null;
          pulseTime += 0.16;
          invalidate(true);
        }, 66);
      }
    };

    function invalidate(immediate = false) {
      if (!running || (typeof document !== 'undefined' && document.hidden)) return;
      if (immediate) {
        if (animTimeout !== null) {
          clearTimeout(animTimeout);
          animTimeout = null;
        }
        if (!frameRequested) {
          frameRequested = true;
          requestAnimationFrame(renderFrame);
        }
        return;
      }
      if (frameRequested || animTimeout !== null) return;

      const now = performance.now();
      const elapsed = now - lastRenderTime;
      const remaining = Math.max(0, FRAME_MS - elapsed);
      if (remaining > 4) {
        animTimeout = setTimeout(() => {
          animTimeout = null;
          if (!running || frameRequested) return;
          frameRequested = true;
          requestAnimationFrame(renderFrame);
        }, remaining);
      } else {
        frameRequested = true;
        requestAnimationFrame(renderFrame);
      }
    }

    invalidateRef.current = invalidate;
    resize();
    window.addEventListener('resize', resize);
    invalidate(true);

    return () => {
      running = false;
      invalidateRef.current = () => {};
      if (pulseTimer !== null) clearTimeout(pulseTimer);
      if (animTimeout !== null) clearTimeout(animTimeout);
      window.removeEventListener('resize', resize);
      spool.dispose();
      renderer.dispose();
    };
  }, [color, finish, fraction, level]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    rotVelRef.current = { x: 0, y: 0 };
    invalidateRef.current(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };

    const speed = 0.009;
    rotCurrentRef.current.y += dx * speed;
    rotCurrentRef.current.x += dy * speed;

    rotVelRef.current = { x: dy * speed, y: dx * speed };
    invalidateRef.current(false);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignorar si se perdió captura
    }
    invalidateRef.current(); // arranca la inercia
  };

  const handleResetPose = () => {
    rotCurrentRef.current = {
      x: THREE.MathUtils.degToRad(10),
      y: THREE.MathUtils.degToRad(32),
    };
    rotVelRef.current = { x: 0, y: 0 };
    invalidateRef.current();
  };

  return (
    <div className={`relative ${className} select-none group`}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none block"
      />
      <div className="absolute bottom-1 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-[10px] text-faint font-mono bg-surface-1/80 px-2 py-0.5 rounded-full border border-line">
        <span>Arrastra para girar 3D</span>
        <button
          type="button"
          onClick={handleResetPose}
          className="pointer-events-auto text-accent-text hover:underline ml-1"
        >
          Reiniciar
        </button>
      </div>
    </div>
  );
}
