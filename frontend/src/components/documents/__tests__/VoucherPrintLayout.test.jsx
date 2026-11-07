import React from 'react';
import { render, screen } from '@testing-library/react';
import VoucherPrintLayout from '../VoucherPrintLayout';

const formatCurrency = value => `KES ${Number(value).toFixed(2)}`;

const identity = {
  displayName: 'Soko Safi Supermarket',
  address: 'Westlands, Nairobi',
  phone: '+254700000000',
  email: 'accounts@sokosafi.example',
  showPoweredBy: true,
};

describe('VoucherPrintLayout', () => {
  test('renders a purchase voucher with payment balance and non-payment disclaimer', () => {
    render(
      <VoucherPrintLayout
        type="purchase"
        identity={identity}
        formatCurrency={formatCurrency}
        document={{
          referenceNo: 'PUR-2026-001',
          purchaseDate: '2026-11-04T08:00:00.000Z',
          supplierName: 'Fresh Farms Ltd',
          supplierContact: '0700000000',
          status: 'RECEIVED',
          paymentStatus: 'UNPAID',
          paidAmount: 0,
          totalAmount: 600,
          items: [{ productName: 'Fresh Milk', quantity: 10, unitCost: 60, totalCost: 600 }],
        }}
      />
    );

    expect(screen.getByText('PURCHASE VOUCHER')).toBeInTheDocument();
    expect(screen.getByText('REF: PUR-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Fresh Farms Ltd')).toBeInTheDocument();
    expect(screen.getByText('Fresh Milk')).toBeInTheDocument();
    expect(screen.getByText('Paid to supplier')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByText(/not proof of payment/i)).toBeInTheDocument();
  });

  test('renders a purchase order with ordered and received quantities and signature blocks', () => {
    render(
      <VoucherPrintLayout
        type="purchase-order"
        identity={identity}
        formatCurrency={formatCurrency}
        document={{
          poNumber: 'PO-2026-001',
          orderDate: '2026-11-04T08:00:00.000Z',
          expectedDeliveryDate: '2026-11-08T08:00:00.000Z',
          supplierName: 'Nairobi Wholesale',
          supplierEmail: 'orders@nairobi.example',
          supplierPhone: '0700111222',
          status: 'PARTIALLY_RECEIVED',
          totalAmount: 900,
          notes: 'Deliver to receiving bay.',
          lineItems: [{
            id: 1,
            productName: 'Cooking Oil',
            sku: 'OIL-01',
            quantityOrdered: 15,
            quantityReceived: 5,
            unitCost: 60,
            subtotal: 900,
          }],
        }}
      />
    );

    expect(screen.getByText('PURCHASE ORDER')).toBeInTheDocument();
    expect(screen.getByText('REF: PO-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Nairobi Wholesale')).toBeInTheDocument();
    expect(screen.getByText('orders@nairobi.example')).toBeInTheDocument();
    expect(screen.getByText('Deliver to receiving bay.')).toBeInTheDocument();
    expect(screen.getByText('Authorized purchasing officer')).toBeInTheDocument();
    expect(screen.getByText('Supplier acceptance')).toBeInTheDocument();
    expect(screen.queryByText('Paid to supplier')).not.toBeInTheDocument();
  });
});
