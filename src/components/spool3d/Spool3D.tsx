import React, { useEffect, useRef, memo } from 'react';
import type { Finish } from '../../shared/types';
import type { StockLevel } from '../../lib/roll';
import { spoolViewer } from './SpoolViewerManager';
import { Spool as SvgSpoolFallback } from '../spool/Spool';

interface Spool3DProps {
  id: string;
  color: string;
  finish: Finish;
  fraction: number;
  level: StockLevel;
  isHovered?: boolean;
  tiltX?: number; // radianes
  tiltY?: number; // radianes
  className?: string;
  title?: string;
}

export const Spool3D = memo(function Spool3D({
  id,
  color,
  finish,
  fraction,
  level,
  isHovered = false,
  tiltX,
  tiltY,
  className = '',
  title,
}: Spool3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !spoolViewer.webglSupported) return;

    spoolViewer.register(id, el, color, finish, fraction, level);

    return () => {
      spoolViewer.unregister(id);
    };
  }, [id]);

  useEffect(() => {
    if (!spoolViewer.webglSupported) return;
    const payload: Parameters<typeof spoolViewer.updateItem>[1] = {
      colorHex: color,
      finish,
      fraction,
      level,
      isHovered,
    };
    if (tiltX !== undefined) payload.tiltX = tiltX;
    if (tiltY !== undefined) payload.tiltY = tiltY;
    spoolViewer.updateItem(id, payload);
  }, [id, color, finish, fraction, level, isHovered, tiltX, tiltY]);

  // Si WebGL no está disponible, mostrar el SVG anterior con total fidelidad
  if (!spoolViewer.webglSupported) {
    return (
      <SvgSpoolFallback
        color={color}
        finish={finish}
        fraction={fraction}
        level={level}
        spin={isHovered}
        className={className}
        title={title}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full select-none ${className}`}
      aria-label={title}
      role="img"
    />
  );
});
