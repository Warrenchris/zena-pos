import { saleWithLinkedCustomer } from '../linkedCustomer';

const aggy = { id: 1, name: 'aggy', phone: '0877343434', location: 'Kisumu', email: null };

test('attaches the linked customer to an empty cart', () => {
  const next = saleWithLinkedCustomer({ items: [], customer: { name: '' } }, aggy);
  expect(next.customerId).toBe(1);
  expect(next.customer).toEqual({
    name: 'aggy',
    location: 'Kisumu',
    phone: '0877343434',
    email: '',
  });
});

test('leaves a cart that already has items unchanged', () => {
  const sale = { items: [{ id: 9 }], customerId: null, customer: { name: '' } };
  expect(saleWithLinkedCustomer(sale, aggy)).toBe(sale);
});
