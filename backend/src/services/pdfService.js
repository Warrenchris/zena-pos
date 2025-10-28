const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');

class PDFService {
  static async generateInvoicePDF(invoice) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50
        });

        // Collect PDF chunks
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Add company logo if exists
        if (invoice.shop.logoUrl) {
          doc.image(invoice.shop.logoUrl, 50, 45, { width: 100 });
        }

        // Add shop details
        doc
          .fontSize(20)
          .text(invoice.shop.name, 200, 45, { align: 'right' })
          .fontSize(10)
          .text(invoice.shop.address, { align: 'right' })
.text('Tel: ' + invoice.shop.phone, { align: 'right' })
          .text('Email: ' + invoice.shop.email, { align: 'right' })
          .moveDown();

        // Add invoice title
        doc
          .fontSize(20)
          .text('INVOICE', 50, 160)
          .moveDown();

        // Add invoice details
        doc
          .fontSize(10)
          .text('Invoice Number: ' + invoice.invoiceNumber, 50, 200)
          .text('Date: ' + new Date(invoice.createdAt).toLocaleDateString())
          .text('Due Date: ' + (invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'))
          .moveDown();

        // Add customer details
        doc
          .text('Bill To:', 50, 250)
          .text(invoice.customer.name)
          .text(invoice.customer.email)
          .text(invoice.customer.phone || '')
          .text(invoice.customer.address || '')
          .moveDown();

        // Add items table header
        const tableTop = 350;
        doc
          .text('Item', 50, tableTop)
          .text('Quantity', 200, tableTop)
          .text('Unit Price', 300, tableTop)
          .text('Amount', 400, tableTop)
          .moveDown();

        // Add table content
        let currentHeight = tableTop + 20;
        invoice.sale.items.forEach(item => {
          doc
            .text(item.name, 50, currentHeight)
            .text(item.quantity.toString(), 200, currentHeight)
            .text(item.unitPrice.toString(), 300, currentHeight)
            .text((item.quantity * item.unitPrice).toString(), 400, currentHeight);
          
          currentHeight += 20;
        });

        // Add total
        doc
          .moveDown()
          .text('Subtotal:', 300, currentHeight)
          .text(invoice.subtotal.toString(), 400, currentHeight)
          .moveDown();

        if (invoice.tax) {
          currentHeight += 20;
          doc
            .text('Tax:', 300, currentHeight)
            .text(invoice.tax.toString(), 400, currentHeight)
            .moveDown();
        }

        currentHeight += 20;
        doc
          .fontSize(12)
          .text('Total:', 300, currentHeight)
          .text(invoice.total.toString(), 400, currentHeight)
          .moveDown();

        // Add payment details
        doc
          .moveDown()
          .fontSize(10)
          .text('Payment Details:')
          .text('Status: ' + invoice.status.toUpperCase())
          .text('Payment Method: ' + (invoice.paymentMethod || 'N/A'));

        // Add footer
        const bottomHeight = doc.page.height - 100;
        doc
          .fontSize(10)
          .text('Thank you for your business!', 50, bottomHeight, { align: 'center' })
          .moveDown()
          .text(invoice.shop.name, { align: 'center' });

        // Finalize PDF
        doc.end();
      } catch (error) {
        logger.error('Error generating PDF:', error);
        reject(error);
      }
    });
  }
}

module.exports = PDFService;