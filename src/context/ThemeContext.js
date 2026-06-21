import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@motodash_theme_mode';
const DARK_HOUR   = 19; // 7 pm

// ── Color palettes ────────────────────────────────────────────

export const lightColors = {
  background:    '#ffffff',
  surface:       '#f5f5f5',
  hero:          '#0a0a0a',
  primary:       '#C0392B',
  border:        '#e8e8e8',
  textPrimary:   '#0a0a0a',
  textSecondary: '#999999',
  onDark:        '#ffffff',
  mutedOnDark:   '#666666',
};

export const darkColors = {
  background:    '#000000',
  surface:       '#141414',
  hero:          '#0a0a0a',
  primary:       '#C0392B',
  border:        '#2a2a2a',
  textPrimary:   '#ffffff',
  textSecondary: '#888888',
  onDark:        '#ffffff',
  mutedOnDark:   '#666666',
};

function isDarkHour() {
  return new Date().getHours() >= DARK_HOUR;
}

function resolveColors(mode) {
  if (mode === 'dark')  return darkColors;
  if (mode === 'light') return lightColors;
  // auto
  return isDarkHour() ? darkColors : lightColors;
}

// ── Context ───────────────────────────────────────────────────

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode,   setModeState] = useState('auto'); // 'light' | 'dark' | 'auto'
  const [colors, setColors]    = useState(resolveColors('auto'));

  // Load persisted preference
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(saved => {
      const m = saved ?? 'auto';
      setModeState(m);
      setColors(resolveColors(m));
    });
  }, []);

  // In auto mode, re-evaluate every minute so 7pm triggers without restart
  useEffect(() => {
    if (mode !== 'auto') return;
    const interval = setInterval(() => setColors(resolveColors('auto')), 60_000);
    return () => clearInterval(interval);
  }, [mode]);

  const setMode = useCallback(async (m) => {
    setModeState(m);
    setColors(resolveColors(m));
    await AsyncStorage.setItem(STORAGE_KEY, m);
  }, []);

  const isDark = colors.background === '#000000';

  return (
    <ThemeContext.Provider value={{ colors, mode, setMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
