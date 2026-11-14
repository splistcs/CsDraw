import en from './en.js';
import es from './es.js';
import ptBR from './pt-BR.js';
import ru from './ru.js';

export const DEFAULT_LOCALE = 'pt-BR';

/** Para adicionar um idioma: crie o arquivo com as mesmas chaves de pt-BR.js e registre aqui. */
export const LOCALES = {
  'pt-BR': { label: 'Português (BR)', messages: ptBR },
  en: { label: 'English', messages: en },
  es: { label: 'Español', messages: es },
  ru: { label: 'Русский', messages: ru }
};

/** Idioma salvo; senao o do sistema (se suportado); senao pt-BR. */
export function detectLocale() {
  try {
    const saved = localStorage.getItem('csdraw-locale');
    if (saved && LOCALES[saved]) return saved;
  } catch { /* sem armazenamento */ }
  const preferred = (typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []).filter(Boolean);
  for (const language of preferred) {
    const base = language.toLowerCase().split('-')[0];
    if (base === 'pt') return 'pt-BR';
    const match = Object.keys(LOCALES).find((code) => code.toLowerCase().split('-')[0] === base);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
