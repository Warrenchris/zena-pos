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
const Coupon = require('./Coupon');
const DiscountRule = require('./DiscountRule');
const Purchase = require('./Purchase');
const PurchaseOrder = require('./PurchaseOrder');
const Supplier = require('./Supplier');
const StockMovement = require('./StockMovement');
const PurchaseItem = require('./PurchaseItem');
const PurchaseOrderItem = require('./PurchaseOrderItem');
const Permission = require('./Permission');
const RolePermission = require('./RolePermission');
const Organization = require('./Organization');
const OrganizationMembership = require('./OrganizationMembership');
const ShopAccess = require('./ShopAccess');
const Inventory = require('./Inventory');

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
Purchase.belongsTo(Shop, { foreignKey: 'shopId' });
PurchaseOrder.belongsTo(Shop, { foreignKey: 'shopId' });

// Shop has many of each entity
Shop.hasMany(Product, { foreignKey: 'shopId' });
Shop.hasMany(Category, { foreignKey: 'shopId' });
Shop.hasMany(Customer, { foreignKey: 'shopId' });
Shop.hasMany(Sale, { foreignKey: 'shopId' });
Shop.hasMany(Expense, { foreignKey: 'shopId' });
Shop.hasMany(ActivityLog, { foreignKey: 'shopId' });
Shop.hasMany(Employee, { foreignKey: 'shopId' });
Shop.hasMany(PendingPayment, { foreignKey: 'shopId' });
Shop.hasMany(Purchase, { foreignKey: 'shopId' });
Shop.hasMany(PurchaseOrder, { foreignKey: 'shopId' });
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

// Supplier associations
Supplier.belongsTo(Shop, { foreignKey: 'shopId' });
Shop.hasMany(Supplier, { foreignKey: 'shopId' });
Purchase.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });
Supplier.hasMany(Purchase, { foreignKey: 'supplierId', as: 'purchases' });
PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });
Supplier.hasMany(PurchaseOrder, { foreignKey: 'supplierId', as: 'purchaseOrders' });

// StockMovement associations
StockMovement.belongsTo(Shop, { foreignKey: 'shopId' });
StockMovement.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
StockMovement.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Product.hasMany(StockMovement, { foreignKey: 'productId', as: 'stockMovements' });
Shop.hasMany(StockMovement, { foreignKey: 'shopId' });

// PurchaseItems associations
Purchase.hasMany(PurchaseItem, { foreignKey: 'purchaseId', as: 'lineItems' });
PurchaseItem.belongsTo(Purchase, { foreignKey: 'purchaseId' });
PurchaseItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
PurchaseItem.belongsTo(Shop, { foreignKey: 'shopId' });

// PurchaseOrderItems associations
PurchaseOrder.hasMany(PurchaseOrderItem, { foreignKey: 'purchaseOrderId', as: 'lineItems' });
PurchaseOrderItem.belongsTo(PurchaseOrder, { foreignKey: 'purchaseOrderId' });
PurchaseOrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
PurchaseOrderItem.belongsTo(Shop, { foreignKey: 'shopId' });

// Organization & Membership associations (FINDING-12 Phase 1 & Phase 2)
Organization.hasMany(Shop, { foreignKey: 'organizationId' });
Shop.belongsTo(Organization, { foreignKey: 'organizationId' });

Organization.hasMany(Customer, { foreignKey: 'organizationId' });
Customer.belongsTo(Organization, { foreignKey: 'organizationId' });

Organization.hasMany(Supplier, { foreignKey: 'organizationId' });
Supplier.belongsTo(Organization, { foreignKey: 'organizationId' });

Organization.hasMany(OrganizationMembership, { foreignKey: 'organizationId' });
OrganizationMembership.belongsTo(Organization, { foreignKey: 'organizationId' });

OrganizationMembership.belongsTo(User, { foreignKey: 'userId' });
OrganizationMembership.belongsTo(Employee, { foreignKey: 'employeeId' });
User.hasMany(OrganizationMembership, { foreignKey: 'userId' });
Employee.hasMany(OrganizationMembership, { foreignKey: 'employeeId' });

OrganizationMembership.hasMany(ShopAccess, { foreignKey: 'membershipId' });
ShopAccess.belongsTo(OrganizationMembership, { foreignKey: 'membershipId' });

Shop.hasMany(ShopAccess, { foreignKey: 'shopId' });
ShopAccess.belongsTo(Shop, { foreignKey: 'shopId' });

// Organization & Catalog / Inventory associations (FINDING-12 Phase 3)
Organization.hasMany(Product, { foreignKey: 'organizationId' });
Product.belongsTo(Organization, { foreignKey: 'organizationId' });

Shop.hasMany(Inventory, { foreignKey: 'shopId' });
Inventory.belongsTo(Shop, { foreignKey: 'shopId' });

Product.hasMany(Inventory, { foreignKey: 'productId' });
Inventory.belongsTo(Product, { foreignKey: 'productId' });

// Auto-wrap guard: ensure every Shop has a parent Organization if none specified (backward compatibility)
Shop.beforeValidate(async (shop, options) => {
  if (!shop.organizationId) {
    const orgName = shop.name || 'Default Organization';
    const cleanName = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'org';
    const slug = `${cleanName}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const [org] = await Organization.findOrCreate({
      where: { name: orgName },
      defaults: {
        name: orgName,
        slug,
        status: 'active',
        currency: 'KES'
      },
      transaction: options?.transaction
    });
    shop.organizationId = org.id;
  }
});

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
  SalePayment,
  Coupon,
  DiscountRule,
  Purchase,
  PurchaseOrder,
  Supplier,
  StockMovement,
  PurchaseItem,
  PurchaseOrderItem,
  Permission,
  RolePermission,
  Organization,
  OrganizationMembership,
  ShopAccess,
  Inventory
};

