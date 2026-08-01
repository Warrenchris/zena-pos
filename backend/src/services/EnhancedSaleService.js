const { Op } = require('sequelize');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const SalePayment = require('../models/SalePayment');
const SaleRefund = require('../models/SaleRefund');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Employee = require('../models/Employee');
const sequelize = require('../config/database');
const { WALK_IN_CUSTOMER_NAME } = require('../constants/customer');

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
        as: 'Employee',
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

  async createSplitPaymentSale(body, req) {
    const t = await sequelize.transaction();
    try {
      const { items, payments, discount = 0, tax = 0, total: frontendTotal, customerId, customer } = body;
      const shopId = req.shopId || req.user.shopId;
      const user = req.user;

      if (!Array.isArray(items) || items.length === 0) {
        const err = new Error('Sale must include at least one item');
        err.statusCode = 400;
        throw err;
      }

      if (!Array.isArray(payments) || payments.length < 2) {
        const err = new Error('Split sale must include at least two payment legs');
        err.statusCode = 400;
        throw err;
      }

      // Calculate serverTotal and verify stock
      let subtotal = 0;
      const lockedProducts = [];
      const saleItems = [];

      for (const item of items) {
        const product = await Product.findOne({
          where: { id: item.productId, active: true, shopId },
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        if (!product) {
          const err = new Error(`Product ${item.productId} not found`);
          err.statusCode = 400;
          throw err;
        }

        if (product.stockQuantity < item.quantity) {
          const err = new Error(`Insufficient stock for product: ${product.name}`);
          err.statusCode = 409;
          throw err;
        }

        const itemPrice = product.price;
        const itemSubtotal = itemPrice * item.quantity;
        subtotal += itemSubtotal;

        lockedProducts.push({ product, item, itemPrice, itemSubtotal });

        saleItems.push({
          productId: product.id,
          quantity: item.quantity,
          unitPrice: product.price,
          price: itemPrice,
          subtotal: itemSubtotal,
          discount: item.discount || 0
        });
      }

      const serverTotal = subtotal + parseFloat(tax || 0) - parseFloat(discount || 0);

      // Validate pricing
      if (frontendTotal !== undefined && Math.abs(serverTotal - parseFloat(frontendTotal)) > 0.01) {
        const err = new Error('Price mismatch. Please refresh and retry.');
        err.statusCode = 400;
        throw err;
      }

      // Validate payment methods and sum
      let sumPayments = 0;
      const allowedMethods = ['cash', 'mpesa', 'card', 'credit'];
      for (const pay of payments) {
        if (!allowedMethods.includes(pay.paymentMethod)) {
          const err = new Error(`Invalid payment method: ${pay.paymentMethod}`);
          err.statusCode = 400;
          throw err;
        }
        if (pay.paymentMethod === 'mpesa' && !pay.gatewayRef) {
          const err = new Error('Unconfirmed M-Pesa leg in split payment');
          err.statusCode = 400;
          throw err;
        }
        if (pay.paymentMethod === 'card' && !pay.gatewayRef) {
          const err = new Error('Unconfirmed card leg in split payment');
          err.statusCode = 400;
          throw err;
        }
        sumPayments += parseFloat(pay.amount || 0);
      }

      if (sumPayments < serverTotal - 0.01) {
        const err = new Error('Insufficient payment amount.');
        err.statusCode = 400;
        throw err;
      }

      // Generate invoiceNumber
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

      const [lastSale] = await Sale.findAll({
        where: {
          invoiceNumber: { [Op.like]: `${dateStr}-%` },
          shopId
        },
        order: [['invoiceNumber', 'DESC']],
        limit: 1,
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      let sequence = '0001';
      if (lastSale) {
        const lastSequence = parseInt(lastSale.invoiceNumber.split('-')[1], 10);
        sequence = String(lastSequence + 1).padStart(4, '0');
      }
      const invoiceNumber = `${dateStr}-${sequence}`;

      // Resolve userId
      const jwtId = user?.id;
      const resolvedUserId = (typeof jwtId === 'number')
        ? jwtId
        : (typeof jwtId === 'string' && /^\d+$/.test(jwtId))
          ? parseInt(jwtId, 10)
          : null;

      // Insert Sales row
      const newSale = await Sale.create({
        invoiceNumber,
        subtotal,
        tax,
        discount,
        total: serverTotal,
        paymentMethod: 'split',
        paymentAmount: sumPayments,
        change: sumPayments > serverTotal ? sumPayments - serverTotal : 0,
        paymentStatus: 'completed',
        customerName: customer?.name || WALK_IN_CUSTOMER_NAME,
        customerLocation: customer?.location || null,
        customerPhone: customer?.phone || null,
        customerEmail: customer?.email || null,
        customerId,
        userId: !user?.isEmployee ? resolvedUserId : null,
        employeeId: user?.isEmployee ? user.id : null,
        notes: body.notes,
        shopId,
      }, { transaction: t });

      // Insert SaleItems rows
      await Promise.all(saleItems.map(item =>
        SaleItem.create({
          ...item,
          saleId: newSale.id,
          shopId
        }, { transaction: t })
      ));

      // Decrement stock
      await Promise.all(lockedProducts.map(({ product, item }) =>
        product.decrement('stockQuantity', { by: item.quantity, transaction: t })
      ));

      // Insert SalePayments rows
      await Promise.all(payments.map(pay =>
        SalePayment.create({
          saleId: newSale.id,
          shopId,
          paymentMethod: pay.paymentMethod,
          amount: pay.amount,
          gatewayRef: pay.gatewayRef || null,
          paidAt: new Date(),
          processedBy: user?.isEmployee ? user.id : null,
        }, { transaction: t })
      ));

      const resolvedCustomerId = customerId || customer?.id || null;
      let finalCustomerId = resolvedCustomerId;
      const isWalkIn = !resolvedCustomerId && (!customer?.name || customer.name === WALK_IN_CUSTOMER_NAME);

      if (!isWalkIn) {
        if (resolvedCustomerId) {
          const existingCustomer = await Customer.findOne({
            where: { id: resolvedCustomerId, shopId },
            transaction: t
          });
          if (existingCustomer) {
            const loyaltyPoints = Math.floor(serverTotal);
            await existingCustomer.update({
              totalPurchases: parseFloat(existingCustomer.totalPurchases || 0) + serverTotal,
              loyaltyPoints: (existingCustomer.loyaltyPoints || 0) + loyaltyPoints,
              lastVisit: new Date(),
              ...(customer?.email && { email: customer.email }),
              ...(customer?.phone && { phone: customer.phone }),
              ...(customer?.location && { location: customer.location })
            }, { transaction: t });
          }
        } else if (customer && customer.name && customer.name !== WALK_IN_CUSTOMER_NAME) {
          let customerRecord = await Customer.findOne({
            where: {
              shopId,
              [Op.or]: [
                ...(customer.email ? [{ email: customer.email }] : []),
                ...(customer.phone ? [{ phone: customer.phone }] : []),
                { name: customer.name }
              ]
            },
            transaction: t
          });

          if (!customerRecord) {
            customerRecord = await Customer.create({
              name: customer.name,
              email: customer.email || null,
              phone: customer.phone || null,
              location: customer.location || null,
              totalPurchases: serverTotal,
              lastVisit: new Date(),
              shopId
            }, { transaction: t });
          } else {
            const loyaltyPoints = Math.floor(serverTotal);
            await customerRecord.update({
              totalPurchases: parseFloat(customerRecord.totalPurchases || 0) + serverTotal,
              loyaltyPoints: (customerRecord.loyaltyPoints || 0) + loyaltyPoints,
              lastVisit: new Date(),
              ...(customer.email && { email: customer.email }),
              ...(customer.phone && { phone: customer.phone }),
              ...(customer.location && { location: customer.location })
            }, { transaction: t });
          }

          finalCustomerId = customerRecord.id;
          await newSale.update({ customerId: finalCustomerId }, { transaction: t });
        }
      }

      await t.commit();

      const { logActivity } = require('../middleware/logger');
      try {
        await logActivity({
          shopId: shopId,
          performedBy: user?.id,
          performedByType: user?.isEmployee ? 'employee' : 'user',
          action: 'SALE_CREATED',
          entity: 'Sale',
          entityId: newSale.id,
          details: `Created split payment sale ${invoiceNumber} with total ${serverTotal}`
        });
      } catch (logErr) {
        console.warn('Logging activity failed for split sale:', logErr);
      }

      // Fetch the full sale with includes and return it
      const saleWithPayments = await Sale.findByPk(newSale.id, {
        include: this.defaultIncludes
      });
      return saleWithPayments;

    } catch (error) {
      try {
        await t.rollback();
      } catch (rollbackErr) {
        // Ignore rollback failure to let the original error propagate
      }
      throw error;
    }
  }
}

module.exports = new EnhancedSaleService();