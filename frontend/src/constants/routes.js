// Centralized list of app routes used for validation and tests
export const validRoutes = [
  // Core
  '/dashboard',
  '/products',
  '/products/view',
  '/categories',
  '/customers',
  '/employees',
  '/my-sales',
  '/sales',
  '/expenses',
  '/reports',
  '/settings',

  // Admin
  '/admin/users',
  '/admin/employees',
  '/admin/company',
  '/admin/ai',

  // AI & Analytics
  '/ai/forecasting',
  '/ai/insights',
  '/ai/finance',

  // Inventory
  '/products/create',
  '/products/expired',
  '/products/low-stock',
  '/categories/sub',
  '/brands',
  '/units',
  '/variants',
  '/warranties',
  '/print/barcode',
  '/print/qr',

  // Stock
  '/stock/manage',
  '/stock/adjustment',
  '/stock/transfer',

  // Sales subroutes
  '/invoices',
  '/sales/returns',
  '/quotations',
  '/pos',

  // Promo
  '/coupons',
  '/gift-cards',
  '/discounts',

  // Purchases
  '/purchases',
  '/purchase-orders',
  '/purchase-returns'
];

export default validRoutes;


