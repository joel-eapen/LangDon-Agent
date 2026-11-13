## Authentication

Authentication uses short-lived JWT access tokens and server-side refresh
sessions backed by SQLite. Passwords are hashed with Argon2id, and refresh
tokens are stored only as SHA-256 hashes.

Configure these values in `.env`:

```env
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_ISSUER=minimi-agent
JWT_AUDIENCE=minimi-client
REFRESH_TOKEN_EXPIRES_DAYS=30
ALLOWED_ORIGINS=http://localhost:3000
```

Authentication endpoints are mounted under `/api/auth`:

- `POST /register` creates a user and returns an access token.
- `POST /login` authenticates a user and returns an access token.
- `POST /refresh` rotates the HTTP-only refresh cookie and returns a new access token.
- `POST /logout` revokes the current refresh-token session.
- `POST /logout-all` revokes all sessions for the authenticated user.
- `GET /me` returns the authenticated user's safe profile.

Send access tokens with `Authorization: Bearer <token>`. Refresh tokens use
an HTTP-only, SameSite cookie scoped to `/api/auth`; production deployments
also set the Secure flag. Refresh-token rotation detects reuse and revokes
the affected session.