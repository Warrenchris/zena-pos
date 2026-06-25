const sequelize = require('../config/database');

// Import models
const User = require('./User');
const Category = require('./Category');
const Product = require('./Product');
const Customer = require('./Customer');
const Sale = require('./Sale');
const SaleItem = require('./SaleItem');
const Expense = require('./Expense');
const Shop = require('./Shop');
const Store = require('./Store');
const ActivityLog = require('./ActivityLog');
const Employee = require('./Employee');
const SystemSettings = require('./SystemSettings');
const Invoice = require('./Invoice');
const InvoiceItem = require('./InvoiceItem');
const PendingPayment = require('./PendingPayment');
const SaleRefund = require('./SaleRefund');
const HeldCart = require('./HeldCart');
const SalePayment = require('./SalePayment');

// Define model associations
Product.belongsTo(Category, { foreignKey: 'categoryId' });
Category.hasMany(Product, { foreignKey: 'categoryId' });

Sale.belongsTo(User, { foreignKey: 'userId' });
Sale.belongsTo(Customer, { foreignKey: 'customerId' });
Sale.belongsTo(Employee, { foreignKey: 'employeeId' });
User.hasMany(Sale, { foreignKey: 'userId' });
Customer.hasMany(Sale, { foreignKey: 'customerId' });
Employee.hasMany(Sale, { foreignKey: 'employeeId' });

SaleItem.belongsTo(Sale, { foreignKey: 'saleId' });
SaleItem.belongsTo(Product, { foreignKey: 'productId' });
Sale.hasMany(SaleItem, { foreignKey: 'saleId' });
Product.hasMany(SaleItem, { foreignKey: 'productId' });

Expense.belongsTo(User, { as: 'recordedBy', foreignKey: 'userId' });

// Shop associations: each user belongs to a shop; shop has many users
const UserModel = User; // keep naming explicit
UserModel.belongsTo(Shop, { foreignKey: 'shopId' });
Shop.hasMany(UserModel, { foreignKey: 'shopId' });

// Multi-tenant associations - all entities belong to a shop
Product.belongsTo(Shop, { foreignKey: 'shopId' });
Category.belongsTo(Shop, { foreignKey: 'shopId' });
Customer.belongsTo(Shop, { foreignKey: 'shopId' });
Sale.belongsTo(Shop, { foreignKey: 'shopId' });
Expense.belongsTo(Shop, { foreignKey: 'shopId' });
ActivityLog.belongsTo(Shop, { foreignKey: 'shopId' });
Employee.belongsTo(Shop, { foreignKey: 'shopId' });
PendingPayment.belongsTo(Shop, { foreignKey: 'shopId' });

// Shop has many of each entity
Shop.hasMany(Product, { foreignKey: 'shopId' });
Shop.hasMany(Category, { foreignKey: 'shopId' });
Shop.hasMany(Customer, { foreignKey: 'shopId' });
Shop.hasMany(Sale, { foreignKey: 'shopId' });
Shop.hasMany(Expense, { foreignKey: 'shopId' });
Shop.hasMany(ActivityLog, { foreignKey: 'shopId' });
Shop.hasMany(Employee, { foreignKey: 'shopId' });
Shop.hasMany(PendingPayment, { foreignKey: 'shopId' });
Shop.hasOne(SystemSettings, { foreignKey: 'shopId' });
SystemSettings.belongsTo(Shop, { foreignKey: 'shopId' });

// SaleRefund associations
SaleRefund.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
SaleRefund.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
SaleRefund.belongsTo(Shop, { foreignKey: 'shopId' });
Sale.hasMany(SaleRefund, { foreignKey: 'saleId', as: 'refunds' });
Shop.hasMany(SaleRefund, { foreignKey: 'shopId' });

// HeldCart associations
HeldCart.belongsTo(Shop, { foreignKey: 'shopId' });
Shop.hasMany(HeldCart, { foreignKey: 'shopId' });

// ActivityLog employee associations
ActivityLog.belongsTo(Employee, { foreignKey: 'performedByEmployee', as: 'employee' });
Employee.hasMany(ActivityLog, { foreignKey: 'performedByEmployee', as: 'activityLogs' });

// SalePayment associations
SalePayment.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
SalePayment.belongsTo(Shop, { foreignKey: 'shopId' });
SalePayment.belongsTo(Employee, { foreignKey: 'processedBy', as: 'employee' });
Sale.hasMany(SalePayment, { foreignKey: 'saleId', as: 'payments' });
Shop.hasMany(SalePayment, { foreignKey: 'shopId' });
Employee.hasMany(SalePayment, { foreignKey: 'processedBy', as: 'payments' });

// Invoice associations
Invoice.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Invoice.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Invoice.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
Sale.hasMany(Invoice, { foreignKey: 'saleId', as: 'invoices' });
Invoice.hasMany(InvoiceItem, { foreignKey: 'invoiceId', as: 'items' });
InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });
InvoiceItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Export models and sequelize instance
module.exports = {
  sequelize,
  User,
  Category,
  Product,
  Customer,
  Sale,
  SaleItem,
  Expense,
  Shop,
  Store,
  ActivityLog,
  Employee,
  SystemSettings,
  Invoice,
  InvoiceItem,
  PendingPayment,
  SaleRefund,
  HeldCart,
  SalePayment
};
