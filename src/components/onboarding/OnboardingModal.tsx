import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import type { Language, ThemePref } from '../../shared/types';
import {
  Globe,
  Coins,
  Layers,
  Printer,
  ChevronRight,
  ChevronLeft,
  Check,
  Moon,
  Sun,
  Laptop,
  Sparkles,
} from 'lucide-react';

interface OnboardingModalProps {
  onClose?: () => void;
}

const TOTAL_STEPS = 4;

export function OnboardingModal({ onClose }: OnboardingModalProps) {
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const { t, lang } = useI18n();

  const [step, setStep] = useState(1);

  const handleFinish = () => {
    setSetting('onboardingCompleted', true);
    onClose?.();
  };

  const setLanguage = (newLang: Language) => {
    setSetting('language', newLang);
  };

  const setCurrency = (currency: string) => {
    setSetting('currency', currency);
  };

  const setTheme = (theme: ThemePref) => {
    setSetting('theme', theme);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="relative w-full max-w-xl rounded-3xl bg-surface-1 border border-line-strong shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header con paso y botón omitir */}
        <div className="flex items-center justify-between px-7 pt-6 pb-2 border-b border-line/40">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
            <span className="text-xs font-mono font-medium text-muted tracking-wide uppercase">
              Filoteca · {step} / {TOTAL_STEPS}
            </span>
          </div>
          <button
            type="button"
            onClick={handleFinish}
            className="text-xs text-muted hover:text-text transition-colors py-1 px-2.5 rounded-lg hover:bg-surface-2"
          >
            {t('tourBtnSkip')}
          </button>
        </div>

        {/* Contenido dinámico según el paso */}
        <div className="p-7 min-h-[380px] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent-text flex items-center justify-center mb-4">
                    <Globe size={24} />
                  </div>
                  <h2 className="text-2xl font-display font-bold text-text">
                    {t('tourStep1Title')}
                  </h2>
                  <p className="text-sm text-muted mt-1">
                    {t('tourStep1Subtitle')}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 pt-2">
                  {/* Español */}
                  <button
                    type="button"
                    onClick={() => setLanguage('es')}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                      lang === 'es'
                        ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent'
                        : 'border-line hover:border-line-strong bg-surface-2/50'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="text-2xl">🇨🇴</span>
                      <div>
                        <div className="font-semibold text-text text-base">Español</div>
                        <div className="text-xs text-muted">América Latina / España (COP nativo)</div>
                      </div>
                    </div>
                    {lang === 'es' && <Check size={18} className="text-accent-text shrink-0" />}
                  </button>

                  {/* English */}
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                      lang === 'en'
                        ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent'
                        : 'border-line hover:border-line-strong bg-surface-2/50'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="text-2xl">🇺🇸</span>
                      <div>
                        <div className="font-semibold text-text text-base">English</div>
                        <div className="text-xs text-muted">United States / Global Maker community</div>
                      </div>
                    </div>
                    {lang === 'en' && <Check size={18} className="text-accent-text shrink-0" />}
                  </button>

                  {/* Português */}
                  <button
                    type="button"
                    onClick={() => setLanguage('pt')}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                      lang === 'pt'
                        ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent'
                        : 'border-line hover:border-line-strong bg-surface-2/50'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="text-2xl">🇧🇷</span>
                      <div>
                        <div className="font-semibold text-text text-base">Português</div>
                        <div className="text-xs text-muted">Brasil / Portugal</div>
                      </div>
                    </div>
                    {lang === 'pt' && <Check size={18} className="text-accent-text shrink-0" />}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent-text flex items-center justify-center mb-4">
                    <Coins size={24} />
                  </div>
                  <h2 className="text-2xl font-display font-bold text-text">
                    {t('tourStep2Title')}
                  </h2>
                  <p className="text-sm text-muted mt-1">
                    {t('tourStep2Subtitle')}
                  </p>
                </div>

                <div className="space-y-4 pt-1">
                  <div>
                    <label className="text-xs font-mono uppercase text-muted block mb-2">
                      {t('tourStep2Currency')}
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { code: 'COP', symbol: '$ COP', desc: 'Colombia' },
                        { code: 'USD', symbol: '$ USD', desc: 'Global' },
                        { code: 'EUR', symbol: '€ EUR', desc: 'Europa' },
                        { code: 'BRL', symbol: 'R$ BRL', desc: 'Brasil' },
                      ].map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => setCurrency(c.code)}
                          className={`p-3 rounded-xl border text-center transition-all ${
                            settings.currency === c.code
                              ? 'border-accent bg-accent/15 text-text font-bold ring-1 ring-accent'
                              : 'border-line bg-surface-2/40 text-muted hover:text-text'
                          }`}
                        >
                          <div className="text-sm">{c.symbol}</div>
                          <div className="text-[10px] text-muted">{c.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-mono uppercase text-muted block mb-2">
                      {t('tourStep2Theme')}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'dark', label: t('tourThemeDark'), icon: Moon },
                        { key: 'light', label: t('tourThemeLight'), icon: Sun },
                        { key: 'system', label: t('tourThemeSystem'), icon: Laptop },
                      ].map((th) => {
                        const Icon = th.icon;
                        const active = settings.theme === th.key;
                        return (
                          <button
                            key={th.key}
                            type="button"
                            onClick={() => setTheme(th.key as ThemePref)}
                            className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all text-xs ${
                              active
                                ? 'border-accent bg-accent/15 text-text font-semibold ring-1 ring-accent'
                                : 'border-line bg-surface-2/40 text-muted hover:text-text'
                            }`}
                          >
                            <Icon size={14} />
                            <span>{th.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent-text flex items-center justify-center mb-4">
                    <Layers size={24} />
                  </div>
                  <h2 className="text-2xl font-display font-bold text-text">
                    {t('tourStep3Title')}
                  </h2>
                  <p className="text-sm text-muted mt-1">
                    {t('tourStep3Subtitle')}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-surface-2/50 border border-line space-y-3.5 text-xs text-muted leading-relaxed">
                  <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                    <div>{t('tourStep3Desc1')}</div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                    <div>{t('tourStep3Desc2')}</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 flex items-center gap-2 text-xs text-text">
                  <Sparkles size={16} className="text-accent-text shrink-0" />
                  <span>
                    Gira las bobinas con el cursor para apreciar el acabado, o haz clic en cualquier tarjeta para abrir el visor táctil 360°.
                  </span>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent-text flex items-center justify-center mb-4">
                    <Printer size={24} />
                  </div>
                  <h2 className="text-2xl font-display font-bold text-text">
                    {t('tourStep4Title')}
                  </h2>
                  <p className="text-sm text-muted mt-1">
                    {t('tourStep4Subtitle')}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-surface-2/50 border border-line space-y-3.5 text-xs text-muted leading-relaxed">
                  <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                    <div>{t('tourStep4Desc1')}</div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                    <div>{t('tourStep4Desc2')}</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-surface-2 border border-line flex items-center justify-between text-xs text-muted font-mono">
                  <span>Anycubic Slicer Next · OrcaSlicer</span>
                  <span className="text-accent-text font-bold">100% Offline</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Barra inferior de navegación de pasos */}
          <div className="flex items-center justify-between pt-6 border-t border-line/40 mt-4">
            {/* Puntos de progreso */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? 'w-6 bg-accent' : 'w-1.5 bg-line-strong'
                  }`}
                />
              ))}
            </div>

            {/* Botones atrás / siguiente / finalizar */}
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-muted hover:text-text hover:bg-surface-2 transition-colors flex items-center gap-1"
                >
                  <ChevronLeft size={14} />
                  <span>{t('tourBtnBack')}</span>
                </button>
              )}

              {step < TOTAL_STEPS ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  className="px-4 py-2 rounded-xl bg-accent text-accent-text font-medium text-xs hover:brightness-110 active:scale-98 transition-all flex items-center gap-1 shadow-sm"
                >
                  <span>{t('tourBtnNext')}</span>
                  <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinish}
                  className="px-5 py-2 rounded-xl bg-accent text-accent-text font-semibold text-xs hover:brightness-110 active:scale-98 transition-all flex items-center gap-1.5 shadow-md"
                >
                  <span>{t('tourBtnFinish')}</span>
                  <Check size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
