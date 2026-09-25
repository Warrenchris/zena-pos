/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../store/slices/authSlice';
import { authAPI } from '../../services/api';
import PrivateRoute from '../PrivateRoute';

jest.mock('../../services/api', () => ({
  authAPI: { getProfile: jest.fn(), login: jest.fn() },
}));

const TOKEN = 'valid.jwt.token';
const PROFILE = { user: { id: 10, name: 'Alice', role: 'admin' }, shop: { id: 1 } };

const LoginPage = () => <div data-testid="login-page">Login Page</div>;
const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

function renderApp(preloadedAuthState) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: preloadedAuthState,
    },
  });

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <div data-testid="protected-content">Protected Dashboard</div>
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
  authAPI.getProfile.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PrivateRoute hard-reload and tri-state initialization', () => {
  it('does not prematurely redirect to /login when token exists but user is null on hard reload', async () => {
    window.localStorage.setItem('token', TOKEN);
    
    // Server takes a moment to respond
    let resolveProfile;
    authAPI.getProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
        })
    );

    // Initial state simulates a hard reload: token rehydrated from localStorage, user null, loading false
    renderApp({
      user: null,
      shop: null,
      token: TOKEN,
      loading: false,
      error: null,
    });

    // 1. Initial render must show loading spinner, NOT redirect to /login
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard');

    // 2. Resolve getCurrentUser
    resolveProfile({ data: PROFILE });

    // 3. User is authenticated, protected content appears
    expect(await screen.findByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.queryByTestId('login-page')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard');
  });

  it('redirects immediately to /login when token is completely absent', () => {
    renderApp({
      user: null,
      shop: null,
      token: null,
      loading: false,
      error: null,
    });

    // Must redirect immediately without spinner
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
    expect(authAPI.getProfile).not.toHaveBeenCalled();
  });

  it('redirects to /login if token verification fails with 401 session expired', async () => {
    window.localStorage.setItem('token', TOKEN);
    authAPI.getProfile.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        response: { status: 401, data: { error: 'Your session has expired. Please sign in again.' } },
      })
    );

    renderApp({
      user: null,
      shop: null,
      token: TOKEN,
      loading: false,
      error: null,
    });

    // Initially loading
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // After 401 rejection, redirects to login
    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
    expect(screen.queryByText('Loading...')).toBeNull();
  });
});
