/* eslint-env jest */
import { PROFILE_CACHE_KEY, cacheProfile, clearCachedProfile, readCachedProfile } from '../authCache';

const TOKEN = 'header.payload.signature-one-abcdefghijkl';
const PROFILE = { user: { id: 1, name: 'A' }, shop: { id: 2 } };

beforeEach(() => window.localStorage.clear());

describe('auth profile cache', () => {
  it('returns the profile for the same token only', () => {
    cacheProfile(TOKEN, PROFILE);
    expect(readCachedProfile(TOKEN)).toEqual(PROFILE);
    expect(readCachedProfile('header.payload.signature-two-abcdefghijkl')).toBeNull();
    expect(readCachedProfile(null)).toBeNull();
  });

  it('does not store the token itself, only a fingerprint of its end', () => {
    cacheProfile(TOKEN, PROFILE);
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    expect(raw).not.toContain(TOKEN);
    expect(raw).not.toContain('header.payload');
  });

  it('ignores a profile with no user, and a corrupt cache', () => {
    cacheProfile(TOKEN, { shop: {} });
    expect(readCachedProfile(TOKEN)).toBeNull();
    window.localStorage.setItem(PROFILE_CACHE_KEY, '{nope');
    expect(readCachedProfile(TOKEN)).toBeNull();
  });

  it('can be cleared', () => {
    cacheProfile(TOKEN, PROFILE);
    clearCachedProfile();
    expect(readCachedProfile(TOKEN)).toBeNull();
  });
});
