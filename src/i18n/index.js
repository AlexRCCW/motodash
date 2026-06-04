import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import en from './en';
import es from './es';
import fr from './fr';

const i18n = new I18n({ en, es, fr });

// Set locale from device — fall back to English if unsupported
const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'en';
i18n.locale = ['en', 'es', 'fr'].includes(deviceLocale) ? deviceLocale : 'en';
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n;

// Helper so screens can do: t('auth.signIn')
export const t = (key, options) => i18n.t(key, options);

// Change language at runtime (e.g. from a settings screen)
export const setLocale = (locale) => {
  i18n.locale = locale;
};

export const getLocale = () => i18n.locale;
