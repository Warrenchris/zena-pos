import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from './store';
import { router } from './router.config.jsx';
import { ToastProvider } from './components/Toast';
import { SnackbarProvider } from './components/Snackbar';
import { CurrencyProvider } from './components/CurrencyProvider';

import { ThemeProvider } from './providers/ThemeProvider';

function App() {
  return (
    <React.StrictMode>
      <Provider store={store}>
        <ThemeProvider>
          <CurrencyProvider>
            <ToastProvider>
              <SnackbarProvider>
                <RouterProvider router={router} future={{ v7_startTransition: true }} />
              </SnackbarProvider>
            </ToastProvider>
          </CurrencyProvider>
        </ThemeProvider>
      </Provider>
    </React.StrictMode>
  );
}

export default App
