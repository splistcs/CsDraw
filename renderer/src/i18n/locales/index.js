import en from './en.js';
import es from './es.js';
import ptBR from './pt-BR.js';
import ru from './ru.js';

export const DEFAULT_LOCALE = 'en';

export const LOCALES = {
  en: { label: 'English', messages: en },
  'pt-BR': { label: 'Português (BR)', messages: ptBR },
  es: { label: 'Español', messages: es },
  ru: { label: 'Русский', messages: ru }
};

export function detectLocale() {
  try {
    const saved = localStorage.getItem('csdraw-locale');
    if (saved && LOCALES[saved]) return saved;
  } catch { }
  return DEFAULT_LOCALE;
}
