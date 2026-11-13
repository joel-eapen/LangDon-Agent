const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const positiveInteger = (name, value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

export const authConfig = Object.freeze({
  accessSecret: required('JWT_ACCESS_SECRET'),
  accessExpiresIn: required('JWT_ACCESS_EXPIRES_IN'),
  issuer: required('JWT_ISSUER'),
  audience: required('JWT_AUDIENCE'),
  refreshExpiresDays: positiveInteger(
    'REFRESH_TOKEN_EXPIRES_DAYS',
    required('REFRESH_TOKEN_EXPIRES_DAYS'),
  ),
  cookieName: 'minimi_refresh_token',
});
