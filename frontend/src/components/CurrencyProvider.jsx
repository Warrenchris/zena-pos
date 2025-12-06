import React, { createContext, useContext, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSettings, selectCurrencySettings, selectLoading } from '../store/slices/settingsSlice';
import useCurrency from '../hooks/useCurrency';

const CurrencyContext = createContext();

export const useCurrencyContext = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrencyContext must be used within a CurrencyProvider');
  }
  return context;
};

export const CurrencyProvider = ({ children }) => {
  const dispatch = useDispatch();
  const currencySettings = useSelector(selectCurrencySettings);
  const loading = useSelector(selectLoading);
  const currencyUtils = useCurrency();

  const token = useSelector((state) => state.auth.token);

  // Load all settings when component mounts to ensure currency settings are available
  useEffect(() => {
    if (token) {
      dispatch(fetchSettings());
    }
  }, [dispatch, token]);

  const value = {
    ...currencyUtils,
    settings: currencySettings,
    isLoading: loading || !currencySettings || Object.keys(currencySettings).length === 0
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};

export default CurrencyProvider;
