import React from 'react';
import { render, screen } from '@testing-library/react';
import { PrintableDocumentContainer } from '../PrintableDocumentContainer';

describe('PrintableDocumentContainer', () => {
  it('renders with id="printable-document-area" for print stylesheet isolation', () => {
    const { container } = render(
      <PrintableDocumentContainer title="TAX INVOICE">
        <p>Invoice Body Content</p>
      </PrintableDocumentContainer>
    );

    const printArea = container.querySelector('#printable-document-area');
    expect(printArea).not.toBeNull();
  });

  it('renders business identity details and contact info', () => {
    const identity = {
      displayName: 'SokoSafi Supermarket',
      address: 'Kenyatta Avenue, Nairobi',
      phone: '+254711223344',
      email: 'info@sokosafi.co.ke',
      kraPin: 'P051234567Z',
    };

    render(
      <PrintableDocumentContainer
        title="PAYMENT VOUCHER"
        documentNumber="PV-2026-99"
        identity={identity}
      >
        <div>Voucher Items</div>
      </PrintableDocumentContainer>
    );

    expect(screen.getByText('SOKOSAFI SUPERMARKET')).toBeInTheDocument();
    expect(screen.getByText('Kenyatta Avenue, Nairobi')).toBeInTheDocument();
    expect(screen.getByText('Tel: +254711223344')).toBeInTheDocument();
    expect(screen.getByText('info@sokosafi.co.ke')).toBeInTheDocument();
    expect(screen.getByText('PIN: P051234567Z')).toBeInTheDocument();
    expect(screen.getByText('PAYMENT VOUCHER')).toBeInTheDocument();
    expect(screen.getByText('REF: PV-2026-99')).toBeInTheDocument();
  });

  it('renders children content and footer with Powered by Zana POS', () => {
    render(
      <PrintableDocumentContainer title="STATEMENT">
        <div data-testid="test-content">Table Rows and Data</div>
      </PrintableDocumentContainer>
    );

    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByText('Powered by Zana POS')).toBeInTheDocument();
  });

  it('renders metadata badges correctly', () => {
    const meta = [
      { label: 'Customer', value: 'Acme Ltd' },
      { label: 'Account', value: 'ACC-123' },
    ];

    render(
      <PrintableDocumentContainer title="INVOICE" meta={meta}>
        <div>Body</div>
      </PrintableDocumentContainer>
    );

    expect(screen.getByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.getByText('ACC-123')).toBeInTheDocument();
  });
});
