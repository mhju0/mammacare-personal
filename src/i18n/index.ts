import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './ko.json';

// Korean-only by owner decision (2026-07-17) — no locale detection, no fallback chain.
i18n.use(initReactI18next).init({
  resources: { ko: { translation: ko } },
  lng: 'ko',
  fallbackLng: 'ko',
  interpolation: { escapeValue: false },
});

export default i18n;

export function foodLabel(f: { isCustom: boolean; name: string }): string {
  return f.isCustom ? f.name : i18n.t(f.name);
}
