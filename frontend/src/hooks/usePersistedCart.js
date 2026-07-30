import { useState, useEffect, useCallback } from 'react';

/**
 * Custom Hook for Persisted Cart in localStorage
 */
export function usePersistedCart(cashierId) {
  const [currentSale, setCurrentSale] = useState({
    customer: { name: '', location: '', phone: '', email: '' },
    items: [],
    total: 0,
    paymentMethod: 'cash',
    paymentAmount: '',
    notes: ''
  });
  const [pendingCart, setPendingCart] = useState(null);
  const key = `zena_cart_${cashierId}`;

  useEffect(() => {
    if (!cashierId) {
      setPendingCart(null);
      return;
    }
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const age = Date.now() - (parsed.savedAt || 0);
        if (age < 8 * 60 * 60 * 1000) { // 8 hours
          setPendingCart(parsed);
        } else {
          localStorage.removeItem(key);
        }
      } catch (err) {
        localStorage.removeItem(key);
      }
    } else {
      setPendingCart(null);
    }
  }, [cashierId, key]);

  useEffect(() => {
    if (!cashierId) return;

    const hasItems = currentSale.items && currentSale.items.length > 0;
    const hasCustomer = currentSale.customer && currentSale.customer.name && currentSale.customer.name !== 'Walk-in Customer';

    if (hasItems || hasCustomer) {
      const dataToSave = {
        items: currentSale.items.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          sku: item.sku,
          barcode: item.barcode,
          image: item.image,
          stockQuantity: item.stockQuantity
        })),
        customer: currentSale.customer,
        customerId: currentSale.customerId,
        notes: currentSale.notes,
        savedAt: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(dataToSave));
    } else {
      localStorage.removeItem(key);
    }
  }, [currentSale.items, currentSale.customer, currentSale.customerId, currentSale.notes, cashierId, key]);

  const clearPersistedCart = useCallback(() => {
    if (!cashierId) return;
    localStorage.removeItem(key);
    setPendingCart(null);
  }, [cashierId, key]);

  return {
    currentSale,
    setCurrentSale,
    pendingCart,
    setPendingCart,
    clearPersistedCart
  };
}
export default usePersistedCart;
