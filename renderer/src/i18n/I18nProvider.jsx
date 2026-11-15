import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, LOCALES, detectLocale } from './locales/index.js';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(detectLocale);

  const setLocale = useCallback((next) => {
    setLocaleState(next);
    try { localStorage.setItem('csdraw-locale', next); } catch { }
  }, []);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const t = useCallback((key, params) => {
    const message = LOCALES[locale].messages[key] ?? LOCALES[DEFAULT_LOCALE].messages[key] ?? key;
    return params ? message.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`)) : message;
  }, [locale]);

  const errorMessage = useCallback((error) => {
    if (locale === DEFAULT_LOCALE) return error.message;
    return LOCALES[locale].messages[`error.${error.code}`] ?? error.message;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t, errorMessage }), [locale, setLocale, t, errorMessage]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
