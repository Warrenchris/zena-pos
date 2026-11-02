import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../providers/ThemeProvider';

const Probe = () => {
  const { theme, resolvedTheme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={toggleTheme}>toggle</button>
      <button onClick={() => setTheme('bogus')}>set-bogus</button>
      <button onClick={() => setTheme('system')}>set-system</button>
    </div>
  );
};

const mount = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

const mockMatchMedia = (matches) => {
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
};

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.head.innerHTML = '<meta name="theme-color" content="#784421">';
    delete window.matchMedia;
  });
  afterEach(() => jest.restoreAllMocks());

  test('defaults to light with no saved preference', () => {
    mount();
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  test('first render already reflects a saved dark theme (no light flash in state)', () => {
    localStorage.setItem('zana_theme', 'dark');
    // Capture what the very first render saw, before effects run.
    const seen = [];
    const Spy = () => {
      seen.push(useTheme().resolvedTheme);
      return null;
    };
    render(
      <ThemeProvider>
        <Spy />
      </ThemeProvider>,
    );
    expect(seen[0]).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#12100E');
  });

  test('ignores an invalid saved value', () => {
    localStorage.setItem('zana_theme', 'purple');
    mount();
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  test('toggleTheme switches, persists and updates <html> + theme-color', () => {
    mount();
    fireEvent.click(screen.getByText('toggle'));
    expect(localStorage.getItem('zana_theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(screen.getByText('toggle'));
    expect(localStorage.getItem('zana_theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#784421');
  });

  test('setTheme rejects unknown values', () => {
    mount();
    fireEvent.click(screen.getByText('set-bogus'));
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(localStorage.getItem('zana_theme')).toBeNull();
  });

  test('"system" follows the OS preference', () => {
    mockMatchMedia(true);
    mount();
    act(() => fireEvent.click(screen.getByText('set-system')));
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  test('does not crash when storage is unavailable', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mount();
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });
});
