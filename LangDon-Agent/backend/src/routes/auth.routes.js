import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getCurrentUser,
  loginUser,
  logoutAllUsers,
  logoutUser,
  refreshAccessToken,
  registerUser,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTrustedOrigin } from '../middleware/origin.js';

const router = Router();
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts' },
  },
});

router.post('/register', authRateLimiter, registerUser);
router.post('/login', authRateLimiter, loginUser);
router.post('/refresh', requireTrustedOrigin, refreshAccessToken);
router.post('/logout', requireTrustedOrigin, logoutUser);
router.get('/me', authenticate, getCurrentUser);
router.post('/logout-all', requireTrustedOrigin, authenticate, logoutAllUsers);

export default router;
