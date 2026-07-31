const { Model, DataTypes, Op } = require('sequelize');
const sequelize = require('../config/database');

class Invoice extends Model {}

Invoice.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  saleId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  tax: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('paid', 'pending', 'canceled'),
    allowNull: false,
    defaultValue: 'pending',
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  paymentDate: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  }
}, {
  sequelize,
  modelName: 'Invoice',
  tableName: 'Invoices',
  timestamps: true,
});

// Invoice number generation: INV-{timestamp}-{shopId}
Invoice.addHook('beforeValidate', (invoice) => {
  if (!invoice.invoiceNumber) {
    invoice.invoiceNumber = `INV-${Date.now()}-${invoice.shopId || 1}`;
  }
});

// Associations
Invoice.associate = (models) => {
  Invoice.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
  Invoice.belongsTo(models.Shop, {
    foreignKey: 'shopId',
    as: 'shop'
  });
  Invoice.belongsTo(models.Sale, {
    foreignKey: 'saleId',
    as: 'sale'
  });
  Invoice.hasMany(models.InvoiceItem, {
    foreignKey: 'invoiceId',
    as: 'items'
  });
};

module.exports = Invoice;