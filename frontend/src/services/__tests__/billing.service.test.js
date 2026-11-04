jest.mock('../api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

import api from '../api';
import billingService from '../billing.service';

describe('billing service PDF downloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('downloads a subscription invoice PDF as a blob from the organization billing endpoint', async () => {
    const pdfBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    api.get.mockResolvedValue({ data: pdfBlob });

    const result = await billingService.downloadInvoicePdf(42);

    expect(api.get).toHaveBeenCalledWith('/api/billing/invoices/42/pdf', {
      responseType: 'blob',
    });
    expect(result).toBe(pdfBlob);
  });

  test('propagates authorization and network errors to the Billing page', async () => {
    const error = new Error('Forbidden');
    api.get.mockRejectedValue(error);

    await expect(billingService.downloadInvoicePdf(43)).rejects.toBe(error);
  });
});
