import ApiError from '../utils/api-error.js';

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

export function requireTrustedOrigin(req, _res, next) {
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    return next(new ApiError(403, 'Untrusted request origin', [], 'UNTRUSTED_ORIGIN'));
  }
  return next();
}

export { allowedOrigins };
