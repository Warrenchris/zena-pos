const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Ensure JWT keys are loaded from environment variables
if (!process.env.JWT_PRIVATE_KEY || !process.env.JWT_PUBLIC_KEY) {
  throw new Error('FATAL ERROR: JWT_PRIVATE_KEY and JWT_PUBLIC_KEY environment variables must be defined.');
}

// Ensure AI_SERVICE_BASE_URL is defined and is a valid URL
const aiServiceBaseUrl = process.env.AI_SERVICE_BASE_URL;
if (!aiServiceBaseUrl) {
  throw new Error('FATAL ERROR: AI_SERVICE_BASE_URL environment variable must be defined and non-empty.');
}
try {
  new URL(aiServiceBaseUrl);
} catch (err) {
  throw new Error(`FATAL ERROR: AI_SERVICE_BASE_URL "${aiServiceBaseUrl}" is not a valid URL: ${err.message}`);
}

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const { testConnection } = require('./config/database');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const saleRoutes = require('./routes/sales');
const splitSaleRoutes = require('./routes/splitSales');
const customerRoutes = require('./routes/customers');
const expenseRoutes = require('./routes/expenses');
const userRoutes = require('./routes/users');
const shopRoutes = require('./routes/shop');
const employeeRoutes = require('./routes/employees');
const insightsRoutes = require('./routes/insights');
const reportsRoutes = require('./routes/reports');
const activityRoutes = require('./routes/activity');
const dashboardRoutes = require('./routes/dashboard');
const analyticsRoutes = require('./routes/analytics');
const brandRoutes = require('./routes/brandRoutes');
const unitRoutes = require('./routes/unitRoutes');
const aiProxyRoutes = require('./routes/aiProxy');
const systemHealthRoutes = require('./routes/systemHealth');
const storeRoutes = require('./routes/storeRoutes');
const settingsRoutes = require('./routes/settings');
const invoiceRoutes = require('./routes/invoiceRoutes');
const mpesaRoutes = require('./routes/mpesaRoutes');
const cardRoutes = require('./routes/cardRoutes');
const heldCartRoutes = require('./routes/heldCartRoutes');
const couponRoutes = require('./routes/coupons');
const discountRoutes = require('./routes/discounts');
const purchaseRoutes = require('./routes/purchases');
const purchaseOrderRoutes = require('./routes/purchaseOrders');
const permissionRoutes = require('./routes/permissions');

const app = express();
app.set('trust proxy', 1);

// Import request logger middleware
const requestLogger = require('./middleware/requestLogger');

// Middleware
app.use(helmet());
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [process.env.FRONTEND_URL || 'http://localhost:5173'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

// HTTP request logs
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Serve static uploads
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
// Root healthcheck route for load balancers / Render
app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Zana Backend API is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/sales/split', splitSaleRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiProxyRoutes);
app.use('/api/system/health', systemHealthRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/card', cardRoutes);
app.use('/api/held-carts', heldCartRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/permissions', permissionRoutes);

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = app;
