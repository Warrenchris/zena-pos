/* eslint-env jest */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../store/slices/authSlice';
import { authAPI } from '../../services/api';
import { cacheProfile } from '../../offline/authCache';
import PrivateRoute from '../PrivateRoute';

jest.mock('../../services/api', () => ({ authAPI: { getProfile: jest.fn(), login: jest.fn() } }));

const TOKEN = 'aaaa.bbbb.cccc-signature-of-token-one';
const PROFILE = { user: { id: 7, name: 'Wanjiru', role: 'cashier' }, shop: { id: 3 } };
const networkError = () => Object.assign(new Error('Network Error'), { isAxiosError: true });

// Like the real login page: someone who already has a token is sent straight back to the dashboard.
const FakeLogin = () => (window.localStorage.getItem('token') ? <Navigate to="/dashboard" replace /> : <div>Login page</div>);

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

function renderApp() {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: null, shop: null, token: TOKEN, loading: false, error: null } },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<FakeLogin />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <div>Cashier dashboard</div>
              </PrivateRoute>
            }
          />
        </Routes>
        <Where />
      </MemoryRouter>
    </Provider>
  );
  return store;
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('token', TOKEN);
  authAPI.getProfile.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('PrivateRoute with no connection', () => {
  it('opens the dashboard offline using the profile remembered on this device', async () => {
    cacheProfile(TOKEN, PROFILE);
    authAPI.getProfile.mockRejectedValue(networkError());

    renderApp();

    expect(await screen.findByText('Cashier dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard');
  });

  it('shows "can’t reach the server" instead of bouncing to /login, and stays signed in', async () => {
    authAPI.getProfile.mockRejectedValue(networkError());

    renderApp();

    expect(await screen.findByText(/Can.t reach the server/)).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard'); // no redirect loop
    expect(screen.queryByText('Login page')).toBeNull();
    expect(window.localStorage.getItem('token')).toBe(TOKEN);

    // ...and it isn't hammering the server: the number of checks stays put.
    const calls = authAPI.getProfile.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(authAPI.getProfile).toHaveBeenCalledTimes(calls);
    expect(calls).toBeLessThanOrEqual(2);
  });

  it('checks again when the user taps "Try again", and opens once the server answers', async () => {
    authAPI.getProfile.mockRejectedValue(networkError());
    renderApp();
    await screen.findByText(/Can.t reach the server/);
    authAPI.getProfile.mockResolvedValue({ data: PROFILE }); // the connection is back

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Cashier dashboard')).toBeInTheDocument();
  });

  it('checks again by itself when the connection comes back', async () => {
    authAPI.getProfile.mockRejectedValue(networkError());
    renderApp();
    await screen.findByText(/Can.t reach the server/);
    authAPI.getProfile.mockResolvedValue({ data: PROFILE }); // the connection is back

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(await screen.findByText('Cashier dashboard')).toBeInTheDocument();
  });

  it('lets the user sign out from that screen', async () => {
    authAPI.getProfile.mockRejectedValue(networkError());
    renderApp();
    await screen.findByText(/Can.t reach the server/);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    expect(window.localStorage.getItem('token')).toBeNull();
  });

  it('still sends an expired session to the login page', async () => {
    authAPI.getProfile.mockRejectedValue(Object.assign(new Error('401'), { isAxiosError: true, response: { status: 401, data: {} } }));
    renderApp();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });
});
