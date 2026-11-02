import React, { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'zana_theme';
const VALID_THEMES = ['light', 'dark', 'system'];
const THEME_COLOR = { light: '#784421', dark: '#12100E' };

const ThemeContext = createContext({
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

/** Read the saved preference; ignore anything that isn't a known theme. */
const readStoredTheme = () => {
  try {
    if (typeof window === 'undefined') return 'light';
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (VALID_THEMES.includes(saved)) return saved;
  } catch {
    /* storage blocked (e.g. private mode) — fall through to default */
  }
  return 'light'; // Default to light mode
};

const prefersDark = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const resolveTheme = (theme) =>
  theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(readStoredTheme);
  // Resolve synchronously so the very first render already matches the saved
  // theme (previously this started as 'light' and corrected itself one render later).
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(readStoredTheme()));

  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');

    const applyTheme = (currentTheme) => {
      const next = resolveTheme(currentTheme);
      root.classList.toggle('dark', next === 'dark');
      if (meta) meta.setAttribute('content', THEME_COLOR[next]);
      setResolvedTheme(next);
    };

    applyTheme(theme);

    if (theme === 'system' && typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  const setTheme = (newTheme) => {
    if (!VALID_THEMES.includes(newTheme)) return;
    setThemeState(newTheme);
    try {
      window.localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      /* storage blocked — theme still applies for this session */
    }
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeProvider;
