const { Op } = require('sequelize');

/**
 * Generate next daily credit note number atomically inside a transaction.
 *
 * Pattern: CN-YYYYMMDD-XXXX (e.g. CN-20261026-0001)
 *
 * Concurrency protection:
 * Uses a dedicated per-shop, per-day sequence row in CreditNoteSequences locked
 * with SELECT ... FOR UPDATE inside the caller's transaction.
 *
 * @param {Object} params
 * @param {number} params.shopId - Shop ID
 * @param {Object} params.transaction - Sequelize Transaction (required for locking)
 * @param {Date} [params.date] - Optional override date (defaults to current date)
 * @param {Object} [params.models] - Optional models override for testing
 * @returns {Promise<string>} Next credit note number (e.g. "CN-20261026-0001")
 */
async function generateNextCreditNoteNumber({ shopId, transaction, date = new Date(), models = null }) {
  if (!shopId) {
    throw new Error('shopId is required to generate credit note number');
  }
  if (!transaction) {
    throw new Error('A database transaction is required to generate credit note number with row locking');
  }

  const { CreditNoteSequence, CreditNote, SaleRefund } = models || require('../models');

  const d = date instanceof Date ? date : new Date(date);
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');

  // 1. Lock existing sequence row with SELECT ... FOR UPDATE
  let seqRecord = await CreditNoteSequence.findOne({
    where: { shopId, date: dateStr },
    lock: transaction.LOCK ? transaction.LOCK.UPDATE : true,
    transaction
  });

  // 2. If row does not exist for this shop + date, create it atomically
  if (!seqRecord) {
    try {
      seqRecord = await CreditNoteSequence.create({
        shopId,
        date: dateStr,
        currentSequence: 0
      }, { transaction });
    } catch (err) {
      // If another transaction created it concurrently, re-fetch with FOR UPDATE
      seqRecord = await CreditNoteSequence.findOne({
        where: { shopId, date: dateStr },
        lock: transaction.LOCK ? transaction.LOCK.UPDATE : true,
        transaction
      });
      if (!seqRecord) {
        throw err;
      }
    }
  }

  // 3. Backward compatibility: if sequence is 0, check existing records today
  if (seqRecord.currentSequence === 0) {
    let maxExistingSeq = 0;
    if (CreditNote) {
      const [lastCN] = await CreditNote.findAll({
        where: {
          creditNoteNumber: { [Op.like]: `CN-${dateStr}-%` },
          shopId
        },
        order: [['creditNoteNumber', 'DESC']],
        limit: 1,
        lock: transaction.LOCK ? transaction.LOCK.UPDATE : true,
        transaction
      });
      if (lastCN && lastCN.creditNoteNumber) {
        const parts = lastCN.creditNoteNumber.split('-');
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq) && lastSeq > maxExistingSeq) {
          maxExistingSeq = lastSeq;
        }
      }
    }
    if (SaleRefund) {
      const [lastRefund] = await SaleRefund.findAll({
        where: {
          creditNoteNumber: { [Op.like]: `CN-${dateStr}-%` },
          shopId
        },
        order: [['creditNoteNumber', 'DESC']],
        limit: 1,
        lock: transaction.LOCK ? transaction.LOCK.UPDATE : true,
        transaction
      });
      if (lastRefund && lastRefund.creditNoteNumber) {
        const parts = lastRefund.creditNoteNumber.split('-');
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq) && lastSeq > maxExistingSeq) {
          maxExistingSeq = lastSeq;
        }
      }
    }
    if (maxExistingSeq > 0) {
      seqRecord.currentSequence = maxExistingSeq;
    }
  }

  // 4. Increment sequence
  seqRecord.currentSequence += 1;
  await seqRecord.save({ transaction });

  const sequenceStr = String(seqRecord.currentSequence).padStart(4, '0');
  return `CN-${dateStr}-${sequenceStr}`;
}

module.exports = {
  generateNextCreditNoteNumber
};
