import ApiError from '../utils/api-error.js';
import { verifyAccessToken } from '../utils/jwt.js';

export function authenticate(req, _res, next) {
  const authorization = req.get('authorization');
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Authentication required', [], 'AUTHENTICATION_REQUIRED'));
  }

  try {
    const payload = verifyAccessToken(token);
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') {
      throw new Error('Invalid token subject');
    }
    req.auth = { userId: payload.sub };
    return next();
  } catch {
    return next(new ApiError(401, 'Invalid or expired access token', [], 'INVALID_ACCESS_TOKEN'));
  }
}
