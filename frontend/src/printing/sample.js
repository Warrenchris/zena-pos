/** Sample sale used for the printer test receipt and the settings preview. */
export function sampleSale() {
  return {
    serverData: { invoiceNumber: 'TEST-0001', createdAt: new Date() },
    items: [
      { id: 1, name: 'Sample item', price: 150, quantity: 2 },
      { id: 2, name: 'Second sample item with a long name', price: 75.5, quantity: 1 },
    ],
    customer: { name: 'Test Customer' },
    total: 375.5,
    paymentMethod: 'cash',
    paymentAmount: 400,
    change: 24.5,
    notes: 'Printer test - not a real sale',
  };
}
