import 'dotenv/config';
import app from './src/app.js';
import db from './src/db/index.js';

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

let isShuttingDown = false;

const shutdown = (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully`);

  server.close((serverError) => {
    if (serverError) {
      console.error('Failed to close the HTTP server:', serverError);
      process.exitCode = 1;
    }

    try {
      db.close();
      console.log('Database connection closed');
    } catch (databaseError) {
      console.error('Failed to close the database:', databaseError);
      process.exitCode = 1;
    }
  });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
