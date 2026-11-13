import 'dotenv/config';
import app from './src/app.js';
import db from './src/db/index.js';
import logger from './src/utils/logger.js';

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  logger.info('Server listening', { port });
});

let isShuttingDown = false;

const shutdown = (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info('Graceful shutdown started', { signal });

  server.close((serverError) => {
    if (serverError) {
      logger.error('Failed to close the HTTP server', { error: serverError });
      process.exitCode = 1;
    }

    try {
      db.close();
      logger.info('Database connection closed');
    } catch (databaseError) {
      logger.error('Failed to close the database', { error: databaseError });
      process.exitCode = 1;
    }
  });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
