const { testConnection } = require('./config/database');
const app = require('./app');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

const seedDatabase = require('./seeders/seed');

const startServer = async () => {
  try {
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
