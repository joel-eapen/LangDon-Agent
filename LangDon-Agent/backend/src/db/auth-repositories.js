import { randomUUID } from 'node:crypto';
import db from './index.js';
import { nowUtc } from '../utils/clock.js';

export function findUserByEmail(email) {
  return db.prepare(`
    SELECT * FROM users WHERE email = ?
  `).get(email);
}

export function findUserWithPasswordById(id) {
  return db.prepare(`
    SELECT * FROM users WHERE id = ?
  `).get(id);
}

export function createUserWithSession({
  name,
  email,
  passwordHash,
  timezone,
  refreshTokenHash,
  expiresAt,
}) {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const timestamp = nowUtc();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO users (
        id, name, email, password_hash, timezone, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, name, email, passwordHash, timezone, timestamp, timestamp);

    db.prepare(`
      INSERT INTO sessions (
        id, user_id, refresh_token_hash, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, userId, refreshTokenHash, expiresAt, timestamp, timestamp);
  })();

  return {
    user: findUserWithPasswordById(userId),
    session: findSessionById(sessionId),
  };
}

export function createSession({ userId, refreshTokenHash, expiresAt }) {
  const sessionId = randomUUID();
  const timestamp = nowUtc();
  db.prepare(`
    INSERT INTO sessions (
      id, user_id, refresh_token_hash, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, userId, refreshTokenHash, expiresAt, timestamp, timestamp);
  return findSessionById(sessionId);
}

export function findSessionByRefreshTokenHash(tokenHash) {
  return db.prepare(`
    SELECT * FROM sessions
    WHERE refresh_token_hash = ? OR previous_refresh_token_hash = ?
  `).get(tokenHash, tokenHash);
}

export function findSessionById(id) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

export function rotateSession(id, { refreshTokenHash, expiresAt, previousTokenHash }) {
  const result = db.transaction(() => db.prepare(`
    UPDATE sessions
    SET refresh_token_hash = ?,
        previous_refresh_token_hash = ?,
        expires_at = ?,
        updated_at = ?,
        revoked_at = NULL
    WHERE id = ? AND revoked_at IS NULL
  `).run(refreshTokenHash, previousTokenHash, expiresAt, nowUtc(), id))();
  return result.changes ? findSessionById(id) : undefined;
}

export function revokeSession(id) {
  db.prepare(`
    UPDATE sessions SET revoked_at = ?, updated_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).run(nowUtc(), nowUtc(), id);
}

export function revokeAllSessions(userId) {
  return db.prepare(`
    UPDATE sessions SET revoked_at = ?, updated_at = ?
    WHERE user_id = ? AND revoked_at IS NULL
  `).run(nowUtc(), nowUtc(), userId).changes;
}

export function revokeSessionForRefreshTokenReuse(id) {
  revokeSession(id);
}
