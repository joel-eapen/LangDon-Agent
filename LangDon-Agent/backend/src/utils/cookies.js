import { authConfig } from '../config/auth.js';

const isProduction = process.env.NODE_ENV === 'production';

export const refreshCookieOptions = Object.freeze({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/api/auth',
});

export function setRefreshCookie(response, token) {
  response.cookie(authConfig.cookieName, token, {
    ...refreshCookieOptions,
    maxAge: authConfig.refreshExpiresDays * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(response) {
  response.clearCookie(authConfig.cookieName, refreshCookieOptions);
}
