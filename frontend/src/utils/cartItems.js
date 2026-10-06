export const normalizeCartItem = (item, freshProduct) => {
  const itemId = item.id || item.productId;

  return {
    ...item,
    id: itemId,
    name: item.name ?? freshProduct?.name,
    subtotal: item.subtotal ?? Number(item.quantity) * Number(item.price),
    stockQuantity: item.stockQuantity ?? freshProduct?.stockQuantity,
    discount: item.discount ?? freshProduct?.discount,
    discountType: item.discountType ?? freshProduct?.discountType,
    discountValue: item.discountValue ?? freshProduct?.discountValue,
    discountReason: item.discountReason ?? freshProduct?.discountReason
  };
};

export const isProductNotFoundError = (error) => error?.response?.status === 404;

export const mapCartItemToSalePayload = (item) => ({
  productId: item.id ?? item.productId,
  quantity: item.quantity,
  price: item.price,
  discount: item.discount || 0,
  discountType: item.discountType || null,
  discountValue: item.discountValue || null,
  discountReason: item.discountReason || null
});