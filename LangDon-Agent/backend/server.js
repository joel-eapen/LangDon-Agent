import 'dotenv/config';
import express from 'express';
import db from './src/db/index.js';

const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (_req, res) => {
  const result = db.prepare('SELECT 1 AS ok').get();

  res.json({
    status: 'ok',
    database: result.ok === 1 ? 'ok' : 'error',
  });
});

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
