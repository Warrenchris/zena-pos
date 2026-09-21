import {
  getDefaultProfile,
  isValidBluetoothAddress,
  CONNECTIONS,
  CONNECTION_INFO,
  DEFAULT_PROFILE,
  STORAGE_KEY,
  getCharsPerLine,
  loadProfile,
  normalizeProfile,
  saveProfile,
} from '../profile';

const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    data,
  };
};

describe('normalizeProfile', () => {
  it('falls back to defaults for junk input', () => {
    expect(normalizeProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(normalizeProfile('nope')).toEqual(DEFAULT_PROFILE);
    expect(
      normalizeProfile({ connection: 'carrier-pigeon', paperWidth: 99, cut: 'sideways', feedLines: 500 })
    ).toEqual(DEFAULT_PROFILE);
  });

  it('keeps valid values', () => {
    const p = { connection: 'bluetooth', paperWidth: 80, cut: 'full', openDrawer: true, feedLines: 5, printerAddress: '66:32:AB:CD:EF:01', printerName: 'MHT-P58' };
    expect(normalizeProfile(p)).toEqual(p);
  });

  it('defaults to 58mm, the safe width for a mixed fleet', () => {
    expect(DEFAULT_PROFILE.paperWidth).toBe(58);
  });
});

describe('getCharsPerLine', () => {
  it('maps paper width to columns', () => {
    expect(getCharsPerLine({ paperWidth: 58 })).toBe(32);
    expect(getCharsPerLine({ paperWidth: 80 })).toBe(48);
  });
});

describe('load/save', () => {
  it('round-trips through storage', () => {
    const storage = fakeStorage();
    saveProfile({ connection: 'usb', paperWidth: 80 }, storage);
    expect(loadProfile(storage)).toMatchObject({ connection: 'usb', paperWidth: 80 });
  });

  it('returns defaults for corrupt JSON', () => {
    expect(loadProfile(fakeStorage({ [STORAGE_KEY]: '{not json' }))).toEqual(DEFAULT_PROFILE);
  });

  it('returns defaults when storage is unavailable or throws', () => {
    expect(loadProfile(null)).toEqual(DEFAULT_PROFILE);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadProfile(broken)).toEqual(DEFAULT_PROFILE);
    expect(() => saveProfile({ paperWidth: 80 }, broken)).not.toThrow();
  });
});

describe('CONNECTION_INFO', () => {
  it('describes every connection type for the settings UI', () => {
    CONNECTIONS.forEach((id) => {
      expect(CONNECTION_INFO[id].label).toBeTruthy();
      expect(CONNECTION_INFO[id].hint).toBeTruthy();
    });
  });
});

describe('Bluetooth printer choice', () => {
  it('validates and normalizes the printer address', () => {
    expect(isValidBluetoothAddress('66:32:ab:cd:ef:01')).toBe(true);
    ['', '66:32:AB:CD:EF', '66-32-AB-CD-EF-01', 'zz:32:AB:CD:EF:01', null, 7].forEach((bad) =>
      expect(isValidBluetoothAddress(bad)).toBe(false)
    );
    expect(normalizeProfile({ printerAddress: '66:32:ab:cd:ef:01', printerName: '  MHT-P58  ' })).toMatchObject({
      printerAddress: '66:32:AB:CD:EF:01',
      printerName: 'MHT-P58',
    });
  });

  it('drops a name that has no valid address, and caps very long names', () => {
    expect(normalizeProfile({ printerAddress: 'nope', printerName: 'Orphan' })).toMatchObject({ printerAddress: '', printerName: '' });
    expect(normalizeProfile({ printerAddress: '66:32:AB:CD:EF:01', printerName: 'x'.repeat(200) }).printerName).toHaveLength(64);
  });
});

describe('environment-aware default', () => {
  afterEach(() => {
    delete window.Capacitor;
  });

  const android = () => {
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      isPluginAvailable: () => true,
      registerPlugin: () => ({}),
    };
  };

  it('starts on browser printing in a normal browser', () => {
    expect(getDefaultProfile().connection).toBe('browser');
    expect(loadProfile(fakeStorage()).connection).toBe('browser');
  });

  it('starts on Bluetooth inside the Android app, where the browser print dialog is unavailable', () => {
    android();
    expect(getDefaultProfile().connection).toBe('bluetooth');
    expect(loadProfile(fakeStorage()).connection).toBe('bluetooth');
  });

  it('never overrides a profile the user saved', () => {
    android();
    const storage = fakeStorage();
    saveProfile({ connection: 'browser', paperWidth: 80 }, storage);
    expect(loadProfile(storage)).toMatchObject({ connection: 'browser', paperWidth: 80 });
  });
});
