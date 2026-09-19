import {
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
    const p = { connection: 'bluetooth', paperWidth: 80, cut: 'full', openDrawer: true, feedLines: 5 };
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
