import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from './store';
import { router } from './router.config.jsx';
import { ToastProvider } from './components/Toast';
import { CurrencyProvider } from './components/CurrencyProvider';

function App() {
  return (
    <React.StrictMode>
      <Provider store={store}>
        <CurrencyProvider>
          <ToastProvider>
            <RouterProvider router={router} future={{ v7_startTransition: true }} />
          </ToastProvider>
        </CurrencyProvider>
      </Provider>
    </React.StrictMode>
  );
}

export default App
