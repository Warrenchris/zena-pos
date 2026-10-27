const { Op } = require('sequelize');

/**
 * Generate next daily invoice number atomically inside a transaction.
 *
 * Pattern: YYYYMMDD-XXXX (e.g. 20261023-0001)
 *
 * Concurrency protection:
 * Uses a dedicated per-shop, per-day sequence row in InvoiceSequences locked
 * with SELECT ... FOR UPDATE inside the caller's transaction.
 *
 * @param {Object} params
 * @param {number} params.shopId - Shop ID
 * @param {Object} params.transaction - Sequelize Transaction (required for locking)
 * @param {Date} [params.date] - Optional override date (defaults to current date)
 * @param {Object} [params.models] - Optional models override (InvoiceSequence, Sale) for testing
 * @returns {Promise<string>} Next invoice number (e.g. "20261023-0001")
 */
async function generateNextInvoiceNumber({ shopId, transaction, date = new Date(), models = null }) {
  if (!shopId) {
    throw new Error('shopId is required to generate invoice number');
  }
  if (!transaction) {
    throw new Error('A database transaction is required to generate invoice number with row locking');
  }

  const { InvoiceSequence, Sale } = models || require('../models');

  const d = date instanceof Date ? date : new Date(date);
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');

  // 1. Lock existing sequence row with SELECT ... FOR UPDATE
  let seqRecord = await InvoiceSequence.findOne({
    where: { shopId, date: dateStr },
    lock: transaction.LOCK ? transaction.LOCK.UPDATE : true,
    transaction
  });

  // 2. If row does not exist for this shop + date, create it atomically
  if (!seqRecord) {
    try {
      seqRecord = await InvoiceSequence.create({
        shopId,
        date: dateStr,
        currentSequence: 0
      }, { transaction });
    } catch (err) {
      // If another transaction created it concurrently, re-fetch with FOR UPDATE
      seqRecord = await InvoiceSequence.findOne({
        where: { shopId, date: dateStr },
        lock: transaction.LOCK ? transaction.LOCK.UPDATE : true,
        transaction
      });
      if (!seqRecord) {
        throw err;
      }
    }
  }

  // 3. Backward compatibility: if sequence is 0, check if sales already exist today
  if (seqRecord.currentSequence === 0 && Sale) {
    const [lastSale] = await Sale.findAll({
      where: {
        invoiceNumber: { [Op.like]: `${dateStr}-%` },
        shopId
      },
      order: [['invoiceNumber', 'DESC']],
      limit: 1,
      lock: transaction.LOCK ? transaction.LOCK.UPDATE : true,
      transaction
    });

    if (lastSale && lastSale.invoiceNumber) {
      const parts = lastSale.invoiceNumber.split('-');
      const lastSeq = parseInt(parts[1], 10);
      if (!isNaN(lastSeq) && lastSeq > 0) {
        seqRecord.currentSequence = lastSeq;
      }
    }
  }

  // 4. Increment sequence
  seqRecord.currentSequence += 1;
  await seqRecord.save({ transaction });

  const sequenceStr = String(seqRecord.currentSequence).padStart(4, '0');
  return `${dateStr}-${sequenceStr}`;
}

module.exports = {
  generateNextInvoiceNumber
};
