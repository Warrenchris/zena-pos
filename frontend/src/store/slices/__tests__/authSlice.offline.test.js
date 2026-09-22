/* eslint-env jest */
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { CONNECTIVITY_ERROR, getCurrentUser, login, logout } from '../authSlice';
import { PROFILE_CACHE_KEY, cacheProfile, readCachedProfile } from '../../../offline/authCache';
import { authAPI } from '../../../services/api';

jest.mock('../../../services/api', () => ({ authAPI: { login: jest.fn(), getProfile: jest.fn() } }));

const TOKEN = 'aaaa.bbbb.cccc-signature-of-token-one';
const OTHER_TOKEN = 'aaaa.bbbb.dddd-signature-of-token-two';
const PROFILE = { user: { id: 7, name: 'Wanjiru', role: 'cashier' }, shop: { id: 3, name: 'Mama Njeri' } };

const networkError = () => Object.assign(new Error('Network Error'), { isAxiosError: true });
const httpError = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status, data } });

const makeStore = (token = TOKEN) =>
  configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: null, shop: null, token, loading: false, error: null } },
  });

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('token', TOKEN);
  authAPI.login.mockReset();
  authAPI.getProfile.mockReset();
});

describe('getCurrentUser (opening the app)', () => {
  it('remembers the profile on this device after a successful check', async () => {
    authAPI.getProfile.mockResolvedValue({ data: PROFILE });
    const store = makeStore();

    await store.dispatch(getCurrentUser());

    expect(store.getState().auth.user).toEqual(PROFILE.user);
    expect(readCachedProfile(TOKEN)).toEqual(PROFILE);
  });

  it('stays signed in, with the remembered profile, when the connection is down', async () => {
    cacheProfile(TOKEN, PROFILE);
    authAPI.getProfile.mockRejectedValue(networkError());
    const store = makeStore();

    await store.dispatch(getCurrentUser());

    const { auth } = store.getState();
    expect(auth.user).toEqual(PROFILE.user);
    expect(auth.shop).toEqual(PROFILE.shop);
    expect(auth.token).toBe(TOKEN);
    expect(auth.error).toBeNull();
    expect(window.localStorage.getItem('token')).toBe(TOKEN);
  });

  it.each([500, 502, 503])('treats a %i from the server like being offline', async (status) => {
    cacheProfile(TOKEN, PROFILE);
    authAPI.getProfile.mockRejectedValue(httpError(status));
    const store = makeStore();
    await store.dispatch(getCurrentUser());
    expect(store.getState().auth.user).toEqual(PROFILE.user);
  });

  it('with no remembered profile, reports a connection problem and keeps the sign-in (it does NOT sign out)', async () => {
    authAPI.getProfile.mockRejectedValue(networkError());
    const store = makeStore();

    await store.dispatch(getCurrentUser());

    const { auth } = store.getState();
    expect(auth.user).toBeNull();
    expect(auth.error).toBe(CONNECTIVITY_ERROR);
    expect(auth.token).toBe(TOKEN);
    expect(window.localStorage.getItem('token')).toBe(TOKEN);
  });

  it('signs out when the server says the session has expired (401), even if a profile is remembered', async () => {
    cacheProfile(TOKEN, PROFILE);
    authAPI.getProfile.mockRejectedValue(httpError(401));
    const store = makeStore();

    await store.dispatch(getCurrentUser());

    const { auth } = store.getState();
    expect(auth.user).toBeNull();
    expect(auth.token).toBeNull();
    expect(window.localStorage.getItem('token')).toBeNull();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull(); // the remembered profile goes too
  });

  it('never uses a profile remembered for a different sign-in', async () => {
    cacheProfile(OTHER_TOKEN, PROFILE);
    authAPI.getProfile.mockRejectedValue(networkError());
    const store = makeStore();

    await store.dispatch(getCurrentUser());

    expect(store.getState().auth.user).toBeNull();
    expect(store.getState().auth.error).toBe(CONNECTIVITY_ERROR);
  });
});

describe('logout', () => {
  it('forgets the token and the remembered profile', () => {
    cacheProfile(TOKEN, PROFILE);
    const store = makeStore();

    store.dispatch(logout());

    expect(window.localStorage.getItem('token')).toBeNull();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    expect(store.getState().auth.token).toBeNull();
  });
});

describe('login', () => {
  it('says the server can’t be reached instead of blaming the password', async () => {
    authAPI.login.mockRejectedValue(networkError());
    const store = makeStore(null);

    await store.dispatch(login({ email: 'a@b.c', password: 'x' }));

    expect(store.getState().auth.error).toBe(CONNECTIVITY_ERROR);
  });

  it('still reports a wrong password as before', async () => {
    authAPI.login.mockRejectedValue(httpError(401, { error: 'Invalid email or password' }));
    const store = makeStore(null);
    await store.dispatch(login({ email: 'a@b.c', password: 'x' }));
    expect(store.getState().auth.error).toBe('Invalid email or password');
  });

  it('remembers the profile so the app can open offline next time', async () => {
    authAPI.login.mockResolvedValue({ data: { token: TOKEN, user: PROFILE.user, shop: PROFILE.shop } });
    authAPI.getProfile.mockResolvedValue({ data: PROFILE });
    const store = makeStore(null);

    await store.dispatch(login({ email: 'a@b.c', password: 'x' }));

    expect(readCachedProfile(TOKEN)).toEqual(PROFILE);
  });
});
