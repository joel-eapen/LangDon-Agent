import { ZodError } from 'zod';
import ApiError from '../utils/api-error.js';
import ApiResponse from '../utils/api-response.js';
import asyncHandler from '../utils/async-handler.js';
import { authConfig } from '../config/auth.js';
import { clearRefreshCookie, setRefreshCookie } from '../utils/cookies.js';
import {
  login,
  logout,
  logoutAll,
  refresh,
  register,
  safeUser,
} from '../services/auth.service.js';
import { findUserWithPasswordById } from '../db/auth-repositories.js';
import { loginSchema, registerSchema } from '../validators/auth.validator.js';

const parse = (schema, body) => {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(400, 'Invalid request', error.issues, 'INVALID_REQUEST');
    }
    throw error;
  }
};

export const registerUser = asyncHandler(async (req, res) => {
  const input = parse(registerSchema, req.body);
  try {
    const result = await register(input);
    setRefreshCookie(res, result.refreshToken);
    return res.status(201).json(new ApiResponse(201, {
      user: result.user,
      accessToken: result.accessToken,
    }));
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ApiError(409, 'Email is already registered', [], 'EMAIL_ALREADY_REGISTERED');
    }
    throw error;
  }
});

export const loginUser = asyncHandler(async (req, res) => {
  const input = parse(loginSchema, req.body);
  const result = await login(input);
  if (!result) {
    throw new ApiError(401, 'Invalid email or password', [], 'INVALID_CREDENTIALS');
  }
  setRefreshCookie(res, result.refreshToken);
  return res.json(new ApiResponse(200, {
    user: result.user,
    accessToken: result.accessToken,
  }));
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.[authConfig.cookieName];
  if (!token) {
    throw new ApiError(401, 'Refresh token is required', [], 'REFRESH_TOKEN_REQUIRED');
  }
  const result = await refresh(token);
  if (!result) {
    clearRefreshCookie(res);
    throw new ApiError(401, 'Invalid or expired refresh token', [], 'INVALID_REFRESH_TOKEN');
  }
  setRefreshCookie(res, result.refreshToken);
  return res.json(new ApiResponse(200, {
    user: result.user,
    accessToken: result.accessToken,
  }));
});

export const logoutUser = asyncHandler(async (req, res) => {
  logout(req.cookies?.[authConfig.cookieName]);
  clearRefreshCookie(res);
  return res.json(new ApiResponse(200, null, 'Logged out'));
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = findUserWithPasswordById(req.auth.userId);
  if (!user) {
    throw new ApiError(401, 'User no longer exists', [], 'INVALID_AUTHENTICATION');
  }
  return res.json(new ApiResponse(200, { user: safeUser(user) }));
});

export const logoutAllUsers = asyncHandler(async (req, res) => {
  logoutAll(req.auth.userId);
  clearRefreshCookie(res);
  return res.json(new ApiResponse(200, null, 'Logged out of all sessions'));
});
