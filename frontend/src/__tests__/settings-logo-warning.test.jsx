import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import shopReducer from '../store/slices/shopSlice';
import settingsReducer from '../store/slices/settingsSlice';
import Settings from '../pages/Settings';
import { settingsAPI } from '../services/api';

jest.mock('../services/api', () => ({
  settingsAPI: {
    getAll: jest.fn().mockResolvedValue({ data: {} }),
    update: jest.fn(),
    reset: jest.fn(),
    getCurrency: jest.fn().mockResolvedValue({ data: {} }),
    uploadLogo: jest.fn().mockResolvedValue({ data: { logoUrl: 'https://example.com/logo.png' } }),
  },
  authAPI: {},
  shopAPI: {},
}));

describe('Settings Logo Aspect Ratio Safety Warning', () => {
  let originalImage;
  let originalCreateObjectURL;
  let originalRevokeObjectURL;

  beforeEach(() => {
    originalImage = global.Image;
    originalCreateObjectURL = window.URL.createObjectURL;
    originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    window.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    global.Image = originalImage;
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    jest.clearAllMocks();
  });

  function renderSettings() {
    const store = configureStore({
      reducer: combineReducers({
        auth: authReducer,
        shop: shopReducer,
        settings: settingsReducer,
      }),
    });
    return render(
      <Provider store={store}>
        <Settings />
      </Provider>
    );
  }

  it('shows warning when uploaded logo aspect ratio is outside 1:2 to 4:1 (e.g. 5:1 wide)', async () => {
    global.Image = class {
      constructor() {
        this.naturalWidth = 500;
        this.naturalHeight = 90;
      }
      set src(url) {
        setTimeout(() => this.onload && this.onload(), 0);
      }
    };

    renderSettings();

    const input = document.getElementById('businessLogoInput');
    const file = new File(['dummy'], 'wide-logo.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Use a simple, square or wide logo for best receipt results'
    );
  });

  it('shows warning when uploaded logo aspect ratio is too tall (e.g. 1:3 tall)', async () => {
    global.Image = class {
      constructor() {
        this.naturalWidth = 100;
        this.naturalHeight = 350;
      }
      set src(url) {
        setTimeout(() => this.onload && this.onload(), 0);
      }
    };

    renderSettings();

    const input = document.getElementById('businessLogoInput');
    const file = new File(['dummy'], 'tall-logo.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Use a simple, square or wide logo for best receipt results'
    );
  });

  it('does not show warning when uploaded logo has a safe aspect ratio (e.g. 1:1 or 2:1)', async () => {
    global.Image = class {
      constructor() {
        this.naturalWidth = 200;
        this.naturalHeight = 100;
      }
      set src(url) {
        setTimeout(() => this.onload && this.onload(), 0);
      }
    };

    renderSettings();

    const input = document.getElementById('businessLogoInput');
    const file = new File(['dummy'], 'safe-logo.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(settingsAPI.uploadLogo).toHaveBeenCalled();
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
