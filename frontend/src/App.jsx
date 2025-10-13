import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from './store';
import { router } from './router.config.jsx';
import { ToastProvider } from './components/Toast';

function App() {
  return (
    <React.StrictMode>
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </ToastProvider>
      </Provider>
    </React.StrictMode>
  );
}

export default App
