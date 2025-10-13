const { Op } = require('sequelize');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const SalePayment = require('../models/SalePayment');
const SaleRefund = require('../models/SaleRefund');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Employee = require('../models/Employee');
const sequelize = require('../config/database');

class EnhancedSaleService {
  constructor() {
    this.defaultIncludes = [
      {
        model: SaleItem,
        include: [{ model: Product, attributes: ['name', 'sku', 'price'] }]
      },
      {
        model: Customer,
        attributes: ['name', 'email', 'phone', 'location']
      },
      {
        model: Employee,
        as: 'employee',
        attributes: ['firstName', 'lastName', 'id']
      },
      {
        model: SalePayment,
        as: 'payments'
      }
    ];
  }

  async createSale(saleData, transaction = null) {
    const t = transaction || await sequelize.transaction();
    
    try {
      // Calculate tax and totals
      const items = saleData.items.map(item => ({
        ...item,
        taxAmount: (item.price * item.quantity * (item.taxRate || 0)) / 100,
        subtotal: item.price * item.quantity,
        originalPrice: item.price
      }));

      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      const taxTotal = items.reduce((sum, item) => sum + item.taxAmount, 0);
      const discountAmount = this._calculateDiscount(saleData.discountType, saleData.discountValue, subtotal);
      
      // Create the sale
      const sale = await Sale.create({
        ...saleData,
        subtotal,
        tax: taxTotal,
        total: subtotal + taxTotal - discountAmount,
        processedAt: new Date(),
        saleStatus: 'confirmed'
      }, { transaction: t });

      // Create sale items
      await SaleItem.bulkCreate(
        items.map(item => ({
          ...item,
          saleId: sale.id
        })),
        { transaction: t }
      );

      // Handle split payments if provided
      if (saleData.payments && saleData.payments.length > 0) {
        await SalePayment.bulkCreate(
          saleData.payments.map(payment => ({
            ...payment,
            saleId: sale.id,
            processedBy: saleData.employeeId,
            shopId: saleData.shopId
          })),
          { transaction: t }
        );
      } else {
        // Create single payment record
        await SalePayment.create({
          saleId: sale.id,
          amount: sale.total,
          paymentMethod: saleData.paymentMethod,
          paymentReference: saleData.paymentReference,
          paymentProvider: saleData.paymentProvider,
          processedBy: saleData.employeeId,
          shopId: saleData.shopId,
          status: 'completed'
        }, { transaction: t });
      }

      if (!transaction) await t.commit();
      
      return this.getSaleById(sale.id);
      
    } catch (error) {
      if (!transaction) await t.rollback();
      throw error;
    }
  }

  async getSaleById(id) {
    return Sale.findByPk(id, {
      include: this.defaultIncludes
    });
  }

  async createRefund(refundData) {
    const t = await sequelize.transaction();
    
    try {
      const sale = await Sale.findByPk(refundData.saleId, { transaction: t });
      if (!sale) throw new Error('Sale not found');

      // Create refund record
      const refund = await SaleRefund.create({
        ...refundData,
        status: 'processed'
      }, { transaction: t });

      // Update sale status
      const totalRefunded = await SaleRefund.sum('amount', {
        where: { saleId: sale.id },
        transaction: t
      });

      await sale.update({
        saleStatus: totalRefunded >= sale.total ? 'refunded' : 'partially_refunded',
        refundedAt: new Date()
      }, { transaction: t });

      await t.commit();
      return refund;
      
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async updateSaleStatus(saleId, status, userId) {
    const sale = await Sale.findByPk(saleId);
    if (!sale) throw new Error('Sale not found');

    const statusUpdates = {
      completed: { field: 'completedAt' },
      cancelled: { field: 'cancelledAt' },
      processing: { field: 'processedAt' }
    };

    const update = {
      saleStatus: status,
      lastModifiedBy: userId
    };

    if (statusUpdates[status]) {
      update[statusUpdates[status].field] = new Date();
    }

    return sale.update(update);
  }

  async getSalesByDateRange(startDate, endDate, options = {}) {
    return Sale.findAll({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate]
        },
        ...options.where
      },
      include: this.defaultIncludes,
      order: options.order || [['createdAt', 'DESC']],
      limit: options.limit,
      offset: options.offset
    });
  }

  _calculateDiscount(type, value, subtotal) {
    if (!type || !value) return 0;
    if (type === 'percentage') {
      return (subtotal * value) / 100;
    }
    return value;
  }
}

module.exports = new EnhancedSaleService();