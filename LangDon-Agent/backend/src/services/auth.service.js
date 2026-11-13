import { createHash, randomBytes } from 'node:crypto';
import {
  createSession,
  createUserWithSession,
  findSessionByRefreshTokenHash,
  findUserByEmail,
  findUserWithPasswordById,
  revokeAllSessions,
  revokeSession,
  revokeSessionForRefreshTokenReuse,
  rotateSession,
} from '../db/auth-repositories.js';
import { authConfig } from '../config/auth.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken } from '../utils/jwt.js';

const refreshExpiry = () => {
  const date = new Date();
  date.setDate(date.getDate() + authConfig.refreshExpiresDays);
  return date.toISOString();
};

const createRefreshToken = () => randomBytes(48).toString('base64url');
const hashRefreshToken = (token) => createHash('sha256').update(token).digest('hex');

export const safeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  timezone: user.timezone,
  createdAt: user.created_at,
  updatedAt: user.updated_at,
});

export async function register({ name, email, password, timezone }) {
  const passwordHash = await hashPassword(password);
  const refreshToken = createRefreshToken();
  const { user } = createUserWithSession({
    name,
    email,
    passwordHash,
    timezone,
    refreshTokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshExpiry(),
  });

  return {
    user: safeUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken,
  };
}

export async function login({ email, password }) {
  const user = findUserByEmail(email);
  let validPassword = false;
  if (user?.password_hash) {
    try {
      validPassword = await verifyPassword(user.password_hash, password);
    } catch {
      validPassword = false;
    }
  }
  if (!user || !validPassword) {
    return undefined;
  }

  const refreshToken = createRefreshToken();
  createSession({
    userId: user.id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshExpiry(),
  });

  return {
    user: safeUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken,
  };
}

export async function refresh(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  const session = findSessionByRefreshTokenHash(tokenHash);
  if (!session) {
    return undefined;
  }

  if (session.previous_refresh_token_hash === tokenHash) {
    revokeSessionForRefreshTokenReuse(session.id);
    return undefined;
  }

  if (session.revoked_at || new Date(session.expires_at) <= new Date()) {
    revokeSession(session.id);
    return undefined;
  }

  const user = findUserWithPasswordById(session.user_id);
  if (!user) {
    revokeSession(session.id);
    return undefined;
  }

  const nextRefreshToken = createRefreshToken();
  rotateSession(session.id, {
    refreshTokenHash: hashRefreshToken(nextRefreshToken),
    previousTokenHash: tokenHash,
    expiresAt: refreshExpiry(),
  });

  return {
    user: safeUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken: nextRefreshToken,
  };
}

export function logout(refreshToken) {
  if (!refreshToken) {
    return;
  }
  const session = findSessionByRefreshTokenHash(hashRefreshToken(refreshToken));
  if (session) {
    revokeSession(session.id);
  }
}

export function logoutAll(userId) {
  revokeAllSessions(userId);
}
