/* eslint-env jest */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../store/slices/authSlice';
import PlatformRoute from '../platform/PlatformRoute';
import PlatformLayout from '../platform/PlatformLayout';

function renderWithStore({ user = null, token = null, initialPath = '/platform' } = {}) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user,
        shop: null,
        token,
        loading: false,
        error: null,
      },
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/platform"
            element={
              <PlatformRoute>
                <PlatformLayout>
                  <div data-testid="platform-content">Super Admin Content</div>
                </PlatformLayout>
              </PlatformRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('PlatformRoute & PlatformLayout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects to /login if user is not authenticated', () => {
    renderWithStore({ user: null, token: null });
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByTestId('platform-content')).not.toBeInTheDocument();
  });

  it('shows access denied if authenticated user is not super_admin', () => {
    renderWithStore({
      user: { id: 10, email: 'admin@tenant.com', role: 'admin' },
      token: 'jwt-tenant-admin',
    });

    expect(screen.getByText('Platform Access Denied')).toBeInTheDocument();
    expect(screen.getByText(/This area requires platform super-admin privileges/i)).toBeInTheDocument();
    expect(screen.queryByTestId('platform-content')).not.toBeInTheDocument();
  });

  it('renders platform layout and content for super_admin user', () => {
    renderWithStore({
      user: { id: 1, email: 'root@zanapos.com', role: 'super_admin' },
      token: 'jwt-super-admin',
    });

    expect(screen.getByTestId('platform-content')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('root@zanapos.com')).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });
});
