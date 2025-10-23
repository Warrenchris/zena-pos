import React from 'react';
import { CurrencyProvider } from './CurrencyProvider';

/**
 * Higher-order component that provides currency context to wrapped components
 * @param {React.Component} WrappedComponent - Component to wrap
 * @returns {React.Component} Enhanced component with currency context
 */
const withCurrency = (WrappedComponent) => {
  const WithCurrencyComponent = (props) => {
    return (
      <CurrencyProvider>
        <WrappedComponent {...props} />
      </CurrencyProvider>
    );
  };

  WithCurrencyComponent.displayName = `withCurrency(${WrappedComponent.displayName || WrappedComponent.name})`;
  
  return WithCurrencyComponent;
};

export default withCurrency;
