/* eslint-env jest */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import * as sw from '../../../pwa/registerServiceWorker';
import PwaUpdatePrompt from '../PwaUpdatePrompt';
import ConnectionBanner from '../ConnectionBanner';

const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });

beforeEach(() => {
  sw.dismissPwaPrompt(); // the update state lives at module level; start every test clean
  setOnline(true);
  Object.defineProperty(window.navigator, 'serviceWorker', { value: {}, configurable: true });
});
afterEach(() => {
  delete window.navigator.serviceWorker;
  jest.useRealTimers();
});

/** Drive the update state the way the real service worker would. */
async function registerFake() {
  const updateSW = jest.fn().mockResolvedValue();
  const holder = {};
  await sw.registerServiceWorker({
    importRegister: async () => ({
      registerSW: (options) => {
        holder.options = options;
        return updateSW;
      },
    }),
  });
  return { updateSW, holder };
}

describe('PwaUpdatePrompt', () => {
  it('shows nothing normally', () => {
    render(<PwaUpdatePrompt />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('offers an update, and applies it only when "Update now" is pressed', async () => {
    const { holder, updateSW } = await registerFake();
    render(<PwaUpdatePrompt />);

    act(() => holder.options.onNeedRefresh());
    expect(screen.getByRole('alert')).toHaveTextContent('A new version of Zana POS is ready');
    expect(updateSW).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('lets the cashier put the update off', async () => {
    const { holder, updateSW } = await registerFake();
    render(<PwaUpdatePrompt />);
    act(() => holder.options.onNeedRefresh());

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(updateSW).not.toHaveBeenCalled();
  });

  it('confirms the app is ready for offline use, then goes away by itself', async () => {
    jest.useFakeTimers();
    const { holder } = await registerFake();
    render(<PwaUpdatePrompt />);

    act(() => holder.options.onOfflineReady());
    expect(screen.getByRole('status')).toHaveTextContent('Ready to work offline');

    act(() => jest.advanceTimersByTime(6000));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('ConnectionBanner', () => {
  it('appears while offline and disappears when the connection returns', () => {
    render(<ConnectionBanner />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent("You're offline");
    expect(screen.getByRole('status')).toHaveTextContent('saved on this device');

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows immediately if the page opens while already offline', () => {
    setOnline(false);
    render(<ConnectionBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
