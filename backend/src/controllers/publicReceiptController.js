const crypto = require('crypto');
const { Sale, SaleItem, Product, Shop, SystemSettings } = require('../models');

// Valid token charset: exactly 22 base64url characters
const TOKEN_REGEX = /^[A-Za-z0-9_-]{22}$/;

/**
 * Public unauthenticated endpoint to view an online copy of a receipt.
 *
 * Rate-limited (30 req/min/IP).
 * Hashes the incoming token with SHA-256 and searches by receiptTokenHash.
 * Returns a minimal payload excluding all PII (customer details, cashier name, internal ids).
 */
exports.getPublicReceipt = async (req, res) => {
  try {
    const { token } = req.params;

    // Response headers for public receipts: no caching, no search engine indexing
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex');

    // Validate token format: if malformed, return 404 immediately
    if (!token || !TOKEN_REGEX.test(token)) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const sale = await Sale.findOne({
      where: { receiptTokenHash: hash },
      include: [
        {
          model: Shop,
          attributes: ['id', 'name', 'address', 'phone', 'kraPin'],
        },
        {
          model: SaleItem,
          include: [
            {
              model: Product,
              attributes: ['id', 'name'],
            },
          ],
        },
      ],
    });

    if (!sale) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Fetch shop settings for receipt customization (branch, tagline, logo, etc.)
    const settings = await SystemSettings.findOne({ where: { shopId: sale.shopId } });

    // Build minimal items list
    const items = (sale.SaleItems || []).map((item) => {
      const name = item.Product?.name || item.productName || 'Item';
      const quantity = Number(item.quantity) || 1;
      const unitPrice = Number(item.price ?? item.unitPrice ?? 0);
      const lineTotal = Number(item.total ?? (unitPrice * quantity));
      return {
        name,
        quantity,
        unitPrice,
        lineTotal,
      };
    });

    const isTaxInclusive = sale.taxInclusive != null ? Boolean(sale.taxInclusive) : Boolean(settings?.taxInclusive);
    const taxRate = sale.taxRate != null ? Number(sale.taxRate) : Number(settings?.taxRate || 0);
    const taxAmount = sale.taxAmount != null ? Number(sale.taxAmount) : Number(sale.tax || 0);

    const subtotal = sale.subtotal != null ? Number(sale.subtotal) : Number(sale.total || 0);
    const total = Number(sale.total || 0);
    const discount = Number(sale.discount || 0);
    const paymentAmount = sale.paymentAmount != null ? Number(sale.paymentAmount) : null;
    const change = sale.changeAmount != null ? Number(sale.changeAmount) : (sale.change != null ? Number(sale.change) : null);

    const payload = {
      documentType: 'SALES_RECEIPT',
      business: {
        name: sale.Shop?.name || 'Zana Merchant',
        branch: settings?.branch || '',
        address: sale.Shop?.address || '',
        phone: sale.Shop?.phone || '',
        kraPin: sale.Shop?.kraPin || '',
        tagline: settings?.tagline || '',
        showPoweredBy: settings?.showPoweredBy !== false,
        logoUrl: (settings?.showLogoOnReceipt && settings?.businessLogo) ? settings.businessLogo : null,
      },
      meta: {
        receiptNumber: sale.receiptNumber || sale.invoiceNumber || 'N/A',
        invoiceNumber: sale.invoiceNumber || null,
        dateTime: sale.createdAt,
        paymentLabel: sale.paymentMethod ? (sale.paymentMethod.charAt(0).toUpperCase() + sale.paymentMethod.slice(1)) : 'Cash',
      },
      lines: items,
      totals: {
        subtotal,
        discount,
        tax: {
          amount: taxAmount,
          rate: taxRate,
          inclusive: isTaxInclusive,
        },
        total,
        tendered: paymentAmount,
        change,
      },
      header: settings?.receiptHeader || '',
      footer: settings?.receiptFooter || 'Thank you for your business!',
    };

    return res.status(200).json(payload);
  } catch (error) {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex');
    return res.status(500).json({ error: 'Failed to retrieve receipt' });
  }
};
