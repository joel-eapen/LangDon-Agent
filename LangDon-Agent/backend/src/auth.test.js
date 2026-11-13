import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'langdon-auth-'));
process.env.DB_PATH = path.join(temporaryDirectory, 'auth.sqlite');
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-only-used-by-tests';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_ISSUER = 'minimi-agent';
process.env.JWT_AUDIENCE = 'minimi-client';
process.env.REFRESH_TOKEN_EXPIRES_DAYS = '30';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';

const { default: app } = await import('./app.js');
const { default: db } = await import('./db/index.js');
const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const request = (pathName, options = {}) => fetch(`${baseUrl}${pathName}`, options);
const json = (response) => response.json();
const cookieFrom = (response) => response.headers.get('set-cookie')?.split(';', 1)[0];

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('registers users, hashes passwords, and rejects duplicates', async () => {
  const response = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Example User',
      email: 'USER@Example.com',
      password: 'StrongPassword123',
      timezone: 'Asia/Kolkata',
    }),
  });
  const body = await json(response);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get('user@example.com');

  assert.equal(response.status, 201);
  assert.ok(body.data.accessToken);
  assert.ok(cookieFrom(response));
  assert.match(user.password_hash, /^\$argon2id\$/);

  const duplicate = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Another User',
      email: 'user@example.com',
      password: 'StrongPassword123',
      timezone: 'UTC',
    }),
  });
  assert.equal(duplicate.status, 409);
});

test('authenticates, refreshes with rotation, and rejects token reuse', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: ' USER@example.COM ',
      password: 'StrongPassword123',
    }),
  });
  const loginBody = await json(login);
  const oldCookie = cookieFrom(login);
  assert.equal(login.status, 200);

  const me = await request('/api/auth/me', {
    headers: { authorization: `Bearer ${loginBody.data.accessToken}` },
  });
  assert.equal(me.status, 200);

  const refresh = await request('/api/auth/refresh', {
    method: 'POST',
    headers: { cookie: oldCookie },
  });
  const refreshBody = await json(refresh);
  const newCookie = cookieFrom(refresh);
  assert.equal(refresh.status, 200);
  assert.ok(refreshBody.data.accessToken);
  assert.notEqual(newCookie, oldCookie);

  const reused = await request('/api/auth/refresh', {
    method: 'POST',
    headers: { cookie: oldCookie },
  });
  assert.equal(reused.status, 401);

  const rotatedAfterReuse = await request('/api/auth/refresh', {
    method: 'POST',
    headers: { cookie: newCookie },
  });
  assert.equal(rotatedAfterReuse.status, 401);
});

test('rejects invalid credentials and supports logout', async () => {
  const invalid = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'unknown@example.com',
      password: 'WrongPassword123',
    }),
  });
  assert.equal(invalid.status, 401);

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'StrongPassword123',
    }),
  });
  const cookie = cookieFrom(login);
  const logout = await request('/api/auth/logout', {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(logout.status, 200);

  const refreshAfterLogout = await request('/api/auth/refresh', {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(refreshAfterLogout.status, 401);
});

test('rejects protected requests without an access token', async () => {
  const response = await request('/api/auth/me');
  assert.equal(response.status, 401);
});
