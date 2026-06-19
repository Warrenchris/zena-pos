const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { validateStartup } = require('./utils/startupValidation');
const logger = require('./utils/logger');

try {
  validateStartup();
} catch (error) {
  logger.error('[startup] Pre-flight validation failed:', error.message);
  process.exit(1);
}

const { testConnection } = require('./config/database');
const app = require('./app');

const PORT = process.env.PORT || 3000;

const seedDatabase = require('./seeders/seed');

const startServer = async () => {
  try {
    logger.info('[startup] Database configuration', {
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3306,
      database: process.env.DB_NAME,
    });

    // Test database connection and sync models
    await testConnection();
    logger.info('Database connection successful');

    // Seed database in development mode
    if (process.env.NODE_ENV === 'development') {
      try {
        await seedDatabase();
        logger.info('Database seeded successfully');
      } catch (error) {
        logger.error('Error seeding database:', error);
      }
    }

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
    });

    // Handle graceful shutdown
    const shutdown = (signal) => {
      logger.warn(`Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Force exiting after timeout');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    logger.error('Unable to start server:', error);
    process.exit(1);
  }
};

// Catch unhandled errors
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', err);
});

startServer();
