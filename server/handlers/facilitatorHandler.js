import { randomBytes } from 'crypto';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const validTokens = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [t, createdAt] of validTokens) {
    if (now - createdAt > TOKEN_TTL_MS) {
      validTokens.delete(t);
    }
  }
}, 60 * 60 * 1000).unref();

export function validateFacilitatorPassword(password) {
  const configured = process.env.FACILITATOR_PASSWORD;
  if (!configured) {
    return { error: 'Facilitator login not configured' };
  }
  if (password !== configured) {
    return { error: 'Invalid password' };
  }
  const token = randomBytes(32).toString('hex');
  validTokens.set(token, Date.now());
  return { token };
}

export function verifyFacilitatorToken(token) {
  if (!token) return false;
  const createdAt = validTokens.get(token);
  if (createdAt === undefined) return false;
  if (Date.now() - createdAt > TOKEN_TTL_MS) {
    validTokens.delete(token);
    return false;
  }
  return true;
}
