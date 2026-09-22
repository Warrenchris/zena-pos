/* eslint-env jest */

// The module keeps update state at module level, so load a fresh copy for every test.
let sw;
const load = () => {
  jest.resetModules();
  sw = require('../registerServiceWorker');
};

const setServiceWorkerSupport = (supported) => {
  if (supported) Object.defineProperty(window.navigator, 'serviceWorker', { value: {}, configurable: true });
  else delete window.navigator.serviceWorker;
};

/** A stand-in for vite-plugin-pwa's registerSW that lets the test trigger its callbacks. */
const fakeRegister = () => {
  const updateSW = jest.fn().mockResolvedValue();
  const holder = {};
  const registerSW = jest.fn((options) => {
    holder.options = options;
    return updateSW;
  });
  return { updateSW, registerSW, holder, importRegister: async () => ({ registerSW }) };
};

beforeEach(() => {
  load();
  setServiceWorkerSupport(true);
});
afterEach(() => {
  delete window.Capacitor;
  setServiceWorkerSupport(false);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('registerServiceWorker', () => {
  it('does nothing in a browser without service worker support', async () => {
    setServiceWorkerSupport(false);
    const { importRegister, registerSW } = fakeRegister();
    expect(await sw.registerServiceWorker({ importRegister })).toBeNull();
    expect(registerSW).not.toHaveBeenCalled();
  });

  it('does nothing inside the Android app, which ships its own copy of the web app', async () => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    const { importRegister, registerSW } = fakeRegister();
    expect(await sw.registerServiceWorker({ importRegister })).toBeNull();
    expect(registerSW).not.toHaveBeenCalled();
  });

  it('registers, and reports "new version ready" without applying it', async () => {
    const { importRegister, holder, updateSW } = fakeRegister();
    const listener = jest.fn();
    sw.subscribePwa(listener);

    await sw.registerServiceWorker({ importRegister });
    expect(sw.getPwaState()).toEqual({ needRefresh: false, offlineReady: false });

    holder.options.onNeedRefresh();

    expect(sw.getPwaState().needRefresh).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(updateSW).not.toHaveBeenCalled(); // waits for the user
  });

  it('reports when the app is saved for offline use', async () => {
    const { importRegister, holder } = fakeRegister();
    await sw.registerServiceWorker({ importRegister });
    holder.options.onOfflineReady();
    expect(sw.getPwaState().offlineReady).toBe(true);
  });

  it('applies the update (and reloads) only when asked', async () => {
    const { importRegister, holder, updateSW } = fakeRegister();
    await sw.registerServiceWorker({ importRegister });
    holder.options.onNeedRefresh();

    await sw.applyPwaUpdate();

    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('can dismiss the prompt, and stop listening', async () => {
    const { importRegister, holder } = fakeRegister();
    const listener = jest.fn();
    const unsubscribe = sw.subscribePwa(listener);
    await sw.registerServiceWorker({ importRegister });
    holder.options.onNeedRefresh();

    sw.dismissPwaPrompt();
    expect(sw.getPwaState()).toEqual({ needRefresh: false, offlineReady: false });

    unsubscribe();
    listener.mockClear();
    holder.options.onNeedRefresh();
    expect(listener).not.toHaveBeenCalled();
  });

  it('looks for a new version every hour, so a till left open all day still updates', async () => {
    jest.useFakeTimers();
    const { importRegister, holder } = fakeRegister();
    await sw.registerServiceWorker({ importRegister });
    const registration = { update: jest.fn().mockResolvedValue() };

    holder.options.onRegisteredSW('/sw.js', registration);
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(registration.update).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it('survives an update check failing (e.g. offline)', async () => {
    jest.useFakeTimers();
    const { importRegister, holder } = fakeRegister();
    await sw.registerServiceWorker({ importRegister });
    holder.options.onRegisteredSW('/sw.js', { update: jest.fn().mockRejectedValue(new Error('offline')) });
    expect(() => jest.advanceTimersByTime(60 * 60 * 1000)).not.toThrow();
  });

  it('gives up quietly if the registration code cannot be loaded', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sw.registerServiceWorker({
      importRegister: async () => {
        throw new Error('chunk failed');
      },
    });
    expect(result).toBeNull();
  });

  it('applyPwaUpdate does nothing before registration', async () => {
    await expect(sw.applyPwaUpdate()).resolves.toBeUndefined();
  });
});
