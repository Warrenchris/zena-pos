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

// Export models and sequelize instance
module.exports = {
  sequelize,
  User,
  Category,
  Product,
  Customer,
  Sale,
  SaleItem,
  Expense
  , Shop
};
