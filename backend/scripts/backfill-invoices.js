const db = require('../src/config/database');
const Sale = require('../src/models/Sale');
const Invoice = require('../src/models/Invoice');
const Shop = require('../src/models/Shop');

async function backfillInvoices() {
  try {
    console.log('Starting to backfill invoices for past sales...');
    await db.authenticate();

    // Get all shops for multi-tenancy separation
    const shops = await Shop.findAll();
    let globalCount = 0;
    
    for (const shop of shops) {
      const sales = await Sale.findAll({ where: { shopId: shop.id } });
      let count = 0;
      for (const sale of sales) {
        const existingInvoice = await Invoice.findOne({ where: { saleId: sale.id } });
        if (existingInvoice) continue;
        await Invoice.create({
          saleId: sale.id,
          customerId: sale.customerId || null,
          issuerId: sale.userId || null,
          shopId: sale.shopId,
          subtotal: sale.subtotal || 0,
          tax: sale.tax || 0,
          discount: sale.discount || 0,
          total: sale.total || 0,
          status: sale.paymentStatus === 'completed' ? 'paid' : 'pending',
          paymentMethod: sale.paymentMethod || 'cash',
          paymentDate: sale.createdAt,
          invoiceNumber: sale.invoiceNumber
        });
        count++;
        globalCount++;
        if (count % 100 === 0) console.log(`[Shop ${shop.id}] ${count} invoices created...`);
      }
      console.log(`[Shop ${shop.id}] Backfill complete. ${count} invoices created.`);
    }
    console.log(`[ALL SHOPS] Backfill complete. ${globalCount} invoices created.`);
    process.exit(0);
  } catch (error) {
    console.error('Error during invoice backfill:', error);
    process.exit(1);
  }
}

backfillInvoices();
