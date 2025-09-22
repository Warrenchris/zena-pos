const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./utils/logger');
require('dotenv').config();

const { testConnection } = require('./config/database');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const saleRoutes = require('./routes/sales');
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

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
// HTTP request logs
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
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
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled application error', err);
  res.status(500).json({ error: 'Something broke!' });
});

module.exports = app;
