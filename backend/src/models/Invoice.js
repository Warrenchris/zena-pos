const { Model, DataTypes } = require('sequelize');
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
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Customers',
      key: 'id',
    },
  },
  issuerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
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
  status: {
    type: DataTypes.ENUM('draft', 'pending', 'paid', 'overdue', 'cancelled'),
    defaultValue: 'pending',
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  tax: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  notes: {
    type: DataTypes.TEXT,
  },
  dueDate: {
    type: DataTypes.DATE,
  },
  paymentMethod: {
    type: DataTypes.STRING,
  },
  paymentDate: {
    type: DataTypes.DATE,
  },
  emailSentAt: {
    type: DataTypes.DATE,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  }
}, {
  sequelize,
  modelName: 'Invoice',
  tableName: 'invoices',
  timestamps: true,
  hooks: {
    beforeCreate: async (invoice) => {
      // Generate invoice number if not provided
      if (!invoice.invoiceNumber) {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        
        // Get the last invoice number for this month
        const lastInvoice = await Invoice.findOne({
          where: {
            invoiceNumber: {
              [Op.like]: 'INV-' + year + month + '%'
            }
          },
          order: [['invoiceNumber', 'DESC']]
        });

        let sequence = '001';
        if (lastInvoice) {
          const lastSequence = parseInt(lastInvoice.invoiceNumber.slice(-3));
          sequence = String(lastSequence + 1).padStart(3, '0');
        }

        invoice.invoiceNumber = 'INV-' + year + month + sequence;
      }
    }
  }
});

// Define associations
Invoice.associate = (models) => {
  Invoice.belongsTo(models.Sale, {
    foreignKey: 'saleId',
    as: 'sale'
  });
  
  Invoice.belongsTo(models.Customer, {
    foreignKey: 'customerId',
    as: 'customer'
  });
  
  Invoice.belongsTo(models.User, {
    foreignKey: 'issuerId',
    as: 'issuer'
  });
  
  Invoice.belongsTo(models.Shop, {
    foreignKey: 'shopId',
    as: 'shop'
  });
};

module.exports = Invoice;