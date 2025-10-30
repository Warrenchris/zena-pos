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
    references: {
      model: 'Sales',
      key: 'id',
    },
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id',
    },
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
  tableName: 'invoices',
  timestamps: true,
});

// Invoice number generation: INV-{timestamp}-{shopId}
Invoice.addHook('beforeCreate', async (invoice) => {
  if (!invoice.invoiceNumber) {
    invoice.invoiceNumber = `INV-${Date.now()}-${invoice.shopId}`;
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