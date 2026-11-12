/** Attach a customer opened from /pos?customerId= when the cart is still empty. */
export function saleWithLinkedCustomer(sale, customer) {
  if (!customer?.id || sale?.items?.length) return sale;
  return {
    ...sale,
    customer: {
      name: customer.name || '',
      location: customer.location || customer.address || '',
      phone: customer.phone || '',
      email: customer.email || '',
    },
    customerId: customer.id,
  };
}
