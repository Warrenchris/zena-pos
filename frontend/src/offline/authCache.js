/**
 * Remembers who is signed in on this device, so the app can open with no connection.
 *
 * The signed-in user's profile is saved after every successful profile fetch. It is only used when
 * the server can't be reached AND it belongs to the token currently stored, so it can't restore
 * anyone else's session, and it never replaces the server check when the server is reachable.
 * It is removed on sign-out. (The token itself already lives in localStorage.)
 */

export const PROFILE_CACHE_KEY = 'zana.authProfile.v1';

// The end of a JWT is its signature: unique per token, and no more revealing than the token already stored.
const fingerprint = (token) => (typeof token === 'string' ? token.slice(-24) : '');

const storage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export function cacheProfile(token, data) {
  try {
    if (!token || !data?.user) return;
    storage()?.setItem(PROFILE_CACHE_KEY, JSON.stringify({ tokenId: fingerprint(token), savedAt: Date.now(), data }));
  } catch {
    // Non-fatal: the app just won't open offline.
  }
}

export function readCachedProfile(token) {
  try {
    const raw = storage()?.getItem(PROFILE_CACHE_KEY);
    if (!raw || !token) return null;
    const cached = JSON.parse(raw);
    return cached?.tokenId === fingerprint(token) && cached?.data?.user ? cached.data : null;
  } catch {
    return null;
  }
}

export function clearCachedProfile() {
  try {
    storage()?.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // Nothing to clear.
  }
}
