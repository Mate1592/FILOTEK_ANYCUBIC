import React, { useEffect, useRef } from 'react';
import {
  Layers,
  BarChart3,
  ShoppingCart,
  Settings as SettingsIcon,
  Plus,
  Search,
  Spool as SpoolIcon,
  Sparkles,
  Truck,
  Inbox,
} from 'lucide-react';
import { useStore, useUnreviewedGcodeCount, type View } from '../../store/useStore';
import { isDesktop } from '../../lib/api';

export function TitleBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  const openEditor = useStore((s) => s.openEditor);
  const searchFocusTick = useStore((s) => s.searchFocusTick);
  const unreviewedCount = useUnreviewedGcodeCount();

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchFocusTick > 0 && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [searchFocusTick]);

  return (
    <header className="h-12 bg-surface-1/80 backdrop-blur-md border-b border-line flex items-center justify-between px-3 shrink-0 drag select-none z-30">
      {/* Brand / Logo */}
      <div className="flex items-center gap-2.5 mr-4 no-drag">
        {/* Custom Filoteca Spool Logo */}
        <div className="w-7 h-7 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-accent-text shadow-xs">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 3v5.5" />
            <path d="M12 15.5V21" />
            <path d="M3 12h5.5" />
            <path d="M15.5 12H21" />
          </svg>
        </div>

        <div className="flex flex-col">
          <span className="font-display font-extrabold text-sm tracking-tight text-text leading-none">
            Filoteca
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-faint leading-none mt-0.5">
            Taller 3D
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center gap-1 no-drag bg-surface-2/80 p-0.5 rounded-xl border border-line">
        <button
          type="button"
          onClick={() => setView('shelf')}
          className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
            view === 'shelf'
              ? 'bg-elevated text-text shadow-xs font-semibold'
              : 'text-muted hover:text-text'
          }`}
        >
          <Layers size={13} />
          <span>Estantería</span>
        </button>

        <button
          type="button"
          onClick={() => setView('stats')}
          className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
            view === 'stats'
              ? 'bg-elevated text-text shadow-xs font-semibold'
              : 'text-muted hover:text-text'
          }`}
        >
          <BarChart3 size={13} />
          <span>Estadísticas</span>
        </button>

        <button
          type="button"
          onClick={() => setView('replenish')}
          className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
            view === 'replenish'
              ? 'bg-elevated text-text shadow-xs font-semibold'
              : 'text-muted hover:text-text'
          }`}
        >
          <Truck size={13} />
          <span>Reabastecimiento</span>
        </button>

        <button
          type="button"
          onClick={() => setView('shopping')}
          className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
            view === 'shopping'
              ? 'bg-elevated text-text shadow-xs font-semibold'
              : 'text-muted hover:text-text'
          }`}
        >
          <ShoppingCart size={13} />
          <span>Compras</span>
        </button>

        <button
          type="button"
          onClick={() => setView('inbox')}
          className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer relative ${
            view === 'inbox'
              ? 'bg-elevated text-text shadow-xs font-semibold'
              : 'text-muted hover:text-text'
          }`}
        >
          <Inbox size={13} />
          <span>Bandeja</span>
          {unreviewedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-accent text-accent-ink shadow-xs animate-pulse">
              {unreviewedCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setView('settings')}
          className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
            view === 'settings'
              ? 'bg-elevated text-text shadow-xs font-semibold'
              : 'text-muted hover:text-text'
          }`}
        >
          <SettingsIcon size={13} />
          <span>Ajustes</span>
        </button>
      </nav>

      {/* Center/Right: Quick Search + New Roll Button + TitleBarOverlay Gap */}
      <div className="flex items-center gap-2 no-drag ml-auto">
        {/* Search input (visible in shelf) */}
        {view === 'shelf' && (
          <div className="relative hidden sm:block">
            <Search
              size={13}
              className="absolute left-2.5 top-2.5 text-faint pointer-events-none"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar bobina..."
              className="h-7 pl-7 pr-12 text-xs rounded-lg bg-surface-2 border border-line text-text placeholder:text-faint focus:border-accent-text focus:ring-1 focus:ring-accent outline-none w-36 lg:w-48 transition-all"
            />
            <kbd className="absolute right-1.5 top-1.5 font-mono text-[9px] px-1 py-0.2 rounded bg-surface-1 border border-line text-faint pointer-events-none">
              Ctrl+F
            </kbd>
          </div>
        )}

        {/* New Roll Button */}
        <button
          type="button"
          onClick={() => openEditor({ mode: 'new' })}
          className="h-7 px-2.5 rounded-lg bg-accent text-accent-ink hover:bg-accent-strong text-xs font-semibold flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
          title="Nuevo rollo (Ctrl+N)"
        >
          <Plus size={14} />
          <span className="hidden md:inline">Nuevo rollo</span>
          <kbd className="hidden lg:inline text-[9px] font-mono opacity-60 ml-0.5">
            ^N
          </kbd>
        </button>

        {/* Windows overlay titlebar right space for min/max/close controls */}
        {isDesktop && <div className="w-32 shrink-0 h-full" />}
      </div>
    </header>
  );
}
