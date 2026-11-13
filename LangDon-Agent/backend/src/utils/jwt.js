import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { authConfig } from '../config/auth.js';

export function signAccessToken(userId) {
  return jwt.sign({}, authConfig.accessSecret, {
    subject: userId,
    expiresIn: authConfig.accessExpiresIn,
    issuer: authConfig.issuer,
    audience: authConfig.audience,
    jwtid: randomUUID(),
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, authConfig.accessSecret, {
    issuer: authConfig.issuer,
    audience: authConfig.audience,
  });
}
