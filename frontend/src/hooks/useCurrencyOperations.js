import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { updateCurrency } from '../store/slices/settingsSlice';
import { useCurrency } from '../providers/CurrencyProvider';

export const useCurrencyOperations = () => {
  const dispatch = useDispatch();
  const currency = useCurrency();

  const changeCurrency = useCallback(async (currencyCode) => {
    try {
      await dispatch(updateCurrency({ currencyCode })).unwrap();
    } catch (error) {
      console.error('Failed to update currency:', error);
    }
  }, [dispatch]);

  const formatAmount = useCallback((amount, options = {}) => {
    return currency.format(amount, options);
  }, [currency]);

  const parseAmount = useCallback((value) => {
    return currency.parse(value);
  }, [currency]);

  return {
    ...currency,
    changeCurrency,
    formatAmount,
    parseAmount
  };
};