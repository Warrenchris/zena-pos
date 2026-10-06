import { isProductNotFoundError, mapCartItemToSalePayload, normalizeCartItem } from '../cartItems';

describe('cart item normalization', () => {
  test('restores held item identity and name for checkout', () => {
    const heldItem = { productId: 'product-1', quantity: 2, price: 12 };
    const freshProduct = { id: 'product-1', name: 'Coffee', price: 12 };

    const normalizedItem = normalizeCartItem(heldItem, freshProduct);

    expect(normalizedItem).toEqual(expect.objectContaining({
      id: 'product-1',
      name: 'Coffee'
    }));
    expect(mapCartItemToSalePayload(normalizedItem).productId).toBe('product-1');
  });

  test('keeps an item whose product is missing without throwing', () => {
    const heldItem = { productId: 'deleted-product', quantity: 1, price: 8 };

    expect(() => normalizeCartItem(heldItem, null)).not.toThrow();
    const normalizedItem = normalizeCartItem(heldItem, null);
    expect(normalizedItem).toEqual(expect.objectContaining({
      id: 'deleted-product',
      quantity: 1,
      price: 8
    }));
    expect(typeof normalizedItem.subtotal).toBe('number');
    expect(Number.isFinite(normalizedItem.subtotal)).toBe(true);
    expect(normalizedItem.subtotal).toBe(heldItem.quantity * heldItem.price);
  });

  test('sums normalized fresh and missing held items to a finite total', () => {
    const normalizedItems = [
      normalizeCartItem({ productId: 'available', quantity: 2, price: 12 }, { id: 'available', name: 'Coffee', price: 12 }),
      normalizeCartItem({ productId: 'deleted', quantity: 1, price: 8 }, null)
    ];
    const total = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);

    expect(Number.isFinite(total)).toBe(true);
    expect(total).toBe(32);
  });

  test('hydrates cart fields used by the UI from the fresh product', () => {
    const heldItem = { productId: 'product-3', quantity: 1, price: 20 };
    const freshProduct = {
      id: 'product-3',
      name: 'Milk',
      stockQuantity: 6,
      discount: 2,
      discountType: 'fixed',
      discountValue: 2,
      discountReason: 'Clearance'
    };

    expect(normalizeCartItem(heldItem, freshProduct)).toEqual(expect.objectContaining({
      id: 'product-3',
      name: 'Milk',
      subtotal: 20,
      stockQuantity: 6,
      discount: 2,
      discountType: 'fixed',
      discountValue: 2,
      discountReason: 'Clearance'
    }));
  });

  test('classifies only 404 responses as missing products', () => {
    expect(isProductNotFoundError({ response: { status: 404 } })).toBe(true);
    expect(isProductNotFoundError({ response: { status: 500 } })).toBe(false);
    expect(isProductNotFoundError(new Error('Network error'))).toBe(false);
  });

  test('preserves fresh cart item IDs and checkout fields', () => {
    const freshCartItem = {
      id: 'product-2',
      name: 'Tea',
      quantity: 3,
      price: 5,
      discount: 1,
      discountType: 'percentage',
      discountValue: 10,
      discountReason: 'Promotion'
    };

    expect(normalizeCartItem(freshCartItem, { id: 'product-2', name: 'Fresh Tea' })).toEqual(expect.objectContaining(freshCartItem));
    expect(mapCartItemToSalePayload(freshCartItem)).toEqual({
      productId: 'product-2',
      quantity: 3,
      price: 5,
      discount: 1,
      discountType: 'percentage',
      discountValue: 10,
      discountReason: 'Promotion'
    });
  });
});