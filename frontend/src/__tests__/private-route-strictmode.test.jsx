/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import PrivateRoute from '../components/PrivateRoute';
import { authAPI } from '../services/api';

jest.mock('../services/api', () => ({
  authAPI: {
    getProfile: jest.fn(),
  },
}));

function makeStore(initialState = {}) {
  return configureStore({
    reducer: combineReducers({
      auth: authReducer,
    }),
    preloadedState: {
      auth: {
        token: 'valid-test-token',
        user: null,
        loading: false,
        error: null,
        ...initialState,
      },
    },
  });
}

describe('PrivateRoute in React.StrictMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears loading state and displays children when rendered inside React.StrictMode with token and no user', async () => {
    authAPI.getProfile.mockResolvedValue({
      data: {
        user: { id: 1, name: 'Alice Test', role: 'cashier' },
        shop: { id: 10, name: 'Test Shop' },
      },
    });

    const store = makeStore();

    render(
      <React.StrictMode>
        <Provider store={store}>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route
                path="/protected"
                element={
                  <PrivateRoute>
                    <div>Protected Content Rendered</div>
                  </PrivateRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </Provider>
      </React.StrictMode>
    );

    // Initial state shows Loading
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // After getCurrentUser resolves, the loading state must clear and protected content must render
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });

    expect(screen.getByText('Protected Content Rendered')).toBeInTheDocument();
  });
});
