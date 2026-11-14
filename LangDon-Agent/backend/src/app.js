import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import db from './db/index.js';
import authRoutes from './routes/auth.routes.js';
import convoRoutes from './routes/convo.routes.js';
import messageRoutes from './routes/messages.routes.js'
import ApiError from './utils/api-error.js';
import logger from './utils/logger.js';

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('HTTP request completed', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
});

app.get('/health', (_req, res) => {
  const result = db.prepare('SELECT 1 AS ok').get();
  res.json({
    status: 'ok',
    database: result.ok === 1 ? 'ok' : 'error',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/conversations', convoRoutes);
app.unsubscribe('/api',messageRoutes);

app.use((error, _req, res, _next) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json(error.toJSON());
  }

  logger.error('Unhandled request error', { error });
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
});

export default app;