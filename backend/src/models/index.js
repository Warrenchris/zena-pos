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
const ActivityLog = require('./ActivityLog');

// Define model associations
Product.belongsTo(Category);
Category.hasMany(Product);

Sale.belongsTo(User);
Sale.belongsTo(Customer);
User.hasMany(Sale);
Customer.hasMany(Sale);

SaleItem.belongsTo(Sale);
SaleItem.belongsTo(Product);
Sale.hasMany(SaleItem);
Product.hasMany(SaleItem);

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

// Shop has many of each entity
Shop.hasMany(Product, { foreignKey: 'shopId' });
Shop.hasMany(Category, { foreignKey: 'shopId' });
Shop.hasMany(Customer, { foreignKey: 'shopId' });
Shop.hasMany(Sale, { foreignKey: 'shopId' });
Shop.hasMany(Expense, { foreignKey: 'shopId' });
Shop.hasMany(ActivityLog, { foreignKey: 'shopId' });

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
  ActivityLog
};
