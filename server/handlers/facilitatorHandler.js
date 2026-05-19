import { randomBytes } from 'crypto';

const validTokens = new Set();

export function validateFacilitatorPassword(password) {
  const configured = process.env.FACILITATOR_PASSWORD;
  if (!configured) {
    return { error: 'Facilitator login not configured' };
  }
  if (password !== configured) {
    return { error: 'Invalid password' };
  }
  const token = randomBytes(32).toString('hex');
  validTokens.add(token);
  return { token };
}

export function verifyFacilitatorToken(token) {
  if (!token) return false;
  return validTokens.has(token);
}
